<script lang="ts">
	import '$lib/components/fields.css';
	import type { PatchAntennaParams, LayerMap } from '$lib/geometry/types';
	import { buildPatchAntenna, isPatchAntennaValid } from '$lib/geometry/patch_antenna';
	import { create2MetalStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	function doExport() {
		const data = exportGds(layers, { cellName: 'PatchAntenna' });
		downloadGds(data, 'patch_antenna.gds');
	}

	let p = $state<PatchAntennaParams>({
		W: 200, L: 160, feedType: 'inset',
		feedWidth: 10, feedLength: 80,
		insetDepth: 40, insetGap: 2,
		groundMargin: 60,
	});

	let stack = $state(create2MetalStack());

	function set(k: keyof PatchAntennaParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof PatchAntennaParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof PatchAntennaParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

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
			<div class="param-section"><h4>Patch</h4>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('W',-5,1)}>-</button><input type="number" value={p.W} oninput={e => inp('W',e)}/><button onclick={() => nud('W',5,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('L',-5,1)}>-</button><input type="number" value={p.L} oninput={e => inp('L',e)}/><button onclick={() => nud('L',5,1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Feed</h4>
				<div class="f"><span>Type</span><div class="fi"><button class="toggle-btn" class:active={p.feedType === 'inset'} onclick={() => set('feedType', p.feedType === 'inset' ? 'edge' : 'inset')}>{p.feedType === 'inset' ? 'Inset' : 'Edge'}</button><em></em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('feedWidth',-1,0.5)}>-</button><input type="number" value={p.feedWidth} oninput={e => inp('feedWidth',e)}/><button onclick={() => nud('feedWidth',1,0.5)}>+</button><em>um</em></div></div>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('feedLength',-5,1)}>-</button><input type="number" value={p.feedLength} oninput={e => inp('feedLength',e)}/><button onclick={() => nud('feedLength',5,1)}>+</button><em>um</em></div></div>
				{#if p.feedType === 'inset'}
					<div class="f"><span>Inset Depth</span><div class="fi"><button onclick={() => nud('insetDepth',-1,0)}>-</button><input type="number" value={p.insetDepth} oninput={e => inp('insetDepth',e)}/><button onclick={() => nud('insetDepth',1,0)}>+</button><em>um</em></div></div>
					<div class="f"><span>Inset Gap</span><div class="fi"><button onclick={() => nud('insetGap',-0.5,0.1)}>-</button><input type="number" value={p.insetGap} oninput={e => inp('insetGap',e)}/><button onclick={() => nud('insetGap',0.5,0.1)}>+</button><em>um</em></div></div>
				{/if}
			</div>
			<div class="param-section"><h4>Ground</h4>
				<div class="f"><span>Margin</span><div class="fi"><button onclick={() => nud('groundMargin',-5,1)}>-</button><input type="number" value={p.groundMargin} oninput={e => inp('groundMargin',e)}/><button onclick={() => nud('groundMargin',5,1)}>+</button><em>um</em></div></div>
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
