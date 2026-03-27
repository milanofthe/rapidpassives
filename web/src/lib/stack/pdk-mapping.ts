/**
 * PDK-to-generator layer mappings.
 * Maps each generator's semantic LayerNames to real PDK layers.
 */
import type { LayerName } from '$lib/geometry/types';

/** A real PDK layer with GDS info */
export interface PdkLayer {
	name: string;
	gds: number;
	datatype: number;
	z: number;
	thickness: number;
	color: string;
	type: 'metal' | 'via' | 'poly' | 'other';
}

/** Mapping from generator LayerName → PDK layer */
export type GeneratorPdkMap = Partial<Record<LayerName, PdkLayer>>;

/** Generator types that use different metal counts */
export type GeneratorType = '2metal' | '3metal' | '4metal';

/** Which generator type each route uses */
export const GENERATOR_TYPES: Record<string, GeneratorType> = {
	spiral: '2metal',
	'patch-antenna': '2metal',
	'ratrace-coupler': '2metal',
	'symmetric-inductor': '3metal',
	'symmetric-transformer': '3metal',
	'mom-capacitor': '3metal',
	'stacked-transformer': '4metal',
};

// ─── SKY130 ──────────────────────────────────────────────────────────

const SKY130_MET3: PdkLayer = { name: 'met3', gds: 70, datatype: 20, z: 1.78, thickness: 0.845, color: '#5aad78', type: 'metal' };
const SKY130_VIA3: PdkLayer = { name: 'via3', gds: 70, datatype: 44, z: 2.625, thickness: 0.39, color: '#6e6e78', type: 'via' };
const SKY130_MET4: PdkLayer = { name: 'met4', gds: 71, datatype: 20, z: 3.015, thickness: 0.845, color: '#d9513c', type: 'metal' };
const SKY130_VIA4: PdkLayer = { name: 'via4', gds: 71, datatype: 44, z: 3.86, thickness: 0.505, color: '#7a7a84', type: 'via' };
const SKY130_MET5: PdkLayer = { name: 'met5', gds: 72, datatype: 20, z: 4.365, thickness: 1.26, color: '#e8944a', type: 'metal' };
const SKY130_MET2: PdkLayer = { name: 'met2', gds: 69, datatype: 20, z: 1.00, thickness: 0.36, color: '#4a9ec2', type: 'metal' };
const SKY130_VIA2: PdkLayer = { name: 'via2', gds: 69, datatype: 44, z: 1.36, thickness: 0.42, color: '#5a5a62', type: 'via' };
const SKY130_MET1: PdkLayer = { name: 'met1', gds: 68, datatype: 20, z: 0.37, thickness: 0.36, color: '#6bbf8a', type: 'metal' };
const SKY130_VIA1: PdkLayer = { name: 'via', gds: 68, datatype: 44, z: 0.73, thickness: 0.27, color: '#5a5a62', type: 'via' };
const SKY130_LI1: PdkLayer = { name: 'li1', gds: 67, datatype: 20, z: 0.00, thickness: 0.10, color: '#7b5e8a', type: 'metal' };

// ─── SG13G2 ──────────────────────────────────────────────────────────

const SG13_M5: PdkLayer = { name: 'Metal5', gds: 67, datatype: 0, z: 4.05, thickness: 0.49, color: '#5aad78', type: 'metal' };
const SG13_TV1: PdkLayer = { name: 'TopVia1', gds: 125, datatype: 0, z: 4.54, thickness: 0.85, color: '#6e6e78', type: 'via' };
const SG13_TM1: PdkLayer = { name: 'TopMetal1', gds: 126, datatype: 0, z: 5.39, thickness: 2.00, color: '#d9513c', type: 'metal' };
const SG13_TV2: PdkLayer = { name: 'TopVia2', gds: 133, datatype: 0, z: 7.39, thickness: 2.80, color: '#7a7a84', type: 'via' };
const SG13_TM2: PdkLayer = { name: 'TopMetal2', gds: 134, datatype: 0, z: 10.19, thickness: 3.00, color: '#e8944a', type: 'metal' };
const SG13_M4: PdkLayer = { name: 'Metal4', gds: 50, datatype: 0, z: 3.02, thickness: 0.49, color: '#4a9ec2', type: 'metal' };
const SG13_V4: PdkLayer = { name: 'Via4', gds: 66, datatype: 0, z: 3.51, thickness: 0.54, color: '#5a5a62', type: 'via' };
const SG13_M3: PdkLayer = { name: 'Metal3', gds: 30, datatype: 0, z: 1.99, thickness: 0.49, color: '#7b5e8a', type: 'metal' };
const SG13_V3: PdkLayer = { name: 'Via3', gds: 49, datatype: 0, z: 2.48, thickness: 0.54, color: '#5a5a62', type: 'via' };

// ─── GF180MCU ────────────────────────────────────────────────────────

const GF180_M4: PdkLayer = { name: 'Metal4', gds: 46, datatype: 0, z: 2.43, thickness: 0.31, color: '#4a9ec2', type: 'metal' };
const GF180_V4: PdkLayer = { name: 'Via4', gds: 41, datatype: 0, z: 2.74, thickness: 0.50, color: '#5a5a62', type: 'via' };
const GF180_M5: PdkLayer = { name: 'Metal5', gds: 81, datatype: 0, z: 3.24, thickness: 0.31, color: '#d9513c', type: 'metal' };
const GF180_V5: PdkLayer = { name: 'Via5', gds: 82, datatype: 0, z: 3.55, thickness: 0.70, color: '#7a7a84', type: 'via' };
const GF180_MT: PdkLayer = { name: 'MetalTop', gds: 53, datatype: 0, z: 4.25, thickness: 0.90, color: '#e8944a', type: 'metal' };
const GF180_M3: PdkLayer = { name: 'Metal3', gds: 42, datatype: 0, z: 1.62, thickness: 0.31, color: '#5aad78', type: 'metal' };
const GF180_V3: PdkLayer = { name: 'Via3', gds: 40, datatype: 0, z: 1.93, thickness: 0.50, color: '#5a5a62', type: 'via' };
const GF180_M2: PdkLayer = { name: 'Metal2', gds: 36, datatype: 0, z: 0.81, thickness: 0.31, color: '#7b5e8a', type: 'metal' };
const GF180_V2: PdkLayer = { name: 'Via2', gds: 38, datatype: 0, z: 1.12, thickness: 0.50, color: '#5a5a62', type: 'via' };

// ─── Mappings per generator type per PDK ─────────────────────────────

// 2-metal: crossings (lower) + windings (upper) + via
// 3-metal: centertap/crossings_m1/guard_ring (M1) + crossings/windings_m2 (M2) + windings (M3) + vias
// 4-metal: + windings_m4 (M4)

const SKY130_2METAL: GeneratorPdkMap = {
	crossings: SKY130_MET4,
	windings_m2: SKY130_MET4,
	windings: SKY130_MET5,
	vias: SKY130_VIA4,
	vias1: SKY130_VIA4,
	pgs: SKY130_LI1,
};

const SKY130_3METAL: GeneratorPdkMap = {
	centertap: SKY130_MET3,
	crossings_m1: SKY130_MET3,
	guard_ring: SKY130_MET3,
	crossings: SKY130_MET4,
	windings_m2: SKY130_MET4,
	windings: SKY130_MET5,
	vias: SKY130_VIA4,
	vias1: SKY130_VIA4,
	vias2: SKY130_VIA3,
	pgs: SKY130_LI1,
};

const SKY130_4METAL: GeneratorPdkMap = {
	centertap: SKY130_MET2,
	crossings_m1: SKY130_MET2,
	guard_ring: SKY130_MET2,
	crossings: SKY130_MET3,
	windings_m2: SKY130_MET3,
	windings: SKY130_MET4,
	windings_m4: SKY130_MET5,
	vias: SKY130_VIA3,
	vias1: SKY130_VIA3,
	vias2: SKY130_VIA2,
	vias3: SKY130_VIA4,
	pgs: SKY130_LI1,
};

const SG13G2_2METAL: GeneratorPdkMap = {
	crossings: SG13_TM1,
	windings_m2: SG13_TM1,
	windings: SG13_TM2,
	vias: SG13_TV2,
	vias1: SG13_TV2,
	pgs: SG13_M3,
};

const SG13G2_3METAL: GeneratorPdkMap = {
	centertap: SG13_M5,
	crossings_m1: SG13_M5,
	guard_ring: SG13_M5,
	crossings: SG13_TM1,
	windings_m2: SG13_TM1,
	windings: SG13_TM2,
	vias: SG13_TV2,
	vias1: SG13_TV2,
	vias2: SG13_TV1,
	pgs: SG13_M3,
};

const SG13G2_4METAL: GeneratorPdkMap = {
	centertap: SG13_M4,
	crossings_m1: SG13_M4,
	guard_ring: SG13_M4,
	crossings: SG13_M5,
	windings_m2: SG13_M5,
	windings: SG13_TM1,
	windings_m4: SG13_TM2,
	vias: SG13_TV1,
	vias1: SG13_TV1,
	vias2: SG13_V4,
	vias3: SG13_TV2,
	pgs: SG13_M3,
};

const GF180_2METAL: GeneratorPdkMap = {
	crossings: GF180_M5,
	windings_m2: GF180_M5,
	windings: GF180_MT,
	vias: GF180_V5,
	vias1: GF180_V5,
	pgs: GF180_M2,
};

const GF180_3METAL: GeneratorPdkMap = {
	centertap: GF180_M4,
	crossings_m1: GF180_M4,
	guard_ring: GF180_M4,
	crossings: GF180_M5,
	windings_m2: GF180_M5,
	windings: GF180_MT,
	vias: GF180_V5,
	vias1: GF180_V5,
	vias2: GF180_V4,
	pgs: GF180_M2,
};

const GF180_4METAL: GeneratorPdkMap = {
	centertap: GF180_M3,
	crossings_m1: GF180_M3,
	guard_ring: GF180_M3,
	crossings: GF180_M4,
	windings_m2: GF180_M4,
	windings: GF180_M5,
	windings_m4: GF180_MT,
	vias: GF180_V4,
	vias1: GF180_V4,
	vias2: GF180_V3,
	vias3: GF180_V5,
	pgs: GF180_M2,
};

/** All mappings indexed by PDK name and generator type */
export const PDK_MAPPINGS: Record<string, Record<GeneratorType, GeneratorPdkMap>> = {
	sky130: { '2metal': SKY130_2METAL, '3metal': SKY130_3METAL, '4metal': SKY130_4METAL },
	sg13g2: { '2metal': SG13G2_2METAL, '3metal': SG13G2_3METAL, '4metal': SG13G2_4METAL },
	gf180mcu: { '2metal': GF180_2METAL, '3metal': GF180_3METAL, '4metal': GF180_4METAL },
};

export const PDK_NAMES: Record<string, string> = {
	sky130: 'SKY130',
	sg13g2: 'SG13G2',
	gf180mcu: 'GF180MCU',
};

/** Convert a PDK mapping to a ProcessStack for rendering */
export function pdkMapToStack(pdkMap: GeneratorPdkMap, pdkName: string): import('$lib/stack/types').ProcessStack {
	// Collect unique PDK layers, sorted by z
	const seen = new Map<string, { pdk: PdkLayer; layerNames: LayerName[] }>();
	for (const [ln, pdk] of Object.entries(pdkMap) as [LayerName, PdkLayer][]) {
		const key = `${pdk.gds}:${pdk.datatype}`;
		if (seen.has(key)) {
			seen.get(key)!.layerNames.push(ln);
		} else {
			seen.set(key, { pdk, layerNames: [ln] });
		}
	}

	const sorted = [...seen.values()].sort((a, b) => a.pdk.z - b.pdk.z);
	const layers: import('$lib/stack/types').StackLayer[] = [
		{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: Math.max(0, sorted[0]?.pdk.z ?? 0), color: '#4a4a5a', gdsLayers: [], visible: true },
	];

	for (const { pdk, layerNames } of sorted) {
		layers.push({
			id: `${pdk.gds}_${pdk.datatype}`,
			name: pdk.name,
			type: pdk.type === 'via' ? 'via' : 'metal',
			z: pdk.z,
			thickness: pdk.thickness,
			color: pdk.color,
			gdsLayers: layerNames,
			visible: true,
		});
	}

	return {
		name: pdkName,
		layers,
		substrateThickness: sorted[0]?.pdk.z ?? 300,
		oxideEr: 4.0,
		substrateRho: 10,
		substrateEr: 11.7,
	};
}

/** Convert a PDK mapping to GDS layer numbers for export */
export function pdkMapToGdsLayers(pdkMap: GeneratorPdkMap): Record<LayerName, { layer: number; datatype: number }> {
	const result: Partial<Record<LayerName, { layer: number; datatype: number }>> = {};
	for (const [ln, pdk] of Object.entries(pdkMap) as [LayerName, PdkLayer][]) {
		result[ln] = { layer: pdk.gds, datatype: pdk.datatype };
	}
	return result as Record<LayerName, { layer: number; datatype: number }>;
}
