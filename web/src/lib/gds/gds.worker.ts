/**
 * GDS parsing Web Worker.
 * Full pipeline: parse → flatten → scale → merge, all off the main thread.
 */
import { readGds, flattenGds, scalePolygons } from '$lib/gds/reader';
import type { Polygon } from '$lib/geometry/types';

self.onmessage = (e: MessageEvent) => {
	try {
		const bytes = new Uint8Array(e.data.buffer);

		self.postMessage({ type: 'progress', phase: 'parsing' });
		const t0 = performance.now();
		const data = readGds(bytes);

		self.postMessage({ type: 'progress', phase: 'flattening' });
		const t1 = performance.now();
		const flat = flattenGds(data);

		self.postMessage({ type: 'progress', phase: 'scaling' });
		const t2 = performance.now();
		const scaled = scalePolygons(flat, data.units.userUnit);

		const t3 = performance.now();

		const layers: Record<number, Polygon[]> = {};
		let totalPolys = 0;
		for (const [layerNum, polys] of scaled) {
			layers[layerNum] = polys;
			totalPolys += polys.length;
		}

		console.log(`GDS Worker: parse ${(t1-t0)|0}ms, flatten ${(t2-t1)|0}ms, scale ${(t3-t2)|0}ms → ${totalPolys} polys`);
		self.postMessage({ type: 'done', layers, polygonCount: totalPolys });
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
