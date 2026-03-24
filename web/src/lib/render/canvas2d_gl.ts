/**
 * GPU-accelerated 2D layout renderer using WebGL2.
 * Orthographic top-down view with flat shading — same visual as Canvas2D but GPU-fast.
 */

import earcut from 'earcut';
import type { LayerMap, LayerName, Polygon } from '$lib/geometry/types';
import { LAYER_COLORS, LAYER_ORDER } from '$lib/geometry/types';
import { canvas as canvasTheme } from '$lib/theme';
import type { RenderOptions } from './canvas2d';
export type { ViewState, RenderOptions } from './canvas2d';

// Re-export fitToView from canvas2d (still useful for computing view bounds)
export { fitToView } from './canvas2d';

// ─── Types ───────────────────────────────────────────────────────────

interface FlatMesh {
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

export interface GL2DState {
	gl: WebGL2RenderingContext;
	flatProgram: WebGLProgram;
	uFlatMVP: WebGLUniformLocation;
	uFlatColor: WebGLUniformLocation;
	lineProgram: WebGLProgram;
	uLineMVP: WebGLUniformLocation;
	uLineColor: WebGLUniformLocation;
	meshes: FlatMesh[];
	gridMesh: LineMesh | null;
	crosshairMesh: LineMesh | null;
}

// ─── Shaders ─────────────────────────────────────────────────────────

const FLAT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uMVP;
void main() {
	gl_Position = uMVP * vec4(aPos, 0.0, 1.0);
}`;

const FLAT_FS = `#version 300 es
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
		throw new Error('Shader: ' + gl.getShaderInfoLog(s));
	}
	return s;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
	const p = gl.createProgram()!;
	gl.attachShader(p, vs);
	gl.attachShader(p, fs);
	gl.linkProgram(p);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error('Link: ' + gl.getProgramInfoLog(p));
	}
	return p;
}

function hexToRgb(hex: string): [number, number, number] {
	return [
		parseInt(hex.slice(1, 3), 16) / 255,
		parseInt(hex.slice(3, 5), 16) / 255,
		parseInt(hex.slice(5, 7), 16) / 255,
	];
}

// ─── Init / dispose ──────────────────────────────────────────────────

export function initGL2D(canvas: HTMLCanvasElement): GL2DState | null {
	const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
	if (!gl) return null;

	const flatProgram = linkProgram(gl, FLAT_VS, FLAT_FS);
	const lineProgram = flatProgram; // same shader works for lines

	return {
		gl,
		flatProgram,
		uFlatMVP: gl.getUniformLocation(flatProgram, 'uMVP')!,
		uFlatColor: gl.getUniformLocation(flatProgram, 'uColor')!,
		lineProgram,
		uLineMVP: gl.getUniformLocation(flatProgram, 'uMVP')!,
		uLineColor: gl.getUniformLocation(flatProgram, 'uColor')!,
		meshes: [],
		gridMesh: null,
		crosshairMesh: null,
	};
}

export function disposeGL2D(state: GL2DState): void {
	const { gl } = state;
	for (const m of state.meshes) gl.deleteVertexArray(m.vao);
	if (state.gridMesh) gl.deleteVertexArray(state.gridMesh.vao);
	if (state.crosshairMesh) gl.deleteVertexArray(state.crosshairMesh.vao);
	state.meshes = [];
}

// ─── Triangulation ───────────────────────────────────────────────────

function triangulate(xs: number[], ys: number[]): number[] {
	// Remove duplicate consecutive vertices
	const cx: number[] = [], cy: number[] = [], idxMap: number[] = [];
	for (let i = 0; i < xs.length; i++) {
		if (cx.length > 0 && Math.abs(xs[i] - cx[cx.length - 1]) < 1e-10 && Math.abs(ys[i] - cy[cy.length - 1]) < 1e-10) continue;
		cx.push(xs[i]); cy.push(ys[i]); idxMap.push(i);
	}
	if (cx.length > 1 && Math.abs(cx[0] - cx[cx.length - 1]) < 1e-10 && Math.abs(cy[0] - cy[cy.length - 1]) < 1e-10) {
		cx.pop(); cy.pop(); idxMap.pop();
	}
	if (cx.length < 3) return [];
	let area = 0;
	for (let i = 0; i < cx.length; i++) { const j = (i + 1) % cx.length; area += cx[i] * cy[j] - cx[j] * cy[i]; }
	if (Math.abs(area) < 1e-20) return [];

	const coords = new Float64Array(cx.length * 2);
	for (let i = 0; i < cx.length; i++) { coords[i * 2] = cx[i]; coords[i * 2 + 1] = cy[i]; }
	const tris = earcut(coords as unknown as number[]);
	const result = new Array(tris.length);
	for (let i = 0; i < tris.length; i++) result[i] = idxMap[tris[i]];
	return result;
}

// ─── Mesh building ───────────────────────────────────────────────────

function createFlatMesh(gl: WebGL2RenderingContext, positions: Float32Array): { vao: WebGLVertexArrayObject; wireEBO: WebGLBuffer; wireCount: number } {
	const vao = gl.createVertexArray()!;
	gl.bindVertexArray(vao);
	const buf = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

	// Build wireframe edge indices from triangles
	const triCount = positions.length / 6; // 2 components * 3 verts
	const wireIndices = new Uint32Array(triCount * 6);
	for (let i = 0; i < triCount; i++) {
		const base = i * 3;
		const wi = i * 6;
		wireIndices[wi]     = base;     wireIndices[wi + 1] = base + 1;
		wireIndices[wi + 2] = base + 1; wireIndices[wi + 3] = base + 2;
		wireIndices[wi + 4] = base + 2; wireIndices[wi + 5] = base;
	}
	const wireEBO = gl.createBuffer()!;
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireEBO);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireIndices, gl.STATIC_DRAW);

	gl.bindVertexArray(null);
	return { vao, wireEBO, wireCount: wireIndices.length };
}

function createLineMesh2D(gl: WebGL2RenderingContext, positions: Float32Array): WebGLVertexArrayObject {
	const vao = gl.createVertexArray()!;
	gl.bindVertexArray(vao);
	const buf = gl.createBuffer()!;
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	gl.bindVertexArray(null);
	return vao;
}

/** Build GPU meshes from polygon data. Async with batched yields. */
let buildGen2D = 0;

export function buildMeshes2D(
	state: GL2DState,
	layers: LayerMap,
	colorOverrides?: Record<string, string>,
	visibleLayers?: Set<LayerName>,
	onBatch?: () => void,
): void {
	const gen = ++buildGen2D;
	buildMeshes2DAsync(state, layers, colorOverrides, visibleLayers, gen, onBatch);
}

async function buildMeshes2DAsync(
	state: GL2DState,
	layers: LayerMap,
	colorOverrides: Record<string, string> | undefined,
	visibleLayers: Set<LayerName> | undefined,
	gen: number,
	onBatch?: () => void,
): Promise<void> {
	const { gl } = state;

	// Clean up old
	for (const m of state.meshes) gl.deleteVertexArray(m.vao);
	state.meshes = [];

	let lastYield = performance.now();

	for (const layerName of LAYER_ORDER) {
		if (gen !== buildGen2D) return;
		if (visibleLayers && !visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;

		const colorHex = colorOverrides?.[layerName] ?? LAYER_COLORS[layerName] ?? '#888888';
		const color = hexToRgb(colorHex);

		// Triangulate all polygons in this layer into a single buffer
		const verts: number[] = [];

		for (let pi = 0; pi < polys.length; pi++) {
			const poly = polys[pi];
			const tris = triangulate(poly.x, poly.y);
			for (let i = 0; i < tris.length; i++) {
				verts.push(poly.x[tris[i]], poly.y[tris[i]]);
			}

			// Yield every ~30ms
			const now = performance.now();
			if (now - lastYield > 30 && pi < polys.length - 1) {
				if (gen !== buildGen2D) return;
				// Flush current batch
				if (verts.length > 0) {
					const { vao, wireEBO, wireCount } = createFlatMesh(gl, new Float32Array(verts));
					state.meshes.push({ vao, wireEBO, wireCount, count: verts.length / 2, color });
					verts.length = 0;
				}
				lastYield = now;
				await new Promise(r => requestAnimationFrame(r));
				onBatch?.();
			}
		}

		if (verts.length > 0) {
			if (gen !== buildGen2D) return;
			const { vao, wireEBO, wireCount } = createFlatMesh(gl, new Float32Array(verts));
			state.meshes.push({ vao, wireEBO, wireCount, count: verts.length / 2, color });
		}
	}

	onBatch?.();
}

// ─── Grid ────────────────────────────────────────────────────────────

function buildGrid2D(state: GL2DState, viewLeft: number, viewRight: number, viewBottom: number, viewTop: number): void {
	const { gl } = state;
	if (state.gridMesh) gl.deleteVertexArray(state.gridMesh.vao);
	if (state.crosshairMesh) gl.deleteVertexArray(state.crosshairMesh.vao);
	state.gridMesh = null;
	state.crosshairMesh = null;

	const worldW = viewRight - viewLeft;
	const worldH = viewTop - viewBottom;

	// Grid — same niceStep logic as 3D renderer
	const extent = Math.max(worldW, worldH);
	const raw = extent / 10;
	const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
	const norm = raw / magnitude;
	let gridStep: number;
	if (norm <= 1) gridStep = magnitude;
	else if (norm <= 2) gridStep = 2 * magnitude;
	else if (norm <= 5) gridStep = 5 * magnitude;
	else gridStep = 10 * magnitude;

	const lines: number[] = [];
	const startX = Math.floor(viewLeft / gridStep) * gridStep;
	const startY = Math.floor(viewBottom / gridStep) * gridStep;
	for (let x = startX; x <= viewRight; x += gridStep) {
		lines.push(x, viewBottom, x, viewTop);
	}
	for (let y = startY; y <= viewTop; y += gridStep) {
		lines.push(viewLeft, y, viewRight, y);
	}

	if (lines.length > 0) {
		const vao = createLineMesh2D(gl, new Float32Array(lines));
		const c = hexToRgb(canvasTheme.grid);
		state.gridMesh = { vao, count: lines.length / 2, color: c };
	}

	// Crosshair at origin
	const ch: number[] = [
		0, viewBottom, 0, viewTop,
		viewLeft, 0, viewRight, 0,
	];
	const chVao = createLineMesh2D(gl, new Float32Array(ch));
	const chColor = hexToRgb(canvasTheme.crosshair);
	state.crosshairMesh = { vao: chVao, count: 4, color: chColor };
}

// ─── Render ──────────────────────────────────────────────────────────

/** Orthographic projection: maps world coords to clip space given view offset/scale and viewport size */
function orthoMatrix(offsetX: number, offsetY: number, scale: number, width: number, height: number): Float32Array {
	// View transforms: screen_x = world_x * scale + offsetX
	//                  screen_y = -world_y * scale + offsetY  (Y flipped)
	// Then screen to clip: clip_x = screen_x / (width/2) - 1
	//                      clip_y = 1 - screen_y / (height/2)
	const sx = 2 * scale / width;
	const sy = 2 * scale / height;
	const tx = 2 * offsetX / width - 1;
	const ty = 1 - 2 * offsetY / height;

	// Column-major 4x4
	return new Float32Array([
		sx,  0,   0, 0,
		0,   sy,  0, 0,
		0,   0,   1, 0,
		tx,  ty,  0, 1,
	]);
}

export function render2DGL(
	state: GL2DState,
	offsetX: number,
	offsetY: number,
	scale: number,
	width: number,
	height: number,
	wireframe: boolean = false,
): void {
	const { gl } = state;
	gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

	const bg = hexToRgb(canvasTheme.bg);
	gl.clearColor(bg[0], bg[1], bg[2], 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Rebuild grid for current view (cheap — just a few hundred verts)
	const viewLeft = -offsetX / scale;
	const viewRight = (width - offsetX) / scale;
	const viewTop = offsetY / scale;
	const viewBottom = (offsetY - height) / scale;
	buildGrid2D(state, viewLeft, viewRight, viewBottom, viewTop);

	const mvp = orthoMatrix(offsetX, offsetY, scale, width, height);

	gl.useProgram(state.flatProgram);
	gl.uniformMatrix4fv(state.uFlatMVP, false, mvp);

	// Grid
	if (state.gridMesh) {
		gl.uniform3f(state.uFlatColor, state.gridMesh.color[0], state.gridMesh.color[1], state.gridMesh.color[2]);
		gl.bindVertexArray(state.gridMesh.vao);
		gl.drawArrays(gl.LINES, 0, state.gridMesh.count);
	}
	// Crosshair
	if (state.crosshairMesh) {
		gl.uniform3f(state.uFlatColor, state.crosshairMesh.color[0], state.crosshairMesh.color[1], state.crosshairMesh.color[2]);
		gl.bindVertexArray(state.crosshairMesh.vao);
		gl.drawArrays(gl.LINES, 0, state.crosshairMesh.count);
	}

	// Polygons (back to front — meshes are already in layer order)
	if (wireframe) {
		for (const mesh of state.meshes) {
			gl.uniform3f(state.uFlatColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.wireEBO);
			gl.drawElements(gl.LINES, mesh.wireCount, gl.UNSIGNED_INT, 0);
		}
	} else {
		for (const mesh of state.meshes) {
			gl.uniform3f(state.uFlatColor, mesh.color[0], mesh.color[1], mesh.color[2]);
			gl.bindVertexArray(mesh.vao);
			gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
		}
	}

	gl.bindVertexArray(null);
}
