"""Symmetric transformer — Python port of web/src/lib/geometry/symmetric_transformer.ts.

Includes the crossing-via emission (R1) that the TS refactor moved into the
polygon path.
"""
from __future__ import annotations

import math

from .primitives import Poly, mirror_x, routing_geometric_45, via_grid
from .result import GeometryResult, Port


def _zip(xs, ys) -> Poly:
    return list(zip(xs, ys))


def _sign(x: float) -> int:
    return (x > 0) - (x < 0)


def _legacy_polygons(params: dict) -> dict[str, list[Poly]]:
    Dout = params["Dout"]; N1 = params["N1"]; N2 = params["N2"]; sides = params["sides"]
    width = params["width"]; spacing = params["spacing"]
    center_tap_primary = params["center_tap_primary"]; center_tap_secondary = params["center_tap_secondary"]
    extend = params["via_extent"]; via_spacing = params["via_spacing"]
    via_width = params["via_width"]; via_in_metal = params["via_in_metal"]

    PI = math.pi; SQRT2 = math.sqrt(2)
    N = N1 + N2
    Nmin = min(N1, N2)
    N1_end = N - 1 if N1 > N2 else N - abs(N1 - N2) - 1
    N2_end = N - 1 if N1 < N2 else N - abs(N1 - N2) - 1
    v = width / math.cos(PI / sides)
    s = (spacing + width) / math.cos(PI / sides)
    R1_init = Dout / 2 / math.cos(PI / sides)

    ul = []; ur = []; ll = []; lr = []
    for i in range(sides // 4):
        t = (i + 0.5) * 2 / sides
        ul.append(PI * (0.5 + t)); ur.append(PI * (0 + t))
        ll.append(PI * (1 + t)); lr.append(PI * (1.5 + t))

    sep_total = width + spacing + (SQRT2 - 1) * (2 * spacing + width)

    def rng(a, b=None):
        return list(range(a)) if b is None else list(range(a, b))

    top_bridge: list[int] = []; bot_bridge: list[int] = []
    top_crossing: list[int] = []; bot_crossing: list[int] = []
    if N2 % 2 == 0:
        top_bridge.append(N2_end)
        if N1 % 2 == 0:
            bot_bridge.append(N1_end)
            if N1 >= N2:
                top_crossing += [w for w in rng(N) if w % 2 != 0 and 0 < w < Nmin * 2 - 1]
                top_crossing += [w for w in rng(N) if w % 2 == 0 and N > w > Nmin * 2 - 1]
                bot_crossing += [w for w in rng(N) if w % 2 != 0 and w < N - 1]
            else:
                bot_crossing += [w for w in rng(N) if w % 2 != 0 and 0 < w < Nmin * 2 - 1]
                bot_crossing += [w for w in rng(N) if w % 2 == 0 and N > w > Nmin * 2 - 1]
                top_crossing += [w for w in rng(N) if w % 2 != 0 and w < N - 1]
        else:
            top_bridge.append(N1_end)
            top_crossing += [w for w in rng(N) if w % 2 != 0 and 0 < w < Nmin * 2 - 1]
            top_crossing += [w for w in rng(N) if w % 2 == 0 and N - 1 > w > Nmin * 2 - 1]
            bot_crossing += [w for w in rng(N) if w % 2 != 0 and w < N]
    else:
        bot_bridge.append(N2_end)
        if N1 % 2 == 0:
            bot_bridge.append(N1_end)
            top_crossing += [w for w in rng(N) if w % 2 != 0 and 0 < w < N - 1]
            bot_crossing += [w for w in rng(N) if w % 2 == 0 and N - 1 > w > Nmin * 2 - 1]
            bot_crossing += [w for w in rng(N) if w % 2 != 0 and w < Nmin * 2 - 1]
        else:
            top_bridge.append(N1_end)
            if N1 >= N2:
                top_crossing += [w for w in rng(N) if w % 2 != 0 and w < N - 1]
                bot_crossing += [w for w in rng(N) if w % 2 != 0 and w < Nmin * 2 - 1]
                bot_crossing += [w for w in rng(N) if w % 2 == 0 and N - 1 > w > Nmin * 2 - 1]
            else:
                top_crossing += [w for w in rng(N) if w % 2 == 0 and N - 1 > w > Nmin * 2 - 1]
                top_crossing += [w for w in rng(N) if w % 2 != 0 and w < Nmin * 2 - 1]
                bot_crossing += [w for w in rng(N) if w % 2 != 0 and w < Nmin * 2]
                bot_crossing += [w for w in rng(N) if w % 2 != 0 and N - 1 > w > Nmin * 2 - 1]
    lr_bridge = [w - 1 for w in rng(1, N + 1) if w > 2 * Nmin]
    lr_crossing = [w - 1 for w in rng(1, N + 1) if w % 2 != 0 and w < 2 * Nmin]

    pw: list[Poly] = []; pc: list[Poly] = []; pct: list[Poly] = []
    pv1: list[Poly] = []; pv2: list[Poly] = []
    via_centers_tct: list[tuple[float, float]] = []

    def via_polys_at(cx: float, cy: float):
        dx = _sign(cx) * (extend - width) / 2
        dy = _sign(cy) * (extend - width) / 2
        w_in = extend - 2 * via_in_metal
        h_in = width - 2 * via_in_metal
        if abs(cy) > abs(cx):
            return via_grid(cx + dx, cy, w_in, h_in, via_spacing, via_width)
        return via_grid(cx, cy + dy, h_in, w_in, via_spacing, via_width)

    R1 = R1_init; R2 = R1 - v
    for winding in range(N):
        all_angles = [ul, ll, ur, lr]
        for qi in range(4):
            angs = all_angles[qi]
            x_out = [R1 * math.cos(p) for p in angs]; y_out = [R1 * math.sin(p) for p in angs]
            x_in = [R2 * math.cos(p) for p in angs]; y_in = [R2 * math.sin(p) for p in angs]
            if qi == 0:
                y_out = [y_out[0], *y_out, sep_total / 2]; y_in = [y_in[0], *y_in, sep_total / 2]
                x_out = [-sep_total / 2, *x_out, x_out[-1]]; x_in = [-sep_total / 2, *x_in, x_in[-1]]
            elif qi == 1:
                y_out = [-sep_total / 2, *y_out, y_out[-1]]; y_in = [-sep_total / 2, *y_in, y_in[-1]]
                x_out = [x_out[0], *x_out, -sep_total / 2]; x_in = [x_in[0], *x_in, -sep_total / 2]
            elif qi == 2:
                y_out = [sep_total / 2, *y_out, y_out[-1]]; y_in = [sep_total / 2, *y_in, y_in[-1]]
                x_out = [x_out[0], *x_out, sep_total / 2]; x_in = [x_in[0], *x_in, sep_total / 2]
            else:
                y_out = [y_out[0], *y_out, -sep_total / 2]; y_in = [y_in[0], *y_in, -sep_total / 2]
                x_out = [sep_total / 2, *x_out, x_out[-1]]; x_in = [sep_total / 2, *x_in, x_in[-1]]
            pw.append(_zip([*x_out, *reversed(x_in)], [*y_out, *reversed(y_in)]))

        if winding in bot_bridge:
            h = -R2 * math.sin(PI * (0.5 - 1 / sides))
            pw.append(_zip([-sep_total / 2, sep_total / 2, sep_total / 2, -sep_total / 2], [h, h, h - width, h - width]))
        if winding in top_bridge:
            h = (R2 + v) * math.sin(PI * (0.5 - 1 / sides))
            pw.append(_zip([-sep_total / 2, sep_total / 2, sep_total / 2, -sep_total / 2], [h, h, h - width, h - width]))
        if winding in lr_bridge:
            hR = (R2 + v) * math.sin(PI * (0.5 - 1 / sides))
            pw.append(_zip([hR, hR, hR - width, hR - width], [-sep_total / 2, sep_total / 2, sep_total / 2, -sep_total / 2]))
            hL = -R2 * math.sin(PI * (0.5 - 1 / sides))
            pw.append(_zip([hL, hL, hL - width, hL - width], [-sep_total / 2, sep_total / 2, sep_total / 2, -sep_total / 2]))

        if winding in top_crossing:
            h = R1 * math.sin(PI * (0.5 - 1 / sides))
            pc.append(routing_geometric_45(width, spacing, 0, h - width - spacing / 2, extend))
            ct = routing_geometric_45(width, spacing, 0, h - width - spacing / 2, 0)
            pw.append(mirror_x(ct))
        if winding in bot_crossing:
            h = (-R2 + s) * math.sin(PI * (0.5 - 1 / sides))
            pc.append(routing_geometric_45(width, spacing, 0, h - width - spacing / 2, extend))
            ct = routing_geometric_45(width, spacing, 0, h - width - spacing / 2, 0)
            pw.append(mirror_x(ct))
        if winding in lr_crossing:
            hR = R1 * math.sin(PI * (0.5 - 1 / sides))
            cr = routing_geometric_45(width, spacing, 0, hR - width - spacing / 2, extend)
            pc.append([(y, x) for (x, y) in cr])
            cr = routing_geometric_45(width, spacing, 0, hR - width - spacing / 2, 0)
            pw.append([(-y, x) for (x, y) in cr])
            hL = (-R2 + s) * math.sin(PI * (0.5 - 1 / sides))
            cr = routing_geometric_45(width, spacing, 0, hL - width - spacing / 2, extend)
            pc.append([(y, x) for (x, y) in cr])
            cr = routing_geometric_45(width, spacing, 0, hL - width - spacing / 2, 0)
            pw.append([(-y, x) for (x, y) in cr])

        # Crossing vias (R1) — recessed under the m2 crossing strips above.
        h_top = R1 * math.sin(PI * (0.5 - 1 / sides))
        h_bot = (-R2 + s) * math.sin(PI * (0.5 - 1 / sides))
        if winding in top_crossing:
            pv1 += via_polys_at(-sep_total / 2 - width / 2, h_top - 3 * width / 2 - spacing)
            pv1 += via_polys_at(sep_total / 2 + width / 2, h_top - width / 2)
        if winding in bot_crossing:
            pv1 += via_polys_at(-sep_total / 2 - width / 2, h_bot - 3 * width / 2 - spacing)
            pv1 += via_polys_at(sep_total / 2 + width / 2, h_bot - width / 2)
        if winding in lr_crossing:
            pv1 += via_polys_at(h_bot - 3 * width / 2 - spacing, -sep_total / 2 - width / 2)
            pv1 += via_polys_at(h_bot - width / 2, sep_total / 2 + width / 2)
            pv1 += via_polys_at(h_top - 3 * width / 2 - spacing, -sep_total / 2 - width / 2)
            pv1 += via_polys_at(h_top - width / 2, sep_total / 2 + width / 2)

        R1 -= s; R2 -= s

    # Center taps
    def add_ct(n_end: int, ends_bottom: bool) -> None:
        _ext = min(width, extend)
        if ends_bottom:
            x_ct = [-width / 2, -width / 2, width / 2, width / 2]
            y_ct = [-Dout / 2 + width - _ext, -Dout / 2 + (spacing + width) * n_end,
                    -Dout / 2 + (spacing + width) * n_end, -Dout / 2 + width - _ext]
            x_ct1, y_ct1 = 0, -Dout / 2 + spacing * n_end + width * (n_end + 1) - width + _ext / 2
            x_ct2, y_ct2 = 0, -Dout / 2 + width / 2 + (width - _ext) / 2
        else:
            x_ct = [width / 2, width / 2, -width / 2, -width / 2]
            y_ct = [Dout / 2 - width + _ext, Dout / 2 - (spacing + width) * n_end,
                    Dout / 2 - (spacing + width) * n_end, Dout / 2 - width + _ext]
            x_ct1, y_ct1 = 0, Dout / 2 - spacing * n_end - width * (n_end + 1) + width - _ext / 2
            x_ct2, y_ct2 = 0, Dout / 2 - width / 2 - (width - _ext) / 2
        if n_end > 1:
            via_centers_tct.append((x_ct1, y_ct1)); via_centers_tct.append((x_ct2, y_ct2))
            xvp1 = [x_ct1 - width / 2, x_ct1 - width / 2, x_ct1 + width / 2, x_ct1 + width / 2]
            yvp1 = [y_ct1 - _ext / 2, y_ct1 + _ext / 2, y_ct1 + _ext / 2, y_ct1 - _ext / 2]
            xvp2 = [x_ct2 - width / 2, x_ct2 - width / 2, x_ct2 + width / 2, x_ct2 + width / 2]
            yvp2 = [y_ct2 - _ext / 2, y_ct2 + _ext / 2, y_ct2 + _ext / 2, y_ct2 - _ext / 2]
            pw.append(_zip(xvp1, yvp1)); pc.append(_zip(xvp1, yvp1)); pc.append(_zip(xvp2, yvp2))
            if n_end > 2:
                pct.append(_zip(x_ct, y_ct)); pct.append(_zip(xvp1, yvp1)); pct.append(_zip(xvp2, yvp2))
            else:
                pc.append(_zip(x_ct, y_ct))
        else:
            pw.append(_zip(x_ct, y_ct))

    if center_tap_primary:
        add_ct(N1_end, N1 % 2 == 0)
    if center_tap_secondary:
        add_ct(N2_end, N2 % 2 != 0)

    # Ports
    has_bottom_ct = (center_tap_primary and N1 % 2 == 0) or (center_tap_secondary and N2 % 2 != 0)
    has_top_ct = (center_tap_primary and N1 % 2 != 0) or (center_tap_secondary and N2 % 2 == 0)
    ps = params.get("portSpacing", spacing)
    bpx = ps + width if has_bottom_ct else (ps + width) / 2
    tpx = ps + width if has_top_ct else (ps + width) / 2

    x_port_b = [-sep_total / 2, -bpx + width / 2, -bpx + width / 2, -bpx - width / 2, -bpx - width / 2, -sep_total / 2]
    y_port_b = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width, -Dout / 2 - width, -Dout / 2, -Dout / 2]
    if has_bottom_ct:
        pw.append(_zip([-width / 2, -width / 2, width / 2, width / 2],
                       [-Dout / 2 - width, -Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width]))
    pw.append(_zip(x_port_b, y_port_b)); pw.append(_zip([-x for x in x_port_b], y_port_b))

    x_port_t = [-sep_total / 2, -tpx + width / 2, -tpx + width / 2, -tpx - width / 2, -tpx - width / 2, -sep_total / 2]
    y_port_t = [-Dout / 2 + width, -Dout / 2 + width, -Dout / 2 - width, -Dout / 2 - width, -Dout / 2, -Dout / 2]
    if has_top_ct:
        pw.append(_zip([-width / 2, -width / 2, width / 2, width / 2],
                       [Dout / 2 + width, Dout / 2 - width, Dout / 2 - width, Dout / 2 + width]))
    pw.append(_zip(x_port_t, [-y for y in y_port_t])); pw.append(_zip([-x for x in x_port_t], [-y for y in y_port_t]))

    # Center-tap vias
    _ext_ct = min(width, extend)
    for cx, cy in via_centers_tct:
        vp = via_grid(cx, cy, width - 2 * via_in_metal, _ext_ct - 2 * via_in_metal, via_spacing, via_width)
        pv2 += vp; pv1 += vp

    return {"windings": pw, "crossings": pc, "vias1": pv1, "centertap": pct, "vias2": pv2, "pgs": []}


def build_symmetric_transformer(params: dict) -> GeometryResult:
    Dout = params["Dout"]; N1 = params["N1"]; N2 = params["N2"]
    width = params["width"]; spacing = params["spacing"]
    center_tap_primary = params["center_tap_primary"]; center_tap_secondary = params["center_tap_secondary"]

    layers = _legacy_polygons(params)

    has_bot_ct = (center_tap_primary and N1 % 2 == 0) or (center_tap_secondary and N2 % 2 != 0)
    has_top_ct = (center_tap_primary and N1 % 2 != 0) or (center_tap_secondary and N2 % 2 == 0)
    ps = params.get("portSpacing", spacing)
    bot_px = ps + width if has_bot_ct else (ps + width) / 2
    top_px = ps + width if has_top_ct else (ps + width) / 2
    bot_y = -Dout / 2 - width; top_y = Dout / 2 + width

    ports = [
        Port("P1+", -bot_px, bot_y, "windings"),
        Port("P1-", bot_px, bot_y, "windings"),
        Port("P2+", -top_px, top_y, "windings"),
        Port("P2-", top_px, top_y, "windings"),
    ]
    if has_bot_ct:
        ports.append(Port("CT1", 0, bot_y, "windings", role="centertap"))
    if has_top_ct:
        ports.append(Port("CT2", 0, top_y, "windings", role="centertap"))

    return GeometryResult(layers, ports)
