<script lang="ts">
	import type { LayerMap } from '$lib/geometry/types';
	import LayoutViewer from './LayoutViewer.svelte';
	import type { Snippet } from 'svelte';

	let { layers, sidebar }: { layers: LayerMap; sidebar: Snippet } = $props();
</script>

<div class="workspace">
	<aside class="sidebar">
		{@render sidebar()}
	</aside>
	<div class="main-area">
		<div class="viewer-pane">
			<LayoutViewer {layers} />
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
	.viewer-pane {
		flex: 1;
		position: relative;
		min-height: 0;
	}
</style>
