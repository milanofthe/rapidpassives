<script lang="ts">
	import '$lib/components/fields.css';
	import ParamField from '$lib/components/ParamField.svelte';
	import type { LayerMap } from '$lib/geometry/types';
	import type { RatraceCouplerParams } from '$lib/geometry/ratrace_coupler';
	import { buildRatraceCoupler, isRatraceCouplerValid } from '$lib/geometry/ratrace_coupler';
	import { stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import { PDKS, pdkMapToStack, pdkMapToGdsLayers } from '$lib/stack/pdk';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackPanel from '$lib/components/StackPanel.svelte';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';
	import { extractPortMarkers } from '$lib/geometry/ports';

	let pdkId = $state('sky130');
	let stack = $state(pdkMapToStack(PDKS.sky130.generators['2metal'], 'SKY130'));

	$effect(() => {
		const map = PDKS[pdkId]?.generators['2metal'];
		if (map) stack = pdkMapToStack(map, PDKS[pdkId]?.name ?? pdkId);
	});

	function doExport() {
		const map = PDKS[pdkId]?.generators['2metal'];
		const gdsLayers = map ? pdkMapToGdsLayers(map) : undefined;
		const data = exportGds(layers, { gdsLayers, cellName: 'RatraceCoupler' });
		downloadGds(data, 'ratrace_coupler.gds');
	}

	let p = $state<RatraceCouplerParams>({
		radius: 120, ringWidth: 8, portWidth: 10, feedLength: 40, groundMargin: 30,
	});



	function set<K extends keyof RatraceCouplerParams>(k: K, v: RatraceCouplerParams[K]) { p = { ...p, [k]: v }; }

	let result = $derived.by(() => {
		try { return buildRatraceCoupler({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		return result.layers;
	});
	let valid = $derived(isRatraceCouplerValid({ ...p }));
	let portMarkers = $derived(extractPortMarkers(result));
	let renderOpts = $derived({ colorOverrides: stackToColorMap(stack), visibleLayers: stackToVisibleSet(stack), ports: portMarkers });
</script>

<svelte:head>
	<title>Rat-Race Coupler Generator — RapidPassives</title>
	<meta name="description" content="Generate rat-race (ring hybrid) coupler layouts. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/ratrace-coupler" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Ring</h4>
				<ParamField label="Radius" value={p.radius} unit="um" step={5} min={1} onchange={v => set('radius', v ?? 120)} />
				<ParamField label="Width" value={p.ringWidth} unit="um" step={0.5} min={0.1} onchange={v => set('ringWidth', v ?? 8)} />
			</div>
			<div class="param-section"><h4>Ports</h4>
				<ParamField label="Width" value={p.portWidth} unit="um" step={0.5} min={0.1} onchange={v => set('portWidth', v ?? 10)} />
				<ParamField label="Feed Length" value={p.feedLength} unit="um" step={5} min={1} onchange={v => set('feedLength', v ?? 40)} />
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<StackPanel bind:stack bind:pdkId />
	{/snippet}
</GeometryEditor>
