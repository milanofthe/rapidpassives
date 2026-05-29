"""Generator output types — the Python mirror of the TS Port / GeometryResult."""
from __future__ import annotations

from dataclasses import dataclass, field

from .primitives import Poly


@dataclass
class Port:
    name: str
    x: float
    y: float
    layer: str            # always a LayerName (the metal the port sits on)
    role: str = "signal"  # 'signal' | 'ground' | 'centertap'


@dataclass
class GeometryResult:
    layers: dict[str, list[Poly]]
    ports: list[Port]
