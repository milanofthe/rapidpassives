/**
 * Multi-port impedance extraction and complex matrix utilities.
 */

export type Cx = [number, number];

// --- Complex arithmetic ---

export function cxMul(a: Cx, b: Cx): Cx {
	return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

export function cxAdd(a: Cx, b: Cx): Cx {
	return [a[0] + b[0], a[1] + b[1]];
}

export function cxSub(a: Cx, b: Cx): Cx {
	return [a[0] - b[0], a[1] - b[1]];
}

export function cxDiv(a: Cx, b: Cx): Cx {
	const d = b[0] * b[0] + b[1] * b[1];
	if (d < 1e-40) return [0, 0];
	return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

// --- Complex matrix operations ---

export function cxMatMul(A: Cx[][], B: Cx[][]): Cx[][] {
	const n = A.length, m = B[0].length, p = B.length;
	const C: Cx[][] = Array.from({ length: n }, () => Array.from({ length: m }, () => [0, 0] as Cx));
	for (let i = 0; i < n; i++)
		for (let j = 0; j < m; j++)
			for (let k = 0; k < p; k++)
				C[i][j] = cxAdd(C[i][j], cxMul(A[i][k], B[k][j]));
	return C;
}

/**
 * Solve A·X = B for X using Gauss-Jordan elimination with partial pivoting.
 * A is n×n, B is n×m. Returns X (n×m), or null if singular.
 */
export function cxMatSolve(A: Cx[][], B: Cx[][]): Cx[][] | null {
	const n = A.length;
	const m = B[0].length;

	// Augment [A | B]
	const aug: Cx[][] = A.map((row, i) => [
		...row.map(v => [...v] as Cx),
		...B[i].map(v => [...v] as Cx),
	]);

	for (let col = 0; col < n; col++) {
		// Partial pivoting
		let maxMag = 0, pivotRow = col;
		for (let row = col; row < n; row++) {
			const mag = aug[row][col][0] ** 2 + aug[row][col][1] ** 2;
			if (mag > maxMag) { maxMag = mag; pivotRow = row; }
		}
		if (maxMag < 1e-30) return null;

		if (pivotRow !== col) [aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];

		const pivot = aug[col][col];
		for (let j = 0; j < n + m; j++) aug[col][j] = cxDiv(aug[col][j], pivot);

		for (let row = 0; row < n; row++) {
			if (row === col) continue;
			const factor = aug[row][col];
			for (let j = 0; j < n + m; j++)
				aug[row][j] = cxSub(aug[row][j], cxMul(factor, aug[col][j]));
		}
	}

	return aug.map(row => row.slice(n));
}

/** Complex matrix inverse via solve with identity RHS */
export function cxMatInverse(M: Cx[][]): Cx[][] | null {
	const n = M.length;
	const I: Cx[][] = Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? [1, 0] : [0, 0]) as Cx)
	);
	return cxMatSolve(M, I);
}

// --- Z-matrix to S-matrix conversion ---

/**
 * Convert multi-port Z-matrix to S-matrix.
 * S = (Z/Z0 - I) · (Z/Z0 + I)^-1
 */
export function zToS(Z: Cx[][], z0: number): Cx[][] {
	const n = Z.length;
	const Zn: Cx[][] = Z.map(row => row.map(([r, i]) => [r / z0, i / z0] as Cx));
	const A: Cx[][] = Zn.map((row, i) => row.map(([r, im], j) => [r + (i === j ? 1 : 0), im] as Cx));
	const B: Cx[][] = Zn.map((row, i) => row.map(([r, im], j) => [r - (i === j ? 1 : 0), im] as Cx));
	const Ainv = cxMatInverse(A);
	if (!Ainv) return Z.map(row => row.map(() => [0, 0] as Cx));
	return cxMatMul(B, Ainv);
}

// --- Per-port extraction ---

export interface PortFreqResult {
	name: string;
	L: number;
	R: number;
	Q: number;
}

export function extractPortResults(Z: Cx[][], omega: number, portNames: string[]): PortFreqResult[] {
	return portNames.map((name, i) => {
		const [Zre, Zim] = i < Z.length ? Z[i][i] : [0, 0];
		return {
			name,
			L: omega > 0 ? Zim / omega : 0,
			R: Zre,
			Q: Zre > 0 ? Zim / Zre : 0,
		};
	});
}

export function extractCoupling(Z: Cx[][], omega: number): number {
	if (Z.length < 2 || omega <= 0) return 0;
	const L1 = Z[0][0][1] / omega;
	const L2 = Z[1][1][1] / omega;
	const M = Z[0][1][1] / omega;
	if (L1 <= 0 || L2 <= 0) return 0;
	return Math.abs(M) / Math.sqrt(L1 * L2);
}
