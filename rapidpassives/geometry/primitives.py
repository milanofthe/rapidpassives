"""Geometry primitives, ported 1:1 from the TS app (web/src/lib/geometry).

A polygon is a list of (x, y) vertex tuples. A layer map is dict[str, list[poly]].
"""
from __future__ import annotations

import math
from typing import Callable

Poly = list[tuple[float, float]]


def rect(cx: float, cy: float, w: float, h: float) -> Poly:
    """Axis-aligned rectangle centered at (cx, cy), counter-clockwise."""
    return [
        (cx - w / 2, cy - h / 2),
        (cx - w / 2, cy + h / 2),
        (cx + w / 2, cy + h / 2),
        (cx + w / 2, cy - h / 2),
    ]


def mirror_x(p: Poly) -> Poly:
    return [(-x, y) for (x, y) in p]


def mirror_y(p: Poly) -> Poly:
    return [(x, -y) for (x, y) in p]


def map_y(p: Poly, f: Callable[[float], float]) -> Poly:
    return [(x, f(y)) for (x, y) in p]


def make_aspect_shift_y(Dout: float, aspect_ratio: float = 1.0) -> Callable[[float], float]:
    """Stretch straight sides only (y=0 fixed). Identity when aspect_ratio == 1."""
    if aspect_ratio == 1:
        return lambda y: y
    ext = Dout * (aspect_ratio - 1)
    return lambda y: y + ext / 2 if y > 0 else (y - ext / 2 if y < 0 else y)


def via_grid(x0: float, y0: float, width_x: float, width_y: float,
             via_spacing: float, via_width: float, via_merge: bool = False) -> list[Poly]:
    """Grid of via squares centered on (x0, y0). Ported from utils.ts::viaGrid."""
    if via_merge:
        return [[
            (x0 + width_x / 2, y0 + width_y / 2),
            (x0 + width_x / 2, y0 - width_y / 2),
            (x0 - width_x / 2, y0 - width_y / 2),
            (x0 - width_x / 2, y0 + width_y / 2),
        ]]
    polys: list[Poly] = []
    nx = math.floor((width_x + via_spacing) / (via_width + via_spacing))
    ny = math.floor((width_y + via_spacing) / (via_width + via_spacing))
    diff_x = width_x - nx * via_width - (nx - 1) * via_spacing
    diff_y = width_y - ny * via_width - (ny - 1) * via_spacing
    for i in range(nx):
        x = i * (via_width + via_spacing) - width_x / 2 + diff_x / 2 + x0
        for j in range(ny):
            y = j * (via_width + via_spacing) - width_y / 2 + diff_y / 2 + y0
            polys.append([(x, y), (x + via_width, y), (x + via_width, y + via_width), (x, y + via_width)])
    return polys


def routing_geometric_45(w: float, s: float, x0: float, y0: float, extend: float = 0.0) -> Poly:
    """45-degree crossing routing — ported from utils.ts::routingGeometric45."""
    SQRT2 = math.sqrt(2)
    g = (SQRT2 - 1) * s
    d = (SQRT2 - 1) * w
    h = w + s + (SQRT2 - 1) * (2 * s + w)
    x_upper = [-h / 2, -h / 2 + g, h / 2 - g - d, h / 2]
    y_upper = [-s / 2, -s / 2, s / 2 + w, s / 2 + w]
    x_lower = [-h / 2, -h / 2 + g + d, h / 2 - g, h / 2]
    y_lower = [-s / 2 - w, -s / 2 - w, s / 2, s / 2]
    if extend > 0:
        x_upper = [-h / 2 - extend] + x_upper + [h / 2 + extend]
        y_upper = [-s / 2] + y_upper + [s / 2 + w]
        x_lower = [-h / 2 - extend] + x_lower + [h / 2 + extend]
        y_lower = [-s / 2 - w] + y_lower + [s / 2]
    xs = [v + x0 for v in x_upper] + [v + x0 for v in reversed(x_lower)]
    ys = [v + y0 for v in y_upper] + [v + y0 for v in reversed(y_lower)]
    return list(zip(xs, ys))


def pgs4(D: float, w: float, s: float) -> list[Poly]:
    """Manhattan fishbone patterned ground shield filling a DxD square.

    Mirrors utils.ts::pgs4 (post-DRC-fix): central vertical spine + horizontal
    fingers, tree topology (no loops), all right angles.
    """
    R = D / 2
    pitch = w + s
    sections: list[Poly] = []
    sections.append([(-w / 2, -R), (-w / 2, R), (w / 2, R), (w / 2, -R)])
    k_max = math.floor((R - w / 2) / pitch)
    for k in range(-k_max, k_max + 1):
        yc = k * pitch
        yb, yt = yc - w / 2, yc + w / 2
        sections.append([(-R, yb), (-R, yt), (R, yt), (R, yb)])
    return sections
