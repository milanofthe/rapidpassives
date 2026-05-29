"""Build the RapidFEM JSON document — Python mirror of solver/export_fem.ts.

Produces schema_version 1, byte-compatible in structure with the web app's
``exportForFEM`` so both feed the same ``rapidfem.rfic.from_fem_json`` consumer.
"""
from __future__ import annotations

from shapely.geometry import Polygon as ShPoly
from shapely.ops import unary_union

from .geometry.primitives import Poly
from .geometry.result import GeometryResult, Port
from .stack import ProcessStack

FEM_SCHEMA_VERSION = 1
OXIDE_TAND_DEFAULT = 0.0
VIA_CLUSTER_SLACK_UM = 1.0
FEM_SIM_DEFAULTS = {"f_min_hz": 1e9, "f_max_hz": 50e9, "n_points": 25, "z0_ohm": 50.0}


_SNAP = 10 ** 6


def _snap(v: float) -> float:
    return round(v * _SNAP) / _SNAP


def _inflate(coords: list[tuple], amount: float = 0.001) -> list[tuple]:
    """Push each vertex away from the centroid (mirror of merge.ts::inflateRing)
    so touching edges overlap and merge under union."""
    if len(coords) < 3:
        return coords
    cx = sum(c[0] for c in coords) / len(coords)
    cy = sum(c[1] for c in coords) / len(coords)
    out = []
    for x, y in coords:
        dx, dy = x - cx, y - cy
        dist = (dx * dx + dy * dy) ** 0.5
        if dist < 1e-10:
            out.append((x, y))
        else:
            out.append((_snap(x + dx / dist * amount), _snap(y + dy / dist * amount)))
    return out


def _merge_polys(polys: list[Poly]):
    """Union overlapping polygons in a layer (mirror of merge.ts::mergePolygons).
    Returns a list of (exterior, holes) coordinate rings.

    Mirrors the TS fast path (single polygon -> returned as-is, no inflation) and
    the centroid-inflate-then-union behaviour for multiple polygons."""
    valid = [p for p in polys if len(p) >= 3]
    if not valid:
        return []
    if len(valid) == 1:
        return [(list(valid[0]), [])]

    shapes = []
    for p in valid:
        sp = ShPoly(_inflate([(_snap(x), _snap(y)) for x, y in p]))
        if not sp.is_valid:
            sp = sp.buffer(0)
        if not sp.is_empty:
            shapes.append(sp)
    if not shapes:
        return []
    u = unary_union(shapes)
    geoms = list(u.geoms) if u.geom_type == "MultiPolygon" else [u]
    out = []
    for g in geoms:
        if g.is_empty:
            continue
        ext = [(x, y) for x, y in list(g.exterior.coords)[:-1]]
        holes = [[(x, y) for x, y in list(r.coords)[:-1]] for r in g.interiors]
        out.append((ext, holes))
    return out


def _bbox(coords):
    xs = [c[0] for c in coords]; ys = [c[1] for c in coords]
    return min(xs), min(ys), max(xs), max(ys)


def _cluster_vias(cells: list[list[tuple]], slack: float):
    """Union-find clustering of via cells by bbox overlap — mirrors export_fem.ts."""
    bboxes = [_bbox(c) for c in cells]
    parent = list(range(len(cells)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    for i in range(len(bboxes)):
        axmin, aymin, axmax, aymax = bboxes[i]
        for j in range(i + 1, len(bboxes)):
            bxmin, bymin, bxmax, bymax = bboxes[j]
            if axmax + slack < bxmin or bxmax + slack < axmin:
                continue
            if aymax + slack < bymin or bymax + slack < aymin:
                continue
            union(i, j)

    clusters: dict[int, list[int]] = {}
    for i in range(len(cells)):
        clusters.setdefault(find(i), []).append(i)
    return list(clusters.values())


def build_fem_json(result: GeometryResult, stack: ProcessStack, *,
                   generator: str | None = None, params: dict | None = None,
                   sim: dict | None = None) -> dict:
    layers = result.layers
    ports = result.ports
    warnings: list[str] = []

    layer_name_to_stack_id: dict[str, str] = {}
    for sl in stack.layers:
        for gl in sl.gds_layers:
            layer_name_to_stack_id[gl] = sl.id
    stack_by_id = {sl.id: sl for sl in stack.layers}

    fem_layers = [
        {"id": sl.id, "type": sl.type, "z_um": sl.z, "thickness_um": sl.thickness}
        for sl in sorted([s for s in stack.layers if s.type in ("metal", "via")], key=lambda s: s.z)
    ]

    conductors: list[dict] = []
    for layer_name, polys in layers.items():
        if not polys:
            continue
        stack_id = layer_name_to_stack_id.get(layer_name)
        if not stack_id:
            warnings.append(f"layer '{layer_name}' ({len(polys)} polygon(s)) is not mapped to any "
                            f"stack layer in '{stack.name}' — dropped from FEM export")
            continue
        sl = stack_by_id[stack_id]
        merged = _merge_polys(polys)
        if sl.type != "via":
            for ext, holes in merged:
                entry = {"layer": stack_id, "name": layer_name,
                         "polygon": [[x, y] for x, y in ext]}
                if holes:
                    entry["holes"] = [[[x, y] for x, y in h] for h in holes]
                conductors.append(entry)
            continue
        # via layer: cluster the merged cells into merged-bbox conductors
        cells = [ext for ext, _ in merged]
        if not cells:
            continue
        for members in _cluster_vias(cells, VIA_CLUSTER_SLACK_UM):
            xmin = ymin = float("inf"); xmax = ymax = float("-inf")
            cluster_cells = []
            for i in members:
                bx = _bbox(cells[i])
                xmin = min(xmin, bx[0]); ymin = min(ymin, bx[1])
                xmax = max(xmax, bx[2]); ymax = max(ymax, bx[3])
                cluster_cells.append([[x, y] for x, y in cells[i]])
            conductors.append({
                "layer": stack_id, "name": layer_name,
                "polygon": [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]],
                "polygon_cells": cluster_cells,
            })

    fem_ports = []
    for p in ports:
        stack_id = layer_name_to_stack_id.get(p.layer)
        if not stack_id:
            raise ValueError(f"build_fem_json: port '{p.name}' on layer '{p.layer}' "
                             f"has no mapping in stack '{stack.name}'")
        fem_ports.append({"name": p.name, "layer": stack_id, "x_um": p.x, "y_um": p.y})

    doc = {
        "schema_version": FEM_SCHEMA_VERSION,
        "stack": {
            "name": stack.name,
            "substrate": {"er": stack.substrate_er, "rho_ohm_cm": stack.substrate_rho,
                          "thickness_um": stack.substrate_thickness},
            "oxide": {"er": stack.oxide_er, "tand": OXIDE_TAND_DEFAULT},
            "layers": fem_layers,
        },
        "conductors": conductors,
        "ports": fem_ports,
    }

    warnings.extend(validate_fem_json(doc))
    if generator or warnings:
        doc["metadata"] = {"generator": generator or "unknown"}
        if params:
            doc["metadata"]["params"] = params
        if warnings:
            doc["metadata"]["warnings"] = warnings

    s = sim or {}
    doc["sim"] = {
        "f_min_hz": s.get("f_min_hz", FEM_SIM_DEFAULTS["f_min_hz"]),
        "f_max_hz": s.get("f_max_hz", FEM_SIM_DEFAULTS["f_max_hz"]),
        "n_points": s.get("n_points", FEM_SIM_DEFAULTS["n_points"]),
        "z0_ohm": s.get("z0_ohm", FEM_SIM_DEFAULTS["z0_ohm"]),
    }
    return doc


def validate_fem_json(doc: dict) -> list[str]:
    """Mirror of export_fem.ts::validateFemJson — returns list of problems."""
    errs: list[str] = []
    by_id = {l["id"]: l for l in doc["stack"]["layers"]}
    if not doc["conductors"]:
        errs.append("no conductors emitted")
    if not doc["ports"]:
        errs.append("no ports emitted")
    for c in doc["conductors"]:
        tag = c.get("name", c["layer"])
        if c["layer"] not in by_id:
            errs.append(f"conductor '{tag}' references unknown stack layer '{c['layer']}'")
        if len(c["polygon"]) < 3:
            errs.append(f"conductor '{tag}' has a degenerate polygon (<3 points)")
    for p in doc["ports"]:
        l = by_id.get(p["layer"])
        if l is None:
            errs.append(f"port '{p['name']}' references unknown stack layer '{p['layer']}'")
        elif l["type"] != "metal":
            errs.append(f"port '{p['name']}' sits on non-metal layer '{p['layer']}'")
    return errs
