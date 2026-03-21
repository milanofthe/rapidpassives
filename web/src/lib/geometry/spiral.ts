import type { Polygon, LayerMap, SpiralInductorParams } from './types';
import { viaGrid, pgs4 } from './utils';

export function buildSpiralInductor(params: SpiralInductorParams): LayerMap {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;

	const v = width / Math.cos(Math.PI / sides);
	const s = (spacing + width) / Math.cos(Math.PI / sides);

	let R1 = Dout / 2 / Math.cos(Math.PI / sides);
	let R2 = R1 - v;

	const nPts = sides / 2;
	const angles: number[] = [];
	for (let i = 0; i < nPts; i++) {
		angles.push(Math.PI * (1 / (2 * nPts) + i * (1 - 1 / nPts) / (nPts - 1)));
	}

	const extend = 2 * (via_width + via_in_metal) + via_spacing;

	const xShift = -s / 2 * Math.cos(Math.PI / sides);
	const yShift = -s / 2 * Math.sin(Math.PI / sides);

	const xOut: number[] = [];
	const yOut: number[] = [];
	const xIn: number[] = [];
	const yIn: number[] = [];

	for (let section = 0; section < 2 * N; section++) {
		if (section % 2 === 0) {
			for (const phi of angles) {
				xOut.push(R1 * Math.cos(phi));
				xIn.push(R2 * Math.cos(phi));
				yOut.push(R1 * Math.sin(phi));
				yIn.push(R2 * Math.sin(phi));
			}
		} else {
			for (const phi of angles) {
				xOut.push(-R1 * Math.cos(phi) + xShift);
				xIn.push(-R2 * Math.cos(phi) + xShift);
				yOut.push(-R1 * Math.sin(phi) + yShift);
				yIn.push(-R2 * Math.sin(phi) + yShift);
			}
		}
		R1 -= s / 2;
		R2 -= s / 2;
	}

	// Start connector
	const xOutStart = [Dout / 2 + width, xOut[0]];
	const xInStart = [Dout / 2 + width, xIn[0]];
	const yOutStart = [width + spacing / 2, width + spacing / 2];
	const yInStart = [spacing / 2, spacing / 2];

	// End connector
	const xOutEnd = [xOut[xOut.length - 1]];
	const xInEnd = [xIn[xIn.length - 1]];
	const yOutEnd = [-spacing / 2];
	const yInEnd = [-spacing / 2];

	// Underpass
	const lastXIn = xIn[xIn.length - 1];
	const xUnder = [lastXIn, Dout / 2 + width, Dout / 2 + width, lastXIn];
	const yUnder = [-width - spacing / 2, -width - spacing / 2, -spacing / 2, -spacing / 2];

	// Combine winding polygon
	const xPoly = [
		...xOutStart, ...xOut, ...xOutEnd,
		...[...xInEnd].reverse(), ...[...xIn].reverse(), ...[...xInStart].reverse()
	];
	const yPoly = [
		...yOutStart, ...yOut, ...yOutEnd,
		...[...yInEnd].reverse(), ...[...yIn].reverse(), ...[...yInStart].reverse()
	];

	// Vias
	const lastXOut = xOut[xOut.length - 1];
	const viaCenterX = lastXOut + (lastXIn - lastXOut) / 2;
	const viaCenterY = -width / 2 - spacing / 2;

	let polysVias: Polygon[];
	if (extend > width) {
		polysVias = viaGrid(
			viaCenterX, viaCenterY + (extend - width) / 2,
			width - 2 * via_in_metal, extend - 2 * via_in_metal,
			via_spacing, via_width
		);
	} else {
		polysVias = viaGrid(
			viaCenterX, viaCenterY,
			width - 2 * via_in_metal, width - 2 * via_in_metal,
			via_spacing, via_width
		);
	}

	return {
		windings: [{ x: xPoly, y: yPoly }],
		crossings: [{ x: xUnder, y: yUnder }],
		vias: polysVias,
		pgs: [],
	};
}

export function isSpiralValid(params: SpiralInductorParams): boolean {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;
	const extend = 2 * (via_width + via_in_metal) + via_spacing;
	if (extend > width) return false;
	const Din = Dout - (N + 1) * (width + spacing);
	if (Math.abs(Din / 2 * Math.atan(Math.PI / sides)) < width + spacing / 2) return false;
	return true;
}

export function addPgs(layers: LayerMap, D: number, w: number, s: number): void {
	layers.pgs = pgs4(D, w, s);
}
