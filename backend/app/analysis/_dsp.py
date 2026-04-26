"""Shared DSP primitives used by tempo + onset modules.

Kept tiny on purpose — pure numpy/scipy so we never reach for numba.
"""
from __future__ import annotations

import numpy as np

# Frame parameters used across analysis modules. Centralised so onset
# detection and tempo estimation share the same time grid.
N_FFT = 2048
HOP = 512


def stft_magnitude(y: np.ndarray, sr: int) -> np.ndarray:
    """Magnitude STFT with a Hann window. Returns shape (freq, frames)."""
    from scipy.signal import stft  # type: ignore

    _f, _t, Z = stft(
        y,
        fs=sr,
        window="hann",
        nperseg=N_FFT,
        noverlap=N_FFT - HOP,
        padded=False,
        boundary=None,
    )
    return np.abs(Z)


def onset_envelope(y: np.ndarray, sr: int) -> np.ndarray:
    """Half-wave-rectified spectral flux — a robust onset strength signal."""
    mag = stft_magnitude(y, sr)
    if mag.shape[1] < 2:
        return np.zeros(0, dtype=np.float32)
    flux = np.diff(mag, axis=1)
    np.maximum(flux, 0, out=flux)
    env = flux.sum(axis=0).astype(np.float32)
    peak = float(env.max()) if env.size else 0.0
    if peak > 0:
        env /= peak
    return env


def frames_per_second(sr: int) -> float:
    return sr / HOP


def frames_to_seconds(frames: np.ndarray, sr: int) -> np.ndarray:
    return frames.astype(np.float64) * HOP / sr
