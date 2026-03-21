<script lang="ts">
	import '$lib/components/fields.css';
	import type { ProcessStack } from '$lib/stack/types';

	let { stack = $bindable<ProcessStack>() }: { stack: ProcessStack } = $props();

	function toggleLayer(id: string) {
		stack = {
			...stack,
			layers: stack.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l),
		};
	}

	function updateLayer(id: string, field: string, value: number) {
		stack = {
			...stack,
			layers: stack.layers.map(l => l.id === id ? { ...l, [field]: value } : l),
		};
	}

	const sortedLayers = $derived(
		stack.layers
			.filter(l => l.type !== 'substrate')
			.sort((a, b) => a.z - b.z)
	);
</script>

<div class="stack-panel">

	<!-- Cross-section diagram -->
	<div class="cross-section">
		<div class="cs-substrate"><span>Si Substrate</span></div>
		<div class="cs-oxide"><span>Oxide</span></div>
		{#each sortedLayers as layer, i}
			{@const isVia = layer.type === 'via'}
			{@const h = isVia ? Math.max(14, layer.thickness * 20) : Math.max(24, layer.thickness * 24)}
			<div
				class="cs-row"
				class:dimmed={!layer.visible}
				onclick={() => toggleLayer(layer.id)}
				title="{layer.name} — click to toggle"
			>
				{#if isVia}
					<div class="cs-via-row" style="height: {h}px;">
						<div class="cs-oxide-fill"></div>
						<div class="cs-via-block" style="background: {layer.color};"></div>
						<div class="cs-oxide-fill"></div>
					</div>
				{:else}
					<div class="cs-metal" style="background: {layer.color}; height: {h}px;">
						<span>{layer.name}</span>
					</div>
				{/if}
			</div>
			{#if i < sortedLayers.length - 1 && sortedLayers[i + 1].type !== 'via' && layer.type !== 'via'}
				<div class="cs-oxide-gap"></div>
			{/if}
		{/each}
		<div class="cs-passivation"></div>
	</div>

	<!-- Layer cards — top to bottom -->
	{#each [...sortedLayers].reverse() as layer}
		<div class="layer-card" class:dimmed={!layer.visible}>
			<div class="layer-header">
				<button
					class="vis-toggle"
					class:active={layer.visible}
					style="border-color: {layer.color}; {layer.visible ? `background: ${layer.color};` : ''}"
					onclick={() => toggleLayer(layer.id)}
				></button>
				<span class="layer-title" style="color: {layer.color};">{layer.name}</span>
				</div>
			<div class="layer-fields">
				<div class="lf">
					<span>z</span>
					<input type="number" value={layer.z} step="0.1"
						oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) updateLayer(layer.id, 'z', v); }} />
					<em>um</em>
				</div>
				<div class="lf">
					<span>thick</span>
					<input type="number" value={layer.thickness} step="0.1" min="0.01"
						oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v) && v > 0) updateLayer(layer.id, 'thickness', v); }} />
					<em>um</em>
				</div>
				{#if layer.type === 'metal' && layer.rsh !== undefined}
					<div class="lf">
						<span>Rsh</span>
						<input type="number" value={layer.rsh} step="0.01" min="0"
							oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) updateLayer(layer.id, 'rsh', v); }} />
						<em>Ω/□</em>
					</div>
				{/if}
			</div>
		</div>
	{/each}

	<!-- Substrate card -->
	<div class="layer-card sub-card">
		<div class="layer-header">
			<span class="layer-title">Substrate</span>
		</div>
		<div class="layer-fields">
			<div class="lf">
				<span>rho</span>
				<input type="number" value={stack.substrateRho} step="1" min="0.1"
					oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) stack = { ...stack, substrateRho: v }; }} />
				<em>Ω·cm</em>
			</div>
			<div class="lf">
				<span>ε_ox</span>
				<input type="number" value={stack.oxideEr} step="0.1" min="1"
					oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) stack = { ...stack, oxideEr: v }; }} />
				<em></em>
			</div>
		</div>
	</div>
</div>

<style>
	.stack-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* === Cross section === */
	.cross-section {
		display: flex;
		flex-direction: column-reverse;
		border: 1px solid var(--border-subtle);
		background: var(--bg-inset);
		overflow: hidden;
		margin-bottom: 6px;
	}
	.cs-substrate {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 54px;
		background: repeating-linear-gradient(
			45deg, var(--bg-panel), var(--bg-panel) 3px, #33333a 3px, #33333a 6px
		);
	}
	.cs-substrate span {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.cs-oxide {
		height: 10px;
		background: #2e2e38;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cs-oxide span {
		font-size: 7px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		opacity: 0.5;
	}
	.cs-oxide-gap {
		height: 7px;
		background: #2e2e38;
	}
	.cs-row {
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.cs-row.dimmed {
		opacity: 0.15;
	}
	.cs-metal {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cs-metal span {
		font-size: 9px;
		font-family: var(--font-mono);
		color: #000;
		font-weight: 600;
		text-shadow: 0 0 3px rgba(255,255,255,0.2);
		pointer-events: none;
	}
	.cs-via-row {
		display: flex;
		align-items: stretch;
	}
	.cs-oxide-fill {
		flex: 1;
		background: #2e2e38;
	}
	.cs-via-block {
		width: 40%;
		background: repeating-linear-gradient(
			-45deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px
		);
	}
	.cs-passivation {
		height: 5px;
		background: #3a3a44;
	}

	/* === Layer cards === */
	.layer-card {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		padding: 8px 10px;
		transition: opacity 0.15s;
	}
	.layer-card.dimmed {
		opacity: 0.4;
	}
	.sub-card {
		margin-top: 4px;
	}
	.layer-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}
	.vis-toggle {
		width: 12px;
		height: 12px;
		border: 2px solid;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		min-width: 12px;
		min-height: 12px;
		transition: background 0.1s;
	}
	.vis-toggle:hover {
		opacity: 0.7;
	}
	.vis-toggle.active {
		background: currentColor;
	}
	.layer-title {
		font-size: 10px;
		font-family: var(--font-mono);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 1.5px;
	}

	/* === Layer fields — matches fields.css pattern === */
	.layer-fields {
		display: flex;
		flex-direction: column;
	}
	.lf {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px;
		margin: 0 -6px;
	}
	.lf > span {
		font-size: 12px;
		font-family: var(--font-mono);
		color: var(--text-muted);
		min-width: 42px;
	}
	.lf input {
		flex: 1;
		font-size: 12px;
		padding: 3px 6px;
		text-align: center;
		min-width: 0;
	}
	.lf em {
		font-style: normal;
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		min-width: 32px;
	}
</style>
