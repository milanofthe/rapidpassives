# rapidpassives_sweep

Python geometry generation + automated FEM parameter sweeps for rapidpassives.

This is a **parallel, polygon-based geometry path** to the canonical TypeScript
web app (`web/`). Both produce the **same FEM JSON schema** (`schema_version 1`)
and feed the same consumer, `rapidfem.rfic.from_fem_json`. The web app stays the
source of truth; this package lets you script parameter sweeps in Python without
the GUI.

## Pipeline

```
build_*_inductor(params)  ->  GeometryResult{layers, ports}     (geometry/)
        |
build_fem_json(result, stack)  ->  dict (schema v1)             (fem_export.py)
        |
run_one(doc, freqs)  ->  rapidfem SweepResult                   (runner.py)
        |
sweep(gen, grid, freqs, stack)  ->  xarray.Dataset (S, L, Q)    (sweep.py)
```

## Quick start

```python
import numpy as np, rapidpassives_sweep as rps

stack = rps.sky130_stack("2metal")
ds = rps.sweep(
    rps.build_spiral_inductor,
    {"N": [2, 3], "Dout": [80, 120]},
    np.linspace(1e9, 30e9, 16),
    stack,
    base_params={"sides": 8, "width": 8, "spacing": 4,
                 "via_spacing": 1.0, "via_width": 1.0, "via_in_metal": 0.4},
    generator_name="spiral",
)
print(ds["L_henry"].isel(freq=0) * 1e9)   # L [nH] per geometry point
```

See `examples/sweep_spiral.py`.

## Parity with the TypeScript app

`tests/test_parity_spiral.py` compares the Python FEM JSON against a golden file
exported from the web app for identical parameters (ports, conductor layers,
bounding boxes, via-cell counts). Regenerate the golden after intentional
geometry changes:

```
cd ../web && npx tsx --tsconfig ./tsconfig.json _export_golden.ts
# move _golden_spiral.fem.json -> rapidpassives_sweep/tests/golden_spiral.fem.json
```

## Status

- **All 7 generators ported** and parity-verified against the TS web export
  (spiral, symmetric_inductor, symmetric_transformer, stacked_transformer,
  mom_capacitor, patch_antenna, ratrace_coupler) — see `tests/test_parity_all.py`
  (8 golden cases). Parity compares ports (name/layer/coords), per-layer metal
  area + bbox, and via-cell counts.
- Full FEM sweep proven end-to-end on spiral (rapidfem PARDISO solve, L/Q
  extraction). The same path works for the other generators.
- The parity tests guard against the Python and TS geometry drifting apart.

## Install

```
pip install -e .            # geometry + FEM JSON + parity tests
pip install -e .[solver]    # + rapidfem (run sweeps)
pip install -e .[touchstone,netcdf]  # + scikit-rf / netCDF4 output
```
