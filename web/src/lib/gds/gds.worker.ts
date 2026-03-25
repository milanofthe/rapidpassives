/**
 * GDS parsing Web Worker.
 * Pipeline: parse → hierarchy → triangulate → flatten by layer (bake transforms into vertices).
 * Outputs one flat vertex buffer per GDS layer for minimal draw calls.
 */
import earcut from 'earcut';
import { readGds, buildInstancedScene, type Affine2D } from '$lib/gds/reader';
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

// ─── Affine transform helpers ────────────────────────────────────────

/** Apply affine transform to a point: (a*x+b*y+tx, c*x+d*y+ty) */
function transformXY(t: Affine2D, x: number, y: number, scale: number): [number, number] {
	return [
		(t[0] * x + t[1] * y + t[4]) * scale,
		(t[2] * x + t[3] * y + t[5]) * scale,
	];
}

/** Apply affine rotation (no translation) to a normal vector */
function transformNormal(t: Affine2D, nx: number, ny: number): [number, number] {
	const tnx = t[0] * nx + t[1] * ny;
	const tny = t[2] * nx + t[3] * ny;
	const len = Math.sqrt(tnx * tnx + tny * tny);
	return len > 1e-10 ? [tnx / len, tny / len] : [nx, ny];
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

		// Step 1: Triangulate each unique cell's polygons per layer (cell-local coords)
		interface CellLayerData {
			triVerts: Float32Array;  // [x,y, x,y, ...] in cell-local coords (unscaled)
			edgePairs: number[];     // [x0,y0,x1,y1, ...] in cell-local coords (unscaled)
		}
		const cellLayerData = new Map<string, Map<number, CellLayerData>>();
		let totalUniqueTriVerts = 0;

		for (const [cellName, cellData] of scene.cells) {
			const instances = scene.instances.get(cellName);
			if (!instances || instances.length === 0) continue;

			const layerData = new Map<number, CellLayerData>();
			for (const [layerNum, polys] of cellData.polygons) {
				// Triangulate
				const triVertsList: number[] = [];
				for (const poly of polys) {
					const tris = triangulate(poly.x, poly.y);
					for (const idx of tris) {
						triVertsList.push(poly.x[idx], poly.y[idx]);
					}
				}
				// Collect edges
				const edgePairs: number[] = [];
				for (const poly of polys) {
					const n = poly.x.length;
					if (n < 3) continue;
					for (let i = 0; i < n; i++) {
						const j = (i + 1) % n;
						edgePairs.push(poly.x[i], poly.y[i], poly.x[j], poly.y[j]);
					}
				}

				if (triVertsList.length > 0) {
					layerData.set(layerNum, {
						triVerts: new Float32Array(triVertsList),
						edgePairs,
					});
					totalUniqueTriVerts += triVertsList.length / 2;
				}
			}
			if (layerData.size > 0) cellLayerData.set(cellName, layerData);
		}

		const t3 = performance.now();

		// Step 2: Flatten — bake transforms into vertices, grouped by GDS layer
		self.postMessage({ type: 'progress', phase: 'flattening' });

		// Accumulate per-layer
		const layerFaceVerts = new Map<number, number[]>();
		// Side wall data: per vertex [x, y, zFlag, nx, ny] = 5 floats
		const layerSideVerts = new Map<number, number[]>();
		// Bounding box per layer
		const layerBounds = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();

		let totalFlatVerts = 0;
		let totalInstances = 0;
		const scale = scene.userUnit;

		for (const [cellName, layerData] of cellLayerData) {
			const instances = scene.instances.get(cellName)!;
			totalInstances += instances.length;

			for (const [layerNum, data] of layerData) {
				if (!layerFaceVerts.has(layerNum)) layerFaceVerts.set(layerNum, []);
				if (!layerSideVerts.has(layerNum)) layerSideVerts.set(layerNum, []);
				if (!layerBounds.has(layerNum)) layerBounds.set(layerNum, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

				const faceArr = layerFaceVerts.get(layerNum)!;
				const sideArr = layerSideVerts.get(layerNum)!;
				const bounds = layerBounds.get(layerNum)!;

				for (const transform of instances) {
					// Transform face triangle vertices
					const tv = data.triVerts;
					for (let vi = 0; vi < tv.length; vi += 2) {
						const [wx, wy] = transformXY(transform, tv[vi], tv[vi + 1], scale);
						faceArr.push(wx, wy);
						if (wx < bounds.minX) bounds.minX = wx;
						if (wx > bounds.maxX) bounds.maxX = wx;
						if (wy < bounds.minY) bounds.minY = wy;
						if (wy > bounds.maxY) bounds.maxY = wy;
					}
					totalFlatVerts += tv.length / 2;

					// Transform side wall edges
					const ep = data.edgePairs;
					for (let ei = 0; ei < ep.length; ei += 4) {
						const [wx0, wy0] = transformXY(transform, ep[ei], ep[ei + 1], scale);
						const [wx1, wy1] = transformXY(transform, ep[ei + 2], ep[ei + 3], scale);
						const dx = wx1 - wx0, dy = wy1 - wy0;
						const len = Math.sqrt(dx * dx + dy * dy);
						if (len < 1e-10) continue;
						const nx = dy / len, ny = -dx / len;
						// 2 triangles, 6 vertices, each [x, y, zFlag, nx, ny]
						sideArr.push(
							wx0, wy0, 0, nx, ny,
							wx1, wy1, 0, nx, ny,
							wx1, wy1, 1, nx, ny,
							wx0, wy0, 0, nx, ny,
							wx1, wy1, 1, nx, ny,
							wx0, wy0, 1, nx, ny,
						);
					}
				}
			}
		}

		const t4 = performance.now();

		// Step 3: Pack into Float32Arrays for transfer
		const layerVertsOut: Record<number, Float32Array> = {};
		const layerSidesOut: Record<number, Float32Array> = {};
		const layerBoundsOut: Record<number, [number, number, number, number]> = {};
		const transferables: ArrayBuffer[] = [];
		const gdsLayers: number[] = [];

		for (const [layerNum, verts] of layerFaceVerts) {
			if (verts.length === 0) continue;
			const buf = new Float32Array(verts);
			layerVertsOut[layerNum] = buf;
			transferables.push(buf.buffer);
			gdsLayers.push(layerNum);
		}
		for (const [layerNum, verts] of layerSideVerts) {
			if (verts.length === 0) continue;
			const buf = new Float32Array(verts);
			layerSidesOut[layerNum] = buf;
			transferables.push(buf.buffer);
		}
		for (const [layerNum, b] of layerBounds) {
			layerBoundsOut[layerNum] = [b.minX, b.minY, b.maxX, b.maxY];
		}

		console.log(`GDS Worker: parse ${(t1 - t0) | 0}ms, hierarchy ${(t2 - t1) | 0}ms, triangulate ${(t3 - t2) | 0}ms, flatten ${(t4 - t3) | 0}ms`);
		console.log(`  ${cellLayerData.size} unique cells, ${totalInstances.toLocaleString()} instances`);
		console.log(`  ${totalUniqueTriVerts.toLocaleString()} unique tri verts → ${totalFlatVerts.toLocaleString()} flattened`);
		console.log(`  ${gdsLayers.length} layers, ${Object.values(layerVertsOut).reduce((s, b) => s + b.byteLength, 0) / 1e6 | 0}MB face data`);

		self.postMessage({
			type: 'done',
			layerVerts: layerVertsOut,
			layerSides: layerSidesOut,
			layerBounds: layerBoundsOut,
			gdsLayers,
			polygonCount: totalFlatVerts,
		}, transferables);
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
