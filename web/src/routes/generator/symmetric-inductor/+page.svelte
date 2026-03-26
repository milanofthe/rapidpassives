<script lang="ts">
	import '$lib/components/fields.css';
	import type { SymmetricInductorParams, PgsParams, GuardRingParams, LayerMap } from '$lib/geometry/types';
	import { buildSymmetricInductor, isSymmetricInductorValid } from '$lib/geometry/symmetric_inductor';
	import { pgs4, guardRing } from '$lib/geometry/utils';
	import { createDefaultStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';
	function doExport() {
		const data = exportGds(layers, { cellName: 'SymmetricInductor' });
		downloadGds(data, 'symmetric_inductor.gds');
	}

	let p = $state<SymmetricInductorParams>({
		Dout: 250, N: 3, sides: 8, width: 16, spacing: 2,
		center_tap: false, via_extent: 8,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let pgsP = $state<PgsParams>({ enabled: false, D: 270, width: 4, spacing: 2 });
	let gr = $state<GuardRingParams>({ enabled: false, margin: 10, ringWidth: 5 });
	let stack = $state(createDefaultStack());

	function set(k: keyof SymmetricInductorParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof SymmetricInductorParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof SymmetricInductorParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	function setPgs(k: keyof PgsParams, v: any) { pgsP = { ...pgsP, [k]: v }; }
	function nudPgs(k: keyof PgsParams, s: number, mn?: number, mx?: number) { setPgs(k, nudgeValue(pgsP[k] as number, s, mn, mx)); }
	function inpPgs(k: keyof PgsParams, e: Event) { const v = parseInput(e); if (v !== null) setPgs(k, v); }

	function setGR(k: keyof GuardRingParams, v: any) { gr = { ...gr, [k]: v }; }
	function nudGR(k: keyof GuardRingParams, s: number, mn?: number, mx?: number) { setGR(k, nudgeValue(gr[k] as number, s, mn, mx)); }
	function inpGR(k: keyof GuardRingParams, e: Event) { const v = parseInput(e); if (v !== null) setGR(k, v); }

	let result = $derived.by(() => {
		try { return buildSymmetricInductor({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		const l = { ...result.layers };
		if (pgsP.enabled) l.pgs = pgs4(pgsP.D, pgsP.width, pgsP.spacing);
		const merged = mergeLayers(l);
		if (gr.enabled) {
			const bbox = p.Dout + 2 * p.width;
			const grLayers = guardRing(bbox, bbox, gr.margin, gr.ringWidth, p.via_spacing, p.via_width, p.via_in_metal, ['guard_ring', 'crossings', 'windings'], ['vias2', 'vias1']);
			for (const [k, v] of Object.entries(grLayers)) merged[k as keyof LayerMap] = [...(merged[k as keyof LayerMap] || []), ...v];
		}
		return merged;
	});
	let valid = $derived(isSymmetricInductorValid({ ...p }));
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
	<title>Symmetric Inductor Generator — RapidPassives</title>
	<meta name="description" content="Generate differential symmetric inductor layouts with optional center tap. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/symmetric-inductor" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Geometry</h4>
				<div class="f"><span>Dout</span><div class="fi"><button onclick={() => nud('Dout',-1,1)}>-</button><input type="number" value={p.Dout} oninput={e => inp('Dout',e)}/><button onclick={() => nud('Dout',1,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>N</span><div class="fi"><button onclick={() => nud('N',-1,1,20)}>-</button><input type="number" value={p.N} oninput={e => inp('N',e)}/><button onclick={() => nud('N',1,1,20)}>+</button><em>turns</em></div></div>
				<div class="f"><span>Sides</span><div class="fi"><button onclick={() => nud('sides',-2,4,64)}>-</button><input type="number" value={p.sides} oninput={e => inp('sides',e)}/><button onclick={() => nud('sides',2,4,64)}>+</button><em></em></div></div>
				<div class="f"><span>Aspect</span><div class="fi"><button onclick={() => set('aspectRatio', Math.round(Math.max(0.1, (p.aspectRatio ?? 1) - 0.1) * 10) / 10)}>-</button><input type="number" value={p.aspectRatio ?? ''} placeholder="1.0" step="0.1" oninput={e => { const v = parseInput(e); set('aspectRatio', v && v > 0 ? v : undefined); }}/><button onclick={() => set('aspectRatio', Math.round(((p.aspectRatio ?? 1) + 0.1) * 10) / 10)}>+</button><em></em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('spacing',-0.5,0.1)}>-</button><input type="number" value={p.spacing} oninput={e => inp('spacing',e)}/><button onclick={() => nud('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Center Tap</span><div class="fi"><button class="toggle-btn" class:active={p.center_tap} onclick={() => set('center_tap', !p.center_tap)}>{p.center_tap ? 'ON' : 'OFF'}</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Ports</h4>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => set('portSpacing', Math.max(0, (p.portSpacing ?? p.spacing) - 1) || undefined)}>-</button><input type="number" value={p.portSpacing ?? ''} placeholder="auto" oninput={e => { const v = parseInput(e); set('portSpacing', v && v > 0 ? v : undefined); }}/><button onclick={() => set('portSpacing', (p.portSpacing ?? p.spacing) + 1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Vias</h4>
				<div class="f"><span>Extent</span><div class="fi"><button onclick={() => nud('via_extent',-0.5,0.5)}>-</button><input type="number" value={p.via_extent} oninput={e => inp('via_extent',e)}/><button onclick={() => nud('via_extent',0.5,0.5)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('via_spacing',-0.1,0.1)}>-</button><input type="number" value={p.via_spacing} oninput={e => inp('via_spacing',e)}/><button onclick={() => nud('via_spacing',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('via_width',-0.1,0.1)}>-</button><input type="number" value={p.via_width} oninput={e => inp('via_width',e)}/><button onclick={() => nud('via_width',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>In Metal</span><div class="fi"><button onclick={() => nud('via_in_metal',-0.05,0)}>-</button><input type="number" value={p.via_in_metal} oninput={e => inp('via_in_metal',e)}/><button onclick={() => nud('via_in_metal',0.05,0)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>PGS</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={pgsP.enabled} onclick={() => setPgs('enabled', !pgsP.enabled)}>{pgsP.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if pgsP.enabled}
					<div class="f"><span>Diameter</span><div class="fi"><button onclick={() => nudPgs('D',-1,1)}>-</button><input type="number" value={pgsP.D} oninput={e => inpPgs('D',e)}/><button onclick={() => nudPgs('D',1,1)}>+</button><em>um</em></div></div>
					<div class="f"><span>Width</span><div class="fi"><button onclick={() => nudPgs('width',-0.5,0.1)}>-</button><input type="number" value={pgsP.width} oninput={e => inpPgs('width',e)}/><button onclick={() => nudPgs('width',0.5,0.1)}>+</button><em>um</em></div></div>
					<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nudPgs('spacing',-0.5,0.1)}>-</button><input type="number" value={pgsP.spacing} oninput={e => inpPgs('spacing',e)}/><button onclick={() => nudPgs('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
				{/if}
			</div>
			<div class="param-section"><h4>Guard Ring</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={gr.enabled} onclick={() => setGR('enabled', !gr.enabled)}>{gr.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if gr.enabled}
					<div class="f"><span>Margin</span><div class="fi"><button onclick={() => nudGR('margin',-1,1)}>-</button><input type="number" value={gr.margin} oninput={e => inpGR('margin',e)}/><button onclick={() => nudGR('margin',1,1)}>+</button><em>um</em></div></div>
					<div class="f"><span>Ring Width</span><div class="fi"><button onclick={() => nudGR('ringWidth',-0.5,0.5)}>-</button><input type="number" value={gr.ringWidth} oninput={e => inpGR('ringWidth',e)}/><button onclick={() => nudGR('ringWidth',0.5,0.5)}>+</button><em>um</em></div></div>
				{/if}
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
