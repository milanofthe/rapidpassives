/**
 * Pi-model parasitic element computation for RFIC inductors.
 *
 * Computes the shunt parasitics (Cox, Csub, Rsub) and series
 * interwinding capacitance (Cs) from geometry and process stack.
 *
 * Reference: Yue & Wong, "On-Chip Spiral Inductors with Patterned
 * Ground Shields for Si-Based RF ICs", IEEE JSSC, 1998.
 */

import type { ProcessStack } from '$lib/stack/types';
import type { Filament } from './inductance';

const EPS0 = 8.854e-12; // F/m
const PI = Math.PI;

/** Lumped parasitic elements for the pi-model */
export interface PiModelParasitics {
	/** Total oxide capacitance from conductor to substrate (F) */
	Cox: number;
	/** Substrate capacitance per side (F) */
	Csub: number;
	/** Substrate resistance per side (Ω) */
	Rsub: number;
	/** Interwinding series capacitance (F) */
	Cs: number;
}

/**
 * Compute pi-model parasitic elements from geometry and stack.
 *
 * @param filaments - conductor filaments with 3D geometry
 * @param stack - process stack with oxide/substrate properties
 * @param conductorSpacing - spacing between adjacent turns (m)
 * @param hasPgs - whether PGS is enabled
 */
export function computeParasitics(
	filaments: Filament[],
	stack: ProcessStack,
	conductorSpacing: number,
	hasPgs: boolean,
): PiModelParasitics {
	// Total conductor area (sum of all segment footprints)
	let totalArea = 0;    // m²
	let totalLength = 0;  // m
	let avgWidth = 0;     // m

	for (const fil of filaments) {
		totalArea += fil.length * fil.width;
		totalLength += fil.length;
		avgWidth += fil.width;
	}
	if (filaments.length > 0) avgWidth /= filaments.length;

	// Oxide thickness: distance from top metal to substrate
	// Use the z-position of the top metal layer (where windings are)
	const topMetalZ = filaments.length > 0 ? filaments[0].z0 : 303e-6;
	const substrateTop = stack.substrateThickness * 1e-6; // top of substrate in m
	const toxEff = Math.abs(topMetalZ - substrateTop); // effective oxide thickness

	// If PGS is enabled, the effective oxide thickness is from conductor
	// to PGS, which is much thinner (PGS sits just above substrate)
	const pgsZ = substrateTop + 0.2e-6; // approximate PGS position
	const toxPgs = Math.abs(topMetalZ - pgsZ);

	const tox = hasPgs ? toxPgs : toxEff;

	// --- Cox: Oxide capacitance ---
	// Cox = ε₀ · εox · A / tox
	const epsOx = EPS0 * stack.oxideEr;
	const Cox = epsOx * totalArea / Math.max(tox, 1e-9);

	// --- Csub: Substrate capacitance ---
	// Csub = ε₀ · εsub · A / tsub_eff
	// Effective substrate thickness for capacitance ~ substrate thickness / 2
	// (field penetration depth approximation)
	const epsSub = EPS0 * (stack.substrateEr ?? 11.7);
	const tsubEff = (stack.substrateThickness * 1e-6) / 2;

	let Csub: number;
	let Rsub: number;

	if (hasPgs) {
		// PGS shorts the substrate — Csub and Rsub are effectively
		// the PGS-to-substrate path, which is very low impedance
		// since PGS is grounded. Model as very large Csub, very small Rsub.
		Csub = epsSub * totalArea / (0.2e-6); // thin oxide between PGS and substrate
		Rsub = 0.1; // near-short through PGS ground
	} else {
		Csub = epsSub * totalArea / Math.max(tsubEff, 1e-9);
		// Rsub = ρsub / (geometric factor)
		// Approximate: Rsub = ρsub · tsub_eff / A
		const rhoSub = stack.substrateRho * 1e-2; // convert Ω·cm to Ω·m
		Rsub = rhoSub * tsubEff / Math.max(totalArea, 1e-18);
	}

	// --- Cs: Interwinding (series) capacitance ---
	// Capacitance between adjacent turns through the oxide
	// Cs = ε₀ · εox · (overlap_length · metal_thickness) / spacing
	// The overlap length is approximately the total winding length
	// (each segment has a neighbor on the adjacent turn)
	const metalThickness = filaments.length > 0 ? filaments[0].height : 1e-6;
	const spacing = Math.max(conductorSpacing, 1e-9);
	const overlapLength = totalLength * 0.8; // ~80% of length has adjacent turn
	const Cs = epsOx * overlapLength * metalThickness / spacing;

	return { Cox, Csub, Rsub, Cs };
}

/**
 * Compute the total 1-port impedance including pi-model parasitics.
 *
 * The circuit is:
 *
 *        Zseries (R+jωL from PEEC)
 *   P1 ──────┤├──────────── P2
 *        │    Cs (series)    │
 *        │                   │
 *       Cox                 Cox
 *        │                   │
 *       Ysub               Ysub
 *        │                   │
 *       GND                 GND
 *
 * where Ysub = jωCsub + 1/Rsub (substrate admittance)
 *
 * We model this as a pi-network:
 * Y_total = Y_shunt1 + Y_series + Y_shunt2
 * where Y_shunt1 = Y_shunt2 = jωCox · Ysub / (jωCox + Ysub)
 * and Z_series = R + jωL + 1/(jωCs)
 */
export function applyPiModel(
	Zre: number, Zim: number, // series impedance from PEEC (R + jωL)
	omega: number,
	parasitics: PiModelParasitics,
): [number, number] { // returns [Zre_total, Zim_total]
	const { Cox, Csub, Rsub, Cs } = parasitics;

	// Series branch: Z_series = (R + jωL) in series with Cs
	// Z_cs = 1/(jωCs) = -j/(ωCs)
	const Xcs = (omega > 0 && Cs > 0) ? -1 / (omega * Cs) : -1e12;
	const ZsRe = Zre;
	const ZsIm = Zim + Xcs;

	// Shunt branch admittance (each side, so Cox/2 and Csub/2, Rsub*2)
	// Y_cox = jω(Cox/2)
	const YcoxRe = 0;
	const YcoxIm = omega * Cox / 2;

	// Y_sub = 1/(Rsub*2) + jω(Csub/2)
	const YsubRe = 1 / (Rsub * 2);
	const YsubIm = omega * Csub / 2;

	// Y_shunt = Y_cox · Y_sub / (Y_cox + Y_sub)
	// = series combination of Cox and (Csub || Rsub)
	// Easier: Z_shunt = Z_cox + Z_sub, then Y_shunt = 1/Z_shunt
	// Z_cox = 1/Y_cox
	const ZcoxMag2 = YcoxRe * YcoxRe + YcoxIm * YcoxIm;
	const ZcoxRe = ZcoxMag2 > 0 ? YcoxRe / ZcoxMag2 : 0;
	const ZcoxIm = ZcoxMag2 > 0 ? -YcoxIm / ZcoxMag2 : -1e12;

	// Z_sub = 1/Y_sub
	const ZsubMag2 = YsubRe * YsubRe + YsubIm * YsubIm;
	const ZsubRe = ZsubMag2 > 0 ? YsubRe / ZsubMag2 : 0;
	const ZsubIm = ZsubMag2 > 0 ? -YsubIm / ZsubMag2 : 0;

	// Z_shunt_total = Z_cox + Z_sub
	const ZshRe = ZcoxRe + ZsubRe;
	const ZshIm = ZcoxIm + ZsubIm;

	// Convert to admittances for pi-network combination
	// Y_series = 1/Z_series
	const ZsMag2 = ZsRe * ZsRe + ZsIm * ZsIm;
	const YsRe = ZsMag2 > 0 ? ZsRe / ZsMag2 : 0;
	const YsIm = ZsMag2 > 0 ? -ZsIm / ZsMag2 : 0;

	// Y_shunt = 1/Z_shunt
	const ZshMag2 = ZshRe * ZshRe + ZshIm * ZshIm;
	const YshRe = ZshMag2 > 0 ? ZshRe / ZshMag2 : 0;
	const YshIm = ZshMag2 > 0 ? -ZshIm / ZshMag2 : 0;

	// For the ABCD → Z conversion of the pi-network:
	// The total impedance seen between P1 and P2 (1-port) is:
	// Z_total = Z_series || (Z_shunt1 + Z_shunt2 in the shunt paths)
	// Actually for pi-network, Z_in = Z_series + Z_shunt1 || Z_shunt2
	// where the shunts go to ground.
	//
	// For 1-port measurement (P2 floating or grounded):
	// If we measure Z between P1 and P2 with the shunt paths to ground,
	// the input impedance is NOT simply Z_series.
	//
	// ABCD of pi: A = 1 + Z_s·Y_sh, B = Z_s, C = 2·Y_sh + Z_s·Y_sh², D = 1 + Z_s·Y_sh
	// Z_in (1-port, other port open) = A/C = (1 + Z_s·Y_sh) / (2·Y_sh + Z_s·Y_sh²)
	//
	// For 2-port S-params, we return the ABCD matrix components.
	// Here we return the effective series impedance for the 1-port case.

	// Effective 1-port impedance: Z_total = Z_series · (1 + Z_series/(2·Z_shunt))
	// This is the impedance including the shunt loading
	// More precisely: Z_1port = Z_series / (1 + Z_series · Y_shunt_total)
	// where Y_shunt_total = Y_sh1 + Y_sh2 = 2·Y_sh
	// Wait — for the 1-port case (short P2 to GND):
	// Z_in = Z_sh1 || (Z_series + Z_sh2)

	// Let's just compute it directly:
	// Z_in = Z_sh || (Z_s + Z_sh) where Z_sh is each shunt arm
	// = Z_sh · (Z_s + Z_sh) / (Z_sh + Z_s + Z_sh)
	// = Z_sh · (Z_s + Z_sh) / (Z_s + 2·Z_sh)

	// Numerator: Z_sh · (Z_s + Z_sh)
	const numRe = (ZshRe * (ZsRe + ZshRe) - ZshIm * (ZsIm + ZshIm));
	const numIm = (ZshRe * (ZsIm + ZshIm) + ZshIm * (ZsRe + ZshRe));

	// Denominator: Z_s + 2·Z_sh
	const denRe = ZsRe + 2 * ZshRe;
	const denIm = ZsIm + 2 * ZshIm;
	const denMag2 = denRe * denRe + denIm * denIm;

	if (denMag2 < 1e-30) {
		return [ZsRe, ZsIm]; // fallback: no shunt loading
	}

	return [
		(numRe * denRe + numIm * denIm) / denMag2,
		(numIm * denRe - numRe * denIm) / denMag2,
	];
}
