import type { Polygon, LayerMap, LayerName, MomCapacitorParams } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';
import { viaGrid } from './utils';

/**
 * Build a MOM (Metal-Oxide-Metal) interdigitated finger capacitor.
 *
 * Features:
 *   - Edge shielding: outermost fingers on both sides are the same polarity (P)
 *   - Half-pitch offset between adjacent metal layers for lateral + vertical coupling
 *   - Per-finger via arrays connecting same-polarity fingers across layers
 *   - Bus bars sized to fully enclose finger bases
 */
export function buildMomCapacitor(params: MomCapacitorParams): GeometryResult {
	const { nFingers, fingerLength, fingerWidth, fingerSpacing,
		busWidth, nLayers, via_spacing, via_width, via_in_metal } = params;

	const layers: LayerMap = {};
	const pitch = fingerWidth + fingerSpacing;

	// Ensure odd finger count for edge shielding (both edges = P)
	const nf = nFingers % 2 === 0 ? nFingers + 1 : nFingers;

	// Layer assignments per metal level
	const metalLayers: LayerName[] = ['windings', 'windings_m2', 'crossings_m1'];
	const viaLayers: LayerName[] = ['vias1', 'vias2'];

	// Compute total width including half-pitch extension for offset layers
	const baseWidth = nf * fingerWidth + (nf - 1) * fingerSpacing;
	const offsetExtra = pitch / 2;
	const totalWidth = baseWidth + offsetExtra; // wide enough for offset layers
	const totalHeight = fingerLength + 2 * busWidth;

	// Center at origin
	const x0 = -totalWidth / 2;
	const y0 = -totalHeight / 2;

	for (let layer = 0; layer < nLayers; layer++) {
		const renderLayer = metalLayers[layer];
		const polys: Polygon[] = [];

		// Half-pitch offset on odd layers
		const offset = layer % 2 === 0 ? 0 : pitch / 2;

		// Finger x-start (centered within the total width)
		const layerWidth = nf * fingerWidth + (nf - 1) * fingerSpacing;
		const layerX0 = -layerWidth / 2 + offset;

		// Generate fingers
		for (let i = 0; i < nf; i++) {
			const isPositive = i % 2 === 0; // P at edges (i=0, i=nf-1 both even for odd nf)
			const fx = layerX0 + i * pitch;

			// Skip fingers that fall outside the total width
			if (fx + fingerWidth > totalWidth / 2 + 0.001) continue;
			if (fx < -totalWidth / 2 - 0.001) continue;

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

		// P bus bar (bottom) — full total width to cover offset fingers
		polys.push({
			x: [x0, x0 + totalWidth, x0 + totalWidth, x0],
			y: [y0, y0, y0 + busWidth, y0 + busWidth],
		});

		// N bus bar (top) — full total width
		polys.push({
			x: [x0, x0 + totalWidth, x0 + totalWidth, x0],
			y: [y0 + busWidth + fingerLength, y0 + busWidth + fingerLength, y0 + totalHeight, y0 + totalHeight],
		});

		layers[renderLayer] = [...(layers[renderLayer] || []), ...polys];

		// Via arrays between this layer and the one above
		if (layer > 0) {
			const viaLayer = viaLayers[layer - 1];
			let viaPolys: Polygon[] = [];

			// Per-finger vias where fingers overlap between layers
			// Fingers on adjacent layers are offset by half-pitch, so each finger
			// overlaps with the adjacent layer's bus bar at its base.
			// Place vias on the bus bars (full overlap guaranteed)
			const busViaW = totalWidth - 2 * via_in_metal;
			const busViaH = busWidth - 2 * via_in_metal;

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

			// Per-finger vias in the overlapping finger region
			const prevOffset = (layer - 1) % 2 === 0 ? 0 : pitch / 2;
			const currOffset = layer % 2 === 0 ? 0 : pitch / 2;
			const prevLayerX0 = -layerWidth / 2 + prevOffset;
			const currLayerX0 = -layerWidth / 2 + currOffset;

			for (let i = 0; i < nf; i++) {
				const prevFx = prevLayerX0 + i * pitch;
				const prevIsP = i % 2 === 0;

				for (let j = 0; j < nf; j++) {
					const currFx = currLayerX0 + j * pitch;
					const currIsP = j % 2 === 0;

					// Only connect same polarity
					if (prevIsP !== currIsP) continue;

					// Check overlap
					const overlapL = Math.max(prevFx, currFx);
					const overlapR = Math.min(prevFx + fingerWidth, currFx + fingerWidth);
					const overlapW = overlapR - overlapL;
					if (overlapW < via_width + 2 * via_in_metal) continue;

					// Finger overlap region in Y
					const fyCx = (overlapL + overlapR) / 2;
					const fingerTop = y0 + busWidth + fingerLength - fingerSpacing;
					const fingerBot = y0 + busWidth + fingerSpacing;
					const fyCy = (fingerBot + fingerTop) / 2;
					const fingerViaH = (fingerTop - fingerBot) - 2 * via_in_metal;
					const fingerViaW = overlapW - 2 * via_in_metal;

					if (fingerViaH > 0 && fingerViaW > 0) {
						viaPolys = viaPolys.concat(
							viaGrid(fyCx, fyCy, fingerViaW, fingerViaH, via_spacing, via_width)
						);
					}
				}
			}

			layers[viaLayer] = [...(layers[viaLayer] || []), ...viaPolys];
		}
	}

	// Network with port markers
	const nodes: ConductorNode[] = [
		{ id: 'p_plus', x: x0, y: y0 + busWidth / 2, layerId: 'm3' },
		{ id: 'p_minus', x: x0 + totalWidth, y: y0 + busWidth + fingerLength + busWidth / 2, layerId: 'm3' },
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
	if (fingerLength <= 2 * fingerSpacing) return false;

	// Bus bar must be wide enough for at least one via row when multi-layer
	if (nLayers > 1 && busWidth < 2 * via_in_metal + via_width) return false;

	return true;
}
