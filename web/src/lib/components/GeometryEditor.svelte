<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import type { ProcessStack } from '$lib/stack/types';
	import type { SimulationResult } from '$lib/solver/peec';
	import type { BatchedSceneData } from '$lib/render/canvas3d';
	import LayoutViewer3D from './LayoutViewer3D.svelte';
	import ResultsPanel from './ResultsPanel.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar, stackPanel, simPanel, valid = true, renderOpts, simResult, stack, batchedScene, gdsLayerMap, onFileDrop, dropLoading = false, dropPhase = '', dropPolyCount = 0 }: {
		layers: LayerMap;
		sidebar: Snippet;
		stackPanel?: Snippet;
		simPanel?: Snippet;
		valid?: boolean;
		renderOpts?: RenderOptions;
		simResult?: SimulationResult | null;
		stack?: ProcessStack;
		batchedScene?: BatchedSceneData | null;
		gdsLayerMap?: Record<number, string>;
		onFileDrop?: (file: File) => void;
		dropLoading?: boolean;
		dropPhase?: string;
		dropPolyCount?: number;
	} = $props();

	let viewerDragOver = $state(false);
	let dragCounter = 0;

	function onViewerDrop(e: DragEvent) {
		e.preventDefault();
		dragCounter = 0;
		viewerDragOver = false;
		if (!onFileDrop) return;
		const file = e.dataTransfer?.files[0];
		if (file) onFileDrop(file);
	}

	function onViewerDragEnter(e: DragEvent) {
		if (!onFileDrop) return;
		e.preventDefault();
		dragCounter++;
		viewerDragOver = true;
	}

	function onViewerDragOver(e: DragEvent) {
		if (!onFileDrop) return;
		e.preventDefault();
	}

	function onViewerDragLeave() {
		dragCounter--;
		if (dragCounter <= 0) {
			dragCounter = 0;
			viewerDragOver = false;
		}
	}

	let activeTab = $state<'params' | 'stack' | 'sim'>('params');
	let viewMode = $state<'2d' | '3d'>('2d');
	let wireframe = $state(false);
	let viewer: LayoutViewer3D | undefined = $state();

	function doZoomIn() { viewer?.zoomIn(); }
	function doZoomOut() { viewer?.zoomOut(); }
	function doReset() { viewer?.resetView(); }

	function toggleView() {
		viewMode = viewMode === '2d' ? '3d' : '2d';
	}

	function onKeyDown(e: KeyboardEvent) {
		// Ignore if user is typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		switch (e.key) {
			case 'f': case 'F': doReset(); break;
			case 'w': case 'W': wireframe = !wireframe; break;
			case '+': case '=': doZoomIn(); break;
			case '-': case '_': doZoomOut(); break;
			case 'ArrowLeft': e.preventDefault(); viewer?.pan(-1, 0); break;
			case 'ArrowRight': e.preventDefault(); viewer?.pan(1, 0); break;
			case 'ArrowUp': e.preventDefault(); viewer?.pan(0, -1); break;
			case 'ArrowDown': e.preventDefault(); viewer?.pan(0, 1); break;
			case ' ':
				e.preventDefault();
				if (stack) toggleView();
				break;
			case 's': case 'S':
				if (e.ctrlKey || e.metaKey) {
					e.preventDefault();
					viewer?.saveScreenshot();
				}
				break;
		}
	}

	// Resizable sidebar
	let sidebarWidth = $state(280);
	let draggingSidebar = false;

	function onSidebarDragStart(e: PointerEvent) {
		draggingSidebar = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onSidebarDrag(e: PointerEvent) {
		if (!draggingSidebar) return;
		sidebarWidth = Math.max(250, Math.min(500, e.clientX));
	}
	function onSidebarDragEnd() {
		draggingSidebar = false;
	}

	// Resizable results pane
	let resultsHeight = $state(350);
	let draggingResults = false;
	let workspaceEl = $state<HTMLDivElement | null>(null);

	function onResultsDragStart(e: PointerEvent) {
		draggingResults = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onResultsDrag(e: PointerEvent) {
		if (!draggingResults || !workspaceEl) return;
		const rect = workspaceEl.getBoundingClientRect();
		resultsHeight = Math.max(100, Math.min(rect.height - 100, rect.bottom - e.clientY));
	}
	function onResultsDragEnd() {
		draggingResults = false;
	}
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="workspace" bind:this={workspaceEl}>
	<aside class="sidebar" style="width: {sidebarWidth}px; min-width: {sidebarWidth}px;">
		{#if stackPanel || simPanel}
			<div class="sidebar-tabs">
				<button class="stab" class:active={activeTab === 'params'} onclick={() => activeTab = 'params'}>Params</button>
				{#if stackPanel}
					<span class="stab-sep"></span>
					<button class="stab" class:active={activeTab === 'stack'} onclick={() => activeTab = 'stack'}>Stack</button>
				{/if}
				{#if simPanel}
					<span class="stab-sep"></span>
					<button class="stab" class:active={activeTab === 'sim'} onclick={() => activeTab = 'sim'}>Sim</button>
				{/if}
			</div>
		{/if}
		<div class="sidebar-content">
			{#if activeTab === 'params'}
				{@render sidebar()}
			{:else if activeTab === 'stack' && stackPanel}
				{@render stackPanel()}
			{:else if activeTab === 'sim' && simPanel}
				{@render simPanel()}
			{/if}
		</div>
	</aside>
	<div
		class="resize-handle-v"
		onpointerdown={onSidebarDragStart}
		onpointermove={onSidebarDrag}
		onpointerup={onSidebarDragEnd}
	></div>
	<div class="main-area">
		{#if !valid}
			<div class="invalid-bar">Invalid geometry — parameters cause clipping or overlap</div>
		{/if}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="viewer-pane"
			ondrop={onViewerDrop}
			ondragenter={onViewerDragEnter}
			ondragover={onViewerDragOver}
			ondragleave={onViewerDragLeave}
		>
			{#if (viewerDragOver || dropLoading) && onFileDrop}
				<div class="viewer-drop-overlay">
					{#if dropLoading}
						<p class="drop-phase">{dropPhase}</p>
						<p class="drop-text">{dropPolyCount > 0 ? `${dropPolyCount.toLocaleString()} polygons` : ''}</p>
					{:else}
						<div class="drop-prompt">
							<svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
								<rect x="8" y="6" width="32" height="36" rx="2" />
								<path d="M18 24L24 30L30 24" />
								<path d="M24 16V30" />
							</svg>
							<p>Drop GDS file</p>
						</div>
					{/if}
				</div>
			{/if}
			{#if stack}
				<LayoutViewer3D bind:this={viewer} {layers} {stack} {wireframe}
					ortho={viewMode === '2d'}
					colorOverrides={renderOpts?.colorOverrides}
					visibleLayers={renderOpts?.visibleLayers}
					{batchedScene} {gdsLayerMap} />
			{/if}
			<div class="viewer-toolbar">
				<button class="tb" onclick={doZoomIn} title="Zoom in">+</button>
				<button class="tb" onclick={doZoomOut} title="Zoom out">&minus;</button>
				<button class="tb" onclick={doReset} title="Fit to view">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<polyline points="1,5 1,1 5,1" />
						<polyline points="11,1 15,1 15,5" />
						<polyline points="15,11 15,15 11,15" />
						<polyline points="5,15 1,15 1,11" />
						<rect x="5" y="5" width="6" height="6" rx="0.5" />
					</svg>
				</button>
				<button class="tb" onclick={() => viewer?.saveScreenshot()} title="Save as PNG (Ctrl+S)">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M2 10v3h12v-3" />
						<path d="M8 2v8" />
						<path d="M5 7l3 3 3-3" />
					</svg>
				</button>
				<button class="tb" class:active-toggle={wireframe} onclick={() => wireframe = !wireframe} title="Toggle wireframe">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
						<path d="M1 5L8 1L15 5L15 11L8 15L1 11Z" />
						<path d="M1 5L8 9L15 5" />
						<path d="M8 9L8 15" />
					</svg>
				</button>
				{#if stack}
					<button class="tb view-mode" onclick={toggleView} title="Toggle 2D/3D view">
						{viewMode === '2d' ? '3D' : '2D'}
					</button>
				{/if}
			</div>
		</div>
		{#if simResult}
			<div
				class="resize-handle-h"
				onpointerdown={onResultsDragStart}
				onpointermove={onResultsDrag}
				onpointerup={onResultsDragEnd}
			></div>
			<div class="results-pane" style="height: {resultsHeight}px;">
				<ResultsPanel result={simResult} />
			</div>
		{/if}
	</div>
</div>

<style>
	.workspace {
		display: flex;
		height: 100%;
	}
	.sidebar {
		border-right: none;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		flex-shrink: 0;
	}
	.resize-handle-v {
		width: 2px;
		cursor: col-resize;
		background: var(--border);
		flex-shrink: 0;
		transition: background 0.15s;
	}
	.resize-handle-v:hover, .resize-handle-v:active {
		background: var(--accent);
	}
	.resize-handle-h {
		height: 2px;
		cursor: row-resize;
		background: var(--border);
		flex-shrink: 0;
		transition: background 0.15s;
	}
	.resize-handle-h:hover, .resize-handle-h:active {
		background: var(--accent);
	}
	.sidebar-tabs {
		display: flex;
		flex-shrink: 0;
		border-bottom: 1px solid var(--border);
	}
	.stab {
		flex: 1;
		padding: 6px 0;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		font-weight: 600;
		letter-spacing: 1px;
		text-transform: uppercase;
		background: var(--bg-surface);
		color: var(--text-dim);
		border: none;
		cursor: pointer;
		transition: color 0.15s;
	}
	.stab:hover {
		color: var(--text-muted);
	}
	.stab.active {
		color: var(--accent);
	}
	.stab-sep {
		width: 1px;
		height: 100%;
		background: var(--border);
		flex-shrink: 0;
	}
	.sidebar-content {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.main-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.invalid-bar {
		background: var(--accent);
		color: var(--bg);
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		padding: 4px 16px;
		flex-shrink: 0;
	}
	.viewer-pane {
		flex: 1;
		position: relative;
		min-height: 0;
	}
	.viewer-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: var(--bg);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.drop-prompt {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--text-dim);
		border: 2px dashed var(--border);
		padding: 30px 50px;
		transition: border-color 0.15s, color 0.15s;
	}
	.viewer-drop-overlay:not(:has(.drop-phase)) .drop-prompt {
		border-color: var(--accent);
		color: var(--accent);
	}
	.drop-prompt p {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
	}
	.drop-phase {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent);
	}
	.drop-text {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
		min-height: 14px;
	}
	.viewer-toolbar {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 10;
		display: flex;
		gap: 2px;
	}
	.tb {
		width: 28px;
		height: 28px;
		border: 1px solid var(--border);
		background: var(--bg-surface);
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.tb:hover {
		background: var(--bg-panel);
		border-color: var(--accent);
		color: var(--text);
	}
	.tb.active-toggle {
		border-color: var(--accent);
		color: var(--accent);
	}
	.tb.view-mode {
		color: var(--accent);
		font-size: var(--fs-xs);
		font-weight: 700;
		width: 32px;
		letter-spacing: 0.5px;
	}
	.results-pane {
		flex-shrink: 0;
		overflow: hidden;
	}
</style>
