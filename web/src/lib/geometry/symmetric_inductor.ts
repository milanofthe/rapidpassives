import type { Polygon, LayerMap, SymmetricInductorParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
import { viaGrid, routingGeometric45 } from './utils';

export function buildSymmetricInductor(params: SymmetricInductorParams): GeometryResult {
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

	// --- Network construction ---
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

	function addSeg(from: ConductorNode, to: ConductorNode, w: number, layerId: string, pathId: string, renderLayer: 'windings' | 'crossings' | 'centertap'): void {
		segments.push({
			id: `s${sid++}`, fromNode: from.id, toNode: to.id,
			width: w, layerId, pathId, renderLayer,
		});
	}

	// Port nodes — will be assigned after winding segments are built
	// (placeholder, replaced below after segments exist)
	let portLeftNode: ConductorNode = addNode(0, 0, 'm3');
	let portRightNode: ConductorNode = addNode(0, 0, 'm3');

	let r1 = R1, r2 = R2;

	for (let winding = 0; winding < N; winding++) {
		// Left section
		let xOutL: number[] = [], yOutL: number[] = [], xInL: number[] = [], yInL: number[] = [];
		for (const phi of leftAngles) {
			xOutL.push(r1 * Math.cos(phi));
			yOutL.push(r1 * Math.sin(phi));
			xInL.push(r2 * Math.cos(phi));
			yInL.push(r2 * Math.sin(phi));
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

		// Network: left arc centerline nodes
		let prevLeft: ConductorNode | null = null;
		for (const phi of leftAngles) {
			const cx = (r1 + r2) / 2 * Math.cos(phi);
			const cy = (r1 + r2) / 2 * Math.sin(phi);
			const node = addNode(cx, cy, 'm3');
			if (prevLeft) addSeg(prevLeft, node, width, 'm3', `left_w${winding}`, 'windings');
			prevLeft = node;
		}

		// Right section
		let xOutR: number[] = [], yOutR: number[] = [], xInR: number[] = [], yInR: number[] = [];
		for (const phi of rightAngles) {
			xOutR.push(r1 * Math.cos(phi));
			yOutR.push(r1 * Math.sin(phi));
			xInR.push(r2 * Math.cos(phi));
			yInR.push(r2 * Math.sin(phi));
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

		// Network: right arc centerline nodes
		let prevRight: ConductorNode | null = null;
		for (const phi of rightAngles) {
			const cx = (r1 + r2) / 2 * Math.cos(phi);
			const cy = (r1 + r2) / 2 * Math.sin(phi);
			const node = addNode(cx, cy, 'm3');
			if (prevRight) addSeg(prevRight, node, width, 'm3', `right_w${winding}`, 'windings');
			prevRight = node;
		}

		// Crossings
		if (winding !== N - 1) {
			let h: number;
			if (winding % 2 === 0) {
				h = r1 * Math.sin(PI * (0.5 - 1 / sides));
			} else {
				h = (-r2 + s) * Math.sin(PI * (0.5 - 1 / sides));
			}
			const x0 = 0;
			const y0 = h - width - spacing / 2;

			const crossBottom = routingGeometric45(width, spacing, x0, y0, extend);
			polysCrossings.push(crossBottom);

			const crossTop = routingGeometric45(width, spacing, x0, y0, 0);
			polysWindings.push({ x: crossTop.x.map(v => -v), y: crossTop.y });

			viaCentersTB.push([-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing]);
			viaCentersTB.push([sepTotal / 2 + width / 2, h - width / 2]);

			// Network: crossing segment on lower metal
			const crossNodeL = addNode(-sepTotal / 2 - width / 2, h - 3 * width / 2 - spacing, 'm2');
			const crossNodeR = addNode(sepTotal / 2 + width / 2, h - width / 2, 'm2');
			addSeg(crossNodeL, crossNodeR, width, 'm2', `crossing_w${winding}`, 'crossings');
		}

		r1 -= s;
		r2 -= s;
	}

	// Center tap
	if (center_tap) {
		const xCT = [-width / 2, -width / 2, width / 2, width / 2];
		let yCT: number[];
		let xCt1: number, yCt1: number, xCt2: number, yCt2: number;

		if (N % 2 !== 0) {
			if (N <= 2) {
				yCT = [-Dout / 2, Dout / 2 - spacing * (N - 1) - width * (N - 1),
					Dout / 2 - spacing * (N - 1) - width * (N - 1), -Dout / 2];
			} else {
				yCT = [-Dout / 2 + width - extend, Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend,
					Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend, -Dout / 2 + width - extend];
			}
			xCt1 = 0; yCt1 = Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend / 2;
			xCt2 = 0; yCt2 = -Dout / 2 + width / 2 + (width - extend) / 2;
		} else {
			if (N <= 2) {
				yCT = [-Dout / 2, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
					-Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2];
			} else {
				yCT = [-Dout / 2 + width - extend, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
					-Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2 + width - extend];
			}
			xCt1 = 0; yCt1 = -Dout / 2 + spacing * (N - 1) + width * N - width + extend / 2;
			xCt2 = 0; yCt2 = -Dout / 2 + width - extend / 2;
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
		const vPolys = viaGrid(cx, cy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width);
		polysVias2 = polysVias2.concat(vPolys);
		polysVias1 = polysVias1.concat(vPolys);

		// Network: via connection for center tap
		const topNode = addNode(cx, cy, 'm3');
		const botNode = addNode(cx, cy, 'm1');
		vias.push({ id: `via_ct${vias.length}`, topNode: topNode.id, bottomNode: botNode.id, resistance: 0.1, polygons: vPolys, renderLayer: 'vias2' });
	}

	for (const [cx, cy] of viaCentersTB) {
		const dx = Math.sign(cx) * (extend - width) / 2;
		const vPolys = viaGrid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width);
		polysVias1 = polysVias1.concat(vPolys);

		// Network: via connection for crossing bridges
		const topNode = addNode(cx, cy, 'm3');
		const botNode = addNode(cx, cy, 'm2');
		vias.push({ id: `via_tb${vias.length}`, topNode: topNode.id, bottomNode: botNode.id, resistance: 0.1, polygons: vPolys, renderLayer: 'vias1' });
	}

	// Assign port nodes to nearest connected segment nodes
	{
		const segNodeIds = new Set<string>();
		for (const s of segments) { segNodeIds.add(s.fromNode); segNodeIds.add(s.toNode); }
		for (const v of vias) { segNodeIds.add(v.topNode); segNodeIds.add(v.bottomNode); }

		function findNearest(tx: number, ty: number): ConductorNode {
			let best: ConductorNode | null = null, bestD = Infinity;
			for (const n of nodes) {
				if (!segNodeIds.has(n.id)) continue;
				const d = (n.x - tx) ** 2 + (n.y - ty) ** 2;
				if (d < bestD) { bestD = d; best = n; }
			}
			return best ?? addNode(tx, ty, 'm3');
		}

		const portXOffset = center_tap ? spacing + width : (spacing + width) / 2;
		portLeftNode = findNearest(-portXOffset, -Dout / 2);
		portRightNode = findNearest(portXOffset, -Dout / 2);
	}

	const ports: Port[] = [
		{ name: 'P1', plusNode: portLeftNode.id, minusNode: portRightNode.id },
	];
	if (center_tap) {
		const segNodeIds = new Set<string>();
		for (const s of segments) { segNodeIds.add(s.fromNode); segNodeIds.add(s.toNode); }
		let ctBest: ConductorNode | null = null, ctBestD = Infinity;
		for (const n of nodes) {
			if (!segNodeIds.has(n.id)) continue;
			const d = n.x ** 2 + (n.y + Dout / 2) ** 2;
			if (d < ctBestD) { ctBestD = d; ctBest = n; }
		}
		const ctNode = ctBest ?? addNode(0, -Dout / 2, 'm3');
		ports.push({ name: 'CT', plusNode: ctNode.id, minusNode: portLeftNode.id });
	}

	const network: ConductorNetwork = { nodes, segments, vias, ports };

	// Use legacy polygons directly (exact visual match guaranteed)
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

export function isSymmetricInductorValid(params: SymmetricInductorParams): boolean {
	const { Dout, N, sides, width, spacing, via_extent } = params;
	const h = width + spacing + (Math.SQRT2 - 1) * (2 * spacing + width);
	const q = 2 * width + spacing;
	const e = via_extent;
	const d2 = Dout / 2 - (N - 1) * (spacing + width);
	const d1 = Dout / 2 - (N - 1) * spacing - N * width;

	const topBridgeOk = h / 2 + e <= d2 * Math.tan(Math.PI / sides);
	const bottomBridgeOk = h / 2 <= d1 * Math.tan(Math.PI / sides);
	const portOk = q / 2 <= Dout / 2 * Math.tan(Math.PI / sides);

	return topBridgeOk && bottomBridgeOk && portOk;
}
