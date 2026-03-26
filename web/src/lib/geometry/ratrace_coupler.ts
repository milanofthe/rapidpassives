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
	/** Ground plane margin beyond ring (um) */
	groundMargin: number;
	/** Which ports are enabled [Σ, B, Δ, A] */
	enabledPorts?: [boolean, boolean, boolean, boolean];
}

/** Build a rat-race (ring hybrid) coupler.
 *  Ring circumference = 1.5λ.
 *  Port separations: Σ→B = λ/4 (60°), B→Δ = λ/4 (60°), Δ→A = λ/4 (60°), A→Σ = 3λ/4 (180°).
 *  Ports at 0°, 60°, 120°, 180°.
 */
export function buildRatraceCoupler(params: RatraceCouplerParams): GeometryResult {
	const { radius, ringWidth, portWidth, feedLength, sides, groundMargin } = params;
	const enabled = params.enabledPorts ?? [true, true, true, true];
	const PI = Math.PI;
	const rOut = radius + ringWidth / 2;
	const rIn = radius - ringWidth / 2;

	// Ports at 0°, 60°, 120°, 180° (λ/4 spacing on 1.5λ ring)
	const portAngles = [0, PI / 3, 2 * PI / 3, PI];
	const portNames = ['Σ', 'B', 'Δ', 'A'];

	const polys: Polygon[] = [];

	// Build ring as arc segments between ports
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

	// Feed lines at enabled ports
	const nodes: ConductorNode[] = [];
	const ports: Port[] = [];

	for (let i = 0; i < 4; i++) {
		if (!enabled[i]) continue;

		const angle = portAngles[i];
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const px = -sin;
		const py = cos;
		const hw = portWidth / 2;

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

	// Ground plane on lower metal
	const gpSize = rOut + feedLength + groundMargin;
	const groundPoly: Polygon = {
		x: [-gpSize, gpSize, gpSize, -gpSize],
		y: [-gpSize, -gpSize, gpSize, gpSize],
	};

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };
	const layers: LayerMap = {
		windings: polys,
		crossings: [groundPoly],
	};

	return { network, layers };
}

export function isRatraceCouplerValid(params: RatraceCouplerParams): boolean {
	const { radius, ringWidth, portWidth, feedLength, sides } = params;
	return radius > 0 && ringWidth > 0 && portWidth > 0 && feedLength > 0
		&& sides >= 8 && ringWidth < radius;
}

/** Compute rat-race dimensions from target frequency and substrate parameters.
 *  @param freqGHz - center frequency in GHz
 *  @param er - substrate relative permittivity
 *  @param h - substrate height in um
 *  @param Z0 - system impedance (typically 50)
 *  Returns { radius, ringWidth, portWidth } in um.
 */
export function designRatrace(freqGHz: number, er: number, h: number, Z0: number = 50): { radius: number; ringWidth: number; portWidth: number } {
	const c = 299792.458; // um * GHz
	const erEff50 = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * h / 100); // approximate for initial W
	const lambda50 = c / (freqGHz * Math.sqrt(erEff50));

	// Ring impedance = Z0 * sqrt(2) ≈ 70.7Ω
	const Zring = Z0 * Math.SQRT2;

	// Microstrip width for given impedance (Hammerstad approximation)
	function microstripWidth(Z: number): number {
		const A = Z / 60 * Math.sqrt((er + 1) / 2) + (er - 1) / (er + 1) * (0.23 + 0.11 / er);
		const B = 377 * PI / (2 * Z * Math.sqrt(er));
		const wOverH1 = 8 * Math.exp(A) / (Math.exp(2 * A) - 2);
		const wOverH2 = 2 / PI * (B - 1 - Math.log(2 * B - 1) + (er - 1) / (2 * er) * (Math.log(B - 1) + 0.39 - 0.61 / er));
		return (wOverH1 < 2 ? wOverH1 : wOverH2) * h;
	}

	const ringWidth = microstripWidth(Zring);
	const portWidth = microstripWidth(Z0);

	// Effective er for ring width
	const erEffRing = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * h / ringWidth);
	const lambdaRing = c / (freqGHz * Math.sqrt(erEffRing));

	// Ring circumference = 1.5λ → radius = 1.5λ / (2π)
	const circumference = 1.5 * lambdaRing;
	const radius = circumference / (2 * PI);

	return {
		radius: Math.round(radius * 10) / 10,
		ringWidth: Math.round(ringWidth * 10) / 10,
		portWidth: Math.round(portWidth * 10) / 10,
	};
}
