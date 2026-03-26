/** A polygon defined as arrays of x and y coordinates */
export interface Polygon {
	x: number[];
	y: number[];
}

/** Layer names used in inductor/transformer layouts */
export type LayerName = 'guard_ring' | 'windings' | 'crossings' | 'windings_m2' | 'crossings_m1' | 'windings_m4' | 'vias' | 'vias1' | 'vias2' | 'vias3' | 'centertap' | 'pgs';

/** A collection of polygons organized by layer */
export type LayerMap = Partial<Record<LayerName, Polygon[]>>;

import { layerColors } from '$lib/theme';

/** Colors for each layer — sourced from theme.ts */
export const LAYER_COLORS: Record<LayerName, string> = layerColors;

/** Draw order (back to front) */
export const LAYER_ORDER: LayerName[] = ['guard_ring', 'pgs', 'centertap', 'crossings_m1', 'crossings', 'windings_m2', 'windings', 'windings_m4', 'vias', 'vias1', 'vias2', 'vias3'];

export interface SpiralInductorParams {
	Dout: number;
	N: number;
	sides: number;
	width: number;
	spacing: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
	portSide?: 'same' | 'opposite';
}

export interface SymmetricInductorParams {
	Dout: number;
	N: number;
	sides: number;
	width: number;
	spacing: number;
	center_tap: boolean;
	via_extent: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
	portSpacing?: number;
}

export interface SymmetricTransformerParams {
	Dout: number;
	N1: number;
	N2: number;
	sides: number;
	width: number;
	spacing: number;
	center_tap_primary: boolean;
	center_tap_secondary: boolean;
	via_extent: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
	portSpacing?: number;
}

export interface StackedTransformerParams {
	Dout: number;
	N1: number;
	N2: number;
	sides: number;
	width: number;
	spacing: number;
	center_tap_primary: boolean;
	center_tap_secondary: boolean;
	via_extent: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
	portSpacing?: number;
}

export interface PatchAntennaParams {
	/** Patch width (um) */
	W: number;
	/** Patch length (um) */
	L: number;
	/** Feed type */
	feedType: 'edge' | 'inset';
	/** Feed line width (um) */
	feedWidth: number;
	/** Feed line length (um) */
	feedLength: number;
	/** Inset depth (um) — only used for inset feed */
	insetDepth: number;
	/** Inset gap width (um) — only used for inset feed */
	insetGap: number;
	/** Ground plane margin beyond patch (um) */
	groundMargin: number;
}

export interface MomCapacitorParams {
	nFingers: number;
	fingerLength: number;
	fingerWidth: number;
	fingerSpacing: number;
	busWidth: number;
	nLayers: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
}

export interface GuardRingParams {
	enabled: boolean;
	margin: number;
	ringWidth: number;
}

export interface PgsParams {
	enabled: boolean;
	D: number;
	width: number;
	spacing: number;
}

export type GeometryParams = SpiralInductorParams | SymmetricInductorParams | SymmetricTransformerParams | StackedTransformerParams | MomCapacitorParams | PatchAntennaParams;

export type GeometryType = 'spiral' | 'symmetric_inductor' | 'symmetric_transformer' | 'stacked_transformer' | 'mom_capacitor' | 'patch_antenna';

export type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
