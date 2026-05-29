"""Stacked transformer — Python port of web/src/lib/geometry/stacked_transformer.ts.

Primary winding on the top metal, secondary mirrored below; each half built by
the same routine as the symmetric inductor, then placed on its own layers.
"""
from __future__ import annotations

import math

from .primitives import Poly, mirror_y, routing_geometric_45, via_grid
from .result import GeometryResult, Port


def _zip(xs, ys) -> Poly:
    return list(zip(xs, ys))


def _build_winding_polygons(cfg: dict):
    N = cfg["N"]; sides = cfg["sides"]; width = cfg["width"]; spacing = cfg["spacing"]
    Dout = cfg["Dout"]; R1_start = cfg["R1_start"]; center_tap = cfg["center_tap"]
    extend = cfg["via_extent"]; via_spacing = cfg["via_spacing"]
    via_width = cfg["via_width"]; via_in_metal = cfg["via_in_metal"]
    winding_layer = cfg["windingLayer"]; crossing_layer = cfg["crossingLayer"]
    via_layer = cfg["viaLayer"]; port_side = cfg["portSide"]

    PI = math.pi; SQRT2 = math.sqrt(2)
    v = width / math.cos(PI / sides)
    s = (spacing + width) / math.cos(PI / sides)
    sep_total = width + spacing + (SQRT2 - 1) * (2 * spacing + width)

    n_half = sides // 2
    left_angles = [PI * (0.5 + (i + 0.5) * 2 / sides) for i in range(n_half)]
    right_angles = [PI * (-0.5 + (i + 0.5) * 2 / sides) for i in range(n_half)]

    pw: list[Poly] = []; pc: list[Poly] = []; pct: list[Poly] = []
    pv: list[Poly] = []; pv2: list[Poly] = []

    R1 = R1_start; R2 = R1 - v
    for winding in range(N):
        for angles, left in ((left_angles, True), (right_angles, False)):
            x_out = [R1 * math.cos(p) for p in angles]; y_out = [R1 * math.sin(p) for p in angles]
            x_in = [R2 * math.cos(p) for p in angles]; y_in = [R2 * math.sin(p) for p in angles]
            if winding == N - 1:
                if left:
                    if N % 2 == 0:
                        x_out = [-sep_total / 2, *x_out, 0]; x_in = [-sep_total / 2, *x_in, 0]
                    else:
                        x_out = [0, *x_out, -sep_total / 2]; x_in = [0, *x_in, -sep_total / 2]
                else:
                    if N % 2 == 0:
                        x_out = [0, *x_out, sep_total / 2]; x_in = [0, *x_in, sep_total / 2]
                    else:
                        x_out = [sep_total / 2, *x_out, 0]; x_in = [sep_total / 2, *x_in, 0]
            else:
                sgn = -1 if left else 1
                x_out = [sgn * sep_total / 2, *x_out, sgn * sep_total / 2]
                x_in = [sgn * sep_total / 2, *x_in, sgn * sep_total / 2]
            y_out = [y_out[0], *y_out, y_out[-1]]; y_in = [y_in[0], *y_in, y_in[-1]]
            pw.append(_zip([*x_out, *reversed(x_in)], [*y_out, *reversed(y_in)]))

        if winding != N - 1:
            h = R1 * math.sin(PI * (0.5 - 1 / sides)) if winding % 2 == 0 \
                else (-R2 + s) * math.sin(PI * (0.5 - 1 / sides))
            pc.append(routing_geometric_45(width, spacing, 0, h - width - spacing / 2, extend))
            ct = routing_geometric_45(width, spacing, 0, h - width - spacing / 2, 0)
            pw.append([(-x, y) for (x, y) in ct])
            for cx, cy in [(-sep_total / 2 - width / 2, h - 3 * width / 2 - spacing),
                           (sep_total / 2 + width / 2, h - width / 2)]:
                dx = math.copysign(1, cx) * (extend - width) / 2
                pv += via_grid(cx + dx, cy, extend - 2 * via_in_metal, width - 2 * via_in_metal, via_spacing, via_width)

        R1 -= s; R2 -= s

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
                pv2 += vp; pv += vp

    # Ports (always built at the bottom, then mirrored with the rest if top).
    ps = cfg.get("portSpacing") or spacing
    pxo = ps + width if center_tap else (ps + width) / 2
    x_port = [-sep_total / 2, -pxo + width / 2, -pxo + width / 2, -pxo - width / 2, -pxo - width / 2, -sep_total / 2]
    y_port = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width, -Dout / 2 - width, -Dout / 2, -Dout / 2]
    if center_tap:
        pw.append(_zip([-width / 2, -width / 2, width / 2, width / 2],
                       [-Dout / 2 - width, -Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width]))
    pw.append(_zip(x_port, y_port))
    pw.append(_zip([-x for x in x_port], y_port))

    all_groups = [pw, pc, pct, pv, pv2]
    if port_side == "top":
        all_groups = [[mirror_y(p) for p in g] for g in all_groups]
        pw, pc, pct, pv, pv2 = all_groups

    layers: dict[str, list[Poly]] = {}
    if pw: layers[winding_layer] = pw
    if pc: layers[crossing_layer] = pc
    if pv: layers[via_layer] = pv
    if pct: layers["centertap"] = pct
    if pv2:
        layers["vias2" if via_layer == "vias1" else "vias1"] = pv2

    port_x = pxo
    port_marker_y = -Dout / 2 - width if port_side == "bottom" else Dout / 2 + width
    ports = [
        Port("P1", -port_x, port_marker_y, winding_layer),
        Port("P2", port_x, port_marker_y, winding_layer),
    ]
    if center_tap:
        ports.append(Port("CT", 0, port_marker_y, winding_layer, role="centertap"))
    return layers, ports


def build_stacked_transformer(params: dict) -> GeometryResult:
    Dout = params["Dout"]; N1 = params["N1"]; N2 = params["N2"]; sides = params["sides"]
    width = params["width"]; spacing = params["spacing"]
    R1_init = Dout / 2 / math.cos(math.pi / sides)
    common = dict(sides=sides, width=width, spacing=spacing, Dout=Dout, R1_start=R1_init,
                  via_extent=params["via_extent"], via_spacing=params["via_spacing"],
                  via_width=params["via_width"], via_in_metal=params["via_in_metal"],
                  portSpacing=params.get("portSpacing"))

    prim_layers, prim_ports = _build_winding_polygons({
        **common, "N": N1, "center_tap": params["center_tap_primary"],
        "windingLayer": "windings_m4", "crossingLayer": "windings", "viaLayer": "vias3", "portSide": "bottom"})
    sec_layers, sec_ports = _build_winding_polygons({
        **common, "N": N2, "center_tap": params["center_tap_secondary"],
        "windingLayer": "windings_m2", "crossingLayer": "crossings_m1", "viaLayer": "vias2", "portSide": "top"})

    layers: dict[str, list[Poly]] = {}
    for src in (prim_layers, sec_layers):
        for k, polys in src.items():
            layers[k] = [*layers.get(k, []), *polys]

    def rename(p: Port, mapping: dict[str, str]) -> Port:
        return Port(mapping.get(p.name, p.name), p.x, p.y, p.layer, p.role)

    ports = [rename(p, {"P1": "P+", "P2": "P-", "CT": "CT_P"}) for p in prim_ports]
    ports += [rename(p, {"P1": "S+", "P2": "S-", "CT": "CT_S"}) for p in sec_ports]
    return GeometryResult(layers, ports)
