"""Parity guard for every generator: the Python FEM JSON must match the TS web
export (golden files under tests/golden/, produced by web/_export_goldens.ts).

Compares ports (name, layer, coordinates) and per-stack-layer conductor counts +
bounding boxes + via-cell counts. Exact vertex order is not compared (TS uses
polygon-clipping, Python uses shapely), but geometry extent and topology are.
"""
from __future__ import annotations

import json
import os

import pytest

import rapidpassives as rps

_DIR = os.path.join(os.path.dirname(__file__), "golden")

_PARAMS = {
    "spiral": {"Dout": 130, "N": 3, "sides": 8, "width": 10, "spacing": 4,
               "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45},
    "symmetric_inductor": {"Dout": 240, "N": 3, "sides": 8, "width": 8, "spacing": 4,
                           "center_tap": True, "via_extent": 4, "via_spacing": 0.8,
                           "via_width": 1, "via_in_metal": 0.45},
    "symmetric_transformer": {"Dout": 240, "N1": 2, "N2": 2, "sides": 8, "width": 8, "spacing": 4,
                              "center_tap_primary": False, "center_tap_secondary": False,
                              "via_extent": 4, "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45},
    "stacked_transformer": {"Dout": 240, "N1": 2, "N2": 2, "sides": 8, "width": 8, "spacing": 4,
                            "center_tap_primary": False, "center_tap_secondary": False,
                            "via_extent": 4, "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45},
    "mom_capacitor": {"nFingers": 5, "fingerLength": 40, "fingerWidth": 2, "fingerSpacing": 2,
                      "busWidth": 4, "nLayers": 3, "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.4},
    "patch_antenna": {"W": 100, "L": 80, "feedType": "edge", "feedWidth": 6, "feedLength": 30,
                      "insetDepth": 0, "insetGap": 2, "groundMargin": 20},
    "ratrace_coupler": {"radius": 200, "ringWidth": 8, "portWidth": 6, "feedLength": 40,
                        "groundMargin": 30, "enabledPorts": [True, True, True, True]},
}

_BUILD = {
    "spiral": (rps.build_spiral_inductor, "2metal"),
    "symmetric_inductor": (rps.build_symmetric_inductor, "3metal"),
    "symmetric_transformer": (rps.build_symmetric_transformer, "3metal"),
    "stacked_transformer": (rps.build_stacked_transformer, "4metal"),
    "mom_capacitor": (rps.build_mom_capacitor, "3metal"),
    "patch_antenna": (rps.build_patch_antenna, "2metal"),
    "ratrace_coupler": (rps.build_ratrace_coupler, "2metal"),
}


def _bbox(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    return (min(xs), min(ys), max(xs), max(ys))


def _by_layer(doc):
    d = {}
    for c in doc["conductors"]:
        d.setdefault(c["layer"], []).append(c)
    return d


@pytest.mark.parametrize("name", list(_BUILD))
def test_generator_matches_ts(name):
    golden_path = os.path.join(_DIR, f"{name}.fem.json")
    if not os.path.exists(golden_path):
        pytest.skip(f"no golden for {name}")
    golden = json.load(open(golden_path, encoding="utf-8"))

    build, metals = _BUILD[name]
    res = build(_PARAMS[name])
    py = rps.build_fem_json(res, rps.sky130_stack(metals), generator=name, params=_PARAMS[name])

    # Ports: exact match on name, layer, coordinates.
    assert len(py["ports"]) == len(golden["ports"]), f"{name}: port count"
    gp = {p["name"]: p for p in golden["ports"]}
    pp = {p["name"]: p for p in py["ports"]}
    assert set(gp) == set(pp), f"{name}: port names"
    for nm in gp:
        assert gp[nm]["layer"] == pp[nm]["layer"], f"{name}: port {nm} layer"
        assert abs(gp[nm]["x_um"] - pp[nm]["x_um"]) < 1e-6, f"{name}: port {nm} x"
        assert abs(gp[nm]["y_um"] - pp[nm]["y_um"]) < 1e-6, f"{name}: port {nm} y"

    # Conductors: same stack layers; matching total metal AREA + bounding box +
    # via-cell count per layer. Exact piece count is NOT compared — TS
    # (polygon-clipping) and Python (shapely) can split a union into a different
    # number of components at hair's-width touching edges, but the covered metal
    # (area + extent) is the geometry-level invariant.
    from shapely.geometry import Polygon as _ShPoly
    from shapely.ops import unary_union as _uu

    def _layer_union(cs):
        shapes = []
        for c in cs:
            poly = c["polygon"]
            if len(poly) < 3:
                continue
            holes = c.get("holes") or []
            sp = _ShPoly(poly, [h for h in holes if len(h) >= 3])
            if not sp.is_valid:
                sp = sp.buffer(0)
            shapes.append(sp)
        return _uu(shapes) if shapes else None

    gl, pl = _by_layer(golden), _by_layer(py)
    assert set(gl) == set(pl), f"{name}: conductor layers {set(gl)} vs {set(pl)}"
    for layer in gl:
        gu, pu = _layer_union(gl[layer]), _layer_union(pl[layer])
        assert gu is not None and pu is not None, f"{name}: empty layer {layer}"
        # Areas agree to a tiny relative tolerance (inflation -> ~1e-3 abs drift).
        assert abs(gu.area - pu.area) <= 1e-3 * max(gu.area, 1.0) + 0.05, \
            f"{name}: area on {layer} ({gu.area:.4f} vs {pu.area:.4f})"
        gb, pb = gu.bounds, pu.bounds
        assert max(abs(a - b) for a, b in zip(gb, pb)) < 1e-2, f"{name}: bbox on {layer}"
        gcells = sum(len(c.get("polygon_cells", [])) for c in gl[layer])
        pcells = sum(len(c.get("polygon_cells", [])) for c in pl[layer])
        assert gcells == pcells, f"{name}: via-cell count on {layer} ({gcells} vs {pcells})"
