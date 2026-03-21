<script lang="ts">
	import type { GeometryType, SpiralInductorParams, LayerMap } from '$lib/geometry/types';
	import { buildSpiralInductor } from '$lib/geometry/spiral';
	import LayoutViewer from '$lib/components/LayoutViewer.svelte';
	import ParamPanel from '$lib/components/ParamPanel.svelte';

	let geometryType = $state<GeometryType>('spiral');
	let params = $state<SpiralInductorParams>({
		Dout: 130, N: 3, sides: 8, width: 10, spacing: 4,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let layers = $derived.by<LayerMap>(() => {
		try {
			if (geometryType === 'spiral') {
				return buildSpiralInductor(params);
			}
			return {};
		} catch {
			return {};
		}
	});
</script>

<div class="workspace">
	<aside class="sidebar">
		<ParamPanel bind:geometryType bind:params />
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
	}
	.viewer-pane {
		flex: 1;
		position: relative;
	}
</style>
