/**
 * Multi-port impedance extraction from PEEC data.
 *
 * Given the inductance matrix L, resistance vector R, and port-to-filament
 * path assignments, computes the multi-port Z and S matrices.
 *
 * For a device with N_ports independent ports, each port excites a current
 * through a specific path of filaments. The Z-matrix is:
 *   Z[i][j] = sum over all filaments in path_i and path_j of
 *             sign_i[k] * sign_j[m] * (R[k]*delta(k,m) + jω*L[k][m])
 */

type Cx = [number, number];

export interface PortPath {
	/** Port name */
	name: string;
	/** Indices into the filament array, with sign (+1 or -1 for current direction) */
	filamentIndices: number[];
	filamentSigns: number[];
}

/**
 * Compute multi-port Z-matrix from PEEC data.
 *
 * @param L - inductance matrix (nFil × nFil)
 * @param Rdc - DC resistance per filament
 * @param Rf - frequency-dependent resistance per filament
 * @param omega - angular frequency
 * @param paths - port-to-filament path assignments
 * @returns Z-matrix (nPorts × nPorts) as complex numbers
 */
export function computeMultiPortZ(
	L: Float64Array[],
	Rf: number[],
	omega: number,
	paths: PortPath[],
): Cx[][] {
	const nPorts = paths.length;
	const Z: Cx[][] = [];

	for (let i = 0; i < nPorts; i++) {
		Z[i] = [];
		for (let j = 0; j < nPorts; j++) {
			let Zre = 0, Zim = 0;

			const pi = paths[i], pj = paths[j];

			for (let ki = 0; ki < pi.filamentIndices.length; ki++) {
				const fi = pi.filamentIndices[ki];
				const si = pi.filamentSigns[ki];

				for (let kj = 0; kj < pj.filamentIndices.length; kj++) {
					const fj = pj.filamentIndices[kj];
					const sj = pj.filamentSigns[kj];
					const sign = si * sj;

					// Mutual inductance contribution
					Zim += sign * omega * L[fi][fj];

					// Resistance contribution (only on diagonal: same filament in both paths)
					if (fi === fj) {
						Zre += sign * Rf[fi];
					}
				}
			}

			Z[i][j] = [Zre, Zim];
		}
	}

	return Z;
}

/**
 * Convert multi-port Z-matrix to S-matrix.
 * S = (Z - Z0·I) · (Z + Z0·I)^-1
 * For 1-port: S11 = (Z11 - Z0) / (Z11 + Z0)
 * For 2-port: uses the standard conversion formula.
 */
export function zToS(Z: Cx[][], z0: number): Cx[][] {
	const n = Z.length;

	if (n === 1) {
		const [zr, zi] = Z[0][0];
		const dr = zr + z0, di = zi;
		const dm2 = dr * dr + di * di;
		return [[[(zr - z0) * dr / dm2 + zi * di / dm2, (zi * dr - (zr - z0) * di) / dm2]]]; // wrong
	}

	// General: S = (Z/Z0 - I) · (Z/Z0 + I)^-1
	// Normalize Z by Z0
	const Zn: Cx[][] = Z.map(row => row.map(([r, i]) => [r / z0, i / z0] as Cx));

	// A = Zn + I, B = Zn - I
	const A: Cx[][] = Zn.map((row, i) => row.map(([r, im], j) => [r + (i === j ? 1 : 0), im] as Cx));
	const B: Cx[][] = Zn.map((row, i) => row.map(([r, im], j) => [r - (i === j ? 1 : 0), im] as Cx));

	// S = B · A^-1
	const Ainv = cxMatInverse(A);
	if (!Ainv) return Z.map(row => row.map(() => [0, 0] as Cx));

	return cxMatMul(B, Ainv);
}

/**
 * Extract per-port quantities from Z-matrix.
 */
export interface PortResult {
	name: string;
	L: number;      // effective inductance from Z[i][i]
	R: number;      // resistance from Z[i][i]
	Q: number;      // quality factor
}

export function extractPortResults(Z: Cx[][], omega: number, paths: PortPath[]): PortResult[] {
	return paths.map((p, i) => {
		const [Zre, Zim] = Z[i][i];
		return {
			name: p.name,
			L: omega > 0 ? Zim / omega : 0,
			R: Zre,
			Q: Zre > 0 ? Zim / Zre : 0,
		};
	});
}

/**
 * For a transformer, extract coupling coefficient k from Z-matrix.
 * k = |M| / sqrt(L1 * L2) where M = Im(Z12) / omega
 */
export function extractCoupling(Z: Cx[][], omega: number): number {
	if (Z.length < 2 || omega <= 0) return 0;
	const L1 = Z[0][0][1] / omega;
	const L2 = Z[1][1][1] / omega;
	const M = Z[0][1][1] / omega;
	if (L1 <= 0 || L2 <= 0) return 0;
	return Math.abs(M) / Math.sqrt(L1 * L2);
}

// --- Complex matrix utilities ---

function cxMul(a: Cx, b: Cx): Cx {
	return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

function cxAdd(a: Cx, b: Cx): Cx {
	return [a[0] + b[0], a[1] + b[1]];
}

function cxSub(a: Cx, b: Cx): Cx {
	return [a[0] - b[0], a[1] - b[1]];
}

function cxDiv(a: Cx, b: Cx): Cx {
	const d = b[0] * b[0] + b[1] * b[1];
	if (d < 1e-40) return [0, 0];
	return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

function cxMatMul(A: Cx[][], B: Cx[][]): Cx[][] {
	const n = A.length, m = B[0].length, p = B.length;
	const C: Cx[][] = Array.from({ length: n }, () => Array.from({ length: m }, () => [0, 0] as Cx));
	for (let i = 0; i < n; i++)
		for (let j = 0; j < m; j++)
			for (let k = 0; k < p; k++)
				C[i][j] = cxAdd(C[i][j], cxMul(A[i][k], B[k][j]));
	return C;
}

/** Complex matrix inverse via Gauss-Jordan elimination */
function cxMatInverse(M: Cx[][]): Cx[][] | null {
	const n = M.length;
	// Augment [M | I]
	const aug: Cx[][] = M.map((row, i) => [
		...row.map(v => [...v] as Cx),
		...Array.from({ length: n }, (_, j) => (i === j ? [1, 0] : [0, 0]) as Cx),
	]);

	for (let col = 0; col < n; col++) {
		// Find pivot
		let maxMag = 0, pivotRow = col;
		for (let row = col; row < n; row++) {
			const mag = aug[row][col][0] ** 2 + aug[row][col][1] ** 2;
			if (mag > maxMag) { maxMag = mag; pivotRow = row; }
		}
		if (maxMag < 1e-30) return null; // singular

		// Swap rows
		if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

		// Scale pivot row
		const pivot = aug[col][col];
		for (let j = 0; j < 2 * n; j++) aug[col][j] = cxDiv(aug[col][j], pivot);

		// Eliminate column
		for (let row = 0; row < n; row++) {
			if (row === col) continue;
			const factor = aug[row][col];
			for (let j = 0; j < 2 * n; j++) aug[row][j] = cxSub(aug[row][j], cxMul(factor, aug[col][j]));
		}
	}

	// Extract inverse from right half
	return aug.map(row => row.slice(n));
}
