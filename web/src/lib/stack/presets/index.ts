/**
 * AUTO-GENERATED — do not edit manually.
 * Run: npx tsx src/lib/stack/presets/build.ts
 *
 * Merges .lyp (names/colors from PDK repos) + .stack.json (z/thickness from datasheets)
 */

export interface PresetLayer {
	gds: number;
	datatype: number;
	name: string;
	type: 'metal' | 'via' | 'poly' | 'diffusion' | 'other';
	z: number;
	thickness: number;
	color: string;
}

export interface ProcessPreset {
	name: string;
	description: string;
	layers: PresetLayer[];
}

const GF180MCU: ProcessPreset = {
	name: 'GF180MCU',
	description: 'GlobalFoundries 180nm CMOS — 5M + thick top metal',
	layers: [
		{ gds: 30, datatype: 0, name: 'Poly2', type: 'poly', z: -0.18, thickness: 0.18, color: '#ff0000' },
		{ gds: 34, datatype: 0, name: 'Metal1', type: 'metal', z: 0, thickness: 0.31, color: '#0000ff' },
		{ gds: 35, datatype: 0, name: 'Via1', type: 'via', z: 0.31, thickness: 0.5, color: '#ffffff' },
		{ gds: 36, datatype: 0, name: 'Metal2', type: 'metal', z: 0.81, thickness: 0.31, color: '#ff00ff' },
		{ gds: 38, datatype: 0, name: 'Via2', type: 'via', z: 1.12, thickness: 0.5, color: '#e1d8ca' },
		{ gds: 42, datatype: 0, name: 'Metal3', type: 'metal', z: 1.62, thickness: 0.31, color: '#00ffff' },
		{ gds: 40, datatype: 0, name: 'Via3', type: 'via', z: 1.93, thickness: 0.5, color: '#53e2e8' },
		{ gds: 46, datatype: 0, name: 'Metal4', type: 'metal', z: 2.43, thickness: 0.31, color: '#8000ff' },
		{ gds: 41, datatype: 0, name: 'Via4', type: 'via', z: 2.74, thickness: 0.5, color: '#ddff00' },
		{ gds: 81, datatype: 0, name: 'Metal5', type: 'metal', z: 3.24, thickness: 0.31, color: '#ddff00' },
		{ gds: 82, datatype: 0, name: 'Via5', type: 'via', z: 3.55, thickness: 0.7, color: '#827e5b' },
		{ gds: 53, datatype: 0, name: 'MetalTop', type: 'metal', z: 4.25, thickness: 0.9, color: '#800057' },
	],
};

const SG13G2: ProcessPreset = {
	name: 'IHP SG13G2',
	description: 'IHP 130nm BiCMOS — 5 thin + 2 thick metals',
	layers: [
		{ gds: 5, datatype: 0, name: 'GatPoly', type: 'poly', z: -0.16, thickness: 0.16, color: '#bf4026' },
		{ gds: 8, datatype: 0, name: 'Metal1', type: 'metal', z: 0, thickness: 0.42, color: '#39bfff' },
		{ gds: 19, datatype: 0, name: 'Via1', type: 'via', z: 0.42, thickness: 0.54, color: '#ccccff' },
		{ gds: 10, datatype: 0, name: 'Metal2', type: 'metal', z: 0.96, thickness: 0.49, color: '#ccccd9' },
		{ gds: 29, datatype: 0, name: 'Via2', type: 'via', z: 1.45, thickness: 0.54, color: '#ff3736' },
		{ gds: 30, datatype: 0, name: 'Metal3', type: 'metal', z: 1.99, thickness: 0.49, color: '#d80000' },
		{ gds: 49, datatype: 0, name: 'Via3', type: 'via', z: 2.48, thickness: 0.54, color: '#9ba940' },
		{ gds: 50, datatype: 0, name: 'Metal4', type: 'metal', z: 3.02, thickness: 0.49, color: '#93e837' },
		{ gds: 66, datatype: 0, name: 'Via4', type: 'via', z: 3.51, thickness: 0.54, color: '#deac5e' },
		{ gds: 67, datatype: 0, name: 'Metal5', type: 'metal', z: 4.05, thickness: 0.49, color: '#dcd146' },
		{ gds: 125, datatype: 0, name: 'TopVia1', type: 'via', z: 4.54, thickness: 0.85, color: '#ffe6bf' },
		{ gds: 126, datatype: 0, name: 'TopMetal1', type: 'metal', z: 5.39, thickness: 2, color: '#ffe6bf' },
		{ gds: 133, datatype: 0, name: 'TopVia2', type: 'via', z: 7.39, thickness: 2.8, color: '#ff8000' },
		{ gds: 134, datatype: 0, name: 'TopMetal2', type: 'metal', z: 10.19, thickness: 3, color: '#ff8000' },
		{ gds: 36, datatype: 0, name: 'MIM', type: 'other', z: 5.39, thickness: 0.15, color: '#268c6b' },
	],
};

const SKY130: ProcessPreset = {
	name: 'SKY130',
	description: 'SkyWater 130nm CMOS — 1 LI + 5 metals',
	layers: [
		{ gds: 66, datatype: 20, name: 'poly', type: 'poly', z: -0.18, thickness: 0.18, color: '#ff0000' },
		{ gds: 66, datatype: 44, name: 'licon1', type: 'via', z: -0.1, thickness: 0.1, color: '#ffffcc' },
		{ gds: 67, datatype: 20, name: 'li1', type: 'metal', z: 0, thickness: 0.1, color: '#ffe6bf' },
		{ gds: 67, datatype: 44, name: 'mcon', type: 'via', z: 0.1, thickness: 0.27, color: '#ccccd9' },
		{ gds: 68, datatype: 20, name: 'met1', type: 'metal', z: 0.37, thickness: 0.36, color: '#0000ff' },
		{ gds: 68, datatype: 44, name: 'via', type: 'via', z: 0.73, thickness: 0.27, color: '#5e00e6' },
		{ gds: 69, datatype: 20, name: 'met2', type: 'metal', z: 1, thickness: 0.36, color: '#ff00ff' },
		{ gds: 69, datatype: 44, name: 'via2', type: 'via', z: 1.36, thickness: 0.42, color: '#ff8000' },
		{ gds: 70, datatype: 20, name: 'met3', type: 'metal', z: 1.78, thickness: 0.845, color: '#00ffff' },
		{ gds: 70, datatype: 44, name: 'via3', type: 'via', z: 2.625, thickness: 0.39, color: '#268c6b' },
		{ gds: 71, datatype: 20, name: 'met4', type: 'metal', z: 3.015, thickness: 0.845, color: '#5e00e6' },
		{ gds: 71, datatype: 44, name: 'via4', type: 'via', z: 3.86, thickness: 0.505, color: '#ffff00' },
		{ gds: 72, datatype: 20, name: 'met5', type: 'metal', z: 4.365, thickness: 1.26, color: '#d9cc00' },
	],
};

export const PRESETS: Record<string, ProcessPreset> = {
	gf180mcu: GF180MCU,
	sg13g2: SG13G2,
	sky130: SKY130,
};

export const PRESET_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, description: p.description }));
