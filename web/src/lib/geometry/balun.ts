import type { Polygon, LayerMap } from './types';
import type { ConductorNetwork, ConductorNode, Port, GeometryResult } from './network';

export interface MarchandBalunParams {
	/** Coupled section length (um) — approximately λ/4 */
	coupledLength: number;
	/** Trace width (um) */
	width: number;
	/** Gap between coupled lines (um) */
	gap: number;
	/** Open stub length for bandwidth compensation (um), 0 to disable */
	stubLength: number;
	/** Feed line length (um) */
	feedLength: number;
}

/** Build a planar Marchand balun layout.
 *
 *  Topology (viewed from top):
 *
 *      Open stub ─┐                    ┌─ Open stub
 *                 │                    │
 *  IN ═══════ Section 1 ═══╤═══ Section 2 ═══ BAL+
 *             (coupled)    │    (coupled)
 *         GND ─── Line B ──┘─── Line C ─── BAL-
 *                 │                    │
 *      GND via ──┘                    └── GND via
 *
 *  Section 1: Input line (top) coupled to a grounded line (bottom).
 *  Section 2: Connected line (top) to BAL+ output, coupled to line going to BAL-.
 *  The two inner conductors connect at the center junction.
 *  Ground vias at specific ends create the balun action.
 */
export function buildMarchandBalun(params: MarchandBalunParams): GeometryResult {
	const { coupledLength, width, gap, stubLength, feedLength } = params;
	const hw = width / 2;
	const polys: Polygon[] = [];

	// Two coupled sections side by side, connected at center
	// Section 1 is on the left, Section 2 on the right
	const sectionGap = width + gap; // space between sections at center junction
	const halfSection = coupledLength / 2;

	// Y positions of the two coupled lines
	const yUpper = gap / 2 + hw;  // upper line center
	const yLower = -(gap / 2 + hw); // lower line center

	// === Section 1 (left side) ===
	// Upper line: IN feed → coupled section
	// Runs from x = -halfSection - feedLength to x = -sectionGap/2
	const s1Left = -halfSection - feedLength;
	const s1Right = 0;

	// Upper conductor (input through-line)
	polys.push({
		x: [s1Left, s1Right, s1Right, s1Left],
		y: [yUpper - hw, yUpper - hw, yUpper + hw, yUpper + hw],
	});

	// Lower conductor (grounded at left end)
	polys.push({
		x: [-halfSection, s1Right, s1Right, -halfSection],
		y: [yLower - hw, yLower - hw, yLower + hw, yLower + hw],
	});

	// Ground via pad at left end of lower conductor
	const viaPadSize = width * 1.5;
	polys.push({
		x: [-halfSection - viaPadSize / 2, -halfSection + viaPadSize / 2, -halfSection + viaPadSize / 2, -halfSection - viaPadSize / 2],
		y: [yLower - viaPadSize / 2, yLower - viaPadSize / 2, yLower + viaPadSize / 2, yLower + viaPadSize / 2],
	});

	// === Section 2 (right side) ===
	const s2Left = 0;
	const s2Right = halfSection + feedLength;

	// Upper conductor (to BAL+ output)
	polys.push({
		x: [s2Left, s2Right, s2Right, s2Left],
		y: [yUpper - hw, yUpper - hw, yUpper + hw, yUpper + hw],
	});

	// Lower conductor (to BAL- output)
	polys.push({
		x: [s2Left, halfSection, halfSection, s2Left],
		y: [yLower - hw, yLower - hw, yLower + hw, yLower + hw],
	});

	// BAL- feed extension
	polys.push({
		x: [halfSection, s2Right, s2Right, halfSection],
		y: [yLower - hw, yLower - hw, yLower + hw, yLower + hw],
	});

	// Ground via pad at right end of lower conductor (for BAL- ground reference)
	// Actually in a Marchand balun, the right end of lower section 2 goes to BAL-
	// The ground vias are at the LEFT end of lower section 1 and potentially at
	// right end of upper section 2 (open) -- let's add stubs instead

	// === Center junction: connect inner ends ===
	// Vertical bridge connecting lower line of section 1 to lower line of section 2 at x=0
	// This is implicit since both end at x=0

	// Connect upper section1 end to upper section2 start (also at x=0, implicit)

	// === Open stubs for bandwidth compensation ===
	if (stubLength > 0) {
		// Stub extending down from left end of upper conductor
		polys.push({
			x: [-halfSection - hw, -halfSection + hw, -halfSection + hw, -halfSection - hw],
			y: [yUpper + hw, yUpper + hw, yUpper + hw + stubLength, yUpper + hw + stubLength],
		});

		// Stub extending down from right end of lower conductor
		polys.push({
			x: [halfSection - hw, halfSection + hw, halfSection + hw, halfSection - hw],
			y: [yLower - hw, yLower - hw, yLower - hw - stubLength, yLower - hw - stubLength],
		});
	}

	// === Ground plane on lower metal ===
	const totalW = coupledLength + 2 * feedLength + 2 * viaPadSize;
	const totalH = gap + 2 * width + 2 * stubLength + 4 * width;
	const groundPoly: Polygon = {
		x: [-totalW / 2, totalW / 2, totalW / 2, -totalW / 2],
		y: [-totalH / 2, -totalH / 2, totalH / 2, totalH / 2],
	};

	// Ground via pads (on via layer, matching the pads on windings layer)
	const viasPolys: Polygon[] = [];
	viasPolys.push({
		x: [-halfSection - viaPadSize / 2, -halfSection + viaPadSize / 2, -halfSection + viaPadSize / 2, -halfSection - viaPadSize / 2],
		y: [yLower - viaPadSize / 2, yLower - viaPadSize / 2, yLower + viaPadSize / 2, yLower + viaPadSize / 2],
	});

	// Port nodes
	const nodes: ConductorNode[] = [];
	const p1: ConductorNode = { id: 'n0', x: s1Left, y: yUpper, layerId: 'm3' };
	const p2p: ConductorNode = { id: 'n1', x: s2Right, y: yUpper, layerId: 'm3' };
	const p2n: ConductorNode = { id: 'n2', x: s2Right, y: yLower, layerId: 'm3' };
	nodes.push(p1, p2p, p2n);

	const network: ConductorNetwork = {
		nodes, segments: [], vias: [],
		ports: [
			{ name: 'IN', node: p1.id },
			{ name: 'BAL+', node: p2p.id },
			{ name: 'BAL-', node: p2n.id },
		],
	};

	const layers: LayerMap = {
		windings: polys,
		crossings: [groundPoly],
		vias: viasPolys,
	};

	return { network, layers };
}

export function isMarchandBalunValid(params: MarchandBalunParams): boolean {
	return params.coupledLength > 0 && params.width > 0 && params.gap > 0
		&& params.feedLength > 0 && params.stubLength >= 0;
}
