import type { Polygon, LayerMap, PatchAntennaParams } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';

/** Build a microstrip patch antenna layout */
export function buildPatchAntenna(params: PatchAntennaParams): GeometryResult {
	const { W, L, feedType, feedWidth, feedLength, insetDepth, insetGap, groundMargin } = params;

	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];
	let nid = 0;

	// Ground plane
	const Wg = W + 2 * groundMargin;
	const Lg = L + 2 * groundMargin;
	const groundPoly: Polygon = {
		x: [-Wg / 2, Wg / 2, Wg / 2, -Wg / 2],
		y: [-Lg / 2, -Lg / 2, Lg / 2, Lg / 2],
	};

	// Patch
	let patchPolys: Polygon[];
	if (feedType === 'inset' && insetDepth > 0) {
		const notchHalfW = feedWidth / 2 + insetGap;
		patchPolys = [{
			x: [
				-W / 2, -notchHalfW, -notchHalfW, -feedWidth / 2, -feedWidth / 2,
				feedWidth / 2, feedWidth / 2, notchHalfW, notchHalfW, W / 2, W / 2, -W / 2,
			],
			y: [
				-L / 2, -L / 2, -L / 2 + insetDepth, -L / 2 + insetDepth, -L / 2,
				-L / 2, -L / 2 + insetDepth, -L / 2 + insetDepth, -L / 2, -L / 2, L / 2, L / 2,
			],
		}];
	} else {
		patchPolys = [{
			x: [-W / 2, W / 2, W / 2, -W / 2],
			y: [-L / 2, -L / 2, L / 2, L / 2],
		}];
	}

	// Feed line
	const feedEndY = -Lg / 2 - feedLength;
	const hw = feedWidth / 2;
	const feedPoly: Polygon = {
		x: [-hw, hw, hw, -hw],
		y: [feedEndY, feedEndY, -L / 2, -L / 2],
	};

	// Port node
	const portNode: ConductorNode = { id: `n${nid++}`, x: 0, y: feedEndY, layerId: 'm3' };
	nodes.push(portNode);
	ports.push({ name: 'P1', node: portNode.id });

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = {
		crossings: [groundPoly],
		windings: [...patchPolys, feedPoly],
	};

	return { network, layers };
}

/** Compute patch dimensions from target frequency and substrate parameters */
export function designPatchAntenna(freqGHz: number, er: number, h: number, Z0: number = 50): { W: number; L: number; insetDepth: number } {
	const c = 299792.458;
	const f0 = freqGHz;

	const W = c / (2 * f0 * Math.sqrt((er + 1) / 2));
	const erEff = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * h / W);
	const dL = 0.412 * h * ((erEff + 0.3) * (W / h + 0.264)) / ((erEff - 0.258) * (W / h + 0.8));
	const L = c / (2 * f0 * Math.sqrt(erEff)) - 2 * dL;
	const Zedge = 90 * (er * er / (er - 1)) * (L / W) * (L / W);
	const insetDepth = (L / Math.PI) * Math.acos(Math.pow(Z0 / Zedge, 0.25));

	return {
		W: Math.round(W * 10) / 10,
		L: Math.round(L * 10) / 10,
		insetDepth: Math.round(insetDepth * 10) / 10,
	};
}

/** Validate patch antenna parameters */
export function isPatchAntennaValid(params: PatchAntennaParams): boolean {
	const { W, L, feedWidth, feedLength, insetDepth, insetGap, groundMargin, feedType } = params;
	if (W <= 0 || L <= 0 || feedWidth <= 0 || feedLength <= 0 || groundMargin <= 0) return false;
	if (feedWidth >= W) return false;
	if (feedType === 'inset') {
		if (insetDepth < 0 || insetGap < 0) return false;
		if (insetDepth >= L) return false;
		if (feedWidth / 2 + insetGap >= W / 2) return false;
	}
	return true;
}
