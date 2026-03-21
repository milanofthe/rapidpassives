import type { ProcessStack } from '$lib/stack/types';
import { getStackLayer } from '$lib/stack/types';

/**
 * Compute the equivalent resistance of a via array.
 *
 * @param widthX - array extent in X (um)
 * @param widthY - array extent in Y (um)
 * @param viaSpacing - spacing between vias (um)
 * @param viaWidth - width of individual vias (um)
 * @param viaInMetal - enclosure (um)
 * @param stack - process stack
 * @param topLayerId - top metal layer id
 * @param botLayerId - bottom metal layer id
 * @returns resistance in ohms
 */
export function computeViaResistance(
	widthX: number, widthY: number,
	viaSpacing: number, viaWidth: number,
	stack: ProcessStack,
	topLayerId: string, botLayerId: string,
): number {
	// Count vias in the array
	const nx = Math.floor((widthX + viaSpacing) / (viaWidth + viaSpacing));
	const ny = Math.floor((widthY + viaSpacing) / (viaWidth + viaSpacing));
	const nVias = Math.max(1, nx * ny);

	// Via height = distance between the two metal layers
	const topLayer = getStackLayer(stack, topLayerId);
	const botLayer = getStackLayer(stack, botLayerId);
	const topZ = topLayer?.z ?? 303;
	const botZ = botLayer ? botLayer.z + (botLayer.thickness ?? 0.5) : 302;
	const viaHeight = Math.abs(topZ - botZ) * 1e-6; // convert um to m

	// Via resistivity — approximate from typical Cu via resistivity
	// rho_via ≈ 3e-8 Ω·m (slightly higher than bulk Cu due to barrier layers)
	const rhoVia = 3e-8;

	// Individual via resistance: R = rho * height / area
	const viaArea = (viaWidth * 1e-6) * (viaWidth * 1e-6); // m²
	const singleViaR = rhoVia * viaHeight / viaArea;

	// Parallel combination of all vias
	return singleViaR / nVias;
}
