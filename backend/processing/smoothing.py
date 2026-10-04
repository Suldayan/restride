import numpy as np
from scipy.signal import savgol_filter


def smooth(values: list[float]) -> list[float]:
    values = np.array(values)

    if len(values) < 7:
        return values.tolist()

    return savgol_filter(
        values,
        window_length=7,
        polyorder=2
    ).tolist()