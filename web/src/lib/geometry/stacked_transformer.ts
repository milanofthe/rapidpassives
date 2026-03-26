import type { Polygon, LayerMap, LayerName, StackedTransformerParams } from './types';
import type { ConductorNetwork, ConductorNode, ConductorSegment, ViaConnection, Port, GeometryResult } from './network';
import { viaGrid, routingGeometric45 } from './utils';

/**
 * Build a stacked transformer: primary on M4, secondary on M2.
 * Primary crossings on M3, secondary crossings on M1 — no layer conflicts.
 * Both windings are symmetric (differential) and share the same Dout.
 */
export function buildStackedTransformer(params: StackedTransformerParams): GeometryResult {
	const { Dout, N1, N2, sides, width, spacing,
		center_tap_primary, center_tap_secondary,
		via_extent, via_spacing, via_width, via_in_metal } = params;
	const ar = params.aspectRatio ?? 1;

	const PI = Math.PI;
	const SQRT2 = Math.SQRT2;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);
	const R1_init = Dout / 2 / Math.cos(PI / sides);
	const sepTotal = width + spacing + (SQRT2 - 1) * (2 * spacing + width);

	// Primary (M4): winding on M4, crossings on M3, vias on Via34
	const primaryPolys = buildWindingPolygons({
		N: N1, sides, width, spacing, Dout,
		R1_start: R1_init,
		center_tap: center_tap_primary,
		via_extent, via_spacing, via_width, via_in_metal,
		windingLayer: 'windings_m4',
		crossingLayer: 'windings',
		viaLayer: 'vias3',
		portSide: 'bottom',
		portSpacing: params.portSpacing,
	});

	// Secondary (M2): winding on M2, crossings on M1, vias on Via12
	const secondaryPolys = buildWindingPolygons({
		N: N2, sides, width, spacing, Dout,
		R1_start: R1_init,
		center_tap: center_tap_secondary,
		via_extent, via_spacing, via_width, via_in_metal,
		windingLayer: 'windings_m2',
		crossingLayer: 'crossings_m1',
		viaLayer: 'vias2',
		portSide: 'top',
		portSpacing: params.portSpacing,
	});

	// Merge layers
	const layers: LayerMap = {};
	for (const [key, polys] of Object.entries(primaryPolys.layers)) {
		const k = key as LayerName;
		layers[k] = [...(layers[k] || []), ...polys];
	}
	for (const [key, polys] of Object.entries(secondaryPolys.layers)) {
		const k = key as LayerName;
		layers[k] = [...(layers[k] || []), ...polys];
	}

	// Merge networks
	const network: ConductorNetwork = {
		nodes: [...primaryPolys.network.nodes, ...secondaryPolys.network.nodes],
		segments: [...primaryPolys.network.segments, ...secondaryPolys.network.segments],
		vias: [...primaryPolys.network.vias, ...secondaryPolys.network.vias],
		ports: [
			...primaryPolys.network.ports.map(p => ({
				...p,
				name: p.name === 'P1' ? 'P+' : p.name === 'P2' ? 'P-' : 'CT_P',
			})),
			...secondaryPolys.network.ports.map(p => ({
				...p,
				name: p.name === 'P1' ? 'S+' : p.name === 'P2' ? 'S-' : 'CT_S',
			})),
		],
	};

	// Apply aspect ratio — scale all Y coordinates
	if (ar !== 1) {
		for (const node of network.nodes) node.y *= ar;
		for (const polys of Object.values(layers)) {
			if (!polys) continue;
			for (const poly of polys) {
				poly.y = poly.y.map(y => y * ar);
			}
		}
	}

	return { network, layers };
}

interface WindingConfig {
	N: number;
	sides: number;
	width: number;
	spacing: number;
	Dout: number;
	R1_start: number;
	center_tap: boolean;
	via_extent: number;
	via_spacing: number;
	via_width: number;
	via_in_metal: number;
	windingLayer: LayerName;
	crossingLayer: LayerName;
	viaLayer: LayerName;
	portSide: 'top' | 'bottom';
	portSpacing?: number;
}

/**
 * Build a single symmetric winding (half of a stacked transformer).
 * Adapted from the symmetric inductor legacy polygon generation.
 */
function buildWindingPolygons(cfg: WindingConfig): { layers: LayerMap; network: ConductorNetwork } {
	const { N, sides, width, spacing, Dout, R1_start,
		center_tap, via_extent, via_spacing, via_width, via_in_metal,
		windingLayer, crossingLayer, viaLayer, portSide } = cfg;

	const PI = Math.PI;
	const SQRT2 = Math.SQRT2;
	const v = width / Math.cos(PI / sides);
	const s = (spacing + width) / Math.cos(PI / sides);
	const extend = via_extent;
	const sepTotal = width + spacing + (SQRT2 - 1) * (2 * spacing + width);

	const nHalf = sides / 2;
	const leftAngles: number[] = [];
	const rightAngles: number[] = [];
	for (let i = 0; i < nHalf; i++) {
		const t = (i + 0.5) * 2 / sides;
		leftAngles.push(PI * (0.5 + t));
		rightAngles.push(PI * (-0.5 + t));
	}

	const polysWinding: Polygon[] = [];
	const polysCrossing: Polygon[] = [];
	const polysCenterTap: Polygon[] = [];
	let polysVia: Polygon[] = [];
	let polysVia2: Polygon[] = [];

	let R1 = R1_start;
	let R2 = R1 - v;

	// Winding arcs
	for (let winding = 0; winding < N; winding++) {
		// Left section
		let xOutL: number[] = [], yOutL: number[] = [], xInL: number[] = [], yInL: number[] = [];
		for (const phi of leftAngles) {
			xOutL.push(R1 * Math.cos(phi)); yOutL.push(R1 * Math.sin(phi));
			xInL.push(R2 * Math.cos(phi)); yInL.push(R2 * Math.sin(phi));
		}
		if (winding === N - 1) {
			if (N % 2 === 0) { xOutL = [-sepTotal/2, ...xOutL, 0]; xInL = [-sepTotal/2, ...xInL, 0]; }
			else { xOutL = [0, ...xOutL, -sepTotal/2]; xInL = [0, ...xInL, -sepTotal/2]; }
		} else {
			xOutL = [-sepTotal/2, ...xOutL, -sepTotal/2]; xInL = [-sepTotal/2, ...xInL, -sepTotal/2];
		}
		yOutL = [yOutL[0], ...yOutL, yOutL[yOutL.length-1]]; yInL = [yInL[0], ...yInL, yInL[yInL.length-1]];
		polysWinding.push({ x: [...xOutL, ...[...xInL].reverse()], y: [...yOutL, ...[...yInL].reverse()] });

		// Right section
		let xOutR: number[] = [], yOutR: number[] = [], xInR: number[] = [], yInR: number[] = [];
		for (const phi of rightAngles) {
			xOutR.push(R1 * Math.cos(phi)); yOutR.push(R1 * Math.sin(phi));
			xInR.push(R2 * Math.cos(phi)); yInR.push(R2 * Math.sin(phi));
		}
		if (winding === N - 1) {
			if (N % 2 === 0) { xOutR = [0, ...xOutR, sepTotal/2]; xInR = [0, ...xInR, sepTotal/2]; }
			else { xOutR = [sepTotal/2, ...xOutR, 0]; xInR = [sepTotal/2, ...xInR, 0]; }
		} else {
			xOutR = [sepTotal/2, ...xOutR, sepTotal/2]; xInR = [sepTotal/2, ...xInR, sepTotal/2];
		}
		yOutR = [yOutR[0], ...yOutR, yOutR[yOutR.length-1]]; yInR = [yInR[0], ...yInR, yInR[yInR.length-1]];
		polysWinding.push({ x: [...xOutR, ...[...xInR].reverse()], y: [...yOutR, ...[...yInR].reverse()] });

		// Crossings
		if (winding !== N - 1) {
			let h: number;
			if (winding % 2 === 0) { h = R1 * Math.sin(PI * (0.5 - 1 / sides)); }
			else { h = (-R2 + s) * Math.sin(PI * (0.5 - 1 / sides)); }
			const crossBottom = routingGeometric45(width, spacing, 0, h - width - spacing / 2, extend);
			polysCrossing.push(crossBottom);
			const crossTop = routingGeometric45(width, spacing, 0, h - width - spacing / 2, 0);
			polysWinding.push({ x: crossTop.x.map(v => -v), y: crossTop.y });

			const viaCTB = [
				[-sepTotal/2 - width/2, h - 3*width/2 - spacing],
				[sepTotal/2 + width/2, h - width/2],
			];
			for (const [cx, cy] of viaCTB) {
				const dx = Math.sign(cx) * (extend - width) / 2;
				polysVia = polysVia.concat(
					viaGrid(cx + dx, cy, extend - 2*via_in_metal, width - 2*via_in_metal, via_spacing, via_width)
				);
			}
		}

		R1 -= s; R2 -= s;
	}

	// Center tap
	if (center_tap) {
		R1 = R1_start; R2 = R1 - v;
		const xCT = [-width/2, -width/2, width/2, width/2];
		let yCT: number[];
		if (N % 2 !== 0) {
			if (N <= 2) { yCT = [-Dout/2, Dout/2 - spacing*(N-1) - width*(N-1), Dout/2 - spacing*(N-1) - width*(N-1), -Dout/2]; }
			else { yCT = [-Dout/2 + width - extend, Dout/2 - spacing*(N-1) - width*(N-1) - extend, Dout/2 - spacing*(N-1) - width*(N-1) - extend, -Dout/2 + width - extend]; }
		} else {
			if (N <= 2) { yCT = [-Dout/2, -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2]; }
			else { yCT = [-Dout/2 + width - extend, -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + spacing*(N-1) + width*(N-1), -Dout/2 + width - extend]; }
		}
		if (N <= 2) {
			polysWinding.push({ x: xCT, y: yCT });
		} else {
			polysCenterTap.push({ x: xCT, y: yCT });

			let xCt1: number, yCt1: number, xCt2: number, yCt2: number;
			if (N % 2 !== 0) {
				xCt1 = 0; yCt1 = Dout/2 - spacing*(N-1) - width*(N-1) - extend/2;
				xCt2 = 0; yCt2 = -Dout/2 + width/2 + (width - extend)/2;
			} else {
				xCt1 = 0; yCt1 = -Dout/2 + spacing*(N-1) + width*N - width + extend/2;
				xCt2 = 0; yCt2 = -Dout/2 + width - extend/2;
			}

			const xVP1 = [xCt1-width/2, xCt1-width/2, xCt1+width/2, xCt1+width/2];
			const yVP1 = [yCt1-extend/2, yCt1+extend/2, yCt1+extend/2, yCt1-extend/2];
			const xVP2 = [xCt2-width/2, xCt2-width/2, xCt2+width/2, xCt2+width/2];
			const yVP2 = [yCt2-extend/2, yCt2+extend/2, yCt2+extend/2, yCt2-extend/2];

			polysWinding.push({ x: xVP1, y: yVP1 });
			polysCrossing.push({ x: xVP1, y: yVP1 });
			polysCenterTap.push({ x: xVP1, y: yVP1 });
			polysCrossing.push({ x: xVP2, y: yVP2 });
			polysCenterTap.push({ x: xVP2, y: yVP2 });

			for (const [cx, cy] of [[xCt1, yCt1], [xCt2, yCt2]]) {
				const vp = viaGrid(cx, cy, width - 2*via_in_metal, extend - 2*via_in_metal, via_spacing, via_width);
				polysVia2 = polysVia2.concat(vp);
				polysVia = polysVia.concat(vp);
			}
		}
	}

	// Ports — always built at the bottom
	const ps = cfg.portSpacing ?? spacing;
	const pxo = center_tap ? ps + width : (ps + width) / 2;
	let xPort: number[], yPort: number[];
	if (center_tap) {
		xPort = [-sepTotal/2, -pxo + width/2, -pxo + width/2, -pxo - width/2, -pxo - width/2, -sepTotal/2];
		yPort = [-Dout/2 + width, -Dout/2 + width, -Dout/2 - width, -Dout/2 - width, -Dout/2, -Dout/2];
		polysWinding.push({ x: [-width/2, -width/2, width/2, width/2], y: [-Dout/2 - width, -Dout/2 + width, -Dout/2 + width, -Dout/2 - width] });
	} else {
		xPort = [-sepTotal/2, -pxo + width/2, -pxo + width/2, -pxo - width/2, -pxo - width/2, -sepTotal/2];
		yPort = [-Dout/2 + width, -Dout/2 + width, -Dout/2 - width, -Dout/2 - width, -Dout/2, -Dout/2];
	}
	polysWinding.push({ x: xPort, y: yPort });
	polysWinding.push({ x: xPort.map(v => -v), y: yPort });

	// Mirror all Y coordinates if ports should be at the top
	const allPolys = [polysWinding, polysCrossing, polysCenterTap, polysVia, polysVia2];
	if (portSide === 'top') {
		for (const arr of allPolys) {
			for (const p of arr) {
				p.y = p.y.map(v => -v);
			}
		}
	}

	// Build layers map
	const layers: LayerMap = {};
	if (polysWinding.length) layers[windingLayer] = polysWinding;
	if (polysCrossing.length) layers[crossingLayer] = polysCrossing;
	if (polysVia.length) layers[viaLayer] = polysVia;
	if (polysCenterTap.length) layers['centertap'] = polysCenterTap;
	if (polysVia2.length) {
		const via2Layer = viaLayer === 'vias1' ? 'vias2' : 'vias1';
		layers[via2Layer] = polysVia2;
	}

	// Build minimal network for port markers
	const metalId = windingLayer === 'windings_m4' ? 'm4' : 'm2';
	const portXOffset = pxo;
	const portMarkerY = portSide === 'bottom' ? -Dout / 2 - width : Dout / 2 + width;
	const nodes: ConductorNode[] = [
		{ id: `${metalId}_pl`, x: -portXOffset, y: portMarkerY, layerId: metalId },
		{ id: `${metalId}_pr`, x: portXOffset, y: portMarkerY, layerId: metalId },
	];
	const ports: Port[] = [
		{ name: 'P1', node: `${metalId}_pl` },
		{ name: 'P2', node: `${metalId}_pr` },
	];
	if (center_tap) {
		nodes.push({ id: `${metalId}_ct`, x: 0, y: portMarkerY, layerId: metalId });
		ports.push({ name: 'CT', node: `${metalId}_ct` });
	}

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };

	return { layers, network };
}

export function isStackedTransformerValid(params: StackedTransformerParams): boolean {
	const { Dout, N1, N2, sides, width, spacing, via_extent,
		center_tap_primary, center_tap_secondary } = params;
	const tanA = Math.tan(Math.PI / sides);
	const h = width + spacing + (Math.SQRT2 - 1) * (2 * spacing + width);

	// Center taps not supported — CT routing conflicts with winding metal on intermediate layers
	if (center_tap_primary || center_tap_secondary) return false;

	// Validate each winding independently
	for (const N of [N1, N2]) {
		if (N < 1) return false;
		const q = 2 * width + spacing;
		const d2 = Dout / 2 - (N - 1) * (spacing + width);
		const d1 = Dout / 2 - (N - 1) * spacing - N * width;
		if (d1 <= 0) return false;
		if (h / 2 + via_extent > d2 * tanA) return false;
		if (h / 2 > d1 * tanA) return false;
		if (q / 2 > Dout / 2 * tanA) return false;
	}
	return true;
}
