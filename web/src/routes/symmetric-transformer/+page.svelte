<script lang="ts">
	import '$lib/components/fields.css';
	import type { SymmetricTransformerParams, LayerMap } from '$lib/geometry/types';
	import { buildSymmetricTransformer } from '$lib/geometry/symmetric_transformer';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';

	let p = $state<SymmetricTransformerParams>({
		Dout: 200, N1: 2, N2: 3, sides: 8, width: 12, spacing: 2,
		center_tap_primary: true, center_tap_secondary: false,
		via_extent: 8, via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	function set(k: keyof SymmetricTransformerParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof SymmetricTransformerParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof SymmetricTransformerParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	let layers = $derived.by<LayerMap>(() => { try { return buildSymmetricTransformer({ ...p }); } catch { return {}; } });
</script>

<GeometryEditor {layers}>
	{#snippet sidebar()}
		<ParamSidebar>
			<div class="param-section"><h4>Geometry</h4>
				<div class="f"><span>Dout</span><div class="fi"><button onclick={() => nud('Dout',-1,1)}>-</button><input type="number" value={p.Dout} oninput={e => inp('Dout',e)}/><button onclick={() => nud('Dout',1,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Sides</span><div class="fi"><button onclick={() => nud('sides',-2,4,64)}>-</button><input type="number" value={p.sides} oninput={e => inp('sides',e)}/><button onclick={() => nud('sides',2,4,64)}>+</button><em></em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('width',-0.5,0.1)}>-</button><input type="number" value={p.width} oninput={e => inp('width',e)}/><button onclick={() => nud('width',0.5,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('spacing',-0.5,0.1)}>-</button><input type="number" value={p.spacing} oninput={e => inp('spacing',e)}/><button onclick={() => nud('spacing',0.5,0.1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Primary</h4>
				<div class="f"><span>N1</span><div class="fi"><button onclick={() => nud('N1',-1,1,20)}>-</button><input type="number" value={p.N1} oninput={e => inp('N1',e)}/><button onclick={() => nud('N1',1,1,20)}>+</button><em>turns</em></div></div>
				<div class="f"><span>Center Tap</span><div class="fi"><button class="toggle-btn" class:active={p.center_tap_primary} onclick={() => set('center_tap_primary', !p.center_tap_primary)}>{p.center_tap_primary ? 'ON' : 'OFF'}</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Secondary</h4>
				<div class="f"><span>N2</span><div class="fi"><button onclick={() => nud('N2',-1,1,20)}>-</button><input type="number" value={p.N2} oninput={e => inp('N2',e)}/><button onclick={() => nud('N2',1,1,20)}>+</button><em>turns</em></div></div>
				<div class="f"><span>Center Tap</span><div class="fi"><button class="toggle-btn" class:active={p.center_tap_secondary} onclick={() => set('center_tap_secondary', !p.center_tap_secondary)}>{p.center_tap_secondary ? 'ON' : 'OFF'}</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Vias</h4>
				<div class="f"><span>Extent</span><div class="fi"><button onclick={() => nud('via_extent',-0.5,0.5)}>-</button><input type="number" value={p.via_extent} oninput={e => inp('via_extent',e)}/><button onclick={() => nud('via_extent',0.5,0.5)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('via_spacing',-0.1,0.1)}>-</button><input type="number" value={p.via_spacing} oninput={e => inp('via_spacing',e)}/><button onclick={() => nud('via_spacing',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('via_width',-0.1,0.1)}>-</button><input type="number" value={p.via_width} oninput={e => inp('via_width',e)}/><button onclick={() => nud('via_width',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>In Metal</span><div class="fi"><button onclick={() => nud('via_in_metal',-0.05,0)}>-</button><input type="number" value={p.via_in_metal} oninput={e => inp('via_in_metal',e)}/><button onclick={() => nud('via_in_metal',0.05,0)}>+</button><em>um</em></div></div>
			</div>
		</ParamSidebar>
	{/snippet}
</GeometryEditor>
