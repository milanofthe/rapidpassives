import type { Polygon, LayerMap, LayerName, MomCapacitorParams } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';
import { viaGrid } from './utils';

/**
 * Build a MOM (Metal-Oxide-Metal) interdigitated finger capacitor.
 * Alternating P/N fingers with bus bars, stackable across 1-3 metal layers.
 */
export function buildMomCapacitor(params: MomCapacitorParams): GeometryResult {
	const { nFingers, fingerLength, fingerWidth, fingerSpacing,
		busWidth, nLayers, via_spacing, via_width, via_in_metal } = params;

	const layers: LayerMap = {};
	const pitch = fingerWidth + fingerSpacing;
	const totalWidth = nFingers * fingerWidth + (nFingers - 1) * fingerSpacing;
	const totalHeight = fingerLength + 2 * busWidth;

	// Center at origin
	const x0 = -totalWidth / 2;
	const y0 = -totalHeight / 2;

	// Layer assignments per metal level
	const metalLayers: LayerName[] = ['windings', 'windings_m2', 'crossings_m1'];
	const viaLayers: LayerName[] = ['vias1', 'vias2'];

	for (let layer = 0; layer < nLayers; layer++) {
		const renderLayer = metalLayers[layer];
		const polys: Polygon[] = [];

		// Generate fingers (identical pattern on all layers for clean vertical coupling)
		for (let i = 0; i < nFingers; i++) {
			const isPositive = i % 2 === 0;
			const fx = x0 + i * pitch;

			let fy: number, fh: number;
			if (isPositive) {
				// P finger: extends up from bottom bus, gap at top
				fy = y0 + busWidth;
				fh = fingerLength - fingerSpacing;
			} else {
				// N finger: extends down from top bus, gap at bottom
				fy = y0 + busWidth + fingerSpacing;
				fh = fingerLength - fingerSpacing;
			}

			polys.push({
				x: [fx, fx + fingerWidth, fx + fingerWidth, fx],
				y: [fy, fy, fy + fh, fy + fh],
			});
		}

		// P bus bar (bottom)
		polys.push({
			x: [x0, x0 + totalWidth, x0 + totalWidth, x0],
			y: [y0, y0, y0 + busWidth, y0 + busWidth],
		});

		// N bus bar (top)
		polys.push({
			x: [x0, x0 + totalWidth, x0 + totalWidth, x0],
			y: [y0 + busWidth + fingerLength, y0 + busWidth + fingerLength, y0 + totalHeight, y0 + totalHeight],
		});

		layers[renderLayer] = [...(layers[renderLayer] || []), ...polys];

		// Via arrays connecting same-polarity fingers to adjacent metal layers
		if (layer > 0) {
			const viaLayer = viaLayers[layer - 1];
			let viaPolys: Polygon[] = [];

			// Vias on bus bars (simpler and more reliable than per-finger vias)
			const viaMargin = via_in_metal;
			const busViaW = totalWidth - 2 * viaMargin;
			const busViaH = busWidth - 2 * viaMargin;

			if (busViaW > 0 && busViaH > 0) {
				// P bus vias (bottom)
				viaPolys = viaPolys.concat(
					viaGrid(0, y0 + busWidth / 2, busViaW, busViaH, via_spacing, via_width)
				);
				// N bus vias (top)
				viaPolys = viaPolys.concat(
					viaGrid(0, y0 + busWidth + fingerLength + busWidth / 2, busViaW, busViaH, via_spacing, via_width)
				);
			}

			layers[viaLayer] = [...(layers[viaLayer] || []), ...viaPolys];
		}
	}

	// Network with port markers
	const portPx = x0 - busWidth / 2;
	const portNx = x0 + totalWidth + busWidth / 2;
	const portPy = y0 + busWidth / 2;
	const portNy = y0 + busWidth + fingerLength + busWidth / 2;

	const nodes: ConductorNode[] = [
		{ id: 'p_plus', x: x0, y: portPy, layerId: 'm3' },
		{ id: 'p_minus', x: x0 + totalWidth, y: portNy, layerId: 'm3' },
	];
	const ports: Port[] = [
		{ name: 'P+', node: 'p_plus' },
		{ name: 'P-', node: 'p_minus' },
	];

	const network: ConductorNetwork = { nodes, segments: [], vias: [], ports };

	return { network, layers };
}

export function isMomCapacitorValid(params: MomCapacitorParams): boolean {
	const { nFingers, fingerLength, fingerWidth, fingerSpacing, busWidth, nLayers,
		via_width, via_spacing, via_in_metal } = params;

	if (nFingers < 2 || fingerLength <= 0 || fingerWidth <= 0 || fingerSpacing <= 0) return false;
	if (busWidth <= 0 || nLayers < 1 || nLayers > 3) return false;
	if (via_width <= 0 || via_spacing <= 0 || via_in_metal < 0) return false;

	// Fingers must be longer than the gap to actually interdigitate
	if (fingerLength <= fingerSpacing) return false;

	// Bus bar must be wide enough for at least one via row when multi-layer
	if (nLayers > 1 && busWidth < 2 * via_in_metal + via_width) return false;

	return true;
}
