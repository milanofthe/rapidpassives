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

/**
 * Patterned ground shield, Manhattan (90-degree-only) fishbone variant.
 *
 * A central vertical spine carries horizontal fingers on both sides. The
 * topology is a tree (no closed conductive loops), so induced eddy currents
 * are still broken, while every corner is a right angle. This avoids the
 * acute (45-degree) and degenerate intersections of the old radial pattern
 * that failed foundry DRC (e.g. IHP SG13G2 / SG13CMOS5L).
 */
export function pgs4(D: number, w: number, s: number): Polygon[] {
	const R = D / 2;
	const pitch = w + s;

	const sections: Polygon[] = [];

	// Central vertical spine, kept inside the radius R
	const ySpine = Math.sqrt(Math.max(R * R - (w / 2) ** 2, 0));
	sections.push({ x: [-w / 2, -w / 2, w / 2, w / 2], y: [-ySpine, ySpine, ySpine, -ySpine] });

	// Horizontal fingers, centered on multiples of the pitch, length clipped to R
	const kMax = Math.floor((R - w / 2) / pitch);
	for (let k = -kMax; k <= kMax; k++) {
		const yc = k * pitch;
		const yb = yc - w / 2, yt = yc + w / 2;
		const yLim = Math.max(Math.abs(yb), Math.abs(yt));
		const xMax = Math.sqrt(Math.max(R * R - yLim * yLim, 0));
		if (xMax <= w / 2) continue;
		sections.push({ x: [-xMax, -xMax, xMax, xMax], y: [yb, yt, yt, yb] });
	}

	return sections;
}

/** Rectangular guard ring bars (4 non-overlapping bars forming a closed ring). */
function guardRingBars(bboxW: number, bboxH: number, margin: number, ringWidth: number): Polygon[] {
	const innerW = bboxW / 2 + margin;
	const innerH = bboxH / 2 + margin;
	const outerW = innerW + ringWidth;
	const outerH = innerH + ringWidth;

	return [
		// Top bar (full width)
		{ x: [-outerW, outerW, outerW, -outerW], y: [innerH, innerH, outerH, outerH] },
		// Bottom bar (full width)
		{ x: [-outerW, outerW, outerW, -outerW], y: [-outerH, -outerH, -innerH, -innerH] },
		// Left bar (between top and bottom bars, no corner overlap)
		{ x: [-outerW, -innerW, -innerW, -outerW], y: [-innerH, -innerH, innerH, innerH] },
		// Right bar (between top and bottom bars, no corner overlap)
		{ x: [innerW, outerW, outerW, innerW], y: [-innerH, -innerH, innerH, innerH] },
	];
}

/**
 * Guard ring on specified metal layers, stitched with vias.
 * Returns a LayerMap — add AFTER mergeLayers to avoid union with winding geometry.
 * @param metalLayers - metal layer names bottom to top
 * @param viaLayers - via layer names between adjacent metals (length = metalLayers.length - 1)
 */
export function guardRing(
	bboxW: number, bboxH: number, margin: number, ringWidth: number,
	viaSpacing: number, viaWidth: number, viaInMetal: number,
	metalLayers: import('./types').LayerName[],
	viaLayers: import('./types').LayerName[],
): Partial<Record<import('./types').LayerName, Polygon[]>> {
	const bars = guardRingBars(bboxW, bboxH, margin, ringWidth);
	const result: Partial<Record<import('./types').LayerName, Polygon[]>> = {};

	for (const ml of metalLayers) {
		result[ml] = [...bars];
	}

	// Via stitching between adjacent metals
	const innerW = bboxW / 2 + margin;
	const innerH = bboxH / 2 + margin;
	const outerW = innerW + ringWidth;
	const outerH = innerH + ringWidth;
	const barW = ringWidth - 2 * viaInMetal;

	if (barW > viaWidth) {
		for (let i = 0; i < viaLayers.length && i < metalLayers.length - 1; i++) {
			let viaPolys: Polygon[] = [];
			const topCy = (innerH + outerH) / 2;
			const hLen = 2 * outerW - 2 * viaInMetal;
			if (hLen > 0) {
				viaPolys = viaPolys.concat(viaGrid(0, topCy, hLen, barW, viaSpacing, viaWidth));
				viaPolys = viaPolys.concat(viaGrid(0, -topCy, hLen, barW, viaSpacing, viaWidth));
			}
			const sideCx = (innerW + outerW) / 2;
			const vLen = 2 * innerH - 2 * viaInMetal;
			if (vLen > 0) {
				viaPolys = viaPolys.concat(viaGrid(-sideCx, 0, barW, vLen, viaSpacing, viaWidth));
				viaPolys = viaPolys.concat(viaGrid(sideCx, 0, barW, vLen, viaSpacing, viaWidth));
			}
			result[viaLayers[i]] = viaPolys;
		}
	}

	return result;
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
