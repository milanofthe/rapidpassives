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

	let R1 = Dout / 2 / Math.cos(PI / sides);
	let R2 = R1 - v;

	// Angles for 4 quadrants
	const upperLeftAngles: number[] = [];
	const upperRightAngles: number[] = [];
	const lowerLeftAngles: number[] = [];
	const lowerRightAngles: number[] = [];
	for (let i = 0; i < sides / 4; i++) {
		const t = (i + 0.5) * 2 / sides;
		upperLeftAngles.push(PI * (0.5 + t));
		upperRightAngles.push(PI * (0 + t));
		lowerLeftAngles.push(PI * (1 + t));
		lowerRightAngles.push(PI * (1.5 + t));
	}

	const extend = via_extent;
	const sepTotal = width + spacing + (SQRT2 - 1) * (2 * spacing + width);

	const viaCentersTB: [number, number][] = [];
	const viaCentersTCT: [number, number][] = [];

	// Crossing/bridge classification
	const topBridge: number[] = [];
	const bottomBridge: number[] = [];
	const topCrossing: number[] = [];
	const bottomCrossing: number[] = [];

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
				xOut.push(R1 * Math.cos(phi));
				yOut.push(R1 * Math.sin(phi));
				xIn.push(R2 * Math.cos(phi));
				yIn.push(R2 * Math.sin(phi));
			}
			if (qi === 0) {
				yOut = [yOut[0], ...yOut, sepTotal / 2];
				yIn = [yIn[0], ...yIn, sepTotal / 2];
				xOut = [-sepTotal / 2, ...xOut, xOut[xOut.length - 1]];
				xIn = [-sepTotal / 2, ...xIn, xIn[xIn.length - 1]];
			} else if (qi === 1) {
				yOut = [-sepTotal / 2, ...yOut, yOut[yOut.length - 1]];
				yIn = [-sepTotal / 2, ...yIn, yIn[yIn.length - 1]];
				xOut = [xOut[0], ...xOut, -sepTotal / 2];
				xIn = [xIn[0], ...xIn, -sepTotal / 2];
			} else if (qi === 2) {
				yOut = [sepTotal / 2, ...yOut, yOut[yOut.length - 1]];
				yIn = [sepTotal / 2, ...yIn, yIn[yIn.length - 1]];
				xOut = [xOut[0], ...xOut, sepTotal / 2];
				xIn = [xIn[0], ...xIn, sepTotal / 2];
			} else {
				yOut = [yOut[0], ...yOut, -sepTotal / 2];
				yIn = [yIn[0], ...yIn, -sepTotal / 2];
				xOut = [sepTotal / 2, ...xOut, xOut[xOut.length - 1]];
				xIn = [sepTotal / 2, ...xIn, xIn[xIn.length - 1]];
			}
			polysWindings.push({ x: [...xOut, ...[...xIn].reverse()], y: [...yOut, ...[...yIn].reverse()] });
		}

		// Bottom bridge
		if (bottomBridge.includes(winding)) {
			const h = -R2 * Math.sin(PI * (0.5 - 1 / sides));
			polysWindings.push({ x: [-sepTotal / 2, sepTotal / 2, sepTotal / 2, -sepTotal / 2], y: [h, h, h - width, h - width] });
		}
		// Top bridge
		if (topBridge.includes(winding)) {
			const h = (R2 + v) * Math.sin(PI * (0.5 - 1 / sides));
			polysWindings.push({ x: [-sepTotal / 2, sepTotal / 2, sepTotal / 2, -sepTotal / 2], y: [h, h, h - width, h - width] });
		}
		// Left-right bridges
		if (lrBridge.includes(winding)) {
			const hR = (R2 + v) * Math.sin(PI * (0.5 - 1 / sides));
			const xB = [-sepTotal / 2, sepTotal / 2, sepTotal / 2, -sepTotal / 2];
			const yB = [hR, hR, hR - width, hR - width];
			polysWindings.push({ x: yB, y: xB }); // swapped x/y for right bridge

			const hL = -R2 * Math.sin(PI * (0.5 - 1 / sides));
			const xB2 = [-sepTotal / 2, sepTotal / 2, sepTotal / 2, -sepTotal / 2];
			const yB2 = [hL, hL, hL - width, hL - width];
			polysWindings.push({ x: yB2, y: xB2 }); // swapped x/y for left bridge
		}

		// Top crossings
		if (topCrossing.includes(winding)) {
			const h = R1 * Math.sin(PI * (0.5 - 1 / sides));
			const x0 = 0, y0 = h - width - spacing / 2;
			polysCrossings.push(routingGeometric45(width, spacing, x0, y0, extend));
			const ct = routingGeometric45(width, spacing, x0, y0, 0);
			polysWindings.push({ x: ct.x.map(v => -v), y: ct.y });
			viaCentersTB.push([-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing]);
			viaCentersTB.push([sepTotal / 2 + width / 2, h - width / 2]);
		}
		// Bottom crossings
		if (bottomCrossing.includes(winding)) {
			const h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			const x0 = 0, y0 = h - width - spacing / 2;
			polysCrossings.push(routingGeometric45(width, spacing, x0, y0, extend));
			const ct = routingGeometric45(width, spacing, x0, y0, 0);
			polysWindings.push({ x: ct.x.map(v => -v), y: ct.y });
			viaCentersTB.push([-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing]);
			viaCentersTB.push([sepTotal / 2 + width / 2, h - width / 2]);
		}
		// Left-right crossings
		if (lrCrossing.includes(winding)) {
			// Right
			const hR = R1 * Math.sin(PI * (0.5 - 1 / sides));
			const y0R = hR - width - spacing / 2;
			const crR = routingGeometric45(width, spacing, 0, y0R, extend);
			polysCrossings.push({ x: crR.y, y: crR.x }); // swap x/y
			const ctR = routingGeometric45(width, spacing, 0, y0R, 0);
			polysWindings.push({ x: ctR.y.map(v => -v), y: ctR.x }); // swap + negate
			viaCentersTB.push([hR - 3 * width / 2 - spacing, -sepTotal / 2 - width / 2]);
			viaCentersTB.push([hR - width / 2, sepTotal / 2 + width / 2]);

			// Left
			const hL = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			const y0L = hL - width - spacing / 2;
			const crL = routingGeometric45(width, spacing, 0, y0L, extend);
			polysCrossings.push({ x: crL.y, y: crL.x });
			const ctL = routingGeometric45(width, spacing, 0, y0L, 0);
			polysWindings.push({ x: ctL.y.map(v => -v), y: ctL.x });
			viaCentersTB.push([hL - 3 * width / 2 - spacing, -sepTotal / 2 - width / 2]);
			viaCentersTB.push([hL - width / 2, sepTotal / 2 + width / 2]);
		}

		R1 -= s;
		R2 -= s;
	}

	// Center tap helper
	function addCenterTap(Nend: number, endsBottom: boolean) {
		const _extend = Math.min(width, extend);
		let xCT: number[], yCT: number[], xCt1: number, yCt1: number, xCt2: number, yCt2: number;

		if (endsBottom) {
			xCT = [-width / 2, -width / 2, width / 2, width / 2];
			yCT = [-Dout / 2 + width - _extend, -Dout / 2 + (spacing + width) * Nend,
				-Dout / 2 + (spacing + width) * Nend, -Dout / 2 + width - _extend];
			xCt1 = 0; yCt1 = -Dout / 2 + spacing * Nend + width * (Nend + 1) - width + _extend / 2;
			xCt2 = 0; yCt2 = -Dout / 2 + width / 2 + (width - _extend) / 2;
		} else {
			xCT = [width / 2, width / 2, -width / 2, -width / 2];
			yCT = [Dout / 2 - width + _extend, Dout / 2 - (spacing + width) * Nend,
				Dout / 2 - (spacing + width) * Nend, Dout / 2 - width + _extend];
			xCt1 = 0; yCt1 = Dout / 2 - spacing * Nend - width * (Nend + 1) + width - _extend / 2;
			xCt2 = 0; yCt2 = Dout / 2 - width / 2 - (width - _extend) / 2;
		}

		if (Nend > 1) {
			viaCentersTCT.push([xCt1, yCt1]);
			viaCentersTCT.push([xCt2, yCt2]);
			const xVP1 = [xCt1 - width / 2, xCt1 - width / 2, xCt1 + width / 2, xCt1 + width / 2];
			const yVP1 = [yCt1 - _extend / 2, yCt1 + _extend / 2, yCt1 + _extend / 2, yCt1 - _extend / 2];
			const xVP2 = [xCt2 - width / 2, xCt2 - width / 2, xCt2 + width / 2, xCt2 + width / 2];
			const yVP2 = [yCt2 - _extend / 2, yCt2 + _extend / 2, yCt2 + _extend / 2, yCt2 - _extend / 2];
			polysWindings.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP2, y: yVP2 });
			if (Nend > 2) {
				polysCenterTap.push({ x: xCT, y: yCT });
				polysCenterTap.push({ x: xVP1, y: yVP1 });
				polysCenterTap.push({ x: xVP2, y: yVP2 });
			} else {
				polysCrossings.push({ x: xCT, y: yCT });
			}
		} else {
			polysWindings.push({ x: xCT, y: yCT });
		}
	}

	if (center_tap_primary) addCenterTap(N1_end, N1 % 2 === 0);
	if (center_tap_secondary) addCenterTap(N2_end, N2 % 2 !== 0);

	// Bottom ports
	const hasBottomCT = (center_tap_primary && N1 % 2 === 0) || (center_tap_secondary && N2 % 2 !== 0);
	let xPortB: number[], yPortB: number[];
	if (hasBottomCT) {
		xPortB = [-sepTotal / 2, -spacing - width / 2, -spacing - width / 2,
			-spacing - 3 * width / 2, -spacing - 3 * width / 2, -sepTotal / 2];
		yPortB = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];
		polysWindings.push({ x: [-width / 2, -width / 2, width / 2, width / 2], y: [-Dout / 2 - width, -Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width] });
	} else {
		xPortB = [-sepTotal / 2, -spacing / 2, -spacing / 2, -spacing / 2 - width,
			-spacing / 2 - width, -sepTotal / 2];
		yPortB = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];
	}
	polysWindings.push({ x: xPortB, y: yPortB });
	polysWindings.push({ x: xPortB.map(v => -v), y: yPortB });

	// Top ports
	const hasTopCT = (center_tap_primary && N1 % 2 !== 0) || (center_tap_secondary && N2 % 2 === 0);
	let xPortT: number[], yPortT: number[];
	if (hasTopCT) {
		xPortT = [-sepTotal / 2, -spacing - width / 2, -spacing - width / 2,
			-spacing - 3 * width / 2, -spacing - 3 * width / 2, -sepTotal / 2];
		yPortT = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];
		polysWindings.push({ x: [-width / 2, -width / 2, width / 2, width / 2], y: [Dout / 2 + width, Dout / 2 - width, Dout / 2 - width, Dout / 2 + width] });
	} else {
		xPortT = [-sepTotal / 2, -spacing / 2, -spacing / 2, -spacing / 2 - width,
			-spacing / 2 - width, -sepTotal / 2];
		yPortT = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width,
			-Dout / 2 - width, -Dout / 2, -Dout / 2];
	}
	polysWindings.push({ x: xPortT, y: yPortT.map(v => -v) });
	polysWindings.push({ x: xPortT.map(v => -v), y: yPortT.map(v => -v) });

	// Vias
	const _extendCT = Math.min(width, extend);
	for (const [cx, cy] of viaCentersTCT) {
		if (N > 3) {
			polysVias2 = polysVias2.concat(viaGrid(cx, cy, width - 2 * via_in_metal, _extendCT - 2 * via_in_metal, via_spacing, via_width));
		}
		polysVias1 = polysVias1.concat(viaGrid(cx, cy, width - 2 * via_in_metal, _extendCT - 2 * via_in_metal, via_spacing, via_width));
	}
	for (const [cx, cy] of viaCentersTB) {
		const dx = Math.sign(cx) * (extend - width) / 2;
		const dy = Math.sign(cy) * (extend - width) / 2;
		if (Math.abs(cy) > Math.abs(cx)) {
			polysVias1 = polysVias1.concat(viaGrid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width));
		} else {
			polysVias1 = polysVias1.concat(viaGrid(cx, cy + dy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width));
		}
	}

	// --- Build conductor network with winding segments ---
	const netNodes: ConductorNode[] = [];
	const netSegments: ConductorSegment[] = [];
	const netVias: ViaConnection[] = [];
	let _nid = 0, _sid = 0;

	const _nodeRegistry = new Map<string, ConductorNode>();

	function _addNode(x: number, y: number, layerId: string): ConductorNode {
		// Snap coordinates and check for existing node at same position
		const sx = Math.round(x * 1000) / 1000;
		const sy = Math.round(y * 1000) / 1000;
		const key = `${sx},${sy},${layerId}`;
		const existing = _nodeRegistry.get(key);
		if (existing) return existing;
		const node: ConductorNode = { id: `n${_nid++}`, x: sx, y: sy, layerId };
		netNodes.push(node);
		_nodeRegistry.set(key, node);
		return node;
	}

	function _addSeg(from: ConductorNode, to: ConductorNode, w: number, layerId: string, pathId: string, renderLayer: 'windings' | 'crossings'): void {
		netSegments.push({ id: `s${_sid++}`, fromNode: from.id, toNode: to.id, width: w, layerId, pathId, renderLayer });
	}

	// Build centerline nodes for each winding quadrant, with connections
	// between quadrants via crossing/bridge points.
	//
	// Quadrant layout (viewing from top):
	//   UL (upper-left)  ←→  UR (upper-right)   connected at top (y>0)
	//    ↕                     ↕
	//   LL (lower-left)  ←→  LR (lower-right)   connected at bottom (y<0)
	//
	// Each quadrant arc has a first and last node. Adjacent quadrants share
	// a junction node at the crossing/bridge entry point (±sepTotal/2, h).
	{
		let _r1 = Dout / 2 / Math.cos(PI / sides);
		let _r2 = _r1 - v;
		for (let winding = 0; winding < N; winding++) {
			const rc = (_r1 + _r2) / 2;
			const quadAngles = [upperLeftAngles, lowerLeftAngles, upperRightAngles, lowerRightAngles];

			// Build arc nodes per quadrant, track first/last
			const quadFirst: ConductorNode[] = [];
			const quadLast: ConductorNode[] = [];

			for (let qi = 0; qi < 4; qi++) {
				let prev: ConductorNode | null = null;
				let first: ConductorNode | null = null;
				for (const phi of quadAngles[qi]) {
					const node = _addNode(rc * Math.cos(phi), rc * Math.sin(phi), 'm3');
					if (!first) first = node;
					if (prev) _addSeg(prev, node, width, 'm3', `w${winding}_q${qi}`, 'windings');
					prev = node;
				}
				quadFirst.push(first!);
				quadLast.push(prev!);
			}

			// Connect quadrants into a continuous winding loop.
			// The order is: UL → UR → LR → LL → (next winding UL)
			// Quadrant indices: 0=UL, 1=LL, 2=UR, 3=LR
			// Connection order: UL(0) → UR(2) → LR(3) → LL(1) → next UL
			const loopOrder = [0, 2, 3, 1]; // UL, UR, LR, LL

			for (let li = 0; li < loopOrder.length; li++) {
				const qi = loopOrder[li];
				const nextQi = loopOrder[(li + 1) % loopOrder.length];
				const fromNode = quadLast[qi];
				const toNode = quadFirst[nextQi];

				// Skip if same node (already connected)
				if (fromNode.id === toNode.id) continue;

				// Determine if this connection is a bridge (same layer)
				// or a crossing (different layer, with vias)
				const isBridge = topBridge.includes(winding) || bottomBridge.includes(winding) || lrBridge.includes(winding);
				const isCrossing = topCrossing.includes(winding) || bottomCrossing.includes(winding) || lrCrossing.includes(winding);

				if (isCrossing) {
					// Connect via lower metal crossing with vias
					const crossFrom = _addNode(fromNode.x, fromNode.y, 'm2');
					const crossTo = _addNode(toNode.x, toNode.y, 'm2');
					_addSeg(crossFrom, crossTo, width, 'm2', `w${winding}_cross_${li}`, 'crossings');
					netVias.push({ id: `via_x_${winding}_${li}_a`, topNode: fromNode.id, bottomNode: crossFrom.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
					netVias.push({ id: `via_x_${winding}_${li}_b`, topNode: toNode.id, bottomNode: crossTo.id, resistance: 0.05, polygons: [], renderLayer: 'vias1' });
				} else {
					// Direct bridge on same layer
					_addSeg(fromNode, toNode, width, 'm3', `w${winding}_bridge_${li}`, 'windings');
				}
			}

			_r1 -= s;
			_r2 -= s;
		}
	}

	// Via connections
	for (const [cx, cy] of viaCentersTCT) {
		const topNode = _addNode(cx, cy, 'm3');
		const botNode = _addNode(cx, cy, 'm1');
		const vPolys = viaGrid(cx, cy, width - 2 * via_in_metal, Math.min(width, extend) - 2 * via_in_metal, via_spacing, via_width);
		netVias.push({ id: `via_ct${netVias.length}`, topNode: topNode.id, bottomNode: botNode.id, resistance: 0.1, polygons: vPolys, renderLayer: 'vias2' });
	}

	for (const [cx, cy] of viaCentersTB) {
		const topNode = _addNode(cx, cy, 'm3');
		const botNode = _addNode(cx, cy, 'm2');
		const dx = Math.sign(cx) * (extend - width) / 2;
		const dy = Math.sign(cy) * (extend - width) / 2;
		let vPolys: Polygon[];
		if (Math.abs(cy) > Math.abs(cx)) {
			vPolys = viaGrid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width);
		} else {
			vPolys = viaGrid(cx, cy + dy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width);
		}
		netVias.push({ id: `via_tb${netVias.length}`, topNode: topNode.id, bottomNode: botNode.id, resistance: 0.1, polygons: vPolys, renderLayer: 'vias1' });
	}

	// Port nodes — find nearest segment nodes to port positions
	// Segment nodes are the winding centerline nodes created above
	const hasBotCTPort = (center_tap_primary && N1 % 2 === 0) || (center_tap_secondary && N2 % 2 !== 0);
	const hasTopCTPort = (center_tap_primary && N1 % 2 !== 0) || (center_tap_secondary && N2 % 2 === 0);

	function findNearest(targetX: number, targetY: number): ConductorNode {
		// Search among nodes that are connected to segments
		const segNodeIds = new Set<string>();
		for (const s of netSegments) { segNodeIds.add(s.fromNode); segNodeIds.add(s.toNode); }
		for (const v of netVias) { segNodeIds.add(v.topNode); segNodeIds.add(v.bottomNode); }

		let best: ConductorNode | null = null;
		let bestDist = Infinity;
		for (const n of netNodes) {
			if (!segNodeIds.has(n.id)) continue;
			const d = (n.x - targetX) ** 2 + (n.y - targetY) ** 2;
			if (d < bestDist) { bestDist = d; best = n; }
		}
		// If no segment node found, create a new port node (for display)
		return best ?? _addNode(targetX, targetY, 'm3');
	}

	const botPortX = hasBotCTPort ? spacing + width : (spacing + width) / 2;
	const topPortX = hasTopCTPort ? spacing + width : (spacing + width) / 2;

	// Place port nodes at the outer edge of port polygons (for display)
	// These may not be connected to winding segments yet — the transformer
	// network connectivity is still being developed
	const p1Plus = _addNode(-botPortX, -Dout / 2 - width, 'm3');
	const p1Minus = _addNode(botPortX, -Dout / 2 - width, 'm3');
	const p2Plus = _addNode(-topPortX, Dout / 2 + width, 'm3');
	const p2Minus = _addNode(topPortX, Dout / 2 + width, 'm3');

	const netPorts: Port[] = [
		{ name: 'P1+', node: p1Plus.id },
		{ name: 'P1-', node: p1Minus.id },
		{ name: 'P2+', node: p2Plus.id },
		{ name: 'P2-', node: p2Minus.id },
	];
	if (hasBotCTPort) {
		const ctBot = _addNode(0, -Dout / 2 - width, 'm3');
		netPorts.push({ name: 'CT1', node: ctBot.id });
	}
	if (hasTopCTPort) {
		const ctTop = _addNode(0, Dout / 2 + width, 'm3');
		netPorts.push({ name: 'CT2', node: ctTop.id });
	}

	const network: ConductorNetwork = { nodes: netNodes, segments: netSegments, vias: netVias, ports: netPorts };

	const layers: LayerMap = {
		windings: polysWindings,
		crossings: polysCrossings,
		vias1: polysVias1,
		centertap: polysCenterTap,
		vias2: polysVias2,
		pgs: [],
	};

	return { network, layers };
}

export function isSymmetricTransformerValid(params: SymmetricTransformerParams): boolean {
	const { Dout, N1, N2, sides, width, spacing, center_tap_primary, center_tap_secondary, via_extent } = params;
	const N = N1 + N2;

	if (center_tap_secondary && center_tap_primary && N % 2 !== 0) return false;

	const h = width + spacing + (Math.SQRT2 - 1) * (2 * spacing + width);
	let q = 2 * width + spacing;
	if (center_tap_secondary || center_tap_primary) q += width + spacing;
	const e = via_extent;
	const d2 = Dout / 2 - (N - 1) * (spacing + width);
	const d1 = Dout / 2 - (N - 1) * spacing - N * width;

	const topBridgeOk = h / 2 + e <= d2 * Math.tan(Math.PI / sides);
	const bottomBridgeOk = h / 2 <= d1 * Math.tan(Math.PI / sides);
	const portOk = q / 2 <= Dout / 2 * Math.tan(Math.PI / sides);

	return topBridgeOk && bottomBridgeOk && portOk;
}

function range(a: number, b?: number): number[] {
	if (b === undefined) { b = a; a = 0; }
	const r: number[] = [];
	for (let i = a; i < b; i++) r.push(i);
	return r;
}
