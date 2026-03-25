/**
 * KLayout .lyp (layer properties) file parser.
 * Extracts GDS layer:datatype → name + color mapping.
 * Does NOT provide z-positions or thicknesses (lyp doesn't have those).
 */

export interface LypLayer {
	gds: number;
	datatype: number;
	name: string;
	color: string;
	visible: boolean;
}

/**
 * Parse a KLayout .lyp XML file and extract layer definitions.
 * Only returns layers with valid GDS numbers.
 */
export function parseLyp(xml: string): LypLayer[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, 'text/xml');
	const layers: LypLayer[] = [];

	const properties = doc.querySelectorAll('properties');
	for (const prop of properties) {
		const sourceEl = prop.querySelector('source');
		const nameEl = prop.querySelector('name');
		const fillColorEl = prop.querySelector('fill-color');
		const visibleEl = prop.querySelector('visible');

		if (!sourceEl?.textContent) continue;

		// Parse source format: "layer/datatype@db" e.g. "67/20@1" or "8/0@*"
		const source = sourceEl.textContent.trim();
		const match = source.match(/^(\d+)\/(\d+)/);
		if (!match) continue;

		const gds = parseInt(match[1], 10);
		const datatype = parseInt(match[2], 10);
		if (isNaN(gds)) continue;

		// Extract name — use explicit name or derive from source
		let name = nameEl?.textContent?.trim() || '';
		if (!name || name === `${gds}/${datatype}`) {
			name = `Layer ${gds}`;
		}
		// Strip trailing " - purpose" if present (e.g. "Metal1 - drawing")
		const dashIdx = name.indexOf(' - ');
		if (dashIdx > 0) name = name.substring(0, dashIdx);

		// Extract color
		let color = fillColorEl?.textContent?.trim() || '#888888';
		// KLayout colors can be in #RRGGBB format already

		const visible = visibleEl?.textContent?.trim() !== 'false';

		layers.push({ gds, datatype, name, color, visible });
	}

	return layers;
}

/**
 * Parse a simple CSV layer map file.
 * Expected format: gds,datatype,name,type,z,thickness,color
 * Lines starting with # are comments.
 */
export function parseCsvLayerMap(csv: string): LypLayer[] {
	const layers: LypLayer[] = [];
	for (const line of csv.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const parts = trimmed.split(',').map(s => s.trim());
		if (parts.length < 3) continue;

		const gds = parseInt(parts[0], 10);
		const datatype = parseInt(parts[1], 10);
		if (isNaN(gds)) continue;

		layers.push({
			gds,
			datatype: isNaN(datatype) ? 0 : datatype,
			name: parts[2] || `Layer ${gds}`,
			color: parts.length > 6 ? parts[6] : '#888888',
			visible: true,
		});
	}
	return layers;
}
