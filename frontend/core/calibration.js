// Capture a baseline orientation, then convert any
// later orientation reading into degrees relative to that baseline.

/** Wraps a degree value into the range [-180, 180]. */
export function wrap180(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Returns a calibrator object with its own private baseline —
 * create one per trial so trials never share calibration state.
 */
export function createCalibrator() {
  let baseline = { alpha: 0, beta: 0, gamma: 0 };
  let isCalibrated = false;

  return {
    /** Set latest orientation reading to zero. */
    calibrate(orientation) {
      baseline = { ...orientation };
      isCalibrated = true;
    },

    get isCalibrated() {
      return isCalibrated;
    },

    /** Converts a raw orientation reading into {pitch, roll, yaw} relative to baseline. */
    getRelative(orientation) {
      return {
        pitch: wrap180(orientation.beta - baseline.beta),
        roll: wrap180(orientation.gamma - baseline.gamma),
        yaw: wrap180(orientation.alpha - baseline.alpha)
      };
    }
  };
}