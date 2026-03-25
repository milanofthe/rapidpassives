/**
 * GDS parsing Web Worker.
 * Always uses instanced pipeline: parse → hierarchy → triangulate unique cells.
 */
import earcut from 'earcut';
import { readGds, buildInstancedScene } from '$lib/gds/reader';
import type { Polygon } from '$lib/geometry/types';

// ─── Triangulation ───────────────────────────────────────────────────

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

function triangulatePolygons(polys: Polygon[], scale: number): Float32Array {
	let totalVerts = 0;
	const triResults: { tris: number[]; poly: Polygon }[] = [];
	for (const poly of polys) {
		const tris = triangulate(poly.x, poly.y);
		if (tris.length > 0) {
			triResults.push({ tris, poly });
			totalVerts += tris.length;
		}
	}
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

// ─── Message handler ─────────────────────────────────────────────────

self.onmessage = (e: MessageEvent) => {
	try {
		const bytes = new Uint8Array(e.data.buffer);

		self.postMessage({ type: 'progress', phase: 'parsing' });
		const t0 = performance.now();
		const data = readGds(bytes);
		const t1 = performance.now();

		self.postMessage({ type: 'progress', phase: 'building hierarchy' });
		const scene = buildInstancedScene(data);
		const t2 = performance.now();

		self.postMessage({ type: 'progress', phase: 'triangulating' });

		const cellMeshes: Record<string, Record<number, Float32Array>> = {};
		const cellInstances: Record<string, number[]> = {};
		const transferables: ArrayBuffer[] = [];
		let totalTriVerts = 0;

		for (const [cellName, cellData] of scene.cells) {
			const instances = scene.instances.get(cellName);
			if (!instances || instances.length === 0) continue;

			const meshes: Record<number, Float32Array> = {};
			for (const [layerNum, polys] of cellData.polygons) {
				const buf = triangulatePolygons(polys, scene.userUnit);
				if (buf.length > 0) {
					meshes[layerNum] = buf;
					transferables.push(buf.buffer);
					totalTriVerts += buf.length / 2;
				}
			}

			if (Object.keys(meshes).length > 0) {
				cellMeshes[cellName] = meshes;
				const packed = new Float32Array(instances.length * 6);
				for (let i = 0; i < instances.length; i++) {
					const t = instances[i];
					packed[i * 6 + 0] = t[0];
					packed[i * 6 + 1] = t[1];
					packed[i * 6 + 2] = t[2];
					packed[i * 6 + 3] = t[3];
					packed[i * 6 + 4] = t[4] * scene.userUnit;
					packed[i * 6 + 5] = t[5] * scene.userUnit;
				}
				cellInstances[cellName] = Array.from(packed);
			}
		}

		const t3 = performance.now();
		const totalInstances = Object.values(cellInstances).reduce((s, v) => s + v.length / 6, 0);
		console.log(`GDS Worker: parse ${(t1 - t0) | 0}ms, hierarchy ${(t2 - t1) | 0}ms, triangulate ${(t3 - t2) | 0}ms`);
		console.log(`  ${Object.keys(cellMeshes).length} unique cells, ${totalInstances.toLocaleString()} instances, ${totalTriVerts.toLocaleString()} tri verts`);

		self.postMessage({
			type: 'done',
			cellMeshes,
			cellInstances,
			polygonCount: totalTriVerts / 2,
		}, transferables);
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
