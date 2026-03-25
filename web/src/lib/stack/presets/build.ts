/**
 * Build script: generates index.ts from .lyp + .stack.json source files.
 *
 * Run: npx tsx src/lib/stack/presets/build.ts
 *
 * Merges:
 *   - .lyp files → layer names + colors (from KLayout PDK repos)
 *   - .stack.json files → z-positions + thicknesses (manually maintained from datasheets)
 *
 * Output: overwrites index.ts with generated presets.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';

const SOURCES_DIR = join(import.meta.dirname!, 'sources');
const OUTPUT = join(import.meta.dirname!, 'index.ts');

interface LypEntry { gds: number; datatype: number; name: string; color: string }
interface StackEntry { gds: number; datatype: number; type: string; z: number; thickness: number }
interface StackFile { name: string; description: string; stack: StackEntry[] }

// ─── Parse .lyp ──────────────────────────────────────────────────────

function parseLyp(xml: string): LypEntry[] {
	const entries: LypEntry[] = [];
	// Simple regex-based XML parser (no DOM in Node)
	const propRegex = /<properties>([\s\S]*?)<\/properties>/g;
	let match;
	while ((match = propRegex.exec(xml)) !== null) {
		const block = match[1];
		const source = block.match(/<source>(.*?)<\/source>/)?.[1]?.trim();
		const name = block.match(/<name>(.*?)<\/name>/)?.[1]?.trim();
		const fillColor = block.match(/<fill-color>(.*?)<\/fill-color>/)?.[1]?.trim();

		if (!source) continue;
		// Source format: "GDS/DT@DB" or "Name GDS/DT@DB"
		const m = source.match(/(\d+)\/(\d+)/);
		if (!m) continue;

		const gds = parseInt(m[1], 10);
		const datatype = parseInt(m[2], 10);
		if (isNaN(gds)) continue;

		// Extract name: use <name> element, or prefix from source, or default
		let layerName = name || '';
		if (!layerName) {
			const srcName = source.match(/^([A-Za-z]\S*)\s+\d/)?.[1];
			layerName = srcName || `Layer ${gds}`;
		}
		const dash = layerName.indexOf(' - ');
		if (dash > 0) layerName = layerName.substring(0, dash);
		// Strip ".drawing", ".pin", etc. suffixes
		layerName = layerName.replace(/\.\w+$/, '');

		entries.push({ gds, datatype, name: layerName, color: fillColor || '#888888' });
	}
	return entries;
}

// ─── Build presets ───────────────────────────────────────────────────

const stackFiles = readdirSync(SOURCES_DIR).filter(f => f.endsWith('.stack.json'));
const presets: { id: string; name: string; description: string; layers: string[] }[] = [];

for (const stackFileName of stackFiles) {
	const id = basename(stackFileName, '.stack.json');
	const stackData: StackFile = JSON.parse(readFileSync(join(SOURCES_DIR, stackFileName), 'utf-8'));

	// Try to load matching .lyp for names and colors
	const lypPath = join(SOURCES_DIR, `${id}.lyp`);
	let lypEntries: LypEntry[] = [];
	try {
		lypEntries = parseLyp(readFileSync(lypPath, 'utf-8'));
	} catch {
		console.warn(`  No .lyp file for ${id}, using defaults`);
	}

	// Build a lookup: "gds:datatype" → lyp entry
	const lypMap = new Map<string, LypEntry>();
	for (const e of lypEntries) {
		lypMap.set(`${e.gds}:${e.datatype}`, e);
	}

	// Default colors by type
	const defaultColors: Record<string, string[]> = {
		metal: ['#4a9ec2', '#e8944a', '#d9513c', '#7b5e8a', '#c4c46b', '#f0b86a', '#6bbf8a', '#b86ad9'],
		via: ['#5a5a62', '#6e6e78', '#7a7a84', '#5a5a62', '#6e6e78', '#7a7a84'],
		poly: ['#c94a3a'],
		other: ['#b86ad9'],
	};
	const colorIdx: Record<string, number> = { metal: 0, via: 0, poly: 0, other: 0 };

	// Merge stack + lyp
	const layerLines: string[] = [];
	for (const s of stackData.stack) {
		const key = `${s.gds}:${s.datatype}`;
		const lyp = lypMap.get(key);
		const name = lyp?.name ?? `Layer ${s.gds}`;
		const type = s.type;
		const ci = colorIdx[type] ?? 0;
		const colors = defaultColors[type] ?? defaultColors.other;
		const color = lyp?.color ?? colors[ci % colors.length];
		colorIdx[type] = ci + 1;

		layerLines.push(`\t\t{ gds: ${s.gds}, datatype: ${s.datatype}, name: '${name.replace(/'/g, "\\'")}', type: '${type}', z: ${s.z}, thickness: ${s.thickness}, color: '${color}' },`);
	}

	presets.push({ id, name: stackData.name, description: stackData.description, layers: layerLines });
	console.log(`  ${id}: ${stackData.name} — ${layerLines.length} layers (${lypEntries.length} lyp entries matched)`);
}

// ─── Generate output ─────────────────────────────────────────────────

const output = `/**
 * AUTO-GENERATED — do not edit manually.
 * Run: npx tsx src/lib/stack/presets/build.ts
 *
 * Merges .lyp (names/colors from PDK repos) + .stack.json (z/thickness from datasheets)
 */

export interface PresetLayer {
	gds: number;
	datatype: number;
	name: string;
	type: 'metal' | 'via' | 'poly' | 'diffusion' | 'other';
	z: number;
	thickness: number;
	color: string;
}

export interface ProcessPreset {
	name: string;
	description: string;
	layers: PresetLayer[];
}

${presets.map(p => `const ${p.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}: ProcessPreset = {
	name: '${p.name}',
	description: '${p.description}',
	layers: [
${p.layers.join('\n')}
	],
};`).join('\n\n')}

export const PRESETS: Record<string, ProcessPreset> = {
${presets.map(p => `\t${p.id}: ${p.id.toUpperCase().replace(/[^A-Z0-9]/g, '_')},`).join('\n')}
};

export const PRESET_LIST = Object.entries(PRESETS).map(([id, p]) => ({ id, name: p.name, description: p.description }));
`;

writeFileSync(OUTPUT, output, 'utf-8');
console.log(`\nGenerated ${OUTPUT} with ${presets.length} presets`);
