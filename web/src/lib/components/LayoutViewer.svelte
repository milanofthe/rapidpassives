<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayerMap, LayerName } from '$lib/geometry/types';
	import { LAYER_COLORS } from '$lib/geometry/types';
	import { fitToView, type ViewState, type RenderOptions } from '$lib/render/canvas2d';
	import { initGL2D, disposeGL2D, buildMeshes2D, render2DGL, type GL2DState } from '$lib/render/canvas2d_gl';

	let { layers, renderOpts, wireframe = false }: { layers: LayerMap; renderOpts?: RenderOptions; wireframe?: boolean } = $props();

	export function zoomIn() { zoomBy(1.3); }
	export function zoomOut() { zoomBy(1 / 1.3); }
	export function resetView() { autoFit(); }

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let glState: GL2DState | null = null;
	let view: ViewState = { offsetX: 0, offsetY: 0, scale: 1 };
	let isDragging = false;
	let lastMouse = { x: 0, y: 0 };
	let cursorWorld = $state({ x: 0, y: 0 });
	let mounted = false;
	let needsRebuild = true;

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
			canvas.style.width = w + 'px';
			canvas.style.height = h + 'px';
		}
		return { w, h };
	}

	function render() {
		if (!glState || !canvas) return;
		const { w, h } = syncCanvas();
		if (w <= 0 || h <= 0) return;

		if (needsRebuild) {
			needsRebuild = false;
			buildMeshes2D(glState, layers, renderOpts?.colorOverrides, renderOpts?.visibleLayers, () => {
				if (mounted && glState) {
					const { w, h } = getSize();
					if (w > 0 && h > 0) render2DGL(glState!, view.offsetX, view.offsetY, view.scale, w, h);
				}
			});
		}

		render2DGL(glState, view.offsetX, view.offsetY, view.scale, w, h, wireframe);
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
		}
	}

	function onPointerUp() {
		isDragging = false;
	}

	function onDblClick() {
		autoFit();
	}

	function zoomBy(factor: number) {
		if (!canvas) return;
		const { w, h } = getSize();
		const cx = w / 2, cy = h / 2;
		view = {
			scale: view.scale * factor,
			offsetX: cx - (cx - view.offsetX) * factor,
			offsetY: cy - (cy - view.offsetY) * factor,
		};
		render();
	}

	onMount(() => {
		mounted = true;
		glState = initGL2D(canvas);
		if (!glState) return;

		const ro = new ResizeObserver(() => {
			if (mounted) {
				syncCanvas();
				render();
			}
		});
		ro.observe(container);
		requestAnimationFrame(() => autoFit());

		return () => {
			mounted = false;
			ro.disconnect();
			if (glState) disposeGL2D(glState);
		};
	});

	// Rebuild meshes when geometry changes
	let lastLayerKey = '';
	$effect(() => {
		const key = Object.keys(layers).map(k => `${k}:${(layers as any)[k]?.length ?? 0}`).join(',');
		if (mounted && glState) {
			if (key !== lastLayerKey) {
				lastLayerKey = key;
				needsRebuild = true;
				autoFit();
			} else {
				render();
			}
		}
	});

	$effect(() => {
		renderOpts;
		if (mounted && glState) {
			needsRebuild = true;
			render();
		}
	});

	$effect(() => {
		wireframe;
		if (mounted && glState) render();
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
</style>
