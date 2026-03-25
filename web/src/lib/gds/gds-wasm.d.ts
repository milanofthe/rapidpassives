declare module 'gds-wasm' {
	export default function init(): Promise<void>;
	export function process_gds(data: Uint8Array): {
		cellMeshes: Record<string, Record<string, number[]>>;
		cellEdges: Record<string, Record<string, number[]>>;
		cellInstances: Record<string, number[]>;
		polygonCount: number;
	};
}
