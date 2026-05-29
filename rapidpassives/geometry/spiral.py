"""Spiral inductor geometry — Python port of web/src/lib/geometry/spiral.ts.

Polygons are the single source of truth, exactly as in the TS app, so the FEM
JSON produced here matches the web export for identical parameters.
"""
from __future__ import annotations

import math

from .primitives import Poly, make_aspect_shift_y, map_y, pgs4, via_grid
from .result import GeometryResult, Port


def build_spiral_inductor(params: dict) -> GeometryResult:
    Dout = params["Dout"]; N = params["N"]; sides = params["sides"]
    width = params["width"]; spacing = params["spacing"]
    via_spacing = params["via_spacing"]; via_width = params["via_width"]
    via_in_metal = params["via_in_metal"]
    ar = params.get("aspectRatio", 1.0)
    opposite = params.get("portSide") == "opposite"

    PI = math.pi
    s = (spacing + width) / math.cos(PI / sides)
    v = width / math.cos(PI / sides)
    R1 = Dout / 2 / math.cos(PI / sides)
    R2 = R1 - v

    n_pts = sides // 2
    angles = [PI * (1 / (2 * n_pts) + i * (1 - 1 / n_pts) / (n_pts - 1)) for i in range(n_pts)]

    extend = 2 * (via_width + via_in_metal) + via_spacing
    x_shift = -s / 2 * math.cos(PI / sides)
    y_shift = -s / 2 * math.sin(PI / sides)

    n_sections = 2 * N - 1 if opposite else 2 * N

    x_out: list[float] = []; y_out: list[float] = []
    x_in: list[float] = []; y_in: list[float] = []
    r1, r2 = R1, R2
    for section in range(n_sections):
        if section % 2 == 0:
            for phi in angles:
                x_out.append(r1 * math.cos(phi)); x_in.append(r2 * math.cos(phi))
                y_out.append(r1 * math.sin(phi)); y_in.append(r2 * math.sin(phi))
        else:
            for phi in angles:
                x_out.append(-r1 * math.cos(phi) + x_shift); x_in.append(-r2 * math.cos(phi) + x_shift)
                y_out.append(-r1 * math.sin(phi) + y_shift); y_in.append(-r2 * math.sin(phi) + y_shift)
        r1 -= s / 2; r2 -= s / 2

    entry_yc = 0.0 if opposite else (width + spacing) / 2
    exit_yc = 0.0 if opposite else -(width + spacing) / 2

    x_out_start = [Dout / 2 + width, x_out[0]]
    x_in_start = [Dout / 2 + width, x_in[0]]
    y_out_start = [entry_yc + width / 2, entry_yc + width / 2]
    y_in_start = [entry_yc - width / 2, entry_yc - width / 2]

    x_out_end = [x_out[-1]]
    x_in_end = [x_in[-1]]
    y_end = [-width / 2 if opposite else -spacing / 2]

    x_poly = x_out_start + x_out + x_out_end + list(reversed(x_in_end)) + list(reversed(x_in)) + list(reversed(x_in_start))
    y_poly = y_out_start + y_out + y_end + list(reversed(y_end)) + list(reversed(y_in)) + list(reversed(y_in_start))
    winding_polygon: Poly = list(zip(x_poly, y_poly))

    last_x_in = x_in[-1]; last_x_out = x_out[-1]
    underpass_end_x = -(Dout / 2 + width) if opposite else Dout / 2 + width
    underpass_polygon: Poly = [
        (last_x_in, exit_yc - width / 2),
        (underpass_end_x, exit_yc - width / 2),
        (underpass_end_x, exit_yc + width / 2),
        (last_x_in, exit_yc + width / 2),
    ]

    via_cx = last_x_out + (last_x_in - last_x_out) / 2
    via_cy = exit_yc
    if extend > width:
        via_polys = via_grid(via_cx, via_cy + (extend - width) / 2,
                             width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width)
    else:
        via_polys = via_grid(via_cx, via_cy,
                             width - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width)

    shift_y = make_aspect_shift_y(Dout, ar)
    layers = {
        "windings": [map_y(winding_polygon, shift_y)],
        "crossings": [map_y(underpass_polygon, shift_y)],
        "vias": [map_y(p, shift_y) for p in via_polys],
        "pgs": [],
    }
    ports = [
        Port("P1", Dout / 2 + width, shift_y(entry_yc), "windings"),
        Port("P2", underpass_end_x, shift_y(exit_yc), "crossings"),
    ]
    return GeometryResult(layers, ports)


def add_pgs(result: GeometryResult, D: float, w: float, s: float) -> None:
    result.layers["pgs"] = pgs4(D, w, s)
