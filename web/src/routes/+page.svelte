<script lang="ts">
	import type { GeometryType, GeometryParams, SpiralInductorParams, SymmetricInductorParams, SymmetricTransformerParams, LayerMap } from '$lib/geometry/types';
	import { buildSpiralInductor } from '$lib/geometry/spiral';
	import { buildSymmetricInductor } from '$lib/geometry/symmetric_inductor';
	import { buildSymmetricTransformer } from '$lib/geometry/symmetric_transformer';
	import LayoutViewer from '$lib/components/LayoutViewer.svelte';
	import ParamPanel from '$lib/components/ParamPanel.svelte';

	const defaults: Record<GeometryType, GeometryParams> = {
		spiral: {
			Dout: 130, N: 3, sides: 8, width: 10, spacing: 4,
			via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
		} satisfies SpiralInductorParams,
		symmetric_inductor: {
			Dout: 250, N: 3, sides: 8, width: 16, spacing: 2,
			center_tap: false, via_extent: 8,
			via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
		} satisfies SymmetricInductorParams,
		symmetric_transformer: {
			Dout: 200, N1: 2, N2: 3, sides: 8, width: 12, spacing: 2,
			center_tap_primary: true, center_tap_secondary: false,
			via_extent: 8, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
		} satisfies SymmetricTransformerParams,
	};

	let geometryType = $state<GeometryType>('spiral');
	let params = $state<GeometryParams>({ ...defaults.spiral });

	// Switch defaults when geometry type changes
	let prevType: GeometryType = 'spiral';
	$effect(() => {
		const current = geometryType;
		if (current !== prevType) {
			prevType = current;
			params = { ...defaults[current] };
		}
	});

	let layers = $derived.by<LayerMap>(() => {
		try {
			switch (geometryType) {
				case 'spiral':
					return buildSpiralInductor(params as SpiralInductorParams);
				case 'symmetric_inductor':
					return buildSymmetricInductor(params as SymmetricInductorParams);
				case 'symmetric_transformer':
					return buildSymmetricTransformer(params as SymmetricTransformerParams);
			}
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
