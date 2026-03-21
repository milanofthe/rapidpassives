<script lang="ts">
	import '$lib/components/fields.css';
	import type { SpiralInductorParams, PgsParams, LayerMap } from '$lib/geometry/types';
	import { buildSpiralInductor, isSpiralValid, addPgs } from '$lib/geometry/spiral';
	import { createDefaultStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';

	let p = $state<SpiralInductorParams>({
		Dout: 130, N: 3, sides: 8, width: 10, spacing: 4,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let pgs = $state<PgsParams>({ enabled: false, D: 150, width: 2, spacing: 1 });
	let stack = $state(createDefaultStack());

	function set(k: keyof SpiralInductorParams, v: number) { p = { ...p, [k]: v }; }
	function nud(k: keyof SpiralInductorParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof SpiralInductorParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	function setPgs(k: keyof PgsParams, v: any) { pgs = { ...pgs, [k]: v }; }
	function nudPgs(k: keyof PgsParams, s: number, mn?: number, mx?: number) { setPgs(k, nudgeValue(pgs[k] as number, s, mn, mx)); }
	function inpPgs(k: keyof PgsParams, e: Event) { const v = parseInput(e); if (v !== null) setPgs(k, v); }

	let layers = $derived.by<LayerMap>(() => {
		try {
			const l = buildSpiralInductor({ ...p });
			if (pgs.enabled) addPgs(l, pgs.D, pgs.width, pgs.spacing);
			return l;
		} catch { return {}; }
	});
	let valid = $derived(isSpiralValid({ ...p }));
	let renderOpts = $derived({ colorOverrides: stackToColorMap(stack), visibleLayers: stackToVisibleSet(stack) });
</script>

<GeometryEditor {layers} {valid} {renderOpts}>
	{#snippet sidebar()}
		<ParamSidebar>
			<div class="param-section"><h4>Geometry</h4>
				<div class="f"><span>Dout</span><div class="fi"><button onclick={() => nud('Dout',-1,1)}>-</button><input type="number" value={p.Dout} oninput={e => inp('Dout',e)}/><button onclick={() => nud('Dout',1,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>N</span><div class="fi"><button onclick={() => nud('N',-1,1,20)}>-</button><input type="number" value={p.N} oninput={e => inp('N',e)}/><button onclick={() => nud('N',1,1,20)}>+</button><em>turns</em></div></div>
				<div class="f"><span>Sides</span><div class="fi"><button onclick={() => nud('sides',-2,4,64)}>-</button><input type="number" value={p.sides} oninput={e => inp('sides',e)}/><button onclick={() => nud('sides',2,4,64)}>+</button><em></em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('spacing',-0.5,0.1)}>-</button><input type="number" value={p.spacing} oninput={e => inp('spacing',e)}/><button onclick={() => nud('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Vias</h4>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('via_spacing',-0.1,0.1)}>-</button><input type="number" value={p.via_spacing} oninput={e => inp('via_spacing',e)}/><button onclick={() => nud('via_spacing',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('via_width',-0.1,0.1)}>-</button><input type="number" value={p.via_width} oninput={e => inp('via_width',e)}/><button onclick={() => nud('via_width',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>In Metal</span><div class="fi"><button onclick={() => nud('via_in_metal',-0.05,0)}>-</button><input type="number" value={p.via_in_metal} oninput={e => inp('via_in_metal',e)}/><button onclick={() => nud('via_in_metal',0.05,0)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>PGS</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={pgs.enabled} onclick={() => setPgs('enabled', !pgs.enabled)}>{pgs.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if pgs.enabled}
					<div class="f"><span>Diameter</span><div class="fi"><button onclick={() => nudPgs('D',-1,1)}>-</button><input type="number" value={pgs.D} oninput={e => inpPgs('D',e)}/><button onclick={() => nudPgs('D',1,1)}>+</button><em>um</em></div></div>
					<div class="f"><span>Width</span><div class="fi"><button onclick={() => nudPgs('width',-0.5,0.1)}>-</button><input type="number" value={pgs.width} oninput={e => inpPgs('width',e)}/><button onclick={() => nudPgs('width',0.5,0.1)}>+</button><em>um</em></div></div>
					<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nudPgs('spacing',-0.5,0.1)}>-</button><input type="number" value={pgs.spacing} oninput={e => inpPgs('spacing',e)}/><button onclick={() => nudPgs('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
				{/if}
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div style="padding: 10px; display: flex; flex-direction: column; gap: 2px;">
			<div class="param-section">
				<StackView bind:stack />
			</div>
		</div>
	{/snippet}
</GeometryEditor>
