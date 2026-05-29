import type { Polygon, LayerMap, Port, GeometryResult, SpiralInductorParams } from './types';
import { viaGrid, pgs4 } from './utils';
import { makeAspectShiftY, mapY } from './primitives';

/** Build spiral inductor geometry. Polygons are the single source of truth. */
export function buildSpiralInductor(params: SpiralInductorParams): GeometryResult {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;
	const ar = params.aspectRatio ?? 1;

	const PI = Math.PI;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);

	let R1 = Dout / 2 / Math.cos(PI / sides);
	let R2 = R1 - v;

	const nPts = sides / 2;
	const angles: number[] = [];
	for (let i = 0; i < nPts; i++) {
		angles.push(PI * (1 / (2 * nPts) + i * (1 - 1 / nPts) / (nPts - 1)));
	}

	const extend = 2 * (via_width + via_in_metal) + via_spacing;
	const xShift = -s / 2 * Math.cos(PI / sides);
	const yShift = -s / 2 * Math.sin(PI / sides);

	const opposite = params.portSide === 'opposite';
	// For opposite-side ports: spare one half-turn so the spiral ends on the right side
	// at a larger inner radius, leaving room for the bridge to cross left
	const nSections = opposite ? 2 * N - 1 : 2 * N;

	// --- Compute outer/inner traces ---
	const xOut: number[] = [];
	const yOut: number[] = [];
	const xIn: number[] = [];
	const yIn: number[] = [];

	let r1 = R1, r2 = R2;
	for (let section = 0; section < nSections; section++) {
		if (section % 2 === 0) {
			for (const phi of angles) {
				xOut.push(r1 * Math.cos(phi));
				xIn.push(r2 * Math.cos(phi));
				yOut.push(r1 * Math.sin(phi));
				yIn.push(r2 * Math.sin(phi));
			}
		} else {
			for (const phi of angles) {
				xOut.push(-r1 * Math.cos(phi) + xShift);
				xIn.push(-r2 * Math.cos(phi) + xShift);
				yOut.push(-r1 * Math.sin(phi) + yShift);
				yIn.push(-r2 * Math.sin(phi) + yShift);
			}
		}
		r1 -= s / 2;
		r2 -= s / 2;
	}

	// For opposite-side: both ports centered at y=0 (no offset needed since ports are on different sides)
	// For same-side: entry above, exit below (offset by spacing to avoid shorting)
	const entryYCenter = opposite ? 0 : (width + spacing) / 2;
	const exitYCenter = opposite ? 0 : -(width + spacing) / 2;

	// Start connector (P1 always enters from right)
	const xOutStart = [Dout / 2 + width, xOut[0]];
	const xInStart = [Dout / 2 + width, xIn[0]];
	const yOutStart = [entryYCenter + width / 2, entryYCenter + width / 2];
	const yInStart = [entryYCenter - width / 2, entryYCenter - width / 2];

	// End connector
	const xOutEnd = [xOut[xOut.length - 1]];
	const xInEnd = [xIn[xIn.length - 1]];
	const yOutEnd = [opposite ? -width / 2 : -spacing / 2];
	const yInEnd = [opposite ? -width / 2 : -spacing / 2];

	// Full winding polygon
	const xPoly = [
		...xOutStart, ...xOut, ...xOutEnd,
		...[...xInEnd].reverse(), ...[...xIn].reverse(), ...[...xInStart].reverse()
	];
	const yPoly = [
		...yOutStart, ...yOut, ...yOutEnd,
		...[...yInEnd].reverse(), ...[...yIn].reverse(), ...[...yInStart].reverse()
	];
	const windingPolygon: Polygon = { x: xPoly, y: yPoly };

	// Underpass polygon
	const lastXIn = xIn[xIn.length - 1];
	const lastXOut = xOut[xOut.length - 1];
	const underpassEndX = opposite ? -(Dout / 2 + width) : Dout / 2 + width;
	const underpassPolygon: Polygon = {
		x: [lastXIn, underpassEndX, underpassEndX, lastXIn],
		y: [exitYCenter - width / 2, exitYCenter - width / 2, exitYCenter + width / 2, exitYCenter + width / 2],
	};

	// Via polygons
	const viaCenterX = lastXOut + (lastXIn - lastXOut) / 2;
	const viaCenterY = exitYCenter;

	let viaPolys: Polygon[];
	if (extend > width) {
		viaPolys = viaGrid(
			viaCenterX, viaCenterY + (extend - width) / 2,
			width - 2 * via_in_metal, extend - 2 * via_in_metal,
			via_spacing, via_width
		);
	} else {
		viaPolys = viaGrid(
			viaCenterX, viaCenterY,
			width - 2 * via_in_metal, width - 2 * via_in_metal,
			via_spacing, via_width
		);
	}

	// Apply aspect ratio — stretch the straight sides only (y=0 fixed).
	const shiftY = makeAspectShiftY(Dout, ar);
	const layers: LayerMap = {
		windings: [mapY(windingPolygon, shiftY)],
		crossings: [mapY(underpassPolygon, shiftY)],
		vias: viaPolys.map(p => mapY(p, shiftY)),
		pgs: [],
	};

	const ports: Port[] = [
		{ name: 'P1', x: Dout / 2 + width, y: shiftY(entryYCenter), layer: 'windings', role: 'signal' },
		{ name: 'P2', x: underpassEndX, y: shiftY(exitYCenter), layer: 'crossings', role: 'signal' },
	];

	return { layers, ports };
}

export function isSpiralValid(params: SpiralInductorParams): boolean {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;
	const opposite = params.portSide === 'opposite';
	const extend = 2 * (via_width + via_in_metal) + via_spacing;
	if (extend > width) return false;
	if (opposite && N < 2) return false;

	if (opposite) {
		// Opposite-side: 2*N - 1 sections, underpass centered at y=0
		const s = (spacing + width) / Math.cos(Math.PI / sides);
		const R1 = Dout / 2 / Math.cos(Math.PI / sides);
		const innerR = R1 - (2 * N - 1) * s / 2;
		if (innerR * Math.sin(Math.PI / sides) < width / 2) return false;
	} else {
		// Same-side: original validation
		const Din = Dout - (N + 1) * (width + spacing);
		if (Math.abs(Din / 2 * Math.atan(Math.PI / sides)) < width + spacing / 2) return false;
	}

	return true;
}

export function addPgs(layers: LayerMap, D: number, w: number, s: number): void {
	layers.pgs = pgs4(D, w, s);
}
