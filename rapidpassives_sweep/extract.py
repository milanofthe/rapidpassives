"""Derive engineering quantities (Z, L, Q) from S-parameters.

Formulas match the reference extraction in
rapidfem/.../examples/fd_rfic_spiral_from_json.py.
"""
from __future__ import annotations

import numpy as np


def s_to_z(sparams: np.ndarray, z0: float = 50.0) -> np.ndarray:
    """[n_freq, n_port, n_port] S -> Z (same shape). Z = √z0 (I+S)(I-S)^-1 √z0."""
    s = np.asarray(sparams)
    n = s.shape[-1]
    eye = np.eye(n)
    rz = np.sqrt(z0)
    z = np.empty_like(s, dtype=complex)
    for i in range(s.shape[0]):
        z[i] = rz * (eye + s[i]) @ np.linalg.inv(eye - s[i]) * rz
    return z


def series_inductance(sparams: np.ndarray, freqs_hz: np.ndarray, z0: float = 50.0) -> np.ndarray:
    """Two-port series L [H] per frequency: Im(Z11 - Z21) / omega."""
    z = s_to_z(sparams, z0)
    freqs = np.asarray(freqs_hz, dtype=float)
    omega = 2 * np.pi * freqs
    return (z[:, 0, 0].imag - z[:, 1, 0].imag) / omega


def quality_factor(sparams: np.ndarray, z0: float = 50.0) -> np.ndarray:
    """Single-ended Q from input impedance: Im(Z11) / Re(Z11)."""
    z = s_to_z(sparams, z0)
    return z[:, 0, 0].imag / z[:, 0, 0].real
