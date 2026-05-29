/**
 * Central constants. Per project convention, tolerances and magic numbers live
 * here rather than inline at the call site.
 */

// --- FEM JSON export -------------------------------------------------------

/** Default frequency sweep written into the FEM JSON `sim` block. */
export const FEM_SIM_DEFAULTS = {
	fMinHz: 1e9,
	fMaxHz: 50e9,
	nPoints: 25,
	z0Ohm: 50,
} as const;

/** Loss tangent of the oxide written into the FEM JSON (ProcessStack carries no tand yet). */
export const OXIDE_TAND_DEFAULT = 0;

/**
 * Bounding-box inflation (µm) used when clustering via cells into a single
 * merged conductor. Two via cells whose bboxes are within this slack fuse into
 * one cluster, avoiding one 3-D extrusion per cell on the FEM side.
 */
export const VIA_CLUSTER_SLACK_UM = 1.0;

// --- Polygon merge ---------------------------------------------------------

/** Decimal places coordinates are snapped to before union (kills FP slivers). */
export const POLY_SNAP_DECIMALS = 6;

/** Outward inflation (µm) applied to each ring before union to close edge gaps. */
export const POLY_INFLATE_UM = 0.001;
