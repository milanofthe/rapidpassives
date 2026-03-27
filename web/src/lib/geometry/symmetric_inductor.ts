import type { Polygon, LayerMap, SymmetricInductorParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
import { networkToLayers } from './polygonize';
import { viaGrid, routingGeometric45 } from './utils';
import { computeViaResistance } from './via_resistance';

export function buildSymmetricInductor(params: SymmetricInductorParams): GeometryResult {
	const { Dout, N, sides, width, spacing, center_tap, via_extent, via_spacing, via_width, via_in_metal } = params;
	const ar = params.aspectRatio ?? 1;

	const PI = Math.PI;
	const SQRT2 = Math.SQRT2;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);

	const R1_init = Dout / 2 / Math.cos(PI / sides);

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

	// --- Network construction (centerline-first) ---
	const nodes: ConductorNode[] = [];
	const segments: ConductorSegment[] = [];
	const vias: ViaConnection[] = [];
	let nid = 0, sid = 0;

	const _nodeReg = new Map<string, ConductorNode>();
	function addNode(x: number, y: number, layerId: string): ConductorNode {
		const sx = Math.round(x * 1000) / 1000;
		const sy = Math.round(y * 1000) / 1000;
		const key = `${sx},${sy},${layerId}`;
		const existing = _nodeReg.get(key);
		if (existing) return existing;
		const node: ConductorNode = { id: `n${nid++}`, x: sx, y: sy, layerId };
		nodes.push(node);
		_nodeReg.set(key, node);
		return node;
	}

	function addSeg(from: ConductorNode, to: ConductorNode, w: number, layerId: string, pathId: string, renderLayer: 'windings' | 'crossings' | 'centertap'): ConductorSegment {
		const seg: ConductorSegment = {
			id: `s${sid++}`, fromNode: from.id, toNode: to.id,
			width: w, layerId, pathId, renderLayer,
		};
		segments.push(seg);
		return seg;
	}

	// Track via centers for polygon generation
	const viaCentersTB: [number, number][] = [];
	const viaCentersTCT: [number, number][] = [];

	// Build the winding path as centerline segments
	let R1 = R1_init;
	let R2 = R1 - v;

	// Track bottom endpoints for inter-winding connections
	let prevLeftBottom: ConductorNode | null = null;
	let prevRightBottom: ConductorNode | null = null;

	for (let winding = 0; winding < N; winding++) {
		const rc = (R1 + R2) / 2;

		// Left arc: trace centerline nodes
		let prevLeft: ConductorNode | null = null;
		const leftFirst: ConductorNode[] = [];
		const leftLast: ConductorNode[] = [];

		// Add endpoint at sepTotal boundary before arc
		const leftStartNode = addNode(-sepTotal / 2, rc * Math.sin(leftAngles[0]), 'm3');
		prevLeft = leftStartNode;

		for (const phi of leftAngles) {
			const node = addNode(rc * Math.cos(phi), rc * Math.sin(phi), 'm3');
			addSeg(prevLeft!, node, width, 'm3', `left_w${winding}`, 'windings');
			if (leftFirst.length === 0) leftFirst.push(prevLeft!);
			prevLeft = node;
		}

		// Add endpoint at sepTotal boundary after arc
		let leftEndNode: ConductorNode;
		if (winding === N - 1) {
			leftEndNode = addNode(N % 2 === 0 ? -sepTotal / 2 : 0, rc * Math.sin(leftAngles[leftAngles.length - 1]), 'm3');
		} else {
			leftEndNode = addNode(-sepTotal / 2, rc * Math.sin(leftAngles[leftAngles.length - 1]), 'm3');
		}
		addSeg(prevLeft!, leftEndNode, width, 'm3', `left_w${winding}`, 'windings');

		// Right arc: trace centerline nodes
		let prevRight: ConductorNode | null = null;
		const rightStartNode = addNode(sepTotal / 2, rc * Math.sin(rightAngles[0]), 'm3');
		prevRight = rightStartNode;

		for (const phi of rightAngles) {
			const node = addNode(rc * Math.cos(phi), rc * Math.sin(phi), 'm3');
			addSeg(prevRight!, node, width, 'm3', `right_w${winding}`, 'windings');
			prevRight = node;
		}

		let rightEndNode: ConductorNode;
		if (winding === N - 1) {
			rightEndNode = addNode(N % 2 === 0 ? sepTotal / 2 : 0, rc * Math.sin(rightAngles[rightAngles.length - 1]), 'm3');
		} else {
			rightEndNode = addNode(sepTotal / 2, rc * Math.sin(rightAngles[rightAngles.length - 1]), 'm3');
		}
		addSeg(prevRight!, rightEndNode, width, 'm3', `right_w${winding}`, 'windings');

		// Connect to previous winding at the bottom
		// Left arc: start=TOP, end=BOTTOM. Right arc: start=BOTTOM, end=TOP.
		// Inter-winding: prev left BOTTOM → this left BOTTOM
		//                prev right BOTTOM → this right BOTTOM
		if (prevLeftBottom && prevLeftBottom.id !== leftEndNode.id) {
			addSeg(prevLeftBottom, leftEndNode, width, 'm3', `inter_left_w${winding}`, 'windings');
		}
		if (prevRightBottom && prevRightBottom.id !== rightStartNode.id) {
			addSeg(prevRightBottom, rightStartNode, width, 'm3', `inter_right_w${winding}`, 'windings');
		}
		prevLeftBottom = leftEndNode;     // this winding's left BOTTOM
		prevRightBottom = rightStartNode; // this winding's right BOTTOM

		// Crossing between windings (connects left top to right top)
		if (winding !== N - 1) {
			let h: number;
			if (winding % 2 === 0) {
				h = R1 * Math.sin(PI * (0.5 - 1 / sides));
			} else {
				h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			}
			const y0 = h - width - spacing / 2;

			// Crossing on top metal (connects left-end to right-start region)
			// The crossing routing goes from (-sepTotal/2, y0) to (sepTotal/2, y0)
			// One copy on bottom metal (crossings), one mirrored on top (windings)
			const crossTopL = addNode(-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing, 'm3');
			const crossTopR = addNode(sepTotal / 2 + width / 2, h - width / 2, 'm3');

			// Connect arc START (top) to crossing entry points
			// Left arc starts at top, right arc ends at top
			addSeg(leftStartNode, crossTopL, width, 'm3', `cross_top_w${winding}`, 'windings');
			addSeg(crossTopR, rightEndNode, width, 'm3', `cross_top_w${winding}`, 'windings');

			// Bottom metal crossing
			const crossBotL = addNode(-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing, 'm2');
			const crossBotR = addNode(sepTotal / 2 + width / 2, h - width / 2, 'm2');
			addSeg(crossBotL, crossBotR, width, 'm2', `cross_bot_w${winding}`, 'crossings');

			// Vias at crossing endpoints
			const vPolysL = viaGrid(crossTopL.x, crossTopL.y, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width);
			const vPolysR = viaGrid(crossTopR.x, crossTopR.y, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width);
			vias.push({ id: `via_tb_l${winding}`, topNode: crossTopL.id, bottomNode: crossBotL.id, resistance: 0.05, polygons: vPolysL, renderLayer: 'vias1' });
			vias.push({ id: `via_tb_r${winding}`, topNode: crossTopR.id, bottomNode: crossBotR.id, resistance: 0.05, polygons: vPolysR, renderLayer: 'vias1' });

			viaCentersTB.push([crossTopL.x, crossTopL.y]);
			viaCentersTB.push([crossTopR.x, crossTopR.y]);
		}

		R1 -= s;
		R2 -= s;
	}

	// Ports — use outermost winding nodes near the bottom
	const ps = params.portSpacing ?? spacing;
	const portXOffset = center_tap ? ps + width : (ps + width) / 2;
	const portLeft = addNode(-portXOffset, -Dout / 2 - width, 'm3');
	const portRight = addNode(portXOffset, -Dout / 2 - width, 'm3');

	// Connect port nodes to nearest winding endpoint
	// Find the bottommost left and right winding nodes
	const segNodeIds = new Set<string>();
	for (const seg of segments) { segNodeIds.add(seg.fromNode); segNodeIds.add(seg.toNode); }

	function findNearestSeg(tx: number, ty: number): ConductorNode {
		let best: ConductorNode | null = null, bestD = Infinity;
		for (const n of nodes) {
			if (!segNodeIds.has(n.id)) continue;
			const d = (n.x - tx) ** 2 + (n.y - ty) ** 2;
			if (d < bestD) { bestD = d; best = n; }
		}
		return best ?? portLeft;
	}

	const nearLeft = findNearestSeg(-portXOffset, -Dout / 2 - width);
	const nearRight = findNearestSeg(portXOffset, -Dout / 2 - width);

	if (nearLeft.id !== portLeft.id) addSeg(portLeft, nearLeft, width, 'm3', 'port', 'windings');
	if (nearRight.id !== portRight.id) addSeg(portRight, nearRight, width, 'm3', 'port', 'windings');

	const ports: Port[] = [
		{ name: 'P1', node: portLeft.id },
		{ name: 'P2', node: portRight.id },
	];

	if (center_tap) {
		const ctNode = addNode(0, -Dout / 2 - width, 'm3');
		const nearCT = findNearestSeg(0, -Dout / 2 - width);
		if (nearCT.id !== ctNode.id) addSeg(ctNode, nearCT, width, 'm3', 'ct', 'centertap');
		ports.push({ name: 'CT', node: ctNode.id });
	}

	const network: ConductorNetwork = { nodes, segments, vias, ports };

	// --- Generate polygons from legacy code for exact visual match ---
	const layers = generateLegacyPolygons(params);

	// Apply aspect ratio — extend straight side segments only
	if (ar !== 1) {
		const ext = Dout * (ar - 1);
		const shiftY = (y: number) => y > 0 ? y + ext / 2 : y < 0 ? y - ext / 2 : y;
		for (const node of nodes) node.y = shiftY(node.y);
		for (const polys of Object.values(layers)) {
			if (!polys) continue;
			for (const poly of polys) {
				poly.y = poly.y.map(shiftY);
			}
		}
	}

	return { network, layers };
}

/** Generate polygons using the original algorithm (for rendering/GDS) */
function generateLegacyPolygons(params: SymmetricInductorParams): LayerMap {
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

	const polysWindings: Polygon[] = [];
	const polysCrossings: Polygon[] = [];
	const polysCenterTap: Polygon[] = [];
	let polysVias1: Polygon[] = [];
	let polysVias2: Polygon[] = [];

	for (let winding = 0; winding < N; winding++) {
		// Left section
		let xOutL: number[] = [], yOutL: number[] = [], xInL: number[] = [], yInL: number[] = [];
		for (const phi of leftAngles) {
			xOutL.push(R1 * Math.cos(phi)); yOutL.push(R1 * Math.sin(phi));
			xInL.push(R2 * Math.cos(phi)); yInL.push(R2 * Math.sin(phi));
		}
		if (winding === N - 1) {
			if (N % 2 === 0) { xOutL = [-sepTotal/2, ...xOutL, 0]; xInL = [-sepTotal/2, ...xInL, 0]; }
			else { xOutL = [0, ...xOutL, -sepTotal/2]; xInL = [0, ...xInL, -sepTotal/2]; }
		} else {
			xOutL = [-sepTotal/2, ...xOutL, -sepTotal/2]; xInL = [-sepTotal/2, ...xInL, -sepTotal/2];
		}
		yOutL = [yOutL[0], ...yOutL, yOutL[yOutL.length-1]]; yInL = [yInL[0], ...yInL, yInL[yInL.length-1]];
		polysWindings.push({ x: [...xOutL, ...[...xInL].reverse()], y: [...yOutL, ...[...yInL].reverse()] });

		// Right section
		let xOutR: number[] = [], yOutR: number[] = [], xInR: number[] = [], yInR: number[] = [];
		for (const phi of rightAngles) {
			xOutR.push(R1 * Math.cos(phi)); yOutR.push(R1 * Math.sin(phi));
			xInR.push(R2 * Math.cos(phi)); yInR.push(R2 * Math.sin(phi));
		}
		if (winding === N - 1) {
			if (N % 2 === 0) { xOutR = [0, ...xOutR, sepTotal/2]; xInR = [0, ...xInR, sepTotal/2]; }
			else { xOutR = [sepTotal/2, ...xOutR, 0]; xInR = [sepTotal/2, ...xInR, 0]; }
		} else {
			xOutR = [sepTotal/2, ...xOutR, sepTotal/2]; xInR = [sepTotal/2, ...xInR, sepTotal/2];
		}
		yOutR = [yOutR[0], ...yOutR, yOutR[yOutR.length-1]]; yInR = [yInR[0], ...yInR, yInR[yInR.length-1]];
		polysWindings.push({ x: [...xOutR, ...[...xInR].reverse()], y: [...yOutR, ...[...yInR].reverse()] });

		// Crossings
		if (winding !== N - 1) {
			let h: number;
			if (winding % 2 === 0) { h = R1 * Math.sin(PI * (0.5 - 1 / sides)); }
			else { h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides)); }
			const crossBottom = routingGeometric45(width, spacing, 0, h - width - spacing / 2, extend);
			polysCrossings.push(crossBottom);
			const crossTop = routingGeometric45(width, spacing, 0, h - width - spacing / 2, 0);
			polysWindings.push({ x: crossTop.x.map(v => -v), y: crossTop.y });

			const viaCTB = [
				[-sepTotal/2 - width/2, h - 3*width/2 - spacing],
				[sepTotal/2 + width/2, h - width/2],
			];
			for (const [cx, cy] of viaCTB) {
				const dx = Math.sign(cx) * (extend - width) / 2;
				polysVias1 = polysVias1.concat(
					viaGrid(cx + dx, cy, extend - 2*via_in_metal, width - 2*via_in_metal, via_spacing, via_width)
				);
			}
		}

		R1 -= s; R2 -= s;
	}

	// Center tap
	if (center_tap) {
		R1 = Dout / 2 / Math.cos(PI / sides); R2 = R1 - v;
		const xCT = [-width/2, -width/2, width/2, width/2];
		let yCT: number[];
		if (N % 2 !== 0) {
			if (N <= 2) { yCT = [-Dout/2, Dout/2 - spacing*(N-1) - width*(N-1), Dout/2 - spacing*(N-1) - width*(N-1), -Dout/2]; }
			else { yCT = [-Dout/2 + width - extend, Dout/2 - spacing*(N-1) - width*(N-1) - extend, Dout/2 - spacing*(N-1) - width*(N-1) - extend, -Dout/2 + width - extend]; }
		} else {
			if (N <= 2) { yCT = [-Dout/2, -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2]; }
			else { yCT = [-Dout/2 + width - extend, -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + width - extend]; }
		}
		if (N <= 2) {
			polysWindings.push({ x: xCT, y: yCT });
		} else {
			polysCenterTap.push({ x: xCT, y: yCT });

			// Via centers for center tap
			let xCt1: number, yCt1: number, xCt2: number, yCt2: number;
			if (N % 2 !== 0) {
				xCt1 = 0; yCt1 = Dout/2 - spacing*(N-1) - width*(N-1) - extend/2;
				xCt2 = 0; yCt2 = -Dout/2 + width/2 + (width - extend)/2;
			} else {
				xCt1 = 0; yCt1 = -Dout/2 + spacing*(N-1) + width*N - width + extend/2;
				xCt2 = 0; yCt2 = -Dout/2 + width - extend/2;
			}

			const xVP1 = [xCt1-width/2, xCt1-width/2, xCt1+width/2, xCt1+width/2];
			const yVP1 = [yCt1-extend/2, yCt1+extend/2, yCt1+extend/2, yCt1-extend/2];
			const xVP2 = [xCt2-width/2, xCt2-width/2, xCt2+width/2, xCt2+width/2];
			const yVP2 = [yCt2-extend/2, yCt2+extend/2, yCt2+extend/2, yCt2-extend/2];

			polysWindings.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP1, y: yVP1 });
			polysCenterTap.push({ x: xVP1, y: yVP1 });
			polysCrossings.push({ x: xVP2, y: yVP2 });
			polysCenterTap.push({ x: xVP2, y: yVP2 });

			// Via grids for center tap
			for (const [cx, cy] of [[xCt1, yCt1], [xCt2, yCt2]]) {
				const vp = viaGrid(cx, cy, width - 2*via_in_metal, extend - 2*via_in_metal, via_spacing, via_width);
				polysVias2 = polysVias2.concat(vp);
				polysVias1 = polysVias1.concat(vp);
			}
		}
	}

	// Ports
	const ps2 = params.portSpacing ?? spacing;
	const pxo = center_tap ? ps2 + width : (ps2 + width) / 2;
	let xPort: number[], yPort: number[];
	if (center_tap) {
		xPort = [-sepTotal/2, -pxo + width/2, -pxo + width/2, -pxo - width/2, -pxo - width/2, -sepTotal/2];
		yPort = [-Dout/2 + width, -Dout/2 + width, -Dout/2 - width, -Dout/2 - width, -Dout/2, -Dout/2];
		polysWindings.push({ x: [-width/2, -width/2, width/2, width/2], y: [-Dout/2 - width, -Dout/2 + width, -Dout/2 + width, -Dout/2 - width] });
	} else {
		xPort = [-sepTotal/2, -pxo + width/2, -pxo + width/2, -pxo - width/2, -pxo - width/2, -sepTotal/2];
		yPort = [-Dout/2 + width, -Dout/2 + width, -Dout/2 - width, -Dout/2 - width, -Dout/2, -Dout/2];
	}
	polysWindings.push({ x: xPort, y: yPort });
	polysWindings.push({ x: xPort.map(v => -v), y: yPort });

	return {
		windings: polysWindings, crossings: polysCrossings,
		vias1: polysVias1, centertap: polysCenterTap, vias2: polysVias2, pgs: [],
	};
}

export function isSymmetricInductorValid(params: SymmetricInductorParams): boolean {
	const { Dout, N, sides, width, spacing, via_extent } = params;
	const h = width + spacing + (Math.SQRT2 - 1) * (2 * spacing + width);
	const q = 2 * width + spacing;
	const e = via_extent;
	const d2 = Dout / 2 - (N - 1) * (spacing + width);
	const d1 = Dout / 2 - (N - 1) * spacing - N * width;
	return (h / 2 + e <= d2 * Math.tan(Math.PI / sides))
		&& (h / 2 <= d1 * Math.tan(Math.PI / sides))
		&& (q / 2 <= Dout / 2 * Math.tan(Math.PI / sides));
}
