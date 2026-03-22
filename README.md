# RapidPassives

**[rapidpassives.org](https://rapidpassives.org)**

Browser-based design tool for RFIC passive components — spiral inductors, symmetric inductors, and symmetric interleaved transformers. Everything runs client-side: geometry generation, electromagnetic simulation, GDS export.

## Features

- **Geometry generation** for octagonal spiral inductors, symmetric inductors (with optional center tap), and symmetric interleaved transformers with arbitrary winding ratios
- **Real-time 2D canvas** with layer visibility, zoom/pan, port markers
- **Process stack editor** with configurable metal layers, vias, PGS, substrate
- **EM simulation** via FastHenry compiled to WebAssembly — L, R, Q, S-parameters
- **GDS-II export** directly from the browser
- **Fully static** — no server, no backend, deploys to GitHub Pages

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit (Svelte 5 runes), adapter-static |
| Geometry | TypeScript, centerline-first network builder |
| Rendering | Canvas 2D with DPR-aware rendering |
| Solver | FastHenry → Emscripten → WebAssembly (389 KB) |
| GDS | Custom binary GDSII encoder (validated against gdstk) |
| Plots | Plotly.js |
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
│   │   │   ├── solver/           # FastHenry WASM interface, PEEC, parasitics
│   │   │   ├── render/           # Canvas 2D renderer
│   │   │   ├── gds/              # GDSII binary writer
│   │   │   ├── stack/            # Process stack model
│   │   │   ├── components/       # Svelte UI components
│   │   │   └── theme.ts          # Unified design tokens
│   │   └── routes/               # SvelteKit pages
│   ├── static/
│   │   └── wasm/                 # Pre-built WebAssembly modules
│   └── svelte.config.js
├── core/
│   ├── fasthenry/                # FastHenry WASM build scripts and patches
│   ├── glmom/                    # GLMoM MoM solver extraction (experimental)
│   └── mom/                      # Minimal RWG MoM solver (experimental)
└── .github/workflows/deploy.yml  # GitHub Pages CI/CD
```

## Development

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173

## Building the WASM Solver

Requires [Emscripten SDK](https://emscripten.org) and the FastHenry2 source in `../TEMP/FastHenry2/`.

```bash
cd core/fasthenry
bash build.sh
```

## Legacy

The original Python library with tkinter GUI is preserved on the [`legacy/python`](https://github.com/milanofthe/rapidpassives/tree/legacy/python) branch.

## License

AGPL-3.0
