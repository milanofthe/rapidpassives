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
	wireEBO: WebGLBuffer;
	wireCount: number;
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
}

interface BatchedMesh {
	vao: WebGLVertexArrayObject;
	vertCount: number;
	color: [number, number, number];
	zBot: number;
	zTop: number;
	sideVao?: WebGLVertexArrayObject;
	sideVertCount?: number;
}

interface GLState {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	uMVP: WebGLUniformLocation;
	uNormalMat: WebGLUniformLocation;
	uColor: WebGLUniformLocation;
	uLightDir: WebGLUniformLocation;
	uAmbient: WebGLUniformLocation;
	instProgram: WebGLProgram;
	uInstMVP: WebGLUniformLocation;
	uInstColor: WebGLUniformLocation;
	uInstLightDir: WebGLUniformLocation;
	uInstAmbient: WebGLUniformLocation;
	uInstTopFace: WebGLUniformLocation;
	instSideProgram: WebGLProgram;
	uInstSideMVP: WebGLUniformLocation;
	uInstSideColor: WebGLUniformLocation;
	uInstSideLightDir: WebGLUniformLocation;
	uInstSideAmbient: WebGLUniformLocation;
	batchProgram: WebGLProgram;
	uBatchMVP: WebGLUniformLocation;
	uBatchColor: WebGLUniformLocation;
	uBatchLightDir: WebGLUniformLocation;
	uBatchAmbient: WebGLUniformLocation;
	uBatchZ: WebGLUniformLocation;
	uBatchTopFace: WebGLUniformLocation;
	batchSideProgram: WebGLProgram;
	uBatchSideMVP: WebGLUniformLocation;
	uBatchSideColor: WebGLUniformLocation;
	uBatchSideLightDir: WebGLUniformLocation;
	uBatchSideAmbient: WebGLUniformLocation;
	uBatchSideZBot: WebGLUniformLocation;
	uBatchSideZTop: WebGLUniformLocation;
	lineProgram: WebGLProgram;
	uLineMVP: WebGLUniformLocation;
	uLineColor: WebGLUniformLocation;
	meshes: Mesh[];
	instancedMeshes: InstancedMesh[];
	batchedMeshes: BatchedMesh[];
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
out vec3 vNormal;
void main() {
	vNormal = normalize(uNormalMat * aNormal);
	gl_Position = uMVP * vec4(aPos, 1.0);
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
out vec3 vNormal;
void main() {
	// Apply 2D affine: x' = a*x + b*y + tx, y' = c*x + d*y + ty
	float wx = aInstRow0.x * aPos.x + aInstRow0.y * aPos.y + aInstRow0.z;
	float wy = aInstRow1.x * aPos.x + aInstRow1.y * aPos.y + aInstRow1.z;
	float z = mix(aInstRow1.w, aInstRow0.w, uTopFace); // bottom or top
	gl_Position = uMVP * vec4(wx, wy, z, 1.0);
	vNormal = vec3(0.0, 0.0, uTopFace > 0.5 ? 1.0 : -1.0);
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
out vec3 vNormal;
void main() {
	float wx = aInstRow0.x * aPos.x + aInstRow0.y * aPos.y + aInstRow0.z;
	float wy = aInstRow1.x * aPos.x + aInstRow1.y * aPos.y + aInstRow1.z;
	float z = mix(aInstRow1.w, aInstRow0.w, aZFlag);
	gl_Position = uMVP * vec4(wx, wy, z, 1.0);
	// Transform normal by the instance rotation (ignore translation)
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

// Batched face shader: pre-transformed 2D positions + z from uniforms
const BATCH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uMVP;
uniform float uZ;
out vec3 vNormal;
uniform float uTopFace;
void main() {
	gl_Position = uMVP * vec4(aPos, uZ, 1.0);
	vNormal = vec3(0.0, 0.0, uTopFace > 0.5 ? 1.0 : -1.0);
}`;

// Batched side wall shader: pre-transformed 2D positions + normals
const BATCH_SIDE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in float aZFlag;
layout(location=2) in vec2 aNormalXY;
uniform mat4 uMVP;
uniform float uZBot;
uniform float uZTop;
out vec3 vNormal;
void main() {
	float z = mix(uZBot, uZTop, aZFlag);
	gl_Position = uMVP * vec4(aPos, z, 1.0);
	vNormal = normalize(vec3(aNormalXY, 0.0));
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

function createMesh(gl: WebGL2RenderingContext, positions: number[], normals: number[]): { vao: WebGLVertexArrayObject; wireEBO: WebGLBuffer; wireCount: number } {
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

	// Build wireframe edge indices from triangles
	const triCount = positions.length / 9;
	const wireIndices = new Uint32Array(triCount * 6);
	for (let i = 0; i < triCount; i++) {
		const base = i * 3;
		const wi = i * 6;
		wireIndices[wi]     = base;
		wireIndices[wi + 1] = base + 1;
		wireIndices[wi + 2] = base + 1;
		wireIndices[wi + 3] = base + 2;
		wireIndices[wi + 4] = base + 2;
		wireIndices[wi + 5] = base;
	}
	const wireEBO = gl.createBuffer()!;
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireEBO);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);

	gl.bindVertexArray(null);
	return { vao, wireEBO, wireCount: wireIndices.length };
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

	// Instanced side wall shader
	const instSideProgram = linkProgramFromSource(gl, INST_SIDE_VS, INST_FS);
	const uInstSideMVP = gl.getUniformLocation(instSideProgram, 'uMVP')!;
	const uInstSideColor = gl.getUniformLocation(instSideProgram, 'uColor')!;
	const uInstSideLightDir = gl.getUniformLocation(instSideProgram, 'uLightDir')!;
	const uInstSideAmbient = gl.getUniformLocation(instSideProgram, 'uAmbient')!;

	// Batched face shader (uses same FS as lit program)
	const batchProgram = linkProgramFromSource(gl, BATCH_VS, FS);
	const uBatchMVP = gl.getUniformLocation(batchProgram, 'uMVP')!;
	const uBatchColor = gl.getUniformLocation(batchProgram, 'uColor')!;
	const uBatchLightDir = gl.getUniformLocation(batchProgram, 'uLightDir')!;
	const uBatchAmbient = gl.getUniformLocation(batchProgram, 'uAmbient')!;
	const uBatchZ = gl.getUniformLocation(batchProgram, 'uZ')!;
	const uBatchTopFace = gl.getUniformLocation(batchProgram, 'uTopFace')!;

	// Batched side wall shader
	const batchSideProgram = linkProgramFromSource(gl, BATCH_SIDE_VS, FS);
	const uBatchSideMVP = gl.getUniformLocation(batchSideProgram, 'uMVP')!;
	const uBatchSideColor = gl.getUniformLocation(batchSideProgram, 'uColor')!;
	const uBatchSideLightDir = gl.getUniformLocation(batchSideProgram, 'uLightDir')!;
	const uBatchSideAmbient = gl.getUniformLocation(batchSideProgram, 'uAmbient')!;
	const uBatchSideZBot = gl.getUniformLocation(batchSideProgram, 'uZBot')!;
	const uBatchSideZTop = gl.getUniformLocation(batchSideProgram, 'uZTop')!;

	return {
		gl, program, uMVP, uNormalMat, uColor, uLightDir, uAmbient,
		instProgram, uInstMVP, uInstColor, uInstLightDir, uInstAmbient, uInstTopFace,
		instSideProgram, uInstSideMVP, uInstSideColor, uInstSideLightDir, uInstSideAmbient,
		batchProgram, uBatchMVP, uBatchColor, uBatchLightDir, uBatchAmbient, uBatchZ, uBatchTopFace,
		batchSideProgram, uBatchSideMVP, uBatchSideColor, uBatchSideLightDir, uBatchSideAmbient, uBatchSideZBot, uBatchSideZTop,
		lineProgram, uLineMVP, uLineColor,
		meshes: [], instancedMeshes: [], batchedMeshes: [], axisMeshes: [], gridMesh: null,
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
					const { vao, wireEBO, wireCount } = createMesh(gl, allPos, allNorm);
					state.meshes.push({ vao, count: allPos.length / 3, wireEBO, wireCount, color });
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
			const { vao, wireEBO, wireCount } = createMesh(gl, allPos, allNorm);
			state.meshes.push({ vao, count: allPos.length / 3, wireEBO, wireCount, color });
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
	/** cellName → flat array of affine transforms [a,b,c,d,tx,ty, ...] */
	cellInstances: Record<string, number[]>;
}

/**
 * Build GPU meshes from instanced scene data.
 * Each unique cell's triangulated polygons are uploaded once per layer,
 * with per-instance transform buffers for drawArraysInstanced.
 */
export function buildInstancedMeshes(
	state: GLState,
	sceneData: InstancedSceneData,
	stack: ProcessStack,
	colorOverrides?: Record<string, string>,
	onDone?: () => void,
	/** Map GDS layer number → LayerName used in the stack */
	gdsLayerMap?: Record<number, string>,
): void {
	const { gl } = state;

	// Clean up old instanced meshes
	for (const m of state.instancedMeshes) gl.deleteVertexArray(m.vao);
	state.instancedMeshes = [];
	// Also clean regular meshes
	for (const m of state.meshes) gl.deleteVertexArray(m.vao);
	state.meshes = [];

	// Map GDS layer number → z/thickness/color from stack
	const layerZMap = new Map<number, { z: number; thickness: number; color: string }>();
	for (const sl of stack.layers) {
		if (sl.type === 'substrate') continue;
		for (const glName of sl.gdsLayers) {
			// Find the GDS layer number for this LayerName via the provided mapping
			if (gdsLayerMap) {
				for (const [num, name] of Object.entries(gdsLayerMap)) {
					if (name === glName) {
						layerZMap.set(Number(num), { z: sl.z, thickness: sl.thickness, color: sl.color });
					}
				}
			}
		}
	}

	// Compute geometry center for the scene
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const [cellName, meshes] of Object.entries(sceneData.cellMeshes)) {
		const transforms = sceneData.cellInstances[cellName];
		if (!transforms) continue;
		for (const buf of Object.values(meshes)) {
			for (let i = 0; i < buf.length; i += 2) {
				// Just sample first instance to estimate bounds
				const x = transforms[0] * buf[i] + transforms[1] * buf[i + 1] + transforms[2];
				const y = transforms[3] * buf[i] + transforms[4] * buf[i + 1] + transforms[5]; // FIXME: wrong indices
			}
		}
	}
	// Simpler: use transforms tx,ty to estimate bounds
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

		for (const [gdsLayerStr, vertBuf] of Object.entries(meshes)) {
			const gdsLayer = Number(gdsLayerStr);
			const zInfo = layerZMap.get(gdsLayer);
			if (!zInfo) continue;
			if (vertBuf.length === 0) continue;

			const layerName = gdsLayerMap?.[gdsLayer] ?? '';
			const colorHex = colorOverrides?.[layerName] ?? zInfo.color ?? '#888888';
			const color = hexToRgb(colorHex);

			const zBot = zInfo.z - cz;
			const zTop = zInfo.z + zInfo.thickness - cz;

			// Build instance buffer: pack transforms with z values
			// Per instance: [a, b, tx-cx, zBot, c, d, ty-cy, zTop] → 2 vec4s
			const instData = new Float32Array(instanceCount * 8);
			for (let i = 0; i < instanceCount; i++) {
				const si = i * 6;
				instData[i * 8 + 0] = transforms[si + 0]; // a
				instData[i * 8 + 1] = transforms[si + 1]; // b
				instData[i * 8 + 2] = transforms[si + 4] - cx; // tx - cx
				instData[i * 8 + 3] = zBot;
				instData[i * 8 + 4] = transforms[si + 2]; // c
				instData[i * 8 + 5] = transforms[si + 3]; // d
				instData[i * 8 + 6] = transforms[si + 5] - cy; // ty - cy
				instData[i * 8 + 7] = zTop;
			}

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
			});
		}
	}

	onDone?.();
}

// ─── Batched mesh building (pre-flattened by worker) ─────────────────

export interface BatchedSceneData {
	/** GDS layer → Float32Array of pre-transformed face vertices [x,y,...] */
	layerVerts: Record<number, Float32Array>;
	/** GDS layer → Float32Array of pre-transformed side wall vertices [x,y,zFlag,nx,ny,...] */
	layerSides: Record<number, Float32Array>;
	/** GDS layer → [minX, minY, maxX, maxY] */
	layerBounds: Record<number, [number, number, number, number]>;
	/** List of GDS layer numbers present */
	gdsLayers: number[];
}

export function buildBatchedMeshes(
	state: GLState,
	sceneData: BatchedSceneData,
	stack: ProcessStack,
	colorOverrides?: Record<string, string>,
	gdsLayerMap?: Record<number, string>,
	onDone?: () => void,
): void {
	const { gl } = state;

	// Clean up old batched meshes
	for (const m of state.batchedMeshes) {
		gl.deleteVertexArray(m.vao);
		if (m.sideVao) gl.deleteVertexArray(m.sideVao);
	}
	state.batchedMeshes = [];
	// Also clean instanced meshes (replacing them)
	for (const m of state.instancedMeshes) gl.deleteVertexArray(m.vao);
	state.instancedMeshes = [];
	for (const m of state.meshes) gl.deleteVertexArray(m.vao);
	state.meshes = [];

	// Map GDS layer → stack z/thickness/color
	const layerZMap = new Map<number, { z: number; thickness: number; color: string }>();
	for (const sl of stack.layers) {
		if (sl.type === 'substrate') continue;
		for (const glName of sl.gdsLayers) {
			if (gdsLayerMap) {
				for (const [num, name] of Object.entries(gdsLayerMap)) {
					if (name === glName) layerZMap.set(Number(num), { z: sl.z, thickness: sl.thickness, color: sl.color });
				}
			}
		}
	}

	// Compute center from bounds
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const b of Object.values(sceneData.layerBounds)) {
		if (b[0] < minX) minX = b[0];
		if (b[2] > maxX) maxX = b[2];
		if (b[1] < minY) minY = b[1];
		if (b[3] > maxY) maxY = b[3];
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

	// Create one VAO per layer
	for (const gdsLayer of sceneData.gdsLayers) {
		const zInfo = layerZMap.get(gdsLayer);
		if (!zInfo) continue;

		const layerName = gdsLayerMap?.[gdsLayer] ?? '';
		const colorHex = colorOverrides?.[layerName] ?? zInfo.color ?? '#888888';
		const color = hexToRgb(colorHex);
		const zBot = zInfo.z - cz;
		const zTop = zInfo.z + zInfo.thickness - cz;

		// Face VAO — simple vec2 positions, centered
		const faceData = sceneData.layerVerts[gdsLayer];
		if (!faceData || faceData.length === 0) continue;

		// Center the vertices
		const centered = new Float32Array(faceData.length);
		for (let i = 0; i < faceData.length; i += 2) {
			centered[i] = faceData[i] - cx;
			centered[i + 1] = faceData[i + 1] - cy;
		}

		const faceVao = gl.createVertexArray()!;
		gl.bindVertexArray(faceVao);
		const faceBuf = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, faceBuf);
		gl.bufferData(gl.ARRAY_BUFFER, centered, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.bindVertexArray(null);

		// Side wall VAO
		const sideData = sceneData.layerSides[gdsLayer];
		let sideVao: WebGLVertexArrayObject | undefined;
		let sideVertCount = 0;

		if (sideData && sideData.length > 0) {
			// Center the side wall positions (x,y are at offsets 0,1 in stride of 5)
			const centeredSides = new Float32Array(sideData.length);
			for (let i = 0; i < sideData.length; i += 5) {
				centeredSides[i] = sideData[i] - cx;
				centeredSides[i + 1] = sideData[i + 1] - cy;
				centeredSides[i + 2] = sideData[i + 2]; // zFlag
				centeredSides[i + 3] = sideData[i + 3]; // nx
				centeredSides[i + 4] = sideData[i + 4]; // ny
			}

			sideVao = gl.createVertexArray()!;
			gl.bindVertexArray(sideVao);
			const sideBuf = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, sideBuf);
			gl.bufferData(gl.ARRAY_BUFFER, centeredSides, gl.STATIC_DRAW);
			// aPos (location 0): vec2, stride 20, offset 0
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
			// aZFlag (location 1): float, stride 20, offset 8
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 8);
			// aNormalXY (location 2): vec2, stride 20, offset 12
			gl.enableVertexAttribArray(2);
			gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 20, 12);
			gl.bindVertexArray(null);

			sideVertCount = centeredSides.length / 5;
		}

		state.batchedMeshes.push({
			vao: faceVao,
			vertCount: centered.length / 2,
			color,
			zBot,
			zTop,
			sideVao,
			sideVertCount,
		});
	}

	onDone?.();
}

/** Render one frame */
export function render3D(
	state: GLState,
	camera: Camera,
	width: number,
	height: number,
	wireframe: boolean = false,
	/** 0 = full perspective (3D), 1 = full orthographic (2D top-down) */
	orthoBlend: number = 0,
	/** If true, skip background clear and grid (for transparent PNG export) */
	transparent: boolean = false,
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
	const vp = mat4Multiply(proj, view);

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

	// Draw geometry
	if (wireframe) {
		// Wireframe: use line program with edge indices
		gl.useProgram(state.lineProgram);
		gl.uniformMatrix4fv(state.uLineMVP, false, vp);
		for (const mesh of state.meshes) {
			gl.uniform3f(state.uLineColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.wireEBO);
			gl.drawElements(gl.LINES, mesh.wireCount, gl.UNSIGNED_INT, 0);
		}
	} else {
		// Solid: use lit program
		gl.useProgram(program);
		const normalMat = mat3NormalFromMat4(view);
		gl.uniformMatrix4fv(uMVP, false, vp);
		gl.uniformMatrix3fv(uNormalMat, false, normalMat);
		const lx = 0.4, ly = 0.3, lz = 0.8;
		const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
		gl.uniform3f(uLightDir, lx / ll, ly / ll, lz / ll);
		// Flat shading in ortho (2D) mode, lit shading in perspective (3D)
		gl.uniform1f(uAmbient, 0.8 + 0.2 * orthoBlend);
		for (const mesh of state.meshes) {
			gl.uniform3f(uColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
		}
	}

	// Draw instanced meshes (from GDS import)
	if (state.instancedMeshes.length > 0 && !wireframe) {
		gl.useProgram(state.instProgram);
		gl.uniformMatrix4fv(state.uInstMVP, false, vp);
		const lx = 0.4, ly = 0.3, lz = 0.8;
		const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
		gl.uniform3f(state.uInstLightDir, lx / ll, ly / ll, lz / ll);
		gl.uniform1f(state.uInstAmbient, 0.8 + 0.2 * orthoBlend);

		// Draw top faces
		gl.uniform1f(state.uInstTopFace, 1.0);
		for (const mesh of state.instancedMeshes) {
			gl.uniform3f(state.uInstColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertCount, mesh.instanceCount);
		}

		// Draw bottom faces
		gl.uniform1f(state.uInstTopFace, 0.0);
		for (const mesh of state.instancedMeshes) {
			gl.uniform3f(state.uInstColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertCount, mesh.instanceCount);
		}

		// Draw side walls
		gl.useProgram(state.instSideProgram);
		gl.uniformMatrix4fv(state.uInstSideMVP, false, vp);
		gl.uniform3f(state.uInstSideLightDir, lx / ll, ly / ll, lz / ll);
		gl.uniform1f(state.uInstSideAmbient, 0.8 + 0.2 * orthoBlend);
		for (const mesh of state.instancedMeshes) {
			if (!mesh.sideVao || !mesh.sideVertCount) continue;
			gl.uniform3f(state.uInstSideColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.sideVao);
			gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.sideVertCount, mesh.instanceCount);
		}
	}

	// Draw batched meshes (pre-flattened, one VAO per layer)
	if (state.batchedMeshes.length > 0 && !wireframe) {
		const lx = 0.4, ly2 = 0.3, lz2 = 0.8;
		const ll2 = Math.sqrt(lx * lx + ly2 * ly2 + lz2 * lz2);

		// Top + bottom faces
		gl.useProgram(state.batchProgram);
		gl.uniformMatrix4fv(state.uBatchMVP, false, vp);
		gl.uniform3f(state.uBatchLightDir, lx / ll2, ly2 / ll2, lz2 / ll2);
		gl.uniform1f(state.uBatchAmbient, 0.8 + 0.2 * orthoBlend);

		// Top faces
		gl.uniform1f(state.uBatchTopFace, 1.0);
		for (const mesh of state.batchedMeshes) {
			gl.uniform3f(state.uBatchColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.uniform1f(state.uBatchZ, mesh.zTop);
			gl.bindVertexArray(mesh.vao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
		}

		// Bottom faces
		gl.uniform1f(state.uBatchTopFace, 0.0);
		for (const mesh of state.batchedMeshes) {
			gl.uniform3f(state.uBatchColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.uniform1f(state.uBatchZ, mesh.zBot);
			gl.bindVertexArray(mesh.vao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
		}

		// Side walls
		gl.useProgram(state.batchSideProgram);
		gl.uniformMatrix4fv(state.uBatchSideMVP, false, vp);
		gl.uniform3f(state.uBatchSideLightDir, lx / ll2, ly2 / ll2, lz2 / ll2);
		gl.uniform1f(state.uBatchSideAmbient, 0.8 + 0.2 * orthoBlend);
		for (const mesh of state.batchedMeshes) {
			if (!mesh.sideVao || !mesh.sideVertCount) continue;
			gl.uniform3f(state.uBatchSideColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.uniform1f(state.uBatchSideZBot, mesh.zBot);
			gl.uniform1f(state.uBatchSideZTop, mesh.zTop);
			gl.bindVertexArray(mesh.sideVao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.sideVertCount);
		}
	}

	gl.bindVertexArray(null);
}

/** Compute a good initial camera distance to fit all geometry */
export function fitCamera(layers: LayerMap, stack: ProcessStack, batchedScene?: BatchedSceneData | null): Camera {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

	// Bounds from flat LayerMap
	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const v of p.x) { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
			for (const v of p.y) { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
		}
	}

	// Bounds from batched scene
	if (batchedScene) {
		for (const b of Object.values(batchedScene.layerBounds)) {
			if (b[0] < minX) minX = b[0];
			if (b[2] > maxX) maxX = b[2];
			if (b[1] < minY) minY = b[1];
			if (b[3] > maxY) maxY = b[3];
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
	const distance = (xyExtent / 2) / Math.tan(halfFov) * 1.3;
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
		gl.deleteBuffer(m.wireEBO);
	}
	for (const m of state.axisMeshes) gl.deleteVertexArray(m.vao);
	if (state.gridMesh) gl.deleteVertexArray(state.gridMesh.vao);
	gl.deleteProgram(state.program);
	gl.deleteProgram(state.lineProgram);
}
