import type { Polygon, LayerMap } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';

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

/** Build a meander (serpentine) delay line as a single continuous polygon */
export function buildMeanderLine(params: MeanderLineParams): GeometryResult {
	const { segments, segmentLength, width, spacing } = params;
	const pitch = width + spacing;
	const hw = width / 2;

	// Trace the centerline, then offset to build a single polygon
	// Centerline goes: entry → up → turn right → down → turn right → up → ... → exit
	const totalW = (segments - 1) * pitch;
	const x0 = -totalW / 2;
	const yBot = -segmentLength / 2;
	const yTop = segmentLength / 2;
	const feedLen = width * 3;

	// Build outer (right side) and inner (left side) edge paths
	const outerX: number[] = [];
	const outerY: number[] = [];
	const innerX: number[] = [];
	const innerY: number[] = [];

	// Entry feed - horizontal from left
	const entryX = x0 - feedLen;
	outerX.push(entryX, x0);
	outerY.push(yBot + hw, yBot + hw);
	innerX.push(entryX, x0);
	innerY.push(yBot - hw, yBot - hw);

	for (let i = 0; i < segments; i++) {
		const cx = x0 + i * pitch;
		const goingUp = i % 2 === 0;
		const nextCx = cx + pitch;

		if (goingUp) {
			// Right edge goes up on the right side of trace
			outerX.push(cx + hw, cx + hw);
			outerY.push(yBot, yTop);
			// Left edge goes up on the left side
			innerX.push(cx - hw, cx - hw);
			innerY.push(yBot, yTop);

			// Turn at top connecting to next segment
			if (i < segments - 1) {
				outerX.push(nextCx + hw, nextCx + hw);
				outerY.push(yTop, yTop);
				innerX.push(nextCx - hw, nextCx - hw);
				innerY.push(yTop + hw, yTop + hw);
				// The outer side of the U-turn is the top
				// Rewrite: trace the outline properly
			}
		}
	}

	// Simpler approach: build the meander as individual connected rectangles
	// and let polygon merge handle the union
	const polys: Polygon[] = [];

	// Entry feed
	polys.push({
		x: [entryX, x0 + hw, x0 + hw, entryX],
		y: [yBot - hw, yBot - hw, yBot + hw, yBot + hw],
	});

	for (let i = 0; i < segments; i++) {
		const cx = x0 + i * pitch;

		// Vertical segment
		polys.push({
			x: [cx - hw, cx + hw, cx + hw, cx - hw],
			y: [yBot - hw, yBot - hw, yTop + hw, yTop + hw],
		});

		// Turn connecting to next segment
		if (i < segments - 1) {
			const goingUp = i % 2 === 0;
			const turnY = goingUp ? yTop : yBot;
			const nextCx = cx + pitch;
			polys.push({
				x: [cx - hw, nextCx + hw, nextCx + hw, cx - hw],
				y: [turnY - hw, turnY - hw, turnY + hw, turnY + hw],
			});
		}
	}

	// Exit feed
	const lastCx = x0 + (segments - 1) * pitch;
	const lastGoingUp = (segments - 1) % 2 === 0;
	const exitY = lastGoingUp ? yTop : yBot;
	polys.push({
		x: [lastCx - hw, lastCx + feedLen, lastCx + feedLen, lastCx - hw],
		y: [exitY - hw, exitY - hw, exitY + hw, exitY + hw],
	});

	// Network nodes for port markers
	const nodes: ConductorNode[] = [];
	const p1Node: ConductorNode = { id: 'n0', x: entryX, y: yBot, layerId: 'm3' };
	const p2Node: ConductorNode = { id: 'n1', x: lastCx + feedLen, y: exitY, layerId: 'm3' };
	nodes.push(p1Node, p2Node);

	const ports: Port[] = [
		{ name: 'P1', node: p1Node.id },
		{ name: 'P2', node: p2Node.id },
	];

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = { windings: polys };

	return { network, layers };
}

export function isMeanderLineValid(params: MeanderLineParams): boolean {
	return params.segments >= 2 && params.segmentLength > 0 && params.width > 0 && params.spacing > 0;
}
