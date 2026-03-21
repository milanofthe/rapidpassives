import type { Polygon, LayerName, LayerMap } from './types';

/** A point in the conductor network where segments meet */
export interface ConductorNode {
	id: string;
	x: number;
	y: number;
	/** References StackLayer.id — provides z, thickness, Rsh */
	layerId: string;
}

/** A straight conductor bar between two nodes on the same layer */
export interface ConductorSegment {
	id: string;
	fromNode: string;
	toNode: string;
	width: number;
	/** References StackLayer.id */
	layerId: string;
	/** Groups segments into continuous paths for polygon joining */
	pathId: string;
	/** Which LayerName to render on (windings, crossings, centertap, etc.) */
	renderLayer: LayerName;
	/** Override polygon for non-standard shapes (e.g., 45-degree crossing jogs) */
	polygonOverride?: Polygon;
}

/** Vertical connection between two metal layers through a via array */
export interface ViaConnection {
	id: string;
	topNode: string;
	bottomNode: string;
	/** Equivalent lumped resistance of the via array (ohms) */
	resistance: number;
	/** Pre-computed via grid polygons for rendering and GDS */
	polygons: Polygon[];
	/** Which LayerName to assign via polygons to */
	renderLayer: LayerName;
}

/** External terminal pair for S-parameter extraction */
export interface Port {
	name: string;
	plusNode: string;
	minusNode: string;
}

/** Complete conductor topology for a passive device */
export interface ConductorNetwork {
	nodes: ConductorNode[];
	segments: ConductorSegment[];
	vias: ViaConnection[];
	ports: Port[];
}

/** Combined output from geometry builders */
export interface GeometryResult {
	network: ConductorNetwork;
	layers: LayerMap;
}
