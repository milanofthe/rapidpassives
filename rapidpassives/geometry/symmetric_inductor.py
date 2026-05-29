"""Symmetric inductor — Python port of web/src/lib/geometry/symmetric_inductor.ts."""
from __future__ import annotations

import math

from .primitives import Poly, make_aspect_shift_y, map_y, mirror_x, routing_geometric_45, via_grid
from .result import GeometryResult, Port


def _zip(xs, ys) -> Poly:
    return list(zip(xs, ys))


def _legacy_polygons(params: dict) -> dict[str, list[Poly]]:
    Dout = params["Dout"]; N = params["N"]; sides = params["sides"]
    width = params["width"]; spacing = params["spacing"]; center_tap = params["center_tap"]
    extend = params["via_extent"]; via_spacing = params["via_spacing"]
    via_width = params["via_width"]; via_in_metal = params["via_in_metal"]

    PI = math.pi; SQRT2 = math.sqrt(2)
    v = width / math.cos(PI / sides)
    s = (spacing + width) / math.cos(PI / sides)
    R1 = Dout / 2 / math.cos(PI / sides); R2 = R1 - v

    n_half = sides // 2
    left_angles = [PI * (0.5 + (i + 0.5) * 2 / sides) for i in range(n_half)]
    right_angles = [PI * (-0.5 + (i + 0.5) * 2 / sides) for i in range(n_half)]
    sep_total = width + spacing + (SQRT2 - 1) * (2 * spacing + width)

    pw: list[Poly] = []; pc: list[Poly] = []; pct: list[Poly] = []
    pv1: list[Poly] = []; pv2: list[Poly] = []

    for winding in range(N):
        # Left section
        x_out = [R1 * math.cos(p) for p in left_angles]; y_out = [R1 * math.sin(p) for p in left_angles]
        x_in = [R2 * math.cos(p) for p in left_angles]; y_in = [R2 * math.sin(p) for p in left_angles]
        if winding == N - 1:
            if N % 2 == 0:
                x_out = [-sep_total / 2, *x_out, 0]; x_in = [-sep_total / 2, *x_in, 0]
            else:
                x_out = [0, *x_out, -sep_total / 2]; x_in = [0, *x_in, -sep_total / 2]
        else:
            x_out = [-sep_total / 2, *x_out, -sep_total / 2]; x_in = [-sep_total / 2, *x_in, -sep_total / 2]
        y_out = [y_out[0], *y_out, y_out[-1]]; y_in = [y_in[0], *y_in, y_in[-1]]
        pw.append(_zip([*x_out, *reversed(x_in)], [*y_out, *reversed(y_in)]))

        # Right section
        x_out = [R1 * math.cos(p) for p in right_angles]; y_out = [R1 * math.sin(p) for p in right_angles]
        x_in = [R2 * math.cos(p) for p in right_angles]; y_in = [R2 * math.sin(p) for p in right_angles]
        if winding == N - 1:
            if N % 2 == 0:
                x_out = [0, *x_out, sep_total / 2]; x_in = [0, *x_in, sep_total / 2]
            else:
                x_out = [sep_total / 2, *x_out, 0]; x_in = [sep_total / 2, *x_in, 0]
        else:
            x_out = [sep_total / 2, *x_out, sep_total / 2]; x_in = [sep_total / 2, *x_in, sep_total / 2]
        y_out = [y_out[0], *y_out, y_out[-1]]; y_in = [y_in[0], *y_in, y_in[-1]]
        pw.append(_zip([*x_out, *reversed(x_in)], [*y_out, *reversed(y_in)]))

        # Crossings
        if winding != N - 1:
            h = R1 * math.sin(PI * (0.5 - 1 / sides)) if winding % 2 == 0 \
                else (-R2 + s) * math.sin(PI * (0.5 - 1 / sides))
            pc.append(routing_geometric_45(width, spacing, 0, h - width - spacing / 2, extend))
            cross_top = routing_geometric_45(width, spacing, 0, h - width - spacing / 2, 0)
            pw.append(mirror_x(cross_top))
            for cx, cy in [(-sep_total / 2 - width / 2, h - 3 * width / 2 - spacing),
                           (sep_total / 2 + width / 2, h - width / 2)]:
                dx = math.copysign(1, cx) * (extend - width) / 2
                pv1 += via_grid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width)

        R1 -= s; R2 -= s

    # Center tap
    if center_tap:
        x_ct = [-width / 2, -width / 2, width / 2, width / 2]
        if N % 2 != 0:
            if N <= 2:
                y_ct = [-Dout / 2, Dout / 2 - spacing * (N - 1) - width * (N - 1),
                        Dout / 2 - spacing * (N - 1) - width * (N - 1), -Dout / 2]
            else:
                y_ct = [-Dout / 2 + width - extend, Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend,
                        Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend, -Dout / 2 + width - extend]
        else:
            if N <= 2:
                y_ct = [-Dout / 2, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
                        -Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2]
            else:
                y_ct = [-Dout / 2 + width - extend, -Dout / 2 + spacing * (N - 1) + width * (N - 1),
                        -Dout / 2 + spacing * (N - 1) + width * (N - 1), -Dout / 2 + width - extend]
        if N <= 2:
            pw.append(_zip(x_ct, y_ct))
        else:
            pct.append(_zip(x_ct, y_ct))
            if N % 2 != 0:
                x_ct1, y_ct1 = 0, Dout / 2 - spacing * (N - 1) - width * (N - 1) - extend / 2
                x_ct2, y_ct2 = 0, -Dout / 2 + width / 2 + (width - extend) / 2
            else:
                x_ct1, y_ct1 = 0, -Dout / 2 + spacing * (N - 1) + width * N - width + extend / 2
                x_ct2, y_ct2 = 0, -Dout / 2 + width - extend / 2
            xvp1 = [x_ct1 - width / 2, x_ct1 - width / 2, x_ct1 + width / 2, x_ct1 + width / 2]
            yvp1 = [y_ct1 - extend / 2, y_ct1 + extend / 2, y_ct1 + extend / 2, y_ct1 - extend / 2]
            xvp2 = [x_ct2 - width / 2, x_ct2 - width / 2, x_ct2 + width / 2, x_ct2 + width / 2]
            yvp2 = [y_ct2 - extend / 2, y_ct2 + extend / 2, y_ct2 + extend / 2, y_ct2 - extend / 2]
            pw.append(_zip(xvp1, yvp1))
            pc.append(_zip(xvp1, yvp1)); pct.append(_zip(xvp1, yvp1))
            pc.append(_zip(xvp2, yvp2)); pct.append(_zip(xvp2, yvp2))
            for cx, cy in [(x_ct1, y_ct1), (x_ct2, y_ct2)]:
                vp = via_grid(cx, cy, width - 2 * via_in_metal, extend - 2 * via_in_metal, via_spacing, via_width)
                pv2 += vp; pv1 += vp

    # Ports
    ps = params.get("portSpacing", spacing)
    pxo = ps + width if center_tap else (ps + width) / 2
    x_port = [-sep_total / 2, -pxo + width / 2, -pxo + width / 2, -pxo - width / 2, -pxo - width / 2, -sep_total / 2]
    y_port = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width, -Dout / 2 - width, -Dout / 2, -Dout / 2]
    if center_tap:
        pw.append(_zip([-width / 2, -width / 2, width / 2, width / 2],
                       [-Dout / 2 - width, -Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width]))
    pw.append(_zip(x_port, y_port))
    pw.append(_zip([-x for x in x_port], y_port))

    return {"windings": pw, "crossings": pc, "vias1": pv1, "centertap": pct, "vias2": pv2, "pgs": []}


def build_symmetric_inductor(params: dict) -> GeometryResult:
    Dout = params["Dout"]; width = params["width"]; spacing = params["spacing"]
    center_tap = params["center_tap"]; ar = params.get("aspectRatio", 1.0)

    layers = _legacy_polygons(params)

    ps = params.get("portSpacing", spacing)
    port_x = ps + width if center_tap else (ps + width) / 2
    port_y = -Dout / 2 - width
    shift_y = make_aspect_shift_y(Dout, ar)

    ports = [
        Port("P1", -port_x, shift_y(port_y), "windings"),
        Port("P2", port_x, shift_y(port_y), "windings"),
    ]
    if center_tap:
        ct_layer = "windings" if params["N"] <= 2 else "centertap"
        ports.append(Port("CT", 0, shift_y(port_y), ct_layer, role="centertap"))

    if ar != 1:
        layers = {k: [map_y(p, shift_y) for p in v] for k, v in layers.items()}

    return GeometryResult(layers, ports)
