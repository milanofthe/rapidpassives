<script lang="ts">
	import type { ProcessStack, StackLayer } from '$lib/stack/types';

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

	/** Stack layers sorted by z (bottom to top), excluding substrate for the diagram */
	const metalLayers = $derived(
		stack.layers
			.filter(l => l.type !== 'substrate')
			.sort((a, b) => a.z - b.z)
	);

	let expanded = $state<string | null>(null);

	function toggle(id: string) {
		expanded = expanded === id ? null : id;
	}
</script>

<div class="stack-panel">
	<div class="section-header">Layer Stack</div>

	<!-- Cross-section diagram -->
	<div class="cross-section">
		<!-- Substrate -->
		<div class="cs-layer cs-substrate">
			<span>Si Substrate</span>
		</div>
		<!-- Metal/via layers bottom to top -->
		{#each metalLayers as layer}
			<div
				class="cs-layer"
				class:dimmed={!layer.visible}
				style="background: {layer.color}; height: {Math.max(4, Math.min(20, layer.thickness * 10))}px;"
				onclick={() => toggleLayer(layer.id)}
				title="{layer.name} — click to toggle"
			>
				<span>{layer.name}</span>
			</div>
		{/each}
	</div>

	<!-- Layer list with controls -->
	<div class="layer-list">
		{#each [...stack.layers].reverse() as layer}
			{#if layer.type !== 'substrate'}
				<div class="layer-row" class:dimmed={!layer.visible}>
					<button
						class="vis-dot"
						style="background: {layer.visible ? layer.color : 'transparent'}; border-color: {layer.color};"
						onclick={() => toggleLayer(layer.id)}
					></button>
					<button class="layer-name" onclick={() => toggle(layer.id)}>
						{layer.name}
					</button>
					{#if layer.type === 'metal' && layer.rsh !== undefined}
						<span class="layer-meta">{layer.rsh} R□</span>
					{/if}
				</div>

				{#if expanded === layer.id}
					<div class="layer-detail">
						<div class="detail-row">
							<span>z</span>
							<input type="number" value={layer.z} step="0.1"
								oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) updateLayer(layer.id, 'z', v); }} />
							<em>um</em>
						</div>
						<div class="detail-row">
							<span>thick</span>
							<input type="number" value={layer.thickness} step="0.1" min="0.01"
								oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v) && v > 0) updateLayer(layer.id, 'thickness', v); }} />
							<em>um</em>
						</div>
						{#if layer.type === 'metal'}
							<div class="detail-row">
								<span>Rsh</span>
								<input type="number" value={layer.rsh} step="0.01" min="0"
									oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) updateLayer(layer.id, 'rsh', v); }} />
								<em>ohm/sq</em>
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		{/each}
	</div>

	<!-- Substrate settings -->
	<div class="layer-list" style="margin-top: 4px;">
		<div class="layer-row">
			<span class="layer-name-static">Substrate</span>
		</div>
		<div class="layer-detail" style="display:flex; flex-direction:column; gap:2px; padding: 4px 8px;">
			<div class="detail-row">
				<span>rho</span>
				<input type="number" value={stack.substrateRho} step="1" min="0.1"
					oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (!isNaN(v)) stack = { ...stack, substrateRho: v }; }} />
				<em>ohm*cm</em>
			</div>
			<div class="detail-row">
				<span>eps_ox</span>
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
		gap: 6px;
	}
	.section-header {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1.5px;
		color: var(--accent);
		font-weight: 600;
		font-family: var(--font-mono);
	}

	/* Cross section */
	.cross-section {
		display: flex;
		flex-direction: column-reverse;
		border: 1px solid var(--border-subtle);
		overflow: hidden;
	}
	.cs-layer {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: opacity 0.15s;
		min-height: 4px;
	}
	.cs-layer span {
		font-size: 9px;
		font-family: var(--font-mono);
		color: #000;
		font-weight: 600;
		text-shadow: 0 0 2px rgba(255,255,255,0.3);
		pointer-events: none;
	}
	.cs-layer.dimmed {
		opacity: 0.2;
	}
	.cs-substrate {
		background: var(--bg-panel);
		height: 16px;
		cursor: default;
	}
	.cs-substrate span {
		color: var(--text-dim);
		text-shadow: none;
	}

	/* Layer list */
	.layer-list {
		display: flex;
		flex-direction: column;
		gap: 0;
	}
	.layer-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 0;
	}
	.layer-row.dimmed {
		opacity: 0.4;
	}
	.vis-dot {
		width: 10px;
		height: 10px;
		border: 1.5px solid;
		padding: 0;
		flex-shrink: 0;
		cursor: pointer;
		background: none;
		min-width: 10px;
		min-height: 10px;
	}
	.vis-dot:hover {
		opacity: 0.8;
	}
	.layer-name {
		font-size: 11px;
		font-family: var(--font-mono);
		color: var(--text-muted);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-transform: none;
		letter-spacing: 0;
		font-weight: 500;
		text-align: left;
	}
	.layer-name:hover {
		color: var(--text);
		background: none;
	}
	.layer-name-static {
		font-size: 11px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.layer-meta {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		margin-left: auto;
	}

	/* Detail panel */
	.layer-detail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 8px 4px 18px;
		background: var(--bg-inset);
		border-left: 2px solid var(--border-subtle);
		margin-left: 4px;
	}
	.detail-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.detail-row span {
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		min-width: 40px;
	}
	.detail-row input {
		width: 70px;
		font-size: 11px;
		padding: 2px 4px;
	}
	.detail-row em {
		font-style: normal;
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
</style>
