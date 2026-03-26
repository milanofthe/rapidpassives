# RapidPassives

**[rapidpassives.org](https://rapidpassives.org)**

Browser-based layout generator and viewer for RFIC passive components. Configure geometry, preview in real time with GPU-accelerated 2D/3D rendering, import and visualize GDS-II files, and export production-ready layouts. Everything runs client-side.

## Features

- **Geometry generators** for spiral inductors, symmetric inductors, interleaved transformers, stacked transformers, MOM capacitors, patch antennas, and rat-race couplers
- **Aspect ratio control** for non-square inductor shapes (extends straight segments, preserves corner geometry)
- **Frequency-driven auto-design** for patch antennas and rat-race couplers (input GHz + substrate → computed dimensions)
- **Unified WebGL renderer** with smooth animated transitions between 2D (orthographic) and 3D (perspective) views
- **GDS-II viewer** — import and visualize GDS files with drag-and-drop or URL parameter (`/viewer?url=...`)
- **GDS parsing in Web Worker** — off-thread record parsing, cell hierarchy walking, and coordinate scaling for large files
- **Process stack presets** (SKY130, SG13G2, GF180MCU) with editable metal layers, vias, and substrate
- **GDS-II export** directly from the browser
- **Embeddable viewer** — `<gds-viewer>` web component for showcasing layouts on any website
- **Fully static** — no server, no backend, deploys to GitHub Pages

## Embeddable Viewer

Embed a 3D GDS viewer on any website with a single script tag:

```html
<script src="https://rapidpassives.org/embed/gds-viewer.js"></script>
<gds-viewer src="layout.gds" rotate explode></gds-viewer>
```

See the [live demo](https://rapidpassives.org/embed/test) for interactive examples.

### Attributes

| Attribute | Description |
|-----------|-------------|
| `src` | URL to a `.gds` file |
| `width` | CSS width (default: `100%`) |
| `height` | CSS height (default: `400px`) |
| `rotate` | Enable continuous camera rotation |
| `explode` | Enable sequential layer explode/assemble animation |
| `interactive` | Enable mouse orbit, pan, zoom (double-click to fit) |
| `transparent` | Transparent background instead of dark fill |
| `speed` | Animation speed multiplier (default: `1`) |
| `theta` | Initial camera azimuth in degrees (default: `45`) |
| `phi` | Initial camera elevation in degrees (default: `45`) |
| `config` | JSON string or URL for layer config |

### Layer Configuration

Customize colors, Z positions, and thickness per GDS layer:

```html
<gds-viewer src="layout.gds" rotate config='{
  "layers": {
    "1": { "color": "#6bbf8a", "z": 0.0, "thickness": 0.5 },
    "2": { "color": "#d9513c", "z": 0.5, "thickness": 0.5 }
  }
}'></gds-viewer>
```

Or just override the color palette:

```html
<gds-viewer src="layout.gds" config='{
  "colors": ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4"]
}'></gds-viewer>
```

Or load configuration from a URL:

```html
<gds-viewer src="layout.gds" config="layer-config.json"></gds-viewer>
```

## Geometry Generators

| Generator | Description |
|-----------|-------------|
| **Spiral Inductor** | Single-ended octagonal spiral with underpass routing |
| **Symmetric Inductor** | Differential octagonal spiral with optional center tap |
| **Interleaved Transformer** | Interleaved primary/secondary with configurable N1:N2 ratio |
| **Stacked Transformer** | Vertically stacked differential transformer on separate metal layers |
| **MOM Capacitor** | Interdigitated metal-oxide-metal finger capacitor |
| **Patch Antenna** | Microstrip patch with inset/edge feed and frequency-driven auto-sizing |
| **Rat-Race Coupler** | Ring hybrid coupler (1.5λ ring, ports at 0/60/120/180°) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit (Svelte 5 runes), adapter-static |
| Geometry | TypeScript, centerline-first network builder |
| Rendering | WebGL2 with earcut triangulation, orthographic/perspective projection |
| GDS Import | Custom binary parser with Web Worker, handles SREF/AREF hierarchy |
| GDS Export | Custom binary GDSII encoder |
| Embed | Standalone web component (`<gds-viewer>`), 26KB gzipped |
| Deploy | GitHub Pages via Actions |

## Project Structure

```
rapidpassives/
├── web/                          # SvelteKit application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── geometry/         # Layout generators + polygon utilities
│   │   │   ├── render/           # WebGL 2D/3D renderer, Canvas 2D (cards)
│   │   │   ├── gds/              # GDSII reader, writer, Web Worker
│   │   │   ├── stack/            # Process stack model + PDK presets
│   │   │   ├── components/       # Svelte UI components (ParamField, etc.)
│   │   │   └── theme.ts          # Design tokens (colors, fonts, spacing)
│   │   ├── embed/                # Embeddable web component
│   │   └── routes/
│   │       ├── generator/        # Parametric generator pages
│   │       └── viewer/           # GDS import viewer
│   └── svelte.config.js
└── .github/workflows/deploy.yml  # GitHub Pages CI/CD
```

## Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

### Build the embeddable viewer

```bash
npm run build:embed    # outputs to static/embed/gds-viewer.js
```

## Legacy

The original Python library with tkinter GUI is preserved on the [`legacy/python`](https://github.com/milanofthe/rapidpassives/tree/legacy/python) branch.

## License

AGPL-3.0
