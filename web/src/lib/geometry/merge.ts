import polygonClipping from 'polygon-clipping';
import type { Polygon, LayerMap, LayerName } from './types';
import { LAYER_ORDER } from './types';

/**
 * Merge all touching/overlapping polygons on each layer into unified shapes.
 * Uses polygon boolean union via the polygon-clipping library.
 */
export function mergeLayers(layers: LayerMap): LayerMap {
	const result: LayerMap = {};

	for (const layerName of LAYER_ORDER) {
		const polys = layers[layerName];
		if (!polys || polys.length === 0) {
			if (layers[layerName]) result[layerName] = [];
			continue;
		}

		if (polys.length === 1) {
			result[layerName] = polys;
			continue;
		}

		result[layerName] = mergePolygons(polys);
	}

	return result;
}

/**
 * Union an array of polygons into merged shapes.
 * Returns a new array with touching/overlapping polygons combined.
 */
export function mergePolygons(polys: Polygon[]): Polygon[] {
	if (polys.length === 0) return [];
	if (polys.length === 1) return polys;

	// Convert our Polygon format to polygon-clipping format:
	// polygon-clipping uses MultiPolygon = Polygon[]
	// where Polygon = Ring[] (first ring is outer, rest are holes)
	// and Ring = [x, y][]
	const multiPoly = polys
		.filter(p => p.x.length >= 3)
		.map(p => polyToRings(p));

	if (multiPoly.length === 0) return [];

	try {
		const merged = polygonClipping.union(...multiPoly as [any, ...any[]]);
		return merged.map(poly => ringsToPolygon(poly));
	} catch {
		// If union fails (degenerate geometry), return originals
		return polys;
	}
}

/** Convert our Polygon {x[], y[]} to polygon-clipping ring format [[x,y], ...] */
function polyToRings(p: Polygon): [number, number][][] {
	const ring: [number, number][] = [];
	for (let i = 0; i < p.x.length; i++) {
		ring.push([p.x[i], p.y[i]]);
	}
	// Close the ring if not already closed
	if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
		ring.push([ring[0][0], ring[0][1]]);
	}
	return [ring]; // single outer ring, no holes
}

/** Convert polygon-clipping result back to our Polygon format */
function ringsToPolygon(rings: [number, number][][]): Polygon {
	// Use the outer ring (first ring), drop closing point
	const ring = rings[0];
	const x: number[] = [];
	const y: number[] = [];
	// polygon-clipping returns closed rings, drop the duplicate closing point
	const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
		? ring.length - 1
		: ring.length;
	for (let i = 0; i < n; i++) {
		x.push(ring[i][0]);
		y.push(ring[i][1]);
	}
	return { x, y };
}
