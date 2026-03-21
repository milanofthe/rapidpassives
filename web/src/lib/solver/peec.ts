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
import { computeParasitics, applyPiModelSparams } from './parasitics';

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
	logScale: boolean;
}

/** Simulation options */
export interface SimOptions {
	fMin: number;        // Hz
	fMax: number;        // Hz
	nPoints: number;
	z0?: number;         // reference impedance for S-params (default 50Ω)
	logScale?: boolean;  // true = log-spaced (default), false = linear
	conductorSpacing?: number; // spacing between turns in um (for Cs calculation)
	hasPgs?: boolean;    // whether PGS is enabled
}

/**
 * Run PEEC simulation on a conductor network.
 */
export function solvePEEC(
	network: ConductorNetwork,
	stack: ProcessStack,
	options: SimOptions
): SimulationResult {
	const { fMin, fMax, nPoints, z0 = 50, logScale = true, conductorSpacing = 2, hasPgs = false } = options;

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

	// Compute pi-model parasitic elements
	const parasitics = computeParasitics(filaments, stack, conductorSpacing * 1e-6, hasPgs);

	// Generate frequency points
	const freqs: FrequencyPoint[] = [];

	for (let i = 0; i < nPoints; i++) {
		let freq: number;
		if (logScale) {
			const logMin = Math.log10(Math.max(fMin, 1));
			const logMax = Math.log10(fMax);
			freq = Math.pow(10, logMin + i * (logMax - logMin) / (nPoints - 1));
		} else {
			freq = fMin + i * (fMax - fMin) / (nPoints - 1);
		}
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

		// Apply pi-model parasitics and compute S-params via ABCD
		const sp = applyPiModelSparams(Zre, Zim, omega, parasitics, z0);

		const S11: Cx = sp.S11;
		const S21: Cx = sp.S21;
		const S: Cx[][] = [[S11, S21], [S21, S11]];
		const Z: Cx[][] = [[[sp.Zeff[0], sp.Zeff[1]], [sp.Zeff[0], sp.Zeff[1]]], [[sp.Zeff[0], sp.Zeff[1]], [sp.Zeff[0], sp.Zeff[1]]]];
		const Y: Cx[][] = [];

		// L and Q from effective impedance (Z_eff = B/D from ABCD)
		const Leff = sp.Zeff[1] / omega;
		const Q = sp.Zeff[1] / sp.Zeff[0];

		freqs.push({ freq, Z, Y, S, L: Leff, Q, R: Zre });
	}

	return { freqs, filaments, network, logScale };
}

/** Convert network segments to filaments with 3D coordinates from stack */
function segmentsToFilaments(
	segments: ConductorSegment[],
	nodeMap: Map<string, ConductorNode>,
	stack: ProcessStack
): Filament[] {
	return segments.map(seg => {
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
