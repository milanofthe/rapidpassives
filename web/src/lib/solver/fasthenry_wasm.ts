/**
 * FastHenry WASM solver interface.
 *
 * Runs the real FastHenry solver in the browser via WebAssembly.
 * Uses Emscripten's virtual filesystem to pass .inp files and read Zc.mat results.
 */

import type { ConductorNetwork } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { generateFastHenryInput } from './fasthenry_export';
import type { SimulationResult, FrequencyPoint } from './peec';
import { zToS, extractPortResults, extractCoupling, type PortFreqResult } from './multiport';

export interface FHResult {
	/** Frequency points */
	frequencies: number[];
	/** Impedance matrix per frequency: Z[freq_idx][row][col] = [re, im] */
	Z: [number, number][][][];
	/** Number of ports */
	nPorts: number;
	/** Port names from .external declarations */
	portNames: string[];
}

let modulePromise: Promise<any> | null = null;

/** Load the FastHenry WASM module (cached) */
async function loadModule(): Promise<any> {
	if (!modulePromise) {
		modulePromise = (async () => {
			// Load the Emscripten module via script injection
			// (it's a UMD module, not ES module)
			if (typeof (globalThis as any).FastHenryModule === 'undefined') {
				await new Promise<void>((resolve, reject) => {
					const script = document.createElement('script');
					script.src = '/wasm/fasthenry.js';
					script.onload = () => resolve();
					script.onerror = () => reject(new Error('Failed to load FastHenry WASM'));
					document.head.appendChild(script);
				});
			}
			const factory = (globalThis as any).FastHenryModule;
			if (!factory) throw new Error('FastHenryModule not found');
			return await factory({
				print: () => {},      // suppress stdout
				printErr: () => {},   // suppress stderr
			});
		})();
	}
	return modulePromise;
}

/**
 * Run FastHenry simulation on a conductor network.
 */
export async function runFastHenry(
	network: ConductorNetwork,
	stack: ProcessStack,
	fMin: number,
	fMax: number,
	nDec: number = 5,
): Promise<FHResult | null> {
	// Generate .inp file content
	const inp = generateFastHenryInput(network, stack, {
		title: 'RapidPassives Simulation',
		fMin,
		fMax,
		nDec,
	});

	try {
		const Module = await loadModule();

		// Write .inp to virtual filesystem
		Module.FS.writeFile('/input.inp', inp);

		// Capture stdout
		let stdout = '';
		const origPrint = Module.print;
		Module.print = (text: string) => { stdout += text + '\n'; };

		// Run FastHenry with LU decomposition (direct solve, no multipole issues)
		try {
			Module.callMain(['-sludecomp', '/input.inp']);
		} catch (e: any) {
			// FastHenry may call exit() which throws in Emscripten
			if (!e.message?.includes('exit')) throw e;
		}

		Module.print = origPrint;

		// Read Zc.mat from virtual filesystem
		let zcContent: string;
		try {
			zcContent = Module.FS.readFile('/Zc.mat', { encoding: 'utf8' });
		} catch {
			console.error('FastHenry: Zc.mat not found');
			return null;
		}

		// Parse Zc.mat
		return parseZcMat(zcContent);
	} catch (e) {
		console.error('FastHenry WASM error:', e);
		return null;
	}
}

/**
 * High-level solver: run FastHenry and return SimulationResult
 * compatible with the existing ResultsPanel.
 */
export async function solveFastHenry(
	network: ConductorNetwork,
	stack: ProcessStack,
	options: { fMin: number; fMax: number; nPoints: number; z0?: number; logScale?: boolean },
): Promise<SimulationResult | null> {
	const { fMin, fMax, nPoints, z0 = 50, logScale = true } = options;

	// Compute nDec from nPoints and frequency range
	const decades = Math.log10(fMax / Math.max(fMin, 1));
	const nDec = Math.max(1, Math.round(nPoints / Math.max(decades, 1)));

	const fhResult = await runFastHenry(network, stack, fMin, fMax, nDec);
	if (!fhResult || fhResult.frequencies.length === 0) return null;

	const nPorts = fhResult.nPorts;
	const portNames = fhResult.portNames.map((p, i) => `Port${i + 1}`);

	const freqs: FrequencyPoint[] = fhResult.frequencies.map((freq, fi) => {
		const omega = 2 * Math.PI * freq;
		const Zraw = fhResult.Z[fi] ?? [];

		// Convert to Cx[][] format
		const Z: [number, number][][] = Zraw.map(row => row.map(([re, im]) => [re, im] as [number, number]));

		// S-parameters
		const S = Z.length > 0 ? zToS(Z, z0) : [];

		// Per-port L/Q/R
		const ports: PortFreqResult[] = extractPortResults(Z, omega, portNames);

		// Primary L/Q/R from Z[0][0]
		const Z00re = Z[0]?.[0]?.[0] ?? 0;
		const Z00im = Z[0]?.[0]?.[1] ?? 0;
		const L = omega > 0 ? Z00im / omega : 0;
		const R = Z00re;
		const Q = R > 0 ? Z00im / R : 0;

		// Winding results for transformer (4+ ports)
		let windings: { name: string; L: number; R: number; Q: number }[] | undefined;
		let k: number | undefined;

		if (nPorts === 2) {
			// 2-port: differential L
			const zdr = (Z[0]?.[0]?.[0] ?? 0) - (Z[0]?.[1]?.[0] ?? 0) - (Z[1]?.[0]?.[0] ?? 0) + (Z[1]?.[1]?.[0] ?? 0);
			const zdi = (Z[0]?.[0]?.[1] ?? 0) - (Z[0]?.[1]?.[1] ?? 0) - (Z[1]?.[0]?.[1] ?? 0) + (Z[1]?.[1]?.[1] ?? 0);
			const wL = omega > 0 ? zdi / omega : 0;
			windings = [{ name: 'L', L: wL, R: zdr, Q: zdr > 0 ? zdi / zdr : 0 }];
		} else if (nPorts >= 4) {
			// 4-port: primary = 0,1; secondary = 2,3
			const zd1r = (Z[0]?.[0]?.[0]??0)-(Z[0]?.[1]?.[0]??0)-(Z[1]?.[0]?.[0]??0)+(Z[1]?.[1]?.[0]??0);
			const zd1i = (Z[0]?.[0]?.[1]??0)-(Z[0]?.[1]?.[1]??0)-(Z[1]?.[0]?.[1]??0)+(Z[1]?.[1]?.[1]??0);
			const zd2r = (Z[2]?.[2]?.[0]??0)-(Z[2]?.[3]?.[0]??0)-(Z[3]?.[2]?.[0]??0)+(Z[3]?.[3]?.[0]??0);
			const zd2i = (Z[2]?.[2]?.[1]??0)-(Z[2]?.[3]?.[1]??0)-(Z[3]?.[2]?.[1]??0)+(Z[3]?.[3]?.[1]??0);
			const wL1 = omega > 0 ? zd1i / omega : 0;
			const wL2 = omega > 0 ? zd2i / omega : 0;
			windings = [
				{ name: 'Primary', L: wL1, R: zd1r, Q: zd1r > 0 ? zd1i / zd1r : 0 },
				{ name: 'Secondary', L: wL2, R: zd2r, Q: zd2r > 0 ? zd2i / zd2r : 0 },
			];
			// Coupling
			const zmr = (Z[0]?.[2]?.[0]??0)-(Z[0]?.[3]?.[0]??0)-(Z[1]?.[2]?.[0]??0)+(Z[1]?.[3]?.[0]??0);
			const zmi = (Z[0]?.[2]?.[1]??0)-(Z[0]?.[3]?.[1]??0)-(Z[1]?.[2]?.[1]??0)+(Z[1]?.[3]?.[1]??0);
			const M = omega > 0 ? zmi / omega : 0;
			if (wL1 > 0 && wL2 > 0) k = Math.abs(M) / Math.sqrt(wL1 * wL2);
		}

		return { freq, Z, S, L, Q, R, ports, windings, k };
	});

	return {
		freqs,
		filaments: [],
		network,
		logScale,
		portNames,
		nPorts,
	};
}

/**
 * Parse FastHenry's Zc.mat output file.
 * Format:
 *   Row 1:  node1  to  node2
 *   Impedance matrix for frequency = 1e+008 1 x 1
 *     re1  +im1j   re2  +im2j
 */
function parseZcMat(content: string): FHResult {
	const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

	const frequencies: number[] = [];
	const Z: [number, number][][][] = [];
	const portNames: string[] = [];
	let nPorts = 0;

	let currentMatrix: [number, number][][] = [];
	let currentRow: [number, number][] = [];

	for (const line of lines) {
		// Port declaration: "Row N:  node1  to  node2"
		const rowMatch = line.match(/^Row\s+(\d+):\s+(\S+)\s+to\s+(\S+)/);
		if (rowMatch) {
			const [, , name1, name2] = rowMatch;
			if (!portNames.includes(`${name1}-${name2}`)) {
				portNames.push(`${name1}-${name2}`);
			}
			continue;
		}

		// Frequency header: "Impedance matrix for frequency = 1e+008 N x M"
		const freqMatch = line.match(/frequency\s*=\s*([\d.eE+-]+)\s+(\d+)\s*x\s*(\d+)/);
		if (freqMatch) {
			if (currentMatrix.length > 0) {
				Z.push(currentMatrix);
			}
			frequencies.push(parseFloat(freqMatch[1]));
			nPorts = parseInt(freqMatch[2]);
			currentMatrix = [];
			currentRow = [];
			continue;
		}

		// ADMITTANCE header (skip)
		if (line.includes('ADMITTANCE')) continue;

		// Data line: complex numbers like "  1.02611e-006  +0.55238j   ..."
		const complexPattern = /([-\d.eE+]+)\s*([+-][\d.eE+]+)j/g;
		let match;
		while ((match = complexPattern.exec(line)) !== null) {
			const re = parseFloat(match[1]);
			const im = parseFloat(match[2]);
			currentRow.push([re, im]);

			if (currentRow.length === nPorts) {
				currentMatrix.push(currentRow);
				currentRow = [];
			}
		}
	}

	// Push last matrix
	if (currentMatrix.length > 0) {
		Z.push(currentMatrix);
	}

	return { frequencies, Z, nPorts, portNames };
}
