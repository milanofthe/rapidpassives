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

/** Build a rat-race (ring hybrid) coupler layout.
 *  Ring circumference = 1.5λ, ports at 0°, 90°, 180°, 270°.
 *  Port 1 (Σ) at 0°, Port 2 (Δ) at 180°, Port 3 at 90°, Port 4 at 270°.
 */
export function buildRatraceCoupler(params: RatraceCouplerParams): GeometryResult {
	const { radius, ringWidth, ringWidth: rw, portWidth, feedLength, sides } = params;
	const PI = Math.PI;

	// Build ring as a polygon with inner and outer edges
	const rOuter = radius + ringWidth / 2;
	const rInner = radius - ringWidth / 2;
	const xOuter: number[] = [];
	const yOuter: number[] = [];
	const xInner: number[] = [];
	const yInner: number[] = [];

	for (let i = 0; i <= sides; i++) {
		const angle = (2 * PI * i) / sides;
		xOuter.push(rOuter * Math.cos(angle));
		yOuter.push(rOuter * Math.sin(angle));
		xInner.push(rInner * Math.cos(angle));
		yInner.push(rInner * Math.sin(angle));
	}

	const ringPoly: Polygon = {
		x: [...xOuter, ...[...xInner].reverse()],
		y: [...yOuter, ...[...yInner].reverse()],
	};

	// Port feed lines at 0°, 90°, 180°, 270°
	const portAngles = [0, PI / 2, PI, 3 * PI / 2];
	const portNames = ['P1', 'P2', 'P3', 'P4'];
	const feedPolys: Polygon[] = [];
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	for (let i = 0; i < 4; i++) {
		const angle = portAngles[i];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		// Feed line extends radially outward from ring
		const startR = rOuter;
		const endR = rOuter + feedLength;

		// Perpendicular direction for width
		const px = -sin;
		const py = cos;

		feedPolys.push({
			x: [
				cos * startR + px * portWidth / 2,
				cos * endR + px * portWidth / 2,
				cos * endR - px * portWidth / 2,
				cos * startR - px * portWidth / 2,
			],
			y: [
				sin * startR + py * portWidth / 2,
				sin * endR + py * portWidth / 2,
				sin * endR - py * portWidth / 2,
				sin * startR - py * portWidth / 2,
			],
		});

		const node: ConductorNode = {
			id: `n${i}`,
			x: cos * endR,
			y: sin * endR,
			layerId: 'm3',
		};
		nodes.push(node);
		ports.push({ name: portNames[i], node: node.id });
	}

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = { windings: [ringPoly, ...feedPolys] };

	return { network, layers };
}

export function isRatraceCouplerValid(params: RatraceCouplerParams): boolean {
	const { radius, ringWidth, portWidth, feedLength, sides } = params;
	return radius > 0 && ringWidth > 0 && portWidth > 0 && feedLength > 0
		&& sides >= 8 && ringWidth < radius;
}
