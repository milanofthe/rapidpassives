"""GDS export — write generator geometry to a GDSII file via gdstk.

Layer numbers and datatypes are derived from the process stack (each StackLayer
id is ``{gds}_{datatype}``), so the GDS layers match the active PDK rather than
hard-coded integers.
"""
from __future__ import annotations

import gdstk

from .geometry.result import GeometryResult
from .stack import ProcessStack


def to_gds(result: GeometryResult, stack: ProcessStack, path: str, *,
           cell_name: str = "layout", unit: float = 1e-6, precision: float = 1e-9,
           add_port_labels: bool = True) -> None:
    """Write ``result`` to a GDSII file.

    Polygons are treated as filled outlines (holes are not subtracted — matches
    the renderer's behaviour). Coordinates are in micrometres when ``unit=1e-6``.
    """
    layer_to_stack = {gl: sl for sl in stack.layers for gl in sl.gds_layers}

    lib = gdstk.Library(unit=unit, precision=precision)
    cell = lib.new_cell(cell_name)

    for layer_name, polys in result.layers.items():
        sl = layer_to_stack.get(layer_name)
        if sl is None:
            continue
        gds, datatype = (int(x) for x in sl.id.split("_"))
        for p in polys:
            if len(p) < 3:
                continue
            cell.add(gdstk.Polygon([(x, y) for x, y in p], layer=gds, datatype=datatype))

    if add_port_labels:
        for port in result.ports:
            sl = layer_to_stack.get(port.layer)
            gds = int(sl.id.split("_")[0]) if sl else 0
            cell.add(gdstk.Label(port.name, (port.x, port.y), layer=gds))

    lib.write_gds(path)
