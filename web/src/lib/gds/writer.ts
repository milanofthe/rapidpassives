import type { LayerMap, LayerName, Polygon } from '$lib/geometry/types';

/**
 * GDSII binary format writer.
 * Produces a valid GDSII Stream file from polygon data.
 *
 * Reference: GDSII Stream Format Manual (Calma/Cadence)
 */

// Record type codes
const HEADER    = 0x0002;
const BGNLIB    = 0x0102;
const LIBNAME   = 0x0206;
const UNITS     = 0x0305;
const ENDLIB    = 0x0400;
const BGNSTR    = 0x0502;
const STRNAME   = 0x0606;
const ENDSTR    = 0x0700;
const BOUNDARY  = 0x0800;
const LAYER     = 0x0D02;
const DATATYPE  = 0x0E02;
const XY        = 0x1003;
const ENDEL     = 0x1100;
const TEXT      = 0x0C00;
const TEXTTYPE  = 0x1602;
const STRING    = 0x1906;

/** Default GDS layer number mapping */
const DEFAULT_GDS_LAYERS: Record<LayerName, number> = {
	guard_ring: 11,
	windings: 1,
	crossings: 2,
	windings_m2: 6,
	crossings_m1: 7,
	windings_m4: 8,
	vias: 3,
	vias1: 3,
	vias2: 5,
	vias3: 9,
	centertap: 4,
	pgs: 10,
};

interface GdsExportOptions {
	cellName?: string;
	unit?: number;       // database unit in meters (default 1e-6 = 1um)
	precision?: number;  // database precision in meters (default 1e-9 = 1nm)
	gdsLayers?: Partial<Record<LayerName, number>>;
	labels?: Array<{ text: string; x: number; y: number; layer: number }>;
}

/** Export LayerMap to GDSII binary, returns a Uint8Array */
export function exportGds(layers: LayerMap, options: GdsExportOptions = {}): Uint8Array {
	const {
		cellName = 'INDUCTOR',
		unit = 1e-6,
		precision = 1e-9,
		gdsLayers = DEFAULT_GDS_LAYERS,
		labels = [],
	} = options;

	const scale = unit / precision; // coordinates multiplier
	const buf = new GdsBuffer();

	// Header
	buf.writeRecord(HEADER, buf.int16(600)); // version 6.0.0

	// Begin library
	const now = new Date();
	const dateWords = dateToWords(now);
	buf.writeRecord(BGNLIB, new Uint8Array([...dateWords, ...dateWords])); // mod + access date
	buf.writeRecord(LIBNAME, buf.ascii(padString('RAPIDPASSIVES')));
	buf.writeRecord(UNITS, buf.float64Pair(precision / unit, precision));

	// Begin structure
	buf.writeRecord(BGNSTR, new Uint8Array([...dateWords, ...dateWords]));
	buf.writeRecord(STRNAME, buf.ascii(padString(cellName)));

	// Write polygons per layer
	for (const [layerName, polys] of Object.entries(layers)) {
		if (!polys || polys.length === 0) continue;
		const gdsLayer = (gdsLayers as any)[layerName] ?? DEFAULT_GDS_LAYERS[layerName as LayerName];
		if (gdsLayer === undefined) continue;

		for (const poly of polys) {
			writeBoundary(buf, poly, gdsLayer, 0, scale);
		}
	}

	// Write labels
	for (const label of labels) {
		writeText(buf, label.text, label.x, label.y, label.layer, scale);
	}

	// End structure and library
	buf.writeRecord(ENDSTR, new Uint8Array(0));
	buf.writeRecord(ENDLIB, new Uint8Array(0));

	return buf.toBytes();
}

function writeBoundary(buf: GdsBuffer, poly: Polygon, layer: number, datatype: number, scale: number): void {
	if (poly.x.length < 3) return;

	buf.writeRecord(BOUNDARY, new Uint8Array(0));
	buf.writeRecord(LAYER, buf.int16(layer));
	buf.writeRecord(DATATYPE, buf.int16(datatype));

	// XY: pairs of 4-byte signed ints, polygon must be closed (first == last)
	const n = poly.x.length;
	const xyData = new DataView(new ArrayBuffer((n + 1) * 8));
	for (let i = 0; i < n; i++) {
		xyData.setInt32(i * 8, Math.round(poly.x[i] * scale));
		xyData.setInt32(i * 8 + 4, Math.round(poly.y[i] * scale));
	}
	// Close polygon
	xyData.setInt32(n * 8, Math.round(poly.x[0] * scale));
	xyData.setInt32(n * 8 + 4, Math.round(poly.y[0] * scale));
	buf.writeRecord(XY, new Uint8Array(xyData.buffer));

	buf.writeRecord(ENDEL, new Uint8Array(0));
}

function writeText(buf: GdsBuffer, text: string, x: number, y: number, layer: number, scale: number): void {
	buf.writeRecord(TEXT, new Uint8Array(0));
	buf.writeRecord(LAYER, buf.int16(layer));
	buf.writeRecord(TEXTTYPE, buf.int16(0));

	const xyData = new DataView(new ArrayBuffer(8));
	xyData.setInt32(0, Math.round(x * scale));
	xyData.setInt32(4, Math.round(y * scale));
	buf.writeRecord(XY, new Uint8Array(xyData.buffer));

	buf.writeRecord(STRING, buf.ascii(padString(text)));
	buf.writeRecord(ENDEL, new Uint8Array(0));
}

/** Growing byte buffer for GDSII records */
class GdsBuffer {
	private chunks: Uint8Array[] = [];

	writeRecord(recordType: number, data: Uint8Array): void {
		const len = 4 + data.length;
		const header = new DataView(new ArrayBuffer(4));
		header.setUint16(0, len);
		header.setUint16(2, recordType);
		this.chunks.push(new Uint8Array(header.buffer));
		if (data.length > 0) this.chunks.push(data);
	}

	int16(value: number): Uint8Array {
		const dv = new DataView(new ArrayBuffer(2));
		dv.setInt16(0, value);
		return new Uint8Array(dv.buffer);
	}

	ascii(str: string): Uint8Array {
		const bytes = new Uint8Array(str.length);
		for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0x7f;
		return bytes;
	}

	float64Pair(a: number, b: number): Uint8Array {
		const buf = new ArrayBuffer(16);
		writeGdsReal(new DataView(buf), 0, a);
		writeGdsReal(new DataView(buf), 8, b);
		return new Uint8Array(buf);
	}

	toBytes(): Uint8Array {
		let totalLen = 0;
		for (const c of this.chunks) totalLen += c.length;
		const result = new Uint8Array(totalLen);
		let offset = 0;
		for (const c of this.chunks) {
			result.set(c, offset);
			offset += c.length;
		}
		return result;
	}
}

/**
 * Write a GDSII 8-byte real (excess-64 exponent, 56-bit mantissa).
 * This is NOT IEEE 754 — it's IBM/GDSII format.
 */
function writeGdsReal(dv: DataView, offset: number, value: number): void {
	if (value === 0) {
		for (let i = 0; i < 8; i++) dv.setUint8(offset + i, 0);
		return;
	}

	const sign = value < 0 ? 0x80 : 0;
	let v = Math.abs(value);

	// Normalize to 1/16 <= mantissa < 1, exponent in base-16
	let exp = 0;
	if (v >= 1) {
		while (v >= 1) { v /= 16; exp++; }
	} else {
		while (v < 1 / 16) { v *= 16; exp--; }
	}

	// Mantissa as 56-bit integer
	const mantissa = v * Math.pow(2, 56);
	const mHigh = Math.floor(mantissa / 0x100000000);
	const mLow = Math.floor(mantissa % 0x100000000);

	dv.setUint8(offset, sign | ((exp + 64) & 0x7f));
	dv.setUint8(offset + 1, (mHigh >>> 16) & 0xff);
	dv.setUint8(offset + 2, (mHigh >>> 8) & 0xff);
	dv.setUint8(offset + 3, mHigh & 0xff);
	dv.setUint8(offset + 4, (mLow >>> 24) & 0xff);
	dv.setUint8(offset + 5, (mLow >>> 16) & 0xff);
	dv.setUint8(offset + 6, (mLow >>> 8) & 0xff);
	dv.setUint8(offset + 7, mLow & 0xff);
}

function dateToWords(d: Date): Uint8Array {
	const buf = new DataView(new ArrayBuffer(12));
	buf.setInt16(0, d.getFullYear());
	buf.setInt16(2, d.getMonth() + 1);
	buf.setInt16(4, d.getDate());
	buf.setInt16(6, d.getHours());
	buf.setInt16(8, d.getMinutes());
	buf.setInt16(10, d.getSeconds());
	return new Uint8Array(buf.buffer);
}

/** Pad string to even length (GDSII requirement) */
function padString(s: string): string {
	return s.length % 2 === 0 ? s : s + '\0';
}

/** Trigger a file download in the browser */
export function downloadGds(data: Uint8Array, filename: string): void {
	const blob = new Blob([data], { type: 'application/octet-stream' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
