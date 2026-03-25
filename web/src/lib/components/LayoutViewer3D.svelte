<script lang="ts">
	import { onMount } from 'svelte';
	import type { LayerMap, LayerName } from '$lib/geometry/types';
	import type { ProcessStack } from '$lib/stack/types';
	import { initGL, buildMeshes, buildInstancedMeshes, render3D, fitCamera, disposeGL, createCamera, type Camera, type InstancedSceneData } from '$lib/render/canvas3d';

	let { layers, stack, colorOverrides, visibleLayers, wireframe = false, ortho = false, instancedScene, gdsLayerMap }: {
		layers: LayerMap;
		stack: ProcessStack;
		colorOverrides?: Record<string, string>;
		visibleLayers?: Set<LayerName>;
		wireframe?: boolean;
		ortho?: boolean;
		instancedScene?: InstancedSceneData | null;
		gdsLayerMap?: Record<number, string>;
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
		camera = fitCamera(layers, stack, instancedScene);
		if (orthoBlend > 0.5) {
			camera = { ...camera, phi: Math.PI / 2 - 0.05, theta: 0 };
		}
		renderFrame();
	}

	export function saveScreenshot() {
		if (!glState || !canvas) return;
		// Re-render to ensure the canvas has current content (WebGL preserveDrawingBuffer is false by default)
		renderFrame();
		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'layout.png';
			a.click();
			URL.revokeObjectURL(url);
		});
	}

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let glState: ReturnType<typeof initGL> = null;
	let camera: Camera = createCamera();
	let isDragging = false;
	let isRightDrag = false;
	let lastMouse = { x: 0, y: 0 };
	let cursorWorld = $state({ x: 0, y: 0 });
	let mounted = false;
	let needsRebuild = true;

	// Animated ortho blend: 0 = perspective, 1 = orthographic
	let orthoBlend = ortho ? 1 : 0;
	let animId = 0;
	let lastOrtho = ortho;

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
			needsRebuild = false;
			const onBatch = () => {
				if (mounted && glState && canvas) {
					const { w, h } = syncCanvas();
					if (w > 0 && h > 0) render3D(glState!, camera, w, h, wireframe, orthoBlend);
				}
			};
			if (instancedScene) {
				buildInstancedMeshes(glState, instancedScene, stack, colorOverrides, onBatch, gdsLayerMap);
			} else {
				buildMeshes(glState, layers, stack, colorOverrides, visibleLayers, onBatch);
			}
		}

		render3D(glState, camera, w, h, wireframe, orthoBlend);
	}

	// Animate ortho blend when `ortho` prop changes
	// Animate between 2D (ortho=true) and 3D (ortho=false)
	$effect(() => {
		const toOrtho = ortho;
		if (!mounted) {
			orthoBlend = toOrtho ? 1 : 0;
			if (toOrtho) camera = { ...camera, phi: Math.PI / 2 - 0.05, theta: 0 };
			return;
		}

		const startBlend = orthoBlend;
		const startPhi = camera.phi;
		const startTheta = camera.theta;
		// 2D: phi=PI/2, theta=0  |  3D: phi=PI/4, theta=PI/4
		const targetBlend = toOrtho ? 1 : 0;
		const targetPhi = toOrtho ? Math.PI / 2 - 0.05 : Math.PI / 4;
		const targetTheta = toOrtho ? 0 : Math.PI / 4;

		const id = ++animId;
		const startTime = performance.now();
		const duration = 400;

		function tick() {
			if (!mounted || id !== animId) return;
			const t = Math.min(1, (performance.now() - startTime) / duration);
			const e = 1 - Math.pow(1 - t, 3);
			orthoBlend = startBlend + (targetBlend - startBlend) * e;
			camera = {
				...camera,
				phi: startPhi + (targetPhi - startPhi) * e,
				theta: startTheta + (targetTheta - startTheta) * e,
			};
			renderFrame();
			if (t < 1) requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	});

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		if (orthoBlend > 0.5) {
			// 2D-style zoom: zoom toward cursor
			const rect = canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const { w, h } = getSize();
			// Convert screen to world offset
			const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
			camera = { ...camera, distance: camera.distance * factor };
		} else {
			const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
			camera = { ...camera, distance: camera.distance * factor };
		}
		renderFrame();
	}

	function onPointerDown(e: PointerEvent) {
		isDragging = true;
		isRightDrag = e.button === 2;
		lastMouse = { x: e.clientX, y: e.clientY };
		canvas.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		// Update world coords for HUD (project screen pos to world XY plane)
		{
			const rect = canvas.getBoundingClientRect();
			const mx = e.clientX - rect.left;
			const my = e.clientY - rect.top;
			const { w, h } = getSize();
			const halfH = camera.distance * Math.tan(Math.PI / 12);
			const halfW = halfH * (w / h || 1);
			// NDC
			const nx = (mx / w - 0.5) * 2;
			const ny = -(my / h - 0.5) * 2;
			// In ortho, this is exact; in perspective it's approximate (at target plane)
			const ct = Math.cos(camera.theta), st = Math.sin(camera.theta);
			const rightX = ct, rightY = -st;
			const upX = st * Math.sin(camera.phi), upY = ct * Math.sin(camera.phi);
			cursorWorld = {
				x: camera.target[0] + nx * halfW * rightX + ny * halfH * upX,
				y: camera.target[1] + nx * halfW * rightY + ny * halfH * upY,
			};
		}

		if (!isDragging) return;
		const dx = e.clientX - lastMouse.x;
		const dy = e.clientY - lastMouse.y;
		lastMouse = { x: e.clientX, y: e.clientY };

		if (orthoBlend > 0.5 || isRightDrag) {
			const panScale = camera.distance * 0.0007;
			if (orthoBlend > 0.5) {
				// 2D pan: screen right = +X, screen up = +Y
				camera = {
					...camera,
					target: [
						camera.target[0] + dx * panScale,
						camera.target[1] - dy * panScale,
						camera.target[2],
					],
				};
			} else {
				// 3D pan: move in camera's local right/up directions
				const ct = Math.cos(camera.theta), st = Math.sin(camera.theta);
				camera = {
					...camera,
					target: [
						camera.target[0] + (dx * ct - dy * st * Math.sin(camera.phi)) * panScale,
						camera.target[1] - (dx * st + dy * ct * Math.sin(camera.phi)) * panScale,
						camera.target[2] + dy * Math.cos(camera.phi) * panScale,
					],
				};
			}
		} else if (orthoBlend < 0.5) {
			// Orbit (3D only)
			camera = {
				...camera,
				theta: camera.theta + dx * 0.005,
				phi: Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.05, camera.phi + dy * 0.005)),
			};
		}
		renderFrame();
	}

	function onPointerUp() {
		isDragging = false;
		isRightDrag = false;
	}

	let ctxMenu = $state<{ x: number; y: number } | null>(null);

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		ctxMenu = { x: e.clientX, y: e.clientY };
	}

	function closeCtxMenu() {
		ctxMenu = null;
	}

	function ctxSaveImage() {
		saveScreenshot();
		closeCtxMenu();
	}

	function onDblClick() {
		camera = fitCamera(layers, stack, instancedScene);
		if (orthoBlend > 0.5) {
			camera = { ...camera, phi: Math.PI / 2 - 0.05, theta: 0 };
		}
		renderFrame();
	}

	onMount(() => {
		mounted = true;
		glState = initGL(canvas);
		if (!glState) return;

		camera = fitCamera(layers, stack, instancedScene);
		if (ortho) {
			camera = { ...camera, phi: Math.PI / 2 - 0.05, theta: 0 };
			orthoBlend = 1;
		}

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

	// Rebuild meshes when geometry or instanced scene changes
	$effect(() => {
		layers;
		instancedScene;
		if (mounted && glState) {
			needsRebuild = true;
			renderFrame();
		}
	});

	$effect(() => {
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="viewer3d" bind:this={container} onclick={closeCtxMenu}>
	<canvas
		bind:this={canvas}
		onwheel={onWheel}
		onpointerdown={(e) => { closeCtxMenu(); onPointerDown(e); }}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		oncontextmenu={onContextMenu}
		ondblclick={onDblClick}
	></canvas>
	<div class="hud">
		<span class="coord">x {cursorWorld.x.toFixed(1)}</span>
		<span class="coord">y {cursorWorld.y.toFixed(1)}</span>
	</div>
	{#if ctxMenu}
		<div class="ctx-menu" style="left: {ctxMenu.x}px; top: {ctxMenu.y}px;">
			<button class="ctx-item" onclick={ctxSaveImage}>Save image as PNG</button>
		</div>
	{/if}
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
	.ctx-menu {
		position: fixed;
		z-index: 100;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		padding: 4px 0;
		min-width: 160px;
	}
	.ctx-item {
		display: block;
		width: 100%;
		padding: 6px 14px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-muted);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.ctx-item:hover {
		background: var(--accent-dim);
		color: var(--accent);
	}
</style>
