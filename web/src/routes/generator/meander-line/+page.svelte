<script lang="ts">
	import '$lib/components/fields.css';
	import type { LayerMap } from '$lib/geometry/types';
	import type { MeanderLineParams } from '$lib/geometry/meander_line';
	import { buildMeanderLine, isMeanderLineValid } from '$lib/geometry/meander_line';
	import { create2MetalStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	function doExport() {
		const data = exportGds(layers, { cellName: 'MeanderLine' });
		downloadGds(data, 'meander_line.gds');
	}

	let p = $state<MeanderLineParams>({
		segments: 8, segmentLength: 60, width: 5, spacing: 5,
	});

	let stack = $state(create2MetalStack());

	function set(k: keyof MeanderLineParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof MeanderLineParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof MeanderLineParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	let result = $derived.by(() => {
		try { return buildMeanderLine({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		return mergeLayers(result.layers);
	});
	let valid = $derived(isMeanderLineValid({ ...p }));
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
	<title>Meander Line Generator — RapidPassives</title>
	<meta name="description" content="Generate serpentine meander delay line layouts. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/meander-line" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Geometry</h4>
				<div class="f"><span>Segments</span><div class="fi"><button onclick={() => nud('segments',-1,2,100)}>-</button><input type="number" value={p.segments} oninput={e => inp('segments',e)}/><button onclick={() => nud('segments',1,2,100)}>+</button><em></em></div></div>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('segmentLength',-5,1)}>-</button><input type="number" value={p.segmentLength} oninput={e => inp('segmentLength',e)}/><button onclick={() => nud('segmentLength',5,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('spacing',-0.5,0.1)}>-</button><input type="number" value={p.spacing} oninput={e => inp('spacing',e)}/><button onclick={() => nud('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
