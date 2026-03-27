<script lang="ts">
	import '$lib/components/fields.css';
	import ParamField from '$lib/components/ParamField.svelte';
	import type { StackedTransformerParams, PgsParams, GuardRingParams, LayerMap } from '$lib/geometry/types';
	import { buildStackedTransformer, isStackedTransformerValid } from '$lib/geometry/stacked_transformer';
	import { pgs4, guardRing } from '$lib/geometry/utils';
	import { stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import { PDKS, pdkMapToStack, pdkMapToGdsLayers } from '$lib/stack/pdk';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import PdkSelect from '$lib/components/PdkSelect.svelte';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	let pdkId = $state('sky130');
	let stack = $state(pdkMapToStack(PDKS.sky130.generators['4metal'], 'SKY130'));

	$effect(() => {
		const map = PDKS[pdkId]?.generators['4metal'];
		if (map) stack = pdkMapToStack(map, PDKS[pdkId]?.name ?? pdkId);
	});

	function doExport() {
		const map = PDKS[pdkId]?.generators['4metal'];
		const gdsLayers = map ? pdkMapToGdsLayers(map) : undefined;
		const data = exportGds(layers, { gdsLayers, cellName: 'StackedTransformer' });
		downloadGds(data, 'stacked_transformer.gds');
	}

	let p = $state<StackedTransformerParams>({
		Dout: 250, N1: 3, N2: 3, sides: 8, width: 12, spacing: 2,
		center_tap_primary: false, center_tap_secondary: false,
		via_extent: 8, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let pgsP = $state<PgsParams>({ enabled: false, D: 270, width: 4, spacing: 2 });
	let gr = $state<GuardRingParams>({ enabled: false, margin: 10, ringWidth: 5 });


	function set<K extends keyof StackedTransformerParams>(k: K, v: StackedTransformerParams[K]) { p = { ...p, [k]: v }; }
	function setPgs<K extends keyof PgsParams>(k: K, v: PgsParams[K]) { pgsP = { ...pgsP, [k]: v }; }
	function setGR<K extends keyof GuardRingParams>(k: K, v: GuardRingParams[K]) { gr = { ...gr, [k]: v }; }

	let result = $derived.by(() => {
		try { return buildStackedTransformer({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		const l = { ...result.layers };
		if (pgsP.enabled) l.pgs = pgs4(pgsP.D, pgsP.width, pgsP.spacing);
		const merged = mergeLayers(l);
		if (gr.enabled) {
			const bbox = p.Dout + 2 * p.width;
			const grLayers = guardRing(bbox, bbox, gr.margin, gr.ringWidth, p.via_spacing, p.via_width, p.via_in_metal, ['guard_ring', 'crossings', 'windings', 'windings_m4'], ['vias2', 'vias1', 'vias3']);
			for (const [k, v] of Object.entries(grLayers)) merged[k as keyof LayerMap] = [...(merged[k as keyof LayerMap] || []), ...v];
		}
		return merged;
	});
	let valid = $derived(isStackedTransformerValid({ ...p }));
	let portMarkers = $derived.by(() => {
		if (!result) return [];
		const nodeMap = new Map(result.network.nodes.map(n => [n.id, n]));
		return result.network.ports.map(port => {
			const node = nodeMap.get(port.node);
			return node ? { name: port.name, x: node.x, y: node.y } : null;
		}).filter((p): p is { name: string; x: number; y: number } => p !== null);
	});
	let renderOpts = $derived({ colorOverrides: stackToColorMap(stack), visibleLayers: stackToVisibleSet(stack), ports: portMarkers });
</script>

<svelte:head>
	<title>Stacked Transformer Generator — RapidPassives</title>
	<meta name="description" content="Generate vertically stacked differential transformer layouts on separate metal layers. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/stacked-transformer" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Geometry</h4>
				<ParamField label="Dout" value={p.Dout} unit="um" step={1} min={1} onchange={v => set('Dout', v ?? 250)} />
				<ParamField label="Sides" value={p.sides} step={2} min={4} max={64} onchange={v => set('sides', v ?? 8)} />
				<ParamField label="Width" value={p.width} unit="um" step={0.5} min={0.1} onchange={v => set('width', v ?? 12)} />
				<ParamField label="Spacing" value={p.spacing} unit="um" step={0.5} min={0.1} onchange={v => set('spacing', v ?? 2)} />
			</div>
			<div class="param-section"><h4>Primary (M4)</h4>
				<ParamField label="N1" value={p.N1} unit="turns" step={1} min={1} max={20} onchange={v => set('N1', v ?? 3)} />
			</div>
			<div class="param-section"><h4>Secondary (M2)</h4>
				<ParamField label="N2" value={p.N2} unit="turns" step={1} min={1} max={20} onchange={v => set('N2', v ?? 3)} />
			</div>
			<div class="param-section"><h4>Ports</h4>
				<ParamField label="Spacing" value={p.portSpacing ?? ''} placeholder="auto" unit="um" step={1} min={0} onchange={v => set('portSpacing', v && v > 0 ? v : undefined)} />
			</div>
			<div class="param-section"><h4>Vias</h4>
				<ParamField label="Extent" value={p.via_extent} unit="um" step={0.5} min={0.5} onchange={v => set('via_extent', v ?? 8)} />
				<ParamField label="Spacing" value={p.via_spacing} unit="um" step={0.1} min={0.1} onchange={v => set('via_spacing', v ?? 0.8)} />
				<ParamField label="Width" value={p.via_width} unit="um" step={0.1} min={0.1} onchange={v => set('via_width', v ?? 1)} />
				<ParamField label="In Metal" value={p.via_in_metal} unit="um" step={0.05} min={0} onchange={v => set('via_in_metal', v ?? 0.45)} />
			</div>
			<div class="param-section"><h4>PGS</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={pgsP.enabled} onclick={() => setPgs('enabled', !pgsP.enabled)}>{pgsP.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if pgsP.enabled}
					<ParamField label="Diameter" value={pgsP.D} unit="um" step={1} min={1} onchange={v => setPgs('D', v ?? 270)} />
					<ParamField label="Width" value={pgsP.width} unit="um" step={0.5} min={0.1} onchange={v => setPgs('width', v ?? 4)} />
					<ParamField label="Spacing" value={pgsP.spacing} unit="um" step={0.5} min={0.1} onchange={v => setPgs('spacing', v ?? 2)} />
				{/if}
			</div>
			<div class="param-section"><h4>Guard Ring</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={gr.enabled} onclick={() => setGR('enabled', !gr.enabled)}>{gr.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if gr.enabled}
					<ParamField label="Margin" value={gr.margin} unit="um" step={1} min={1} onchange={v => setGR('margin', v ?? 10)} />
					<ParamField label="Ring Width" value={gr.ringWidth} unit="um" step={0.5} min={0.5} onchange={v => setGR('ringWidth', v ?? 5)} />
				{/if}
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div class="stack-wrapper">
			<StackView bind:stack>
				{#snippet header()}
					<div class="param-section"><h4>Process</h4>
						<PdkSelect bind:value={pdkId} />
					</div>
				{/snippet}
			</StackView>
		</div>
	{/snippet}
</GeometryEditor>

<style>
	.stack-wrapper {
		padding: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
</style>
