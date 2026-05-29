"""Drive a single FEM frequency sweep through rapidfem.

Thin wrapper over the verified rapidfem.rfic.from_fem_json -> Problem.sweep path
(see rapidfem/.../examples/fd_rfic_spiral_from_json.py).
"""
from __future__ import annotations

from typing import Sequence


def run_one(fem_json: dict, freqs: Sequence[float], *, z0: float = 50.0,
            via_mode: str = "merged", **mesh_opts):
    """Build the 3-D geometry, wire BCs, mesh, and sweep. Returns a rapidfem
    SweepResult (``.frequencies``, ``.sparams`` shape [n_freq, n_port, n_port]).

    rapidfem is imported lazily so the rest of the package (geometry, FEM JSON,
    parity tests) works without the compiled solver installed.
    """
    import rapidfem as rf
    import rapidfem.rfic as rfic

    layout = rfic.from_fem_json(fem_json, via_mode=via_mode, **mesh_opts)

    all_volumes = [v for vols in layout.conductors.values() for v in vols]
    rf.PEC(*(v.faces for v in all_volumes), *layout.ground_patches)
    for port in layout.ports.values():
        rf.LumpedPort(port, direction=(0, 0, 1), z0=z0)
    rf.ABC(*layout.air.faces.outer, order=1)

    layout.geometry.mesh()
    prob = rf.Problem(layout.geometry)
    return prob.sweep(list(freqs), z0=z0)
