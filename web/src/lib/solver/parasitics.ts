/**
 * Pi-model parasitic element computation for RFIC inductors.
 *
 * Reference: Yue & Wong, "On-Chip Spiral Inductors with Patterned
 * Ground Shields for Si-Based RF ICs", IEEE JSSC, 1998.
 */

import type { ProcessStack } from '$lib/stack/types';
import type { Filament } from './inductance';

const EPS0 = 8.854e-12; // F/m

/** Lumped parasitic elements for the pi-model */
export interface PiModelParasitics {
	Cox: number;   // oxide capacitance (F)
	Csub: number;  // substrate capacitance (F)
	Rsub: number;  // substrate resistance (Ω)
	Cs: number;    // interwinding series capacitance (F)
}

/**
 * Compute pi-model parasitic elements from geometry and stack.
 */
export function computeParasitics(
	filaments: Filament[],
	stack: ProcessStack,
	conductorSpacing: number,
	hasPgs: boolean,
): PiModelParasitics {
	let totalArea = 0;
	let totalLength = 0;

	for (const fil of filaments) {
		totalArea += fil.length * fil.width;
		totalLength += fil.length;
	}

	const topMetalZ = filaments.length > 0 ? filaments[0].z0 : 303e-6;
	const substrateTop = stack.substrateThickness * 1e-6;
	const toxEff = Math.abs(topMetalZ - substrateTop);

	const pgsZ = substrateTop + 0.2e-6;
	const toxPgs = Math.abs(topMetalZ - pgsZ);
	const tox = hasPgs ? toxPgs : toxEff;

	const epsOx = EPS0 * stack.oxideEr;
	const Cox = epsOx * totalArea / Math.max(tox, 1e-9);

	const epsSub = EPS0 * (stack.substrateEr ?? 11.7);
	const tsubEff = (stack.substrateThickness * 1e-6) / 2;

	let Csub: number;
	let Rsub: number;

	if (hasPgs) {
		Csub = epsSub * totalArea / (0.2e-6);
		Rsub = 0.1;
	} else {
		Csub = epsSub * totalArea / Math.max(tsubEff, 1e-9);
		const rhoSub = stack.substrateRho * 1e-2;
		Rsub = rhoSub * tsubEff / Math.max(totalArea, 1e-18);
	}

	const metalThickness = filaments.length > 0 ? filaments[0].height : 1e-6;
	const spacing = Math.max(conductorSpacing, 1e-9);
	const overlapLength = totalLength * 0.8;
	const Cs = epsOx * overlapLength * metalThickness / spacing;

	return { Cox, Csub, Rsub, Cs };
}

/** Complex number multiply: (a+jb)(c+jd) */
function cxMul(ar: number, ai: number, br: number, bi: number): [number, number] {
	return [ar * br - ai * bi, ar * bi + ai * br];
}

/** Complex number add */
function cxAdd(ar: number, ai: number, br: number, bi: number): [number, number] {
	return [ar + br, ai + bi];
}

/** Complex number divide: (a+jb)/(c+jd) */
function cxDiv(ar: number, ai: number, br: number, bi: number): [number, number] {
	const d = br * br + bi * bi;
	if (d < 1e-40) return [0, 0];
	return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d];
}

/**
 * Apply pi-model parasitics and compute 2-port S-parameters directly.
 *
 * Circuit: pi-network with Z_series and two shunt Y_sh arms,
 * plus Cs shunting across the series branch.
 *
 * Returns 2-port S-parameters [S11, S21] as complex pairs.
 */
export function applyPiModelSparams(
	Zre: number, Zim: number,
	omega: number,
	parasitics: PiModelParasitics,
	z0: number,
): { S11: [number, number]; S21: [number, number]; Zeff: [number, number] } {
	const { Cox, Csub, Rsub, Cs } = parasitics;

	if (omega <= 0) {
		// DC: pure resistance, no parasitics
		const S11: [number, number] = [(Zre) / (Zre + 2 * z0), 0];
		const S21: [number, number] = [(2 * z0) / (Zre + 2 * z0), 0];
		return { S11, S21, Zeff: [Zre, 0] };
	}

	// Shunt admittance per side: Y_sh = Y_cox · Y_sub / (Y_cox + Y_sub)
	// where Y_cox = jω·Cox/2, Y_sub = 1/(2Rsub) + jω·Csub/2
	const YcoxIm = omega * Cox / 2;
	const YsubRe = 1 / (2 * Rsub);
	const YsubIm = omega * Csub / 2;

	// Y_sh = Y_cox · Y_sub / (Y_cox + Y_sub)
	// Numerator: Y_cox · Y_sub (Y_cox is pure imaginary)
	const [YshNumRe, YshNumIm] = cxMul(0, YcoxIm, YsubRe, YsubIm);
	// Denominator: Y_cox + Y_sub
	const YshDenRe = YsubRe;
	const YshDenIm = YcoxIm + YsubIm;
	const [YshRe, YshIm] = cxDiv(YshNumRe, YshNumIm, YshDenRe, YshDenIm);

	// Series impedance (from PEEC) in parallel with Cs:
	// Z_s_eff = Z_s || (1/jωCs)  if Cs > 0
	let ZsRe = Zre, ZsIm = Zim;
	if (Cs > 0 && omega > 0) {
		const ZcsIm = -1 / (omega * Cs);
		// Parallel: Z_s || Z_cs
		const [numR, numI] = cxMul(ZsRe, ZsIm, 0, ZcsIm);
		const [denR, denI] = cxAdd(ZsRe, ZsIm, 0, ZcsIm);
		[ZsRe, ZsIm] = cxDiv(numR, numI, denR, denI);
	}

	// ABCD matrix of pi-network:
	// A = 1 + Z_s · Y_sh
	// B = Z_s
	// C = 2·Y_sh + Z_s · Y_sh²
	// D = A (symmetric)
	const [ZYRe, ZYIm] = cxMul(ZsRe, ZsIm, YshRe, YshIm); // Z_s · Y_sh
	const ARe = 1 + ZYRe, AIm = ZYIm;
	const BRe = ZsRe, BIm = ZsIm;
	const [Ysh2Re, Ysh2Im] = cxMul(YshRe, YshIm, YshRe, YshIm); // Y_sh²
	const [ZY2Re, ZY2Im] = cxMul(ZsRe, ZsIm, Ysh2Re, Ysh2Im); // Z_s · Y_sh²
	const CRe = 2 * YshRe + ZY2Re;
	const CIm = 2 * YshIm + ZY2Im;

	// S-parameters from ABCD:
	// Δ = A + B/Z0 + C·Z0 + D  (D = A for symmetric)
	// S11 = (A + B/Z0 - C·Z0 - D) / Δ = (B/Z0 - C·Z0) / Δ
	// S21 = 2 / Δ
	const dRe = 2 * ARe + BRe / z0 + CRe * z0;
	const dIm = 2 * AIm + BIm / z0 + CIm * z0;

	const s11NumRe = BRe / z0 - CRe * z0;
	const s11NumIm = BIm / z0 - CIm * z0;

	const S11 = cxDiv(s11NumRe, s11NumIm, dRe, dIm);
	const S21 = cxDiv(2, 0, dRe, dIm);

	// Effective impedance for L/Q extraction: Z_eff = B/D = Z_s / (1 + Z_s·Y_sh)
	const Zeff = cxDiv(BRe, BIm, ARe, AIm);

	return { S11, S21, Zeff };
}
