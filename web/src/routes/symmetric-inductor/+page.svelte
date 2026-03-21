<script lang="ts">
	import '$lib/components/fields.css';
	import type { SymmetricInductorParams, PgsParams, LayerMap } from '$lib/geometry/types';
	import { buildSymmetricInductor, isSymmetricInductorValid } from '$lib/geometry/symmetric_inductor';
	import { pgs4 } from '$lib/geometry/utils';
	import { createDefaultStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';

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
	let stack = $state(createDefaultStack());

	function set(k: keyof SymmetricInductorParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof SymmetricInductorParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof SymmetricInductorParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	function setPgs(k: keyof PgsParams, v: any) { pgsP = { ...pgsP, [k]: v }; }
	function nudPgs(k: keyof PgsParams, s: number, mn?: number, mx?: number) { setPgs(k, nudgeValue(pgsP[k] as number, s, mn, mx)); }
	function inpPgs(k: keyof PgsParams, e: Event) { const v = parseInput(e); if (v !== null) setPgs(k, v); }

	let result = $derived.by(() => {
		try { return buildSymmetricInductor({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		const l = { ...result.layers };
		if (pgsP.enabled) l.pgs = pgs4(pgsP.D, pgsP.width, pgsP.spacing);
		return l;
	});
	let valid = $derived(isSymmetricInductorValid({ ...p }));
	let renderOpts = $derived({ colorOverrides: stackToColorMap(stack), visibleLayers: stackToVisibleSet(stack) });
</script>

<GeometryEditor {layers} {valid} {renderOpts}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Geometry</h4>
				<div class="f"><span>Dout</span><div class="fi"><button onclick={() => nud('Dout',-1,1)}>-</button><input type="number" value={p.Dout} oninput={e => inp('Dout',e)}/><button onclick={() => nud('Dout',1,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>N</span><div class="fi"><button onclick={() => nud('N',-1,1,20)}>-</button><input type="number" value={p.N} oninput={e => inp('N',e)}/><button onclick={() => nud('N',1,1,20)}>+</button><em>turns</em></div></div>
				<div class="f"><span>Sides</span><div class="fi"><button onclick={() => nud('sides',-2,4,64)}>-</button><input type="number" value={p.sides} oninput={e => inp('sides',e)}/><button onclick={() => nud('sides',2,4,64)}>+</button><em></em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('spacing',-0.5,0.1)}>-</button><input type="number" value={p.spacing} oninput={e => inp('spacing',e)}/><button onclick={() => nud('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Center Tap</span><div class="fi"><button class="toggle-btn" class:active={p.center_tap} onclick={() => set('center_tap', !p.center_tap)}>{p.center_tap ? 'ON' : 'OFF'}</button><em></em></div></div>
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
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 10px;">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>
