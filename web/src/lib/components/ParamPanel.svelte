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

	function nudge(field: keyof SpiralInductorParams, step: number, min?: number, max?: number) {
		let v = (params[field] as number) + step;
		if (min !== undefined) v = Math.max(min, v);
		if (max !== undefined) v = Math.min(max, v);
		v = Math.round(v * 1000) / 1000;
		params = { ...params, [field]: v };
	}

	function setField(field: keyof SpiralInductorParams, e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		if (!isNaN(v)) {
			params = { ...params, [field]: v };
		}
	}
</script>

{#snippet numfield(label: string, field: keyof SpiralInductorParams, step: number, unit?: string, min?: number, max?: number)}
	<div class="field">
		<span class="field-label">{label}</span>
		<div class="field-input">
			<button class="spin-btn" onclick={() => nudge(field, -step, min, max)}>-</button>
			<input type="number" value={params[field]} {step} {min} {max} oninput={(e) => setField(field, e)} />
			<button class="spin-btn" onclick={() => nudge(field, step, min, max)}>+</button>
			<span class="field-unit">{unit ?? ''}</span>
		</div>
	</div>
{/snippet}

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
			{@render numfield('Dout', 'Dout', 1, 'um', 1)}
			{@render numfield('N', 'N', 1, 'turns', 1, 20)}
			{@render numfield('Sides', 'sides', 2, undefined, 4, 64)}
			{@render numfield('Width', 'width', 0.5, 'um', 0.1)}
			{@render numfield('Spacing', 'spacing', 0.5, 'um', 0.1)}
		</div>

		<div class="section">
			<div class="section-header">Vias</div>
			{@render numfield('Spacing', 'via_spacing', 0.1, 'um', 0.1)}
			{@render numfield('Width', 'via_width', 0.1, 'um', 0.1)}
			{@render numfield('Enclosure', 'via_in_metal', 0.05, 'um', 0)}
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
		font-family: var(--font-mono);
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
		font-family: var(--font-mono);
	}
	.field:hover .field-label {
		color: var(--text);
	}
	.field-input {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0;
	}
	.field-input input {
		border-left: none;
		border-right: none;
		text-align: center;
		min-width: 0;
	}
	.field-unit {
		font-size: 10px;
		color: var(--text-dim);
		min-width: 32px;
		padding-left: 6px;
		font-family: var(--font-mono);
	}
	.spin-btn {
		background: var(--bg-panel);
		color: var(--text-muted);
		border: 1px solid var(--input-border);
		padding: 0;
		width: 22px;
		height: 26px;
		font-size: 14px;
		font-weight: 400;
		font-family: var(--font-mono);
		text-transform: none;
		letter-spacing: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
		flex-shrink: 0;
	}
	.spin-btn:hover {
		background: var(--accent);
		color: #fff;
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
