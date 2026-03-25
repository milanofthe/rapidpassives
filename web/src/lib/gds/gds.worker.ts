/**
 * GDS parsing Web Worker.
 * Uses Rust WASM module for the full pipeline (parse → hierarchy → triangulate).
 * Falls back to JavaScript implementation if WASM fails to load.
 */

// ─── WASM path ───────────────────────────────────────────────────────

let wasmModule: any = null;
let wasmFailed = false;

async function initWasm(): Promise<boolean> {
	if (wasmModule) return true;
	if (wasmFailed) return false;
	try {
		const mod = await import('../../../../wasm/pkg/gds_wasm.js');
		// Pass the .wasm URL explicitly — needed in worker context
		const wasmUrl = new URL('../../../../wasm/pkg/gds_wasm_bg.wasm', import.meta.url);
		await mod.default(wasmUrl);
		wasmModule = mod;
		return true;
	} catch (e) {
		console.warn('WASM GDS module failed to load, using JS fallback:', e);
		wasmFailed = true;
		return false;
	}
}

function processWithWasm(bytes: Uint8Array): {
	cellMeshes: Record<string, Record<number, Float32Array>>;
	cellEdges: Record<string, Record<number, Float32Array>>;
	cellInstances: Record<string, Float32Array>;
	polygonCount: number;
} {
	const raw = wasmModule!.process_gds(bytes);
	console.log('WASM raw keys:', Object.keys(raw), 'polygonCount:', raw.polygonCount);
	const meshKeys = Object.keys(raw.cellMeshes || {});
	console.log('WASM cellMeshes count:', meshKeys.length);
	if (meshKeys.length > 0) {
		const firstCell = raw.cellMeshes[meshKeys[0]];
		console.log('WASM first cell layers:', Object.keys(firstCell || {}));
		const layerKeys = Object.keys(firstCell || {});
		if (layerKeys.length > 0) {
			const firstArr = firstCell[layerKeys[0]];
			console.log('WASM first layer data type:', typeof firstArr, 'isArray:', Array.isArray(firstArr), 'length:', firstArr?.length, 'first 4:', firstArr?.slice?.(0, 4));
		}
	}

	const cellMeshes: Record<string, Record<number, Float32Array>> = {};
	const cellEdges: Record<string, Record<number, Float32Array>> = {};
	const cellInstances: Record<string, Float32Array> = {};
	let polygonCount = 0;

	if (raw.cellMeshes) {
		for (const [cellName, layers] of Object.entries(raw.cellMeshes as Record<string, Record<string, number[]>>)) {
			cellMeshes[cellName] = {};
			for (const [layer, arr] of Object.entries(layers)) {
				const buf = new Float32Array(arr);
				cellMeshes[cellName][Number(layer)] = buf;
				polygonCount += buf.length / 2;
			}
		}
	}
	if (raw.cellEdges) {
		for (const [cellName, layers] of Object.entries(raw.cellEdges as Record<string, Record<string, number[]>>)) {
			cellEdges[cellName] = {};
			for (const [layer, arr] of Object.entries(layers)) {
				cellEdges[cellName][Number(layer)] = new Float32Array(arr);
			}
		}
	}
	if (raw.cellInstances) {
		for (const [cellName, arr] of Object.entries(raw.cellInstances as Record<string, number[]>)) {
			cellInstances[cellName] = new Float32Array(arr);
		}
	}

	console.log('WASM processed: meshes', Object.keys(cellMeshes).length, 'instances', Object.keys(cellInstances).length, 'polygonCount', polygonCount);
	return { cellMeshes, cellEdges, cellInstances, polygonCount: raw.polygonCount ?? polygonCount };
}

// ─── JS fallback path ────────────────────────────────────────────────

import earcut from 'earcut';
import { readGds, buildInstancedScene } from '$lib/gds/reader';
import type { Polygon } from '$lib/geometry/types';

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

function isRect(x: number[], y: number[]): boolean {
	if (x.length !== 4) return false;
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		const dx = x[j] - x[i], dy = y[j] - y[i];
		if (Math.abs(dx) > 1e-10 && Math.abs(dy) > 1e-10) return false;
	}
	return true;
}

function triangulatePolygons(polys: Polygon[], scale: number): Float32Array {
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

function processWithJS(bytes: Uint8Array) {
	self.postMessage({ type: 'progress', phase: 'parsing' });
	const t0 = performance.now();
	const data = readGds(bytes);
	const t1 = performance.now();

	self.postMessage({ type: 'progress', phase: 'building hierarchy' });
	const scene = buildInstancedScene(data);
	const t2 = performance.now();

	self.postMessage({ type: 'progress', phase: 'triangulating' });

	const cellMeshes: Record<string, Record<number, Float32Array>> = {};
	const cellEdges: Record<string, Record<number, Float32Array>> = {};
	const cellInstances: Record<string, Float32Array> = {};
	const transferables: ArrayBuffer[] = [];
	let totalTriVerts = 0;

	for (const [cellName, cellData] of scene.cells) {
		const instances = scene.instances.get(cellName);
		if (!instances || instances.length === 0) continue;

		const meshes: Record<number, Float32Array> = {};
		const edges: Record<number, Float32Array> = {};
		for (const [layerNum, polys] of cellData.polygons) {
			const buf = triangulatePolygons(polys, scene.userUnit);
			if (buf.length > 0) {
				meshes[layerNum] = buf;
				transferables.push(buf.buffer);
				totalTriVerts += buf.length / 2;
			}
			const edgeVerts: number[] = [];
			for (const poly of polys) {
				const n = poly.x.length;
				if (n < 3) continue;
				for (let i = 0; i < n; i++) {
					const j = (i + 1) % n;
					edgeVerts.push(
						poly.x[i] * scene.userUnit, poly.y[i] * scene.userUnit,
						poly.x[j] * scene.userUnit, poly.y[j] * scene.userUnit,
					);
				}
			}
			if (edgeVerts.length > 0) {
				const ebuf = new Float32Array(edgeVerts);
				edges[layerNum] = ebuf;
				transferables.push(ebuf.buffer);
			}
		}

		if (Object.keys(meshes).length > 0) {
			cellMeshes[cellName] = meshes;
			cellEdges[cellName] = edges;
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
			cellInstances[cellName] = packed;
			transferables.push(packed.buffer);
		}
	}

	const t3 = performance.now();
	const totalInstances = Object.values(cellInstances).reduce((s, v) => s + v.length / 6, 0);
	console.log(`GDS JS fallback: parse ${(t1 - t0) | 0}ms, hierarchy ${(t2 - t1) | 0}ms, triangulate ${(t3 - t2) | 0}ms`);
	console.log(`  ${Object.keys(cellMeshes).length} unique cells, ${totalInstances.toLocaleString()} instances, ${totalTriVerts.toLocaleString()} tri verts`);

	self.postMessage({
		type: 'done',
		cellMeshes,
		cellEdges,
		cellInstances,
		polygonCount: totalTriVerts / 2,
	}, transferables);
}

// ─── Message handler ─────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
	try {
		const bytes = new Uint8Array(e.data.buffer);
		const useWasm = await initWasm();

		if (useWasm) {
			self.postMessage({ type: 'progress', phase: 'processing (WASM)' });
			const t0 = performance.now();
			let result;
			try {
				result = processWithWasm(bytes);
			} catch (wasmErr: any) {
				console.error('WASM processing failed, falling back to JS:', wasmErr);
				processWithJS(bytes);
				return;
			}
			const t1 = performance.now();
			console.log(`GDS WASM: ${(t1 - t0) | 0}ms → ${result.polygonCount.toLocaleString()} polygon verts`);

			const transferables: ArrayBuffer[] = [];
			for (const layers of Object.values(result.cellMeshes))
				for (const buf of Object.values(layers)) transferables.push(buf.buffer);
			for (const layers of Object.values(result.cellEdges))
				for (const buf of Object.values(layers)) transferables.push(buf.buffer);
			for (const buf of Object.values(result.cellInstances))
				transferables.push(buf.buffer);

			self.postMessage({
				type: 'done',
				cellMeshes: result.cellMeshes,
				cellEdges: result.cellEdges,
				cellInstances: result.cellInstances,
				polygonCount: result.polygonCount,
			}, transferables);
		} else {
			processWithJS(bytes);
		}
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
