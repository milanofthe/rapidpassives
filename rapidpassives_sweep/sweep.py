"""Parameter-sweep orchestration: generate geometry, export FEM JSON, solve,
and aggregate S-parameters (+ derived L/Q) into an xarray.Dataset.
"""
from __future__ import annotations

import itertools
from typing import Callable, Sequence

import numpy as np
import xarray as xr

from .extract import quality_factor, series_inductance
from .fem_export import build_fem_json
from .geometry.result import GeometryResult
from .runner import run_one
from .stack import ProcessStack


def sweep(generator: Callable[[dict], GeometryResult],
          param_grid: dict[str, Sequence],
          freqs_hz: Sequence[float],
          stack: ProcessStack, *,
          base_params: dict | None = None,
          generator_name: str = "geometry",
          z0: float = 50.0,
          **mesh_opts) -> xr.Dataset:
    """Run ``generator`` over the Cartesian product of ``param_grid`` and solve
    each layout across ``freqs_hz``. Returns an xarray.Dataset with S-parameters
    on dims (*param_axes, freq, port_i, port_j) plus derived L and Q.
    """
    base = dict(base_params or {})
    axes = list(param_grid.keys())
    axis_values = [list(param_grid[a]) for a in axes]
    shapes = [len(v) for v in axis_values]
    freqs = np.asarray(freqs_hz, dtype=float)

    s_grid = None
    n_port = None
    for idx in itertools.product(*[range(n) for n in shapes]):
        combo = {a: axis_values[k][i] for k, (a, i) in enumerate(zip(axes, idx))}
        params = {**base, **combo}
        result = generator(params)
        fem = build_fem_json(result, stack, generator=generator_name, params=params)
        res = run_one(fem, freqs, z0=z0, **mesh_opts)
        sp = np.asarray(res.sparams)  # [n_freq, n_port, n_port]
        if s_grid is None:
            n_port = sp.shape[-1]
            s_grid = np.empty((*shapes, len(freqs), n_port, n_port), dtype=complex)
        elif sp.shape[-1] != n_port:
            raise ValueError(f"port count changed across sweep ({n_port} -> {sp.shape[-1]}) "
                             f"at {combo}; cannot build a regular grid")
        s_grid[idx] = sp

    coords = {a: axis_values[k] for k, a in enumerate(axes)}
    coords["freq"] = freqs
    coords["port_i"] = np.arange(n_port)
    coords["port_j"] = np.arange(n_port)
    dims = (*axes, "freq", "port_i", "port_j")

    ds = xr.Dataset({"S": (dims, s_grid)}, coords=coords)

    # Derived L/Q for the 2-port case (per param combo).
    if n_port == 2:
        L = np.empty((*shapes, len(freqs)))
        Q = np.empty((*shapes, len(freqs)))
        for idx in itertools.product(*[range(n) for n in shapes]):
            L[idx] = series_inductance(s_grid[idx], freqs, z0)
            Q[idx] = quality_factor(s_grid[idx], z0)
        ds["L_henry"] = ((*axes, "freq"), L)
        ds["Q"] = ((*axes, "freq"), Q)

    ds.attrs["generator"] = generator_name
    ds.attrs["z0_ohm"] = z0
    return ds
