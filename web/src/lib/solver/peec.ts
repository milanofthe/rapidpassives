/**
 * PEEC (Partial Element Equivalent Circuit) MQS solver.
 *
 * Takes a ConductorNetwork + ProcessStack and computes:
 * - Impedance matrix Z(f) = R(f) + jωL
 * - Y-parameters
 * - S-parameters
 *
 * For each frequency point in a sweep.
 */

import type { ConductorNetwork, ConductorSegment, ConductorNode } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { getStackLayer } from '$lib/stack/types';
import { selfInductance, mutualInductance, type Filament } from './inductance';

const PI = Math.PI;
const MU0 = 4 * PI * 1e-7;

/** Complex number as [real, imag] */
type Cx = [number, number];

/** Result for a single frequency point */
export interface FrequencyPoint {
	freq: number;        // Hz
	Z: Cx[][];           // impedance matrix (n_ports × n_ports)
	Y: Cx[][];           // admittance matrix
	S: Cx[][];           // S-parameter matrix
	L: number;           // effective inductance (H) — from imag(Z11)/ω
	Q: number;           // quality factor — imag(Z11)/real(Z11)
	R: number;           // effective resistance (Ω) — real(Z11)
}

/** Full simulation result */
export interface SimulationResult {
	freqs: FrequencyPoint[];
	filaments: Filament[];
	network: ConductorNetwork;
}

/** Simulation options */
export interface SimOptions {
	fMin: number;        // Hz
	fMax: number;        // Hz
	nPoints: number;     // number of frequency points (log-spaced)
	z0?: number;         // reference impedance for S-params (default 50Ω)
}

/**
 * Run PEEC simulation on a conductor network.
 */
export function solvePEEC(
	network: ConductorNetwork,
	stack: ProcessStack,
	options: SimOptions
): SimulationResult {
	const { fMin, fMax, nPoints, z0 = 50 } = options;

	// Build node map
	const nodeMap = new Map<string, ConductorNode>();
	for (const n of network.nodes) nodeMap.set(n.id, n);

	// Convert segments to filaments
	const filaments = segmentsToFilaments(network.segments, nodeMap, stack);

	// Compute inductance matrix L[i][j]
	const nFil = filaments.length;
	const L = new Array(nFil);
	for (let i = 0; i < nFil; i++) {
		L[i] = new Float64Array(nFil);
		for (let j = 0; j <= i; j++) {
			if (i === j) {
				L[i][j] = selfInductance(filaments[i].width, filaments[i].length, filaments[i].height);
			} else {
				const m = mutualInductance(filaments[i], filaments[j]);
				L[i][j] = m;
				L[j][i] = m;
			}
		}
	}

	// Compute DC resistance per filament
	const Rdc = filaments.map((fil, idx) => {
		const seg = network.segments[idx];
		const sl = getStackLayer(stack, seg.layerId);
		const rsh = sl?.rsh ?? 0.03;
		return rsh * fil.length / fil.width;
	});

	// Build mesh matrix M
	// For a simple series path (spiral inductor), each segment is one mesh branch.
	// The mesh matrix maps mesh currents to branch currents.
	// For a single-port series path: M = identity (each segment carries the same current)
	// For multi-port networks: need proper mesh analysis

	// Simplified: treat the network as a single series path from port+ to port-
	// through all segments. The impedance is the sum of all segment impedances.
	const nPorts = network.ports.length;

	// Generate frequency points (log-spaced)
	const freqs: FrequencyPoint[] = [];
	const logMin = Math.log10(Math.max(fMin, 1));
	const logMax = Math.log10(fMax);

	for (let i = 0; i < nPoints; i++) {
		const logF = logMin + i * (logMax - logMin) / (nPoints - 1);
		const freq = Math.pow(10, logF);
		const omega = 2 * PI * freq;

		// Frequency-dependent resistance (skin effect)
		const Rf = Rdc.map((rdc, idx) => {
			const fil = filaments[idx];
			const seg = network.segments[idx];
			const sl = getStackLayer(stack, seg.layerId);
			const sigma = 1 / ((sl?.rsh ?? 0.03) * fil.height);
			const delta = Math.sqrt(2 / (omega * MU0 * sigma)); // skin depth
			const t = fil.height;
			const w = fil.width;

			// Skin effect correction factor
			if (delta >= t / 2) {
				return rdc; // below skin effect onset
			}
			// Approximate: effective cross-section reduced by skin effect
			const effectiveArea = w * t - (w - 2 * delta) * Math.max(0, t - 2 * delta);
			const fullArea = w * t;
			return rdc * fullArea / effectiveArea;
		});

		// Total impedance: Z = Σ(R_i + jωL_ii) + jω * Σ_{i≠j} L_ij
		// For series path, all filaments carry the same current
		let Zre = 0, Zim = 0;
		for (let i = 0; i < nFil; i++) {
			Zre += Rf[i];
			for (let j = 0; j < nFil; j++) {
				Zim += omega * L[i][j];
			}
		}

		// Add via resistances
		for (const via of network.vias) {
			Zre += via.resistance;
		}

		// Build Z matrix (single port for now)
		const Z: Cx[][] = [[[ Zre, Zim ]]];

		// Y = Z^-1 (for 1-port: Y = 1/Z)
		const Zmag2 = Zre * Zre + Zim * Zim;
		const Y: Cx[][] = [[[Zre / Zmag2, -Zim / Zmag2]]];

		// S = (Z - Z0) / (Z + Z0) for 1-port
		const Sre = ((Zre - z0) * (Zre + z0) + Zim * Zim) / ((Zre + z0) * (Zre + z0) + Zim * Zim);
		const Sim = (2 * z0 * Zim) / ((Zre + z0) * (Zre + z0) + Zim * Zim);
		const S: Cx[][] = [[[Sre, Sim]]];

		const Leff = Zim / omega;
		const Q = Zim / Zre;

		freqs.push({ freq, Z, Y, S, L: Leff, Q, R: Zre });
	}

	return { freqs, filaments, network };
}

/** Convert network segments to filaments with 3D coordinates from stack */
function segmentsToFilaments(
	segments: ConductorSegment[],
	nodeMap: Map<string, ConductorNode>,
	stack: ProcessStack
): Filament[] {
	return segments.filter(seg => !seg.polygonOverride || seg.polygonOverride.x.length >= 3).map(seg => {
		const from = nodeMap.get(seg.fromNode)!;
		const to = nodeMap.get(seg.toNode)!;
		const sl = getStackLayer(stack, seg.layerId);

		const z = (sl?.z ?? 300) * 1e-6;       // convert um to m
		const t = (sl?.thickness ?? 1) * 1e-6;  // convert um to m
		const w = seg.width * 1e-6;             // convert um to m

		const dx = (to.x - from.x) * 1e-6;
		const dy = (to.y - from.y) * 1e-6;
		const length = Math.sqrt(dx * dx + dy * dy);

		return {
			x0: from.x * 1e-6,
			y0: from.y * 1e-6,
			z0: z + t / 2,
			x1: to.x * 1e-6,
			y1: to.y * 1e-6,
			z1: z + t / 2,
			width: w,
			height: t,
			length,
		};
	}).filter(f => f.length > 1e-12);
}
