# rapidpassives (Python)

Generate RFIC passive-device layouts as **polygons** and export them to **GDSII**
and **RapidFEM JSON**. This is the Python counterpart to the TypeScript web app
under `web/`; both produce the same geometry and the same FEM JSON schema
(`schema_version 1`). Parity is guarded by tests against golden exports from the
web app.

Pure generation — **no solver is bundled**. Parameter sweeps are a plain loop you
write around the generators.

## Generators

`build_spiral_inductor`, `build_symmetric_inductor`, `build_symmetric_transformer`,
`build_stacked_transformer`, `build_mom_capacitor`, `build_patch_antenna`,
`build_ratrace_coupler` — each takes a params `dict` and returns a
`GeometryResult { layers, ports }`.

## Quick start

```python
import rapidpassives as rp

stack = rp.sky130_stack("2metal")          # or "3metal" / "4metal"
res = rp.build_spiral_inductor({
    "Dout": 130, "N": 3, "sides": 8, "width": 10, "spacing": 4,
    "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45,
})
rp.add_pgs(res, D=120, w=4, s=2)           # optional patterned ground shield

rp.to_gds(res, stack, "spiral.gds")        # GDSII (layers from the stack/PDK)
doc = rp.build_fem_json(res, stack, generator="spiral")   # RapidFEM JSON (dict)
assert rp.validate_fem_json(doc) == []
```

See `examples/generate_spiral.py`.

## Sweeping

There is no `sweep()` helper — loop yourself:

```python
import itertools, json, rapidpassives as rp

stack = rp.sky130_stack("2metal")
for N, Dout in itertools.product([2, 3], [100, 150]):
    res = rp.build_spiral_inductor({"Dout": Dout, "N": N, "sides": 8, "width": 8,
        "spacing": 4, "via_spacing": 1.0, "via_width": 1.0, "via_in_metal": 0.4})
    doc = rp.build_fem_json(res, stack, generator="spiral", params={"N": N, "Dout": Dout})
    json.dump(doc, open(f"spiral_N{N}_D{Dout}.fem.json", "w"))   # feed to your solver
```

## Parity with the TypeScript app

`tests/test_parity_all.py` compares each generator's FEM JSON against golden files
under `tests/golden/` (exported from the web app). It checks ports
(name/layer/coords), per-stack-layer metal area + bounding box, and via-cell
counts. Run with `pytest`. Regenerate goldens after intentional geometry changes
via a temporary `web/_export_goldens.ts` + `tsx`.

## Install

```
pip install -e .
```

Dependencies: numpy, shapely (polygon union for the FEM export), gdstk (GDSII).
