<script lang="ts">
	import '$lib/components/fields.css';
	import type { PatchAntennaParams, LayerMap } from '$lib/geometry/types';
	import { buildPatchAntenna, isPatchAntennaValid, designPatchAntenna } from '$lib/geometry/patch_antenna';
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

	// Auto-design from frequency
	let designFreq = $state(2.4);
	let designEr = $state(4.4);
	let designH = $state(1.6);

	function autoDesign() {
		const d = designPatchAntenna(designFreq, designEr, designH);
		p = { ...p, W: d.W, L: d.L, insetDepth: d.insetDepth, feedType: 'inset' };
	}

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
			<div class="param-section"><h4>Design</h4>
				<div class="f"><span>Frequency</span><div class="fi"><button onclick={() => { designFreq = Math.max(0.1, Math.round((designFreq - 0.1) * 10) / 10); autoDesign(); }}>-</button><input type="number" value={designFreq} step="0.1" oninput={e => { const v = parseInput(e); if (v && v > 0) { designFreq = v; autoDesign(); } }}/><button onclick={() => { designFreq = Math.round((designFreq + 0.1) * 10) / 10; autoDesign(); }}>+</button><em>GHz</em></div></div>
				<div class="f"><span>εr</span><div class="fi"><button onclick={() => { designEr = Math.max(1, Math.round((designEr - 0.1) * 10) / 10); autoDesign(); }}>-</button><input type="number" value={designEr} step="0.1" oninput={e => { const v = parseInput(e); if (v && v >= 1) { designEr = v; autoDesign(); } }}/><button onclick={() => { designEr = Math.round((designEr + 0.1) * 10) / 10; autoDesign(); }}>+</button><em></em></div></div>
				<div class="f"><span>Height</span><div class="fi"><button onclick={() => { designH = Math.max(0.1, Math.round((designH - 0.1) * 10) / 10); autoDesign(); }}>-</button><input type="number" value={designH} step="0.1" oninput={e => { const v = parseInput(e); if (v && v > 0) { designH = v; autoDesign(); } }}/><button onclick={() => { designH = Math.round((designH + 0.1) * 10) / 10; autoDesign(); }}>+</button><em>mm</em></div></div>
			</div>
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
			<div class="param-section"><h4>Array</h4>
				<div class="f"><span>Columns</span><div class="fi"><button onclick={() => set('arrayCols', Math.max(1, (p.arrayCols ?? 1) - 1))}>-</button><input type="number" value={p.arrayCols ?? 1} oninput={e => { const v = parseInput(e); if (v && v >= 1) set('arrayCols', v); }}/><button onclick={() => set('arrayCols', (p.arrayCols ?? 1) + 1)}>+</button><em></em></div></div>
				<div class="f"><span>Rows</span><div class="fi"><button onclick={() => set('arrayRows', Math.max(1, (p.arrayRows ?? 1) - 1))}>-</button><input type="number" value={p.arrayRows ?? 1} oninput={e => { const v = parseInput(e); if (v && v >= 1) set('arrayRows', v); }}/><button onclick={() => set('arrayRows', (p.arrayRows ?? 1) + 1)}>+</button><em></em></div></div>
				{#if (p.arrayCols ?? 1) > 1 || (p.arrayRows ?? 1) > 1}
					<div class="f"><span>Spacing X</span><div class="fi"><button onclick={() => set('arraySpacingX', Math.max(p.W + 1, (p.arraySpacingX ?? p.W + p.groundMargin) - 10))}>-</button><input type="number" value={p.arraySpacingX ?? ''} placeholder="auto" oninput={e => { const v = parseInput(e); set('arraySpacingX', v && v > 0 ? v : undefined); }}/><button onclick={() => set('arraySpacingX', (p.arraySpacingX ?? p.W + p.groundMargin) + 10)}>+</button><em>um</em></div></div>
					<div class="f"><span>Spacing Y</span><div class="fi"><button onclick={() => set('arraySpacingY', Math.max(p.L + 1, (p.arraySpacingY ?? p.L + p.groundMargin) - 10))}>-</button><input type="number" value={p.arraySpacingY ?? ''} placeholder="auto" oninput={e => { const v = parseInput(e); set('arraySpacingY', v && v > 0 ? v : undefined); }}/><button onclick={() => set('arraySpacingY', (p.arraySpacingY ?? p.L + p.groundMargin) + 10)}>+</button><em>um</em></div></div>
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
