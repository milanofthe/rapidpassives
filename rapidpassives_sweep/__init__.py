"""rapidpassives_sweep — generate passive-device geometry in Python and run
automated FEM parameter sweeps through rapidfem.

A parallel, polygon-based geometry path to the canonical TypeScript web app.
Both produce the same FEM JSON schema (schema_version 1); parity is guarded by
tests comparing the two exports for identical parameters.
"""
from __future__ import annotations

from .fem_export import build_fem_json, validate_fem_json
from .geometry import (
    GeometryResult, Port, add_pgs,
    build_spiral_inductor, build_symmetric_inductor, build_symmetric_transformer,
    build_stacked_transformer, build_mom_capacitor, build_patch_antenna, build_ratrace_coupler,
)
from .stack import ProcessStack, sky130_stack
from .sweep import sweep

__all__ = [
    "build_spiral_inductor",
    "build_symmetric_inductor",
    "build_symmetric_transformer",
    "build_stacked_transformer",
    "build_mom_capacitor",
    "build_patch_antenna",
    "build_ratrace_coupler",
    "add_pgs",
    "build_fem_json",
    "validate_fem_json",
    "sky130_stack",
    "ProcessStack",
    "GeometryResult",
    "Port",
    "sweep",
]

# run_one is optional (needs the compiled rapidfem solver); import lazily.
try:  # pragma: no cover
    from .runner import run_one  # noqa: F401
    __all__.append("run_one")
except Exception:  # pragma: no cover
    pass
