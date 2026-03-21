/** A polygon defined as arrays of x and y coordinates */
export interface Polygon {
	x: number[];
	y: number[];
}

/** Layer names used in inductor/transformer layouts */
export type LayerName = 'windings' | 'crossings' | 'vias' | 'vias1' | 'vias2' | 'centertap' | 'pgs';

/** A collection of polygons organized by layer */
export type LayerMap = Partial<Record<LayerName, Polygon[]>>;

import { layerColors } from '$lib/theme';

/** Colors for each layer — sourced from theme.ts */
export const LAYER_COLORS: Record<LayerName, string> = layerColors;

/** Draw order (back to front) */
export const LAYER_ORDER: LayerName[] = ['pgs', 'crossings', 'centertap', 'windings', 'vias', 'vias1', 'vias2'];

export interface SpiralInductorParams {
	Dout: number;
	N: number;
	sides: number;
	width: number;
	spacing: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
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
}

export type GeometryParams = SpiralInductorParams | SymmetricInductorParams | SymmetricTransformerParams;

export type GeometryType = 'spiral' | 'symmetric_inductor' | 'symmetric_transformer';
