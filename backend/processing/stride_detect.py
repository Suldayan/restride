"""Detect footstrike peaks in the acceleration
magnitude signal, and estimate stride count and cadence from them."""

import numpy as np
from scipy.signal import find_peaks


def detect_strides(t: np.ndarray, accel_mag: np.ndarray) -> dict:
    if len(t) < 10:
        return {"strideCount": 0, "cadenceStepsPerMin": 0.0, "peakIndices": []}

    duration_sec = (t[-1] - t[0]) / 1000
    sample_rate_hz = len(t) / duration_sec if duration_sec > 0 else 0

    min_distance_samples = max(1, int(0.2 * sample_rate_hz))
    height_threshold = np.mean(accel_mag) + np.std(accel_mag)

    peaks, _ = find_peaks(accel_mag, distance=min_distance_samples, height=height_threshold)

    stride_count = len(peaks)
    cadence = (stride_count / duration_sec * 60) if duration_sec > 0 else 0.0

    return {
        "strideCount": stride_count,
        "cadenceStepsPerMin": round(cadence, 1),
        "peakIndices": peaks.tolist()
    }