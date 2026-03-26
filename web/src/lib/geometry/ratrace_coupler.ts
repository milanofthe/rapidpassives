import type { Polygon, LayerMap } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';

export interface RatraceCouplerParams {
	/** Mean ring radius (um) */
	radius: number;
	/** Ring trace width (um) */
	ringWidth: number;
	/** Port feed line width (um) */
	portWidth: number;
	/** Port feed line length (um) */
	feedLength: number;
	/** Number of polygon sides for ring approximation */
	sides: number;
}

/** Build a rat-race (ring hybrid) coupler.
 *  Ring circumference = 1.5λ, ports at 0°, 90°, 180°, 270°.
 */
export function buildRatraceCoupler(params: RatraceCouplerParams): GeometryResult {
	const { radius, ringWidth, portWidth, feedLength, sides } = params;
	const PI = Math.PI;
	const rOut = radius + ringWidth / 2;
	const rIn = radius - ringWidth / 2;

	const portAngles = [0, PI / 2, PI, 3 * PI / 2];
	const portNames = ['P1', 'P2', 'P3', 'P4'];

	const polys: Polygon[] = [];

	// Draw ring as 4 arc segments between ports, each as a polygon strip
	for (let p = 0; p < 4; p++) {
		const a0 = portAngles[p];
		const a1 = portAngles[(p + 1) % 4];
		const endAngle = a1 <= a0 ? a1 + 2 * PI : a1;

		// Number of sub-segments for this arc
		const arcFraction = (endAngle - a0) / (2 * PI);
		const nSegs = Math.max(4, Math.round(sides * arcFraction));

		const outerX: number[] = [];
		const outerY: number[] = [];
		const innerX: number[] = [];
		const innerY: number[] = [];

		for (let i = 0; i <= nSegs; i++) {
			const angle = a0 + (endAngle - a0) * i / nSegs;
			outerX.push(rOut * Math.cos(angle));
			outerY.push(rOut * Math.sin(angle));
			innerX.push(rIn * Math.cos(angle));
			innerY.push(rIn * Math.sin(angle));
		}

		polys.push({
			x: [...outerX, ...[...innerX].reverse()],
			y: [...outerY, ...[...innerY].reverse()],
		});
	}

	// Feed lines at each port — extend radially, with width matching portWidth
	// Include a small junction patch at the ring to avoid gaps
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	for (let i = 0; i < 4; i++) {
		const angle = portAngles[i];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		// Perpendicular direction
		const px = -sin;
		const py = cos;

		const hw = portWidth / 2;

		// Junction patch: covers the ring width at the port angle
		const jInner = rIn - hw;
		const jOuter = rOut + hw;
		polys.push({
			x: [
				cos * jInner + px * hw,
				cos * jOuter + px * hw,
				cos * jOuter - px * hw,
				cos * jInner - px * hw,
			],
			y: [
				sin * jInner + py * hw,
				sin * jOuter + py * hw,
				sin * jOuter - py * hw,
				sin * jInner - py * hw,
			],
		});

		// Feed line extending outward from ring
		const startR = rOut;
		const endR = rOut + feedLength;
		polys.push({
			x: [
				cos * startR + px * hw,
				cos * endR + px * hw,
				cos * endR - px * hw,
				cos * startR - px * hw,
			],
			y: [
				sin * startR + py * hw,
				sin * endR + py * hw,
				sin * endR - py * hw,
				sin * startR - py * hw,
			],
		});

		const node: ConductorNode = {
			id: `n${i}`, x: cos * endR, y: sin * endR, layerId: 'm3',
		};
		nodes.push(node);
		ports.push({ name: portNames[i], node: node.id });
	}

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = { windings: polys };

	return { network, layers };
}

export function isRatraceCouplerValid(params: RatraceCouplerParams): boolean {
	const { radius, ringWidth, portWidth, feedLength, sides } = params;
	return radius > 0 && ringWidth > 0 && portWidth > 0 && feedLength > 0
		&& sides >= 8 && ringWidth < radius;
}
