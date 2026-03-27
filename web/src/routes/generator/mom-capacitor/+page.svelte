<script lang="ts">
	import '$lib/components/fields.css';
	import ParamField from '$lib/components/ParamField.svelte';
	import type { MomCapacitorParams, GuardRingParams, LayerMap } from '$lib/geometry/types';
	import { buildMomCapacitor, isMomCapacitorValid } from '$lib/geometry/mom_capacitor';
	import { guardRing } from '$lib/geometry/utils';
	import { stackToColorMap, stackToVisibleSet } from '$lib/stack/types';
	import { PDK_MAPPINGS, PDK_NAMES, pdkMapToStack, pdkMapToGdsLayers } from '$lib/stack/pdk-mapping';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import ParamSidebar from '$lib/components/ParamSidebar.svelte';
	import StackView from '$lib/components/StackView.svelte';
	import { exportGds, downloadGds } from '$lib/gds/writer';
	import { mergeLayers } from '$lib/geometry/merge';

	let pdkId = $state('sky130');
	let stack = $state(pdkMapToStack(PDK_MAPPINGS.sky130['3metal'], 'SKY130'));

	$effect(() => {
		const map = PDK_MAPPINGS[pdkId]?.['3metal'];
		if (map) stack = pdkMapToStack(map, PDK_NAMES[pdkId]);
	});

	function doExport() {
		const map = PDK_MAPPINGS[pdkId]?.['3metal'];
		const gdsLayers = map ? pdkMapToGdsLayers(map) : undefined;
		const data = exportGds(layers, { gdsLayers, cellName: 'MomCapacitor' });
		downloadGds(data, 'mom_capacitor.gds');
	}

	let p = $state<MomCapacitorParams>({
		nFingers: 21, fingerLength: 40, fingerWidth: 1, fingerSpacing: 1,
		busWidth: 4, nLayers: 3,
		via_spacing: 0.8, via_width: 1, via_in_metal: 0.45,
	});

	let gr = $state<GuardRingParams>({ enabled: false, margin: 5, ringWidth: 3 });


	function set<K extends keyof MomCapacitorParams>(k: K, v: MomCapacitorParams[K]) { p = { ...p, [k]: v }; }
	function setGR<K extends keyof GuardRingParams>(k: K, v: GuardRingParams[K]) { gr = { ...gr, [k]: v }; }

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

<svelte:head>
	<title>MOM Capacitor Generator — RapidPassives</title>
	<meta name="description" content="Generate interdigitated metal-oxide-metal finger capacitor layouts. Real-time preview and GDS-II export." />
	<link rel="canonical" href="https://rapidpassives.org/generator/mom-capacitor" />
</svelte:head>

<GeometryEditor {layers} {valid} {renderOpts} {stack}>
	{#snippet sidebar()}
		<ParamSidebar onexport={doExport}>
			<div class="param-section"><h4>PDK</h4>
				<div class="f"><span>Process</span><div class="fi">
					<select bind:value={pdkId}>
						{#each Object.entries(PDK_NAMES) as [id, name]}
							<option value={id}>{name}</option>
						{/each}
					</select>
				</div></div>
			</div>
			<div class="param-section"><h4>Fingers</h4>
				<ParamField label="Count" value={p.nFingers} step={2} min={2} onchange={v => set('nFingers', v ?? 21)} />
				<ParamField label="Length" value={p.fingerLength} unit="um" step={1} min={1} onchange={v => set('fingerLength', v ?? 40)} />
				<ParamField label="Width" value={p.fingerWidth} unit="um" step={0.1} min={0.1} onchange={v => set('fingerWidth', v ?? 1)} />
				<ParamField label="Spacing" value={p.fingerSpacing} unit="um" step={0.1} min={0.1} onchange={v => set('fingerSpacing', v ?? 1)} />
			</div>
			<div class="param-section"><h4>Structure</h4>
				<ParamField label="Bus Width" value={p.busWidth} unit="um" step={0.5} min={0.5} onchange={v => set('busWidth', v ?? 4)} />
				<ParamField label="Layers" value={p.nLayers} step={1} min={1} max={3} onchange={v => set('nLayers', v ?? 3)} />
			</div>
			<div class="param-section"><h4>Vias</h4>
				<ParamField label="Spacing" value={p.via_spacing} unit="um" step={0.1} min={0.1} onchange={v => set('via_spacing', v ?? 0.8)} />
				<ParamField label="Width" value={p.via_width} unit="um" step={0.1} min={0.1} onchange={v => set('via_width', v ?? 1)} />
				<ParamField label="In Metal" value={p.via_in_metal} unit="um" step={0.05} min={0} onchange={v => set('via_in_metal', v ?? 0.45)} />
			</div>
			<div class="param-section"><h4>Guard Ring</h4>
				<div class="f"><span>Enabled</span><div class="fi"><button class="toggle-btn" class:active={gr.enabled} onclick={() => setGR('enabled', !gr.enabled)}>{gr.enabled ? 'ON' : 'OFF'}</button><em></em></div></div>
				{#if gr.enabled}
					<ParamField label="Margin" value={gr.margin} unit="um" step={1} min={1} onchange={v => setGR('margin', v ?? 5)} />
					<ParamField label="Ring Width" value={gr.ringWidth} unit="um" step={0.5} min={0.5} onchange={v => setGR('ringWidth', v ?? 3)} />
				{/if}
			</div>
		</ParamSidebar>
	{/snippet}
	{#snippet stackPanel()}
		<div class="stack-wrapper">
			<StackView bind:stack />
		</div>
	{/snippet}
</GeometryEditor>

<style>
	.stack-wrapper {
		padding: var(--space-lg);
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
	}
</style>
