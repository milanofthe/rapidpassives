/**
 * PDK process stack presets.
 * Each preset defines the GDS layer mapping, metal stack, and colors
 * for a specific semiconductor process.
 */

export interface PresetLayer {
	/** GDS layer number */
	gds: number;
	/** GDS datatype (0 = drawing) */
	datatype: number;
	/** Display name */
	name: string;
	/** Layer type */
	type: 'metal' | 'via' | 'poly' | 'diffusion' | 'other';
	/** Bottom z-position in µm */
	z: number;
	/** Thickness in µm */
	thickness: number;
	/** Display color (hex) */
	color: string;
}

export interface ProcessPreset {
	name: string;
	description: string;
	layers: PresetLayer[];
}

// ─── SKY130 ──────────────────────────────────────────────────────────
// SkyWater 130nm CMOS — 1 LI + 5 metal layers
// Sources: skywater-pdk.readthedocs.io, efabless/sky130_klayout_pdk
// Thicknesses from BAG3 tech file and community measurements

const SKY130: ProcessPreset = {
	name: 'SKY130',
	description: 'SkyWater 130nm CMOS — 1 LI + 5 metals',
	layers: [
		// Local interconnect
		{ gds: 67, datatype: 20, name: 'li1',    type: 'metal', z: 0.00,  thickness: 0.10,  color: '#6bbf8a' },
		{ gds: 67, datatype: 44, name: 'mcon',   type: 'via',   z: 0.10,  thickness: 0.27,  color: '#5a5a62' },
		// Metal 1
		{ gds: 68, datatype: 20, name: 'met1',   type: 'metal', z: 0.37,  thickness: 0.36,  color: '#4a9ec2' },
		{ gds: 68, datatype: 44, name: 'via',    type: 'via',   z: 0.73,  thickness: 0.27,  color: '#6e6e78' },
		// Metal 2
		{ gds: 69, datatype: 20, name: 'met2',   type: 'metal', z: 1.00,  thickness: 0.36,  color: '#e8944a' },
		{ gds: 69, datatype: 44, name: 'via2',   type: 'via',   z: 1.36,  thickness: 0.42,  color: '#6e6e78' },
		// Metal 3
		{ gds: 70, datatype: 20, name: 'met3',   type: 'metal', z: 1.78,  thickness: 0.845, color: '#d9513c' },
		{ gds: 70, datatype: 44, name: 'via3',   type: 'via',   z: 2.625, thickness: 0.39,  color: '#7a7a84' },
		// Metal 4
		{ gds: 71, datatype: 20, name: 'met4',   type: 'metal', z: 3.015, thickness: 0.845, color: '#7b5e8a' },
		{ gds: 71, datatype: 44, name: 'via4',   type: 'via',   z: 3.86,  thickness: 0.505, color: '#7a7a84' },
		// Metal 5
		{ gds: 72, datatype: 20, name: 'met5',   type: 'metal', z: 4.365, thickness: 1.26,  color: '#f0b86a' },
		// Poly
		{ gds: 66, datatype: 20, name: 'poly',   type: 'poly',  z: -0.18, thickness: 0.18,  color: '#c94a3a' },
		{ gds: 66, datatype: 44, name: 'licon1', type: 'via',   z: -0.10, thickness: 0.10,  color: '#5a5a62' },
	],
};

// ─── IHP SG13G2 ──────────────────────────────────────────────────────
// IHP 130nm SiGe BiCMOS — 5 thin metals + 2 thick top metals
// Sources: SG13G2_os_process_spec.pdf Rev 1.2, IHP-Open-PDK/sg13g2.lyp
// Z-positions computed from cross-section (page 5) and thickness table (page 17)

const SG13G2: ProcessPreset = {
	name: 'IHP SG13G2',
	description: 'IHP 130nm BiCMOS — 5 thin + 2 thick metals',
	layers: [
		// Metal 1 (bottom of BEOL, z=0 reference)
		{ gds: 8,   datatype: 0, name: 'Metal1',    type: 'metal', z: 0.00,  thickness: 0.42,  color: '#4a9ec2' },
		{ gds: 19,  datatype: 0, name: 'Via1',       type: 'via',   z: 0.42,  thickness: 0.54,  color: '#5a5a62' },
		// Metal 2
		{ gds: 10,  datatype: 0, name: 'Metal2',     type: 'metal', z: 0.96,  thickness: 0.49,  color: '#e8944a' },
		{ gds: 29,  datatype: 0, name: 'Via2',       type: 'via',   z: 1.45,  thickness: 0.54,  color: '#6e6e78' },
		// Metal 3
		{ gds: 30,  datatype: 0, name: 'Metal3',     type: 'metal', z: 1.99,  thickness: 0.49,  color: '#d9513c' },
		{ gds: 49,  datatype: 0, name: 'Via3',       type: 'via',   z: 2.48,  thickness: 0.54,  color: '#6e6e78' },
		// Metal 4
		{ gds: 50,  datatype: 0, name: 'Metal4',     type: 'metal', z: 3.02,  thickness: 0.49,  color: '#7b5e8a' },
		{ gds: 66,  datatype: 0, name: 'Via4',       type: 'via',   z: 3.51,  thickness: 0.54,  color: '#7a7a84' },
		// Metal 5
		{ gds: 67,  datatype: 0, name: 'Metal5',     type: 'metal', z: 4.05,  thickness: 0.49,  color: '#c4c46b' },
		{ gds: 125, datatype: 0, name: 'TopVia1',    type: 'via',   z: 4.54,  thickness: 0.85,  color: '#7a7a84' },
		// TopMetal1
		{ gds: 126, datatype: 0, name: 'TopMetal1',  type: 'metal', z: 5.39,  thickness: 2.00,  color: '#f0b86a' },
		{ gds: 133, datatype: 0, name: 'TopVia2',    type: 'via',   z: 7.39,  thickness: 2.80,  color: '#7a7a84' },
		// TopMetal2
		{ gds: 134, datatype: 0, name: 'TopMetal2',  type: 'metal', z: 10.19, thickness: 3.00,  color: '#6bbf8a' },
		// Poly
		{ gds: 5,   datatype: 0, name: 'GatPoly',    type: 'poly',  z: -0.16, thickness: 0.16,  color: '#c94a3a' },
		// MIM capacitor
		{ gds: 36,  datatype: 0, name: 'MIM',        type: 'other', z: 5.39,  thickness: 0.15,  color: '#b86ad9' },
	],
};

// ─── GF180MCU ────────────────────────────────────────────────────────
// GlobalFoundries 180nm MCU CMOS — up to 6 metal layers
// Sources: gf180mcu-pdk.readthedocs.io DRM section 4.3 + 5.1 + 7.15/7.16
// Metal1-5: ~310nm thick (from Rsh=90mΩ/sq, Al ρ≈2.8µΩ·cm)
// MetalTop variants: 6KÅ, 9KÅ, 11KÅ, 30KÅ
// Using 5-metal + 9KÅ MetalTop as default (most common for analog)

const GF180MCU: ProcessPreset = {
	name: 'GF180MCU',
	description: 'GlobalFoundries 180nm CMOS — 5M + thick top metal',
	layers: [
		// Poly
		{ gds: 30,  datatype: 0, name: 'Poly2',     type: 'poly',  z: -0.18, thickness: 0.18,  color: '#c94a3a' },
		// Metal 1
		{ gds: 34,  datatype: 0, name: 'Metal1',    type: 'metal', z: 0.00,  thickness: 0.31,  color: '#4a9ec2' },
		{ gds: 35,  datatype: 0, name: 'Via1',      type: 'via',   z: 0.31,  thickness: 0.50,  color: '#5a5a62' },
		// Metal 2
		{ gds: 36,  datatype: 0, name: 'Metal2',    type: 'metal', z: 0.81,  thickness: 0.31,  color: '#e8944a' },
		{ gds: 38,  datatype: 0, name: 'Via2',      type: 'via',   z: 1.12,  thickness: 0.50,  color: '#6e6e78' },
		// Metal 3
		{ gds: 42,  datatype: 0, name: 'Metal3',    type: 'metal', z: 1.62,  thickness: 0.31,  color: '#d9513c' },
		{ gds: 40,  datatype: 0, name: 'Via3',      type: 'via',   z: 1.93,  thickness: 0.50,  color: '#6e6e78' },
		// Metal 4
		{ gds: 46,  datatype: 0, name: 'Metal4',    type: 'metal', z: 2.43,  thickness: 0.31,  color: '#7b5e8a' },
		{ gds: 41,  datatype: 0, name: 'Via4',      type: 'via',   z: 2.74,  thickness: 0.50,  color: '#7a7a84' },
		// Metal 5
		{ gds: 81,  datatype: 0, name: 'Metal5',    type: 'metal', z: 3.24,  thickness: 0.31,  color: '#c4c46b' },
		{ gds: 82,  datatype: 0, name: 'Via5',      type: 'via',   z: 3.55,  thickness: 0.70,  color: '#7a7a84' },
		// MetalTop (9KÅ variant)
		{ gds: 53,  datatype: 0, name: 'MetalTop',  type: 'metal', z: 4.25,  thickness: 0.90,  color: '#f0b86a' },
	],
};

// ─── Preset registry ─────────────────────────────────────────────────

export const PRESETS: Record<string, ProcessPreset> = {
	sky130: SKY130,
	sg13g2: SG13G2,
	gf180mcu: GF180MCU,
};

export const PRESET_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, description: p.description }));
