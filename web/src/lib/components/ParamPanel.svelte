<script lang="ts">
	import type { GeometryType, SpiralInductorParams } from '$lib/geometry/types';

	let {
		geometryType = $bindable<GeometryType>('spiral'),
		params = $bindable<SpiralInductorParams>(),
		onexport,
	}: {
		geometryType: GeometryType;
		params: SpiralInductorParams;
		onexport?: () => void;
	} = $props();

	const spiralDefaults: SpiralInductorParams = {
		Dout: 130, N: 3, sides: 8, width: 10, spacing: 4,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	};

	function resetDefaults() {
		params = { ...spiralDefaults };
	}
</script>

<div class="panel">
	<div class="section">
		<div class="section-title">Geometry Type</div>
		<select bind:value={geometryType}>
			<option value="spiral">Spiral Inductor</option>
			<option value="symmetric_inductor">Symmetric Inductor</option>
			<option value="symmetric_transformer">Symmetric Transformer</option>
		</select>
	</div>

	{#if geometryType === 'spiral'}
		<div class="section">
			<div class="section-title">Geometry</div>
			<div class="param-grid">
				<label>Outer Diameter</label>
				<input type="number" bind:value={params.Dout} step="1" min="1" />

				<label>Turns (N)</label>
				<input type="number" bind:value={params.N} step="1" min="1" max="20" />

				<label>Sides</label>
				<input type="number" bind:value={params.sides} step="2" min="4" max="64" />

				<label>Conductor Width</label>
				<input type="number" bind:value={params.width} step="0.5" min="0.1" />

				<label>Conductor Spacing</label>
				<input type="number" bind:value={params.spacing} step="0.5" min="0.1" />
			</div>
		</div>

		<div class="section">
			<div class="section-title">Via Parameters</div>
			<div class="param-grid">
				<label>Via Spacing</label>
				<input type="number" bind:value={params.via_spacing} step="0.1" min="0.1" />

				<label>Via Width</label>
				<input type="number" bind:value={params.via_width} step="0.1" min="0.1" />

				<label>Via in Metal</label>
				<input type="number" bind:value={params.via_in_metal} step="0.05" min="0" />
			</div>
		</div>
	{/if}

	<div class="actions">
		<button onclick={resetDefaults}>Reset</button>
		{#if onexport}
			<button class="export" onclick={onexport}>Export GDS</button>
		{/if}
	</div>
</div>

<style>
	.panel {
		height: 100%;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.section {
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px;
	}
	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--accent-secondary);
		margin-bottom: 8px;
		font-weight: 600;
	}
	.param-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 8px;
		align-items: center;
	}
	select {
		width: 100%;
		background: var(--input-bg);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 13px;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: auto;
	}
	.actions button {
		flex: 1;
	}
	.export {
		background: var(--accent-secondary);
		color: #000;
	}
</style>
