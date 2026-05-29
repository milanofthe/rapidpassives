import type { Polygon, LayerMap, Port, GeometryResult, SymmetricTransformerParams } from './types';
import { viaGrid, routingGeometric45 } from './utils';

export function buildSymmetricTransformer(params: SymmetricTransformerParams): GeometryResult {
	const { Dout, N1, N2, sides, width, spacing, center_tap_primary, center_tap_secondary,
		via_extent, via_spacing, via_width, via_in_metal } = params;
	const PI = Math.PI;
	const SQRT2 = Math.SQRT2;
	const N = N1 + N2;
	const Nmin = Math.min(N1, N2);
	const N1_end = N1 > N2 ? N - 1 : N - Math.abs(N1 - N2) - 1;
	const N2_end = N1 < N2 ? N - 1 : N - Math.abs(N1 - N2) - 1;

	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);
	const R1_init = Dout / 2 / Math.cos(PI / sides);

	// Angles for 4 quadrants
	const upperLeftAngles: number[] = [], upperRightAngles: number[] = [];
	const lowerLeftAngles: number[] = [], lowerRightAngles: number[] = [];
	for (let i = 0; i < sides / 4; i++) {
		const t = (i + 0.5) * 2 / sides;
		upperLeftAngles.push(PI * (0.5 + t));
		upperRightAngles.push(PI * (0 + t));
		lowerLeftAngles.push(PI * (1 + t));
		lowerRightAngles.push(PI * (1.5 + t));
	}

	const extend = via_extent;
	const sepTotal = width + spacing + (SQRT2 - 1) * (2 * spacing + width);

	// Crossing classification (same as before)
	const topBridge: number[] = [], bottomBridge: number[] = [];
	const topCrossing: number[] = [], bottomCrossing: number[] = [];
	// ... (keeping the existing classification logic)
	if (N2 % 2 === 0) {
		topBridge.push(N2_end);
		if (N1 % 2 === 0) {
			bottomBridge.push(N1_end);
			if (N1 >= N2) {
				topCrossing.push(...range(N).filter(w => w % 2 !== 0 && 0 < w && w < Nmin * 2 - 1));
				topCrossing.push(...range(N).filter(w => w % 2 === 0 && N > w && w > Nmin * 2 - 1));
				bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < N - 1));
			} else {
				bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && 0 < w && w < Nmin * 2 - 1));
				bottomCrossing.push(...range(N).filter(w => w % 2 === 0 && N > w && w > Nmin * 2 - 1));
				topCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < N - 1));
			}
		} else {
			topBridge.push(N1_end);
			topCrossing.push(...range(N).filter(w => w % 2 !== 0 && 0 < w && w < Nmin * 2 - 1));
			topCrossing.push(...range(N).filter(w => w % 2 === 0 && N - 1 > w && w > Nmin * 2 - 1));
			bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < N));
		}
	} else {
		bottomBridge.push(N2_end);
		if (N1 % 2 === 0) {
			bottomBridge.push(N1_end);
			topCrossing.push(...range(N).filter(w => w % 2 !== 0 && 0 < w && w < N - 1));
			bottomCrossing.push(...range(N).filter(w => w % 2 === 0 && N - 1 > w && w > Nmin * 2 - 1));
			bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < Nmin * 2 - 1));
		} else {
			topBridge.push(N1_end);
			if (N1 >= N2) {
				topCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < N - 1));
				bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < Nmin * 2 - 1));
				bottomCrossing.push(...range(N).filter(w => w % 2 === 0 && N - 1 > w && w > Nmin * 2 - 1));
			} else {
				topCrossing.push(...range(N).filter(w => w % 2 === 0 && N - 1 > w && w > Nmin * 2 - 1));
				topCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < Nmin * 2 - 1));
				bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && w < Nmin * 2));
				bottomCrossing.push(...range(N).filter(w => w % 2 !== 0 && N - 1 > w && w > Nmin * 2 - 1));
			}
		}
	}
	const lrBridge = range(1, N + 1).filter(w => w > 2 * Nmin).map(w => w - 1);
	const lrCrossing = range(1, N + 1).filter(w => w % 2 !== 0 && w < 2 * Nmin).map(w => w - 1);

	// --- Generate legacy polygons ---
	const layers = generateLegacyPolygons(params, N, N1_end, N2_end, Nmin, R1_init, v, s,
		upperLeftAngles, lowerLeftAngles, upperRightAngles, lowerRightAngles,
		sepTotal, extend, topBridge, bottomBridge, topCrossing, bottomCrossing, lrBridge, lrCrossing);

	// Ports — outermost winding endpoints at the bottom (P1) and top (P2) edges.
	const hasBotCTPort = (center_tap_primary && N1 % 2 === 0) || (center_tap_secondary && N2 % 2 !== 0);
	const hasTopCTPort = (center_tap_primary && N1 % 2 !== 0) || (center_tap_secondary && N2 % 2 === 0);
	const ps = params.portSpacing ?? spacing;
	const botPortX = hasBotCTPort ? ps + width : (ps + width) / 2;
	const topPortX = hasTopCTPort ? ps + width : (ps + width) / 2;
	const botY = -Dout / 2 - width;
	const topY = Dout / 2 + width;

	const ports: Port[] = [
		{ name: 'P1+', x: -botPortX, y: botY, layer: 'windings', role: 'signal' },
		{ name: 'P1-', x: botPortX, y: botY, layer: 'windings', role: 'signal' },
		{ name: 'P2+', x: -topPortX, y: topY, layer: 'windings', role: 'signal' },
		{ name: 'P2-', x: topPortX, y: topY, layer: 'windings', role: 'signal' },
	];
	// CT terminals tap the winding metal (matches the legacy CT-segment layer).
	if (hasBotCTPort) ports.push({ name: 'CT1', x: 0, y: botY, layer: 'windings', role: 'centertap' });
	if (hasTopCTPort) ports.push({ name: 'CT2', x: 0, y: topY, layer: 'windings', role: 'centertap' });

	return { layers, ports };
}

// --- Legacy polygon generation (unchanged, for rendering/GDS) ---

function generateLegacyPolygons(
	params: SymmetricTransformerParams,
	N: number, N1_end: number, N2_end: number, Nmin: number,
	R1_init: number, v: number, s: number,
	upperLeftAngles: number[], lowerLeftAngles: number[], upperRightAngles: number[], lowerRightAngles: number[],
	sepTotal: number, extend: number,
	topBridge: number[], bottomBridge: number[], topCrossing: number[], bottomCrossing: number[],
	lrBridge: number[], lrCrossing: number[],
): LayerMap {
	const { Dout, N1, N2, sides, width, spacing, center_tap_primary, center_tap_secondary,
		via_extent, via_spacing, via_width, via_in_metal } = params;
	const PI = Math.PI;

	let R1 = R1_init, R2 = R1 - v;
	const viaCentersTCT: [number, number][] = [];

	const polysWindings: Polygon[] = [];
	const polysCrossings: Polygon[] = [];
	const polysCenterTap: Polygon[] = [];
	let polysVias1: Polygon[] = [];
	let polysVias2: Polygon[] = [];

	// Via grid at a crossing endpoint — recessed by via_in_metal from each metal
	// edge so it sits exactly under the m2 crossing strip drawn below.
	function viaPolysAt(cx: number, cy: number): Polygon[] {
		const dx = Math.sign(cx) * (extend - width) / 2;
		const dy = Math.sign(cy) * (extend - width) / 2;
		const w_in = extend - 2 * via_in_metal;
		const h_in = width - 2 * via_in_metal;
		if (Math.abs(cy) > Math.abs(cx)) return viaGrid(cx + dx, cy, w_in, h_in, via_spacing, via_width);
		return viaGrid(cx, cy + dy, h_in, w_in, via_spacing, via_width);
	}

	for (let winding = 0; winding < N; winding++) {
		const allAngles = [upperLeftAngles, lowerLeftAngles, upperRightAngles, lowerRightAngles];
		for (let qi = 0; qi < 4; qi++) {
			const angs = allAngles[qi];
			let xOut: number[] = [], yOut: number[] = [], xIn: number[] = [], yIn: number[] = [];
			for (const phi of angs) {
				xOut.push(R1 * Math.cos(phi)); yOut.push(R1 * Math.sin(phi));
				xIn.push(R2 * Math.cos(phi)); yIn.push(R2 * Math.sin(phi));
			}
			if (qi === 0) { yOut = [yOut[0], ...yOut, sepTotal/2]; yIn = [yIn[0], ...yIn, sepTotal/2]; xOut = [-sepTotal/2, ...xOut, xOut[xOut.length-1]]; xIn = [-sepTotal/2, ...xIn, xIn[xIn.length-1]]; }
			else if (qi === 1) { yOut = [-sepTotal/2, ...yOut, yOut[yOut.length-1]]; yIn = [-sepTotal/2, ...yIn, yIn[yIn.length-1]]; xOut = [xOut[0], ...xOut, -sepTotal/2]; xIn = [xIn[0], ...xIn, -sepTotal/2]; }
			else if (qi === 2) { yOut = [sepTotal/2, ...yOut, yOut[yOut.length-1]]; yIn = [sepTotal/2, ...yIn, yIn[yIn.length-1]]; xOut = [xOut[0], ...xOut, sepTotal/2]; xIn = [xIn[0], ...xIn, sepTotal/2]; }
			else { yOut = [yOut[0], ...yOut, -sepTotal/2]; yIn = [yIn[0], ...yIn, -sepTotal/2]; xOut = [sepTotal/2, ...xOut, xOut[xOut.length-1]]; xIn = [sepTotal/2, ...xIn, xIn[xIn.length-1]]; }
			polysWindings.push({ x: [...xOut, ...[...xIn].reverse()], y: [...yOut, ...[...yIn].reverse()] });
		}

		if (bottomBridge.includes(winding)) { const h = -R2*Math.sin(PI*(0.5-1/sides)); polysWindings.push({ x: [-sepTotal/2,sepTotal/2,sepTotal/2,-sepTotal/2], y: [h,h,h-width,h-width] }); }
		if (topBridge.includes(winding)) { const h = (R2+v)*Math.sin(PI*(0.5-1/sides)); polysWindings.push({ x: [-sepTotal/2,sepTotal/2,sepTotal/2,-sepTotal/2], y: [h,h,h-width,h-width] }); }
		if (lrBridge.includes(winding)) {
			const hR = (R2+v)*Math.sin(PI*(0.5-1/sides)); polysWindings.push({ x: [hR,hR,hR-width,hR-width], y: [-sepTotal/2,sepTotal/2,sepTotal/2,-sepTotal/2] });
			const hL = -R2*Math.sin(PI*(0.5-1/sides)); polysWindings.push({ x: [hL,hL,hL-width,hL-width], y: [-sepTotal/2,sepTotal/2,sepTotal/2,-sepTotal/2] });
		}

		// Crossing strips on the lower metal; the vias that land on top of them
		// are emitted just below in this same loop (polygon SoT).
		if (topCrossing.includes(winding)) { const h = R1*Math.sin(PI*(0.5-1/sides)); polysCrossings.push(routingGeometric45(width,spacing,0,h-width-spacing/2,extend)); const ct=routingGeometric45(width,spacing,0,h-width-spacing/2,0); polysWindings.push({x:ct.x.map(v=>-v),y:ct.y}); }
		if (bottomCrossing.includes(winding)) { const h = (-R2+s)*Math.sin(PI*(0.5-1/sides)); polysCrossings.push(routingGeometric45(width,spacing,0,h-width-spacing/2,extend)); const ct=routingGeometric45(width,spacing,0,h-width-spacing/2,0); polysWindings.push({x:ct.x.map(v=>-v),y:ct.y}); }
		if (lrCrossing.includes(winding)) {
			const hR = R1*Math.sin(PI*(0.5-1/sides)); let cr=routingGeometric45(width,spacing,0,hR-width-spacing/2,extend); polysCrossings.push({x:cr.y,y:cr.x}); cr=routingGeometric45(width,spacing,0,hR-width-spacing/2,0); polysWindings.push({x:cr.y.map(v=>-v),y:cr.x});
			const hL = (-R2+s)*Math.sin(PI*(0.5-1/sides)); cr=routingGeometric45(width,spacing,0,hL-width-spacing/2,extend); polysCrossings.push({x:cr.y,y:cr.x}); cr=routingGeometric45(width,spacing,0,hL-width-spacing/2,0); polysWindings.push({x:cr.y.map(v=>-v),y:cr.x});
		}

		// Crossing vias — recessed under the m2 crossing strips drawn above.
		// (Previously emitted via network.vias; now part of the polygon SoT.)
		const hTopV = R1 * Math.sin(PI * (0.5 - 1 / sides));
		const hBotV = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
		if (topCrossing.includes(winding)) {
			polysVias1.push(...viaPolysAt(-sepTotal / 2 - width / 2, hTopV - 3 * width / 2 - spacing));
			polysVias1.push(...viaPolysAt(sepTotal / 2 + width / 2, hTopV - width / 2));
		}
		if (bottomCrossing.includes(winding)) {
			polysVias1.push(...viaPolysAt(-sepTotal / 2 - width / 2, hBotV - 3 * width / 2 - spacing));
			polysVias1.push(...viaPolysAt(sepTotal / 2 + width / 2, hBotV - width / 2));
		}
		if (lrCrossing.includes(winding)) {
			polysVias1.push(...viaPolysAt(hBotV - 3 * width / 2 - spacing, -sepTotal / 2 - width / 2));
			polysVias1.push(...viaPolysAt(hBotV - width / 2, sepTotal / 2 + width / 2));
			polysVias1.push(...viaPolysAt(hTopV - 3 * width / 2 - spacing, -sepTotal / 2 - width / 2));
			polysVias1.push(...viaPolysAt(hTopV - width / 2, sepTotal / 2 + width / 2));
		}

		R1 -= s; R2 -= s;
	}

	// Center taps + ports (kept from original, abbreviated)
	function addCT(Nend: number, endsBottom: boolean) {
		const _ext = Math.min(width, extend);
		let xCT: number[], yCT: number[];
		let xCt1: number, yCt1: number, xCt2: number, yCt2: number;

		if (endsBottom) {
			xCT=[-width/2,-width/2,width/2,width/2];
			yCT=[-Dout/2+width-_ext,-Dout/2+(spacing+width)*Nend,-Dout/2+(spacing+width)*Nend,-Dout/2+width-_ext];
			xCt1=0; yCt1=-Dout/2+spacing*Nend+width*(Nend+1)-width+_ext/2;
			xCt2=0; yCt2=-Dout/2+width/2+(width-_ext)/2;
		} else {
			xCT=[width/2,width/2,-width/2,-width/2];
			yCT=[Dout/2-width+_ext,Dout/2-(spacing+width)*Nend,Dout/2-(spacing+width)*Nend,Dout/2-width+_ext];
			xCt1=0; yCt1=Dout/2-spacing*Nend-width*(Nend+1)+width-_ext/2;
			xCt2=0; yCt2=Dout/2-width/2-(width-_ext)/2;
		}

		if (Nend > 1) {
			viaCentersTCT.push([xCt1, yCt1]);
			viaCentersTCT.push([xCt2, yCt2]);

			const xVP1=[xCt1-width/2,xCt1-width/2,xCt1+width/2,xCt1+width/2];
			const yVP1=[yCt1-_ext/2,yCt1+_ext/2,yCt1+_ext/2,yCt1-_ext/2];
			const xVP2=[xCt2-width/2,xCt2-width/2,xCt2+width/2,xCt2+width/2];
			const yVP2=[yCt2-_ext/2,yCt2+_ext/2,yCt2+_ext/2,yCt2-_ext/2];

			polysWindings.push({x:xVP1,y:yVP1});
			polysCrossings.push({x:xVP1,y:yVP1});
			polysCrossings.push({x:xVP2,y:yVP2});

			if (Nend > 2) {
				polysCenterTap.push({x:xCT,y:yCT});
				polysCenterTap.push({x:xVP1,y:yVP1});
				polysCenterTap.push({x:xVP2,y:yVP2});
			} else {
				polysCrossings.push({x:xCT,y:yCT});
			}
		} else {
			polysWindings.push({x:xCT,y:yCT});
		}
	}
	if (center_tap_primary) addCT(N1_end, N1 % 2 === 0);
	if (center_tap_secondary) addCT(N2_end, N2 % 2 !== 0);

	// Bottom ports
	const hasBottomCT = (center_tap_primary && N1%2===0)||(center_tap_secondary && N2%2!==0);
	const hasTopCT = (center_tap_primary && N1%2!==0)||(center_tap_secondary && N2%2===0);
	const ps3 = params.portSpacing ?? spacing;
	const bpx = hasBottomCT ? ps3 + width : (ps3 + width) / 2;
	const tpx = hasTopCT ? ps3 + width : (ps3 + width) / 2;
	let xPortB: number[], yPortB: number[];
	if (hasBottomCT) { xPortB=[-sepTotal/2,-bpx+width/2,-bpx+width/2,-bpx-width/2,-bpx-width/2,-sepTotal/2]; yPortB=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; polysWindings.push({x:[-width/2,-width/2,width/2,width/2],y:[-Dout/2-width,-Dout/2+width,-Dout/2+width,-Dout/2-width]}); }
	else { xPortB=[-sepTotal/2,-bpx+width/2,-bpx+width/2,-bpx-width/2,-bpx-width/2,-sepTotal/2]; yPortB=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; }
	polysWindings.push({x:xPortB,y:yPortB}); polysWindings.push({x:xPortB.map(v=>-v),y:yPortB});

	// Top ports
	let xPortT: number[], yPortT: number[];
	if (hasTopCT) { xPortT=[-sepTotal/2,-tpx+width/2,-tpx+width/2,-tpx-width/2,-tpx-width/2,-sepTotal/2]; yPortT=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; polysWindings.push({x:[-width/2,-width/2,width/2,width/2],y:[Dout/2+width,Dout/2-width,Dout/2-width,Dout/2+width]}); }
	else { xPortT=[-sepTotal/2,-tpx+width/2,-tpx+width/2,-tpx-width/2,-tpx-width/2,-sepTotal/2]; yPortT=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; }
	polysWindings.push({x:xPortT,y:yPortT.map(v=>-v)}); polysWindings.push({x:xPortT.map(v=>-v),y:yPortT.map(v=>-v)});

	// Center-tap vias (each lands at a centertap-to-winding handoff). The
	// bridge/crossing vias are emitted in the winding loop above.
	const _extCT = Math.min(width, extend);
	for (const [cx,cy] of viaCentersTCT) {
		const vp = viaGrid(cx, cy, width - 2 * via_in_metal, _extCT - 2 * via_in_metal,
			via_spacing, via_width);
		polysVias2 = polysVias2.concat(vp);
		polysVias1 = polysVias1.concat(vp);
	}

	return { windings: polysWindings, crossings: polysCrossings, vias1: polysVias1, centertap: polysCenterTap, vias2: polysVias2, pgs: [] };
}

export function isSymmetricTransformerValid(params: SymmetricTransformerParams): boolean {
	const { Dout, N1, N2, sides, width, spacing, center_tap_primary, center_tap_secondary, via_extent } = params;
	if (sides % 4 !== 0) return false;
	const N = N1 + N2;
	if (center_tap_secondary && center_tap_primary && N % 2 !== 0) return false;
	const h = width + spacing + (Math.SQRT2 - 1) * (2 * spacing + width);
	let q = 2 * width + spacing;
	if (center_tap_secondary || center_tap_primary) q += width + spacing;
	const d2 = Dout / 2 - (N - 1) * (spacing + width);
	const d1 = Dout / 2 - (N - 1) * spacing - N * width;
	return (h / 2 + via_extent <= d2 * Math.tan(Math.PI / sides)) && (h / 2 <= d1 * Math.tan(Math.PI / sides)) && (q / 2 <= Dout / 2 * Math.tan(Math.PI / sides));
}

function range(a: number, b?: number): number[] {
	if (b === undefined) { b = a; a = 0; }
	const r: number[] = [];
	for (let i = a; i < b; i++) r.push(i);
	return r;
}
