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

	const nodes: ConductorNode[] = [];
	const segments: ConductorSegment[] = [];
	let nodeIdx = 0;
	let segIdx = 0;

	function addNode(x: number, y: number, layerId: string): ConductorNode {
		const node: ConductorNode = { id: `n${nodeIdx++}`, x, y, layerId };
		nodes.push(node);
		return node;
	}

	function addSegment(from: ConductorNode, to: ConductorNode, w: number, layerId: string, pathId: string, renderLayer: 'windings' | 'crossings', override?: Polygon): ConductorSegment {
		const seg: ConductorSegment = {
			id: `s${segIdx++}`, fromNode: from.id, toNode: to.id,
			width: w, layerId, pathId, renderLayer,
			...(override ? { polygonOverride: override } : {}),
		};
		segments.push(seg);
		return seg;
	}

	// --- Build winding centerline nodes ---
	// The centerline radius is midway between R1 and R2
	// Each point on the octagon edge at a given angle is a node

	// Start connector: port node at the outer end
	const portStartY = (width + spacing / 2 + spacing / 2) / 2; // midpoint of start connector
	const portNode = addNode(Dout / 2 + width, portStartY, 'm3');

	// First winding node (where start connector meets the spiral)
	const firstOutX = R1 * Math.cos(angles[0]);
	const firstInX = R2 * Math.cos(angles[0]);
	const firstCenterX = (firstOutX + firstInX) / 2;
	const firstCenterY = (R1 + R2) / 2 * Math.sin(angles[0]);
	const firstWindingNode = addNode(firstCenterX, firstCenterY, 'm3');

	// Start connector segment (from port to first winding node)
	// This is a straight horizontal-ish segment — use polygonOverride to match legacy exactly
	const xOutStart = [Dout / 2 + width, firstOutX];
	const xInStart = [Dout / 2 + width, firstInX];
	const yOutStart = [width + spacing / 2, width + spacing / 2];
	const yInStart = [spacing / 2, spacing / 2];
	addSegment(portNode, firstWindingNode, width, 'm3', 'winding_top', 'windings', {
		x: [...xOutStart, ...[...xInStart].reverse()],
		y: [...yOutStart, ...[...yInStart].reverse()],
	});

	// Spiral winding nodes
	let prevNode = firstWindingNode;
	let r1 = R1, r2 = R2;

	for (let section = 0; section < 2 * N; section++) {
		for (let ai = 0; ai < nPts; ai++) {
			// Skip the very first point (already created as firstWindingNode)
			if (section === 0 && ai === 0) continue;

			const phi = angles[ai];
			let cx: number, cy: number;
			if (section % 2 === 0) {
				cx = (r1 + r2) / 2 * Math.cos(phi);
				cy = (r1 + r2) / 2 * Math.sin(phi);
			} else {
				cx = -(r1 + r2) / 2 * Math.cos(phi) + xShift;
				cy = -(r1 + r2) / 2 * Math.sin(phi) + yShift;
			}

			const node = addNode(cx, cy, 'm3');
			addSegment(prevNode, node, width, 'm3', 'winding_top', 'windings');
			prevNode = node;
		}
		r1 -= s / 2;
		r2 -= s / 2;
	}

	// End connector node (where spiral meets the via)
	const lastWindingNode = prevNode;
	const endConnectorNode = addNode(lastWindingNode.x, -spacing / 2, 'm3');
	addSegment(lastWindingNode, endConnectorNode, width, 'm3', 'winding_top', 'windings');

	// --- Via connection ---
	const viaCenterX = lastWindingNode.x; // approximately
	const viaCenterY = -width / 2 - spacing / 2;
	const viaTopNode = endConnectorNode;
	const viaBotNode = addNode(endConnectorNode.x, -spacing / 2, 'm2');

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

	const viaConn: ViaConnection = {
		id: 'via0',
		topNode: viaTopNode.id,
		bottomNode: viaBotNode.id,
		resistance: 0.1, // placeholder — computed from via count + resistivity
		polygons: viaPolys,
		renderLayer: 'vias',
	};

	// --- Underpass ---
	const underpassEnd = addNode(Dout / 2 + width, -width / 2 - spacing / 2, 'm2');

	// Underpass is a simple rectangle — use polygonOverride for exact match
	const lastXIn = lastWindingNode.x; // inner edge x from legacy
	addSegment(viaBotNode, underpassEnd, width, 'm2', 'underpass', 'crossings', {
		x: [lastXIn, Dout / 2 + width, Dout / 2 + width, lastXIn],
		y: [-width - spacing / 2, -width - spacing / 2, -spacing / 2, -spacing / 2],
	});

	// --- Ports ---
	const ports: Port[] = [
		{ name: 'P1', plusNode: portNode.id, minusNode: underpassEnd.id },
		{ name: 'P2', plusNode: underpassEnd.id, minusNode: portNode.id },
	];

	const network: ConductorNetwork = {
		nodes,
		segments,
		vias: [viaConn],
		ports,
	};

	// --- Derive polygons ---
	const layers = networkToLayers(network);

	// Ensure empty pgs array exists
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
