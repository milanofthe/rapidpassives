# RapidPassives

**[rapidpassives.org](https://rapidpassives.org)**

Browser-based layout generator and viewer for RFIC passive components. Configure geometry, preview in real time with GPU-accelerated 2D/3D rendering, import and visualize GDS-II files, and export production-ready layouts. Everything runs client-side.

## Features

- **Geometry generators** for spiral inductors, symmetric inductors, interleaved transformers, stacked transformers, and MOM capacitors
- **Unified WebGL renderer** with smooth animated transitions between 2D (orthographic) and 3D (perspective) views
- **GDS-II viewer** — import and visualize GDS files with drag-and-drop or URL parameter (`/viewer?url=...`)
- **GDS parsing in Web Worker** — off-thread record parsing, cell flattening, and coordinate scaling for large files
- **Process stack editor** with configurable metal layers, vias, PGS, substrate
- **GDS-II export** directly from the browser
- **Sub-pixel LOD** and viewport culling for smooth rendering of 100k+ polygon layouts
- **Wireframe mode** in both 2D and 3D views
- **Fully static** — no server, no backend, deploys to GitHub Pages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit (Svelte 5 runes), adapter-static |
| Geometry | TypeScript, centerline-first network builder |
| Rendering | WebGL2 with earcut triangulation, orthographic/perspective projection |
| GDS Import | Custom binary parser with Web Worker, handles SREF/AREF flattening |
| GDS Export | Custom binary GDSII encoder (validated against gdstk) |
| Deploy | GitHub Pages via Actions |

## Geometry Types

### Spiral Inductor
Single-ended octagonal spiral with underpass return on lower metal. Configurable windings, width, spacing, outer diameter.

### Symmetric Inductor
Differential octagonal spiral with interleaved half-turns and optional center tap. Crossings on lower metal with via arrays.

### Interleaved Transformer
Interleaved primary/secondary windings with independent turn counts (N1, N2). Optional center taps on both windings.

### Stacked Transformer
Vertically stacked differential transformer on separate metal layers with configurable winding ratios.

### MOM Capacitor
Interdigitated metal-oxide-metal finger capacitor with configurable finger count, dimensions, and multi-layer stacking.

## GDS Viewer

Import GDS-II files for 2D and 3D visualization:

- **Drag-and-drop** on the viewer page or **URL parameter**: `/viewer?url=https://example.com/layout.gds`
- Per-layer visibility toggles, color coding, and polygon counts
- Draggable layer reordering for 3D stack control
- Editable layer thickness for 3D extrusion

## Project Structure

```
rapidpassives/
├── web/                          # SvelteKit application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── geometry/         # Layout generators + polygon utilities
│   │   │   ├── render/           # WebGL 2D/3D renderer, Canvas 2D (cards)
│   │   │   ├── gds/              # GDSII reader, writer, Web Worker
│   │   │   ├── stack/            # Process stack model
│   │   │   ├── components/       # Svelte UI components
│   │   │   └── theme.ts          # Unified design tokens
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

## Legacy

The original Python library with tkinter GUI is preserved on the [`legacy/python`](https://github.com/milanofthe/rapidpassives/tree/legacy/python) branch.

## License

AGPL-3.0
