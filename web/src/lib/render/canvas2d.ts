import type { LayerMap, Polygon, LayerName } from '$lib/geometry/types';
import { LAYER_COLORS, LAYER_ORDER } from '$lib/geometry/types';

export interface ViewState {
	offsetX: number;
	offsetY: number;
	scale: number;
}

export function createViewState(): ViewState {
	return { offsetX: 0, offsetY: 0, scale: 1 };
}

/** Fit all geometry into the canvas with some padding */
export function fitToView(canvasW: number, canvasH: number, layers: LayerMap): ViewState {
	let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

	for (const polys of Object.values(layers)) {
		if (!polys) continue;
		for (const p of polys) {
			for (const x of p.x) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
			for (const y of p.y) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
		}
	}

	if (!isFinite(minX)) return createViewState();

	const w = maxX - minX || 1;
	const h = maxY - minY || 1;
	const padding = 0.1;
	const scaleX = canvasW * (1 - padding * 2) / w;
	const scaleY = canvasH * (1 - padding * 2) / h;
	const scale = Math.min(scaleX, scaleY);

	return {
		scale,
		offsetX: canvasW / 2 - (minX + maxX) / 2 * scale,
		offsetY: canvasH / 2 + (minY + maxY) / 2 * scale, // flip Y
	};
}

/** Render all layers to a canvas context */
export function renderLayers(
	ctx: CanvasRenderingContext2D,
	layers: LayerMap,
	view: ViewState,
	visibleLayers?: Set<LayerName>
): void {
	const { width, height } = ctx.canvas;
	ctx.clearRect(0, 0, width, height);

	// Background
	ctx.fillStyle = '#0d0d1a';
	ctx.fillRect(0, 0, width, height);

	// Grid
	drawGrid(ctx, view);

	// Layers back to front
	for (const layerName of LAYER_ORDER) {
		if (visibleLayers && !visibleLayers.has(layerName)) continue;
		const polys = layers[layerName];
		if (!polys || polys.length === 0) continue;

		ctx.fillStyle = LAYER_COLORS[layerName] || '#888';
		for (const poly of polys) {
			drawPolygon(ctx, poly, view);
		}
	}

	// Origin crosshair
	drawCrosshair(ctx, view);
}

function drawPolygon(ctx: CanvasRenderingContext2D, poly: Polygon, view: ViewState): void {
	if (poly.x.length < 2) return;
	ctx.beginPath();
	const x0 = poly.x[0] * view.scale + view.offsetX;
	const y0 = -poly.y[0] * view.scale + view.offsetY;
	ctx.moveTo(x0, y0);
	for (let i = 1; i < poly.x.length; i++) {
		ctx.lineTo(poly.x[i] * view.scale + view.offsetX, -poly.y[i] * view.scale + view.offsetY);
	}
	ctx.closePath();
	ctx.fill();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: ViewState): void {
	const { width, height } = ctx.canvas;

	// Adaptive grid spacing
	const targetPx = 50;
	const worldSpacing = targetPx / view.scale;
	const magnitude = Math.pow(10, Math.floor(Math.log10(worldSpacing)));
	const residual = worldSpacing / magnitude;
	let gridStep: number;
	if (residual < 2) gridStep = magnitude;
	else if (residual < 5) gridStep = 2 * magnitude;
	else gridStep = 5 * magnitude;

	ctx.strokeStyle = '#1a1a3e';
	ctx.lineWidth = 0.5;

	// Vertical lines
	const worldLeft = -view.offsetX / view.scale;
	const worldRight = (width - view.offsetX) / view.scale;
	const startX = Math.floor(worldLeft / gridStep) * gridStep;
	for (let wx = startX; wx <= worldRight; wx += gridStep) {
		const sx = wx * view.scale + view.offsetX;
		ctx.beginPath();
		ctx.moveTo(sx, 0);
		ctx.lineTo(sx, height);
		ctx.stroke();
	}

	// Horizontal lines
	const worldTop = (view.offsetY) / view.scale;
	const worldBottom = (view.offsetY - height) / view.scale;
	const startY = Math.floor(worldBottom / gridStep) * gridStep;
	for (let wy = startY; wy <= worldTop; wy += gridStep) {
		const sy = -wy * view.scale + view.offsetY;
		ctx.beginPath();
		ctx.moveTo(0, sy);
		ctx.lineTo(width, sy);
		ctx.stroke();
	}
}

function drawCrosshair(ctx: CanvasRenderingContext2D, view: ViewState): void {
	const cx = view.offsetX;
	const cy = view.offsetY;
	ctx.strokeStyle = '#444';
	ctx.lineWidth = 1;
	ctx.setLineDash([4, 4]);
	ctx.beginPath();
	ctx.moveTo(cx, 0);
	ctx.lineTo(cx, ctx.canvas.height);
	ctx.moveTo(0, cy);
	ctx.lineTo(ctx.canvas.width, cy);
	ctx.stroke();
	ctx.setLineDash([]);
}
