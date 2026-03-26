/**
 * GDS parsing Web Worker.
 * Always uses instanced pipeline: parse → hierarchy → triangulate unique cells.
 */
import { readGds, buildInstancedScene } from '$lib/gds/reader';
import { triangulatePolygons } from '$lib/gds/triangulate';

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
				// Pack polygon edges for side wall generation
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
		console.log(`GDS Worker: parse ${(t1 - t0) | 0}ms, hierarchy ${(t2 - t1) | 0}ms, triangulate ${(t3 - t2) | 0}ms`);
		console.log(`  ${Object.keys(cellMeshes).length} unique cells, ${totalInstances.toLocaleString()} instances, ${totalTriVerts.toLocaleString()} tri verts`);

		self.postMessage({
			type: 'done',
			cellMeshes,
			cellEdges,
			cellInstances,
			polygonCount: totalTriVerts / 2,
		}, transferables);
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err.message });
	}
};
