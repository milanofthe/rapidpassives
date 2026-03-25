<script lang="ts">
	import '$lib/components/fields.css';
	import type { LayerName, LayerMap } from '$lib/geometry/types';
	import type { ProcessStack, StackLayer } from '$lib/stack/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import { readGdsInWorker } from '$lib/gds/reader';
	import { type InstancedSceneData } from '$lib/render/canvas3d';
	import { PRESET_LIST, PRESETS } from '$lib/stack/presets/index';
	import { applyPreset } from '$lib/stack/presets/apply';
	import { parseLyp, parseCsvLayerMap } from '$lib/stack/presets/lyp-parser';
	import GeometryEditor from '$lib/components/GeometryEditor.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	onMount(() => {
		// Check for pending file from landing page drop
		const pending = (window as any).__gdsPendingFile as File | undefined;
		if (pending) {
			delete (window as any).__gdsPendingFile;
			sessionStorage.removeItem('gds-pending');
			handleFile(pending);
			return;
		}

		// Check for ?url= query parameter
		const gdsUrl = page.url.searchParams.get('url');
		if (gdsUrl) {
			fetchFromUrl(gdsUrl);
		}
	});

	async function fetchFromUrl(url: string) {
		loading = true;
		loadProgress = 0;
		loadPolyCount = 0;
		loadPhase = 'Fetching file...';
		fileName = url.split('/').pop() || 'remote.gds';
		error = '';

		try {
			const resp = await fetch(url);
			if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
			const bytes = new Uint8Array(await resp.arrayBuffer());
			await loadBytes(bytes);
		} catch (e: any) {
			error = `Fetch error: ${e.message}`;
			loading = false;
			console.error(e);
		}
	}

	/** Color palette for arbitrary GDS layers */
	const PALETTE = [
		'#e8944a', '#d9513c', '#6bbf8a', '#4a9ec2', '#7b5e8a',
		'#f0b86a', '#c94a3a', '#5aad78', '#c4c46b', '#b86ad9',
		'#5a9a9a', '#d97070', '#70a0d9', '#a0d970', '#d9a070',
	];

	/** Reverse lookup from GDS layer number to internal LayerName */
	const GDS_TO_LAYER: Record<number, LayerName> = {
		1: 'windings', 2: 'crossings', 3: 'vias', 4: 'centertap',
		5: 'vias2', 6: 'windings_m2', 7: 'crossings_m1', 8: 'windings_m4',
		9: 'vias3', 10: 'pgs', 11: 'guard_ring',
	};

	interface GdsLayerInfo {
		gdsNum: number;
		color: string;
		visible: boolean;
		polyCount: number;
		thickness: number;
	}

	let fileName = $state('');
	let gdsLayers = $state<GdsLayerInfo[]>([]);
	let dragOver = $state(false);
	let error = $state('');
	let loading = $state(false);
	let loadProgress = $state(0);
	let loadPolyCount = $state(0);
	let loadPhase = $state('');
	let instancedScene = $state<InstancedSceneData | null>(null);

	// Drag reorder state
	let dragIdx = $state<number | null>(null);
	/** Insertion point: the dragged item will be placed *before* this index */
	let insertIdx = $state<number | null>(null);

	// Empty LayerMap — geometry is rendered via instancedScene, not LayerMap
	const layers: LayerMap = {};

	// Assign generic layer names from the available LayerName slots
	const GENERIC_SLOTS: LayerName[] = ['windings', 'crossings', 'windings_m2', 'crossings_m1', 'windings_m4', 'vias', 'vias1', 'vias2', 'vias3', 'centertap', 'pgs', 'guard_ring'];
	const usedSlots = new Set<LayerName>();
	function assignGenericLayer(gdsNum: number): LayerName | null {
		if (GDS_TO_LAYER[gdsNum]) return GDS_TO_LAYER[gdsNum];
		for (const slot of GENERIC_SLOTS) {
			if (!usedSlots.has(slot)) {
				const directlyMapped = gdsLayers.some(l => GDS_TO_LAYER[l.gdsNum] === slot);
				if (!directlyMapped) {
					usedSlots.add(slot);
					GDS_TO_LAYER[gdsNum] = slot;
					return slot;
				}
			}
		}
		return null;
	}

	let stack = $state<ProcessStack>(buildViewerStack());
	let renderOpts = $derived<RenderOptions>({
		colorOverrides: buildColorOverrides(),
		visibleLayers: buildVisibleSet(),
		layerLabels: buildLayerLabels(),
	});

	function buildColorOverrides(): Record<string, string> {
		const map: Record<string, string> = {};
		for (const info of gdsLayers) {
			const ln = GDS_TO_LAYER[info.gdsNum];
			if (ln) map[ln] = info.color;
		}
		return map;
	}

	function buildLayerLabels(): Record<string, string> {
		const map: Record<string, string> = {};
		for (const info of gdsLayers) {
			const ln = GDS_TO_LAYER[info.gdsNum];
			if (ln) map[ln] = layerMapNames.get(info.gdsNum) ?? `Layer ${info.gdsNum}`;
		}
		return map;
	}

	function buildVisibleSet(): Set<LayerName> {
		const set = new Set<LayerName>();
		for (const info of gdsLayers) {
			if (!info.visible) continue;
			const ln = GDS_TO_LAYER[info.gdsNum];
			if (ln) set.add(ln);
		}
		return set;
	}

	function buildViewerStack(): ProcessStack {
		const stackLayers: StackLayer[] = [
			{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 300, color: '#4a4a5a', gdsLayers: [], visible: true },
		];

		// Use gdsLayers order (user-controlled via drag) for z-stacking
		let z = 300.5;
		for (const info of gdsLayers) {
			const ln = GDS_TO_LAYER[info.gdsNum];
			if (!ln) continue;
			stackLayers.push({
				id: `gds_${info.gdsNum}`,
				name: `Layer ${info.gdsNum}`,
				type: 'metal',
				z,
				thickness: info.thickness,
				color: info.color,
				gdsLayers: [ln],
				visible: info.visible,
			});
			z += info.thickness;
		}

		return {
			name: 'GDS Import',
			layers: stackLayers,
			substrateThickness: 300,
			oxideEr: 4.0,
			substrateRho: 10,
			substrateEr: 11.7,
		};
	}

	// Rebuild stack when layers change
	$effect(() => {
		if (gdsLayers.length > 0) {
			stack = buildViewerStack();
		}
	});

	function handleFile(file: File) {
		error = '';
		if (!file.name.toLowerCase().endsWith('.gds') && !file.name.toLowerCase().endsWith('.gdsii') && !file.name.toLowerCase().endsWith('.gds2')) {
			error = 'Please drop a .gds file';
			return;
		}

		fileName = file.name;
		loading = true;
		loadProgress = 0;
		loadPolyCount = 0;
		loadPhase = 'Reading file...';

		const reader = new FileReader();
		reader.onload = async () => {
			const bytes = new Uint8Array(reader.result as ArrayBuffer);
			await loadBytes(bytes);
		};
		reader.readAsArrayBuffer(file);
	}

	async function loadBytes(bytes: Uint8Array) {
		try {
			// Full reset of layer mapping and state
			usedSlots.clear();
			for (const key of Object.keys(GDS_TO_LAYER)) delete GDS_TO_LAYER[Number(key)];
			// Restore defaults
			Object.assign(GDS_TO_LAYER, {
				1: 'windings', 2: 'crossings', 3: 'vias', 4: 'centertap',
				5: 'vias2', 6: 'windings_m2', 7: 'crossings_m1', 8: 'windings_m4',
				9: 'vias3', 10: 'pgs', 11: 'guard_ring',
			} as Record<number, LayerName>);
			gdsLayers = [];
			instancedScene = null;

			const result = await readGdsInWorker(bytes, (p) => {
				loadPolyCount = p.polygonCount;
				const phaseNames: Record<string, string> = {
					parsing: 'Parsing records...',
					'building hierarchy': 'Analyzing hierarchy...',
					triangulating: 'Triangulating...',
					done: 'Done',
				};
				loadPhase = phaseNames[p.phase] ?? p.phase;
				loadProgress = p.phase === 'done' ? 1 : p.phase === 'triangulating' ? 0.6 : 0.2;
			});

			instancedScene = { cellMeshes: result.cellMeshes, cellInstances: result.cellInstances };

			// Build layer info from the cell meshes
			const gdsLayerNums = new Set<number>();
			for (const meshes of Object.values(result.cellMeshes)) {
				for (const key of Object.keys(meshes)) gdsLayerNums.add(Number(key));
			}
			const sortedKeys = [...gdsLayerNums].sort((a, b) => a - b);
			for (const gdsNum of sortedKeys) {
				if (!GDS_TO_LAYER[gdsNum]) assignGenericLayer(gdsNum);
			}
			gdsLayers = sortedKeys.map((gdsNum, i) => ({
				gdsNum,
				color: PALETTE[i % PALETTE.length],
				visible: true,
				polyCount: 0,
				thickness: 0.5,
			}));

			totalPolygons = result.polygonCount;
			loading = false;
		} catch (e: any) {
			error = `Parse error: ${e.message}`;
			loading = false;
			console.error(e);
		}
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) handleFile(file);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	function onFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) handleFile(file);
	}

	function toggleLayer(i: number) {
		gdsLayers = gdsLayers.map((l, j) => j === i ? { ...l, visible: !l.visible } : l);
	}

	function setThickness(i: number, value: number) {
		if (value <= 0 || !isFinite(value)) return;
		gdsLayers = gdsLayers.map((l, j) => j === i ? { ...l, thickness: value } : l);
	}


	// Drag reorder handlers
	function onRowDragStart(e: DragEvent, i: number) {
		dragIdx = i;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', String(i));
		}
	}

	function onRowDragOver(e: DragEvent, i: number) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		// Determine if cursor is in top or bottom half of the row
		const target = (e.currentTarget as HTMLElement);
		const rect = target.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		insertIdx = e.clientY < midY ? i : i + 1;
	}

	function onRowDrop(e: DragEvent) {
		e.preventDefault();
		if (dragIdx !== null && insertIdx !== null) {
			let target = insertIdx;
			// Adjust target if dragging from before the insertion point
			if (dragIdx < target) target--;
			if (dragIdx !== target) {
				const arr = [...gdsLayers];
				const [moved] = arr.splice(dragIdx, 1);
				arr.splice(target, 0, moved);
				gdsLayers = arr;
			}
		}
		dragIdx = null;
		insertIdx = null;
	}

	function onRowDragEnd() {
		dragIdx = null;
		insertIdx = null;
	}

	let selectedPreset = $state('');

	function onPresetChange(e: Event) {
		const id = (e.target as HTMLSelectElement).value;
		selectedPreset = id;
		if (!id || !instancedScene) return;
		const preset = PRESETS[id];
		if (!preset) return;

		// Collect GDS layer numbers present in the loaded file
		const gdsLayersInFile = new Set<number>();
		for (const meshes of Object.values(instancedScene.cellMeshes)) {
			for (const key of Object.keys(meshes)) gdsLayersInFile.add(Number(key));
		}

		const applied = applyPreset(preset, gdsLayersInFile);

		// Update layer mapping
		for (const key of Object.keys(GDS_TO_LAYER)) delete GDS_TO_LAYER[Number(key)];
		Object.assign(GDS_TO_LAYER, applied.gdsLayerMap);

		// Update gdsLayers with preset info
		const infos: GdsLayerInfo[] = [];
		for (const sl of applied.stack.layers) {
			if (sl.type === 'substrate') continue;
			const gdsNum = Number(sl.id.replace(/^preset_|^generic_/, ''));
			const info = applied.layerInfo.get(gdsNum);
			infos.push({
				gdsNum,
				color: info?.color ?? sl.color,
				visible: sl.visible,
				polyCount: 0,
				thickness: info?.thickness ?? sl.thickness,
			});
		}
		gdsLayers = infos;
		stack = applied.stack;
	}

	function onLayerMapDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const file = e.dataTransfer?.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			const ext = file.name.toLowerCase();
			let parsed;
			if (ext.endsWith('.lyp')) {
				parsed = parseLyp(text);
			} else if (ext.endsWith('.csv')) {
				parsed = parseCsvLayerMap(text);
			} else if (ext.endsWith('.json')) {
				try {
					const json = JSON.parse(text);
					if (Array.isArray(json.layers)) {
						parsed = json.layers.map((l: any) => ({
							gds: l.gds, datatype: l.datatype ?? 0, name: l.name,
							color: l.color ?? '#888888', visible: true,
						}));
					}
				} catch {}
			}
			if (!parsed || parsed.length === 0) return;

			// Apply names and colors from the layermap to existing gdsLayers
			const nameMap = new Map(parsed.map((l: any) => [l.gds, l]));
			gdsLayers = gdsLayers.map(info => {
				const match = nameMap.get(info.gdsNum);
				if (!match) return info;
				return { ...info, color: match.color || info.color };
			});

			// Update layer labels
			for (const l of parsed) {
				const ln = GDS_TO_LAYER[l.gds];
				if (ln) {
					// Name will be picked up via buildLayerLabels
				}
			}
			// Store parsed names for label display
			for (const l of parsed) {
				layerMapNames.set(l.gds, l.name);
			}
		};
		reader.readAsText(file);
	}

	let layerMapNames = $state(new Map<number, string>());

	let totalPolygons = $state(0);
	let loaded = $derived(gdsLayers.length > 0);
</script>

{#if !loaded}
	<div class="dropzone-page">
		<div
			class="dropzone"
			class:dragover={dragOver}
			class:loading
			role="button"
			tabindex="0"
		>
			{#if loading}
				<svg class="border-spinner" viewBox="0 0 400 280">
					<rect x="1" y="1" width="398" height="278" rx="0" fill="none"
						stroke="var(--accent)" stroke-width="2"
						stroke-dasharray="{2 * (398 + 278)}"
						stroke-dashoffset="{2 * (398 + 278) * (1 - loadProgress)}"
					/>
				</svg>
				<p class="loading-phase">{loadPhase}</p>
				<p class="loading-text">{loadPolyCount > 0 ? `${loadPolyCount.toLocaleString()} polygons` : ''}</p>
			{:else}
				<div class="dropzone-icon">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="8" y="6" width="32" height="36" rx="2" />
						<path d="M16 24L24 32L32 24" />
						<path d="M24 16V32" />
					</svg>
				</div>
				<p class="dropzone-title">Drop GDS file here</p>
				<p class="dropzone-hint">or click to browse</p>
				<input type="file" accept=".gds,.gdsii,.gds2" class="dropzone-input" onchange={onFileInput} />
			{/if}
			{#if error}
				<p class="dropzone-error">{error}</p>
			{/if}
		</div>
	</div>
{:else}
	<GeometryEditor {layers} {renderOpts} {stack} {instancedScene} gdsLayerMap={GDS_TO_LAYER}
		onFileDrop={handleFile} dropLoading={loading} dropPhase={loadPhase} dropPolyCount={loadPolyCount}>
		{#snippet sidebar()}
			<div class="panel">
				<div class="file-info">
					<span class="file-name" title={fileName}>{fileName}</span>
				</div>
				<div class="stats">
					<span>{gdsLayers.length} layers</span>
					<span class="sep">/</span>
					<span>{totalPolygons.toLocaleString()} polygons</span>
				</div>

				<h4 class="section-label">Process</h4>
				<select class="preset-select" value={selectedPreset} onchange={onPresetChange}>
					<option value="">No preset</option>
					{#each PRESET_LIST as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="layermap-drop" ondrop={onLayerMapDrop} ondragover={(e) => e.preventDefault()}>
					<span>Drop .lyp / .csv / .json layermap</span>
				</div>

				<h4 class="section-label">Layers</h4>
				<p class="hint">Drag to reorder stack. Click to toggle visibility.</p>

				<div class="layer-list">
					{#each gdsLayers as info, i}
						{#if insertIdx === i && dragIdx !== null && dragIdx !== i && dragIdx !== i - 1}
							<div class="drop-indicator"></div>
						{/if}
						<div
							class="layer-row"
							class:dimmed={!info.visible}
							class:dragging={dragIdx === i}
							draggable="true"
							ondragstart={(e) => onRowDragStart(e, i)}
							ondragover={(e) => onRowDragOver(e, i)}
							ondrop={(e) => onRowDrop(e)}
							ondragend={onRowDragEnd}
							role="listitem"
						>
							<span class="drag-handle" title="Drag to reorder">
								<svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
									<circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
									<circle cx="2" cy="6" r="1" /><circle cx="6" cy="6" r="1" />
									<circle cx="2" cy="10" r="1" /><circle cx="6" cy="10" r="1" />
								</svg>
							</span>
							<button class="layer-toggle" onclick={() => toggleLayer(i)}>
								<span class="layer-swatch" style="background: {info.color};"></span>
								<span class="layer-num">L{info.gdsNum}</span>
								<span class="layer-count">{info.polyCount.toLocaleString()}</span>
								<span class="layer-vis">{info.visible ? 'ON' : 'OFF'}</span>
							</button>
							<div class="layer-thickness">
								<input
									type="number"
									value={info.thickness}
									step="0.1"
									min="0.01"
									oninput={(e) => { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) setThickness(i, v); }}
									onclick={(e) => e.stopPropagation()}
									title="Layer thickness (um)"
								/>
								<em>um</em>
							</div>
						</div>
					{/each}
					{#if insertIdx === gdsLayers.length && dragIdx !== null && dragIdx !== gdsLayers.length - 1}
						<div class="drop-indicator"></div>
					{/if}
				</div>
			</div>
		{/snippet}
	</GeometryEditor>
{/if}

<style>
	/* Drop zone page */
	.dropzone-page {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
	}
	.dropzone {
		position: relative;
		width: 400px;
		height: 280px;
		border: 2px dashed var(--border);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	.dropzone:hover, .dropzone.dragover {
		border-color: var(--accent);
		background: var(--accent-dim);
	}
	.dropzone-icon {
		color: var(--text-dim);
	}
	.dropzone.dragover .dropzone-icon {
		color: var(--accent);
	}
	.dropzone-title {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--text-muted);
	}
	.dropzone-hint {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
	}
	.dropzone-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.dropzone.loading {
		border-color: transparent;
		pointer-events: none;
	}
	.border-spinner {
		position: absolute;
		inset: -1px;
		width: calc(100% + 2px);
		height: calc(100% + 2px);
		pointer-events: none;
	}
	.border-spinner rect {
		transition: stroke-dashoffset 0.3s ease;
	}
	.loading-phase {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent);
	}
	.loading-text {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
		min-height: 14px;
	}
	.dropzone-error {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--accent);
		margin-top: 4px;
	}

	/* Sidebar */
	.panel {
		height: 100%;
		overflow-y: auto;
		padding: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--bg);
	}
	.file-info {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.file-name {
		font-size: var(--fs-sm);
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex: 1;
	}
	.stats {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-dim);
		display: flex;
		gap: 6px;
	}
	.sep {
		color: var(--border);
	}
	.section-label {
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--accent);
		text-transform: uppercase;
		letter-spacing: 1px;
		margin-top: 4px;
	}
	.preset-select {
		width: 100%;
		padding: 5px 8px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: var(--text-muted);
		cursor: pointer;
	}
	.preset-select:focus {
		border-color: var(--input-focus);
		outline: none;
	}
	.layermap-drop {
		padding: 8px;
		border: 1px dashed var(--border);
		text-align: center;
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		cursor: default;
		transition: border-color 0.15s, color 0.15s;
	}
	.layermap-drop:hover {
		border-color: var(--accent);
		color: var(--text-muted);
	}
	.hint {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--text-dim);
		line-height: 1.4;
	}
	.layer-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.layer-row {
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		transition: border-color 0.15s;
		font-family: var(--font-mono);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.layer-row:hover {
		border-color: var(--accent);
	}
	.layer-row.dimmed {
		opacity: 0.4;
	}
	.layer-row.dragging {
		opacity: 0.3;
	}
	.drop-indicator {
		height: 2px;
		background: var(--accent);
		border-radius: 1px;
		margin: -1px 0;
		position: relative;
		z-index: 1;
	}
	.drag-handle {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 4px;
		cursor: grab;
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.drag-handle:active {
		cursor: grabbing;
	}
	.layer-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		padding: 5px 4px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
		text-align: left;
	}
	.layer-swatch {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
	}
	.layer-num {
		font-weight: 600;
		min-width: 32px;
	}
	.layer-count {
		flex: 1;
		color: var(--text-dim);
	}
	.layer-vis {
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.5px;
		min-width: 20px;
		text-align: right;
	}
	.layer-thickness {
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: 6px;
		flex-shrink: 0;
	}
	.layer-thickness input {
		width: 42px;
		padding: 2px 4px;
		font-size: 9px;
		font-family: var(--font-mono);
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: var(--text-muted);
		text-align: right;
	}
	.layer-thickness input:focus {
		border-color: var(--input-focus);
		outline: none;
	}
	.layer-thickness em {
		font-size: 9px;
		font-style: normal;
		color: var(--text-dim);
	}
</style>
