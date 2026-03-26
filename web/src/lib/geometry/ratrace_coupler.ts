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

	// Build ring as a single annular polygon using the "keyhole" technique:
	// Trace outer boundary CCW, bridge to inner boundary, trace inner CW, bridge back.
	// The bridge is placed at a non-port angle to avoid visual artifacts.
	const bridgeAngle = PI / 4; // 45° — between port 1 and port 2
	const bridgeIdx = Math.round(bridgeAngle / (2 * PI) * sides);

	const ringX: number[] = [];
	const ringY: number[] = [];

	// Outer boundary (CCW from bridge angle)
	for (let i = 0; i <= sides; i++) {
		const idx = (bridgeIdx + i) % sides;
		const angle = (2 * PI * idx) / sides + PI / sides; // half-segment offset so flat sides face ports
		ringX.push(rOut * Math.cos(angle));
		ringY.push(rOut * Math.sin(angle));
	}

	// Inner boundary (CW = reversed, from bridge angle)
	for (let i = sides; i >= 0; i--) {
		const idx = (bridgeIdx + i) % sides;
		const angle = (2 * PI * idx) / sides + PI / sides;
		ringX.push(rIn * Math.cos(angle));
		ringY.push(rIn * Math.sin(angle));
	}

	polys.push({ x: ringX, y: ringY });

	// Feed lines at each port
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	for (let i = 0; i < 4; i++) {
		const angle = portAngles[i];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const px = -sin; // perpendicular
		const py = cos;
		const hw = portWidth / 2;

		// Feed line from inner ring edge to beyond outer edge + feedLength
		const startR = rIn;
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
