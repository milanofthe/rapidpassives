import type { Polygon, LayerMap } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';

export interface MarchandBalunParams {
	/** Coupled section length (um) */
	coupledLength: number;
	/** Trace width (um) */
	width: number;
	/** Gap between coupled lines (um) */
	gap: number;
	/** Open stub length — λ/4 stub for compensation (um), 0 to disable */
	stubLength: number;
	/** Feed line length (um) */
	feedLength: number;
}

/** Build a Marchand balun layout — two coupled line sections with open/short stubs.
 *
 *  Structure (top view):
 *  P1 (unbalanced) feeds into a coupled section.
 *  The coupled section has two parallel traces separated by `gap`.
 *  At the far end, the through trace splits into two balanced outputs P2+, P2-.
 *  Optional open stubs extend from the coupled section ends for bandwidth compensation.
 */
export function buildMarchandBalun(params: MarchandBalunParams): GeometryResult {
	const { coupledLength, width, gap, stubLength, feedLength } = params;

	const polys: Polygon[] = [];
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	// Center the coupled section at origin, running along X axis
	const halfL = coupledLength / 2;
	const halfGap = gap / 2;

	// Upper trace (through line): from -halfL to +halfL, at y = halfGap + width/2
	const upperY = halfGap + width / 2;
	polys.push({
		x: [-halfL, halfL, halfL, -halfL],
		y: [upperY - width / 2, upperY - width / 2, upperY + width / 2, upperY + width / 2],
	});

	// Lower trace (coupled line): from -halfL to +halfL, at y = -(halfGap + width/2)
	const lowerY = -(halfGap + width / 2);
	polys.push({
		x: [-halfL, halfL, halfL, -halfL],
		y: [lowerY - width / 2, lowerY - width / 2, lowerY + width / 2, lowerY + width / 2],
	});

	// Input feed (P1) — extends left from upper trace
	polys.push({
		x: [-halfL - feedLength, -halfL, -halfL, -halfL - feedLength],
		y: [upperY - width / 2, upperY - width / 2, upperY + width / 2, upperY + width / 2],
	});

	// Balanced output feeds — extend right, splitting into P2+ (up) and P2- (down)
	// P2+ continues from upper trace going right
	polys.push({
		x: [halfL, halfL + feedLength, halfL + feedLength, halfL],
		y: [upperY - width / 2, upperY - width / 2, upperY + width / 2, upperY + width / 2],
	});

	// P2- continues from lower trace going right
	polys.push({
		x: [halfL, halfL + feedLength, halfL + feedLength, halfL],
		y: [lowerY - width / 2, lowerY - width / 2, lowerY + width / 2, lowerY + width / 2],
	});

	// Open stubs for compensation (extend vertically from ends of coupled line)
	if (stubLength > 0) {
		// Stub from left end of lower trace, going down
		polys.push({
			x: [-halfL - width / 2, -halfL + width / 2, -halfL + width / 2, -halfL - width / 2],
			y: [lowerY - width / 2, lowerY - width / 2, lowerY - width / 2 - stubLength, lowerY - width / 2 - stubLength],
		});

		// Stub from right end of upper trace is the output, so stub from left end of upper going up
		polys.push({
			x: [-halfL - width / 2, -halfL + width / 2, -halfL + width / 2, -halfL - width / 2],
			y: [upperY + width / 2, upperY + width / 2, upperY + width / 2 + stubLength, upperY + width / 2 + stubLength],
		});
	}

	// Port nodes
	const p1 = { id: 'n0', x: -halfL - feedLength, y: upperY, layerId: 'm3' } as ConductorNode;
	const p2p = { id: 'n1', x: halfL + feedLength, y: upperY, layerId: 'm3' } as ConductorNode;
	const p2n = { id: 'n2', x: halfL + feedLength, y: lowerY, layerId: 'm3' } as ConductorNode;
	nodes.push(p1, p2p, p2n);
	ports.push(
		{ name: 'IN', node: p1.id },
		{ name: 'BAL+', node: p2p.id },
		{ name: 'BAL-', node: p2n.id },
	);

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = { windings: polys };

	return { network, layers };
}

export function isMarchandBalunValid(params: MarchandBalunParams): boolean {
	return params.coupledLength > 0 && params.width > 0 && params.gap > 0
		&& params.feedLength > 0 && params.stubLength >= 0;
}
