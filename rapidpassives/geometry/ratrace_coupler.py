"""Rat-race (ring hybrid) coupler — Python port of web/src/lib/geometry/ratrace_coupler.ts."""
from __future__ import annotations

import math

from .primitives import Poly
from .result import GeometryResult, Port

_PORT_NAMES = ["Σ", "B", "Δ", "A"]  # Σ, B, Δ, A


def build_ratrace_coupler(params: dict) -> GeometryResult:
    radius = params["radius"]; ring_width = params["ringWidth"]
    port_width = params["portWidth"]; feed_length = params["feedLength"]; ground_margin = params["groundMargin"]
    enabled = params.get("enabledPorts", [True, True, True, True])

    PI = math.pi
    r_out = radius + ring_width / 2
    r_in = radius - ring_width / 2
    port_angles = [0, PI / 3, 2 * PI / 3, PI]

    polys: list[Poly] = []
    for p in range(4):
        a0 = port_angles[p]
        a1 = port_angles[(p + 1) % 4]
        end_angle = a1 + 2 * PI if a1 <= a0 else a1
        arc_deg = (end_angle - a0) * 180 / PI
        n_segs = max(4, round(arc_deg / 3))
        outer = []; inner = []
        for i in range(n_segs + 1):
            ang = a0 + (end_angle - a0) * i / n_segs
            outer.append((r_out * math.cos(ang), r_out * math.sin(ang)))
            inner.append((r_in * math.cos(ang), r_in * math.sin(ang)))
        polys.append([*outer, *reversed(inner)])

    ports: list[Port] = []
    for i in range(4):
        if not enabled[i]:
            continue
        ang = port_angles[i]
        cos = math.cos(ang); sin = math.sin(ang)
        px = -sin; py = cos
        hw = port_width / 2
        start_r = r_out; end_r = r_out + feed_length
        polys.append([
            (cos * start_r + px * hw, sin * start_r + py * hw),
            (cos * end_r + px * hw, sin * end_r + py * hw),
            (cos * end_r - px * hw, sin * end_r - py * hw),
            (cos * start_r - px * hw, sin * start_r - py * hw),
        ])
        ports.append(Port(_PORT_NAMES[i], cos * end_r, sin * end_r, "windings"))

    gp = r_out + feed_length + ground_margin
    ground = [(-gp, -gp), (gp, -gp), (gp, gp), (-gp, gp)]
    layers: dict[str, list[Poly]] = {"windings": polys, "crossings": [ground]}
    return GeometryResult(layers, ports)
