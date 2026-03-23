<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import type { ProcessStack } from '$lib/stack/types';
	import type { SimulationResult } from '$lib/solver/peec';
	import LayoutViewer from './LayoutViewer.svelte';
	import LayoutViewer3D from './LayoutViewer3D.svelte';
	import ResultsPanel from './ResultsPanel.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar, stackPanel, simPanel, valid = true, renderOpts, simResult, stack }: {
		layers: LayerMap;
		sidebar: Snippet;
		stackPanel?: Snippet;
		simPanel?: Snippet;
		valid?: boolean;
		renderOpts?: RenderOptions;
		simResult?: SimulationResult | null;
		stack?: ProcessStack;
	} = $props();

	let activeTab = $state<'params' | 'stack' | 'sim'>('params');
	let viewMode = $state<'2d' | '3d'>('2d');
	let transitioning = $state(false);
	let viewer2d: LayoutViewer | undefined = $state();
	let viewer3d: LayoutViewer3D | undefined = $state();

	function doZoomIn() { viewMode === '2d' ? viewer2d?.zoomIn() : viewer3d?.zoomIn(); }
	function doZoomOut() { viewMode === '2d' ? viewer2d?.zoomOut() : viewer3d?.zoomOut(); }
	function doReset() { viewMode === '2d' ? viewer2d?.resetView() : viewer3d?.resetView(); }

	function toggleView() {
		transitioning = true;
		// Let the fade-out start, then swap after the CSS transition
		setTimeout(() => {
			viewMode = viewMode === '2d' ? '3d' : '2d';
			// The fade-in happens because transitioning goes false after a frame
			requestAnimationFrame(() => {
				transitioning = false;
			});
		}, 200);
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

<div class="workspace" bind:this={workspaceEl}>
	<aside class="sidebar" style="width: {sidebarWidth}px; min-width: {sidebarWidth}px;">
		<div class="sidebar-tabs">
			<button class="stab" class:active={activeTab === 'params'} onclick={() => activeTab = 'params'}>Params</button>
			{#if stackPanel}
				<button class="stab" class:active={activeTab === 'stack'} onclick={() => activeTab = 'stack'}>Stack</button>
			{/if}
			{#if simPanel}
				<button class="stab" class:active={activeTab === 'sim'} onclick={() => activeTab = 'sim'}>Sim</button>
			{/if}
		</div>
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
		<div class="viewer-pane" class:transitioning>
			{#if viewMode === '2d'}
				<LayoutViewer bind:this={viewer2d} {layers} {renderOpts} />
			{:else if stack}
				<LayoutViewer3D bind:this={viewer3d} {layers} {stack}
					colorOverrides={renderOpts?.colorOverrides}
					visibleLayers={renderOpts?.visibleLayers} />
			{/if}
			<div class="viewer-toolbar">
				<button class="tb" onclick={doZoomIn} title="Zoom in">+</button>
				<button class="tb" onclick={doZoomOut} title="Zoom out">&minus;</button>
				<button class="tb" onclick={doReset} title="Fit to view">
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="2" width="12" height="12" rx="1" />
						<line x1="8" y1="5" x2="8" y2="11" />
						<line x1="5" y1="8" x2="11" y2="8" />
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
		transition: opacity 0.2s ease;
	}
	.viewer-pane.transitioning {
		opacity: 0;
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
