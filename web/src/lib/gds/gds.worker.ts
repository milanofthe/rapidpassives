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

		const t1 = performance.now();

		// Hierarchy diagnostics — estimate flattened polygon count before committing
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

		// Estimate: walk the hierarchy to count expected flattened polygons
		const referenced = new Set<string>();
		for (const cell of data.cells) {
			for (const sr of cell.srefs) referenced.add(sr.sname);
			for (const ar of cell.arefs) referenced.add(ar.sname);
		}
		const cellMap = new Map(data.cells.map(c => [c.name, c]));
		const topCells = data.cells.filter(c => !referenced.has(c.name));
		const topCell = topCells.length > 0 ? topCells[topCells.length - 1] : data.cells[data.cells.length - 1];

		let estimatedFlat = 0;
		if (topCell) {
			const cache = new Map<string, number>();
			function estimateCell(name: string): number {
				if (cache.has(name)) return cache.get(name)!;
				const cell = cellMap.get(name);
				if (!cell) return 0;
				let count = cellPolyCount.get(name) || 0;
				for (const sr of cell.srefs) count += estimateCell(sr.sname);
				for (const ar of cell.arefs) count += estimateCell(ar.sname) * ar.columns * ar.rows;
				cache.set(name, count);
				return count;
			}
			estimatedFlat = estimateCell(topCell.name);
		}

		console.log(`GDS Hierarchy:`);
		console.log(`  Cells: ${data.cells.length}`);
		console.log(`  Top cell: ${topCell?.name ?? '?'}`);
		console.log(`  Unique polygons (in cells): ${uniquePolys.toLocaleString()}`);
		console.log(`  SREFs: ${totalSrefs.toLocaleString()}`);
		console.log(`  AREF instances: ${totalArefInstances.toLocaleString()}`);
		console.log(`  Estimated flattened polygons: ${estimatedFlat.toLocaleString()}`);
		console.log(`  Expansion ratio: ${uniquePolys > 0 ? (estimatedFlat / uniquePolys).toFixed(1) : '?'}x`);

		// Top 10 cells by polygon count
		const sortedCells = [...cellPolyCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
		if (sortedCells.length > 0) {
			console.log(`  Largest cells:`);
			for (const [name, count] of sortedCells) {
				console.log(`    ${name}: ${count.toLocaleString()} polys`);
			}
		}

		self.postMessage({ type: 'progress', phase: 'flattening' });
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
