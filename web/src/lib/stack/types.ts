import type { LayerName } from '$lib/geometry/types';

/** A single metal or via layer in the process stack */
export interface StackLayer {
	id: string;
	name: string;
	type: 'metal' | 'via' | 'substrate';
	/** Bottom z-position in um */
	z: number;
	/** Thickness in um */
	thickness: number;
	/** Sheet resistance in ohm/sq (metals only) */
	rsh?: number;
	/** Color for rendering */
	color: string;
	/** Which geometry layers render on this stack layer */
	gdsLayers: LayerName[];
	/** Whether this layer is visible */
	visible: boolean;
}

/** Complete process stack definition */
export interface ProcessStack {
	name: string;
	layers: StackLayer[];
	/** Substrate thickness in um */
	substrateThickness: number;
	/** Oxide permittivity */
	oxideEr: number;
	/** Substrate resistivity in ohm*cm */
	substrateRho: number;
	/** Substrate permittivity (default 11.7 for Si) */
	substrateEr: number;
}

/** Default 3-metal RFIC stack */
export function createDefaultStack(): ProcessStack {
	return {
		name: 'Generic 3-Metal',
		layers: [
			{
				id: 'sub',
				name: 'Substrate',
				type: 'substrate',
				z: 0,
				thickness: 300,
				color: '#4a4a5a',
				gdsLayers: [],
				visible: true,
			},
			{
				id: 'pgs',
				name: 'PGS (Poly)',
				type: 'metal',
				z: 300.2,
				thickness: 0.2,
				rsh: 0.1,
				color: '#7b5e8a',
				gdsLayers: ['pgs'],
				visible: true,
			},
			{
				id: 'm1',
				name: 'Metal 1',
				type: 'metal',
				z: 301.0,
				thickness: 0.5,
				rsh: 0.05,
				color: '#6bbf8a',
				gdsLayers: ['centertap'],
				visible: true,
			},
			{
				id: 'via12',
				name: 'Via 1-2',
				type: 'via',
				z: 301.5,
				thickness: 0.5,
				color: '#5a5a62',
				gdsLayers: ['vias2'],
				visible: true,
			},
			{
				id: 'm2',
				name: 'Metal 2',
				type: 'metal',
				z: 302.0,
				thickness: 0.5,
				rsh: 0.03,
				color: '#d9513c',
				gdsLayers: ['crossings'],
				visible: true,
			},
			{
				id: 'via23',
				name: 'Via 2-3',
				type: 'via',
				z: 302.5,
				thickness: 0.6,
				color: '#6e6e78',
				gdsLayers: ['vias', 'vias1'],
				visible: true,
			},
			{
				id: 'm3',
				name: 'Metal 3 (Top)',
				type: 'metal',
				z: 303.1,
				thickness: 1.2,
				rsh: 0.01,
				color: '#e8944a',
				gdsLayers: ['windings'],
				visible: true,
			},
		],
		substrateThickness: 300,
		oxideEr: 4.0,
		substrateRho: 10,
		substrateEr: 11.7,
	};
}

/** Get the color for a geometry layer from the stack */
export function getLayerColor(stack: ProcessStack, layerName: LayerName): string | undefined {
	for (const sl of stack.layers) {
		if (sl.gdsLayers.includes(layerName)) return sl.color;
	}
	return undefined;
}

/** Get visibility for a geometry layer from the stack */
export function isLayerVisible(stack: ProcessStack, layerName: LayerName): boolean {
	for (const sl of stack.layers) {
		if (sl.gdsLayers.includes(layerName)) return sl.visible;
	}
	return true;
}

/** Build a LayerName→color map from the stack for the renderer */
export function stackToColorMap(stack: ProcessStack): Record<string, string> {
	const map: Record<string, string> = {};
	for (const sl of stack.layers) {
		for (const gl of sl.gdsLayers) {
			map[gl] = sl.color;
		}
	}
	return map;
}

/** Build a set of visible LayerNames from the stack */
export function stackToVisibleSet(stack: ProcessStack): Set<LayerName> {
	const set = new Set<LayerName>();
	for (const sl of stack.layers) {
		if (sl.visible) {
			for (const gl of sl.gdsLayers) set.add(gl);
		}
	}
	return set;
}

/** Find a StackLayer by its id */
export function getStackLayer(stack: ProcessStack, layerId: string): StackLayer | undefined {
	return stack.layers.find(l => l.id === layerId);
}

/** Get the primary render LayerName for a stack layer id */
export function layerIdToRenderLayer(stack: ProcessStack, layerId: string): LayerName | undefined {
	const sl = getStackLayer(stack, layerId);
	return sl?.gdsLayers[0];
}
