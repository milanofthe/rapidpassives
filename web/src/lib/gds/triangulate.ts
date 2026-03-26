/**
 * Shared triangulation utilities — used by both the Web Worker and the embed.
 */
import earcut from 'earcut';
import type { Polygon } from '$lib/geometry/types';

export function triangulate(xs: number[], ys: number[]): number[] {
	const cx: number[] = [], cy: number[] = [], idxMap: number[] = [];
	for (let i = 0; i < xs.length; i++) {
		if (cx.length > 0 && Math.abs(xs[i] - cx[cx.length - 1]) < 1e-10 && Math.abs(ys[i] - cy[cy.length - 1]) < 1e-10) continue;
		cx.push(xs[i]); cy.push(ys[i]); idxMap.push(i);
	}
	if (cx.length > 1 && Math.abs(cx[0] - cx[cx.length - 1]) < 1e-10 && Math.abs(cy[0] - cy[cy.length - 1]) < 1e-10) {
		cx.pop(); cy.pop(); idxMap.pop();
	}
	const n = cx.length;
	if (n < 3) return [];
	let area = 0;
	for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += cx[i] * cy[j] - cx[j] * cy[i]; }
	if (Math.abs(area) < 1e-20) return [];
	const coords = new Float64Array(n * 2);
	for (let i = 0; i < n; i++) { coords[i * 2] = cx[i]; coords[i * 2 + 1] = cy[i]; }
	const tris = earcut(coords as unknown as number[]);
	const result = new Array(tris.length);
	for (let i = 0; i < tris.length; i++) result[i] = idxMap[tris[i]];
	return result;
}

function isRect(x: number[], y: number[]): boolean {
	if (x.length !== 4) return false;
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		const dx = x[j] - x[i], dy = y[j] - y[i];
		if (Math.abs(dx) > 1e-10 && Math.abs(dy) > 1e-10) return false;
	}
	return true;
}

export function triangulatePolygons(polys: Polygon[], scale: number): Float32Array {
	let totalVerts = 0;
	const results: { type: 'rect' | 'tri'; poly: Polygon; tris?: number[] }[] = [];
	for (const poly of polys) {
		if (poly.x.length < 3) continue;
		if (isRect(poly.x, poly.y)) {
			results.push({ type: 'rect', poly });
			totalVerts += 6;
		} else {
			const tris = triangulate(poly.x, poly.y);
			if (tris.length > 0) {
				results.push({ type: 'tri', poly, tris });
				totalVerts += tris.length;
			}
		}
	}

	const buf = new Float32Array(totalVerts * 2);
	let offset = 0;
	for (const r of results) {
		const { x, y } = r.poly;
		if (r.type === 'rect') {
			buf[offset++] = x[0] * scale; buf[offset++] = y[0] * scale;
			buf[offset++] = x[1] * scale; buf[offset++] = y[1] * scale;
			buf[offset++] = x[2] * scale; buf[offset++] = y[2] * scale;
			buf[offset++] = x[0] * scale; buf[offset++] = y[0] * scale;
			buf[offset++] = x[2] * scale; buf[offset++] = y[2] * scale;
			buf[offset++] = x[3] * scale; buf[offset++] = y[3] * scale;
		} else {
			for (let i = 0; i < r.tris!.length; i++) {
				buf[offset++] = x[r.tris![i]] * scale;
				buf[offset++] = y[r.tris![i]] * scale;
			}
		}
	}
	return buf;
}
