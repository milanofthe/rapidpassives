/**
 * Lightweight raw-WebGL 3D renderer for extruded IC layout polygons.
 * No dependencies beyond browser WebGL2.
 */

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

interface GLState {
	gl: WebGL2RenderingContext;
	program: WebGLProgram;
	uMVP: WebGLUniformLocation;
	uNormalMat: WebGLUniformLocation;
	uColor: WebGLUniformLocation;
	uLightDir: WebGLUniformLocation;
	uAmbient: WebGLUniformLocation;
	meshes: Mesh[];
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

function linkProgram(gl: WebGL2RenderingContext): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
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

function hexToRgb(hex: string): [number, number, number] {
	const r = parseInt(hex.slice(1, 3), 16) / 255;
	const g = parseInt(hex.slice(3, 5), 16) / 255;
	const b = parseInt(hex.slice(5, 7), 16) / 255;
	return [r, g, b];
}

// ─── Ear-clip triangulation (simple polygons) ────────────────────────

function earClip(xs: number[], ys: number[]): number[] {
	const n = xs.length;
	if (n < 3) return [];

	// Build index list
	const indices: number[] = [];
	for (let i = 0; i < n; i++) indices.push(i);

	// Ensure CCW winding
	let area = 0;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		area += xs[i] * ys[j] - xs[j] * ys[i];
	}
	if (area < 0) indices.reverse();

	const triangles: number[] = [];
	let idx = [...indices];

	let safety = idx.length * 3;
	while (idx.length > 3 && safety-- > 0) {
		let earFound = false;
		const len = idx.length;
		for (let i = 0; i < len; i++) {
			const prev = idx[(i - 1 + len) % len];
			const curr = idx[i];
			const next = idx[(i + 1) % len];

			// Check if convex
			const cross =
				(xs[curr] - xs[prev]) * (ys[next] - ys[prev]) -
				(ys[curr] - ys[prev]) * (xs[next] - xs[prev]);
			if (cross <= 0) continue;

			// Check no other vertex inside this triangle
			let isEar = true;
			for (let j = 0; j < len; j++) {
				const p = idx[j];
				if (p === prev || p === curr || p === next) continue;
				if (pointInTriangle(xs[p], ys[p], xs[prev], ys[prev], xs[curr], ys[curr], xs[next], ys[next])) {
					isEar = false;
					break;
				}
			}
			if (isEar) {
				triangles.push(prev, curr, next);
				idx.splice(i, 1);
				earFound = true;
				break;
			}
		}
		if (!earFound) break;
	}
	if (idx.length === 3) {
		triangles.push(idx[0], idx[1], idx[2]);
	}
	return triangles;
}

function pointInTriangle(
	px: number, py: number,
	ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
	const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
	const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
	const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
	const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
	const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
	return !(hasNeg && hasPos);
}

// ─── Mesh building ───────────────────────────────────────────────────

/** Extrude a 2D polygon into a 3D slab and return positions + normals */
function extrudePolygon(poly: Polygon, zBottom: number, zTop: number): { positions: number[]; normals: number[] } {
	const positions: number[] = [];
	const normals: number[] = [];
	const { x, y } = poly;
	const n = x.length;

	// Triangulate top and bottom faces
	const tris = earClip(x, y);

	// Top face (normal +Z)
	for (let i = 0; i < tris.length; i += 3) {
		const a = tris[i], b = tris[i + 1], c = tris[i + 2];
		positions.push(x[a], y[a], zTop, x[b], y[b], zTop, x[c], y[c], zTop);
		normals.push(0, 0, 1, 0, 0, 1, 0, 0, 1);
	}

	// Bottom face (normal -Z, reversed winding)
	for (let i = 0; i < tris.length; i += 3) {
		const a = tris[i], b = tris[i + 1], c = tris[i + 2];
		positions.push(x[a], y[a], zBottom, x[c], y[c], zBottom, x[b], y[b], zBottom);
		normals.push(0, 0, -1, 0, 0, -1, 0, 0, -1);
	}

	// Side faces
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		const dx = x[j] - x[i];
		const dy = y[j] - y[i];
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 1e-10) continue;
		// Outward normal in XY plane
		const nx = dy / len;
		const ny = -dx / len;

		// Two triangles for each side quad
		positions.push(
			x[i], y[i], zBottom, x[j], y[j], zBottom, x[j], y[j], zTop,
			x[i], y[i], zBottom, x[j], y[j], zTop, x[i], y[i], zTop,
		);
		normals.push(
			nx, ny, 0, nx, ny, 0, nx, ny, 0,
			nx, ny, 0, nx, ny, 0, nx, ny, 0,
		);
	}

	return { positions, normals };
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

// ─── Matrix math (minimal) ──────────────────────────────────────────

type Mat4 = Float32Array;

function mat4Identity(): Mat4 {
	const m = new Float32Array(16);
	m[0] = m[5] = m[10] = m[15] = 1;
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
	const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
	if (!gl) return null;

	const program = linkProgram(gl);
	const uMVP = gl.getUniformLocation(program, 'uMVP')!;
	const uNormalMat = gl.getUniformLocation(program, 'uNormalMat')!;
	const uColor = gl.getUniformLocation(program, 'uColor')!;
	const uLightDir = gl.getUniformLocation(program, 'uLightDir')!;
	const uAmbient = gl.getUniformLocation(program, 'uAmbient')!;

	const bg = hexToRgb(canvasTheme.bg);
	gl.clearColor(bg[0], bg[1], bg[2], 1);
	gl.enable(gl.DEPTH_TEST);

	return { gl, program, uMVP, uNormalMat, uColor, uLightDir, uAmbient, meshes: [] };
}

/** Build meshes from layers + stack. Call when geometry or stack changes. */
export function buildMeshes(
	state: GLState,
	layers: LayerMap,
	stack: ProcessStack,
	colorOverrides?: Record<string, string>,
	visibleLayers?: Set<LayerName>,
): void {
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
	const zRange = isFinite(minZ) ? maxZ - minZ : 1;
	const cz = isFinite(minZ) ? (minZ + maxZ) / 2 : 0;

	// Use real physical Z values — no artificial scaling
	const zScale = 1;

	for (const layerName of LAYER_ORDER) {
		if (visibleLayers && !visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;

		const zInfo = layerZMap.get(layerName);
		if (!zInfo) continue;

		const colorHex = colorOverrides?.[layerName] ?? LAYER_COLORS[layerName] ?? '#888888';
		const color = hexToRgb(colorHex);

		// Batch all polygons of this layer into one mesh
		const allPos: number[] = [];
		const allNorm: number[] = [];

		for (const poly of polys) {
			const zBot = (zInfo.z - cz) * zScale;
			const zTop = (zInfo.z + zInfo.thickness - cz) * zScale;
			const { positions, normals } = extrudePolygon(
				{ x: poly.x.map(v => v - cx), y: poly.y.map(v => v - cy) },
				zBot, zTop,
			);
			allPos.push(...positions);
			allNorm.push(...normals);
		}

		if (allPos.length === 0) continue;

		const vao = createMesh(gl, allPos, allNorm);
		state.meshes.push({ vao, count: allPos.length / 3, color });
	}
}

/** Render one frame */
export function render3D(
	state: GLState,
	camera: Camera,
	width: number,
	height: number,
): void {
	const { gl, program, uMVP, uNormalMat, uColor, uLightDir, uAmbient } = state;

	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	gl.useProgram(program);

	const aspect = width / height || 1;
	const proj = mat4Perspective(Math.PI / 6, aspect, 0.1, 10000);
	const eye = cameraEye(camera);
	const view = mat4LookAt(eye, camera.target as number[], [0, 0, 1]);
	const vp = mat4Multiply(proj, view);
	const normalMat = mat3NormalFromMat4(view);

	gl.uniformMatrix4fv(uMVP, false, vp);
	gl.uniformMatrix3fv(uNormalMat, false, normalMat);

	// Directional light from upper-right
	const lx = 0.4, ly = 0.3, lz = 0.8;
	const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
	gl.uniform3f(uLightDir, lx / ll, ly / ll, lz / ll);
	gl.uniform1f(uAmbient, 0.35);

	for (const mesh of state.meshes) {
		gl.uniform3f(uColor, mesh.color[0], mesh.color[1], mesh.color[2]);
		gl.bindVertexArray(mesh.vao);
		gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
	}

	gl.bindVertexArray(null);
}

/** Compute a good initial camera distance to fit all geometry */
export function fitCamera(layers: LayerMap, stack: ProcessStack): Camera {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const v of p.x) { minX = Math.min(minX, v); maxX = Math.max(maxX, v); }
			for (const v of p.y) { minY = Math.min(minY, v); maxY = Math.max(maxY, v); }
		}
	}
	const xyExtent = Math.max(
		isFinite(maxX) ? maxX - minX : 1,
		isFinite(maxY) ? maxY - minY : 1,
	);
	// FOV is PI/6, so distance = extent / (2 * tan(fov/2)) with padding
	const halfFov = Math.PI / 12;
	const distance = (xyExtent / 2) / Math.tan(halfFov) * 1.3;
	return {
		theta: -Math.PI / 4,
		phi: Math.PI / 5,
		distance,
		target: [0, 0, 0],
	};
}

/** Clean up GL resources */
export function disposeGL(state: GLState): void {
	const { gl } = state;
	for (const m of state.meshes) {
		gl.deleteVertexArray(m.vao);
	}
	gl.deleteProgram(state.program);
}
