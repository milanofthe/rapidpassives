import type { Polygon, LayerMap, SymmetricTransformerParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
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

	// --- Build centerline network ---
	const netNodes: ConductorNode[] = [];
	const netSegments: ConductorSegment[] = [];
	const netVias: ViaConnection[] = [];
	let _nid = 0, _sid = 0;

	const _nodeReg = new Map<string, ConductorNode>();
	function addN(x: number, y: number, layerId: string): ConductorNode {
		const sx = Math.round(x * 1000) / 1000;
		const sy = Math.round(y * 1000) / 1000;
		const key = `${sx},${sy},${layerId}`;
		const existing = _nodeReg.get(key);
		if (existing) return existing;
		const node: ConductorNode = { id: `n${_nid++}`, x: sx, y: sy, layerId };
		netNodes.push(node);
		_nodeReg.set(key, node);
		return node;
	}
	function addS(from: ConductorNode, to: ConductorNode, w: number, lid: string, pid: string, rl: 'windings' | 'crossings'): void {
		if (from.id === to.id) return;
		netSegments.push({ id: `s${_sid++}`, fromNode: from.id, toNode: to.id, width: w, layerId: lid, pathId: pid, renderLayer: rl });
	}

	// Build centerline for each winding's 4 quadrant arcs + connections
	let R1 = R1_init, R2 = R1 - v;

	// Track last nodes of each quadrant for inter-winding connections
	let prevWindingQuadLast: ConductorNode[] = [];

	// Track winding entry/exit points for port assignment
	// Winding 0 bottom-left is the first port entry
	// The interleaving determines which windings are primary/secondary
	const windingBottomLeft: ConductorNode[] = [];  // LL.last per winding
	const windingBottomRight: ConductorNode[] = []; // LR.first per winding
	const windingTopLeft: ConductorNode[] = [];     // UL.first per winding
	const windingTopRight: ConductorNode[] = [];    // UR.last per winding

	for (let winding = 0; winding < N; winding++) {
		const rc = (R1 + R2) / 2;
		const quadAngles = [upperLeftAngles, lowerLeftAngles, upperRightAngles, lowerRightAngles];
		const quadLabels = ['ul', 'll', 'ur', 'lr'];

		// Build 4 quadrant arcs, track first/last node of each
		const qFirst: ConductorNode[] = [];
		const qLast: ConductorNode[] = [];

		for (let qi = 0; qi < 4; qi++) {
			let prev: ConductorNode | null = null;
			let first: ConductorNode | null = null;
			for (const phi of quadAngles[qi]) {
				const node = addN(rc * Math.cos(phi), rc * Math.sin(phi), 'm3');
				if (!first) first = node;
				if (prev) addS(prev, node, width, 'm3', `w${winding}_${quadLabels[qi]}`, 'windings');
				prev = node;
			}
			qFirst.push(first!);
			qLast.push(prev!);
		}

		// Connect quadrants: UL↔UR at top, LL↔LR at bottom, UL↔LL at left, UR↔LR at right
		// Each connection is either a bridge (same metal) or crossing (lower metal + vias)

		// Top connection: UL.first ↔ UR.last (both at top y)
		if (topBridge.includes(winding)) {
			addS(qFirst[0], qLast[2], width, 'm3', `w${winding}_bridge_top`, 'windings');
		} else if (topCrossing.includes(winding)) {
			const h = R1 * Math.sin(PI * (0.5 - 1 / sides));
			const cL = addN(qFirst[0].x, qFirst[0].y, 'm2');
			const cR = addN(qLast[2].x, qLast[2].y, 'm2');
			addS(cL, cR, width, 'm2', `w${winding}_cross_top`, 'crossings');
			netVias.push({ id: `v_tc_l${winding}`, topNode: qFirst[0].id, bottomNode: cL.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
			netVias.push({ id: `v_tc_r${winding}`, topNode: qLast[2].id, bottomNode: cR.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
		} else {
			// Direct connection (no crossing needed for this winding at top)
			addS(qFirst[0], qLast[2], width, 'm3', `w${winding}_conn_top`, 'windings');
		}

		// Bottom connection: LL.last ↔ LR.first (both at bottom y)
		if (bottomBridge.includes(winding)) {
			addS(qLast[1], qFirst[3], width, 'm3', `w${winding}_bridge_bot`, 'windings');
		} else if (bottomCrossing.includes(winding)) {
			const h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			const cL = addN(qLast[1].x, qLast[1].y, 'm2');
			const cR = addN(qFirst[3].x, qFirst[3].y, 'm2');
			addS(cL, cR, width, 'm2', `w${winding}_cross_bot`, 'crossings');
			netVias.push({ id: `v_bc_l${winding}`, topNode: qLast[1].id, bottomNode: cL.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
			netVias.push({ id: `v_bc_r${winding}`, topNode: qFirst[3].id, bottomNode: cR.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
		} else {
			addS(qLast[1], qFirst[3], width, 'm3', `w${winding}_conn_bot`, 'windings');
		}

		// Left connection: UL.last ↔ LL.first
		if (lrBridge.includes(winding)) {
			addS(qLast[0], qFirst[1], width, 'm3', `w${winding}_bridge_l`, 'windings');
		} else if (lrCrossing.includes(winding)) {
			const cT = addN(qLast[0].x, qLast[0].y, 'm2');
			const cB = addN(qFirst[1].x, qFirst[1].y, 'm2');
			addS(cT, cB, width, 'm2', `w${winding}_cross_l`, 'crossings');
			netVias.push({ id: `v_lc_t${winding}`, topNode: qLast[0].id, bottomNode: cT.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
			netVias.push({ id: `v_lc_b${winding}`, topNode: qFirst[1].id, bottomNode: cB.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
		} else {
			addS(qLast[0], qFirst[1], width, 'm3', `w${winding}_conn_l`, 'windings');
		}

		// Right connection: UR.first ↔ LR.last
		if (lrBridge.includes(winding)) {
			addS(qFirst[2], qLast[3], width, 'm3', `w${winding}_bridge_r`, 'windings');
		} else if (lrCrossing.includes(winding)) {
			const cT = addN(qFirst[2].x, qFirst[2].y, 'm2');
			const cB = addN(qLast[3].x, qLast[3].y, 'm2');
			addS(cT, cB, width, 'm2', `w${winding}_cross_r`, 'crossings');
			netVias.push({ id: `v_rc_t${winding}`, topNode: qFirst[2].id, bottomNode: cT.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
			netVias.push({ id: `v_rc_b${winding}`, topNode: qLast[3].id, bottomNode: cB.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
		} else {
			addS(qFirst[2], qLast[3], width, 'm3', `w${winding}_conn_r`, 'windings');
		}

		// Inter-winding connections at the 4 junction points
		if (prevWindingQuadLast.length > 0) {
			const prev = prevWindingQuadLast;
			// UL: prev[0].first connects to this[0].first (top of UL)
			// Actually, consecutive windings share the crossing/bridge zone.
			// The junction between winding W and W+1 is at the sepTotal boundary.
			// Connect prev winding's quadrant endpoints to this winding's quadrant endpoints
			// at the same angular positions.

			// Connect at the 4 quadrant boundaries (where arcs start/end)
			// These are at the sepTotal positions — consecutive windings at different radii
			addS(prev[0], qFirst[0], width, 'm3', `inter_w${winding}_ul`, 'windings');
			addS(prev[1], qLast[1], width, 'm3', `inter_w${winding}_ll`, 'windings');
			addS(prev[2], qLast[2], width, 'm3', `inter_w${winding}_ur`, 'windings');
			addS(prev[3], qFirst[3], width, 'm3', `inter_w${winding}_lr`, 'windings');
		}

		// Track for next winding's inter-connection
		prevWindingQuadLast = [qFirst[0], qLast[1], qLast[2], qFirst[3]];

		// Track port connection points per winding
		// Bottom: LL.last (left) and LR.first (right) — these are the bottom-most nodes
		windingBottomLeft.push(qLast[1]);
		windingBottomRight.push(qFirst[3]);
		// Top: UL.first (left) and UR.last (right) — these are the top-most nodes
		windingTopLeft.push(qFirst[0]);
		windingTopRight.push(qLast[2]);

		R1 -= s;
		R2 -= s;
	}

	// Port nodes
	const hasBotCTPort = (center_tap_primary && N1 % 2 === 0) || (center_tap_secondary && N2 % 2 !== 0);
	const hasTopCTPort = (center_tap_primary && N1 % 2 !== 0) || (center_tap_secondary && N2 % 2 === 0);
	const botPortX = params.portSpacing !== undefined ? params.portSpacing / 2 : (hasBotCTPort ? spacing + width : (spacing + width) / 2);
	const topPortX = params.portSpacing !== undefined ? params.portSpacing / 2 : (hasTopCTPort ? spacing + width : (spacing + width) / 2);

	const p1Plus = addN(-botPortX, -Dout / 2 - width, 'm3');
	const p1Minus = addN(botPortX, -Dout / 2 - width, 'm3');
	const p2Plus = addN(-topPortX, Dout / 2 + width, 'm3');
	const p2Minus = addN(topPortX, Dout / 2 + width, 'm3');

	// Connect ports to outermost winding (0) quadrant endpoints
	// P1+ → LL bottom-left (winding 0), P1- → LR bottom-right (winding 0)
	// P2+ → UL top-left (winding 0), P2- → UR top-right (winding 0)
	addS(p1Plus, windingBottomLeft[0], width, 'm3', 'port_p1p', 'windings');
	addS(p1Minus, windingBottomRight[0], width, 'm3', 'port_p1m', 'windings');
	addS(p2Plus, windingTopLeft[0], width, 'm3', 'port_p2p', 'windings');
	addS(p2Minus, windingTopRight[0], width, 'm3', 'port_p2m', 'windings');

	const netPorts: Port[] = [
		{ name: 'P1+', node: p1Plus.id },
		{ name: 'P1-', node: p1Minus.id },
		{ name: 'P2+', node: p2Plus.id },
		{ name: 'P2-', node: p2Minus.id },
	];
	if (hasBotCTPort) {
		const ct = addN(0, -Dout / 2 - width, 'm3');
		// Connect CT to the bottom of the innermost winding
		const innerBot = windingBottomLeft.length > 0 ? windingBottomLeft[windingBottomLeft.length - 1] : null;
		if (innerBot) addS(ct, innerBot, width, 'm3', 'ct', 'windings');
		netPorts.push({ name: 'CT1', node: ct.id });
	}
	if (hasTopCTPort) {
		const ct = addN(0, Dout / 2 + width, 'm3');
		const innerTop = windingTopLeft.length > 0 ? windingTopLeft[windingTopLeft.length - 1] : null;
		if (innerTop) addS(ct, innerTop, width, 'm3', 'ct', 'windings');
		netPorts.push({ name: 'CT2', node: ct.id });
	}

	const network: ConductorNetwork = { nodes: netNodes, segments: netSegments, vias: netVias, ports: netPorts };
	return { network, layers };
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
	const viaCentersTB: [number, number][] = [];

	const polysWindings: Polygon[] = [];
	const polysCrossings: Polygon[] = [];
	const polysCenterTap: Polygon[] = [];
	let polysVias1: Polygon[] = [];
	let polysVias2: Polygon[] = [];

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

		if (topCrossing.includes(winding)) { const h = R1*Math.sin(PI*(0.5-1/sides)); polysCrossings.push(routingGeometric45(width,spacing,0,h-width-spacing/2,extend)); const ct=routingGeometric45(width,spacing,0,h-width-spacing/2,0); polysWindings.push({x:ct.x.map(v=>-v),y:ct.y}); viaCentersTB.push([-sepTotal/2-width/2,h-3*width/2-spacing],[sepTotal/2+width/2,h-width/2]); }
		if (bottomCrossing.includes(winding)) { const h = (-R2+s)*Math.sin(PI*(0.5-1/sides)); polysCrossings.push(routingGeometric45(width,spacing,0,h-width-spacing/2,extend)); const ct=routingGeometric45(width,spacing,0,h-width-spacing/2,0); polysWindings.push({x:ct.x.map(v=>-v),y:ct.y}); viaCentersTB.push([-sepTotal/2-width/2,h-3*width/2-spacing],[sepTotal/2+width/2,h-width/2]); }
		if (lrCrossing.includes(winding)) {
			const hR = R1*Math.sin(PI*(0.5-1/sides)); let cr=routingGeometric45(width,spacing,0,hR-width-spacing/2,extend); polysCrossings.push({x:cr.y,y:cr.x}); cr=routingGeometric45(width,spacing,0,hR-width-spacing/2,0); polysWindings.push({x:cr.y.map(v=>-v),y:cr.x}); viaCentersTB.push([hR-3*width/2-spacing,-sepTotal/2-width/2],[hR-width/2,sepTotal/2+width/2]);
			const hL = (-R2+s)*Math.sin(PI*(0.5-1/sides)); cr=routingGeometric45(width,spacing,0,hL-width-spacing/2,extend); polysCrossings.push({x:cr.y,y:cr.x}); cr=routingGeometric45(width,spacing,0,hL-width-spacing/2,0); polysWindings.push({x:cr.y.map(v=>-v),y:cr.x}); viaCentersTB.push([hL-3*width/2-spacing,-sepTotal/2-width/2],[hL-width/2,sepTotal/2+width/2]);
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
	const bpx = params.portSpacing !== undefined ? params.portSpacing / 2 : (hasBottomCT ? spacing + width : (spacing + width) / 2);
	const tpx = params.portSpacing !== undefined ? params.portSpacing / 2 : (hasTopCT ? spacing + width : (spacing + width) / 2);
	let xPortB: number[], yPortB: number[];
	if (hasBottomCT) { xPortB=[-sepTotal/2,-bpx+width/2,-bpx+width/2,-bpx-width/2,-bpx-width/2,-sepTotal/2]; yPortB=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; polysWindings.push({x:[-width/2,-width/2,width/2,width/2],y:[-Dout/2-width,-Dout/2+width,-Dout/2+width,-Dout/2-width]}); }
	else { xPortB=[-sepTotal/2,-bpx+width/2,-bpx+width/2,-bpx-width/2,-bpx-width/2,-sepTotal/2]; yPortB=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; }
	polysWindings.push({x:xPortB,y:yPortB}); polysWindings.push({x:xPortB.map(v=>-v),y:yPortB});

	// Top ports
	let xPortT: number[], yPortT: number[];
	if (hasTopCT) { xPortT=[-sepTotal/2,-tpx+width/2,-tpx+width/2,-tpx-width/2,-tpx-width/2,-sepTotal/2]; yPortT=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; polysWindings.push({x:[-width/2,-width/2,width/2,width/2],y:[Dout/2+width,Dout/2-width,Dout/2-width,Dout/2+width]}); }
	else { xPortT=[-sepTotal/2,-tpx+width/2,-tpx+width/2,-tpx-width/2,-tpx-width/2,-sepTotal/2]; yPortT=[-Dout/2+width,-Dout/2+width,-Dout/2-width,-Dout/2-width,-Dout/2,-Dout/2]; }
	polysWindings.push({x:xPortT,y:yPortT.map(v=>-v)}); polysWindings.push({x:xPortT.map(v=>-v),y:yPortT.map(v=>-v)});

	// Vias
	const _extCT = Math.min(width, extend);
	for (const [cx,cy] of viaCentersTCT) { const vp=viaGrid(cx,cy,width-2*via_in_metal,_extCT-2*via_in_metal,via_spacing,via_width); polysVias2=polysVias2.concat(vp); polysVias1=polysVias1.concat(vp); }
	for (const [cx,cy] of viaCentersTB) { const dx=Math.sign(cx)*(extend-width)/2; const dy=Math.sign(cy)*(extend-width)/2; if(Math.abs(cy)>Math.abs(cx)) polysVias1=polysVias1.concat(viaGrid(cx+dx,cy,extend-2*via_in_metal,width-2*via_in_metal,via_spacing,via_width)); else polysVias1=polysVias1.concat(viaGrid(cx,cy+dy,width-2*via_in_metal,extend-2*via_in_metal,via_spacing,via_width)); }

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
