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
 *  Ring circumference = 1.5λ.
 *  Port separations: P1→P2 = λ/4 (60°), P2→P3 = λ/4 (60°), P3→P4 = λ/4 (60°), P4→P1 = 3λ/4 (180°).
 *  Ports at 0°, 60°, 120°, 180°.
 */
export function buildRatraceCoupler(params: RatraceCouplerParams): GeometryResult {
	const { radius, ringWidth, portWidth, feedLength, sides } = params;
	const PI = Math.PI;
	const rOut = radius + ringWidth / 2;
	const rIn = radius - ringWidth / 2;

	// Ports at 0°, 60°, 120°, 180° (λ/4 spacing on 1.5λ ring)
	const portAngles = [0, PI / 3, 2 * PI / 3, PI];
	const portNames = ['Σ', 'B', 'Δ', 'A'];

	const polys: Polygon[] = [];

	// Build ring as arc segments between ports.
	// Each arc is a separate polygon strip to avoid merge issues.
	// We skip merging in the page so overlapping feed rectangles visually connect.
	for (let p = 0; p < 4; p++) {
		const a0 = portAngles[p];
		const a1 = portAngles[(p + 1) % 4];
		const endAngle = a1 <= a0 ? a1 + 2 * PI : a1;

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

	// Feed lines at each port — rectangles extending radially outward
	// They overlap the ring arcs at the junction points for visual connectivity
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	for (let i = 0; i < 4; i++) {
		const angle = portAngles[i];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const px = -sin;
		const py = cos;
		const hw = portWidth / 2;

		// Start at ring center, end beyond outer edge
		const startR = radius;
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
