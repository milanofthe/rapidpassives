<script lang="ts">
	import '$lib/components/fields.css';
	import type { SpiralInductorParams, PgsParams, GuardRingParams, LayerMap } from '$lib/geometry/types';
	import { buildSpiralInductor, isSpiralValid, addPgs } from '$lib/geometry/spiral';
	import { guardRing } from '$lib/geometry/utils';
	import { stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import { PDK_MAPPINGS, PDK_NAMES, pdkMapToStack, pdkMapToGdsLayers } from '$lib/stack/pdk-mapping';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import ParamField from '$lib/components/ParamField.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import PdkSelect from '$lib/components/PdkSelect.svelte';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	let pdkId = $state('sky130');
	let stack = $state(pdkMapToStack(PDK_MAPPINGS.sky130['2metal'], 'SKY130'));

	$effect(() => {
		const map = PDK_MAPPINGS[pdkId]?.['2metal'];
		if (map) stack = pdkMapToStack(map, PDK_NAMES[pdkId]);
	});

	function doExport() {
		const map = PDK_MAPPINGS[pdkId]?.['2metal'];
		const gdsLayers = map ? pdkMapToGdsLayers(map) : undefined;
		const data = exportGds(layers, { gdsLayers, cellName: 'SpiralInductor' });
		downloadGds(data, 'spiral_inductor.gds');
	}

	let p = $state<SpiralInductorParams>({
		Dout: 130, N: 3, sides: 8, width: 10, spacing: 4,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let pgs = $state<PgsParams>({ enabled: false, D: 150, width: 2, spacing: 1 });
	let gr = $state<GuardRingParams>({ enabled: false, margin: 10, ringWidth: 5 });

	function set<K extends keyof SpiralInductorParams>(k: K, v: SpiralInductorParams[K]) { p = { ...p, [k]: v }; }

	let result = $derived.by(() => {
		try { return buildSpiralInductor({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		const l = { ...result.layers };
		if (pgs.enabled) addPgs(l, pgs.D, pgs.width, pgs.spacing);
		const merged = mergeLayers(l);
		if (gr.enabled) {
			const bbox = p.Dout + 2 * p.width;
			const grLayers = guardRing(bbox, bbox, gr.margin, gr.ringWidth, p.via_spacing, p.via_width, p.via_in_metal, ['crossings', 'windings'], ['vias1']);
			for (const [k, v] of Object.entries(grLayers)) merged[k as keyof LayerMap] = [...(merged[k as keyof LayerMap] || []), ...v];
		}
		return merged;
	});
	let valid = $derived(isSpiralValid({ ...p }));
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
	<title>Spiral Inductor Generator — RapidPassives</title>
	<meta name="description" content="Generate spiral inductor layouts with configurable geometry. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/spiral" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Geometry</h4>
				<ParamField label="Dout" value={p.Dout} unit="um" step={1} min={1} onchange={v => set('Dout', v ?? 130)} />
				<ParamField label="N" value={p.N} unit="turns" step={1} min={1} max={20} onchange={v => set('N', v ?? 3)} />
				<ParamField label="Sides" value={p.sides} step={2} min={4} max={64} onchange={v => set('sides', v ?? 8)} />
				<ParamField label="Aspect" value={p.aspectRatio ?? ''} placeholder="1.0" step={0.1} min={0.1} onchange={v => set('aspectRatio', v && v > 0 ? v : undefined)} />
				<ParamField label="Width" value={p.width} unit="um" step={0.5} min={0.1} onchange={v => set('width', v ?? 10)} />
				<ParamField label="Spacing" value={p.spacing} unit="um" step={0.5} min={0.1} onchange={v => set('spacing', v ?? 4)} />
			</div>
			<div class="param-section"><h4>Ports</h4>
				<div class="f"><span>Layout</span><div class="fi"><button class="toggle-btn" class:active={p.portSide === 'opposite'} onclick={() => set('portSide', p.portSide === 'opposite' ? 'same' : 'opposite')}>{p.portSide === 'opposite' ? 'Opposite' : 'Same Side'}</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Vias</h4>
				<ParamField label="Spacing" value={p.via_spacing} unit="um" step={0.1} min={0.1} onchange={v => set('via_spacing', v ?? 0.8)} />
				<ParamField label="Width" value={p.via_width} unit="um" step={0.1} min={0.1} onchange={v => set('via_width', v ?? 1)} />
				<ParamField label="In Metal" value={p.via_in_metal} unit="um" step={0.05} min={0} onchange={v => set('via_in_metal', v ?? 0.45)} />
			</div>
			<div class="param-section"><h4>PGS</h4>
				<ParamField label="Enabled" value={pgs.enabled ? 1 : 0} type="toggle" onchange={() => pgs = { ...pgs, enabled: !pgs.enabled }} />
				{#if pgs.enabled}
					<ParamField label="Diameter" value={pgs.D} unit="um" step={1} min={1} onchange={v => pgs = { ...pgs, D: v ?? 150 }} />
					<ParamField label="Width" value={pgs.width} unit="um" step={0.5} min={0.1} onchange={v => pgs = { ...pgs, width: v ?? 2 }} />
					<ParamField label="Spacing" value={pgs.spacing} unit="um" step={0.5} min={0.1} onchange={v => pgs = { ...pgs, spacing: v ?? 1 }} />
				{/if}
			</div>
			<div class="param-section"><h4>Guard Ring</h4>
				<ParamField label="Enabled" value={gr.enabled ? 1 : 0} type="toggle" onchange={() => gr = { ...gr, enabled: !gr.enabled }} />
				{#if gr.enabled}
					<ParamField label="Margin" value={gr.margin} unit="um" step={1} min={1} onchange={v => gr = { ...gr, margin: v ?? 10 }} />
					<ParamField label="Ring Width" value={gr.ringWidth} unit="um" step={0.5} min={0.5} onchange={v => gr = { ...gr, ringWidth: v ?? 5 }} />
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
