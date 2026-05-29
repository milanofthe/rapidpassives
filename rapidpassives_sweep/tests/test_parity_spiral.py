"""Parity guard: the Python spiral FEM JSON must match the TS web export.

The golden file is produced by web/_export_golden.ts (run via tsx). This test
keeps the parallel Python geometry path from silently drifting away from the
canonical TypeScript implementation.

Regenerate the golden after intentional geometry changes:
    cd web && npx tsx --tsconfig ./tsconfig.json _export_golden.ts
    move _golden_spiral.fem.json -> rapidpassives_sweep/tests/golden_spiral.fem.json
"""
from __future__ import annotations

import json
import os

import pytest

import rapidpassives_sweep as rps

_GOLDEN = os.path.join(os.path.dirname(__file__), "golden_spiral.fem.json")
_PARAMS = {"Dout": 130, "N": 3, "sides": 8, "width": 10, "spacing": 4,
           "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45}


def _bbox(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    return (min(xs), min(ys), max(xs), max(ys))


@pytest.mark.skipif(not os.path.exists(_GOLDEN), reason="golden file not present")
def test_spiral_matches_ts_export():
    golden = json.load(open(_GOLDEN))
    res = rps.build_spiral_inductor(_PARAMS)
    py = rps.build_fem_json(res, rps.sky130_stack("2metal"), generator="spiral", params=_PARAMS)

    assert py["schema_version"] == golden["schema_version"]

    # Ports: exact match on name, layer, coordinates.
    assert len(py["ports"]) == len(golden["ports"])
    for g, p in zip(golden["ports"], py["ports"]):
        assert g["name"] == p["name"]
        assert g["layer"] == p["layer"]
        assert abs(g["x_um"] - p["x_um"]) < 1e-6
        assert abs(g["y_um"] - p["y_um"]) < 1e-6

    # Conductors: same count per stack layer; matching bbox and via-cell count.
    def by_layer(doc):
        d = {}
        for c in doc["conductors"]:
            d.setdefault(c["layer"], []).append(c)
        return d

    gl, pl = by_layer(golden), by_layer(py)
    assert set(gl) == set(pl)
    for layer in gl:
        assert len(gl[layer]) == len(pl[layer]), f"conductor count mismatch on {layer}"
        if len(gl[layer]) == 1:
            gb, pb = _bbox(gl[layer][0]["polygon"]), _bbox(pl[layer][0]["polygon"])
            assert max(abs(a - b) for a, b in zip(gb, pb)) < 1e-2
            assert len(gl[layer][0].get("polygon_cells", [])) == len(pl[layer][0].get("polygon_cells", []))
