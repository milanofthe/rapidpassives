<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayerMap, LayerName } from '$lib/geometry/types';
	import { fitToView, renderLayers, hitTest, type ViewState, type RenderOptions } from '$lib/render/canvas2d';
	import { LAYER_COLORS } from '$lib/geometry/types';

	let { layers, renderOpts }: { layers: LayerMap; renderOpts?: RenderOptions } = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let view: ViewState = { offsetX: 0, offsetY: 0, scale: 1 };
	let isDragging = false;
	let lastMouse = { x: 0, y: 0 };
	let cursorWorld = $state({ x: 0, y: 0 });
	let hovered = $state<{ layer: LayerName; index: number } | null>(null);
	let mounted = false;

	function getSize(): { w: number; h: number } {
		if (!container) return { w: 0, h: 0 };
		const rect = container.getBoundingClientRect();
		return { w: Math.round(rect.width), h: Math.round(rect.height) };
	}

	function syncCanvas(): { w: number; h: number } {
		const { w, h } = getSize();
		if (w <= 0 || h <= 0 || !canvas) return { w, h };
		const dpr = window.devicePixelRatio || 1;
		const bw = Math.round(w * dpr);
		const bh = Math.round(h * dpr);
		if (canvas.width !== bw || canvas.height !== bh) {
			canvas.width = bw;
			canvas.height = bh;
		}
		return { w, h };
	}

	function render() {
		if (!canvas) return;
		const { w, h } = syncCanvas();
		if (w <= 0 || h <= 0) return;
		const dpr = window.devicePixelRatio || 1;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.save();
		ctx.scale(dpr, dpr);
		// Tell the renderer the CSS dimensions, not the backing store dimensions
		canvas.style.width = w + 'px';
		canvas.style.height = h + 'px';
		renderLayers(ctx, layers, view, hovered, renderOpts, w, h);
		ctx.restore();
	}

	function autoFit() {
		if (!canvas) return;
		const { w, h } = syncCanvas();
		if (w === 0 || h === 0) return;
		view = fitToView(w, h, layers);
		render();
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

		view = {
			scale: view.scale * zoomFactor,
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

		if (isDragging) {
			const dx = e.clientX - lastMouse.x;
			const dy = e.clientY - lastMouse.y;
			view = { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
			lastMouse = { x: e.clientX, y: e.clientY };
			render();
		} else {
			const hit = hitTest(layers, view, mx, my, renderOpts);
			if (hit?.layer !== hovered?.layer || hit?.index !== hovered?.index) {
				hovered = hit;
				render();
			}
		}
	}

	function onPointerUp() {
		isDragging = false;
	}

	function onDblClick() {
		autoFit();
	}

	onMount(() => {
		mounted = true;
		const ro = new ResizeObserver(() => {
			if (mounted) {
				syncCanvas();
				render();
			}
		});
		ro.observe(container);
		// Initial fit after layout settles
		requestAnimationFrame(() => autoFit());
		return () => ro.disconnect();
	});

	// Only auto-fit when geometry structurally changes (not on every re-render)
	let lastLayerKey = '';
	$effect(() => {
		const key = Object.keys(layers).map(k => `${k}:${(layers as any)[k]?.length ?? 0}`).join(',');
		if (mounted && canvas) {
			if (key !== lastLayerKey) {
				lastLayerKey = key;
				autoFit();
			} else {
				render();
			}
		}
	});

	$effect(() => {
		renderOpts;
		if (mounted && canvas) {
			render();
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
		ondblclick={onDblClick}
	></canvas>
	<div class="hud">
		<span class="coord">x {cursorWorld.x.toFixed(1)}</span>
		<span class="coord">y {cursorWorld.y.toFixed(1)}</span>
		{#if hovered}
			<span class="layer-tag" style="color: {renderOpts?.colorOverrides?.[hovered.layer] ?? LAYER_COLORS[hovered.layer] ?? 'var(--accent)'}">{hovered.layer}</span>
		{/if}
	</div>
</div>

<style>
	.viewer {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: crosshair;
	}
	.hud {
		position: absolute;
		bottom: 8px;
		left: 8px;
		display: flex;
		gap: 10px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
		background: var(--canvas-bg);
		padding: 3px 8px;
	}
	.layer-tag {
		font-weight: 600;
	}
</style>
