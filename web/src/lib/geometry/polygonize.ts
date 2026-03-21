import type { Polygon, LayerName, LayerMap } from './types';
import type { ConductorNetwork, ConductorSegment, ConductorNode } from './network';

/**
 * Derive a LayerMap (renderable polygons) from a ConductorNetwork.
 *
 * Segments with the same pathId are joined into continuous polygon outlines
 * using miter joins at shared nodes. Segments with polygonOverride use
 * the override directly. Via polygons are copied as-is.
 */
export function networkToLayers(network: ConductorNetwork): LayerMap {
	const layers: LayerMap = {};

	const nodeMap = new Map<string, ConductorNode>();
	for (const n of network.nodes) nodeMap.set(n.id, n);

	// Group segments by pathId
	const pathGroups = new Map<string, ConductorSegment[]>();
	for (const seg of network.segments) {
		const group = pathGroups.get(seg.pathId) ?? [];
		group.push(seg);
		pathGroups.set(seg.pathId, group);
	}

	// Process each path
	for (const [, segs] of pathGroups) {
		// Separate override segments from normal ones
		const overrides = segs.filter(s => s.polygonOverride);
		const normal = segs.filter(s => !s.polygonOverride);

		// Add override polygons directly
		for (const seg of overrides) {
			pushPoly(layers, seg.renderLayer, seg.polygonOverride!);
		}

		if (normal.length === 0) continue;

		// Order normal segments into chains (start→end)
		const chains = buildChains(normal);

		for (const chain of chains) {
			const poly = chainToPolygon(chain, nodeMap);
			if (poly) {
				pushPoly(layers, chain[0].renderLayer, poly);
			}
		}
	}

	// Add via polygons
	for (const via of network.vias) {
		for (const poly of via.polygons) {
			pushPoly(layers, via.renderLayer, poly);
		}
	}

	return layers;
}

/** Add a polygon to a LayerMap, creating the array if needed */
function pushPoly(layers: LayerMap, layer: LayerName, poly: Polygon): void {
	if (!layers[layer]) layers[layer] = [];
	layers[layer]!.push(poly);
}

/**
 * Build ordered chains of connected segments.
 * Each chain is a sequence of segments where seg[i].toNode === seg[i+1].fromNode.
 */
function buildChains(segments: ConductorSegment[]): ConductorSegment[][] {
	if (segments.length === 0) return [];
	if (segments.length === 1) return [segments];

	// Build adjacency: nodeId → segments starting/ending there
	const fromMap = new Map<string, ConductorSegment>();
	const toMap = new Map<string, ConductorSegment>();
	for (const seg of segments) {
		fromMap.set(seg.fromNode, seg);
		toMap.set(seg.toNode, seg);
	}

	// Find chain start nodes (nodes that are a fromNode but not a toNode)
	const toNodes = new Set(segments.map(s => s.toNode));
	const startSegs = segments.filter(s => !toNodes.has(s.fromNode));

	// If no clear start (closed loop), pick the first segment
	if (startSegs.length === 0) startSegs.push(segments[0]);

	const used = new Set<string>();
	const chains: ConductorSegment[][] = [];

	for (const start of startSegs) {
		if (used.has(start.id)) continue;
		const chain: ConductorSegment[] = [];
		let current: ConductorSegment | undefined = start;
		while (current && !used.has(current.id)) {
			used.add(current.id);
			chain.push(current);
			current = fromMap.get(current.toNode);
		}
		if (chain.length > 0) chains.push(chain);
	}

	// Pick up any remaining unchained segments as single-segment chains
	for (const seg of segments) {
		if (!used.has(seg.id)) {
			chains.push([seg]);
		}
	}

	return chains;
}

/**
 * Convert an ordered chain of segments into a single closed polygon
 * using perpendicular offsets with miter joins at corners.
 */
function chainToPolygon(
	chain: ConductorSegment[],
	nodeMap: Map<string, ConductorNode>
): Polygon | null {
	if (chain.length === 0) return null;

	const leftPoints: { x: number; y: number }[] = [];
	const rightPoints: { x: number; y: number }[] = [];

	for (let i = 0; i < chain.length; i++) {
		const seg = chain[i];
		const from = nodeMap.get(seg.fromNode)!;
		const to = nodeMap.get(seg.toNode)!;
		const hw = seg.width / 2;

		// Direction and perpendicular
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 1e-12) continue;
		const nx = -dy / len; // perpendicular (left)
		const ny = dx / len;

		if (i === 0) {
			// First segment: start cap
			leftPoints.push({ x: from.x + nx * hw, y: from.y + ny * hw });
			rightPoints.push({ x: from.x - nx * hw, y: from.y - ny * hw });
		}

		if (i > 0) {
			// Miter join at shared node between chain[i-1] and chain[i]
			const prevSeg = chain[i - 1];
			const prevFrom = nodeMap.get(prevSeg.fromNode)!;
			const prevTo = nodeMap.get(prevSeg.toNode)!;
			const prevHw = prevSeg.width / 2;

			const pdx = prevTo.x - prevFrom.x;
			const pdy = prevTo.y - prevFrom.y;
			const plen = Math.sqrt(pdx * pdx + pdy * pdy);
			const pnx = -pdy / plen;
			const pny = pdx / plen;

			// Miter: intersect the two offset lines
			const miterL = miterPoint(prevTo, pnx, pny, prevHw, nx, ny, hw, dx, dy, pdx, pdy);
			const miterR = miterPoint(prevTo, -pnx, -pny, prevHw, -nx, -ny, hw, dx, dy, pdx, pdy);

			if (miterL) {
				leftPoints.push(miterL);
			} else {
				leftPoints.push({ x: from.x + nx * hw, y: from.y + ny * hw });
			}
			if (miterR) {
				rightPoints.push(miterR);
			} else {
				rightPoints.push({ x: from.x - nx * hw, y: from.y - ny * hw });
			}
		}

		// End cap of last segment
		if (i === chain.length - 1) {
			leftPoints.push({ x: to.x + nx * hw, y: to.y + ny * hw });
			rightPoints.push({ x: to.x - nx * hw, y: to.y - ny * hw });
		}
	}

	// Assemble: left forward, right reversed
	const x: number[] = [];
	const y: number[] = [];
	for (const p of leftPoints) { x.push(p.x); y.push(p.y); }
	for (let i = rightPoints.length - 1; i >= 0; i--) {
		x.push(rightPoints[i].x);
		y.push(rightPoints[i].y);
	}

	return { x, y };
}

/**
 * Compute the miter point where two offset lines meet at a shared node.
 * Returns the intersection, or null if lines are parallel.
 */
function miterPoint(
	node: ConductorNode,
	pnx: number, pny: number, phw: number,
	nx: number, ny: number, hw: number,
	dx: number, dy: number,
	pdx: number, pdy: number,
): { x: number; y: number } | null {
	// Line 1: point on prev offset line, direction along prev segment
	const p1x = node.x + pnx * phw;
	const p1y = node.y + pny * phw;

	// Line 2: point on current offset line, direction along current segment
	const p2x = node.x + nx * hw;
	const p2y = node.y + ny * hw;

	// Intersect: p1 + t*pd = p2 + s*d
	const denom = pdx * dy - pdy * dx;
	if (Math.abs(denom) < 1e-12) return null; // parallel

	const t = ((p2x - p1x) * dy - (p2y - p1y) * dx) / denom;
	return {
		x: p1x + t * pdx,
		y: p1y + t * pdy,
	};
}
