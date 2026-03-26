<script lang="ts">
	import '$lib/components/fields.css';
	import type { LayerMap } from '$lib/geometry/types';
	import type { MarchandBalunParams } from '$lib/geometry/balun';
	import { buildMarchandBalun, isMarchandBalunValid } from '$lib/geometry/balun';
	import { create2MetalStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	function doExport() {
		const data = exportGds(layers, { cellName: 'MarchandBalun' });
		downloadGds(data, 'marchand_balun.gds');
	}

	let p = $state<MarchandBalunParams>({
		coupledLength: 200, width: 8, gap: 3, stubLength: 50, feedLength: 40,
	});

	let stack = $state(create2MetalStack());

	function set(k: keyof MarchandBalunParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof MarchandBalunParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof MarchandBalunParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	let result = $derived.by(() => {
		try { return buildMarchandBalun({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		return mergeLayers(result.layers);
	});
	let valid = $derived(isMarchandBalunValid({ ...p }));
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
	<title>Marchand Balun Generator — RapidPassives</title>
	<meta name="description" content="Generate Marchand balun coupled-line layouts. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/balun" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Coupled Section</h4>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('coupledLength',-5,1)}>-</button><input type="number" value={p.coupledLength} oninput={e => inp('coupledLength',e)}/><button onclick={() => nud('coupledLength',5,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Gap</span><div class="fi"><button onclick={() => nud('gap',-0.5,0.1)}>-</button><input type="number" value={p.gap} oninput={e => inp('gap',e)}/><button onclick={() => nud('gap',0.5,0.1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Stubs</h4>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('stubLength',-5,0)}>-</button><input type="number" value={p.stubLength} oninput={e => inp('stubLength',e)}/><button onclick={() => nud('stubLength',5,0)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Feed</h4>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('feedLength',-5,1)}>-</button><input type="number" value={p.feedLength} oninput={e => inp('feedLength',e)}/><button onclick={() => nud('feedLength',5,1)}>+</button><em>um</em></div></div>
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
