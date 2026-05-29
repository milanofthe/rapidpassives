"""Microstrip patch antenna — Python port of web/src/lib/geometry/patch_antenna.ts."""
from __future__ import annotations

from .primitives import Poly
from .result import GeometryResult, Port


def build_patch_antenna(params: dict) -> GeometryResult:
    W = params["W"]; L = params["L"]; feed_type = params["feedType"]
    feed_width = params["feedWidth"]; feed_length = params["feedLength"]
    inset_depth = params["insetDepth"]; inset_gap = params["insetGap"]; ground_margin = params["groundMargin"]

    Wg = W + 2 * ground_margin
    Lg = L + 2 * ground_margin
    ground = [(-Wg / 2, -Lg / 2), (Wg / 2, -Lg / 2), (Wg / 2, Lg / 2), (-Wg / 2, Lg / 2)]

    if feed_type == "inset" and inset_depth > 0:
        nhw = feed_width / 2 + inset_gap
        xs = [-W / 2, -nhw, -nhw, -feed_width / 2, -feed_width / 2,
              feed_width / 2, feed_width / 2, nhw, nhw, W / 2, W / 2, -W / 2]
        ys = [-L / 2, -L / 2, -L / 2 + inset_depth, -L / 2 + inset_depth, -L / 2,
              -L / 2, -L / 2 + inset_depth, -L / 2 + inset_depth, -L / 2, -L / 2, L / 2, L / 2]
        patch = [list(zip(xs, ys))]
    else:
        patch = [[(-W / 2, -L / 2), (W / 2, -L / 2), (W / 2, L / 2), (-W / 2, L / 2)]]

    feed_end_y = -Lg / 2 - feed_length
    hw = feed_width / 2
    feed = [(-hw, feed_end_y), (hw, feed_end_y), (hw, -L / 2), (-hw, -L / 2)]

    layers: dict[str, list[Poly]] = {"crossings": [ground], "windings": [*patch, feed]}
    ports = [Port("P1", 0, feed_end_y, "windings")]
    return GeometryResult(layers, ports)
