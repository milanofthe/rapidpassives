"""MOM interdigitated capacitor — Python port of web/src/lib/geometry/mom_capacitor.ts."""
from __future__ import annotations

from .primitives import Poly, via_grid
from .result import GeometryResult, Port

_METAL_LAYERS = ["windings", "windings_m2", "crossings_m1"]
_VIA_LAYERS = ["vias1", "vias2"]


def build_mom_capacitor(params: dict) -> GeometryResult:
    n_fingers = params["nFingers"]; finger_length = params["fingerLength"]
    finger_width = params["fingerWidth"]; finger_spacing = params["fingerSpacing"]
    bus_width = params["busWidth"]; n_layers = params["nLayers"]
    via_spacing = params["via_spacing"]; via_width = params["via_width"]; via_in_metal = params["via_in_metal"]

    layers: dict[str, list[Poly]] = {}
    pitch = finger_width + finger_spacing
    nf = n_fingers + 1 if n_fingers % 2 == 0 else n_fingers

    base_width = nf * finger_width + (nf - 1) * finger_spacing
    offset_extra = pitch / 2
    total_width = base_width + offset_extra
    total_height = finger_length + 2 * bus_width
    x0 = -total_width / 2
    y0 = -total_height / 2

    for layer in range(n_layers):
        render_layer = _METAL_LAYERS[layer]
        polys: list[Poly] = []
        offset = 0 if layer % 2 == 0 else pitch / 2
        layer_width = nf * finger_width + (nf - 1) * finger_spacing
        layer_x0 = -layer_width / 2 + offset

        for i in range(nf):
            is_positive = i % 2 == 0
            fx = layer_x0 + i * pitch
            if fx + finger_width > total_width / 2 + 0.001:
                continue
            if fx < -total_width / 2 - 0.001:
                continue
            if is_positive:
                fy = y0 + bus_width; fh = finger_length - finger_spacing
            else:
                fy = y0 + bus_width + finger_spacing; fh = finger_length - finger_spacing
            polys.append([(fx, fy), (fx + finger_width, fy), (fx + finger_width, fy + fh), (fx, fy + fh)])

        # Bus bars (full width).
        polys.append([(x0, y0), (x0 + total_width, y0), (x0 + total_width, y0 + bus_width), (x0, y0 + bus_width)])
        ty = y0 + bus_width + finger_length
        polys.append([(x0, ty), (x0 + total_width, ty), (x0 + total_width, y0 + total_height), (x0, y0 + total_height)])

        layers[render_layer] = [*layers.get(render_layer, []), *polys]

        if layer > 0:
            via_layer = _VIA_LAYERS[layer - 1]
            via_polys: list[Poly] = []
            bus_via_w = total_width - 2 * via_in_metal
            bus_via_h = bus_width - 2 * via_in_metal
            if bus_via_w > 0 and bus_via_h > 0:
                via_polys += via_grid(0, y0 + bus_width / 2, bus_via_w, bus_via_h, via_spacing, via_width)
                via_polys += via_grid(0, y0 + bus_width + finger_length + bus_width / 2, bus_via_w, bus_via_h, via_spacing, via_width)

            prev_offset = 0 if (layer - 1) % 2 == 0 else pitch / 2
            curr_offset = 0 if layer % 2 == 0 else pitch / 2
            prev_x0 = -layer_width / 2 + prev_offset
            curr_x0 = -layer_width / 2 + curr_offset
            for i in range(nf):
                prev_fx = prev_x0 + i * pitch
                prev_is_p = i % 2 == 0
                for j in range(nf):
                    curr_fx = curr_x0 + j * pitch
                    curr_is_p = j % 2 == 0
                    if prev_is_p != curr_is_p:
                        continue
                    overlap_l = max(prev_fx, curr_fx)
                    overlap_r = min(prev_fx + finger_width, curr_fx + finger_width)
                    overlap_w = overlap_r - overlap_l
                    if overlap_w < via_width + 2 * via_in_metal:
                        continue
                    fy_cx = (overlap_l + overlap_r) / 2
                    finger_top = y0 + bus_width + finger_length - finger_spacing
                    finger_bot = y0 + bus_width + finger_spacing
                    fy_cy = (finger_bot + finger_top) / 2
                    finger_via_h = (finger_top - finger_bot) - 2 * via_in_metal
                    finger_via_w = overlap_w - 2 * via_in_metal
                    if finger_via_h > 0 and finger_via_w > 0:
                        via_polys += via_grid(fy_cx, fy_cy, finger_via_w, finger_via_h, via_spacing, via_width)

            layers[via_layer] = [*layers.get(via_layer, []), *via_polys]

    ports = [
        Port("P+", x0, y0 + bus_width / 2, "windings"),
        Port("P-", x0 + total_width, y0 + bus_width + finger_length + bus_width / 2, "windings"),
    ]
    return GeometryResult(layers, ports)
