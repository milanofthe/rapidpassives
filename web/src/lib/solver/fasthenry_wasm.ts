/**
 * FastHenry WASM solver interface.
 *
 * Runs the real FastHenry solver in the browser via WebAssembly.
 * Uses Emscripten's virtual filesystem to pass .inp files and read Zc.mat results.
 */

import type { ConductorNetwork } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { generateFastHenryInput } from './fasthenry_export';

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
			const { default: FastHenryModule } = await import('/wasm/fasthenry.js');
			return await FastHenryModule();
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
