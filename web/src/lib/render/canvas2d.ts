import type { LayerMap, Polygon, LayerName } from '$lib/geometry/types';
import { LAYER_COLORS, LAYER_ORDER } from '$lib/geometry/types';
import { canvas as canvasTheme } from '$lib/theme';

export interface ViewState {
	offsetX: number;
	offsetY: number;
	scale: number;
}

export function createViewState(): ViewState {
	return { offsetX: 0, offsetY: 0, scale: 1 };
}

/** Fit all geometry into the given viewport dimensions with padding */
export function fitToView(canvasW: number, canvasH: number, layers: LayerMap): ViewState {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const x of p.x) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
			for (const y of p.y) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
		}
	}

	if (!isFinite(minX)) return { offsetX: canvasW / 2, offsetY: canvasH / 2, scale: 1 };

	const geoW = maxX - minX || 1;
	const geoH = maxY - minY || 1;
	const pad = 0.08;
	const availW = canvasW * (1 - pad * 2);
	const availH = canvasH * (1 - pad * 2);
	const scale = Math.min(availW / geoW, availH / geoH);

	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;

	return {
		scale,
		offsetX: canvasW / 2 - cx * scale,
		offsetY: canvasH / 2 + cy * scale,
	};
}

/** Hit-test: find which layer+polygon the cursor is over */
export function hitTest(
	layers: LayerMap, view: ViewState, screenX: number, screenY: number,
	opts?: RenderOptions
): { layer: LayerName; index: number } | null {
	const worldX = (screenX - view.offsetX) / view.scale;
	const worldY = -(screenY - view.offsetY) / view.scale;

	// Check layers in reverse draw order (front to back)
	for (let li = LAYER_ORDER.length - 1; li >= 0; li--) {
		const layerName = LAYER_ORDER[li];
		if (opts?.visibleLayers && !opts.visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;
		for (let pi = polys.length - 1; pi >= 0; pi--) {
			if (pointInPolygon(worldX, worldY, polys[pi])) {
				return { layer: layerName, index: pi };
			}
		}
	}
	return null;
}

function pointInPolygon(px: number, py: number, poly: Polygon): boolean {
	const { x, y } = poly;
	const n = x.length;
	let inside = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		if (((y[i] > py) !== (y[j] > py)) &&
			(px < (x[j] - x[i]) * (py - y[i]) / (y[j] - y[i]) + x[i])) {
			inside = !inside;
		}
	}
	return inside;
}

export interface PortMarker {
	name: string;
	x: number;
	y: number;
}

export interface RenderOptions {
	colorOverrides?: Record<string, string>;
	visibleLayers?: Set<LayerName>;
	ports?: PortMarker[];
}

/** Render all layers to a canvas context */
export function renderLayers(
	ctx: CanvasRenderingContext2D,
	layers: LayerMap,
	view: ViewState,
	highlight?: { layer: LayerName; index: number } | null,
	opts?: RenderOptions,
	cssWidth?: number,
	cssHeight?: number,
): void {
	const dpr = window.devicePixelRatio || 1;
	const width = cssWidth ?? ctx.canvas.width / dpr;
	const height = cssHeight ?? ctx.canvas.height / dpr;
	ctx.clearRect(0, 0, width, height);

	// Background
	ctx.fillStyle = canvasTheme.bg;
	ctx.fillRect(0, 0, width, height);

	drawGrid(ctx, view, width, height);
	drawCrosshair(ctx, view, width, height);

	// Layers back to front
	for (const layerName of LAYER_ORDER) {
		if (opts?.visibleLayers && !opts.visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;

		const baseColor = opts?.colorOverrides?.[layerName] ?? LAYER_COLORS[layerName] ?? '#888';
		for (let pi = 0; pi < polys.length; pi++) {
			const isHighlighted = highlight && highlight.layer === layerName && highlight.index === pi;
			if (isHighlighted) {
				ctx.fillStyle = brighten(baseColor, canvasTheme.highlightBrighten);
			} else {
				ctx.fillStyle = baseColor;
			}
			drawPolygon(ctx, polys[pi], view);
		}
	}

	// Highlight outline
	if (highlight) {
		const polys = layers[highlight.layer];
		if (polys && polys[highlight.index]) {
			ctx.strokeStyle = canvasTheme.highlightOutline;
			ctx.lineWidth = canvasTheme.highlightOutlineWeight;
			drawPolygonOutline(ctx, polys[highlight.index], view);
		}
	}

	// Port markers
	if (opts?.ports) {
		for (const port of opts.ports) {
			drawPort(ctx, port, view);
		}
	}
}

function brighten(hex: string, amount: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgb(${Math.min(255, r + (255 - r) * amount)}, ${Math.min(255, g + (255 - g) * amount)}, ${Math.min(255, b + (255 - b) * amount)})`;
}

function drawPolygon(ctx: CanvasRenderingContext2D, poly: Polygon, view: ViewState): void {
	if (poly.x.length < 2) return;
	ctx.beginPath();
	ctx.moveTo(poly.x[0] * view.scale + view.offsetX, -poly.y[0] * view.scale + view.offsetY);
	for (let i = 1; i < poly.x.length; i++) {
		ctx.lineTo(poly.x[i] * view.scale + view.offsetX, -poly.y[i] * view.scale + view.offsetY);
	}
	ctx.closePath();
	ctx.fill();
}

function drawPolygonOutline(ctx: CanvasRenderingContext2D, poly: Polygon, view: ViewState): void {
	if (poly.x.length < 2) return;
	ctx.beginPath();
	ctx.moveTo(poly.x[0] * view.scale + view.offsetX, -poly.y[0] * view.scale + view.offsetY);
	for (let i = 1; i < poly.x.length; i++) {
		ctx.lineTo(poly.x[i] * view.scale + view.offsetX, -poly.y[i] * view.scale + view.offsetY);
	}
	ctx.closePath();
	ctx.stroke();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: ViewState, width: number, height: number): void {

	const targetPx = 60;
	const worldSpacing = targetPx / view.scale;
	const magnitude = Math.pow(10, Math.floor(Math.log10(worldSpacing)));
	const residual = worldSpacing / magnitude;
	let gridStep: number;
	if (residual < 2) gridStep = magnitude;
	else if (residual < 5) gridStep = 2 * magnitude;
	else gridStep = 5 * magnitude;

	ctx.strokeStyle = canvasTheme.grid;
	ctx.lineWidth = canvasTheme.gridWeight;

	const worldLeft = -view.offsetX / view.scale;
	const worldRight = (width - view.offsetX) / view.scale;
	const startX = Math.floor(worldLeft / gridStep) * gridStep;
	for (let wx = startX; wx <= worldRight; wx += gridStep) {
		const sx = wx * view.scale + view.offsetX;
		ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
	}

	const worldTop = view.offsetY / view.scale;
	const worldBottom = (view.offsetY - height) / view.scale;
	const startY = Math.floor(worldBottom / gridStep) * gridStep;
	for (let wy = startY; wy <= worldTop; wy += gridStep) {
		const sy = -wy * view.scale + view.offsetY;
		ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
	}
}

function drawCrosshair(ctx: CanvasRenderingContext2D, view: ViewState, width: number, height: number): void {
	const cx = view.offsetX;
	const cy = view.offsetY;
	ctx.strokeStyle = canvasTheme.crosshair;
	ctx.lineWidth = canvasTheme.crosshairWeight;
	ctx.setLineDash(canvasTheme.crosshairDash);
	ctx.beginPath();
	ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
	ctx.moveTo(0, cy); ctx.lineTo(width, cy);
	ctx.stroke();
	ctx.setLineDash([]);
}

function drawPort(ctx: CanvasRenderingContext2D, port: PortMarker, view: ViewState): void {
	const sx = port.x * view.scale + view.offsetX;
	const sy = -port.y * view.scale + view.offsetY;

	// Label with background
	const label = port.name;
	ctx.font = '600 10px JetBrains Mono, monospace';
	const tm = ctx.measureText(label);
	const pw = tm.width + 8;
	const ph = 16;
	const lx = sx + 6;
	const ly = sy - ph / 2;

	// Background pill
	ctx.fillStyle = canvasTheme.bg;
	ctx.fillRect(lx, ly, pw, ph);

	// Text
	ctx.fillStyle = canvasTheme.highlightOutline;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, lx + 4, sy);

	// Dot
	ctx.beginPath();
	ctx.arc(sx, sy, 3, 0, 2 * Math.PI);
	ctx.fillStyle = canvasTheme.highlightOutline;
	ctx.fill();
}
