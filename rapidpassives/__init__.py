"""rapidpassives — generate RFIC passive-device structures (spiral/symmetric
inductors, transformers, MOM capacitor, patch antenna, rat-race coupler) as
polygons, and export them to GDSII and RapidFEM JSON.

Polygon-based, the same geometry the TypeScript web app produces (parity is
guarded by tests against golden exports). Pure generation: no solver is bundled.
Build parameter sweeps yourself with a plain loop over the generators, e.g.::

    import itertools, rapidpassives as rp
    stack = rp.sky130_stack("2metal")
    for N, Dout in itertools.product([2, 3], [100, 150]):
        res = rp.build_spiral_inductor({"Dout": Dout, "N": N, "sides": 8, "width": 8,
            "spacing": 4, "via_spacing": 1.0, "via_width": 1.0, "via_in_metal": 0.4})
        doc = rp.build_fem_json(res, stack, generator="spiral", params={"N": N, "Dout": Dout})
        # hand `doc` to your FEM solver, or rp.to_gds(res, stack, f"spiral_{N}_{Dout}.gds")
"""
from __future__ import annotations

from .fem_export import build_fem_json, validate_fem_json
from .gds_export import to_gds
from .geometry import (
    GeometryResult, Port, add_pgs,
    build_spiral_inductor, build_symmetric_inductor, build_symmetric_transformer,
    build_stacked_transformer, build_mom_capacitor, build_patch_antenna, build_ratrace_coupler,
)
from .stack import ProcessStack, sky130_stack

__all__ = [
    "build_spiral_inductor",
    "build_symmetric_inductor",
    "build_symmetric_transformer",
    "build_stacked_transformer",
    "build_mom_capacitor",
    "build_patch_antenna",
    "build_ratrace_coupler",
    "add_pgs",
    "to_gds",
    "build_fem_json",
    "validate_fem_json",
    "sky130_stack",
    "ProcessStack",
    "GeometryResult",
    "Port",
]
