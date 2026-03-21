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

	return MU_OVER_4PI * z;
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
	const q = [E, E + a, E + a + d, E + d];
	const r = [P, P + b, P + b + c, P + c];
	const s = [l3, l3 + l1, l3 + l1 + l2, l3 + l2];

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
 * Compute mutual inductance between two parallel filaments.
 * Transforms 3D filament geometry into Hoer-Love local coordinates.
 *
 * Both filaments must be parallel (same direction vector).
 * Returns 0 for perpendicular filaments.
 */
export function mutualInductance(fi: Filament, fj: Filament): number {
	// Direction of filament i
	const dix = fi.x1 - fi.x0;
	const diy = fi.y1 - fi.y0;
	const diz = fi.z1 - fi.z0;
	const li = fi.length;

	if (li < EPS) return 0;

	// Direction of filament j
	const djx = fj.x1 - fj.x0;
	const djy = fj.y1 - fj.y0;
	const djz = fj.z1 - fj.z0;
	const lj = fj.length;

	if (lj < EPS) return 0;

	// Check parallelism via dot product
	const dot = (dix * djx + diy * djy + diz * djz) / (li * lj);
	if (Math.abs(Math.abs(dot) - 1) > 0.01) {
		// Not parallel — use approximate formula or return 0
		// For non-parallel filaments, mutual inductance is typically small
		// and requires numerical integration. Skip for now.
		return 0;
	}

	const sign = dot > 0 ? 1 : -1;

	// Local coordinate system: z along filament i, x = width direction, y = height direction
	const zx = dix / li, zy = diy / li, zz = diz / li;

	// Width direction: perpendicular to length in the xy-plane
	let wx: number, wy: number, wz: number;
	if (Math.abs(zz) > 0.9) {
		// Filament is mostly vertical — use x as width dir
		wx = 1; wy = 0; wz = 0;
	} else {
		// Default: perpendicular in xy-plane
		wx = -zy; wy = zx; wz = 0;
		const wm = Math.sqrt(wx * wx + wy * wy);
		wx /= wm; wy /= wm;
	}

	// Height direction: cross product of length and width
	const hx = zy * wz - zz * wy;
	const hy = zz * wx - zx * wz;
	const hz = zx * wy - zy * wx;

	// Vector from fi lower-left corner to fj start
	const vox = wx * fi.width / 2 + hx * fi.height / 2;
	const voy = wy * fi.width / 2 + hy * fi.height / 2;
	const voz = wz * fi.width / 2 + hz * fi.height / 2;

	const endx = (fj.x0 - fi.x0) + vox;
	const endy = (fj.y0 - fi.y0) + voy;
	const endz = (fj.z0 - fi.z0) + voz;

	// Project into local coordinates
	const E = (wx * endx + wy * endy + wz * endz) - fj.width / 2;
	const P = (hx * endx + hy * endy + hz * endz) - fj.height / 2;
	const l3 = zx * endx + zy * endy + zz * endz;

	return sign * brickToBrick(E, fi.width, fj.width, P, fi.height, fj.height, l3, li, lj);
}

/** asinh for portability */
function asinh(x: number): number {
	return Math.log(x + Math.sqrt(x * x + 1));
}
