"""Demo: sweep a spiral inductor over (N, Dout) and extract L/Q.

Run:  python -m rapidpassives_sweep.examples.sweep_spiral
Requires the compiled `rapidfem` solver (pip install -e .[solver]).
"""
from __future__ import annotations

import numpy as np

import rapidpassives_sweep as rps
from rapidpassives_sweep.dataset import save_netcdf, to_touchstone

BASE = {"sides": 8, "width": 8, "spacing": 4, "via_spacing": 1.0, "via_width": 1.0, "via_in_metal": 0.4}
GRID = {"N": [2, 3], "Dout": [80, 120]}
FREQS = np.linspace(1e9, 30e9, 8)


def main() -> None:
    stack = rps.sky130_stack("2metal")
    ds = rps.sweep(rps.build_spiral_inductor, GRID, FREQS, stack,
                   base_params=BASE, generator_name="spiral",
                   conductor_maxh_um=4.0, port_maxh_um=4.0, air_height_um=40.0)
    print(ds)
    # Low-frequency inductance per geometry point:
    print("\nL @ 1 GHz [nH]:")
    print((ds["L_henry"].isel(freq=0) * 1e9).round(3).to_pandas())
    save_netcdf(ds, "spiral_sweep.nc")
    to_touchstone(ds, "spiral_N3_D120.s2p", sel={"N": 3, "Dout": 120})
    print("\nwrote spiral_sweep.nc and spiral_N3_D120.s2p")


if __name__ == "__main__":
    main()
