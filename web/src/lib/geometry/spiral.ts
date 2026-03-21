import type { Polygon, LayerMap, SpiralInductorParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
import { networkToLayers } from './polygonize';
import { viaGrid, pgs4 } from './utils';

/** Build spiral inductor geometry using network-first approach */
export function buildSpiralInductor(params: SpiralInductorParams): GeometryResult {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;

	const PI = Math.PI;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);

	let R1 = Dout / 2 / Math.cos(PI / sides);
	let R2 = R1 - v;

	const nPts = sides / 2;
	const angles: number[] = [];
	for (let i = 0; i < nPts; i++) {
		angles.push(PI * (1 / (2 * nPts) + i * (1 - 1 / nPts) / (nPts - 1)));
	}

	const extend = 2 * (via_width + via_in_metal) + via_spacing;
	const xShift = -s / 2 * Math.cos(PI / sides);
	const yShift = -s / 2 * Math.sin(PI / sides);

	// --- Compute outer/inner traces (same as legacy) ---
	const xOut: number[] = [];
	const yOut: number[] = [];
	const xIn: number[] = [];
	const yIn: number[] = [];

	let r1 = R1, r2 = R2;
	for (let section = 0; section < 2 * N; section++) {
		if (section % 2 === 0) {
			for (const phi of angles) {
				xOut.push(r1 * Math.cos(phi));
				xIn.push(r2 * Math.cos(phi));
				yOut.push(r1 * Math.sin(phi));
				yIn.push(r2 * Math.sin(phi));
			}
		} else {
			for (const phi of angles) {
				xOut.push(-r1 * Math.cos(phi) + xShift);
				xIn.push(-r2 * Math.cos(phi) + xShift);
				yOut.push(-r1 * Math.sin(phi) + yShift);
				yIn.push(-r2 * Math.sin(phi) + yShift);
			}
		}
		r1 -= s / 2;
		r2 -= s / 2;
	}

	// Start connector
	const xOutStart = [Dout / 2 + width, xOut[0]];
	const xInStart = [Dout / 2 + width, xIn[0]];
	const yOutStart = [width + spacing / 2, width + spacing / 2];
	const yInStart = [spacing / 2, spacing / 2];

	// End connector
	const xOutEnd = [xOut[xOut.length - 1]];
	const xInEnd = [xIn[xIn.length - 1]];
	const yOutEnd = [-spacing / 2];
	const yInEnd = [-spacing / 2];

	// Full winding polygon (same as legacy)
	const xPoly = [
		...xOutStart, ...xOut, ...xOutEnd,
		...[...xInEnd].reverse(), ...[...xIn].reverse(), ...[...xInStart].reverse()
	];
	const yPoly = [
		...yOutStart, ...yOut, ...yOutEnd,
		...[...yInEnd].reverse(), ...[...yIn].reverse(), ...[...yInStart].reverse()
	];
	const windingPolygon: Polygon = { x: xPoly, y: yPoly };

	// Underpass polygon (same as legacy)
	const lastXIn = xIn[xIn.length - 1];
	const underpassPolygon: Polygon = {
		x: [lastXIn, Dout / 2 + width, Dout / 2 + width, lastXIn],
		y: [-width - spacing / 2, -width - spacing / 2, -spacing / 2, -spacing / 2],
	};

	// Via polygons (same as legacy)
	const lastXOut = xOut[xOut.length - 1];
	const viaCenterX = lastXOut + (lastXIn - lastXOut) / 2;
	const viaCenterY = -width / 2 - spacing / 2;

	let viaPolys: Polygon[];
	if (extend > width) {
		viaPolys = viaGrid(
			viaCenterX, viaCenterY + (extend - width) / 2,
			width - 2 * via_in_metal, extend - 2 * via_in_metal,
			via_spacing, via_width
		);
	} else {
		viaPolys = viaGrid(
			viaCenterX, viaCenterY,
			width - 2 * via_in_metal, width - 2 * via_in_metal,
			via_spacing, via_width
		);
	}

	// --- Build conductor network ---
	const nodes: ConductorNode[] = [];
	const segments: ConductorSegment[] = [];
	let nid = 0, sid = 0;

	function addNode(x: number, y: number, layerId: string): ConductorNode {
		const node: ConductorNode = { id: `n${nid++}`, x, y, layerId };
		nodes.push(node);
		return node;
	}

	// Port 1 node (start of winding, top metal)
	const p1Node = addNode(Dout / 2 + width, (width + spacing) / 2, 'm3');

	// Winding centerline nodes at each octagon vertex
	let prevNode = p1Node;
	r1 = R1; r2 = R2;
	for (let section = 0; section < 2 * N; section++) {
		for (const phi of angles) {
			let cx: number, cy: number;
			if (section % 2 === 0) {
				cx = (r1 + r2) / 2 * Math.cos(phi);
				cy = (r1 + r2) / 2 * Math.sin(phi);
			} else {
				cx = -(r1 + r2) / 2 * Math.cos(phi) + xShift;
				cy = -(r1 + r2) / 2 * Math.sin(phi) + yShift;
			}
			const node = addNode(cx, cy, 'm3');
			segments.push({
				id: `s${sid++}`, fromNode: prevNode.id, toNode: node.id,
				width, layerId: 'm3', pathId: 'winding', renderLayer: 'windings',
				polygonOverride: undefined,
			});
			prevNode = node;
		}
		r1 -= s / 2;
		r2 -= s / 2;
	}

	// Via top node (end of winding on top metal)
	const viaTopNode = addNode(viaCenterX, viaCenterY, 'm3');
	segments.push({
		id: `s${sid++}`, fromNode: prevNode.id, toNode: viaTopNode.id,
		width, layerId: 'm3', pathId: 'winding', renderLayer: 'windings',
		polygonOverride: undefined,
	});

	// Via bottom node (start of underpass on lower metal)
	const viaBotNode = addNode(viaCenterX, viaCenterY, 'm2');

	// Via connection
	const viaConn: ViaConnection = {
		id: 'via0',
		topNode: viaTopNode.id,
		bottomNode: viaBotNode.id,
		resistance: 0.1,
		polygons: viaPolys,
		renderLayer: 'vias',
	};

	// Port 2 node (end of underpass, lower metal)
	const p2Node = addNode(Dout / 2 + width, -width / 2 - spacing / 2, 'm2');
	segments.push({
		id: `s${sid++}`, fromNode: viaBotNode.id, toNode: p2Node.id,
		width, layerId: 'm2', pathId: 'underpass', renderLayer: 'crossings',
		polygonOverride: underpassPolygon,
	});

	const ports: Port[] = [
		{ name: 'P1', plusNode: p1Node.id, minusNode: p2Node.id },
		{ name: 'P2', plusNode: p2Node.id, minusNode: p1Node.id },
	];

	const network: ConductorNetwork = {
		nodes, segments, vias: [viaConn], ports,
	};

	// --- Use legacy polygon for winding (exact match guaranteed) ---
	// The winding is a single complex polygon that the miter algorithm
	// can't perfectly reproduce due to the start/end connector geometry.
	// Use polygonOverride on all winding segments, with the actual polygon
	// only on the first one (the rest are just network topology).
	// Mark all winding segments with the override on the first segment only.
	const windingSegs = segments.filter(seg => seg.pathId === 'winding');
	if (windingSegs.length > 0) {
		windingSegs[0].polygonOverride = windingPolygon;
		// Mark remaining winding segments so polygonize skips them for polygon generation
		// but they stay in the network for the solver
		for (let i = 1; i < windingSegs.length; i++) {
			windingSegs[i].pathId = 'winding_topology_only';
			windingSegs[i].polygonOverride = { x: [], y: [] }; // empty override = no polygon
		}
	}

	// Derive layers from network
	const layers = networkToLayers(network);
	if (!layers.pgs) layers.pgs = [];

	return { network, layers };
}

export function isSpiralValid(params: SpiralInductorParams): boolean {
	const { Dout, N, sides, width, spacing, via_spacing, via_width, via_in_metal } = params;
	const extend = 2 * (via_width + via_in_metal) + via_spacing;
	if (extend > width) return false;
	const Din = Dout - (N + 1) * (width + spacing);
	if (Math.abs(Din / 2 * Math.atan(Math.PI / sides)) < width + spacing / 2) return false;
	return true;
}

export function addPgs(layers: LayerMap, D: number, w: number, s: number): void {
	layers.pgs = pgs4(D, w, s);
}
