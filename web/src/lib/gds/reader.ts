import { RecordType, type GDSRecord } from 'gdsii';
import type { Polygon } from '$lib/geometry/types';

/** Decode a GDSII 8-byte real (excess-64 exponent, base-16) */
function parseReal8(dv: DataView, offset: number): number {
	if (dv.getUint32(offset) === 0) return 0;
	const sign = dv.getUint8(offset) & 0x80 ? -1 : 1;
	const exponent = (dv.getUint8(offset) & 0x7f) - 64;
	let base = 0;
	for (let i = 1; i < 7; i++) {
		const byte = dv.getUint8(offset + i);
		for (let bit = 0; bit < 8; bit++) {
			if (byte & (1 << (7 - bit))) {
				base += Math.pow(2, 7 - bit - i * 8);
			}
		}
	}
	return base * sign * Math.pow(16, exponent);
}

/**
 * Robust GDS record reader that handles:
 * - Trailing null bytes after ENDLIB (sector padding)
 * - Deprecated/unknown record types (BGNEXTN, ENDEXTN, etc.) — skipped
 */
function collectRecords(bytes: Uint8Array): GDSRecord[] {
	const records: GDSRecord[] = [];
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;

	while (offset + 4 <= bytes.length) {
		const len = dv.getUint16(offset, false);
		const tag = dv.getUint16(offset + 2, false);

		// Stop on zero-length record (trailing padding)
		if (len === 0) break;
		if (len < 4 || len % 2 !== 0) break;
		if (offset + len > bytes.length) break;

		const dataOffset = offset + 4;
		const dataLen = len - 4;

		const parsed = parseRecord(tag, dv, dataOffset, dataLen);
		if (parsed !== null) {
			records.push(parsed);
			if (tag === RecordType.ENDLIB) break;
		}
		// Unknown records are silently skipped

		offset += len;
	}

	return records;
}

const textDecoder = new TextDecoder();

function parseRecord(tag: number, dv: DataView, offset: number, len: number): GDSRecord | null {
	switch (tag) {
		case RecordType.HEADER:
			return { tag, data: { version: dv.getInt16(offset, false) } } as GDSRecord;
		case RecordType.BGNLIB:
		case RecordType.BGNSTR:
			return { tag, data: { modTime: parseDate(dv, offset), accessTime: parseDate(dv, offset + 12) } } as GDSRecord;
		case RecordType.LIBNAME:
		case RecordType.STRNAME:
		case RecordType.SNAME:
		case RecordType.STRING:
		case RecordType.REFLIBS:
		case RecordType.FONTS:
		case RecordType.ATTRTABLE:
		case RecordType.PROPVALUE:
		case RecordType.SRFNAME:
			return { tag, data: parseString(dv, offset, len) } as GDSRecord;
		case RecordType.UNITS:
			return { tag, data: { userUnit: parseReal8(dv, offset), metersPerUnit: parseReal8(dv, offset + 8) } } as GDSRecord;
		case RecordType.ENDLIB:
		case RecordType.ENDSTR:
		case RecordType.BOUNDARY:
		case RecordType.PATH:
		case RecordType.SREF:
		case RecordType.AREF:
		case RecordType.TEXT:
		case RecordType.ENDEL:
		case RecordType.TEXTNODE:
		case RecordType.NODE:
		case RecordType.BOX:
			return { tag, data: null } as GDSRecord;
		case RecordType.LAYER:
		case RecordType.DATATYPE:
		case RecordType.TEXTTYPE:
		case RecordType.PRESENTATION:
		case RecordType.STRANS:
		case RecordType.PATHTYPE:
		case RecordType.GENERATIONS:
		case RecordType.ELFLAGS:
		case RecordType.NODETYPE:
		case RecordType.PROPATTR:
		case RecordType.BOXTYPE:
		case RecordType.STRCLASS:
			return { tag, data: dv.getInt16(offset, false) } as GDSRecord;
		case RecordType.WIDTH:
		case RecordType.PLEX:
			return { tag, data: dv.getInt32(offset, false) } as GDSRecord;
		case RecordType.XY: {
			const xy: [number, number][] = [];
			for (let i = 0; i < len; i += 8) {
				xy.push([dv.getInt32(offset + i, false), dv.getInt32(offset + i + 4, false)]);
			}
			return { tag, data: xy } as GDSRecord;
		}
		case RecordType.COLROW:
			return { tag, data: { columns: dv.getUint16(offset, false), rows: dv.getUint16(offset + 2, false) } } as GDSRecord;
		case RecordType.MAG:
		case RecordType.ANGLE:
			return { tag, data: parseReal8(dv, offset) } as GDSRecord;
		default:
			// Skip unknown/deprecated records (BGNEXTN, ENDEXTN, FORMAT, MASK, etc.)
			return null;
	}
}

function parseDate(dv: DataView, offset: number): Date {
	const year = dv.getUint16(offset, false);
	return new Date(Date.UTC(
		year < 1900 ? year + 1900 : year,
		dv.getUint16(offset + 2, false) - 1,
		dv.getUint16(offset + 4, false),
		dv.getUint16(offset + 6, false),
		dv.getUint16(offset + 8, false),
		dv.getUint16(offset + 10, false),
	));
}

function parseString(dv: DataView, offset: number, len: number): string {
	if (len > 0 && dv.getUint8(offset + len - 1) === 0) len--;
	return textDecoder.decode(new Uint8Array(dv.buffer, dv.byteOffset + offset, len));
}

/** Raw parsed GDS data: polygons grouped by GDS layer number */
export interface GdsData {
	cells: GdsCell[];
	units: { userUnit: number; metersPerUnit: number };
}

export interface GdsCell {
	name: string;
	polygons: Map<number, Polygon[]>;
	srefs: GdsSRef[];
	arefs: GdsARef[];
}

interface GdsSRef {
	sname: string;
	xy: [number, number];
	strans: number;
	mag: number;
	angle: number;
}

interface GdsARef {
	sname: string;
	xy: [number, number][];
	columns: number;
	rows: number;
	strans: number;
	mag: number;
	angle: number;
}

/** Parse a GDS binary file into structured cell data */
export function readGds(bytes: Uint8Array): GdsData {
	const records = collectRecords(bytes);

	let units = { userUnit: 1e-3, metersPerUnit: 1e-9 };
	const cells: GdsCell[] = [];
	let currentCell: GdsCell | null = null;

	// Element parsing state
	let elementType: 'boundary' | 'path' | 'sref' | 'aref' | 'box' | null = null;
	let layer = 0;
	let xy: [number, number][] = [];
	let width = 0;
	let pathtype = 0;
	let sname = '';
	let strans = 0;
	let mag = 1;
	let angle = 0;
	let columns = 0;
	let rows = 0;

	function resetElement() {
		elementType = null;
		layer = 0;
		xy = [];
		width = 0;
		pathtype = 0;
		sname = '';
		strans = 0;
		mag = 1;
		angle = 0;
		columns = 0;
		rows = 0;
	}

	for (const rec of records) {
		switch (rec.tag) {
			case RecordType.UNITS:
				units = rec.data as { userUnit: number; metersPerUnit: number };
				break;

			case RecordType.BGNSTR:
				currentCell = { name: '', polygons: new Map(), srefs: [], arefs: [] };
				break;

			case RecordType.STRNAME:
				if (currentCell) currentCell.name = rec.data as string;
				break;

			case RecordType.ENDSTR:
				if (currentCell) cells.push(currentCell);
				currentCell = null;
				break;

			case RecordType.BOUNDARY:
				resetElement();
				elementType = 'boundary';
				break;

			case RecordType.PATH:
				resetElement();
				elementType = 'path';
				break;

			case RecordType.BOX:
				resetElement();
				elementType = 'box';
				break;

			case RecordType.SREF:
				resetElement();
				elementType = 'sref';
				break;

			case RecordType.AREF:
				resetElement();
				elementType = 'aref';
				break;

			case RecordType.LAYER:
				layer = rec.data as number;
				break;

			case RecordType.XY:
				xy = rec.data as [number, number][];
				break;

			case RecordType.WIDTH:
				width = rec.data as number;
				break;

			case RecordType.PATHTYPE:
				pathtype = rec.data as number;
				break;

			case RecordType.SNAME:
				sname = rec.data as string;
				break;

			case RecordType.STRANS:
				strans = rec.data as number;
				break;

			case RecordType.MAG:
				mag = rec.data as number;
				break;

			case RecordType.ANGLE:
				angle = rec.data as number;
				break;

			case RecordType.COLROW: {
				const cr = rec.data as { columns: number; rows: number };
				columns = cr.columns;
				rows = cr.rows;
				break;
			}

			case RecordType.ENDEL:
				if (!currentCell) break;

				if (elementType === 'boundary' || elementType === 'box') {
					const poly = xyToPolygon(xy);
					if (poly) addPolygon(currentCell.polygons, layer, poly);
				} else if (elementType === 'path') {
					const polys = pathToPolygons(xy, width, pathtype);
					for (const p of polys) addPolygon(currentCell.polygons, layer, p);
				} else if (elementType === 'sref') {
					currentCell.srefs.push({
						sname,
						xy: xy[0] || [0, 0],
						strans, mag, angle,
					});
				} else if (elementType === 'aref') {
					currentCell.arefs.push({
						sname,
						xy,
						columns, rows,
						strans, mag, angle,
					});
				}

				resetElement();
				break;
		}
	}

	return { cells, units };
}

/** Flatten all cell references and return polygons per GDS layer for the top cell */
export function flattenGds(data: GdsData): Map<number, Polygon[]> {
	const cellMap = new Map<string, GdsCell>();
	for (const cell of data.cells) cellMap.set(cell.name, cell);

	// Top cell is typically the last one, or the one not referenced by others
	const referenced = new Set<string>();
	for (const cell of data.cells) {
		for (const sr of cell.srefs) referenced.add(sr.sname);
		for (const ar of cell.arefs) referenced.add(ar.sname);
	}
	const topCells = data.cells.filter(c => !referenced.has(c.name));
	const topCell = topCells.length > 0 ? topCells[topCells.length - 1] : data.cells[data.cells.length - 1];

	if (!topCell) return new Map();

	const result = new Map<number, Polygon[]>();
	const visited = new Set<string>();

	function flattenCell(cell: GdsCell, ox: number, oy: number, sMag: number, sAngle: number, reflect: boolean) {
		// Add this cell's polygons with transform
		for (const [layerNum, polys] of cell.polygons) {
			for (const poly of polys) {
				const transformed = transformPolygon(poly, ox, oy, sMag, sAngle, reflect);
				addPolygon(result, layerNum, transformed);
			}
		}

		// Flatten SREFs
		for (const sr of cell.srefs) {
			const child = cellMap.get(sr.sname);
			if (!child) continue;
			// Prevent infinite recursion
			const key = `${sr.sname}@${ox + sr.xy[0]},${oy + sr.xy[1]}`;
			if (visited.has(key)) continue;
			visited.add(key);

			const childReflect = reflect !== !!(sr.strans & 0x8000);
			const childAngle = sAngle + sr.angle;
			const childMag = sMag * sr.mag;
			const [cx, cy] = applyTransform(sr.xy[0], sr.xy[1], ox, oy, sMag, sAngle, reflect);
			flattenCell(child, cx, cy, childMag, childAngle, childReflect);

			visited.delete(key);
		}

		// Flatten AREFs
		for (const ar of cell.arefs) {
			const child = cellMap.get(ar.sname);
			if (!child) continue;
			if (ar.xy.length < 3) continue;

			const [refX, refY] = ar.xy[0];
			const colDx = (ar.xy[1][0] - refX) / ar.columns;
			const colDy = (ar.xy[1][1] - refY) / ar.columns;
			const rowDx = (ar.xy[2][0] - refX) / ar.rows;
			const rowDy = (ar.xy[2][1] - refY) / ar.rows;

			const childReflect = reflect !== !!(ar.strans & 0x8000);
			const childAngle = sAngle + ar.angle;
			const childMag = sMag * ar.mag;

			for (let col = 0; col < ar.columns; col++) {
				for (let row = 0; row < ar.rows; row++) {
					const ex = refX + col * colDx + row * rowDx;
					const ey = refY + col * colDy + row * rowDy;
					const [cx, cy] = applyTransform(ex, ey, ox, oy, sMag, sAngle, reflect);
					flattenCell(child, cx, cy, childMag, childAngle, childReflect);
				}
			}
		}
	}

	flattenCell(topCell, 0, 0, 1, 0, false);
	return result;
}

/**
 * A 2D affine transform: [a, b, c, d, tx, ty]
 * Maps (x,y) → (a*x + b*y + tx, c*x + d*y + ty)
 */
export type Affine2D = [number, number, number, number, number, number];

/** Scene with instanced cell data — avoids flattening millions of polygons */
export interface InstancedScene {
	/** Cells that have their own polygons, keyed by cell name */
	cells: Map<string, { polygons: Map<number, Polygon[]> }>;
	/** For each cell name, list of global transforms at which to draw it */
	instances: Map<string, Affine2D[]>;
	/** Units for scaling */
	userUnit: number;
}

function affineIdentity(): Affine2D { return [1, 0, 0, 1, 0, 0]; }

function affineCompose(parent: Affine2D, ox: number, oy: number, mag: number, angleDeg: number, reflect: boolean): Affine2D {
	const rad = angleDeg * Math.PI / 180;
	const cosA = Math.cos(rad) * mag;
	const sinA = Math.sin(rad) * mag;
	// Child local transform
	let a = cosA, b = -sinA, c = sinA, d = cosA;
	if (reflect) { b = sinA; d = -cosA; } // reflect Y before rotate
	// Compose with parent: P * (R * v + t)
	const [pa, pb, pc, pd, ptx, pty] = parent;
	return [
		pa * a + pb * c,
		pa * b + pb * d,
		pc * a + pd * c,
		pc * b + pd * d,
		pa * ox + pb * oy + ptx,
		pc * ox + pd * oy + pty,
	];
}

/** Build an instanced scene from parsed GDS data without flattening polygons */
export function buildInstancedScene(data: GdsData): InstancedScene {
	const cellMap = new Map<string, GdsCell>();
	for (const cell of data.cells) cellMap.set(cell.name, cell);

	const referenced = new Set<string>();
	for (const cell of data.cells) {
		for (const sr of cell.srefs) referenced.add(sr.sname);
		for (const ar of cell.arefs) referenced.add(ar.sname);
	}
	const topCells = data.cells.filter(c => !referenced.has(c.name));
	const topCell = topCells.length > 0 ? topCells[topCells.length - 1] : data.cells[data.cells.length - 1];

	const cells = new Map<string, { polygons: Map<number, Polygon[]> }>();
	const instances = new Map<string, Affine2D[]>();

	// Register all cells that have polygons
	for (const cell of data.cells) {
		if (cell.polygons.size > 0) {
			cells.set(cell.name, { polygons: cell.polygons });
			instances.set(cell.name, []);
		}
	}

	if (!topCell) return { cells, instances, userUnit: data.units.userUnit };

	// Walk hierarchy, collecting composed transforms
	const visited = new Set<string>();

	function walk(cell: GdsCell, transform: Affine2D) {
		// Record this transform for the cell's own polygons
		if (cell.polygons.size > 0) {
			instances.get(cell.name)!.push(transform);
		}

		// SREFs
		for (const sr of cell.srefs) {
			const child = cellMap.get(sr.sname);
			if (!child) continue;
			const key = `${sr.sname}@${transform[4] + sr.xy[0]},${transform[5] + sr.xy[1]}`;
			if (visited.has(key)) continue;
			visited.add(key);

			const childReflect = !!(sr.strans & 0x8000);
			const childTransform = affineCompose(transform, sr.xy[0], sr.xy[1], sr.mag, sr.angle, childReflect);
			walk(child, childTransform);

			visited.delete(key);
		}

		// AREFs
		for (const ar of cell.arefs) {
			const child = cellMap.get(ar.sname);
			if (!child || ar.xy.length < 3) continue;

			const [refX, refY] = ar.xy[0];
			const colDx = (ar.xy[1][0] - refX) / ar.columns;
			const colDy = (ar.xy[1][1] - refY) / ar.columns;
			const rowDx = (ar.xy[2][0] - refX) / ar.rows;
			const rowDy = (ar.xy[2][1] - refY) / ar.rows;
			const childReflect = !!(ar.strans & 0x8000);

			for (let col = 0; col < ar.columns; col++) {
				for (let row = 0; row < ar.rows; row++) {
					const ex = refX + col * colDx + row * rowDx;
					const ey = refY + col * colDy + row * rowDy;
					const childTransform = affineCompose(transform, ex, ey, ar.mag, ar.angle, childReflect);
					walk(child, childTransform);
				}
			}
		}
	}

	walk(topCell, affineIdentity());

	return { cells, instances, userUnit: data.units.userUnit };
}

/** Convert InstancedScene (Maps) to InstancedSceneData (Records of Float32Arrays).
 *  Triangulates polygons and packs instance transforms. */
export function sceneToInstancedData(scene: InstancedScene): {
	cellMeshes: Record<string, Record<number, Float32Array>>;
	cellEdges: Record<string, Record<number, Float32Array>>;
	cellInstances: Record<string, Float32Array>;
	polygonCount: number;
} {
	const cellMeshes: Record<string, Record<number, Float32Array>> = {};
	const cellEdges: Record<string, Record<number, Float32Array>> = {};
	const cellInstances: Record<string, Float32Array> = {};
	let polygonCount = 0;

	for (const [cellName, cellData] of scene.cells) {
		const instances = scene.instances.get(cellName);
		if (!instances || instances.length === 0) continue;

		const meshes: Record<number, Float32Array> = {};
		const edges: Record<number, Float32Array> = {};
		for (const [layerNum, polys] of cellData.polygons) {
			polygonCount += polys.length * instances.length;
			// Triangulate
			const triVerts: number[] = [];
			for (const poly of polys) {
				if (poly.x.length < 3) continue;
				const n = poly.x.length;
				// Simple fan triangulation for convex, earcut for complex
				for (let i = 1; i < n - 1; i++) {
					triVerts.push(
						poly.x[0] * scene.userUnit, poly.y[0] * scene.userUnit,
						poly.x[i] * scene.userUnit, poly.y[i] * scene.userUnit,
						poly.x[i + 1] * scene.userUnit, poly.y[i + 1] * scene.userUnit,
					);
				}
			}
			if (triVerts.length > 0) meshes[layerNum] = new Float32Array(triVerts);

			// Edges
			const edgeVerts: number[] = [];
			for (const poly of polys) {
				const pn = poly.x.length;
				if (pn < 3) continue;
				for (let i = 0; i < pn; i++) {
					const j = (i + 1) % pn;
					edgeVerts.push(
						poly.x[i] * scene.userUnit, poly.y[i] * scene.userUnit,
						poly.x[j] * scene.userUnit, poly.y[j] * scene.userUnit,
					);
				}
			}
			if (edgeVerts.length > 0) edges[layerNum] = new Float32Array(edgeVerts);
		}

		if (Object.keys(meshes).length > 0) {
			cellMeshes[cellName] = meshes;
			cellEdges[cellName] = edges;
			const packed = new Float32Array(instances.length * 6);
			for (let i = 0; i < instances.length; i++) {
				const t = instances[i];
				packed[i * 6 + 0] = t[0]; packed[i * 6 + 1] = t[1];
				packed[i * 6 + 2] = t[2]; packed[i * 6 + 3] = t[3];
				packed[i * 6 + 4] = t[4] * scene.userUnit;
				packed[i * 6 + 5] = t[5] * scene.userUnit;
			}
			cellInstances[cellName] = packed;
		}
	}

	return { cellMeshes, cellEdges, cellInstances, polygonCount };
}

/** Convert GDS integer coordinates to user units (typically microns) */
export function scalePolygons(polys: Map<number, Polygon[]>, userUnit: number): Map<number, Polygon[]> {
	const result = new Map<number, Polygon[]>();
	for (const [layer, polygons] of polys) {
		result.set(layer, polygons.map(p => ({
			x: p.x.map(v => v * userUnit),
			y: p.y.map(v => v * userUnit),
		})));
	}
	return result;
}

/** Progress callback for streaming parse */
export interface GdsProgress {
	phase: string;
	polygonCount: number;
}

/** Result from worker — always instanced */
export interface GdsWorkerResult {
	cellMeshes: Record<string, Record<number, Float32Array>>;
	cellEdges: Record<string, Record<number, Float32Array>>;
	cellInstances: Record<string, Float32Array>;
	polygonCount: number;
}

/**
 * Parse a GDS file in a Web Worker using instanced rendering pipeline.
 */
export function readGdsInWorker(
	bytes: Uint8Array,
	onProgress: (p: GdsProgress) => void,
): Promise<GdsWorkerResult> {
	return new Promise((resolve, reject) => {
		let worker: Worker;
		try {
			worker = new Worker(new URL('./gds.worker.ts', import.meta.url), { type: 'module' });
		} catch (e) {
			console.error('GDS Worker creation failed:', e);
			reject(new Error('Web Worker not available'));
			return;
		}

		worker.onmessage = (e) => {
			const msg = e.data;
			if (msg.type === 'progress') {
				onProgress({ phase: msg.phase, polygonCount: msg.polygonCount ?? 0 });
			} else if (msg.type === 'done') {
				worker.terminate();
				onProgress({ phase: 'done', polygonCount: msg.polygonCount });
				resolve({
					cellMeshes: msg.cellMeshes,
					cellEdges: msg.cellEdges,
					cellInstances: msg.cellInstances,
					polygonCount: msg.polygonCount,
				});
			} else if (msg.type === 'error') {
				worker.terminate();
				reject(new Error(msg.message));
			}
		};

		worker.onerror = (e) => {
			worker.terminate();
			reject(new Error(e.message));
		};

		const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
		worker.postMessage({ buffer }, [buffer]);
	});
}

// --- Helpers ---

function xyToPolygon(xy: [number, number][]): Polygon | null {
	if (xy.length < 3) return null;
	// GDS polygons are closed (first == last), drop the closing point
	const n = xy.length;
	const closed = (xy[0][0] === xy[n - 1][0] && xy[0][1] === xy[n - 1][1]);
	const count = closed ? n - 1 : n;
	if (count < 3) return null;
	return {
		x: xy.slice(0, count).map(p => p[0]),
		y: xy.slice(0, count).map(p => p[1]),
	};
}

/** Expand a PATH element into a polygon (rectangle per segment) */
function pathToPolygons(xy: [number, number][], width: number, pathtype: number): Polygon[] {
	if (xy.length < 2 || width <= 0) return [];
	const hw = Math.abs(width) / 2;
	const polys: Polygon[] = [];

	for (let i = 0; i < xy.length - 1; i++) {
		const [x0, y0] = xy[i];
		const [x1, y1] = xy[i + 1];
		const dx = x1 - x0;
		const dy = y1 - y0;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len === 0) continue;
		// Perpendicular normal
		const nx = -dy / len * hw;
		const ny = dx / len * hw;

		// Extension for pathtype 2 (half-width extension)
		let ex = 0, ey = 0;
		if (pathtype === 2) {
			ex = dx / len * hw;
			ey = dy / len * hw;
		}

		polys.push({
			x: [x0 - nx - ex, x1 - nx + ex, x1 + nx + ex, x0 + nx - ex],
			y: [y0 - ny - ey, y1 - ny + ey, y1 + ny + ey, y0 + ny - ey],
		});
	}
	return polys;
}

function addPolygon(map: Map<number, Polygon[]>, layer: number, poly: Polygon) {
	let arr = map.get(layer);
	if (!arr) { arr = []; map.set(layer, arr); }
	arr.push(poly);
}

function transformPolygon(poly: Polygon, ox: number, oy: number, mag: number, angleDeg: number, reflect: boolean): Polygon {
	if (ox === 0 && oy === 0 && mag === 1 && angleDeg === 0 && !reflect) return poly;

	const rad = angleDeg * Math.PI / 180;
	const cosA = Math.cos(rad);
	const sinA = Math.sin(rad);
	const n = poly.x.length;
	const rx = new Array(n);
	const ry = new Array(n);

	for (let i = 0; i < n; i++) {
		let px = poly.x[i] * mag;
		let py = poly.y[i] * mag;
		if (reflect) py = -py;
		rx[i] = ox + px * cosA - py * sinA;
		ry[i] = oy + px * sinA + py * cosA;
	}
	return { x: rx, y: ry };
}

function applyTransform(x: number, y: number, ox: number, oy: number, mag: number, angleDeg: number, reflect: boolean): [number, number] {
	let px = x * mag;
	let py = y * mag;
	if (reflect) py = -py;
	const rad = angleDeg * Math.PI / 180;
	return [
		ox + px * Math.cos(rad) - py * Math.sin(rad),
		oy + px * Math.sin(rad) + py * Math.cos(rad),
	];
}
