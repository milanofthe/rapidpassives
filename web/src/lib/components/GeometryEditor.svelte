<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import type { SimulationResult } from '$lib/solver/peec';
	import LayoutViewer from './LayoutViewer.svelte';
	import ResultsPanel from './ResultsPanel.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar, stackPanel, simPanel, valid = true, renderOpts, simResult }: {
		layers: LayerMap;
		sidebar: Snippet;
		stackPanel?: Snippet;
		simPanel?: Snippet;
		valid?: boolean;
		renderOpts?: RenderOptions;
		simResult?: SimulationResult | null;
	} = $props();

	let activeTab = $state<'params' | 'stack' | 'sim'>('params');

	// Resizable sidebar
	let sidebarWidth = $state(280);
	let draggingSidebar = false;

	function onSidebarDragStart(e: PointerEvent) {
		draggingSidebar = true;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onSidebarDrag(e: PointerEvent) {
		if (!draggingSidebar) return;
		sidebarWidth = Math.max(200, Math.min(500, e.clientX));
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
		<div class="viewer-pane">
			<LayoutViewer {layers} {renderOpts} />
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
		width: 4px;
		cursor: col-resize;
		background: var(--border);
		flex-shrink: 0;
		transition: background 0.15s;
	}
	.resize-handle-v:hover, .resize-handle-v:active {
		background: var(--accent);
	}
	.resize-handle-h {
		height: 4px;
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
		font-size: 10px;
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
		font-size: 11px;
		font-family: var(--font-mono);
		padding: 4px 16px;
		flex-shrink: 0;
	}
	.viewer-pane {
		flex: 1;
		position: relative;
		min-height: 0;
	}
	.results-pane {
		flex-shrink: 0;
		overflow: hidden;
	}
</style>
