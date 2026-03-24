<script lang="ts">
	import '$lib/components/fields.css';
	import type { MomCapacitorParams, GuardRingParams, LayerMap } from '$lib/geometry/types';
	import { buildMomCapacitor, isMomCapacitorValid } from '$lib/geometry/mom_capacitor';
	import { guardRing } from '$lib/geometry/utils';
	import { createDefaultStack, stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { nudgeValue, parseInput } from '$lib/components/fields';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';
	function doExport() {
		const data = exportGds(layers, { cellName: 'MomCapacitor' });
		downloadGds(data, 'mom_capacitor.gds');
	}

	let p = $state<MomCapacitorParams>({
		nFingers: 21, fingerLength: 40, fingerWidth: 1, fingerSpacing: 1,
		busWidth: 4, nLayers: 3,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let gr = $state<GuardRingParams>({ enabled: false, margin: 5, ringWidth: 3 });
	let stack = $state(createDefaultStack());

	function set(k: keyof MomCapacitorParams, v: any) { p = { ...p, [k]: v }; }
	function nud(k: keyof MomCapacitorParams, s: number, mn?: number, mx?: number) { set(k, nudgeValue(p[k] as number, s, mn, mx)); }
	function inp(k: keyof MomCapacitorParams, e: Event) { const v = parseInput(e); if (v !== null) set(k, v); }

	function setGR(k: keyof GuardRingParams, v: any) { gr = { ...gr, [k]: v }; }
	function nudGR(k: keyof GuardRingParams, s: number, mn?: number, mx?: number) { setGR(k, nudgeValue(gr[k] as number, s, mn, mx)); }
	function inpGR(k: keyof GuardRingParams, e: Event) { const v = parseInput(e); if (v !== null) setGR(k, v); }

	let result = $derived.by(() => {
		try { return buildMomCapacitor({ ...p }); } catch { return null; }
	});
	let layers = $derived.by<LayerMap>(() => {
		if (!result) return {};
		const l = { ...result.layers };
		const nf = p.nFingers % 2 === 0 ? p.nFingers + 1 : p.nFingers;
		const pitch = p.fingerWidth + p.fingerSpacing;
		const bboxW = nf * p.fingerWidth + (nf - 1) * p.fingerSpacing + pitch / 2;
		const bboxH = p.fingerLength + 2 * p.busWidth;
		const merged = mergeLayers(l);
		if (gr.enabled) {
			const allML: import('$lib/geometry/types').LayerName[] = ['windings', 'windings_m2', 'crossings_m1'];
			const allVL: import('$lib/geometry/types').LayerName[] = ['vias1', 'vias2'];
			const mLayers = allML.slice(0, p.nLayers);
			const vLayers = allVL.slice(0, p.nLayers - 1);
			const grLayers = guardRing(bboxW, bboxH, gr.margin, gr.ringWidth, p.via_spacing, p.via_width, p.via_in_metal, mLayers, vLayers);
			for (const [k, v] of Object.entries(grLayers)) merged[k as keyof LayerMap] = [...(merged[k as keyof LayerMap] || []), ...v];
		}
		return merged;
	});
	let valid = $derived(isMomCapacitorValid({ ...p }));
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

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>Fingers</h4>
				<div class="f"><span>Count</span><div class="fi"><button onclick={() => nud('nFingers',-2,2)}>-</button><input type="number" value={p.nFingers} oninput={e => inp('nFingers',e)}/><button onclick={() => nud('nFingers',2,2)}>+</button><em></em></div></div>
				<div class="f"><span>Length</span><div class="fi"><button onclick={() => nud('fingerLength',-1,1)}>-</button><input type="number" value={p.fingerLength} oninput={e => inp('fingerLength',e)}/><button onclick={() => nud('fingerLength',1,1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('fingerWidth',-0.1,0.1)}>-</button><input type="number" value={p.fingerWidth} oninput={e => inp('fingerWidth',e)}/><button onclick={() => nud('fingerWidth',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('fingerSpacing',-0.1,0.1)}>-</button><input type="number" value={p.fingerSpacing} oninput={e => inp('fingerSpacing',e)}/><button onclick={() => nud('fingerSpacing',0.1,0.1)}>+</button><em>um</em></div></div>
			</div>
			<div class="param-section"><h4>Structure</h4>
				<div class="f"><span>Bus Width</span><div class="fi"><button onclick={() => nud('busWidth',-0.5,0.5)}>-</button><input type="number" value={p.busWidth} oninput={e => inp('busWidth',e)}/><button onclick={() => nud('busWidth',0.5,0.5)}>+</button><em>um</em></div></div>
				<div class="f"><span>Layers</span><div class="fi"><button onclick={() => nud('nLayers',-1,1,3)}>-</button><input type="number" value={p.nLayers} oninput={e => inp('nLayers',e)}/><button onclick={() => nud('nLayers',1,1,3)}>+</button><em></em></div></div>
			</div>
			<div class="param-section"><h4>Vias</h4>
				<div class="f"><span>Spacing</span><div class="fi"><button onclick={() => nud('via_spacing',-0.1,0.1)}>-</button><input type="number" value={p.via_spacing} oninput={e => inp('via_spacing',e)}/><button onclick={() => nud('via_spacing',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>Width</span><div class="fi"><button onclick={() => nud('via_width',-0.1,0.1)}>-</button><input type="number" value={p.via_width} oninput={e => inp('via_width',e)}/><button onclick={() => nud('via_width',0.1,0.1)}>+</button><em>um</em></div></div>
				<div class="f"><span>In Metal</span><div class="fi"><button onclick={() => nud('via_in_metal',-0.05,0)}>-</button><input type="number" value={p.via_in_metal} oninput={e => inp('via_in_metal',e)}/><button onclick={() => nud('via_in_metal',0.05,0)}>+</button><em>um</em></div></div>
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
