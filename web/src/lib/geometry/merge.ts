import polygonClipping from 'polygon-clipping';
import type { Polygon, LayerMap, LayerName } from './types';
import { LAYER_ORDER } from './types';

/** Snap precision — coordinates rounded to this many decimal places */
const SNAP_DECIMALS = 6;
const SNAP_FACTOR = Math.pow(10, SNAP_DECIMALS);

function snap(v: number): number {
	return Math.round(v * SNAP_FACTOR) / SNAP_FACTOR;
}

/**
 * Merge all touching/overlapping polygons on each layer.
 * Snaps coordinates to a grid first to handle floating-point edge mismatches.
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
 */
export function mergePolygons(polys: Polygon[]): Polygon[] {
	if (polys.length === 0) return [];
	if (polys.length === 1) return polys;

	const multiPoly = polys
		.filter(p => p.x.length >= 3)
		.map(p => polyToRings(p));

	if (multiPoly.length === 0) return [];

	try {
		// Slightly inflate each polygon by a tiny epsilon to ensure
		// touching edges overlap and get merged
		const inflated = multiPoly.map(p => inflateRing(p, 0.001));
		const merged = polygonClipping.union(...inflated as [any, ...any[]]);
		return merged.map(poly => ringsToPolygon(poly));
	} catch {
		return polys;
	}
}

/** Convert Polygon to ring format with coordinate snapping */
function polyToRings(p: Polygon): [number, number][][] {
	const ring: [number, number][] = [];
	for (let i = 0; i < p.x.length; i++) {
		ring.push([snap(p.x[i]), snap(p.y[i])]);
	}
	if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
		ring.push([ring[0][0], ring[0][1]]);
	}
	return [ring];
}

/** Inflate a polygon ring outward by a small amount to ensure overlap at edges */
function inflateRing(rings: [number, number][][], amount: number): [number, number][][] {
	const ring = rings[0];
	if (ring.length < 4) return rings; // need at least 3 points + closing

	// Compute centroid
	let cx = 0, cy = 0;
	const n = ring.length - 1; // exclude closing point
	for (let i = 0; i < n; i++) { cx += ring[i][0]; cy += ring[i][1]; }
	cx /= n; cy /= n;

	// Push each point slightly away from centroid
	const inflated: [number, number][] = ring.map(([x, y]) => {
		const dx = x - cx, dy = y - cy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 1e-10) return [x, y] as [number, number];
		return [
			snap(x + dx / dist * amount),
			snap(y + dy / dist * amount),
		] as [number, number];
	});

	return [inflated];
}

/** Convert polygon-clipping result back to Polygon format */
function ringsToPolygon(rings: [number, number][][]): Polygon {
	const ring = rings[0];
	const x: number[] = [];
	const y: number[] = [];
	const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
		? ring.length - 1
		: ring.length;
	for (let i = 0; i < n; i++) {
		x.push(ring[i][0]);
		y.push(ring[i][1]);
	}
	return { x, y };
}
