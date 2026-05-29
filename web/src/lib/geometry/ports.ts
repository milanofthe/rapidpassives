import type { GeometryResult } from './types';

export interface PortMarker {
	name: string;
	x: number;
	y: number;
}

/** Extract render markers (name + position) from a geometry result's ports. */
export function extractPortMarkers(result: GeometryResult | null): PortMarker[] {
	if (!result) return [];
	return result.ports.map(p => ({ name: p.name, x: p.x, y: p.y }));
}
