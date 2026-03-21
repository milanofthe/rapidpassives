<script lang="ts">
	import type { LayerMap, LayerName } from '$lib/geometry/types';
	import { fitToView, renderLayers, type ViewState } from '$lib/render/canvas2d';

	let { layers }: { layers: LayerMap } = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let view: ViewState = { offsetX: 0, offsetY: 0, scale: 1 };
	let isDragging = false;
	let lastMouse = { x: 0, y: 0 };
	let cursorWorld = $state({ x: 0, y: 0 });

	function setupCanvas() {
		if (!canvas || !container) return;
		const dpr = window.devicePixelRatio || 1;
		const rect = container.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		canvas.style.width = rect.width + 'px';
		canvas.style.height = rect.height + 'px';
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		// Reset canvas dimensions for rendering (use CSS size)
		canvas.width = rect.width;
		canvas.height = rect.height;
	}

	function render() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		renderLayers(ctx, layers, view);
	}

	function autoFit() {
		if (!canvas) return;
		view = fitToView(canvas, layers);
		render();
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;

		const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		const newScale = view.scale * zoomFactor;

		view = {
			scale: newScale,
			offsetX: mx - (mx - view.offsetX) * zoomFactor,
			offsetY: my - (my - view.offsetY) * zoomFactor,
		};
		render();
	}

	function onPointerDown(e: PointerEvent) {
		isDragging = true;
		lastMouse = { x: e.clientX, y: e.clientY };
		canvas.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		cursorWorld = {
			x: (mx - view.offsetX) / view.scale,
			y: -(my - view.offsetY) / view.scale,
		};

		if (!isDragging) return;
		const dx = e.clientX - lastMouse.x;
		const dy = e.clientY - lastMouse.y;
		view = { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
		lastMouse = { x: e.clientX, y: e.clientY };
		render();
	}

	function onPointerUp() {
		isDragging = false;
	}

	$effect(() => {
		// Re-render when layers change
		layers;
		if (canvas) {
			setupCanvas();
			autoFit();
		}
	});
</script>

<div class="viewer" bind:this={container}>
	<canvas
		bind:this={canvas}
		onwheel={onWheel}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
	></canvas>
	<div class="coords">
		x: {cursorWorld.x.toFixed(1)}, y: {cursorWorld.y.toFixed(1)}
	</div>
	<button class="fit-btn" onclick={autoFit}>Fit</button>
</div>

<style>
	.viewer {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
	canvas {
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}
	.coords {
		position: absolute;
		bottom: 8px;
		left: 8px;
		font-size: 11px;
		color: var(--text-muted);
		font-family: monospace;
		background: rgba(0,0,0,0.5);
		padding: 2px 6px;
		border-radius: 3px;
	}
	.fit-btn {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 4px 10px;
		font-size: 11px;
		background: var(--bg-panel);
		border: 1px solid var(--border);
	}
</style>
