<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import LayoutViewer from './LayoutViewer.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar, stackPanel, valid = true, renderOpts }: {
		layers: LayerMap;
		sidebar: Snippet;
		stackPanel?: Snippet;
		valid?: boolean;
		renderOpts?: RenderOptions;
	} = $props();

	let activeTab = $state<'params' | 'stack'>('params');
</script>

<div class="workspace">
	<aside class="sidebar">
		{#if stackPanel}
			<div class="sidebar-tabs">
				<button class="stab" class:active={activeTab === 'params'} onclick={() => activeTab = 'params'}>Params</button>
				<button class="stab" class:active={activeTab === 'stack'} onclick={() => activeTab = 'stack'}>Stack</button>
			</div>
		{/if}
		<div class="sidebar-content">
			{#if activeTab === 'params'}
				{@render sidebar()}
			{:else if stackPanel}
				{@render stackPanel()}
			{/if}
		</div>
	</aside>
	<div class="main-area">
		{#if !valid}
			<div class="invalid-bar">Invalid geometry — parameters cause clipping or overlap</div>
		{/if}
		<div class="viewer-pane">
			<LayoutViewer {layers} {renderOpts} />
		</div>
	</div>
</div>

<style>
	.workspace {
		display: flex;
		height: 100%;
	}
	.sidebar {
		width: 280px;
		min-width: 280px;
		border-right: 1px solid var(--border);
		background: var(--bg);
		display: flex;
		flex-direction: column;
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
		color: #fff;
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
</style>
