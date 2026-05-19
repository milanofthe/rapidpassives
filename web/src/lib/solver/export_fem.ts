/**
 * Export geometry as a RapidFEM-ready JSON document.
 *
 * The schema is consumed by `rapidfem.rfic.from_fem_json(...)` on the Python
 * side. Both sides treat this JSON as the contract; keep it backwards
 * compatible (bump `schema_version` and add fields rather than rename) so
 * old exports keep loading.
 *
 * Schema sketch (see FemJson type below for the full shape):
 *
 *   {
 *     "schema_version": 1,
 *     "metadata":   {"generator": "spiral", "params": {...}},
 *     "stack":      {"name", "substrate", "oxide", "layers": [...]},
 *     "conductors": [{"layer", "name", "polygon", "polygon_cells?"}],
 *     "ports":      [{"name", "layer", "x_um", "y_um"}],
 *     "sim":        {"f_min_hz", "f_max_hz", "n_points", "z0_ohm"}
 *   }
 */

import type { LayerMap } from '$lib/geometry/types';
import type { ConductorNetwork } from '$lib/geometry/network';
import type { ProcessStack } from '$lib/stack/types';
import { mergeLayers } from '$lib/geometry/merge';

export const FEM_SCHEMA_VERSION = 1;

/** Top-level FEM JSON document. */
export interface FemJson {
	schema_version: number;
	metadata?: FemMetadata;
	stack: FemStack;
	conductors: FemConductor[];
	ports: FemPort[];
	sim?: FemSim;
}

export interface FemMetadata {
	generator: string;                  // e.g. "spiral", "symmetric_inductor"
	params?: Record<string, unknown>;   // generator-specific inputs (round-trip debug)
}

export interface FemStack {
	name: string;
	substrate: {
		er: number;
		rho_ohm_cm: number;
		thickness_um: number;
	};
	oxide: {
		er: number;
		tand: number;
	};
	/** Metals AND vias in one list, distinguished by `type`. */
	layers: FemStackLayer[];
}

export interface FemStackLayer {
	id: string;                         // stack-layer id ("met5", "via4", ...)
	type: 'metal' | 'via';
	z_um: number;                       // bottom z
	thickness_um: number;
	rsh?: number;                       // metals only
}

/**
 * One conductor polygon. `polygon` is always a single closed loop (merged for
 * vias, the trace/winding outline for metals). For via layers, `polygon_cells`
 * additionally lists the per-cell squares — consumer picks via_mode = "merged"
 * (fast, default) or "cells" (high-fidelity, expensive).
 */
export interface FemConductor {
	layer: string;                      // refs FemStackLayer.id
	name?: string;                      // optional human-readable tag
	polygon: [number, number][];        // [[x_um, y_um], ...] (closed loop)
	polygon_cells?: [number, number][][]; // via layers only
}

export interface FemPort {
	name: string;
	layer: string;                      // refs FemStackLayer.id
	x_um: number;
	y_um: number;
}

export interface FemSim {
	f_min_hz: number;
	f_max_hz: number;
	n_points: number;
	z0_ohm: number;
}


/**
 * Build the FEM JSON document for the current layout.
 *
 * @param layers  merged polygon-per-LayerName map (typically the same value
 *                the renderer + GDS exporter use)
 * @param network conductor topology with via grids and port definitions
 * @param stack   process stack — metals AND vias define the z-stackup
 * @param opts    optional generator metadata and sim defaults
 */
export function exportForFEM(
	layers: LayerMap,
	network: ConductorNetwork,
	stack: ProcessStack,
	opts: {
		generator?: string;
		params?: Record<string, unknown>;
		sim?: Partial<FemSim>;
	} = {},
): FemJson {
	// Merge overlapping polygons per layer (idempotent if the caller already
	// passed merged layers — mergeLayers is a no-op on already-merged input).
	const merged = mergeLayers(layers);

	// Inverse map: LayerName → stack-layer id. Each geometry layer (windings,
	// vias1, ...) renders on exactly one stack layer; the stack owns the
	// authoritative mapping via StackLayer.gdsLayers.
	const layerNameToStackId: Record<string, string> = {};
	for (const sl of stack.layers) {
		for (const gl of sl.gdsLayers) {
			layerNameToStackId[gl] = sl.id;
		}
	}

	// Stack layers — metals + vias, sorted bottom-to-top so the consumer
	// can iterate in stack order.
	const femLayers: FemStackLayer[] = stack.layers
		.filter(sl => sl.type === 'metal' || sl.type === 'via')
		.sort((a, b) => a.z - b.z)
		.map(sl => {
			const out: FemStackLayer = {
				id: sl.id,
				type: sl.type as 'metal' | 'via',
				z_um: sl.z,
				thickness_um: sl.thickness,
			};
			if (sl.type === 'metal' && sl.rsh !== undefined) out.rsh = sl.rsh;
			return out;
		});

	// Conductors: metal polygons first (one entry per polygon), via arrays
	// second (one merged-bbox entry per ViaConnection, with the cells under
	// polygon_cells for high-fidelity simulation).
	const conductors: FemConductor[] = [];

	// Vias declared in network.vias get the rich treatment: merged bbox +
	// per-cell array. Track which render-layer names we cover here so the
	// fallback layer-map loop doesn't double-emit them.
	const viasFromNetwork = new Set<string>();
	for (const via of network.vias) {
		const stackId = layerNameToStackId[via.renderLayer];
		if (!stackId) continue;
		if (!via.polygons || via.polygons.length === 0) continue;
		const cells: [number, number][][] = via.polygons
			.filter(p => p.x.length >= 3)
			.map(p => p.x.map((x, i) => [x, p.y[i]] as [number, number]));
		if (cells.length === 0) continue;
		// Merged bbox of all cells — single rectangle for fast FEM.
		let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
		for (const cell of cells) {
			for (const [x, y] of cell) {
				if (x < xmin) xmin = x;
				if (x > xmax) xmax = x;
				if (y < ymin) ymin = y;
				if (y > ymax) ymax = y;
			}
		}
		const merged_bbox: [number, number][] = [
			[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax],
		];
		conductors.push({
			layer: stackId,
			name: via.id,
			polygon: merged_bbox,
			polygon_cells: cells,
		});
		viasFromNetwork.add(via.renderLayer);
	}

	// Layer-map sweep: emit metal polygons + via polygons not already covered
	// by network.vias (mom_capacitor, guard rings etc. put vias on the layer
	// map directly without a ConductorNetwork.vias entry).
	for (const [layerName, polys] of Object.entries(merged)) {
		if (!polys || polys.length === 0) continue;
		const stackId = layerNameToStackId[layerName];
		if (!stackId) continue;
		const sl = stack.layers.find(l => l.id === stackId);
		if (!sl) continue;
		if (sl.type === 'via' && viasFromNetwork.has(layerName as string)) continue;
		for (const p of polys) {
			if (p.x.length < 3) continue;
			conductors.push({
				layer: stackId,
				name: layerName,
				polygon: p.x.map((x, i) => [x, p.y[i]] as [number, number]),
			});
		}
	}

	// Ports: pull location from the ConductorNode each port references.
	// Generators tag nodes with internal layer ids (m1, m2, ...) that don't
	// match the stack's pdk-derived ids (e.g. "72_20"). Re-resolve each port
	// to a stack id by finding a segment incident on its node and looking
	// the segment's renderLayer up in layerNameToStackId.
	const nodeMap = new Map(network.nodes.map(n => [n.id, n]));
	const segmentsByNode = new Map<string, string | undefined>();
	for (const seg of network.segments) {
		const stackId = layerNameToStackId[seg.renderLayer];
		if (!stackId) continue;
		if (!segmentsByNode.has(seg.fromNode)) segmentsByNode.set(seg.fromNode, stackId);
		if (!segmentsByNode.has(seg.toNode)) segmentsByNode.set(seg.toNode, stackId);
	}
	for (const via of network.vias) {
		const stackId = layerNameToStackId[via.renderLayer];
		if (!stackId) continue;
		if (!segmentsByNode.has(via.topNode)) segmentsByNode.set(via.topNode, stackId);
		if (!segmentsByNode.has(via.bottomNode)) segmentsByNode.set(via.bottomNode, stackId);
	}
	const ports: FemPort[] = [];
	for (const p of network.ports) {
		const node = nodeMap.get(p.node);
		if (!node) continue;
		// Resolution order:
		//   1. node sits on a known segment/via → use that segment's stack id
		//   2. node.layerId is itself a render layer name (LayerName) → look it up
		//   3. give up and pass node.layerId through (legacy / unknown)
		const resolved =
			segmentsByNode.get(node.id) ?? layerNameToStackId[node.layerId] ?? node.layerId;
		ports.push({
			name: p.name,
			layer: resolved,
			x_um: node.x,
			y_um: node.y,
		});
	}

	const json: FemJson = {
		schema_version: FEM_SCHEMA_VERSION,
		stack: {
			name: stack.name,
			substrate: {
				er: stack.substrateEr,
				rho_ohm_cm: stack.substrateRho,
				thickness_um: stack.substrateThickness,
			},
			oxide: {
				er: stack.oxideEr,
				tand: 0,                  // ProcessStack doesn't carry oxide tand yet
			},
			layers: femLayers,
		},
		conductors,
		ports,
	};

	if (opts.generator) {
		json.metadata = { generator: opts.generator };
		if (opts.params) json.metadata.params = opts.params;
	}

	json.sim = {
		f_min_hz: opts.sim?.f_min_hz ?? 1e9,
		f_max_hz: opts.sim?.f_max_hz ?? 50e9,
		n_points: opts.sim?.n_points ?? 25,
		z0_ohm: opts.sim?.z0_ohm ?? 50,
	};

	return json;
}


/** Trigger a browser download of the FEM JSON. */
export function downloadFemJson(json: FemJson, filename: string): void {
	const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
