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

import type { LayerMap, Port } from '$lib/geometry/types';
import type { ProcessStack } from '$lib/stack/types';
import { mergeLayers } from '$lib/geometry/merge';
import { FEM_SIM_DEFAULTS, OXIDE_TAND_DEFAULT, VIA_CLUSTER_SLACK_UM } from '$lib/constants';

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
	warnings?: string[];                // non-fatal export issues (e.g. dropped layers)
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
 * vias, the trace/winding outline for metals). `holes` lists optional inner
 * closed loops that get subtracted from the outer outline — needed for
 * annular shapes (rat-race ring, guard ring) so they stay topologically
 * correct in the FEM mesh. For via layers, `polygon_cells` additionally
 * lists the per-cell squares — consumer picks via_mode = "merged" (fast,
 * default) or "cells" (high-fidelity, expensive).
 */
export interface FemConductor {
	layer: string;                      // refs FemStackLayer.id
	name?: string;                      // optional human-readable tag
	polygon: [number, number][];        // outer closed loop
	holes?: [number, number][][];       // inner closed loops (subtracted)
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
 * @param layers  polygon-per-LayerName map — the single source of truth, the
 *                same value the renderer + GDS exporter use
 * @param ports   port terminals (name, coordinate, metal LayerName)
 * @param stack   process stack — metals AND vias define the z-stackup
 * @param opts    optional generator metadata and sim defaults
 */
export function exportForFEM(
	layers: LayerMap,
	ports: Port[],
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

	// Non-fatal issues surfaced to the caller via metadata.warnings.
	const warnings: string[] = [];

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

	// Conductors come entirely from the merged layer map — polygons are the
	// single source of truth. Metals emit one conductor per polygon; via layers
	// are clustered into merged-bbox conductors (with the cells under
	// polygon_cells for high-fidelity simulation).
	const conductors: FemConductor[] = [];

	// Layer-map sweep: emit metal polygons + clustered via polygons.
	//
	// Metal polygons go straight through (one conductor per polygon).
	// Via polygons get spatially clustered first — N small via squares in
	// the same array would otherwise mean N separate 3-D extrusions on the
	// FEM side, blowing up the mesh. We group polygons whose bboxes
	// (lightly inflated) overlap into a single cluster, emit one
	// merged-bbox conductor per cluster, and keep the original cells under
	// polygon_cells for callers that want via-array fidelity.
	for (const [layerName, polys] of Object.entries(merged)) {
		if (!polys || polys.length === 0) continue;
		const stackId = layerNameToStackId[layerName];
		if (!stackId) {
			warnings.push(`layer '${layerName}' (${polys.length} polygon(s)) is not mapped to any stack layer in '${stack.name}' — dropped from FEM export`);
			continue;
		}
		const sl = stack.layers.find(l => l.id === stackId);
		if (!sl) continue;

		if (sl.type !== 'via') {
			for (const p of polys) {
				if (p.x.length < 3) continue;
				const entry: FemConductor = {
					layer: stackId,
					name: layerName,
					polygon: p.x.map((x, i) => [x, p.y[i]] as [number, number]),
				};
				if (p.holes && p.holes.length > 0) {
					entry.holes = p.holes
						.filter(h => h.x.length >= 3)
						.map(h => h.x.map((x, i) => [x, h.y[i]] as [number, number]));
					if (entry.holes.length === 0) delete entry.holes;
				}
				conductors.push(entry);
			}
			continue;
		}

		// Cluster via polygons by bbox overlap (union-find).
		const valid = polys.filter(p => p.x.length >= 3);
		if (valid.length === 0) continue;
		const bboxes = valid.map(p => {
			let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
			for (let i = 0; i < p.x.length; i++) {
				const x = p.x[i], y = p.y[i];
				if (x < xmin) xmin = x;
				if (x > xmax) xmax = x;
				if (y < ymin) ymin = y;
				if (y > ymax) ymax = y;
			}
			return { xmin, ymin, xmax, ymax };
		});
		// Inflate slightly to bridge edge-touching neighbours.
		const slack = VIA_CLUSTER_SLACK_UM;
		const parent = bboxes.map((_, i) => i);
		const find = (i: number): number => {
			while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
			return i;
		};
		const union = (i: number, j: number) => {
			const ri = find(i), rj = find(j);
			if (ri !== rj) parent[ri] = rj;
		};
		for (let i = 0; i < bboxes.length; i++) {
			const a = bboxes[i];
			for (let j = i + 1; j < bboxes.length; j++) {
				const b = bboxes[j];
				if (a.xmax + slack < b.xmin || b.xmax + slack < a.xmin) continue;
				if (a.ymax + slack < b.ymin || b.ymax + slack < a.ymin) continue;
				union(i, j);
			}
		}
		const clusters = new Map<number, number[]>();
		for (let i = 0; i < bboxes.length; i++) {
			const r = find(i);
			const arr = clusters.get(r);
			if (arr) arr.push(i);
			else clusters.set(r, [i]);
		}

		for (const members of clusters.values()) {
			let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
			const cells: [number, number][][] = [];
			for (const i of members) {
				const b = bboxes[i];
				if (b.xmin < xmin) xmin = b.xmin;
				if (b.ymin < ymin) ymin = b.ymin;
				if (b.xmax > xmax) xmax = b.xmax;
				if (b.ymax > ymax) ymax = b.ymax;
				const p = valid[i];
				cells.push(p.x.map((x, k) => [x, p.y[k]] as [number, number]));
			}
			conductors.push({
				layer: stackId,
				name: layerName,
				polygon: [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]],
				polygon_cells: cells,
			});
		}
	}

	// Ports: each carries its own coordinate and metal LayerName. Resolve the
	// LayerName to a stack id; a port whose layer has no stack mapping is a hard
	// error (it would silently break the FEM build downstream).
	const femPorts: FemPort[] = ports.map(p => {
		const stackId = layerNameToStackId[p.layer];
		if (!stackId) {
			throw new Error(`exportForFEM: port "${p.name}" on layer "${p.layer}" has no mapping in stack "${stack.name}"`);
		}
		return { name: p.name, layer: stackId, x_um: p.x, y_um: p.y };
	});

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
				tand: OXIDE_TAND_DEFAULT,   // ProcessStack doesn't carry oxide tand yet
			},
			layers: femLayers,
		},
		conductors,
		ports: femPorts,
	};

	// Surface validation issues as warnings (non-fatal — caller decides).
	warnings.push(...validateFemJson(json));

	if (opts.generator || warnings.length > 0) {
		json.metadata = { generator: opts.generator ?? 'unknown' };
		if (opts.params) json.metadata.params = opts.params;
		if (warnings.length > 0) json.metadata.warnings = warnings;
	}

	json.sim = {
		f_min_hz: opts.sim?.f_min_hz ?? FEM_SIM_DEFAULTS.fMinHz,
		f_max_hz: opts.sim?.f_max_hz ?? FEM_SIM_DEFAULTS.fMaxHz,
		n_points: opts.sim?.n_points ?? FEM_SIM_DEFAULTS.nPoints,
		z0_ohm: opts.sim?.z0_ohm ?? FEM_SIM_DEFAULTS.z0Ohm,
	};

	return json;
}


/**
 * Validate a FEM JSON document against the consumer's hard requirements
 * (mirrors the KeyErrors rapidfem.from_fem_json would raise). Returns a list of
 * human-readable problems; empty means valid.
 */
export function validateFemJson(json: FemJson): string[] {
	const errs: string[] = [];
	const byId = new Map(json.stack.layers.map(l => [l.id, l]));
	if (json.conductors.length === 0) errs.push('no conductors emitted');
	if (json.ports.length === 0) errs.push('no ports emitted');
	for (const c of json.conductors) {
		const tag = c.name ?? c.layer;
		if (!byId.has(c.layer)) errs.push(`conductor '${tag}' references unknown stack layer '${c.layer}'`);
		if (c.polygon.length < 3) errs.push(`conductor '${tag}' has a degenerate polygon (<3 points)`);
	}
	for (const p of json.ports) {
		const l = byId.get(p.layer);
		if (!l) errs.push(`port '${p.name}' references unknown stack layer '${p.layer}'`);
		else if (l.type !== 'metal') errs.push(`port '${p.name}' sits on non-metal layer '${p.layer}'`);
	}
	return errs;
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
