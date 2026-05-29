"""Process stack definitions, mirrored from the TypeScript app's stack/pdk.ts.

The TS app is the canonical source of truth; this module reproduces the same
stack-layer ids (``{gds}_{datatype}``) and LayerName->stack mapping so that the
FEM JSON produced here matches the one exported by the web app for the same
parameters.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class StackLayer:
    id: str                      # "{gds}_{datatype}", e.g. "72_20"
    type: str                    # 'metal' | 'via' | 'poly' | ...
    z: float                     # bottom z (um)
    thickness: float             # (um)
    gds_layers: tuple[str, ...]  # LayerNames that render on this stack layer


@dataclass(frozen=True)
class ProcessStack:
    name: str
    layers: tuple[StackLayer, ...]
    substrate_er: float = 11.7
    substrate_rho: float = 10.0      # ohm-cm
    substrate_thickness: float = 300.0
    oxide_er: float = 4.0


# Raw sky130 layers: (name, gds, datatype, z, thickness, type)
_SKY130_LAYERS = [
    ("poly", 66, 20, -0.18, 0.18, "poly"),
    ("licon1", 66, 44, -0.10, 0.10, "via"),
    ("li1", 67, 20, 0.00, 0.10, "metal"),
    ("mcon", 67, 44, 0.10, 0.27, "via"),
    ("met1", 68, 20, 0.37, 0.36, "metal"),
    ("via", 68, 44, 0.73, 0.27, "via"),
    ("met2", 69, 20, 1.00, 0.36, "metal"),
    ("via2", 69, 44, 1.36, 0.42, "via"),
    ("met3", 70, 20, 1.78, 0.845, "metal"),
    ("via3", 70, 44, 2.625, 0.39, "via"),
    ("met4", 71, 20, 3.015, 0.845, "metal"),
    ("via4", 71, 44, 3.86, 0.505, "via"),
    ("met5", 72, 20, 4.365, 1.26, "metal"),
]
_SKY130_BY_NAME = {row[0]: row for row in _SKY130_LAYERS}

# LayerName -> sky130 layer name, per generator metal count (mirrors pdk.ts).
_SKY130_MAPS: dict[str, dict[str, str]] = {
    "2metal": {
        "crossings": "met4", "windings_m2": "met4", "windings": "met5",
        "vias": "via4", "vias1": "via4", "pgs": "li1",
    },
    "3metal": {
        "centertap": "met3", "crossings_m1": "met3", "guard_ring": "met3",
        "crossings": "met4", "windings_m2": "met4", "windings": "met5",
        "vias": "via4", "vias1": "via4", "vias2": "via3", "pgs": "li1",
    },
    "4metal": {
        "centertap": "met2", "crossings_m1": "met2", "guard_ring": "met2",
        "crossings": "met3", "windings_m2": "met3", "windings": "met4",
        "windings_m4": "met5",
        "vias": "via3", "vias1": "via3", "vias2": "via2", "vias3": "via4", "pgs": "li1",
    },
}


def sky130_stack(metals: str = "3metal") -> ProcessStack:
    """Build the sky130 ProcessStack for a given generator metal mapping.

    Reproduces pdk.ts ``pdkMapToStack``: group LayerNames by their (gds,datatype),
    sort bottom-to-top, id = ``{gds}_{datatype}``.
    """
    pdk_map = _SKY130_MAPS[metals]
    # Group LayerNames by the physical layer they map to.
    seen: dict[str, dict] = {}
    for layer_name, sky_name in pdk_map.items():
        _name, gds, dt, z, th, typ = _SKY130_BY_NAME[sky_name]
        key = f"{gds}:{dt}"
        if key in seen:
            seen[key]["gds_layers"].append(layer_name)
        else:
            seen[key] = {"gds": gds, "dt": dt, "z": z, "th": th, "type": typ,
                         "gds_layers": [layer_name]}

    rows = sorted(seen.values(), key=lambda r: r["z"])
    layers = tuple(
        StackLayer(
            id=f"{r['gds']}_{r['dt']}",
            type=("via" if r["type"] == "via" else "metal"),
            z=r["z"],
            thickness=r["th"],
            gds_layers=tuple(r["gds_layers"]),
        )
        for r in rows
    )
    return ProcessStack(name="sky130", layers=layers)
