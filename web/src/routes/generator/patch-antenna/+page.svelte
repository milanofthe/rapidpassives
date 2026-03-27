<script lang="ts">
	import '$lib/components/fields.css';
	import ParamField from '$lib/components/ParamField.svelte';
	import type { PatchAntennaParams, LayerMap } from '$lib/geometry/types';
	import { buildPatchAntenna, isPatchAntennaValid, designPatchAntenna } from '$lib/geometry/patch_antenna';
	import { stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import { PDK_MAPPINGS, PDK_NAMES, pdkMapToStack, pdkMapToGdsLayers } from '$lib/stack/pdk-mapping';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
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
		const data = exportGds(layers, { gdsLayers, cellName: 'PatchAntenna' });
		downloadGds(data, 'patch_antenna.gds');
	}

	let p = $state<PatchAntennaParams>({
		W: 200, L: 160, feedType: 'inset',
		feedWidth: 10, feedLength: 80,
		insetDepth: 40, insetGap: 2,
		groundMargin: 60,
	});



	// Auto-design from frequency
	let designFreq = $state(2.4);
	let designEr = $state(4.4);
	let designH = $state(1.6);

	function autoDesign() {
		const d = designPatchAntenna(designFreq, designEr, designH);
		p = { ...p, W: d.W, L: d.L, insetDepth: d.insetDepth, feedType: 'inset' };
	}

	function set<K extends keyof PatchAntennaParams>(k: K, v: PatchAntennaParams[K]) { p = { ...p, [k]: v }; }

	let result = $derived.by(() => {
		try { return buildPatchAntenna({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		return mergeLayers(result.layers);
	});
	let valid = $derived(isPatchAntennaValid({ ...p }));
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
	<title>Patch Antenna Generator — RapidPassives</title>
	<meta name="description" content="Generate microstrip patch antenna layouts with inset or edge feed. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/patch-antenna" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Design</h4>
				<ParamField label="Frequency" value={designFreq} unit="GHz" step={0.1} min={0.1} onchange={v => { if (v && v > 0) { designFreq = v; autoDesign(); } }} />
				<ParamField label="εr" value={designEr} step={0.1} min={1} onchange={v => { if (v && v >= 1) { designEr = v; autoDesign(); } }} />
				<ParamField label="Height" value={designH} unit="mm" step={0.1} min={0.1} onchange={v => { if (v && v > 0) { designH = v; autoDesign(); } }} />
			</div>
			<div class="param-section"><h4>Patch</h4>
				<ParamField label="Width" value={p.W} unit="um" step={5} min={1} onchange={v => set('W', v ?? 200)} />
				<ParamField label="Length" value={p.L} unit="um" step={5} min={1} onchange={v => set('L', v ?? 160)} />
			</div>
			<div class="param-section"><h4>Feed</h4>
				<div class="f"><span>Type</span><div class="fi"><button class="toggle-btn" class:active={p.feedType === 'inset'} onclick={() => set('feedType', p.feedType === 'inset' ? 'edge' : 'inset')}>{p.feedType === 'inset' ? 'Inset' : 'Edge'}</button><em></em></div></div>
				<ParamField label="Width" value={p.feedWidth} unit="um" step={1} min={0.5} onchange={v => set('feedWidth', v ?? 10)} />
				<ParamField label="Length" value={p.feedLength} unit="um" step={5} min={1} onchange={v => set('feedLength', v ?? 80)} />
				{#if p.feedType === 'inset'}
					<ParamField label="Inset Depth" value={p.insetDepth} unit="um" step={1} min={0} onchange={v => set('insetDepth', v ?? 40)} />
					<ParamField label="Inset Gap" value={p.insetGap} unit="um" step={0.5} min={0.1} onchange={v => set('insetGap', v ?? 2)} />
				{/if}
			</div>
			<div class="param-section"><h4>Ground</h4>
				<ParamField label="Margin" value={p.groundMargin} unit="um" step={5} min={1} onchange={v => set('groundMargin', v ?? 60)} />
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
