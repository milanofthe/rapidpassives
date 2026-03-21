/**
 * Mutual and self inductance of rectangular conductor bars.
 *
 * Based on:
 * - C. Hoer and C. Love, "Exact Inductance Equations for Rectangular
 *   Conductors With Applications to More Complicated Geometries",
 *   Journal of the National Bureau of Standards-C, Vol. 69C, No. 2,
 *   pp. 127-137, 1965.
 *
 * - A.E. Ruehli, "Inductance Calculations in a Complex Integrated
 *   Circuit Environment", IBM J. Res. Dev., 1972.
 */

const MU0 = 4 * Math.PI * 1e-7;       // H/m
const MU_OVER_4PI = 1e-7;             // H/m
const EPS = 1e-13;

/** A filament (rectangular conductor bar) for inductance computation */
export interface Filament {
	/** Start point [x, y, z] in meters */
	x0: number; y0: number; z0: number;
	/** End point [x, y, z] in meters */
	x1: number; y1: number; z1: number;
	/** Cross-section width in meters (perpendicular to length, in-plane) */
	width: number;
	/** Cross-section height/thickness in meters (perpendicular to length, out-of-plane) */
	height: number;
	/** Length (computed) */
	length: number;
}

/**
 * Self-inductance of a rectangular bar conductor.
 * Hoer-Love formula for L_self = f(W, L, T)
 *
 * @param W - width (m)
 * @param L - length (m)
 * @param T - thickness/height (m)
 * @returns self-inductance in Henries
 */
export function selfInductance(W: number, L: number, T: number): number {
	const w = W / L;
	const t = T / L;
	const r = Math.sqrt(w * w + t * t);
	const aw = Math.sqrt(w * w + 1);
	const at = Math.sqrt(t * t + 1);
	const ar = Math.sqrt(w * w + t * t + 1);

	let z = 0.25 * ((1 / w) * asinh(w / at) + (1 / t) * asinh(t / aw) + asinh(1 / r));

	z += (1 / 24) * (
		(t * t / w) * asinh(w / (t * at * (r + ar))) +
		(w * w / t) * asinh(t / (w * aw * (r + ar))) +
		(t * t / (w * w)) * asinh(w * w / (t * r * (at + ar))) +
		(w * w / (t * t)) * asinh(t * t / (w * r * (aw + ar))) +
		(1 / (w * t * t)) * asinh(w * t * t / (at * (aw + ar))) +
		(1 / (t * w * w)) * asinh(t * w * w / (aw * (at + ar)))
	);

	z -= (1 / 6) * (
		(1 / (w * t)) * Math.atan(w * t / ar) +
		(t / w) * Math.atan(w / (t * ar)) +
		(w / t) * Math.atan(t / (w * ar))
	);

	z -= (1 / 60) * (
		((ar + r + t + at) * t * t) / ((ar + r) * (r + t) * (t + at) * (at + ar)) +
		((ar + r + w + aw) * w * w) / ((ar + r) * (r + w) * (w + aw) * (aw + ar)) +
		(ar + aw + 1 + at) / ((ar + aw) * (aw + 1) * (1 + at) * (at + ar))
	);

	z -= (1 / 20) * (1 / (r + ar) + 1 / (aw + ar) + 1 / (at + ar));

	z *= (2 / Math.PI);
	z *= L;

	return MU0 * z;  // FastHenry uses MU0, not MU_OVER_4PI
}

/**
 * Hoer-Love 6D antiderivative kernel.
 * This is the inner function evaluated at 64 points (4×4×4 grid).
 */
function evalEq(x: number, y: number, z: number): number {
	const xsq = x * x;
	const ysq = y * y;
	const zsq = z * z;
	const len = Math.sqrt(xsq + ysq + zsq);

	if (len < EPS) return 0;

	let result = (1 / 60) * len * (xsq * (xsq - 3 * ysq) + ysq * (ysq - 3 * zsq) + zsq * (zsq - 3 * xsq));

	// Log terms
	const ref = Math.abs(x) + Math.abs(y) + Math.abs(z);
	if (ref < EPS) return result;

	if (xsq / (ref * ref) > EPS * EPS && (ysq + zsq) > EPS * EPS * ref * ref) {
		result += (1 / 24) * (6 * zsq - ysq) * ysq * x * Math.log((x + len) / Math.sqrt(ysq + zsq));
	}
	if (ysq / (ref * ref) > EPS * EPS && (xsq + zsq) > EPS * EPS * ref * ref) {
		result += (1 / 24) * (6 * xsq - zsq) * zsq * y * Math.log((y + len) / Math.sqrt(xsq + zsq));
	}
	if (zsq / (ref * ref) > EPS * EPS && (xsq + ysq) > EPS * EPS * ref * ref) {
		result += (1 / 24) * (6 * ysq - xsq) * xsq * z * Math.log((z + len) / Math.sqrt(xsq + ysq));
	}

	// Atan terms
	if (Math.abs(x) > EPS * ref && Math.abs(y) > EPS * ref && Math.abs(z) > EPS * ref) {
		result -= (1 / 6) * (
			x * y * z * zsq * Math.atan(x * y / (z * len)) +
			x * z * y * ysq * Math.atan(x * z / (y * len)) +
			z * y * x * xsq * Math.atan(z * y / (x * len))
		);
	}

	return result;
}

/**
 * Mutual inductance between two parallel rectangular bars (brick-to-brick).
 * Uses the Hoer-Love closed-form with 4×4×4 = 64 evaluations of evalEq.
 *
 * Parameters define the relative geometry in a local coordinate system
 * where filament j's length is along z-axis:
 *
 * @param E - x-offset between bar centers
 * @param a - width of bar j
 * @param d - width of bar m
 * @param P - y-offset between bar centers
 * @param b - height of bar j
 * @param c - height of bar m
 * @param l3 - z-offset of bar m start relative to bar j start
 * @param l1 - length of bar j
 * @param l2 - length of bar m
 * @returns mutual inductance in Henries
 */
export function brickToBrick(
	E: number, a: number, d: number,
	P: number, b: number, c: number,
	l3: number, l1: number, l2: number
): number {
	// fill_4 from FastHenry: vec = [E-a, E+d-a, E+d, E]
	const q = [E - a, E + d - a, E + d, E];
	const r = [P - b, P + c - b, P + c, P];
	const s = [l3 - l1, l3 + l2 - l1, l3 + l2, l3];

	let totalM = 0;
	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 4; j++) {
			for (let k = 0; k < 4; k++) {
				const sign = ((i + j + k) % 2 === 0) ? 1 : -1;
				totalM += sign * evalEq(q[i], r[j], s[k]);
			}
		}
	}

	return MU_OVER_4PI * totalM / (a * b * c * d);
}

/**
 * Compute mutual inductance between two filaments at arbitrary angles.
 * Uses the Grover/Neumann formula (from FastHenry's mutualfil).
 *
 * Returns 0 for perpendicular filaments.
 * For parallel filaments, falls back to the Hoer-Love brick-to-brick formula.
 */
export function mutualInductance(fi: Filament, fj: Filament): number {
	const li = fi.length, lj = fj.length;
	if (li < EPS || lj < EPS) return 0;

	// Endpoint distances squared
	const R1sq = sq(fi.x1 - fj.x1) + sq(fi.y1 - fj.y1) + sq(fi.z1 - fj.z1);
	const R2sq = sq(fi.x1 - fj.x0) + sq(fi.y1 - fj.y0) + sq(fi.z1 - fj.z0);
	const R3sq = sq(fi.x0 - fj.x0) + sq(fi.y0 - fj.y0) + sq(fi.z0 - fj.z0);
	const R4sq = sq(fi.x0 - fj.x1) + sq(fi.y0 - fj.y1) + sq(fi.z0 - fj.z1);
	const R1 = Math.sqrt(R1sq), R2 = Math.sqrt(R2sq);
	const R3 = Math.sqrt(R3sq), R4 = Math.sqrt(R4sq);

	// Dot product of direction vectors (not normalized by lengths)
	const dotp = (fi.x1 - fi.x0) * (fj.x1 - fj.x0)
		+ (fi.y1 - fi.y0) * (fj.y1 - fj.y0)
		+ (fi.z1 - fi.z0) * (fj.z1 - fj.z0);
	const cose = dotp / (li * lj);

	// Perpendicular filaments: M = 0
	if (Math.abs(cose) < EPS) return 0;

	// Touching endpoints
	if (R1 < EPS || R2 < EPS || R3 < EPS || R4 < EPS) {
		let R: number;
		if (R1 < EPS) R = R3; else if (R2 < EPS) R = R4;
		else if (R3 < EPS) R = R1; else R = R2;
		return MU_OVER_4PI * 2 * cose * (li * atanh(lj / (li + R)) + lj * atanh(li / (lj + R)));
	}

	// Parallel filaments — use Hoer-Love brick-to-brick for finite cross-section
	if (Math.abs(Math.abs(cose) - 1) < 0.001) {
		const sign = cose > 0 ? 1 : -1;
		const zx = (fi.x1 - fi.x0) / li, zy = (fi.y1 - fi.y0) / li, zz = (fi.z1 - fi.z0) / li;
		let wx: number, wy: number, wz: number;
		if (Math.abs(zz) > 0.9) { wx = 1; wy = 0; wz = 0; }
		else { wx = -zy; wy = zx; wz = 0; const wm = Math.sqrt(wx*wx+wy*wy); wx /= wm; wy /= wm; }
		const hx = zy*wz-zz*wy, hy = zz*wx-zx*wz, hz = zx*wy-zy*wx;
		const vox = wx*fi.width/2+hx*fi.height/2, voy = wy*fi.width/2+hy*fi.height/2, voz = wz*fi.width/2+hz*fi.height/2;
		const ex = (fj.x0-fi.x0)+vox, ey = (fj.y0-fi.y0)+voy, ez = (fj.z0-fi.z0)+voz;
		const E = wx*ex+wy*ey+wz*ez - fj.width/2;
		const P = hx*ex+hy*ey+hz*ez - fj.height/2;
		const l3 = zx*ex+zy*ey+zz*ez;
		return sign * brickToBrick(E, fi.width, fj.width, P, fi.height, fj.height, l3, li, lj);
	}

	// Arbitrary angle — Grover formula (from FastHenry mutualfil)
	const l2 = li * li, m2 = lj * lj;
	const alpha = R4sq - R3sq + R2sq - R1sq;
	const alpha2 = alpha * alpha;

	const u = li * (2 * m2 * (R2sq - R3sq - l2) + alpha * (R4sq - R3sq - m2)) / (4 * l2 * m2 - alpha2);
	const v = lj * (2 * l2 * (R4sq - R3sq - m2) + alpha * (R2sq - R3sq - l2)) / (4 * l2 * m2 - alpha2);

	let d2 = R3sq - u * u - v * v + 2 * u * v * cose;
	if (Math.abs(d2) < EPS * (R3sq + u * u + v * v + 1)) d2 = 0;
	if (d2 < 0) d2 = 0;
	const d = Math.sqrt(d2);

	const sinsq = 1 - cose * cose;
	const sine = Math.sqrt(Math.max(0, sinsq));

	let omega = 0;
	if (d > EPS) {
		const dc = d * d * cose;
		const ds = d * sine;
		const ss = sinsq;
		omega = Math.atan2(dc + (u + li) * (v + lj) * ss, ds * R1)
			- Math.atan2(dc + (u + li) * v * ss, ds * R2)
			+ Math.atan2(dc + u * v * ss, ds * R3)
			- Math.atan2(dc + u * (v + lj) * ss, ds * R4);
	}

	const tmp4 = (u + li) * atanh(lj / (R1 + R2))
		+ (v + lj) * atanh(li / (R1 + R4))
		- u * atanh(lj / (R3 + R4))
		- v * atanh(li / (R2 + R3));

	const tmp5 = sine > 1e-150 ? omega * d / sine : 0;

	return MU_OVER_4PI * cose * (2 * tmp4 - tmp5);
}

function sq(x: number): number { return x * x; }

/** asinh for portability */
function asinh(x: number): number {
	return Math.log(x + Math.sqrt(x * x + 1));
}

/** atanh with clamping for numerical stability */
function atanh(x: number): number {
	if (x >= 1) return 20;   // clamp to avoid Infinity
	if (x <= -1) return -20;
	return 0.5 * Math.log((1 + x) / (1 - x));
}
