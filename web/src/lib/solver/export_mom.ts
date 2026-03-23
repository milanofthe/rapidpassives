/**
 * Export geometry for RapidMoM solver.
 *
 * Converts merged layer polygons + port positions + process stack
 * into the JSON format that RapidMoM expects.
 */

import type { LayerMap, Polygon } from '$lib/geometry/types';
import type { ConductorNetwork } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { mergeLayers } from '$lib/geometry/merge';

/** RapidMoM input format */
export interface MoMInput {
	stack: MoMStack;
	layers: MoMMetalLayer[];
	ports: MoMPort[];
	sim: MoMSimSettings;
}

interface MoMStack {
	substrate_eps_r: number;
	substrate_rho: number;
	oxide_eps_r: number;
	metals: MoMMetalDef[];
}

interface MoMMetalDef {
	name: string;
	z_um: number;
	thickness_um: number;
	rsh: number;
}

interface MoMMetalLayer {
	metal: string;
	polygons: [number, number][][];
}

interface MoMPort {
	name: string;
	metal: string;
	x_um: number;
	y_um: number;
}

interface MoMSimSettings {
	f_min: number;
	f_max: number;
	n_points: number;
	z0: number;
}

/**
 * Export merged geometry for RapidMoM.
 *
 * Takes the raw layer map, merges polygons, maps layers to metal stack,
 * and extracts port positions from the conductor network.
 */
export function exportForMoM(
	layers: LayerMap,
	network: ConductorNetwork,
	stack: ProcessStack,
	simSettings?: { fMin?: number; fMax?: number; nPoints?: number; z0?: number },
): MoMInput {
	// Merge overlapping polygons per layer
	const merged = mergeLayers(layers);

	// Map geometry layer names to metal stack layers
	// windings → top metal (M3), crossings → M2, centertap → M1
	const layerToMetal: Record<string, string> = {};
	for (const sl of stack.layers) {
		if (sl.type !== 'metal') continue;
		for (const gl of sl.gdsLayers) {
			layerToMetal[gl] = sl.id;
		}
	}

	// Build metal layer polygons
	const metalLayers: MoMMetalLayer[] = [];
	const metalPolys: Record<string, [number, number][][]> = {};

	for (const [layerName, polys] of Object.entries(merged)) {
		if (!polys || polys.length === 0) continue;
		const metalId = layerToMetal[layerName];
		if (!metalId) continue; // skip non-metal layers (vias, pgs)

		if (!metalPolys[metalId]) metalPolys[metalId] = [];
		for (const poly of polys) {
			if (poly.x.length < 3) continue;
			const pts: [number, number][] = poly.x.map((x, i) => [x, poly.y[i]]);
			metalPolys[metalId].push(pts);
		}
	}

	for (const [metalId, polys] of Object.entries(metalPolys)) {
		metalLayers.push({ metal: metalId, polygons: polys });
	}

	// Build metal definitions from stack
	const metals: MoMMetalDef[] = stack.layers
		.filter(sl => sl.type === 'metal')
		.map(sl => ({
			name: sl.id,
			z_um: sl.z + sl.thickness / 2,
			thickness_um: sl.thickness,
			rsh: sl.rsh ?? 0.01,
		}));

	// Extract port positions from network nodes
	const nodeMap = new Map(network.nodes.map(n => [n.id, n]));
	const ports: MoMPort[] = network.ports.map(port => {
		const node = nodeMap.get(port.node);
		if (!node) return null;
		const metalId = node.layerId;
		return {
			name: port.name,
			metal: metalId,
			x_um: node.x,
			y_um: node.y,
		};
	}).filter((p): p is MoMPort => p !== null);

	return {
		stack: {
			substrate_eps_r: stack.substrateEr,
			substrate_rho: stack.substrateRho,
			oxide_eps_r: stack.oxideEr,
			metals,
		},
		layers: metalLayers,
		ports,
		sim: {
			f_min: simSettings?.fMin ?? 1e8,
			f_max: simSettings?.fMax ?? 50e9,
			n_points: simSettings?.nPoints ?? 50,
			z0: simSettings?.z0 ?? 50,
		},
	};
}
