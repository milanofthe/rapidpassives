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
		<div class="section-header">Type</div>
		<select bind:value={geometryType}>
			<option value="spiral">Spiral Inductor</option>
			<option value="symmetric_inductor">Symmetric Inductor</option>
			<option value="symmetric_transformer">Symmetric Transformer</option>
		</select>
	</div>

	{#if geometryType === 'spiral'}
		<div class="section">
			<div class="section-header">Geometry</div>
			<div class="field">
				<span class="field-label">Dout</span>
				<div class="field-input">
					<input type="number" bind:value={params.Dout} step="1" min="1" />
					<span class="field-unit">um</span>
				</div>
			</div>
			<div class="field">
				<span class="field-label">N</span>
				<div class="field-input">
					<input type="number" bind:value={params.N} step="1" min="1" max="20" />
					<span class="field-unit">turns</span>
				</div>
			</div>
			<div class="field">
				<span class="field-label">Sides</span>
				<div class="field-input">
					<input type="number" bind:value={params.sides} step="2" min="4" max="64" />
				</div>
			</div>
			<div class="field">
				<span class="field-label">Width</span>
				<div class="field-input">
					<input type="number" bind:value={params.width} step="0.5" min="0.1" />
					<span class="field-unit">um</span>
				</div>
			</div>
			<div class="field">
				<span class="field-label">Spacing</span>
				<div class="field-input">
					<input type="number" bind:value={params.spacing} step="0.5" min="0.1" />
					<span class="field-unit">um</span>
				</div>
			</div>
		</div>

		<div class="section">
			<div class="section-header">Vias</div>
			<div class="field">
				<span class="field-label">Spacing</span>
				<div class="field-input">
					<input type="number" bind:value={params.via_spacing} step="0.1" min="0.1" />
					<span class="field-unit">um</span>
				</div>
			</div>
			<div class="field">
				<span class="field-label">Width</span>
				<div class="field-input">
					<input type="number" bind:value={params.via_width} step="0.1" min="0.1" />
					<span class="field-unit">um</span>
				</div>
			</div>
			<div class="field">
				<span class="field-label">Enclosure</span>
				<div class="field-input">
					<input type="number" bind:value={params.via_in_metal} step="0.05" min="0" />
					<span class="field-unit">um</span>
				</div>
			</div>
		</div>
	{:else}
		<div class="section">
			<div class="placeholder">Not yet implemented</div>
		</div>
	{/if}

	<div class="actions">
		<button class="btn-secondary" onclick={resetDefaults}>Reset</button>
		{#if onexport}
			<button onclick={onexport}>Export GDS</button>
		{/if}
	</div>
</div>

<style>
	.panel {
		height: 100%;
		overflow-y: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg);
	}
	.section {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		padding: 10px;
	}
	.section-header {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1.5px;
		color: var(--accent);
		font-weight: 600;
		margin-bottom: 10px;
		font-family: 'JetBrains Mono', monospace;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px;
		margin: 0 -6px;
		transition: background 0.1s;
	}
	.field:hover {
		background: var(--accent-dim);
	}
	.field-label {
		font-size: 12px;
		color: var(--text-muted);
		min-width: 70px;
		font-family: 'JetBrains Mono', monospace;
	}
	.field:hover .field-label {
		color: var(--text);
	}
	.field-input {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.field-unit {
		font-size: 10px;
		color: var(--text-dim);
		min-width: 28px;
		font-family: 'JetBrains Mono', monospace;
	}
	select {
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: var(--text);
		padding: 6px 8px;
		border-radius: 0;
		font-size: 12px;
		width: 100%;
	}
	.placeholder {
		color: var(--text-dim);
		font-size: 12px;
		text-align: center;
		padding: 20px 0;
		font-style: italic;
	}
	.actions {
		display: flex;
		gap: 2px;
		margin-top: auto;
		padding-top: 8px;
	}
	.actions button {
		flex: 1;
	}
	.btn-secondary {
		background: var(--bg-panel);
		border: 1px solid var(--border);
	}
	.btn-secondary:hover {
		background: var(--border);
	}
</style>
