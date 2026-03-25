/**
 * Apply a process preset to the viewer's layer state.
 * Maps GDS layer numbers in the loaded file to the preset's definitions.
 */

import type { ProcessPreset, PresetLayer } from './index';
import type { ProcessStack, StackLayer } from '../types';
import type { LayerName } from '$lib/geometry/types';

export interface AppliedPreset {
	/** Updated process stack for 3D rendering */
	stack: ProcessStack;
	/** GDS layer number → LayerName mapping */
	gdsLayerMap: Record<number, LayerName>;
	/** GDS layer number → display info */
	layerInfo: Map<number, { name: string; color: string; type: string; thickness: number }>;
}

const LAYER_SLOTS: LayerName[] = [
	'windings', 'crossings', 'windings_m2', 'crossings_m1', 'windings_m4',
	'vias', 'vias1', 'vias2', 'vias3', 'centertap', 'pgs', 'guard_ring',
];

/**
 * Apply a preset to a set of GDS layer numbers found in the loaded file.
 * Only layers present in both the preset and the file are included.
 */
export function applyPreset(
	preset: ProcessPreset,
	gdsLayersInFile: Set<number>,
): AppliedPreset {
	const gdsLayerMap: Record<number, LayerName> = {};
	const layerInfo = new Map<number, { name: string; color: string; type: string; thickness: number }>();
	const stackLayers: StackLayer[] = [
		{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 0, color: '#4a4a5a', gdsLayers: [], visible: true },
	];

	let slotIdx = 0;

	// Sort preset layers by z-position
	const sorted = [...preset.layers].sort((a, b) => a.z - b.z);

	for (const pl of sorted) {
		// Check if this GDS layer exists in the file (check both with and without datatype)
		const inFile = gdsLayersInFile.has(pl.gds);
		if (!inFile) continue;

		// Assign a LayerName slot
		if (slotIdx >= LAYER_SLOTS.length) continue;
		const layerName = LAYER_SLOTS[slotIdx++];

		gdsLayerMap[pl.gds] = layerName;
		layerInfo.set(pl.gds, {
			name: pl.name,
			color: pl.color,
			type: pl.type,
			thickness: pl.thickness,
		});

		stackLayers.push({
			id: `preset_${pl.gds}`,
			name: pl.name,
			type: pl.type === 'via' ? 'via' : 'metal',
			z: pl.z,
			thickness: pl.thickness,
			rsh: undefined,
			color: pl.color,
			gdsLayers: [layerName],
			visible: true,
		});
	}

	// Also add file layers not in the preset (with generic assignments)
	for (const gdsNum of gdsLayersInFile) {
		if (gdsLayerMap[gdsNum]) continue; // already mapped
		if (slotIdx >= LAYER_SLOTS.length) continue;

		const layerName = LAYER_SLOTS[slotIdx++];
		gdsLayerMap[gdsNum] = layerName;
		layerInfo.set(gdsNum, {
			name: `Layer ${gdsNum}`,
			color: `hsl(${(gdsNum * 37) % 360}, 60%, 55%)`,
			type: 'other',
			thickness: 0.5,
		});

		// Place unmapped layers above the preset stack
		const maxZ = stackLayers.reduce((m, l) => Math.max(m, l.z + l.thickness), 0);
		stackLayers.push({
			id: `generic_${gdsNum}`,
			name: `Layer ${gdsNum}`,
			type: 'metal',
			z: maxZ + 0.5,
			thickness: 0.5,
			color: `hsl(${(gdsNum * 37) % 360}, 60%, 55%)`,
			gdsLayers: [layerName],
			visible: true,
		});
	}

	const stack: ProcessStack = {
		name: preset.name,
		layers: stackLayers,
		substrateThickness: 300,
		oxideEr: 4.0,
		substrateRho: 10,
		substrateEr: 11.9,
	};

	return { stack, gdsLayerMap, layerInfo };
}
