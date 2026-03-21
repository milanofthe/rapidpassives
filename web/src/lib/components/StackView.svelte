<script lang="ts">
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

	let expanded = $state<string | null>(null);
	function toggle(id: string) { expanded = expanded === id ? null : id; }
</script>

<div class="stack-panel">
	<div class="section-header">Layer Stack</div>

	<!-- Cross-section diagram -->
	<div class="cross-section">
		<div class="cs-substrate"><span>Si Substrate</span></div>
		<div class="cs-oxide"><span>Oxide</span></div>
		{#each sortedLayers as layer, i}
			{@const isVia = layer.type === 'via'}
			{@const h = isVia ? Math.max(8, layer.thickness * 12) : Math.max(14, layer.thickness * 14)}
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

	<!-- Layer list -->
	<div class="layer-list">
		{#each [...sortedLayers].reverse() as layer}
			<div class="layer-row" class:dimmed={!layer.visible}>
				<button
					class="vis-dot"
					style="background: {layer.visible ? layer.color : 'transparent'}; border-color: {layer.color};"
					onclick={() => toggleLayer(layer.id)}
					title="Toggle visibility"
				></button>
				<button class="layer-name" onclick={() => toggle(layer.id)}>
					{layer.name}
				</button>
				{#if layer.type === 'via'}
					<span class="layer-tag">VIA</span>
				{:else if layer.rsh !== undefined}
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
		{/each}
	</div>

	<!-- Substrate settings -->
	<div class="sub-section">
		<div class="sub-header">Substrate</div>
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

<style>
	.stack-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.section-header {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 1.5px;
		color: var(--accent);
		font-weight: 600;
		font-family: var(--font-mono);
	}

	/* === Cross section === */
	.cross-section {
		display: flex;
		flex-direction: column-reverse;
		border: 1px solid var(--border-subtle);
		background: var(--bg-inset);
		overflow: hidden;
	}

	.cs-substrate {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 32px;
		background: repeating-linear-gradient(
			45deg,
			var(--bg-panel),
			var(--bg-panel) 3px,
			#33333a 3px,
			#33333a 6px
		);
	}
	.cs-substrate span {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
	}

	.cs-oxide {
		height: 6px;
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
		height: 4px;
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
			-45deg,
			transparent,
			transparent 2px,
			rgba(0,0,0,0.3) 2px,
			rgba(0,0,0,0.3) 4px
		);
	}

	.cs-passivation {
		height: 3px;
		background: #3a3a44;
	}

	/* === Layer list === */
	.layer-list {
		display: flex;
		flex-direction: column;
	}
	.layer-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
	}
	.layer-row.dimmed {
		opacity: 0.35;
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
	.layer-tag {
		font-size: 8px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		border: 1px solid var(--border-subtle);
		padding: 0 3px;
		margin-left: auto;
		letter-spacing: 0.5px;
	}
	.layer-meta {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		margin-left: auto;
	}

	/* === Detail panel === */
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

	/* === Substrate section === */
	.sub-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding-top: 6px;
		border-top: 1px solid var(--border-subtle);
	}
	.sub-header {
		font-size: 10px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		font-weight: 500;
		margin-bottom: 2px;
	}
</style>
