<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayerMap, LayerName } from '$lib/geometry/types';
	import type { ProcessStack } from '$lib/stack/types';
	import { initGL, buildMeshes, render3D, fitCamera, disposeGL, createCamera, type Camera } from '$lib/render/canvas3d';

	let { layers, stack, colorOverrides, visibleLayers, wireframe = false }: {
		layers: LayerMap;
		stack: ProcessStack;
		colorOverrides?: Record<string, string>;
		visibleLayers?: Set<LayerName>;
		wireframe?: boolean;
	} = $props();

	export function zoomIn() {
		camera = { ...camera, distance: camera.distance / 1.3 };
		renderFrame();
	}
	export function zoomOut() {
		camera = { ...camera, distance: camera.distance * 1.3 };
		renderFrame();
	}
	export function resetView() {
		camera = fitCamera(layers, stack);
		renderFrame();
	}

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let glState: ReturnType<typeof initGL> = null;
	let camera: Camera = createCamera();
	let isDragging = false;
	let isRightDrag = false;
	let lastMouse = { x: 0, y: 0 };
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

	function renderFrame() {
		if (!glState || !canvas) return;
		const { w, h } = syncCanvas();
		if (w <= 0 || h <= 0) return;

		if (needsRebuild) {
			buildMeshes(glState, layers, stack, colorOverrides, visibleLayers);
			needsRebuild = false;
		}

		render3D(glState, camera, w, h, wireframe);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
		camera = { ...camera, distance: camera.distance * factor };
		renderFrame();
	}

	function onPointerDown(e: PointerEvent) {
		isDragging = true;
		isRightDrag = e.button === 2;
		lastMouse = { x: e.clientX, y: e.clientY };
		canvas.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging) return;
		const dx = e.clientX - lastMouse.x;
		const dy = e.clientY - lastMouse.y;
		lastMouse = { x: e.clientX, y: e.clientY };

		if (isRightDrag) {
			// Pan — move target in the camera's local right/up directions
			const panScale = camera.distance * 0.0007;
			const ct = Math.cos(camera.theta), st = Math.sin(camera.theta);
			camera = {
				...camera,
				target: [
					camera.target[0] + (dx * ct - dy * st * Math.sin(camera.phi)) * panScale,
					camera.target[1] - (dx * st + dy * ct * Math.sin(camera.phi)) * panScale,
					camera.target[2] + dy * Math.cos(camera.phi) * panScale,
				],
			};
		} else {
			// Orbit
			camera = {
				...camera,
				theta: camera.theta + dx * 0.005,
				phi: Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.phi + dy * 0.005)),
			};
		}
		renderFrame();
	}

	function onPointerUp() {
		isDragging = false;
		isRightDrag = false;
	}

	function onContextMenu(e: Event) {
		e.preventDefault();
	}

	function onDblClick() {
		camera = fitCamera(layers, stack);
		renderFrame();
	}

	onMount(() => {
		mounted = true;
		glState = initGL(canvas);
		if (!glState) return;

		camera = fitCamera(layers, stack);

		const ro = new ResizeObserver(() => {
			if (mounted) renderFrame();
		});
		ro.observe(container);

		requestAnimationFrame(() => {
			needsRebuild = true;
			renderFrame();
		});

		return () => {
			mounted = false;
			ro.disconnect();
			if (glState) disposeGL(glState);
		};
	});

	// Rebuild meshes when geometry or render options change
	let lastLayerKey = '';
	$effect(() => {
		const key = Object.keys(layers).map(k => `${k}:${(layers as any)[k]?.length ?? 0}`).join(',');
		if (mounted && glState) {
			if (key !== lastLayerKey) {
				lastLayerKey = key;
				camera = fitCamera(layers, stack);
			}
			needsRebuild = true;
			renderFrame();
		}
	});

	$effect(() => {
		// Track render option changes
		colorOverrides;
		visibleLayers;
		stack;
		wireframe;
		if (mounted && glState) {
			needsRebuild = true;
			renderFrame();
		}
	});
</script>

<div class="viewer3d" bind:this={container}>
	<canvas
		bind:this={canvas}
		onwheel={onWheel}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		oncontextmenu={onContextMenu}
		ondblclick={onDblClick}
	></canvas>
	<div class="hud3d">
		<span class="label">3D</span>
	</div>
</div>

<style>
	.viewer3d {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
	}
	canvas:active {
		cursor: grabbing;
	}
	.hud3d {
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
	.label {
		font-weight: 600;
		color: var(--accent);
	}
</style>
