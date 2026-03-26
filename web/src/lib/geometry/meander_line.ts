import type { Polygon, LayerMap } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, Port, GeometryResult } from './network';

export interface MeanderLineParams {
	/** Number of meander segments (half-periods) */
	segments: number;
	/** Length of each parallel segment (um) */
	segmentLength: number;
	/** Trace width (um) */
	width: number;
	/** Spacing between parallel runs (um) */
	spacing: number;
}

/** Build a meander (serpentine) delay line */
export function buildMeanderLine(params: MeanderLineParams): GeometryResult {
	const { segments, segmentLength, width, spacing } = params;
	const pitch = width + spacing;

	const nodes: ConductorNode[] = [];
	const segs: ConductorSegment[] = [];
	const polys: Polygon[] = [];
	let nid = 0, sid = 0;

	// Build the meander as a series of rectangles:
	// Vertical runs + horizontal connecting turns
	// Starting from bottom-left, going up, then right-turn, down, right-turn, up...

	const totalWidth = segments * pitch;
	const x0 = -totalWidth / 2;
	const yBottom = -segmentLength / 2;
	const yTop = segmentLength / 2;

	// Entry feed (horizontal, extending left from first segment)
	const feedLen = width * 3;
	polys.push({
		x: [x0 - feedLen, x0 + width / 2, x0 + width / 2, x0 - feedLen],
		y: [yBottom - width / 2, yBottom - width / 2, yBottom + width / 2, yBottom + width / 2],
	});

	for (let i = 0; i < segments; i++) {
		const cx = x0 + i * pitch + width / 2;
		const goingUp = i % 2 === 0;

		// Vertical segment
		polys.push({
			x: [cx - width / 2, cx + width / 2, cx + width / 2, cx - width / 2],
			y: [yBottom, yBottom, yTop, yTop],
		});

		// Horizontal turn connecting to next segment
		if (i < segments - 1) {
			const nextCx = cx + pitch;
			const turnY = goingUp ? yTop : yBottom;
			polys.push({
				x: [cx - width / 2, nextCx + width / 2, nextCx + width / 2, cx - width / 2],
				y: [turnY - width / 2, turnY - width / 2, turnY + width / 2, turnY + width / 2],
			});
		}
	}

	// Exit feed (horizontal, extending right from last segment)
	const lastCx = x0 + (segments - 1) * pitch + width / 2;
	const lastGoingUp = (segments - 1) % 2 === 0;
	const exitY = lastGoingUp ? yTop : yBottom;
	polys.push({
		x: [lastCx - width / 2, lastCx + feedLen, lastCx + feedLen, lastCx - width / 2],
		y: [exitY - width / 2, exitY - width / 2, exitY + width / 2, exitY + width / 2],
	});

	// Network nodes for port markers
	const p1Node: ConductorNode = { id: `n${nid++}`, x: x0 - feedLen, y: yBottom, layerId: 'm3' };
	const p2Node: ConductorNode = { id: `n${nid++}`, x: lastCx + feedLen, y: exitY, layerId: 'm3' };
	nodes.push(p1Node, p2Node);

	const ports: Port[] = [
		{ name: 'P1', node: p1Node.id },
		{ name: 'P2', node: p2Node.id },
	];

	const network: ConductorNetwork = { nodes, segments: segs, vias: [], ports };
	const layers: LayerMap = { windings: polys };

	return { network, layers };
}

export function isMeanderLineValid(params: MeanderLineParams): boolean {
	return params.segments >= 2 && params.segmentLength > 0 && params.width > 0 && params.spacing > 0;
}
