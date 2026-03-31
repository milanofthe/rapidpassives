import type { GeometryResult } from './network';

export interface PortMarker {
	name: string;
	x: number;
	y: number;
}

/** Extract port markers from a geometry result's conductor network */
export function extractPortMarkers(result: GeometryResult | null): PortMarker[] {
	if (!result) return [];
	const nodeMap = new Map(result.network.nodes.map(n => [n.id, n]));
	return result.network.ports.map(port => {
		const node = nodeMap.get(port.node);
		return node ? { name: port.name, x: node.x, y: node.y } : null;
	}).filter((p): p is PortMarker => p !== null);
}
