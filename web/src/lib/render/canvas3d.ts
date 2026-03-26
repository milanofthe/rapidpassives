/**
 * Lightweight raw-WebGL 3D renderer for extruded IC layout polygons.
 * No dependencies beyond browser WebGL2.
 */

import earcut from 'earcut';
import type { LayerMap, LayerName, Polygon } from '$lib/geometry/types';
import { LAYER_COLORS, LAYER_ORDER } from '$lib/geometry/types';
import type { ProcessStack } from '$lib/stack/types';
import { canvas as canvasTheme } from '$lib/theme';

// ─── Types ───────────────────────────────────────────────────────────

export interface Camera {
	/** Azimuth angle in radians */
	theta: number;
	/** Elevation angle in radians */
	phi: number;
	/** Distance from target */
	distance: number;
	/** Look-at target [x, y, z] */
	target: [number, number, number];
}

export function createCamera(): Camera {
	return {
		theta: -Math.PI / 4,
		phi: Math.PI / 5,
		distance: 300,
		target: [0, 0, 0],
	};
}

interface Mesh {
	vao: WebGLVertexArrayObject;
	count: number;
	color: [number, number, number];
}

interface LineMesh {
	vao: WebGLVertexArrayObject;
	count: number;
	color: [number, number, number];
}

interface InstancedMesh {
	vao: WebGLVertexArrayObject;
	vertCount: number;
	instanceCount: number;
	color: [number, number, number];
	sideVao?: WebGLVertexArrayObject;
	sideVertCount?: number;
	/** GDS layer number for visibility filtering */
	gdsLayer?: number;
	/** World-space bounding box of all instances [minX, minY, maxX, maxY] */
	bbox?: [number, number, number, number];
}

interface GLState {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	uMVP: WebGLUniformLocation;
	uNormalMat: WebGLUniformLocation;
	uColor: WebGLUniformLocation;
	uLightDir: WebGLUniformLocation;
	uAmbient: WebGLUniformLocation;
	uZFlip: WebGLUniformLocation;
	instProgram: WebGLProgram;
	uInstMVP: WebGLUniformLocation;
	uInstColor: WebGLUniformLocation;
	uInstLightDir: WebGLUniformLocation;
	uInstAmbient: WebGLUniformLocation;
	uInstTopFace: WebGLUniformLocation;
	uInstZFlip: WebGLUniformLocation;
	uInstLayerZOffset: WebGLUniformLocation;
	instSideProgram: WebGLProgram;
	uInstSideMVP: WebGLUniformLocation;
	uInstSideColor: WebGLUniformLocation;
	uInstSideLightDir: WebGLUniformLocation;
	uInstSideAmbient: WebGLUniformLocation;
	uInstSideZFlip: WebGLUniformLocation;
	uInstSideLayerZOffset: WebGLUniformLocation;
	lineProgram: WebGLProgram;
	uLineMVP: WebGLUniformLocation;
	uLineColor: WebGLUniformLocation;
	meshes: Mesh[];
	instancedMeshes: InstancedMesh[];
	axisMeshes: LineMesh[];
	gridMesh: LineMesh | null;
}

// ─── Shader sources ──────────────────────────────────────────────────

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uMVP;
uniform mat3 uNormalMat;
uniform float uZFlip;
out vec3 vNormal;
void main() {
	vec3 n = aNormal;
	n.z *= uZFlip;
	vNormal = normalize(uNormalMat * n);
	vec3 pos = aPos;
	pos.z *= uZFlip;
	gl_Position = uMVP * vec4(pos, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uAmbient;
out vec4 fragColor;
void main() {
	float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
	vec3 lit = uColor * (uAmbient + (1.0 - uAmbient) * diff);
	fragColor = vec4(lit, 1.0);
}`;

// Instanced shader: 2D vertex positions + per-instance 2D affine transform + Z extrusion
const INST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;          // per-vertex: triangle x,y in cell-local coords
layout(location=1) in vec4 aInstRow0;     // per-instance: [a, b, tx, zBottom]
layout(location=2) in vec4 aInstRow1;     // per-instance: [c, d, ty, zTop]
uniform mat4 uMVP;
uniform float uTopFace;                   // 1.0 for top face pass, 0.0 for bottom
uniform float uZFlip;
uniform float uLayerZOffset;
out vec3 vNormal;
void main() {
	float wx = aInstRow0.x * aPos.x + aInstRow0.y * aPos.y + aInstRow0.z;
	float wy = aInstRow1.x * aPos.x + aInstRow1.y * aPos.y + aInstRow1.z;
	float z = mix(aInstRow1.w, aInstRow0.w, uTopFace) * uZFlip + uLayerZOffset;
	gl_Position = uMVP * vec4(wx, wy, z, 1.0);
	vNormal = vec3(0.0, 0.0, (uTopFace > 0.5 ? 1.0 : -1.0) * uZFlip);
}`;

// Instanced side wall shader: 3D vertices (x,y,zFlag,nx,ny) + per-instance 2D affine + z
const INST_SIDE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;          // per-vertex: edge vertex x,y
layout(location=3) in float aZFlag;       // per-vertex: 0=bottom, 1=top
layout(location=4) in vec2 aNormalXY;     // per-vertex: outward normal in XY
layout(location=1) in vec4 aInstRow0;     // per-instance: [a, b, tx, zBottom]
layout(location=2) in vec4 aInstRow1;     // per-instance: [c, d, ty, zTop]
uniform mat4 uMVP;
uniform float uZFlip;
uniform float uLayerZOffset;
out vec3 vNormal;
void main() {
	float wx = aInstRow0.x * aPos.x + aInstRow0.y * aPos.y + aInstRow0.z;
	float wy = aInstRow1.x * aPos.x + aInstRow1.y * aPos.y + aInstRow1.z;
	float z = mix(aInstRow1.w, aInstRow0.w, aZFlag) * uZFlip + uLayerZOffset;
	gl_Position = uMVP * vec4(wx, wy, z, 1.0);
	float tnx = aInstRow0.x * aNormalXY.x + aInstRow0.y * aNormalXY.y;
	float tny = aInstRow1.x * aNormalXY.x + aInstRow1.y * aNormalXY.y;
	vNormal = normalize(vec3(tnx, tny, 0.0));
}`;

const INST_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uAmbient;
out vec4 fragColor;
void main() {
	float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
	vec3 lit = uColor * (uAmbient + (1.0 - uAmbient) * diff);
	fragColor = vec4(lit, 1.0);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uMVP;
void main() {
	gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 fragColor;
void main() {
	fragColor = vec4(uColor, 1.0);
}`;

// ─── GL helpers ──────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
	const s = gl.createShader(type)!;
	gl.shaderSource(s, src);
	gl.compileShader(s);
	if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(s);
		gl.deleteShader(s);
		throw new Error('Shader compile: ' + info);
	}
	return s;
}

function linkProgramFromSource(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
	const p = gl.createProgram()!;
	gl.attachShader(p, vs);
	gl.attachShader(p, fs);
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error('Program link: ' + gl.getProgramInfoLog(p));
	}
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	return p;
}

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram {
	return linkProgramFromSource(gl, VS, FS);
}

function hexToRgb(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return [r, g, b];
}

// ─── Cached constants ────────────────────────────────────────────────

const LIGHT_RAW = [0.4, 0.3, 0.8] as const;
const LIGHT_LEN = Math.sqrt(LIGHT_RAW[0] ** 2 + LIGHT_RAW[1] ** 2 + LIGHT_RAW[2] ** 2);
const LIGHT_DIR: [number, number, number] = [LIGHT_RAW[0] / LIGHT_LEN, LIGHT_RAW[1] / LIGHT_LEN, LIGHT_RAW[2] / LIGHT_LEN];

// ─── Triangulation (earcut — robust for complex polygons) ────────────

function triangulate(xs: number[], ys: number[]): number[] {
	// Remove duplicate consecutive vertices
	const cx: number[] = [];
	const cy: number[] = [];
	const idxMap: number[] = []; // maps cleaned index back to original
	for (let i = 0; i < xs.length; i++) {
		const px = xs[i], py = ys[i];
		if (cx.length > 0 && Math.abs(px - cx[cx.length - 1]) < 1e-10 && Math.abs(py - cy[cy.length - 1]) < 1e-10) continue;
		cx.push(px);
		cy.push(py);
		idxMap.push(i);
	}
	// Also check first vs last
	if (cx.length > 1 && Math.abs(cx[0] - cx[cx.length - 1]) < 1e-10 && Math.abs(cy[0] - cy[cy.length - 1]) < 1e-10) {
		cx.pop();
		cy.pop();
		idxMap.pop();
	}

	const n = cx.length;
	if (n < 3) return [];

	// Check polygon has nonzero area
	let area = 0;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += cx[i] * cy[j] - cx[j] * cy[i];
	}
	if (Math.abs(area) < 1e-20) return [];

	// Pack into flat coordinate array for earcut
	const coords = new Float64Array(n * 2);
	for (let i = 0; i < n; i++) {
		coords[i * 2] = cx[i];
		coords[i * 2 + 1] = cy[i];
	}

	const tris = earcut(coords as unknown as number[]);

	// Map back to original indices
	const result = new Array(tris.length);
	for (let i = 0; i < tris.length; i++) {
		result[i] = idxMap[tris[i]];
	}
	return result;
}

// ─── Mesh building ───────────────────────────────────────────────────

/** Extrude a 2D polygon into a 3D slab, appending directly to output arrays.
 *  ox/oy are subtracted from polygon coordinates (centering offset). */
function extrudePolygon(
	poly: Polygon, zBottom: number, zTop: number,
	ox: number, oy: number,
	outPos: number[], outNorm: number[],
): void {
	const { x, y } = poly;
	const n = x.length;

	const tris = triangulate(x, y);
	if (tris.length === 0) return;

	// Top face (+Z)
	for (let i = 0; i < tris.length; i += 3) {
		const a = tris[i], b = tris[i + 1], c = tris[i + 2];
		outPos.push(
			x[a] - ox, y[a] - oy, zTop,
			x[b] - ox, y[b] - oy, zTop,
			x[c] - ox, y[c] - oy, zTop,
		);
		outNorm.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
	}

	// Bottom face (-Z, reversed winding)
	for (let i = 0; i < tris.length; i += 3) {
		const a = tris[i], b = tris[i + 1], c = tris[i + 2];
		outPos.push(
			x[a] - ox, y[a] - oy, zBottom,
			x[c] - ox, y[c] - oy, zBottom,
			x[b] - ox, y[b] - oy, zBottom,
		);
		outNorm.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
	}

	// Side faces
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		const xi = x[i] - ox, yi = y[i] - oy;
		const xj = x[j] - ox, yj = y[j] - oy;
		const dx = xj - xi, dy = yj - yi;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 1e-10) continue;
		const nx = dy / len, ny = -dx / len;

		outPos.push(
			xi, yi, zBottom, xj, yj, zBottom, xj, yj, zTop,
			xi, yi, zBottom, xj, yj, zTop, xi, yi, zTop,
		);
		outNorm.push(
			nx, ny, 0, nx, ny, 0, nx, ny, 0,
			nx, ny, 0, nx, ny, 0, nx, ny, 0,
		);
	}
}

function createMesh(gl: WebGL2RenderingContext, positions: number[], normals: number[]): WebGLVertexArrayObject {
	const vao = gl.createVertexArray()!;
	gl.bindVertexArray(vao);

	const posBuf = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	const normBuf = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

	gl.bindVertexArray(null);
	return vao;
}

function createLineMesh(gl: WebGL2RenderingContext, positions: number[]): WebGLVertexArrayObject {
	const vao = gl.createVertexArray()!;
	gl.bindVertexArray(vao);

	const buf = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

	gl.bindVertexArray(null);
	return vao;
}

// ─── Matrix math (minimal) ──────────────────────────────────────────

type Mat4 = Float32Array;

function mat4Identity(): Mat4 {
	const m = new Float32Array(16);
	m[0] = m[5] = m[10] = m[15] = 1;
	return m;
}

function mat4Ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 {
	const m = new Float32Array(16);
	m[0] = 2 / (right - left);
	m[5] = 2 / (top - bottom);
	m[10] = -2 / (far - near);
	m[12] = -(right + left) / (right - left);
	m[13] = -(top + bottom) / (top - bottom);
	m[14] = -(far + near) / (far - near);
	m[15] = 1;
	return m;
}

function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
	const f = 1 / Math.tan(fovY / 2);
	const nf = 1 / (near - far);
	const m = new Float32Array(16);
	m[0] = f / aspect;
	m[5] = f;
	m[10] = (far + near) * nf;
	m[11] = -1;
	m[14] = 2 * far * near * nf;
	return m;
}

function mat4LookAt(eye: number[], center: number[], up: number[]): Mat4 {
	const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
	let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
	const z0 = zx / len, z1 = zy / len, z2 = zz / len;
	const xx = up[1] * z2 - up[2] * z1, xy = up[2] * z0 - up[0] * z2, xz = up[0] * z1 - up[1] * z0;
	len = Math.sqrt(xx * xx + xy * xy + xz * xz);
	const x0 = xx / len, x1 = xy / len, x2 = xz / len;
	const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
	const m = new Float32Array(16);
	m[0] = x0; m[1] = y0; m[2] = z0;
	m[4] = x1; m[5] = y1; m[6] = z1;
	m[8] = x2; m[9] = y2; m[10] = z2;
	m[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
	m[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
	m[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
	m[15] = 1;
	return m;
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
	const o = new Float32Array(16);
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
		}
	}
	return o;
}

function mat3NormalFromMat4(m: Mat4): Float32Array {
	// Upper-left 3x3 inverse transpose (for uniform scaling this is just the 3x3)
	const n = new Float32Array(9);
	n[0] = m[0]; n[1] = m[1]; n[2] = m[2];
	n[3] = m[4]; n[4] = m[5]; n[5] = m[6];
	n[6] = m[8]; n[7] = m[9]; n[8] = m[10];
	return n;
}

// ─── Camera → eye position ──────────────────────────────────────────

function cameraEye(cam: Camera): [number, number, number] {
	const cp = Math.cos(cam.phi);
	return [
		cam.target[0] + cam.distance * cp * Math.sin(cam.theta),
		cam.target[1] + cam.distance * cp * Math.cos(cam.theta),
		cam.target[2] + cam.distance * Math.sin(cam.phi),
	];
}

// ─── Public API ──────────────────────────────────────────────────────

/** Initialize WebGL context and compile shaders */
export function initGL(canvas: HTMLCanvasElement): GLState | null {
	const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, preserveDrawingBuffer: true });
	if (!gl) return null;

	const program = linkProgram(gl);
	const uMVP = gl.getUniformLocation(program, 'uMVP')!;
	const uNormalMat = gl.getUniformLocation(program, 'uNormalMat')!;
	const uColor = gl.getUniformLocation(program, 'uColor')!;
	const uLightDir = gl.getUniformLocation(program, 'uLightDir')!;
	const uAmbient = gl.getUniformLocation(program, 'uAmbient')!;
	const uZFlip = gl.getUniformLocation(program, 'uZFlip')!;

	// Line shader program
	const lineProgram = linkProgramFromSource(gl, LINE_VS, LINE_FS);
	const uLineMVP = gl.getUniformLocation(lineProgram, 'uMVP')!;
	const uLineColor = gl.getUniformLocation(lineProgram, 'uColor')!;

	const bg = hexToRgb(canvasTheme.bg);
	gl.clearColor(bg[0], bg[1], bg[2], 1);
	gl.enable(gl.DEPTH_TEST);

	// Instanced shader program
	const instProgram = linkProgramFromSource(gl, INST_VS, INST_FS);
	const uInstMVP = gl.getUniformLocation(instProgram, 'uMVP')!;
	const uInstColor = gl.getUniformLocation(instProgram, 'uColor')!;
	const uInstLightDir = gl.getUniformLocation(instProgram, 'uLightDir')!;
	const uInstAmbient = gl.getUniformLocation(instProgram, 'uAmbient')!;
	const uInstTopFace = gl.getUniformLocation(instProgram, 'uTopFace')!;
	const uInstZFlip = gl.getUniformLocation(instProgram, 'uZFlip')!;
	const uInstLayerZOffset = gl.getUniformLocation(instProgram, 'uLayerZOffset')!;

	// Instanced side wall shader
	const instSideProgram = linkProgramFromSource(gl, INST_SIDE_VS, INST_FS);
	const uInstSideMVP = gl.getUniformLocation(instSideProgram, 'uMVP')!;
	const uInstSideColor = gl.getUniformLocation(instSideProgram, 'uColor')!;
	const uInstSideLightDir = gl.getUniformLocation(instSideProgram, 'uLightDir')!;
	const uInstSideAmbient = gl.getUniformLocation(instSideProgram, 'uAmbient')!;
	const uInstSideZFlip = gl.getUniformLocation(instSideProgram, 'uZFlip')!;
	const uInstSideLayerZOffset = gl.getUniformLocation(instSideProgram, 'uLayerZOffset')!;

	return {
		gl, program, uMVP, uNormalMat, uColor, uLightDir, uAmbient, uZFlip,
		instProgram, uInstMVP, uInstColor, uInstLightDir, uInstAmbient, uInstTopFace, uInstZFlip, uInstLayerZOffset,
		instSideProgram, uInstSideMVP, uInstSideColor, uInstSideLightDir, uInstSideAmbient, uInstSideZFlip, uInstSideLayerZOffset,
		lineProgram, uLineMVP, uLineColor,
		meshes: [], instancedMeshes: [], axisMeshes: [], gridMesh: null,
	};
}

/** Build meshes from layers + stack. Call when geometry or stack changes. */
/** Incremental build token — cancel previous build when a new one starts */
let buildGeneration = 0;

export function buildMeshes(
	state: GLState,
	layers: LayerMap,
	stack: ProcessStack,
	colorOverrides?: Record<string, string>,
	visibleLayers?: Set<LayerName>,
	onBatch?: () => void,
): void {
	// Start async build — increments generation to cancel any in-flight build
	const gen = ++buildGeneration;
	buildMeshesAsync(state, layers, stack, colorOverrides, visibleLayers, gen, onBatch);
}

async function buildMeshesAsync(
	state: GLState,
	layers: LayerMap,
	stack: ProcessStack,
	colorOverrides: Record<string, string> | undefined,
	visibleLayers: Set<LayerName> | undefined,
	gen: number,
	onBatch?: () => void,
): Promise<void> {
	const { gl } = state;

	// Clean up old meshes
	for (const m of state.meshes) {
		gl.deleteVertexArray(m.vao);
	}
	state.meshes = [];

	// Map geometry LayerName → stack layer z/thickness
	const layerZMap = new Map<LayerName, { z: number; thickness: number }>();
	for (const sl of stack.layers) {
		for (const gl2 of sl.gdsLayers) {
			layerZMap.set(gl2, { z: sl.z, thickness: sl.thickness });
		}
	}

	// Compute geometry center in XY
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const v of p.x) { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
			for (const v of p.y) { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
		}
	}
	const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
	const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
	const xyExtent = Math.max(
		isFinite(maxX) ? maxX - minX : 1,
		isFinite(maxY) ? maxY - minY : 1,
	);

	// Compute Z range from active (non-substrate) stack layers
	let minZ = Infinity, maxZ = -Infinity;
	for (const sl of stack.layers) {
		if (sl.type === 'substrate') continue;
		minZ = Math.min(minZ, sl.z);
		maxZ = Math.max(maxZ, sl.z + sl.thickness);
	}
	const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;

	// Build grid first so something renders immediately
	const gridZ = isFinite(minZ) ? minZ - cz : 0;
	buildGrid(state, xyExtent, gridZ);

	// Process layers incrementally
	let lastYield = performance.now();

	for (const layerName of LAYER_ORDER) {
		if (gen !== buildGeneration) return; // cancelled
		if (visibleLayers && !visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;

		const zInfo = layerZMap.get(layerName);
		if (!zInfo) continue;

		const colorHex = colorOverrides?.[layerName] ?? LAYER_COLORS[layerName] ?? '#888888';
		const color = hexToRgb(colorHex);

		const zBot = zInfo.z - cz;
		const zTop = zInfo.z + zInfo.thickness - cz;

		// Process polygons in batches, writing directly into shared arrays
		let allPos: number[] = [];
		let allNorm: number[] = [];

		for (let pi = 0; pi < polys.length; pi++) {
			extrudePolygon(polys[pi], zBot, zTop, cx, cy, allPos, allNorm);

			// Yield every ~30ms to keep UI responsive, flush current batch as a mesh
			const now = performance.now();
			if (now - lastYield > 30 && pi < polys.length - 1) {
				if (gen !== buildGeneration) return;
				if (allPos.length > 0) {
					const vao = createMesh(gl, allPos, allNorm);
					state.meshes.push({ vao, count: allPos.length / 3, color });
					allPos = [];
					allNorm = [];
				}
				lastYield = now;
				await new Promise(r => requestAnimationFrame(r));
				onBatch?.();
			}
		}

		if (allPos.length > 0) {
			if (gen !== buildGeneration) return;
			const vao = createMesh(gl, allPos, allNorm);
			state.meshes.push({ vao, count: allPos.length / 3, color });
		}
	}
}

function buildGrid(state: GLState, xyExtent: number, z: number): void {
	const { gl } = state;

	// Clean up old
	for (const m of state.axisMeshes) gl.deleteVertexArray(m.vao);
	if (state.gridMesh) gl.deleteVertexArray(state.gridMesh.vao);
	state.axisMeshes = [];
	state.gridMesh = null;

	const halfSize = Math.max(xyExtent * 0.6, 50);

	const gridLines: number[] = [];
	const gridStep = niceStep(halfSize * 2);
	const gridHalf = Math.ceil(halfSize / gridStep) * gridStep;
	for (let v = -gridHalf; v <= gridHalf; v += gridStep) {
		gridLines.push(v, -gridHalf, z, v, gridHalf, z);
		gridLines.push(-gridHalf, v, z, gridHalf, v, z);
	}
	if (gridLines.length > 0) {
		const vao = createLineMesh(gl, gridLines);
		state.gridMesh = { vao, count: gridLines.length / 3, color: [0.25, 0.25, 0.25] };
	}
}

/** Pick a nice round grid step for a given total extent */
function niceStep(extent: number): number {
	const raw = extent / 10;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / mag;
	if (norm <= 1) return mag;
	if (norm <= 2) return 2 * mag;
	if (norm <= 5) return 5 * mag;
	return 10 * mag;
}

// ─── Instanced mesh building ─────────────────────────────────────────

export interface InstancedSceneData {
	/** cellName → { gdsLayer → Float32Array of triangulated 2D verts [x,y,x,y,...] } */
	cellMeshes: Record<string, Record<number, Float32Array>>;
	/** cellName → { gdsLayer → Float32Array of edge pairs [x1,y1,x2,y2,...] } */
	cellEdges: Record<string, Record<number, Float32Array>>;
	/** cellName → Float32Array of affine transforms [a,b,c,d,tx,ty, ...] */
	cellInstances: Record<string, Float32Array>;
}

/**
 * Build GPU meshes from instanced scene data.
 * Each unique cell's triangulated polygons are uploaded once per layer,
 * with per-instance transform buffers for drawArraysInstanced.
 */
/** Direct GDS layer info for instanced rendering — no LayerName indirection */
export interface GdsLayerInfo {
	z: number;
	thickness: number;
	color: string;
}

export function buildInstancedMeshes(
	state: GLState,
	sceneData: InstancedSceneData,
	stack: ProcessStack,
	colorOverrides?: Record<string, string>,
	onDone?: () => void,
	/** Direct mapping: GDS layer number → z/thickness/color */
	gdsLayerInfo?: Map<number, GdsLayerInfo>,
): void {
	const { gl } = state;

	// Clean up old instanced meshes
	for (const m of state.instancedMeshes) gl.deleteVertexArray(m.vao);
	state.instancedMeshes = [];
	for (const m of state.meshes) gl.deleteVertexArray(m.vao);
	state.meshes = [];

	// Use provided GDS layer info directly
	const layerZMap = gdsLayerInfo ?? new Map<number, GdsLayerInfo>();

	// Compute geometry center from instance positions
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const transforms of Object.values(sceneData.cellInstances)) {
		for (let i = 0; i < transforms.length; i += 6) {
			const tx = transforms[i + 4], ty = transforms[i + 5];
			if (tx < minX) minX = tx; if (tx > maxX) maxX = tx;
			if (ty < minY) minY = ty; if (ty > maxY) maxY = ty;
		}
	}
	const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
	const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
	const xyExtent = Math.max(isFinite(maxX) ? maxX - minX : 1, isFinite(maxY) ? maxY - minY : 1);

	let minZ = Infinity, maxZ = -Infinity;
	for (const sl of stack.layers) {
		if (sl.type === 'substrate') continue;
		minZ = Math.min(minZ, sl.z);
		maxZ = Math.max(maxZ, sl.z + sl.thickness);
	}
	const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;

	// Build grid
	const gridZ = isFinite(minZ) ? minZ - cz : 0;
	buildGrid(state, xyExtent, gridZ);

	// Create instanced meshes per cell per GDS layer
	for (const [cellName, meshes] of Object.entries(sceneData.cellMeshes)) {
		const transforms = sceneData.cellInstances[cellName];
		if (!transforms || transforms.length === 0) continue;
		const instanceCount = transforms.length / 6;

		// Compute cell-local vertex extent (shared across layers for this cell)
		let cellMinX = Infinity, cellMaxX = -Infinity, cellMinY = Infinity, cellMaxY = -Infinity;
		for (const vb of Object.values(meshes)) {
			for (let i = 0; i < vb.length; i += 2) {
				const vx = vb[i], vy = vb[i + 1];
				if (vx < cellMinX) cellMinX = vx;
				if (vx > cellMaxX) cellMaxX = vx;
				if (vy < cellMinY) cellMinY = vy;
				if (vy > cellMaxY) cellMaxY = vy;
			}
		}
		const cellHalfW = isFinite(cellMaxX) ? (cellMaxX - cellMinX) / 2 + 1 : 1;
		const cellHalfH = isFinite(cellMaxY) ? (cellMaxY - cellMinY) / 2 + 1 : 1;

		for (const [gdsLayerStr, vertBuf] of Object.entries(meshes)) {
			const gdsLayer = Number(gdsLayerStr);
			const zInfo = layerZMap.get(gdsLayer);
			if (!zInfo) continue;
			if (vertBuf.length === 0) continue;

			const colorHex = zInfo.color ?? '#888888';
			const color = hexToRgb(colorHex);

			const zBot = zInfo.z - cz;
			const zTop = zInfo.z + zInfo.thickness - cz;

			// Build instance buffer and compute bounding box
			const instData = new Float32Array(instanceCount * 8);
			let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
			for (let i = 0; i < instanceCount; i++) {
				const si = i * 6;
				const txCentered = transforms[si + 4] - cx;
				const tyCentered = transforms[si + 5] - cy;
				instData[i * 8 + 0] = transforms[si + 0]; // a
				instData[i * 8 + 1] = transforms[si + 1]; // b
				instData[i * 8 + 2] = txCentered;          // tx - cx
				instData[i * 8 + 3] = zBot;
				instData[i * 8 + 4] = transforms[si + 2]; // c
				instData[i * 8 + 5] = transforms[si + 3]; // d
				instData[i * 8 + 6] = tyCentered;          // ty - cy
				instData[i * 8 + 7] = zTop;
				// Expand bbox by instance position + cell extent
				if (txCentered - cellHalfW < bMinX) bMinX = txCentered - cellHalfW;
				if (txCentered + cellHalfW > bMaxX) bMaxX = txCentered + cellHalfW;
				if (tyCentered - cellHalfH < bMinY) bMinY = tyCentered - cellHalfH;
				if (tyCentered + cellHalfH > bMaxY) bMaxY = tyCentered + cellHalfH;
			}
			const bbox: [number, number, number, number] = [bMinX, bMinY, bMaxX, bMaxY];

			const vao = gl.createVertexArray()!;
			gl.bindVertexArray(vao);

			// Vertex buffer (2D positions)
			const vertBufGL = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, vertBufGL);
			gl.bufferData(gl.ARRAY_BUFFER, vertBuf, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

			// Instance buffer
			const instBufGL = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, instBufGL);
			gl.bufferData(gl.ARRAY_BUFFER, instData, gl.STATIC_DRAW);

			// aInstRow0 (location 1): vec4 at offset 0, stride 32
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
			gl.vertexAttribDivisor(1, 1);

			// aInstRow1 (location 2): vec4 at offset 16, stride 32
			gl.enableVertexAttribArray(2);
			gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
			gl.vertexAttribDivisor(2, 1);

			gl.bindVertexArray(null);

			// Build side wall VAO from edge data
			const edgeBuf = sceneData.cellEdges?.[cellName]?.[gdsLayer];
			let sideVao: WebGLVertexArrayObject | undefined;
			let sideVertCount = 0;

			if (edgeBuf && edgeBuf.length >= 4) {
				// Each edge: [x1,y1,x2,y2] → 2 triangles (6 verts) with (x,y) + zFlag + (nx,ny)
				const edgeCount = edgeBuf.length / 4;
				// Per vertex: x, y, zFlag, nx, ny = 5 floats
				const sideData = new Float32Array(edgeCount * 6 * 5);
				let si = 0;
				for (let ei = 0; ei < edgeBuf.length; ei += 4) {
					const x0 = edgeBuf[ei], y0 = edgeBuf[ei + 1];
					const x1 = edgeBuf[ei + 2], y1 = edgeBuf[ei + 3];
					const dx = x1 - x0, dy = y1 - y0;
					const len = Math.sqrt(dx * dx + dy * dy);
					if (len < 1e-10) continue;
					const nx = dy / len, ny = -dx / len;
					// Two triangles: (x0,y0,bot), (x1,y1,bot), (x1,y1,top), (x0,y0,bot), (x1,y1,top), (x0,y0,top)
					const verts = [
						x0, y0, 0, nx, ny,
						x1, y1, 0, nx, ny,
						x1, y1, 1, nx, ny,
						x0, y0, 0, nx, ny,
						x1, y1, 1, nx, ny,
						x0, y0, 1, nx, ny,
					];
					sideData.set(verts, si);
					si += 30;
				}

				if (si > 0) {
					const trimmed = si < sideData.length ? sideData.subarray(0, si) : sideData;
					sideVao = gl.createVertexArray()!;
					gl.bindVertexArray(sideVao);

					const sideBufGL = gl.createBuffer()!;
					gl.bindBuffer(gl.ARRAY_BUFFER, sideBufGL);
					gl.bufferData(gl.ARRAY_BUFFER, trimmed, gl.STATIC_DRAW);
					// aPos (location 0): vec2 at offset 0, stride 20
					gl.enableVertexAttribArray(0);
					gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
					// aZFlag (location 3): float at offset 8
					gl.enableVertexAttribArray(3);
					gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 20, 8);
					// aNormalXY (location 4): vec2 at offset 12
					gl.enableVertexAttribArray(4);
					gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 20, 12);

					// Same instance buffer
					gl.bindBuffer(gl.ARRAY_BUFFER, instBufGL);
					gl.enableVertexAttribArray(1);
					gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
					gl.vertexAttribDivisor(1, 1);
					gl.enableVertexAttribArray(2);
					gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
					gl.vertexAttribDivisor(2, 1);

					gl.bindVertexArray(null);
					sideVertCount = si / 5;
				}
			}

			state.instancedMeshes.push({
				vao,
				vertCount: vertBuf.length / 2,
				instanceCount,
				color,
				sideVao,
				sideVertCount,
				gdsLayer,
				bbox,
			});
		}
	}

	onDone?.();
}

/** Extract 2D view bounds from MVP matrix by unprojecting clip-space corners */
function getViewBounds2D(mvp: Mat4): [number, number, number, number] | null {
	// Invert the MVP
	const inv = mat4Invert(mvp);
	if (!inv) return null;
	// Unproject the 4 corners of clip space at z=0
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
		// Unproject (cx, cy, 0, 1) — z=0 is where our geometry lives
		const x = inv[0] * cx + inv[4] * cy + inv[12];
		const y = inv[1] * cx + inv[5] * cy + inv[13];
		const w = inv[3] * cx + inv[7] * cy + inv[15];
		if (Math.abs(w) < 1e-10) continue;
		const wx = x / w, wy = y / w;
		if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
		if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
	}
	if (!isFinite(minX)) return null;
	return [minX, minY, maxX, maxY];
}

function mat4Invert(m: Mat4): Mat4 | null {
	const o = new Float32Array(16) as Mat4;
	const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
	const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
	const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
	const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
	const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
	const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
	const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
	const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
	const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
	const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
	let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
	if (Math.abs(det) < 1e-10) return null;
	det = 1 / det;
	o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
	o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
	o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
	o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
	o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
	o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
	o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
	o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
	o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
	o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
	o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
	o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
	o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
	o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
	o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
	o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
	return o;
}

/** Render one frame */
export function render3D(
	state: GLState,
	camera: Camera,
	width: number,
	height: number,
	/** 0 = full perspective (3D), 1 = full orthographic (2D top-down) */
	orthoBlend: number = 0,
	/** If true, skip background clear and grid (for transparent PNG export) */
	transparent: boolean = false,
	/** Set of visible GDS layer numbers — if provided, skip instanced meshes not in this set */
	visibleGdsLayers?: Set<number> | null,
	/** Z-axis scale: 1.0 normal, -1.0 flipped */
	zFlip: number = 1.0,
	/** Per-GDS-layer Z offset for explode animation */
	layerZOffsets?: Map<number, number> | null,
): void {
	const { gl, program, uMVP, uNormalMat, uColor, uLightDir, uAmbient } = state;

	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	if (!transparent) {
		const bg = hexToRgb(canvasTheme.bg);
		gl.clearColor(bg[0], bg[1], bg[2], 1);
	}
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	const aspect = width / height || 1;
	const near = Math.max(0.01, camera.distance * 0.01);
	const far = camera.distance * 10;

	let proj: Mat4;
	if (orthoBlend >= 0.999) {
		// Pure orthographic
		const halfH = camera.distance * Math.tan(Math.PI / 12); // match perspective FOV extent
		const halfW = halfH * aspect;
		proj = mat4Ortho(-halfW, halfW, -halfH, halfH, near, far);
	} else if (orthoBlend <= 0.001) {
		// Pure perspective
		proj = mat4Perspective(Math.PI / 6, aspect, near, far);
	} else {
		// Blend: interpolate between perspective and ortho
		const perspProj = mat4Perspective(Math.PI / 6, aspect, near, far);
		const halfH = camera.distance * Math.tan(Math.PI / 12);
		const halfW = halfH * aspect;
		const orthoProj = mat4Ortho(-halfW, halfW, -halfH, halfH, near, far);
		proj = new Float32Array(16) as Mat4;
		for (let i = 0; i < 16; i++) proj[i] = perspProj[i] * (1 - orthoBlend) + orthoProj[i] * orthoBlend;
	}

	const eye = cameraEye(camera);
	const view = mat4LookAt(eye, camera.target as number[], [0, 0, 1]);
	let vp = mat4Multiply(proj, view);

	// Draw grid and axes first (behind geometry) — skip for transparent export
	if (!transparent) {
		gl.useProgram(state.lineProgram);
		gl.uniformMatrix4fv(state.uLineMVP, false, vp);

		if (state.gridMesh) {
			gl.uniform3f(state.uLineColor, state.gridMesh.color[0], state.gridMesh.color[1], state.gridMesh.color[2]);
			gl.bindVertexArray(state.gridMesh.vao);
			gl.drawArrays(gl.LINES, 0, state.gridMesh.count);
		}
	}

	// No frustum culling — bbox approach was unreliable across view modes
	const viewBounds: [number, number, number, number] | null = null;

	// Draw geometry
	{
		// Solid: use lit program
		gl.useProgram(program);
		const normalMat = mat3NormalFromMat4(view);
		gl.uniformMatrix4fv(uMVP, false, vp);
		gl.uniformMatrix3fv(uNormalMat, false, normalMat);
		gl.uniform3f(uLightDir, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
		// Flat shading in ortho (2D) mode, lit shading in perspective (3D)
		gl.uniform1f(uAmbient, 0.8 + 0.2 * orthoBlend);
		gl.uniform1f(state.uZFlip, zFlip);
		for (const mesh of state.meshes) {
			gl.uniform3f(uColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
		}
	}

	// Draw instanced meshes (from GDS import)
	if (state.instancedMeshes.length > 0) {
		gl.useProgram(state.instProgram);
		gl.uniformMatrix4fv(state.uInstMVP, false, vp);
		gl.uniform3f(state.uInstLightDir, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
		gl.uniform1f(state.uInstAmbient, 0.8 + 0.2 * orthoBlend);
		gl.uniform1f(state.uInstZFlip, zFlip);

		// Filter meshes by visibility and frustum
		const visibleMeshes = state.instancedMeshes.filter(mesh => {
			if (visibleGdsLayers && mesh.gdsLayer != null && !visibleGdsLayers.has(mesh.gdsLayer)) return false;
			if (viewBounds && mesh.bbox) {
				const [vMinX, vMinY, vMaxX, vMaxY] = viewBounds;
				const [bMinX, bMinY, bMaxX, bMaxY] = mesh.bbox;
				if (bMaxX < vMinX || bMinX > vMaxX || bMaxY < vMinY || bMinY > vMaxY) return false;
			}
			return true;
		});

		// Draw top faces
		gl.uniform1f(state.uInstTopFace, 1.0);
		for (const mesh of visibleMeshes) {
			gl.uniform1f(state.uInstLayerZOffset, layerZOffsets?.get(mesh.gdsLayer ?? -1) ?? 0);
			gl.uniform3f(state.uInstColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertCount, mesh.instanceCount);
		}

		// Skip bottom faces and side walls in 2D (ortho) mode — they're invisible from top-down
		if (orthoBlend < 0.9) {
			// Draw bottom faces
			gl.uniform1f(state.uInstTopFace, 0.0);
			for (const mesh of visibleMeshes) {
				gl.uniform1f(state.uInstLayerZOffset, layerZOffsets?.get(mesh.gdsLayer ?? -1) ?? 0);
				gl.uniform3f(state.uInstColor, mesh.color[0], mesh.color[1], mesh.color[2]);
				gl.bindVertexArray(mesh.vao);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertCount, mesh.instanceCount);
			}

			// Draw side walls
			gl.useProgram(state.instSideProgram);
			gl.uniformMatrix4fv(state.uInstSideMVP, false, vp);
			gl.uniform3f(state.uInstSideLightDir, LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
			gl.uniform1f(state.uInstSideAmbient, 0.8 + 0.2 * orthoBlend);
			gl.uniform1f(state.uInstSideZFlip, zFlip);
			for (const mesh of visibleMeshes) {
				if (!mesh.sideVao || !mesh.sideVertCount) continue;
				gl.uniform1f(state.uInstSideLayerZOffset, layerZOffsets?.get(mesh.gdsLayer ?? -1) ?? 0);
				gl.uniform3f(state.uInstSideColor, mesh.color[0], mesh.color[1], mesh.color[2]);
				gl.bindVertexArray(mesh.sideVao);
				gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.sideVertCount, mesh.instanceCount);
			}
		}
	}

	gl.bindVertexArray(null);
}

/** Compute a good initial camera distance to fit all geometry */
export function fitCamera(layers: LayerMap, stack: ProcessStack, instancedScene?: InstancedSceneData | null): Camera {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

	// Bounds from flat LayerMap
	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const v of p.x) { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
			for (const v of p.y) { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
		}
	}

	// Bounds from instanced scene — combine mesh vertex bounds with instance transforms
	if (instancedScene) {
		for (const [cellName, layerMeshes] of Object.entries(instancedScene.cellMeshes)) {
			// Get vertex bounds for this cell's meshes
			let cellMinX = Infinity, cellMaxX = -Infinity, cellMinY = Infinity, cellMaxY = -Infinity;
			for (const verts of Object.values(layerMeshes)) {
				for (let i = 0; i < verts.length; i += 2) {
					const vx = verts[i], vy = verts[i + 1];
					if (vx < cellMinX) cellMinX = vx; if (vx > cellMaxX) cellMaxX = vx;
					if (vy < cellMinY) cellMinY = vy; if (vy > cellMaxY) cellMaxY = vy;
				}
			}
			if (!isFinite(cellMinX)) continue;

			// Apply each instance transform to the cell bounds
			const transforms = instancedScene.cellInstances[cellName];
			if (!transforms) continue;
			for (let i = 0; i < transforms.length; i += 6) {
				const a = transforms[i], b = transforms[i + 1];
				const c = transforms[i + 2], d = transforms[i + 3];
				const tx = transforms[i + 4], ty = transforms[i + 5];
				// Transform all 4 corners of the cell bounding box
				for (const cx of [cellMinX, cellMaxX]) {
					for (const cy of [cellMinY, cellMaxY]) {
						const wx = a * cx + b * cy + tx;
						const wy = c * cx + d * cy + ty;
						if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
						if (wy < minY) minY = wy; if (wy > maxY) maxY = wy;
					}
				}
			}
		}
	}
	const xyExtent = Math.max(
		isFinite(maxX) ? maxX - minX : 1,
		isFinite(maxY) ? maxY - minY : 1,
	);

	// Center on geometry midpoint including z from the stack
	const cx = isFinite(minX) ? (minX + maxX) / 2 : 0;
	const cy = isFinite(minY) ? (minY + maxY) / 2 : 0;
	let minZ = Infinity, maxZ = -Infinity;
	for (const sl of stack.layers) {
		if (sl.gdsLayers.length === 0 && sl.type === 'substrate') continue;
		minZ = Math.min(minZ, sl.z);
		maxZ = Math.max(maxZ, sl.z + sl.thickness);
	}
	const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;

	// FOV is PI/6, so distance = extent / (2 * tan(fov/2)) with padding
	const halfFov = Math.PI / 12;
	const distance = (xyExtent / 2) / Math.tan(halfFov) * 1.1;
	return {
		theta: Math.PI / 4,
		phi: Math.PI / 4,
		distance,
		target: [0, 0, 0], // geometry is centered to origin by buildMeshes
	};
}

/** Clean up GL resources */
export function disposeGL(state: GLState): void {
	const { gl } = state;
	for (const m of state.meshes) {
		gl.deleteVertexArray(m.vao);
	}
	for (const m of state.axisMeshes) gl.deleteVertexArray(m.vao);
	if (state.gridMesh) gl.deleteVertexArray(state.gridMesh.vao);
	gl.deleteProgram(state.program);
	gl.deleteProgram(state.lineProgram);
}
