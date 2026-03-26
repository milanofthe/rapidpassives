import type { Polygon, LayerMap, PatchAntennaParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, Port, GeometryResult } from './network';
import { networkToLayers } from './polygonize';

/** Build a microstrip patch antenna layout */
export function buildPatchAntenna(params: PatchAntennaParams): GeometryResult {
	const { W, L, feedType, feedWidth, feedLength, insetDepth, insetGap, groundMargin } = params;

	const nodes: ConductorNode[] = [];
	const segments: ConductorSegment[] = [];
	const ports: Port[] = [];
	let nid = 0, sid = 0;

	// Ground plane dimensions
	const Wg = W + 2 * groundMargin;
	const Lg = L + 2 * groundMargin;

	// Ground plane centered at origin (on M2 / crossings layer)
	const groundPoly: Polygon = {
		x: [-Wg / 2, Wg / 2, Wg / 2, -Wg / 2],
		y: [-Lg / 2, -Lg / 2, Lg / 2, Lg / 2],
	};

	// Patch centered at origin (on M3 / windings layer)
	let patchPolys: Polygon[];

	if (feedType === 'inset' && insetDepth > 0) {
		// Patch with inset notch cut from bottom edge
		// The notch is centered at x=0, cutting from y=-L/2 upward by insetDepth
		const notchHalfW = feedWidth / 2 + insetGap;
		patchPolys = [{
			x: [
				-W / 2,
				-notchHalfW,
				-notchHalfW,
				-feedWidth / 2,
				-feedWidth / 2,
				feedWidth / 2,
				feedWidth / 2,
				notchHalfW,
				notchHalfW,
				W / 2,
				W / 2,
				-W / 2,
			],
			y: [
				-L / 2,
				-L / 2,
				-L / 2 + insetDepth,
				-L / 2 + insetDepth,
				-L / 2,
				-L / 2,
				-L / 2 + insetDepth,
				-L / 2 + insetDepth,
				-L / 2,
				-L / 2,
				L / 2,
				L / 2,
			],
		}];
	} else {
		// Simple rectangular patch
		patchPolys = [{
			x: [-W / 2, W / 2, W / 2, -W / 2],
			y: [-L / 2, -L / 2, L / 2, L / 2],
		}];
	}

	// Feed line: from bottom of patch down to edge of ground plane
	const feedStartY = -L / 2;
	const feedEndY = -Lg / 2 - feedLength;
	const feedPoly: Polygon = {
		x: [-feedWidth / 2, feedWidth / 2, feedWidth / 2, -feedWidth / 2],
		y: [feedEndY, feedEndY, feedStartY, feedStartY],
	};

	// Build conductor network for port markers
	const portNode: ConductorNode = { id: `n${nid++}`, x: 0, y: feedEndY, layerId: 'm3' };
	nodes.push(portNode);

	const feedEndNode: ConductorNode = { id: `n${nid++}`, x: 0, y: feedStartY, layerId: 'm3' };
	nodes.push(feedEndNode);

	const patchCenterNode: ConductorNode = { id: `n${nid++}`, x: 0, y: 0, layerId: 'm3' };
	nodes.push(patchCenterNode);

	segments.push({
		id: `s${sid++}`,
		fromNode: portNode.id,
		toNode: feedEndNode.id,
		width: feedWidth,
		layerId: 'm3',
		pathId: 'feed',
		renderLayer: 'windings',
		polygonOverride: feedPoly,
	});

	ports.push({ name: 'P1', node: portNode.id });

	// Build layers directly (simpler than going through full network → polygonize for the patch)
	const layers: LayerMap = {
		crossings: [groundPoly],
		windings: [...patchPolys, feedPoly],
	};

	const network: ConductorNetwork = { nodes, segments, vias: [], ports };

	return { network, layers };
}

/** Validate patch antenna parameters */
export function isPatchAntennaValid(params: PatchAntennaParams): boolean {
	const { W, L, feedWidth, feedLength, insetDepth, insetGap, groundMargin, feedType } = params;

	if (W <= 0 || L <= 0 || feedWidth <= 0 || feedLength <= 0 || groundMargin <= 0) return false;
	if (feedWidth >= W) return false;

	if (feedType === 'inset') {
		if (insetDepth < 0 || insetGap < 0) return false;
		if (insetDepth >= L) return false;
		// Notch must fit within patch width
		if (feedWidth / 2 + insetGap >= W / 2) return false;
	}

	return true;
}
