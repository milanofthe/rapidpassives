/**
 * PEEC (Partial Element Equivalent Circuit) MQS solver.
 *
 * Uses Modified Nodal Analysis (MNA) to correctly solve for
 * multi-port impedance including mutual coupling between all segments.
 *
 * The system equation per frequency:
 *   Y_nodal · V = I_source
 * where Y_nodal = A · Z_branch^(-1) · A^T
 *   A = branch-node incidence matrix
 *   Z_branch = R·I + jω·L (dense, includes mutual coupling)
 */

import type { ConductorNetwork, ConductorSegment, ConductorNode } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { getStackLayer } from '$lib/stack/types';
import { selfInductance, mutualInductance, type Filament } from './inductance';
import { computeParasitics, applyPiModelSparams } from './parasitics';
import { type Cx, cxMatSolve, cxMatMul, cxAdd, zToS, extractPortResults, extractCoupling, type PortFreqResult } from './multiport';

const PI = Math.PI;
const MU0 = 4 * PI * 1e-7;

/** Winding-level result (primary/secondary) */
export interface WindingResult {
	name: string;
	L: number;  // differential inductance (H)
	R: number;  // differential resistance (Ω)
	Q: number;
}

/** Result for a single frequency point */
export interface FrequencyPoint {
	freq: number;
	Z: Cx[][];
	S: Cx[][];
	L: number;
	Q: number;
	R: number;
	ports: PortFreqResult[];
	windings: WindingResult[];  // primary/secondary level results
	k?: number;
}

/** Full simulation result */
export interface SimulationResult {
	freqs: FrequencyPoint[];
	filaments: Filament[];
	network: ConductorNetwork;
	logScale: boolean;
	portNames: string[];
	nPorts: number;
}

/** Simulation options */
export interface SimOptions {
	fMin: number;
	fMax: number;
	nPoints: number;
	z0?: number;
	logScale?: boolean;
	conductorSpacing?: number;
	hasPgs?: boolean;
}

/**
 * Run PEEC simulation using MNA formulation.
 */
export function solvePEEC(
	network: ConductorNetwork,
	stack: ProcessStack,
	options: SimOptions
): SimulationResult {
	const { fMin, fMax, nPoints, z0 = 50, logScale = true, conductorSpacing = 2, hasPgs = false } = options;

	const nodeMap = new Map<string, ConductorNode>();
	for (const n of network.nodes) nodeMap.set(n.id, n);

	// Convert segments to filaments
	const filaments = segmentsToFilaments(network.segments, nodeMap, stack);
	const nFil = filaments.length;

	if (nFil === 0) {
		return { freqs: [], filaments, network, logScale, portNames: [], nPorts: 0 };
	}

	// Map segments to filament indices (some segments may be filtered as zero-length)
	const segToFil = new Map<number, number>();
	{
		let fi = 0;
		for (let si = 0; si < network.segments.length; si++) {
			const from = nodeMap.get(network.segments[si].fromNode);
			const to = nodeMap.get(network.segments[si].toNode);
			if (!from || !to) continue;
			const dx = (to.x - from.x) * 1e-6, dy = (to.y - from.y) * 1e-6;
			if (Math.sqrt(dx * dx + dy * dy) > 1e-12) { segToFil.set(si, fi); fi++; }
		}
	}

	// Compute inductance matrix L[i][j]
	const L = new Array(nFil);
	for (let i = 0; i < nFil; i++) {
		L[i] = new Float64Array(nFil);
		for (let j = 0; j <= i; j++) {
			if (i === j) {
				L[i][j] = selfInductance(filaments[i].width, filaments[i].length, filaments[i].height);
			} else {
				const m = mutualInductance(filaments[i], filaments[j]);
				L[i][j] = m; L[j][i] = m;
			}
		}
	}

	// DC resistance per filament
	const Rdc = filaments.map((fil, idx) => {
		const seg = findSegForFilament(idx, segToFil, network.segments);
		const sl = seg ? getStackLayer(stack, seg.layerId) : null;
		return (sl?.rsh ?? 0.03) * fil.length / fil.width;
	});

	// --- Build node index map ---
	// Only include nodes that are actually used by segments or vias
	const usedNodes = new Set<string>();
	for (const seg of network.segments) {
		if (segToFil.has(network.segments.indexOf(seg))) {
			usedNodes.add(seg.fromNode);
			usedNodes.add(seg.toNode);
		}
	}
	for (const via of network.vias) {
		usedNodes.add(via.topNode);
		usedNodes.add(via.bottomNode);
	}
	// Also include port nodes
	for (const port of network.ports) {
		usedNodes.add(port.node);
	}

	const nodeIds = Array.from(usedNodes);
	const nodeIdx = new Map<string, number>();
	nodeIds.forEach((id, i) => nodeIdx.set(id, i));
	const nNodes = nodeIds.length;

	// --- Build incidence matrix A (nNodes × nBranches) ---
	// Branches = filaments + vias
	const nVias = network.vias.length;
	const nBranches = nFil + nVias;

	// A[node][branch] = +1 if branch leaves node, -1 if enters
	// Stored as dense for simplicity (small matrices)
	const A: number[][] = Array.from({ length: nNodes }, () => new Array(nBranches).fill(0));

	// Filament branches
	for (const [segIdx, filI] of segToFil) {
		const seg = network.segments[segIdx];
		const fromI = nodeIdx.get(seg.fromNode);
		const toI = nodeIdx.get(seg.toNode);
		if (fromI !== undefined) A[fromI][filI] = +1;
		if (toI !== undefined) A[toI][filI] = -1;
	}

	// Via branches (indices nFil..nFil+nVias-1)
	network.vias.forEach((via, vi) => {
		const topI = nodeIdx.get(via.topNode);
		const botI = nodeIdx.get(via.bottomNode);
		if (topI !== undefined) A[topI][nFil + vi] = +1;
		if (botI !== undefined) A[botI][nFil + vi] = -1;
	});

	// --- Ports (each is a single node referenced to ground) ---
	const uniquePorts = network.ports;
	const nPorts = uniquePorts.length;
	const portNames = uniquePorts.map(p => p.name);

	// Ground node: pick a node NOT used by any port
	// Use the first node that's connected but not a port node
	const portNodeIds = new Set(uniquePorts.map(p => p.node));
	let groundIdx: number | undefined;
	for (let i = 0; i < nNodes; i++) {
		if (!portNodeIds.has(nodeIds[i])) {
			groundIdx = i;
			break;
		}
	}

	// Parasitics
	const parasitics = computeParasitics(filaments, stack, conductorSpacing * 1e-6, hasPgs);

	// --- Frequency sweep ---
	const freqs: FrequencyPoint[] = [];

	for (let fi = 0; fi < nPoints; fi++) {
		let freq: number;
		if (logScale) {
			const logMin = Math.log10(Math.max(fMin, 1));
			const logMax = Math.log10(fMax);
			freq = Math.pow(10, logMin + fi * (logMax - logMin) / (nPoints - 1));
		} else {
			freq = fMin + fi * (fMax - fMin) / (nPoints - 1);
		}
		const omega = 2 * PI * freq;

		// Frequency-dependent resistance
		const Rf = Rdc.map((rdc, idx) => {
			const fil = filaments[idx];
			const seg = findSegForFilament(idx, segToFil, network.segments);
			const sl = seg ? getStackLayer(stack, seg.layerId) : null;
			const sigma = 1 / ((sl?.rsh ?? 0.03) * fil.height);
			const delta = Math.sqrt(2 / (omega * MU0 * sigma));
			if (delta >= fil.height / 2) return rdc;
			const effectiveArea = fil.width * fil.height -
				(fil.width - 2 * delta) * Math.max(0, fil.height - 2 * delta);
			return rdc * (fil.width * fil.height) / effectiveArea;
		});

		// Build Z_branch (nBranches × nBranches, complex)
		const Zb: Cx[][] = Array.from({ length: nBranches }, () =>
			Array.from({ length: nBranches }, () => [0, 0] as Cx)
		);

		// Filament block: Z[i][j] = R[i]·δ(i,j) + jω·L[i][j]
		for (let i = 0; i < nFil; i++) {
			for (let j = 0; j < nFil; j++) {
				Zb[i][j] = [i === j ? Rf[i] : 0, omega * L[i][j]];
			}
		}

		// Via block: diagonal, pure resistance
		for (let vi = 0; vi < nVias; vi++) {
			Zb[nFil + vi][nFil + vi] = [network.vias[vi].resistance, 0];
		}

		// Invert Z_branch to get Y_branch
		const Yb = cxMatSolve(Zb,
			Array.from({ length: nBranches }, (_, i) =>
				Array.from({ length: nBranches }, (_, j) => (i === j ? [1, 0] : [0, 0]) as Cx)
			)
		);

		if (!Yb) {
			// Singular — skip this frequency
			freqs.push({ freq, Z: [], S: [], L: 0, Q: 0, R: 0, ports: [], windings: [], k: undefined });
			continue;
		}

		// Y_nodal = A · Y_branch · A^T (all real A, complex Yb)
		// Step 1: T = Y_branch · A^T (nBranches × nNodes)
		const AT: Cx[][] = Array.from({ length: nBranches }, (_, b) =>
			Array.from({ length: nNodes }, (_, n) => [A[n][b], 0] as Cx)
		);
		const T = cxMatMul(Yb, AT);

		// Step 2: Y_nodal = A · T (nNodes × nNodes)
		const Acx: Cx[][] = A.map(row => row.map(v => [v, 0] as Cx));
		const Yn = cxMatMul(Acx, T);

		// Ground the reference node by removing its row/column
		// and solving the reduced system
		const reducedSize = groundIdx !== undefined ? nNodes - 1 : nNodes;
		const origToReduced = new Map<number, number>();
		let ri = 0;
		for (let i = 0; i < nNodes; i++) {
			if (i === groundIdx) continue;
			origToReduced.set(i, ri++);
		}

		// Build reduced Y_nodal
		const YnR: Cx[][] = Array.from({ length: reducedSize }, () =>
			Array.from({ length: reducedSize }, () => [0, 0] as Cx)
		);
		for (let i = 0; i < nNodes; i++) {
			const ri = origToReduced.get(i);
			if (ri === undefined) continue;
			for (let j = 0; j < nNodes; j++) {
				const rj = origToReduced.get(j);
				if (rj === undefined) continue;
				YnR[ri][rj] = Yn[i][j];
			}
		}

		// For each port, build RHS and solve
		const Zmp: Cx[][] = Array.from({ length: nPorts }, () =>
			Array.from({ length: nPorts }, () => [0, 0] as Cx)
		);

		// Build all RHS columns at once
		const RHS: Cx[][] = Array.from({ length: reducedSize }, () =>
			Array.from({ length: nPorts }, () => [0, 0] as Cx)
		);

		for (let pi = 0; pi < nPorts; pi++) {
			const port = uniquePorts[pi];
			const portI = nodeIdx.get(port.node);
			if (portI !== undefined) {
				const r = origToReduced.get(portI);
				if (r !== undefined) RHS[r][pi] = [1, 0];
			}
		}

		// Solve Y_nodal · V = RHS for all ports at once
		const V = cxMatSolve(YnR, RHS);
		if (!V) {
			freqs.push({ freq, Z: [], S: [], L: 0, Q: 0, R: 0, ports: [], windings: [], k: undefined });
			continue;
		}

		// Extract Z-matrix: Z[i][j] = V_port_i when port j is excited
		// Z[i][j] = voltage at port i node when unit current injected at port j
		for (let pi = 0; pi < nPorts; pi++) {
			const portNodeI = nodeIdx.get(uniquePorts[pi].node);
			const portR = portNodeI !== undefined ? origToReduced.get(portNodeI) : undefined;
			for (let pj = 0; pj < nPorts; pj++) {
				Zmp[pi][pj] = portR !== undefined ? V[portR][pj] : [0, 0];
			}
		}

		// Convert Z to S
		const S = zToS(Zmp, z0);

		// Primary port L/Q/R (with pi-model parasitics on port 0)
		const Z00re = Zmp[0]?.[0]?.[0] ?? 0;
		const Z00im = Zmp[0]?.[0]?.[1] ?? 0;
		const sp = applyPiModelSparams(Z00re, Z00im, omega, parasitics, z0);
		const Leff = omega > 0 ? sp.Zeff[1] / omega : 0;
		const Q = sp.Zeff[0] > 0 ? sp.Zeff[1] / sp.Zeff[0] : 0;

		const portResults = extractPortResults(Zmp, omega, portNames);

		// Compute winding-level results (differential impedance between port pairs)
		const windings: WindingResult[] = [];
		if (nPorts === 2) {
			// 2-port inductor: Z_diff = Z11 - Z12 - Z21 + Z22
			const zdr = Zmp[0][0][0] - Zmp[0][1][0] - Zmp[1][0][0] + Zmp[1][1][0];
			const zdi = Zmp[0][0][1] - Zmp[0][1][1] - Zmp[1][0][1] + Zmp[1][1][1];
			const wL = omega > 0 ? zdi / omega : 0;
			windings.push({ name: 'L', L: wL, R: zdr, Q: zdr > 0 ? zdi / zdr : 0 });
		} else if (nPorts >= 4) {
			// 4-port transformer: primary = ports 0,1; secondary = ports 2,3
			const zd1r = Zmp[0][0][0] - Zmp[0][1][0] - Zmp[1][0][0] + Zmp[1][1][0];
			const zd1i = Zmp[0][0][1] - Zmp[0][1][1] - Zmp[1][0][1] + Zmp[1][1][1];
			const zd2r = Zmp[2][2][0] - Zmp[2][3][0] - Zmp[3][2][0] + Zmp[3][3][0];
			const zd2i = Zmp[2][2][1] - Zmp[2][3][1] - Zmp[3][2][1] + Zmp[3][3][1];
			const wL1 = omega > 0 ? zd1i / omega : 0;
			const wL2 = omega > 0 ? zd2i / omega : 0;
			windings.push({ name: 'Primary', L: wL1, R: zd1r, Q: zd1r > 0 ? zd1i / zd1r : 0 });
			windings.push({ name: 'Secondary', L: wL2, R: zd2r, Q: zd2r > 0 ? zd2i / zd2r : 0 });
		}

		// Coupling from differential impedances
		let k: number | undefined;
		if (windings.length >= 2 && omega > 0) {
			// M = (Z_diff_12) / omega where Z_diff_12 = Z[0][2] - Z[0][3] - Z[1][2] + Z[1][3]
			const zmr = Zmp[0][2][0] - Zmp[0][3][0] - Zmp[1][2][0] + Zmp[1][3][0];
			const zmi = Zmp[0][2][1] - Zmp[0][3][1] - Zmp[1][2][1] + Zmp[1][3][1];
			const M = zmi / omega;
			if (windings[0].L > 0 && windings[1].L > 0) {
				k = Math.abs(M) / Math.sqrt(windings[0].L * windings[1].L);
			}
		}

		// Use first winding as the "primary" L/Q/R
		const primL = windings[0]?.L ?? Leff;
		const primR = windings[0]?.R ?? sp.Zeff[0];
		const primQ = windings[0]?.Q ?? Q;

		freqs.push({ freq, Z: Zmp, S, L: primL, Q: primQ, R: primR, ports: portResults, windings, k });
	}

	return { freqs, filaments, network, logScale, portNames, nPorts };
}

/** Find the segment corresponding to a filament index */
function findSegForFilament(
	filIdx: number,
	segToFil: Map<number, number>,
	segments: ConductorSegment[],
): ConductorSegment | null {
	for (const [si, fi] of segToFil) {
		if (fi === filIdx) return segments[si];
	}
	return null;
}

/** Convert network segments to filaments with 3D coordinates from stack */
function segmentsToFilaments(
	segments: ConductorSegment[],
	nodeMap: Map<string, ConductorNode>,
	stack: ProcessStack
): Filament[] {
	return segments.map(seg => {
		const from = nodeMap.get(seg.fromNode);
		const to = nodeMap.get(seg.toNode);
		if (!from || !to) return null;
		const sl = getStackLayer(stack, seg.layerId);
		const z = (sl?.z ?? 300) * 1e-6;
		const t = (sl?.thickness ?? 1) * 1e-6;
		const w = seg.width * 1e-6;
		const dx = (to.x - from.x) * 1e-6, dy = (to.y - from.y) * 1e-6;
		const length = Math.sqrt(dx * dx + dy * dy);
		if (length < 1e-12) return null;
		return { x0: from.x * 1e-6, y0: from.y * 1e-6, z0: z + t / 2, x1: to.x * 1e-6, y1: to.y * 1e-6, z1: z + t / 2, width: w, height: t, length };
	}).filter((f): f is Filament => f !== null);
}
