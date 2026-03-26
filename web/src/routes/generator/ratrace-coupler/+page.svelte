<script lang="ts">
	import '$lib/components/fields.css';
	import type { LayerMap } from '$lib/geometry/types';
	import type { RatraceCouplerParams } from '$lib/geometry/ratrace_coupler';
	import { buildRatraceCoupler, isRatraceCouplerValid } from '$lib/geometry/ratrace_coupler';
	import { create2MetalStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';


	function doExport() {
		const data = exportGds(layers, { cellName: 'RatraceCoupler' });
		downloadGds(data, 'ratrace_coupler.gds');
	}

	let p = $state<RatraceCouplerParams>({
		radius: 120, ringWidth: 8, portWidth: 10, feedLength: 40, sides: 64,
	});

	let stack = $state(create2MetalStack());

	function set(k: keyof RatraceCouplerParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof RatraceCouplerParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof RatraceCouplerParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	let result = $derived.by(() => {
		try { return buildRatraceCoupler({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		return result.layers;
	});
	let valid = $derived(isRatraceCouplerValid({ ...p }));
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
	<title>Rat-Race Coupler Generator — RapidPassives</title>
	<meta name="description" content="Generate rat-race (ring hybrid) coupler layouts. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/ratrace-coupler" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Ring</h4>
				<div class="f"><span>Radius</span><div class="fi"><button onclick={() => nud('radius',-5,1)}>-</button><input type="number" value={p.radius} oninput={e => inp('radius',e)}/><button onclick={() => nud('radius',5,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('ringWidth',-0.5,0.1)}>-</button><input type="number" value={p.ringWidth} oninput={e => inp('ringWidth',e)}/><button onclick={() => nud('ringWidth',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Sides</span><div class="fi"><button onclick={() => nud('sides',-4,8,128)}>-</button><input type="number" value={p.sides} oninput={e => inp('sides',e)}/><button onclick={() => nud('sides',4,8,128)}>+</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Ports</h4>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('portWidth',-0.5,0.1)}>-</button><input type="number" value={p.portWidth} oninput={e => inp('portWidth',e)}/><button onclick={() => nud('portWidth',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Feed Length</span><div class="fi"><button onclick={() => nud('feedLength',-5,1)}>-</button><input type="number" value={p.feedLength} oninput={e => inp('feedLength',e)}/><button onclick={() => nud('feedLength',5,1)}>+</button><em>um</em></div></div>
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
