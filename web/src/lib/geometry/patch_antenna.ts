import type { Polygon, LayerMap, PatchAntennaParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, Port, GeometryResult } from './network';
import { networkToLayers } from './polygonize';

/** Helper: offset a polygon by dx, dy */
function offsetPoly(p: Polygon, dx: number, dy: number): Polygon {
	return { x: p.x.map(v => v + dx), y: p.y.map(v => v + dy) };
}

/** Helper: create a rectangle polygon */
function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
	return { x: [x0, x1, x1, x0], y: [y0, y0, y1, y1] };
}

/** Build a single patch element polygons (patch + feed) centered at origin */
function buildSinglePatch(W: number, L: number, feedType: string, feedWidth: number, insetDepth: number, insetGap: number): Polygon[] {
	const polys: Polygon[] = [];

	if (feedType === 'inset' && insetDepth > 0) {
		const notchHalfW = feedWidth / 2 + insetGap;
		polys.push({
			x: [
				-W / 2, -notchHalfW, -notchHalfW, -feedWidth / 2, -feedWidth / 2,
				feedWidth / 2, feedWidth / 2, notchHalfW, notchHalfW, W / 2, W / 2, -W / 2,
			],
			y: [
				-L / 2, -L / 2, -L / 2 + insetDepth, -L / 2 + insetDepth, -L / 2,
				-L / 2, -L / 2 + insetDepth, -L / 2 + insetDepth, -L / 2, -L / 2, L / 2, L / 2,
			],
		});
	} else {
		polys.push(rect(-W / 2, -L / 2, W / 2, L / 2));
	}

	return polys;
}

/** Build a microstrip patch antenna layout (single element or NxM array) */
export function buildPatchAntenna(params: PatchAntennaParams): GeometryResult {
	const { W, L, feedType, feedWidth, feedLength, insetDepth, insetGap, groundMargin } = params;
	const cols = params.arrayCols ?? 1;
	const rows = params.arrayRows ?? 1;
	const spacingX = params.arraySpacingX ?? (W + groundMargin);
	const spacingY = params.arraySpacingY ?? (L + groundMargin);

	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];
	let nid = 0;

	const patchPolys: Polygon[] = [];
	const feedPolys: Polygon[] = [];
	const hw = feedWidth / 2;

	// Element positions (centered around origin)
	const xOffsets: number[] = [];
	const yOffsets: number[] = [];
	for (let c = 0; c < cols; c++) xOffsets.push((c - (cols - 1) / 2) * spacingX);
	for (let r = 0; r < rows; r++) yOffsets.push((r - (rows - 1) / 2) * spacingY);

	// Build each patch element
	const elementPatch = buildSinglePatch(W, L, feedType, feedWidth, insetDepth, insetGap);
	const feedEndYs: number[] = []; // Y position where each element's feed ends

	for (const ey of yOffsets) {
		for (const ex of xOffsets) {
			// Patch polygons
			for (const p of elementPatch) {
				patchPolys.push(offsetPoly(p, ex, ey));
			}

			// Individual element feed stub (short, connecting patch to the feed network)
			const stubEndY = ey - L / 2 - feedWidth; // just below patch
			feedPolys.push(rect(ex - hw, stubEndY, ex + hw, ey - L / 2));
			feedEndYs.push(stubEndY);
		}
	}

	if (cols === 1 && rows === 1) {
		// Single element: simple feed line
		const feedEndY = yOffsets[0] - L / 2 - feedLength;
		feedPolys.length = 0; // remove stub
		feedPolys.push(rect(-hw, feedEndY, hw, yOffsets[0] - L / 2));

		const portNode: ConductorNode = { id: `n${nid++}`, x: 0, y: feedEndY, layerId: 'm3' };
		nodes.push(portNode);
		ports.push({ name: 'P1', node: portNode.id });
	} else {
		// Array: build corporate feed network (binary-tree style)
		// Step 1: horizontal bus for each row, connecting column elements
		const rowBusY: number[] = [];
		for (let r = 0; r < rows; r++) {
			const ey = yOffsets[r];
			const busY = ey - L / 2 - feedWidth - feedWidth; // below element stubs
			rowBusY.push(busY);

			// Vertical stubs from each element down to bus
			for (const ex of xOffsets) {
				feedPolys.push(rect(ex - hw, busY - hw, ex + hw, ey - L / 2 - feedWidth));
			}

			// Horizontal bus connecting all columns in this row
			if (cols > 1) {
				const xLeft = xOffsets[0];
				const xRight = xOffsets[cols - 1];
				feedPolys.push(rect(xLeft - hw, busY - hw, xRight + hw, busY + hw));
			}
		}

		// Step 2: vertical trunk connecting all row buses
		if (rows > 1) {
			const trunkX = 0;
			const topBusY = rowBusY[rowBusY.length - 1];
			const botBusY = rowBusY[0];

			// Vertical trunk
			feedPolys.push(rect(trunkX - hw, botBusY - feedLength, trunkX + hw, topBusY));

			// Horizontal tees from trunk to each row bus center
			for (const by of rowBusY) {
				if (cols > 1) {
					// Already connected via the horizontal bus
				} else {
					// Single column: trunk connects directly to row feed
					feedPolys.push(rect(xOffsets[0] - hw, by - hw, trunkX + hw, by + hw));
				}
			}

			const portNode: ConductorNode = { id: `n${nid++}`, x: trunkX, y: botBusY - feedLength, layerId: 'm3' };
			nodes.push(portNode);
			ports.push({ name: 'P1', node: portNode.id });
		} else {
			// Single row array: port at center bottom of horizontal bus
			const busY = rowBusY[0];
			const trunkEndY = busY - feedLength;
			feedPolys.push(rect(-hw, trunkEndY, hw, busY));

			const portNode: ConductorNode = { id: `n${nid++}`, x: 0, y: trunkEndY, layerId: 'm3' };
			nodes.push(portNode);
			ports.push({ name: 'P1', node: portNode.id });
		}
	}

	// Ground plane covers entire array + margin
	const allX = [...xOffsets.map(x => x - W / 2), ...xOffsets.map(x => x + W / 2)];
	const allY = [...yOffsets.map(y => y - L / 2), ...yOffsets.map(y => y + L / 2)];
	const minX = Math.min(...allX) - groundMargin;
	const maxX = Math.max(...allX) + groundMargin;
	const minY = Math.min(...allY, ...nodes.map(n => n.y)) - groundMargin;
	const maxY = Math.max(...allY) + groundMargin;
	const groundPoly = rect(minX, minY, maxX, maxY);

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = {
		crossings: [groundPoly],
		windings: [...patchPolys, ...feedPolys],
	};

	return { network, layers };
}

/** Compute patch dimensions from target frequency and substrate parameters.
 *  Returns { W, L, insetDepth } in um.
 */
export function designPatchAntenna(freqGHz: number, er: number, h: number, Z0: number = 50): { W: number; L: number; insetDepth: number } {
	const c = 299792.458; // um * GHz
	const f0 = freqGHz;

	const W = c / (2 * f0 * Math.sqrt((er + 1) / 2));
	const erEff = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * h / W);
	const dL = 0.412 * h * ((erEff + 0.3) * (W / h + 0.264)) / ((erEff - 0.258) * (W / h + 0.8));
	const L = c / (2 * f0 * Math.sqrt(erEff)) - 2 * dL;
	const Zedge = 90 * (er * er / (er - 1)) * (L / W) * (L / W);
	const insetDepth = (L / Math.PI) * Math.acos(Math.pow(Z0 / Zedge, 0.25));

	return {
		W: Math.round(W * 10) / 10,
		L: Math.round(L * 10) / 10,
		insetDepth: Math.round(insetDepth * 10) / 10,
	};
}

/** Validate patch antenna parameters */
export function isPatchAntennaValid(params: PatchAntennaParams): boolean {
	const { W, L, feedWidth, feedLength, insetDepth, insetGap, groundMargin, feedType } = params;

	if (W <= 0 || L <= 0 || feedWidth <= 0 || feedLength <= 0 || groundMargin <= 0) return false;
	if (feedWidth >= W) return false;

	if (feedType === 'inset') {
		if (insetDepth < 0 || insetGap < 0) return false;
		if (insetDepth >= L) return false;
		if (feedWidth / 2 + insetGap >= W / 2) return false;
	}

	const cols = params.arrayCols ?? 1;
	const rows = params.arrayRows ?? 1;
	if (cols < 1 || rows < 1) return false;

	return true;
}
