<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import LayoutViewer from './LayoutViewer.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar, valid = true, renderOpts }: {
		layers: LayerMap;
		sidebar: Snippet;
		valid?: boolean;
		renderOpts?: RenderOptions;
	} = $props();
</script>

<div class="workspace">
	<aside class="sidebar">
		{@render sidebar()}
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
