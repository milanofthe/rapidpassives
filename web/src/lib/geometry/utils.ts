import type { Polygon } from './types';

/** Generate a grid of vias at center (x0, y0) */
export function viaGrid(
	x0: number, y0: number,
	widthX: number, widthY: number,
	viaSpacing: number, viaWidth: number,
	viaMerge: boolean = false
): Polygon[] {
	if (viaMerge) {
		return [{
			x: [x0 + widthX / 2, x0 + widthX / 2, x0 - widthX / 2, x0 - widthX / 2],
			y: [y0 + widthY / 2, y0 - widthY / 2, y0 - widthY / 2, y0 + widthY / 2],
		}];
	}

	const polys: Polygon[] = [];
	const nx = Math.floor((widthX + viaSpacing) / (viaWidth + viaSpacing));
	const ny = Math.floor((widthY + viaSpacing) / (viaWidth + viaSpacing));
	const diffX = widthX - nx * viaWidth - (nx - 1) * viaSpacing;
	const diffY = widthY - ny * viaWidth - (ny - 1) * viaSpacing;

	for (let i = 0; i < nx; i++) {
		const x = i * (viaWidth + viaSpacing) - widthX / 2 + diffX / 2 + x0;
		for (let j = 0; j < ny; j++) {
			const y = j * (viaWidth + viaSpacing) - widthY / 2 + diffY / 2 + y0;
			polys.push({
				x: [x, x + viaWidth, x + viaWidth, x],
				y: [y, y, y + viaWidth, y + viaWidth],
			});
		}
	}
	return polys;
}

/** Patterned ground shield (pgs4 variant) */
export function pgs4(D: number, w: number, s: number): Polygon[] {
	const xLeft = arange(s / 2, D / 2, w + s);
	const xRight = arange(w + s / 2, D / 2, w + s);

	const yLeft = xLeft.map(xl => -xl - Math.SQRT2 / 2 * w);
	const yRight = xRight.map(xr => -xr - Math.SQRT2 / 2 * w);

	const sections: Polygon[] = [];

	for (let i = 0; i < Math.min(xLeft.length, xRight.length); i++) {
		const xl = xLeft[i], xr = xRight[i], yl = yLeft[i], yr = yRight[i];

		if (xl > D / 2 || xr > D / 2 || yl < -D / 2 || yr < -D / 2) continue;

		const xx = [xl, xl, xr, xr];
		const yy = [yl, -D / 2, -D / 2, yr];
		const xxM = [-xl, -xl, -xr, -xr];
		const yyM = [-yl, D / 2, D / 2, -yr];

		sections.push({ x: yy, y: xx });
		sections.push({ x: yyM, y: xx });
		sections.push({ x: yy, y: xxM });
		sections.push({ x: yyM, y: xxM });

		sections.push({ x: xx, y: yy });
		sections.push({ x: xxM, y: yy });
		sections.push({ x: xx, y: yyM });
		sections.push({ x: xxM, y: yyM });
	}

	// Shorts
	const sX = [D / 2, D / 2 - w / Math.SQRT2, 0, 0, w / Math.SQRT2, D / 2];
	const sY = [D / 2, D / 2, w / Math.SQRT2, 0, 0, D / 2 - w / Math.SQRT2];

	sections.push({ x: sX, y: sY });
	sections.push({ x: sX.map(v => -v), y: sY });
	sections.push({ x: sX.map(v => -v), y: sY.map(v => -v) });
	sections.push({ x: sX, y: sY.map(v => -v) });

	return sections;
}

/** 45-degree geometric routing for symmetric crossings */
export function routingGeometric45(
	w: number, s: number, x0: number, y0: number, extend: number = 0
): Polygon {
	const g = (Math.SQRT2 - 1) * s;
	const d = (Math.SQRT2 - 1) * w;
	const h = w + s + (Math.SQRT2 - 1) * (2 * s + w);

	let xUpper = [-h / 2, -h / 2 + g, h / 2 - g - d, h / 2];
	let yUpper = [-s / 2, -s / 2, s / 2 + w, s / 2 + w];
	let xLower = [-h / 2, -h / 2 + g + d, h / 2 - g, h / 2];
	let yLower = [-s / 2 - w, -s / 2 - w, s / 2, s / 2];

	if (extend > 0) {
		xUpper = [-h / 2 - extend, ...xUpper, h / 2 + extend];
		yUpper = [-s / 2, ...yUpper, s / 2 + w];
		xLower = [-h / 2 - extend, ...xLower, h / 2 + extend];
		yLower = [-s / 2 - w, ...yLower, s / 2];
	}

	return {
		x: [...xUpper, ...xLower.reverse()].map(v => v + x0),
		y: [...yUpper, ...yLower.reverse()].map(v => v + y0),
	};
}

/** numpy-like arange */
function arange(start: number, stop: number, step: number): number[] {
	const result: number[] = [];
	for (let v = start; v < stop; v += step) result.push(v);
	return result;
}
