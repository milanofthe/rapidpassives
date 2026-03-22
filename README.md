# RapidPassives

**[rapidpassives.org](https://rapidpassives.org)**

Browser-based layout generator for RFIC passive components — spiral inductors, symmetric inductors, and symmetric interleaved transformers. Configure geometry, preview in real time, and export production-ready GDS-II. Everything runs client-side.

## Features

- **Geometry generation** for octagonal spiral inductors, symmetric inductors (with optional center tap), and symmetric interleaved transformers with arbitrary winding ratios
- **Real-time 2D canvas** with layer visibility, zoom/pan, port markers
- **Process stack editor** with configurable metal layers, vias, PGS, substrate
- **GDS-II export** directly from the browser
- **Fully static** — no server, no backend, deploys to GitHub Pages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit (Svelte 5 runes), adapter-static |
| Geometry | TypeScript, centerline-first network builder |
| Rendering | Canvas 2D with DPR-aware rendering |
| GDS | Custom binary GDSII encoder (validated against gdstk) |
| Deploy | GitHub Pages via Actions |

## Geometry Types

### Spiral Inductor
Single-ended octagonal spiral with underpass return on lower metal. Configurable windings, width, spacing, outer diameter.

### Symmetric Inductor
Differential octagonal spiral with interleaved half-turns and optional center tap. Crossings on lower metal with via arrays.

### Symmetric Transformer
Interleaved primary/secondary windings with independent turn counts (N1, N2). Optional center taps on both windings. Bridges and crossings for winding routing.

## Project Structure

```
rapidpassives/
├── web/                          # SvelteKit application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── geometry/         # Inductor/transformer generators
│   │   │   ├── render/           # Canvas 2D renderer
│   │   │   ├── gds/              # GDSII binary writer
│   │   │   ├── stack/            # Process stack model
│   │   │   ├── components/       # Svelte UI components
│   │   │   └── theme.ts          # Unified design tokens
│   │   └── routes/               # SvelteKit pages
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
