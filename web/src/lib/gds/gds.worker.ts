/**
 * GDS parsing Web Worker.
 * Two modes:
 *   - 'parse': flat pipeline (parse → flatten → scale) for small files
 *   - 'parse-instanced': instanced pipeline (parse → hierarchy → triangulate) for large files
 */
import earcut from 'earcut';
import { readGds, flattenGds, scalePolygons, buildInstancedScene, type GdsData, type Affine2D } from '$lib/gds/reader';
import type { Polygon } from '$lib/geometry/types';

// ─── Triangulation (same as canvas3d.ts) ─────────────────────────────

function triangulate(xs: number[], ys: number[]): number[] {
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

/** Triangulate polygons into a flat Float32Array of [x,y, x,y, ...] triangle vertices */
function triangulatPolygons(polys: Polygon[], scale: number): Float32Array {
	// First pass: count total vertices
	let totalVerts = 0;
	const triResults: { tris: number[]; poly: Polygon }[] = [];
	for (const poly of polys) {
		const tris = triangulate(poly.x, poly.y);
		if (tris.length > 0) {
			triResults.push({ tris, poly });
			totalVerts += tris.length;
		}
	}

	// Second pass: pack into Float32Array
	const buf = new Float32Array(totalVerts * 2);
	let offset = 0;
	for (const { tris, poly } of triResults) {
		for (let i = 0; i < tris.length; i++) {
			buf[offset++] = poly.x[tris[i]] * scale;
			buf[offset++] = poly.y[tris[i]] * scale;
		}
	}
	return buf;
}

// ─── Hierarchy diagnostics ───────────────────────────────────────────

function logHierarchy(data: GdsData) {
	let uniquePolys = 0;
	let totalSrefs = 0;
	let totalArefInstances = 0;
	const cellPolyCount = new Map<string, number>();

	for (const cell of data.cells) {
		let cp = 0;
		for (const [, polys] of cell.polygons) cp += polys.length;
		cellPolyCount.set(cell.name, cp);
		uniquePolys += cp;
		totalSrefs += cell.srefs.length;
		for (const ar of cell.arefs) totalArefInstances += ar.columns * ar.rows;
	}

	const referenced = new Set<string>();
	for (const cell of data.cells) {
		for (const sr of cell.srefs) referenced.add(sr.sname);
		for (const ar of cell.arefs) referenced.add(ar.sname);
	}
	const topCells = data.cells.filter(c => !referenced.has(c.name));
	const topCell = topCells.length > 0 ? topCells[topCells.length - 1] : data.cells[data.cells.length - 1];

	const cellMap = new Map(data.cells.map(c => [c.name, c]));
	let estimatedFlat = 0;
	if (topCell) {
		const cache = new Map<string, number>();
		function est(name: string): number {
			if (cache.has(name)) return cache.get(name)!;
			const cell = cellMap.get(name);
			if (!cell) return 0;
			let count = cellPolyCount.get(name) || 0;
			for (const sr of cell.srefs) count += est(sr.sname);
			for (const ar of cell.arefs) count += est(ar.sname) * ar.columns * ar.rows;
			cache.set(name, count);
			return count;
		}
		estimatedFlat = est(topCell.name);
	}

	console.log(`GDS Hierarchy:`);
	console.log(`  Cells: ${data.cells.length}`);
	console.log(`  Top cell: ${topCell?.name ?? '?'}`);
	console.log(`  Unique polygons: ${uniquePolys.toLocaleString()}`);
	console.log(`  SREFs: ${totalSrefs.toLocaleString()}, AREF instances: ${totalArefInstances.toLocaleString()}`);
	console.log(`  Estimated flattened: ${estimatedFlat.toLocaleString()} (${uniquePolys > 0 ? (estimatedFlat / uniquePolys).toFixed(1) : '?'}x expansion)`);

	return { uniquePolys, estimatedFlat };
}

// ─── Message handler ─────────────────────────────────────────────────

const INSTANCED_THRESHOLD = 500_000; // use instancing if flattened count > this

self.onmessage = (e: MessageEvent) => {
	try {
		const bytes = new Uint8Array(e.data.buffer);

		self.postMessage({ type: 'progress', phase: 'parsing' });
		const t0 = performance.now();
		const data = readGds(bytes);
		const t1 = performance.now();

		const { uniquePolys, estimatedFlat } = logHierarchy(data);
		const useInstancing = estimatedFlat > INSTANCED_THRESHOLD;

		if (useInstancing) {
			console.log(`  → Using instanced rendering (${estimatedFlat.toLocaleString()} > ${INSTANCED_THRESHOLD.toLocaleString()})`);
			self.postMessage({ type: 'progress', phase: 'building hierarchy' });

			const scene = buildInstancedScene(data);
			const t2 = performance.now();

			self.postMessage({ type: 'progress', phase: 'triangulating' });

			// Triangulate each cell's polygons per GDS layer
			// Result: cellName → { gdsLayer → Float32Array of triangle verts }
			const cellMeshes: Record<string, Record<number, Float32Array>> = {};
			const cellInstances: Record<string, number[]> = {};
			const transferables: ArrayBuffer[] = [];
			let totalTriVerts = 0;

			for (const [cellName, cellData] of scene.cells) {
				const instances = scene.instances.get(cellName);
				if (!instances || instances.length === 0) continue;

				const meshes: Record<number, Float32Array> = {};
				for (const [layerNum, polys] of cellData.polygons) {
					const buf = triangulatPolygons(polys, scene.userUnit);
					if (buf.length > 0) {
						meshes[layerNum] = buf;
						transferables.push(buf.buffer);
						totalTriVerts += buf.length / 2;
					}
				}

				if (Object.keys(meshes).length > 0) {
					cellMeshes[cellName] = meshes;
					// Pack transforms as flat array: [a,b,c,d,tx,ty, a,b,c,d,tx,ty, ...]
					// Apply userUnit scaling to tx,ty
					const packed = new Float32Array(instances.length * 6);
					for (let i = 0; i < instances.length; i++) {
						const t = instances[i];
						packed[i * 6 + 0] = t[0]; // a
						packed[i * 6 + 1] = t[1]; // b
						packed[i * 6 + 2] = t[2]; // c
						packed[i * 6 + 3] = t[3]; // d
						packed[i * 6 + 4] = t[4] * scene.userUnit; // tx
						packed[i * 6 + 5] = t[5] * scene.userUnit; // ty
					}
					cellInstances[cellName] = Array.from(packed);
				}
			}

			const t3 = performance.now();
			const totalInstances = Object.values(cellInstances).reduce((s, v) => s + v.length / 6, 0);
			console.log(`GDS Worker: parse ${(t1 - t0) | 0}ms, hierarchy ${(t2 - t1) | 0}ms, triangulate ${(t3 - t2) | 0}ms`);
			console.log(`  ${Object.keys(cellMeshes).length} unique cells, ${totalInstances.toLocaleString()} instances, ${totalTriVerts.toLocaleString()} tri verts`);

			self.postMessage({
				type: 'done-instanced',
				cellMeshes,
				cellInstances,
				polygonCount: totalTriVerts / 2,
			}, transferables);

		} else {
			console.log(`  → Using flat rendering (${estimatedFlat.toLocaleString()} ≤ ${INSTANCED_THRESHOLD.toLocaleString()})`);
			self.postMessage({ type: 'progress', phase: 'flattening' });
			const flat = flattenGds(data);
			const t2 = performance.now();

			self.postMessage({ type: 'progress', phase: 'scaling' });
			const scaled = scalePolygons(flat, data.units.userUnit);
			const t3 = performance.now();

			const layers: Record<number, Polygon[]> = {};
			let totalPolys = 0;
			for (const [layerNum, polys] of scaled) {
				layers[layerNum] = polys;
				totalPolys += polys.length;
			}

			console.log(`GDS Worker: parse ${(t1 - t0) | 0}ms, flatten ${(t2 - t1) | 0}ms, scale ${(t3 - t2) | 0}ms → ${totalPolys} polys`);
			self.postMessage({ type: 'done', layers, polygonCount: totalPolys });
		}
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
