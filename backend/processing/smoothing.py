import numpy as np
from scipy.signal import savgol_filter


def smooth(values: np.ndarray, window: int = 7, polyorder: int = 2) -> np.ndarray:
    actual_window = min(window, len(values))
    if actual_window % 2 == 0:
        actual_window -= 1
    if actual_window <= polyorder:
        return values
    return savgol_filter(values, window_length=actual_window, polyorder=polyorder)