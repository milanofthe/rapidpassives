"""Demo: generate a spiral inductor and export it to GDS + FEM JSON.

Run:  python -m rapidpassives.examples.generate_spiral
"""
from __future__ import annotations

import json

import rapidpassives as rp


def main() -> None:
    stack = rp.sky130_stack("2metal")
    params = {"Dout": 130, "N": 3, "sides": 8, "width": 10, "spacing": 4,
              "via_spacing": 0.8, "via_width": 1, "via_in_metal": 0.45}

    res = rp.build_spiral_inductor(params)
    rp.add_pgs(res, D=120, w=4, s=2)  # optional patterned ground shield

    print("layers:", {k: len(v) for k, v in res.layers.items()})
    print("ports:", [(p.name, p.layer) for p in res.ports])

    rp.to_gds(res, stack, "spiral.gds", cell_name="spiral")
    doc = rp.build_fem_json(res, stack, generator="spiral", params=params)
    with open("spiral.fem.json", "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
    print("validate:", rp.validate_fem_json(doc) or "ok")
    print("wrote spiral.gds and spiral.fem.json")


if __name__ == "__main__":
    main()
