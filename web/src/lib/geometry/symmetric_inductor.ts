import type { Polygon, LayerMap, SymmetricInductorParams } from './types';
import { viaGrid, routingGeometric45 } from './utils';

export function buildSymmetricInductor(params: SymmetricInductorParams): LayerMap {
	const { Dout, N, sides, width, spacing, center_tap, via_extent, via_spacing, via_width, via_in_metal } = params;

	const PI = Math.PI;
	const SQRT2 = Math.SQRT2;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);

	let R1 = Dout / 2 / Math.cos(PI / sides);
	let R2 = R1 - v;

	const nHalf = sides / 2;
	const leftAngles: number[] = [];
	const rightAngles: number[] = [];
	for (let i = 0; i < nHalf; i++) {
		const t = (i + 0.5) * 2 / sides;
		leftAngles.push(PI * (0.5 + t));
		rightAngles.push(PI * (-0.5 + t));
	}

	const extend = via_extent;
	const sepTotal = width + spacing + (SQRT2 - 1) * (2 * spacing + width);

	const viaCentersTB: [number, number][] = [];
	const viaCentersTCT: [number, number][] = [];

	const polysWindings: Polygon[] = [];
	const polysCrossings: Polygon[] = [];
	const polysCenterTap: Polygon[] = [];
	let polysVias1: Polygon[] = [];
	let polysVias2: Polygon[] = [];

	for (let winding = 0; winding < N; winding++) {
		// Left section
		let xOutL: number[] = [], yOutL: number[] = [], xInL: number[] = [], yInL: number[] = [];
		for (const phi of leftAngles) {
			xOutL.push(R1 * Math.cos(phi));
			yOutL.push(R1 * Math.sin(phi));
			xInL.push(R2 * Math.cos(phi));
			yInL.push(R2 * Math.sin(phi));
		}

		if (winding === N - 1) {
			if (N % 2 === 0) {
				xOutL = [-sepTotal / 2, ...xOutL, 0];
				xInL = [-sepTotal / 2, ...xInL, 0];
			} else {
				xOutL = [0, ...xOutL, -sepTotal / 2];
				xInL = [0, ...xInL, -sepTotal / 2];
			}
		} else {
			xOutL = [-sepTotal / 2, ...xOutL, -sepTotal / 2];
			xInL = [-sepTotal / 2, ...xInL, -sepTotal / 2];
		}
		yOutL = [yOutL[0], ...yOutL, yOutL[yOutL.length - 1]];
		yInL = [yInL[0], ...yInL, yInL[yInL.length - 1]];

		polysWindings.push({ x: [...xOutL, ...[...xInL].reverse()], y: [...yOutL, ...[...yInL].reverse()] });

		// Right section
		let xOutR: number[] = [], yOutR: number[] = [], xInR: number[] = [], yInR: number[] = [];
		for (const phi of rightAngles) {
			xOutR.push(R1 * Math.cos(phi));
			yOutR.push(R1 * Math.sin(phi));
			xInR.push(R2 * Math.cos(phi));
			yInR.push(R2 * Math.sin(phi));
		}

		if (winding === N - 1) {
			if (N % 2 === 0) {
				xOutR = [0, ...xOutR, sepTotal / 2];
				xInR = [0, ...xInR, sepTotal / 2];
			} else {
				xOutR = [sepTotal / 2, ...xOutR, 0];
				xInR = [sepTotal / 2, ...xInR, 0];
			}
		} else {
			xOutR = [sepTotal / 2, ...xOutR, sepTotal / 2];
			xInR = [sepTotal / 2, ...xInR, sepTotal / 2];
		}
		yOutR = [yOutR[0], ...yOutR, yOutR[yOutR.length - 1]];
		yInR = [yInR[0], ...yInR, yInR[yInR.length - 1]];

		polysWindings.push({ x: [...xOutR, ...[...xInR].reverse()], y: [...yOutR, ...[...yInR].reverse()] });

		// Crossings
		if (winding !== N - 1) {
			let h: number;
			if (winding % 2 === 0) {
				h = R1 * Math.sin(PI * (0.5 - 1 / sides));
			} else {
				h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			}
			const x0 = 0;
			const y0 = h - width - spacing / 2;

			const crossBottom = routingGeometric45(width, spacing, x0, y0, extend);
			polysCrossings.push(crossBottom);

			const crossTop = routingGeometric45(width, spacing, x0, y0, 0);
			polysWindings.push({ x: crossTop.x.map(v => -v), y: crossTop.y });

			viaCentersTB.push([-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing]);
			viaCentersTB.push([sepTotal / 2 + width / 2, h - width / 2]);
		}

		R1 -= s;
		R2 -= s;
	}

	// Center tap
	if (center_tap) {
		const xCT = [-width / 2, -width / 2, width / 2, width / 2];
		let yCT: number[];
		let xCt1: number, yCt1: number, xCt2: number, yCt2: number;

		if (N % 2 !== 0) {
			// top
			if (N <= 2) {
				yCT = [-Dout / 2, Dout / 2 - spacing * (N - 1) - width * (N - 1),
					Dout / 2 - spacing * (N - 1) - width * (N - 1), -Dout / 2];
			} else {
				yCT = [-Dout / 2 + width - extend, Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend,
					Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend, -Dout / 2 + width - extend];
			}
			xCt1 = 0;
			yCt1 = Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend / 2;
			xCt2 = 0;
			yCt2 = -Dout / 2 + width / 2 + (width - extend) / 2;
		} else {
			// bottom
			if (N <= 2) {
				yCT = [-Dout / 2, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
					-Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2];
			} else {
				yCT = [-Dout / 2 + width - extend, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
					-Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2 + width - extend];
			}
			xCt1 = 0;
			yCt1 = -Dout / 2 + spacing * (N - 1) + width * N - width + extend / 2;
			xCt2 = 0;
			yCt2 = -Dout / 2 + width - extend / 2;
		}

		if (N <= 2) {
			polysWindings.push({ x: xCT, y: yCT });
		} else {
			polysCenterTap.push({ x: xCT, y: yCT });
			viaCentersTCT.push([xCt1, yCt1]);
			viaCentersTCT.push([xCt2, yCt2]);

			const xVP1 = [xCt1 - width / 2, xCt1 - width / 2, xCt1 + width / 2, xCt1 + width / 2];
			const yVP1 = [yCt1 - extend / 2, yCt1 + extend / 2, yCt1 + extend / 2, yCt1 - extend / 2];
			const xVP2 = [xCt2 - width / 2, xCt2 - width / 2, xCt2 + width / 2, xCt2 + width / 2];
			const yVP2 = [yCt2 - extend / 2, yCt2 + extend / 2, yCt2 + extend / 2, yCt2 - extend / 2];

			polysWindings.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP1, y: yVP1 });
			polysCenterTap.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP2, y: yVP2 });
			polysCenterTap.push({ x: xVP2, y: yVP2 });
		}
	}

	// Ports
	let xPort: number[], yPort: number[];
	if (center_tap) {
		xPort = [-sepTotal / 2, -spacing - width / 2, -spacing - width / 2,
			-spacing - 3 * width / 2, -spacing - 3 * width / 2, -sepTotal / 2];
		yPort = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];

		const xCTP = [-width / 2, -width / 2, width / 2, width / 2];
		const yCTP = [-Dout / 2 - width, -Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width];
		polysWindings.push({ x: xCTP, y: yCTP });
	} else {
		xPort = [-sepTotal / 2, -spacing / 2, -spacing / 2, -spacing / 2 - width,
			-spacing / 2 - width, -sepTotal / 2];
		yPort = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];
	}
	polysWindings.push({ x: xPort, y: yPort });
	polysWindings.push({ x: xPort.map(v => -v), y: yPort });

	// Vias
	for (const [cx, cy] of viaCentersTCT) {
		polysVias2 = polysVias2.concat(viaGrid(cx, cy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width));
		polysVias1 = polysVias1.concat(viaGrid(cx, cy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width));
	}

	for (const [cx, cy] of viaCentersTB) {
		const dx = Math.sign(cx) * (extend - width) / 2;
		polysVias1 = polysVias1.concat(viaGrid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width));
	}

	return {
		windings: polysWindings,
		crossings: polysCrossings,
		vias1: polysVias1,
		centertap: polysCenterTap,
		vias2: polysVias2,
		pgs: [],
	};
}
