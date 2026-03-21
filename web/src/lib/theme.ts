/**
 * Unified color and style definitions.
 * All UI elements — CSS, canvas renderer, components — reference this file.
 *
 * CSS custom properties in app.css are generated from these values.
 * Canvas code imports colors directly.
 */

// --- Palette ---

export const palette = {
	bg:           '#1c1c21',
	bgSurface:    '#232329',
	bgPanel:      '#2a2a31',
	bgInset:      '#18181d',

	text:         '#e2ddd5',
	textMuted:    '#7d7a85',
	textDim:      '#55535a',

	accent:       '#d9513c',
	accentHover:  '#e5634f',
	accentSecondary: '#e8944a',
	accentDim:    '#d9513c33',

	border:       '#35353d',
	borderSubtle: '#2d2d34',

	inputBg:      '#18181d',
	inputBorder:  '#3a3a42',
	inputHover:   '#4a4a52',
	inputFocus:   '#d9513c',

	white:        '#ffffff',
} as const;

// --- Canvas ---

export const canvas = {
	bg:           '#131316',
	grid:         '#2a2a32',
	gridWeight:   0.5,
	crosshair:    '#3a3a44',
	crosshairWeight: 1,
	crosshairDash: [4, 4] as number[],
	highlightOutline: '#ffffff',
	highlightOutlineWeight: 1.5,
	highlightBrighten: 0.4,
} as const;

// --- Layer colors ---

export const layerColors = {
	windings:   '#e8944a',
	crossings:  '#d9513c',
	vias:       '#5a5a62',
	vias1:      '#5a5a62',
	vias2:      '#6e6e78',
	centertap:  '#6bbf8a',
	pgs:        '#4a7fb5',
} as const;

// --- Fonts ---

export const fonts = {
	body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
	mono: "'JetBrains Mono', monospace",
} as const;

// --- Helpers ---

/** Generate CSS custom property declarations from palette */
export function toCSSVars(): string {
	return `
		--bg: ${palette.bg};
		--bg-surface: ${palette.bgSurface};
		--bg-panel: ${palette.bgPanel};
		--bg-inset: ${palette.bgInset};
		--text: ${palette.text};
		--text-muted: ${palette.textMuted};
		--text-dim: ${palette.textDim};
		--accent: ${palette.accent};
		--accent-hover: ${palette.accentHover};
		--accent-secondary: ${palette.accentSecondary};
		--accent-dim: ${palette.accentDim};
		--border: ${palette.border};
		--border-subtle: ${palette.borderSubtle};
		--input-bg: ${palette.inputBg};
		--input-border: ${palette.inputBorder};
		--input-hover: ${palette.inputHover};
		--input-focus: ${palette.inputFocus};
		--canvas-bg: ${canvas.bg};
		--font-body: ${fonts.body};
		--font-mono: ${fonts.mono};
	`;
}
