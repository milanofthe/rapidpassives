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
				// Access each field to ensure Svelte tracks them
				const p = {
					Dout: params.Dout, N: params.N, sides: params.sides,
					width: params.width, spacing: params.spacing,
					via_spacing: params.via_spacing, via_width: params.via_width,
					via_in_metal: params.via_in_metal,
				};
				return buildSpiralInductor(p);
			}
			// Other types not yet implemented
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
		min-width: 0;
	}
	.viewer-pane {
		flex: 1;
		position: relative;
		min-height: 0;
	}
</style>
