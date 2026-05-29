"""Persistence helpers for sweep results."""
from __future__ import annotations

import numpy as np
import xarray as xr


def save_netcdf(ds: xr.Dataset, path: str) -> None:
    """Save the sweep dataset to netCDF. Complex S is split into real/imag since
    netCDF has no native complex type."""
    out = ds.copy()
    if "S" in out and np.iscomplexobj(out["S"].values):
        out["S_re"] = out["S"].real
        out["S_im"] = out["S"].imag
        out = out.drop_vars("S")
    out.to_netcdf(path)


def to_touchstone(ds: xr.Dataset, path: str, sel: dict | None = None, z0: float = 50.0) -> None:
    """Write one parameter point as a Touchstone file via scikit-rf.

    ``sel`` selects a single point along every parameter axis (e.g. {"N": 3}).
    """
    import skrf as rf

    point = ds.sel(**sel) if sel else ds
    S = np.asarray(point["S"].values)
    if S.ndim != 3:
        raise ValueError("to_touchstone needs a single parameter point; pass `sel` to reduce extra dims")
    freqs = np.asarray(ds["freq"].values)
    net = rf.Network(frequency=rf.Frequency.from_f(freqs, unit="hz"), s=S, z0=z0)
    net.write_touchstone(path)
