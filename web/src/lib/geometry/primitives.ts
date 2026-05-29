/**
 * Small, pure geometry primitives shared across the generators. These are
 * literal extractions of patterns that previously appeared inline in several
 * generators — they must not change the produced geometry.
 */

import type { Polygon } from './types';

/** Axis-aligned rectangle centered at (cx, cy), counter-clockwise. */
export function rect(cx: number, cy: number, w: number, h: number): Polygon {
	return {
		x: [cx - w / 2, cx - w / 2, cx + w / 2, cx + w / 2],
		y: [cy - h / 2, cy + h / 2, cy + h / 2, cy - h / 2],
	};
}

/** Mirror across the y-axis (x → -x). Holes are mirrored too. */
export function mirrorX(p: Polygon): Polygon {
	return {
		x: p.x.map(v => -v),
		y: [...p.y],
		...(p.holes ? { holes: p.holes.map(h => ({ x: h.x.map(v => -v), y: [...h.y] })) } : {}),
	};
}

/** Mirror across the x-axis (y → -y). Holes are mirrored too. */
export function mirrorY(p: Polygon): Polygon {
	return {
		x: [...p.x],
		y: p.y.map(v => -v),
		...(p.holes ? { holes: p.holes.map(h => ({ x: [...h.x], y: h.y.map(v => -v) })) } : {}),
	};
}

/** Apply a function to every y coordinate (outer ring + holes). */
export function mapY(p: Polygon, f: (y: number) => number): Polygon {
	return {
		x: [...p.x],
		y: p.y.map(f),
		...(p.holes ? { holes: p.holes.map(h => ({ x: [...h.x], y: h.y.map(f) })) } : {}),
	};
}

/**
 * Aspect-ratio helper. Returns a function that pushes positive-y points up and
 * negative-y points down by ext/2, leaving the centerline (y=0) fixed — i.e.
 * stretches the straight sides without distorting the arcs. Identity when ar=1.
 *
 *   const shiftY = makeAspectShiftY(Dout, aspectRatio);
 */
export function makeAspectShiftY(Dout: number, aspectRatio: number = 1): (y: number) => number {
	if (aspectRatio === 1) return (y: number) => y;
	const ext = Dout * (aspectRatio - 1);
	return (y: number) => (y > 0 ? y + ext / 2 : y < 0 ? y - ext / 2 : y);
}

/**
 * Half-octagon vertex angles (radians) for the symmetric inductor/transformer
 * family: a left set centered on +x-axis-mirrored and a right set. Matches the
 * `t = (i+0.5)*2/sides` formula used across those generators.
 */
export function symmetricHalfAngles(sides: number): { left: number[]; right: number[] } {
	const nHalf = sides / 2;
	const left: number[] = [];
	const right: number[] = [];
	for (let i = 0; i < nHalf; i++) {
		const t = (i + 0.5) * 2 / sides;
		left.push(Math.PI * (0.5 + t));
		right.push(Math.PI * (-0.5 + t));
	}
	return { left, right };
}
