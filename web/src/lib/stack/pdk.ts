/**
 * Unified PDK definitions — single source of truth for all PDK layer data.
 * Used by: generators (LayerName mapping), GDS viewer (preset), embed (colors/z).
 */
import type { LayerName } from '$lib/geometry/types';
import type { ProcessStack, StackLayer } from './types';

// ─── Types ───────────────────────────────────────────────────────────

/** A physical layer in a PDK */
export interface PdkLayer {
	name: string;
	gds: number;
	datatype: number;
	z: number;
	thickness: number;
	color: string;
	type: 'metal' | 'via' | 'poly' | 'diffusion' | 'other';
}

/** Complete PDK definition */
export interface Pdk {
	id: string;
	name: string;
	description: string;
	/** All layers in the PDK, sorted bottom to top */
	layers: PdkLayer[];
	/** Generator mappings: which PDK layers each generator type uses */
	generators: Record<GeneratorType, GeneratorPdkMap>;
}

/** Mapping from generator LayerName → PDK layer */
export type GeneratorPdkMap = Partial<Record<LayerName, PdkLayer>>;

/** Generator types that use different metal counts */
export type GeneratorType = '2metal' | '3metal' | '4metal';

// ─── Color palette (consistent across all PDKs) ─────────────────────

const C = {
	topMetal: '#e8944a',
	metal2: '#d9513c',
	metal3: '#5aad78',
	metal4: '#4a9ec2',
	metal5: '#6bbf8a',
	metal6: '#7b5e8a',
	pgs: '#7b5e8a',
	viaLight: '#7a7a84',
	viaDark: '#5a5a62',
	viaMid: '#6e6e78',
	poly: '#c4725e',
};

// ─── SKY130 ──────────────────────────────────────────────────────────

const sky130_layers: PdkLayer[] = [
	{ name: 'poly', gds: 66, datatype: 20, z: -0.18, thickness: 0.18, color: C.poly, type: 'poly' },
	{ name: 'licon1', gds: 66, datatype: 44, z: -0.10, thickness: 0.10, color: C.viaDark, type: 'via' },
	{ name: 'li1', gds: 67, datatype: 20, z: 0.00, thickness: 0.10, color: C.metal6, type: 'metal' },
	{ name: 'mcon', gds: 67, datatype: 44, z: 0.10, thickness: 0.27, color: C.viaDark, type: 'via' },
	{ name: 'met1', gds: 68, datatype: 20, z: 0.37, thickness: 0.36, color: C.metal5, type: 'metal' },
	{ name: 'via', gds: 68, datatype: 44, z: 0.73, thickness: 0.27, color: C.viaDark, type: 'via' },
	{ name: 'met2', gds: 69, datatype: 20, z: 1.00, thickness: 0.36, color: C.metal4, type: 'metal' },
	{ name: 'via2', gds: 69, datatype: 44, z: 1.36, thickness: 0.42, color: C.viaMid, type: 'via' },
	{ name: 'met3', gds: 70, datatype: 20, z: 1.78, thickness: 0.845, color: C.metal3, type: 'metal' },
	{ name: 'via3', gds: 70, datatype: 44, z: 2.625, thickness: 0.39, color: C.viaMid, type: 'via' },
	{ name: 'met4', gds: 71, datatype: 20, z: 3.015, thickness: 0.845, color: C.metal2, type: 'metal' },
	{ name: 'via4', gds: 71, datatype: 44, z: 3.86, thickness: 0.505, color: C.viaLight, type: 'via' },
	{ name: 'met5', gds: 72, datatype: 20, z: 4.365, thickness: 1.26, color: C.topMetal, type: 'metal' },
];

const sky130_2m = (() => {
	const l = (n: string) => sky130_layers.find(x => x.name === n)!;
	return {
		crossings: l('met4'), windings_m2: l('met4'), windings: l('met5'),
		vias: l('via4'), vias1: l('via4'), pgs: l('li1'),
	} as GeneratorPdkMap;
})();

const sky130_3m = (() => {
	const l = (n: string) => sky130_layers.find(x => x.name === n)!;
	return {
		centertap: l('met3'), crossings_m1: l('met3'), guard_ring: l('met3'),
		crossings: l('met4'), windings_m2: l('met4'), windings: l('met5'),
		vias: l('via4'), vias1: l('via4'), vias2: l('via3'), pgs: l('li1'),
	} as GeneratorPdkMap;
})();

const sky130_4m = (() => {
	const l = (n: string) => sky130_layers.find(x => x.name === n)!;
	return {
		centertap: l('met2'), crossings_m1: l('met2'), guard_ring: l('met2'),
		crossings: l('met3'), windings_m2: l('met3'), windings: l('met4'),
		windings_m4: l('met5'),
		vias: l('via3'), vias1: l('via3'), vias2: l('via2'), vias3: l('via4'), pgs: l('li1'),
	} as GeneratorPdkMap;
})();

// ─── SG13G2 ──────────────────────────────────────────────────────────

const sg13g2_layers: PdkLayer[] = [
	{ name: 'GatPoly', gds: 5, datatype: 0, z: -0.16, thickness: 0.16, color: C.poly, type: 'poly' },
	{ name: 'Metal1', gds: 8, datatype: 0, z: 0.00, thickness: 0.42, color: C.metal6, type: 'metal' },
	{ name: 'Via1', gds: 19, datatype: 0, z: 0.42, thickness: 0.54, color: C.viaDark, type: 'via' },
	{ name: 'Metal2', gds: 10, datatype: 0, z: 0.96, thickness: 0.49, color: C.metal5, type: 'metal' },
	{ name: 'Via2', gds: 29, datatype: 0, z: 1.45, thickness: 0.54, color: C.viaDark, type: 'via' },
	{ name: 'Metal3', gds: 30, datatype: 0, z: 1.99, thickness: 0.49, color: C.metal4, type: 'metal' },
	{ name: 'Via3', gds: 49, datatype: 0, z: 2.48, thickness: 0.54, color: C.viaDark, type: 'via' },
	{ name: 'Metal4', gds: 50, datatype: 0, z: 3.02, thickness: 0.49, color: C.metal3, type: 'metal' },
	{ name: 'Via4', gds: 66, datatype: 0, z: 3.51, thickness: 0.54, color: C.viaMid, type: 'via' },
	{ name: 'Metal5', gds: 67, datatype: 0, z: 4.05, thickness: 0.49, color: C.metal4, type: 'metal' },
	{ name: 'TopVia1', gds: 125, datatype: 0, z: 4.54, thickness: 0.85, color: C.viaMid, type: 'via' },
	{ name: 'TopMetal1', gds: 126, datatype: 0, z: 5.39, thickness: 2.00, color: C.metal2, type: 'metal' },
	{ name: 'TopVia2', gds: 133, datatype: 0, z: 7.39, thickness: 2.80, color: C.viaLight, type: 'via' },
	{ name: 'TopMetal2', gds: 134, datatype: 0, z: 10.19, thickness: 3.00, color: C.topMetal, type: 'metal' },
	{ name: 'MIM', gds: 36, datatype: 0, z: 5.39, thickness: 0.15, color: C.pgs, type: 'other' },
];

const sg13g2_2m = (() => {
	const l = (n: string) => sg13g2_layers.find(x => x.name === n)!;
	return {
		crossings: l('TopMetal1'), windings_m2: l('TopMetal1'), windings: l('TopMetal2'),
		vias: l('TopVia2'), vias1: l('TopVia2'), pgs: l('Metal3'),
	} as GeneratorPdkMap;
})();

const sg13g2_3m = (() => {
	const l = (n: string) => sg13g2_layers.find(x => x.name === n)!;
	return {
		centertap: l('Metal5'), crossings_m1: l('Metal5'), guard_ring: l('Metal5'),
		crossings: l('TopMetal1'), windings_m2: l('TopMetal1'), windings: l('TopMetal2'),
		vias: l('TopVia2'), vias1: l('TopVia2'), vias2: l('TopVia1'), pgs: l('Metal3'),
	} as GeneratorPdkMap;
})();

const sg13g2_4m = (() => {
	const l = (n: string) => sg13g2_layers.find(x => x.name === n)!;
	return {
		centertap: l('Metal4'), crossings_m1: l('Metal4'), guard_ring: l('Metal4'),
		crossings: l('Metal5'), windings_m2: l('Metal5'), windings: l('TopMetal1'),
		windings_m4: l('TopMetal2'),
		vias: l('TopVia1'), vias1: l('TopVia1'), vias2: l('Via4'), vias3: l('TopVia2'), pgs: l('Metal3'),
	} as GeneratorPdkMap;
})();

// ─── GF180MCU ────────────────────────────────────────────────────────

const gf180mcu_layers: PdkLayer[] = [
	{ name: 'Poly2', gds: 30, datatype: 0, z: -0.18, thickness: 0.18, color: C.poly, type: 'poly' },
	{ name: 'Metal1', gds: 34, datatype: 0, z: 0.00, thickness: 0.31, color: C.metal6, type: 'metal' },
	{ name: 'Via1', gds: 35, datatype: 0, z: 0.31, thickness: 0.50, color: C.viaDark, type: 'via' },
	{ name: 'Metal2', gds: 36, datatype: 0, z: 0.81, thickness: 0.31, color: C.metal5, type: 'metal' },
	{ name: 'Via2', gds: 38, datatype: 0, z: 1.12, thickness: 0.50, color: C.viaDark, type: 'via' },
	{ name: 'Metal3', gds: 42, datatype: 0, z: 1.62, thickness: 0.31, color: C.metal4, type: 'metal' },
	{ name: 'Via3', gds: 40, datatype: 0, z: 1.93, thickness: 0.50, color: C.viaMid, type: 'via' },
	{ name: 'Metal4', gds: 46, datatype: 0, z: 2.43, thickness: 0.31, color: C.metal3, type: 'metal' },
	{ name: 'Via4', gds: 41, datatype: 0, z: 2.74, thickness: 0.50, color: C.viaMid, type: 'via' },
	{ name: 'Metal5', gds: 81, datatype: 0, z: 3.24, thickness: 0.31, color: C.metal2, type: 'metal' },
	{ name: 'Via5', gds: 82, datatype: 0, z: 3.55, thickness: 0.70, color: C.viaLight, type: 'via' },
	{ name: 'MetalTop', gds: 53, datatype: 0, z: 4.25, thickness: 0.90, color: C.topMetal, type: 'metal' },
];

const gf180mcu_2m = (() => {
	const l = (n: string) => gf180mcu_layers.find(x => x.name === n)!;
	return {
		crossings: l('Metal5'), windings_m2: l('Metal5'), windings: l('MetalTop'),
		vias: l('Via5'), vias1: l('Via5'), pgs: l('Metal2'),
	} as GeneratorPdkMap;
})();

const gf180mcu_3m = (() => {
	const l = (n: string) => gf180mcu_layers.find(x => x.name === n)!;
	return {
		centertap: l('Metal4'), crossings_m1: l('Metal4'), guard_ring: l('Metal4'),
		crossings: l('Metal5'), windings_m2: l('Metal5'), windings: l('MetalTop'),
		vias: l('Via5'), vias1: l('Via5'), vias2: l('Via4'), pgs: l('Metal2'),
	} as GeneratorPdkMap;
})();

const gf180mcu_4m = (() => {
	const l = (n: string) => gf180mcu_layers.find(x => x.name === n)!;
	return {
		centertap: l('Metal3'), crossings_m1: l('Metal3'), guard_ring: l('Metal3'),
		crossings: l('Metal4'), windings_m2: l('Metal4'), windings: l('Metal5'),
		windings_m4: l('MetalTop'),
		vias: l('Via4'), vias1: l('Via4'), vias2: l('Via3'), vias3: l('Via5'), pgs: l('Metal2'),
	} as GeneratorPdkMap;
})();

// ─── ASAP7 (7nm FinFET predictive) ───────────────────────────────────

const asap7_layers: PdkLayer[] = [
	{ name: 'V0', gds: 18, datatype: 0, z: 0.032, thickness: 0.018, color: C.viaDark, type: 'via' },
	{ name: 'M1', gds: 19, datatype: 0, z: 0.050, thickness: 0.036, color: C.metal6, type: 'metal' },
	{ name: 'V1', gds: 21, datatype: 0, z: 0.086, thickness: 0.018, color: C.viaDark, type: 'via' },
	{ name: 'M2', gds: 20, datatype: 0, z: 0.104, thickness: 0.036, color: C.metal5, type: 'metal' },
	{ name: 'V2', gds: 25, datatype: 0, z: 0.140, thickness: 0.018, color: C.viaDark, type: 'via' },
	{ name: 'M3', gds: 30, datatype: 0, z: 0.158, thickness: 0.036, color: C.metal4, type: 'metal' },
	{ name: 'V3', gds: 35, datatype: 0, z: 0.194, thickness: 0.024, color: C.viaMid, type: 'via' },
	{ name: 'M4', gds: 40, datatype: 0, z: 0.218, thickness: 0.048, color: C.metal3, type: 'metal' },
	{ name: 'V4', gds: 45, datatype: 0, z: 0.266, thickness: 0.024, color: C.viaMid, type: 'via' },
	{ name: 'M5', gds: 50, datatype: 0, z: 0.290, thickness: 0.048, color: C.metal4, type: 'metal' },
	{ name: 'V5', gds: 55, datatype: 0, z: 0.338, thickness: 0.032, color: C.viaMid, type: 'via' },
	{ name: 'M6', gds: 60, datatype: 0, z: 0.370, thickness: 0.064, color: C.metal3, type: 'metal' },
	{ name: 'V6', gds: 65, datatype: 0, z: 0.434, thickness: 0.032, color: C.viaMid, type: 'via' },
	{ name: 'M7', gds: 70, datatype: 0, z: 0.466, thickness: 0.064, color: C.metal4, type: 'metal' },
	{ name: 'V7', gds: 75, datatype: 0, z: 0.530, thickness: 0.040, color: C.viaLight, type: 'via' },
	{ name: 'M8', gds: 80, datatype: 0, z: 0.570, thickness: 0.080, color: C.metal2, type: 'metal' },
	{ name: 'V8', gds: 85, datatype: 0, z: 0.650, thickness: 0.040, color: C.viaLight, type: 'via' },
	{ name: 'M9', gds: 90, datatype: 0, z: 0.690, thickness: 0.080, color: C.topMetal, type: 'metal' },
];

const asap7_2m = (() => {
	const l = (n: string) => asap7_layers.find(x => x.name === n)!;
	return {
		crossings: l('M8'), windings_m2: l('M8'), windings: l('M9'),
		vias: l('V8'), vias1: l('V8'), pgs: l('M1'),
	} as GeneratorPdkMap;
})();

const asap7_3m = (() => {
	const l = (n: string) => asap7_layers.find(x => x.name === n)!;
	return {
		centertap: l('M7'), crossings_m1: l('M7'), guard_ring: l('M7'),
		crossings: l('M8'), windings_m2: l('M8'), windings: l('M9'),
		vias: l('V8'), vias1: l('V8'), vias2: l('V7'), pgs: l('M1'),
	} as GeneratorPdkMap;
})();

const asap7_4m = (() => {
	const l = (n: string) => asap7_layers.find(x => x.name === n)!;
	return {
		centertap: l('M6'), crossings_m1: l('M6'), guard_ring: l('M6'),
		crossings: l('M7'), windings_m2: l('M7'), windings: l('M8'),
		windings_m4: l('M9'),
		vias: l('V7'), vias1: l('V7'), vias2: l('V6'), vias3: l('V8'), pgs: l('M1'),
	} as GeneratorPdkMap;
})();

// ─── FreePDK45 (45nm predictive) ────────────────────────────────────

const freepdk45_layers: PdkLayer[] = [
	{ name: 'poly', gds: 9, datatype: 0, z: -0.05, thickness: 0.05, color: C.poly, type: 'poly' },
	{ name: 'contact', gds: 10, datatype: 0, z: 0.25, thickness: 0.12, color: C.viaDark, type: 'via' },
	{ name: 'metal1', gds: 11, datatype: 0, z: 0.37, thickness: 0.13, color: C.metal6, type: 'metal' },
	{ name: 'via1', gds: 12, datatype: 0, z: 0.50, thickness: 0.12, color: C.viaDark, type: 'via' },
	{ name: 'metal2', gds: 13, datatype: 0, z: 0.62, thickness: 0.14, color: C.metal5, type: 'metal' },
	{ name: 'via2', gds: 14, datatype: 0, z: 0.76, thickness: 0.12, color: C.viaDark, type: 'via' },
	{ name: 'metal3', gds: 15, datatype: 0, z: 0.88, thickness: 0.14, color: C.metal4, type: 'metal' },
	{ name: 'via3', gds: 16, datatype: 0, z: 1.02, thickness: 0.12, color: C.viaMid, type: 'via' },
	{ name: 'metal4', gds: 17, datatype: 0, z: 1.14, thickness: 0.28, color: C.metal3, type: 'metal' },
	{ name: 'via4', gds: 18, datatype: 0, z: 1.42, thickness: 0.29, color: C.viaMid, type: 'via' },
	{ name: 'metal5', gds: 19, datatype: 0, z: 1.71, thickness: 0.28, color: C.metal4, type: 'metal' },
	{ name: 'via5', gds: 20, datatype: 0, z: 1.99, thickness: 0.29, color: C.viaMid, type: 'via' },
	{ name: 'metal6', gds: 21, datatype: 0, z: 2.28, thickness: 0.28, color: C.metal3, type: 'metal' },
	{ name: 'via6', gds: 22, datatype: 0, z: 2.56, thickness: 0.29, color: C.viaMid, type: 'via' },
	{ name: 'metal7', gds: 23, datatype: 0, z: 2.85, thickness: 0.80, color: C.metal4, type: 'metal' },
	{ name: 'via7', gds: 24, datatype: 0, z: 3.65, thickness: 0.82, color: C.viaLight, type: 'via' },
	{ name: 'metal8', gds: 25, datatype: 0, z: 4.47, thickness: 0.80, color: C.metal3, type: 'metal' },
	{ name: 'via8', gds: 26, datatype: 0, z: 5.27, thickness: 0.82, color: C.viaLight, type: 'via' },
	{ name: 'metal9', gds: 27, datatype: 0, z: 6.09, thickness: 2.00, color: C.metal2, type: 'metal' },
	{ name: 'via9', gds: 28, datatype: 0, z: 8.09, thickness: 2.00, color: C.viaLight, type: 'via' },
	{ name: 'metal10', gds: 29, datatype: 0, z: 10.09, thickness: 2.00, color: C.topMetal, type: 'metal' },
];

const freepdk45_2m = (() => {
	const l = (n: string) => freepdk45_layers.find(x => x.name === n)!;
	return {
		crossings: l('metal9'), windings_m2: l('metal9'), windings: l('metal10'),
		vias: l('via9'), vias1: l('via9'), pgs: l('metal1'),
	} as GeneratorPdkMap;
})();

const freepdk45_3m = (() => {
	const l = (n: string) => freepdk45_layers.find(x => x.name === n)!;
	return {
		centertap: l('metal8'), crossings_m1: l('metal8'), guard_ring: l('metal8'),
		crossings: l('metal9'), windings_m2: l('metal9'), windings: l('metal10'),
		vias: l('via9'), vias1: l('via9'), vias2: l('via8'), pgs: l('metal1'),
	} as GeneratorPdkMap;
})();

const freepdk45_4m = (() => {
	const l = (n: string) => freepdk45_layers.find(x => x.name === n)!;
	return {
		centertap: l('metal7'), crossings_m1: l('metal7'), guard_ring: l('metal7'),
		crossings: l('metal8'), windings_m2: l('metal8'), windings: l('metal9'),
		windings_m4: l('metal10'),
		vias: l('via8'), vias1: l('via8'), vias2: l('via7'), vias3: l('via9'), pgs: l('metal1'),
	} as GeneratorPdkMap;
})();

// ─── PDK Registry ────────────────────────────────────────────────────

export const PDKS: Record<string, Pdk> = {
	sky130: {
		id: 'sky130', name: 'SKY130',
		description: 'SkyWater 130nm CMOS — 1 LI + 5 metals',
		layers: sky130_layers,
		generators: { '2metal': sky130_2m, '3metal': sky130_3m, '4metal': sky130_4m },
	},
	sg13g2: {
		id: 'sg13g2', name: 'SG13G2',
		description: 'IHP 130nm BiCMOS — 5 thin + 2 thick metals',
		layers: sg13g2_layers,
		generators: { '2metal': sg13g2_2m, '3metal': sg13g2_3m, '4metal': sg13g2_4m },
	},
	gf180mcu: {
		id: 'gf180mcu', name: 'GF180MCU',
		description: 'GlobalFoundries 180nm — 5M + thick top metal',
		layers: gf180mcu_layers,
		generators: { '2metal': gf180mcu_2m, '3metal': gf180mcu_3m, '4metal': gf180mcu_4m },
	},
	asap7: {
		id: 'asap7', name: 'ASAP7',
		description: 'ASU 7nm FinFET predictive — 9 metals',
		layers: asap7_layers,
		generators: { '2metal': asap7_2m, '3metal': asap7_3m, '4metal': asap7_4m },
	},
	freepdk45: {
		id: 'freepdk45', name: 'FreePDK45',
		description: 'NCSU 45nm predictive — 10 metals',
		layers: freepdk45_layers,
		generators: { '2metal': freepdk45_2m, '3metal': freepdk45_3m, '4metal': freepdk45_4m },
	},
};

export const PDK_LIST = Object.values(PDKS).map(p => ({ id: p.id, name: p.name, description: p.description }));

// ─── Utility functions ───────────────────────────────────────────────

/** Convert a generator PDK mapping to a ProcessStack for rendering */
export function pdkMapToStack(pdkMap: GeneratorPdkMap, pdkName: string): ProcessStack {
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
	const layers: StackLayer[] = [
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
		name: pdkName, layers,
		substrateThickness: sorted[0]?.pdk.z ?? 300,
		oxideEr: 4.0, substrateRho: 10, substrateEr: 11.7,
	};
}

/** Convert a generator PDK mapping to GDS layer/datatype pairs for export */
export function pdkMapToGdsLayers(pdkMap: GeneratorPdkMap): Record<LayerName, { layer: number; datatype: number }> {
	const result: Partial<Record<LayerName, { layer: number; datatype: number }>> = {};
	for (const [ln, pdk] of Object.entries(pdkMap) as [LayerName, PdkLayer][]) {
		result[ln] = { layer: pdk.gds, datatype: pdk.datatype };
	}
	return result as Record<LayerName, { layer: number; datatype: number }>;
}

/** Convert a full PDK layer list to a ProcessStack (for the viewer) */
export function pdkToViewerStack(pdk: Pdk, gdsLayersInFile: Set<number>): {
	stack: ProcessStack;
	layerInfo: Map<number, { name: string; color: string; type: string; thickness: number; z: number }>;
} {
	const layerInfo = new Map<number, { name: string; color: string; type: string; thickness: number; z: number }>();
	const stackLayers: StackLayer[] = [
		{ id: 'sub', name: 'Substrate', type: 'substrate', z: 0, thickness: 0, color: '#4a4a5a', gdsLayers: [], visible: true },
	];

	const sorted = [...pdk.layers].sort((a, b) => a.z - b.z);

	for (const pl of sorted) {
		if (!gdsLayersInFile.has(pl.gds)) continue;
		layerInfo.set(pl.gds, { name: pl.name, color: pl.color, type: pl.type, thickness: pl.thickness, z: pl.z });
	}

	return {
		stack: { name: pdk.name, layers: stackLayers, substrateThickness: 300, oxideEr: 4.0, substrateRho: 10, substrateEr: 11.7 },
		layerInfo,
	};
}
