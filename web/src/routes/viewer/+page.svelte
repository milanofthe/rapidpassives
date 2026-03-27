<script lang="ts">
	import '$lib/components/fields.css';
	import type { LayerMap } from '$lib/geometry/types';
	// LayerName no longer needed — GDS viewer uses direct GDS layer numbers
	import type { ProcessStack, StackLayer } from '$lib/stack/types';
	import type { RenderOptions } from '$lib/render/canvas2d';
	import { readGdsInWorker } from '$lib/gds/reader';
	import { type InstancedSceneData } from '$lib/render/canvas3d';
	import { PDKS, PDK_LIST } from '$lib/stack/pdk';
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

		// Check for ?url= query parameter (use window.location directly to avoid SvelteKit timing issues)
		const params = new URLSearchParams(window.location.search);
		const gdsUrl = params.get('url');
		if (gdsUrl) {
			fetchFromUrl(gdsUrl);
		}
	});

	/** Convert GitHub blob/tree URLs to raw URLs (handles LFS too) */
	function resolveGitHubUrl(url: string): string {
		// github.com/user/repo/blob/branch/path → raw.githubusercontent.com/user/repo/branch/path
		const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
		if (blobMatch) {
			return `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}/${blobMatch[3]}`;
		}
		return url;
	}

	async function fetchFromUrl(url: string) {
		loading = true;
		loadProgress = 0;
		loadPolyCount = 0;
		loadPhase = 'Fetching file...';
		fileName = url.split('/').pop()?.split('?')[0] || 'remote.gds';
		error = '';

		try {
			const resolved = resolveGitHubUrl(url);
			const resp = await fetch(resolved, { mode: 'cors' });
			if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
			const bytes = new Uint8Array(await resp.arrayBuffer());

			// Check for Git LFS pointer (text file starting with "version https://git-lfs")
			if (bytes.length < 200) {
				const text = new TextDecoder().decode(bytes);
				if (text.startsWith('version https://git-lfs')) {
					throw new Error('This file is stored in Git LFS. Download it directly or use a non-LFS URL.');
				}
			}

			await loadBytes(bytes);
		} catch (e: any) {
			error = `Failed to load: ${e.message}`;
			loading = false;
			console.error('[gds-viewer] Fetch failed:', e);
		}
	}

	/** Color palette for arbitrary GDS layers */
	const PALETTE = [
		'#e8944a', '#d9513c', '#6bbf8a', '#4a9ec2', '#7b5e8a',
		'#f0b86a', '#c94a3a', '#5aad78', '#c4c46b', '#b86ad9',
		'#5a9a9a', '#d97070', '#70a0d9', '#a0d970', '#d9a070',
	];


	interface GdsLayerInfo {
		gdsNum: number;
		color: string;
		visible: boolean;
		polyCount: number;
		thickness: number;
	}

	let fileName = $state('');
	let gdsLayers = $state<GdsLayerInfo[]>([]);
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
	const renderOpts: RenderOptions = {};

	// Direct GDS layer info for the renderer — no LayerName indirection
	let gdsLayerInfo = $derived.by(() => {
		const map = new Map<number, import('$lib/render/canvas3d').GdsLayerInfo>();
		// z follows sidebar order: first in list = lowest z (bottom of stack)
		let z = 0.5;
		for (const info of gdsLayers) {
			map.set(info.gdsNum, { z, thickness: info.thickness, color: info.color });
			z += info.thickness;
		}
		return map;
	});

	// Set of visible GDS layer numbers for render-time filtering (no mesh rebuild)
	let visibleGdsLayers = $derived(new Set(gdsLayers.filter(l => l.visible).map(l => l.gdsNum)));

	let stack = $state<ProcessStack>({
		name: 'GDS Import',
		layers: [
			{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 0, color: '#4a4a5a', gdsLayers: [], visible: true },
		],
		substrateThickness: 0,
		oxideEr: 4.0,
		substrateRho: 10,
		substrateEr: 11.7,
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

			instancedScene = { cellMeshes: result.cellMeshes, cellEdges: result.cellEdges, cellInstances: result.cellInstances };

			// Build layer info directly from GDS layer numbers — no LayerName indirection
			const gdsLayerNums = new Set<number>();
			for (const meshes of Object.values(result.cellMeshes)) {
				for (const key of Object.keys(meshes)) gdsLayerNums.add(Number(key));
			}
			gdsLayers = [...gdsLayerNums].sort((a, b) => a - b).map((gdsNum, i) => ({
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
	let presetOpen = $state(false);

	function applyPresetById(id: string) {
		selectedPreset = id;
		if (!instancedScene) return;

		// Show loading
		loading = true;
		loadPhase = id ? `Applying ${PDKS[id]?.name ?? id}...` : 'Resetting layers...';

		// Defer to let UI show loading state
		requestAnimationFrame(() => {
			if (!id) {
				// Reset to generic stack
				resetToGenericStack();
			} else {
				const pdk = PDKS[id];
				if (!pdk) { loading = false; return; }

				// Match PDK layers to GDS layers in the file
				const pdkByGds = new Map(pdk.layers.map(l => [l.gds, l]));

				// Apply PDK colors/thickness/names to existing gdsLayers
				gdsLayers = gdsLayers.map(info => {
					const pdkLayer = pdkByGds.get(info.gdsNum);
					return pdkLayer ? {
						...info,
						color: pdkLayer.color,
						thickness: pdkLayer.thickness,
					} : info;
				});
				// Update labels from PDK
				layerMapNames = new Map(
					pdk.layers.filter(l => gdsLayers.some(g => g.gdsNum === l.gds)).map(l => [l.gds, l.name] as [number, string])
				);
			}

			loading = false;
		});
	}

	function resetToGenericStack() {
		if (!instancedScene) return;
		layerMapNames = new Map();

		const gdsLayerNums = new Set<number>();
		for (const meshes of Object.values(instancedScene.cellMeshes)) {
			for (const key of Object.keys(meshes)) gdsLayerNums.add(Number(key));
		}
		gdsLayers = [...gdsLayerNums].sort((a, b) => a - b).map((gdsNum, i) => ({
			gdsNum,
			color: PALETTE[i % PALETTE.length],
			visible: true,
			polyCount: 0,
			thickness: 0.5,
		}));
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

<svelte:head>
	<title>GDS-II Viewer — RapidPassives</title>
	<meta name="description" content="Import and visualize GDS-II layout files in 2D and 3D. No installation required." />
	<link rel="canonical" href="https://rapidpassives.org/viewer" />
</svelte:head>

<GeometryEditor {layers} {renderOpts} {stack} {instancedScene} {gdsLayerInfo} {visibleGdsLayers}
	onFileDrop={handleFile} dropLoading={loading} dropPhase={loadPhase} dropPolyCount={loadPolyCount}>
	{#snippet sidebar()}
		<div class="panel">
			{#if loaded}
				<div class="file-info">
					<span class="file-name" title={fileName}>{fileName}</span>
				</div>
				<div class="stats">
					<span>{gdsLayers.length} layers</span>
					<span class="sep">/</span>
					<span>{totalPolygons.toLocaleString()} polygons</span>
				</div>
			{:else}
				<div class="file-info">
					<span class="file-name" style="color: var(--text-dim)">No file loaded</span>
				</div>
			{/if}

			<h4 class="section-label">Process</h4>
				<div class="preset-dropdown">
					<button class="preset-btn" onclick={() => presetOpen = !presetOpen}>
						{selectedPreset ? PDKS[selectedPreset]?.name : 'No preset'}
						<svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M0 0L4 5L8 0Z"/></svg>
					</button>
					{#if presetOpen}
						<div class="preset-menu">
							<button class="preset-option" class:active={!selectedPreset} onclick={() => { applyPresetById(''); presetOpen = false; }}>No preset</button>
							{#each PDK_LIST as p}
								<button class="preset-option" class:active={selectedPreset === p.id} onclick={() => { applyPresetById(p.id); presetOpen = false; }}>
									<span>{p.name}</span>
									<span class="preset-desc">{p.description}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="layermap-drop" ondrop={onLayerMapDrop} ondragover={(e) => e.preventDefault()}>
					<span>Drop .lyp / .csv / .json layermap</span>
				</div>

			{#if loaded}
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
			{/if}
			</div>
		{/snippet}
	</GeometryEditor>

<style>
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
	.preset-dropdown {
		position: relative;
	}
	.preset-btn {
		width: 100%;
		padding: 5px 8px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		background: var(--input-bg);
		border: 1px solid var(--input-border);
		color: var(--text-muted);
		cursor: pointer;
		text-align: left;
		display: flex;
		justify-content: space-between;
		align-items: center;
		transition: border-color 0.15s;
	}
	.preset-btn:hover {
		border-color: var(--accent);
	}
	.preset-menu {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 20;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		display: flex;
		flex-direction: column;
	}
	.preset-option {
		padding: 6px 8px;
		font-size: var(--fs-xs);
		font-family: var(--font-mono);
		color: var(--text-muted);
		background: none;
		border: none;
		text-align: left;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 1px;
		transition: background 0.1s;
	}
	.preset-option:hover {
		background: var(--accent-dim);
	}
	.preset-option.active {
		color: var(--accent);
	}
	.preset-desc {
		font-size: 9px;
		color: var(--text-dim);
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
