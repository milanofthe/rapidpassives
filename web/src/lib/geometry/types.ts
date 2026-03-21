/** A polygon defined as arrays of x and y coordinates */
export interface Polygon {
	x: number[];
	y: number[];
}

/** Layer names used in inductor/transformer layouts */
export type LayerName = 'windings' | 'crossings' | 'vias' | 'vias1' | 'vias2' | 'centertap' | 'pgs';

/** A collection of polygons organized by layer */
export type LayerMap = Partial<Record<LayerName, Polygon[]>>;

/** Colors for each layer */
export const LAYER_COLORS: Record<LayerName, string> = {
	windings: '#ffd700',
	crossings: '#e94560',
	vias: '#333333',
	vias1: '#333333',
	vias2: '#555555',
	centertap: '#2ec4b6',
	pgs: '#3a86ff',
};

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
