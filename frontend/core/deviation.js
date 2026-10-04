// Given a reference trial's samples, score how far a
// live reading has drifted from it. Aligns by elapsed time for now — a
// simpler stand-in for stride-based alignment, swappable later without
// changing how callers use this module.

export function createDeviationTracker(referenceSamples, options = {}) {
  const thresholdDeg = options.thresholdDeg ?? 15; // combined pitch+roll+yaw delta considered "drifting"
  let refIndex = 0; // reference is time-ordered, only moving forward

  function nearestReferenceSample(elapsedMs) {
    while (
      refIndex < referenceSamples.length - 1 &&
      Math.abs(referenceSamples[refIndex + 1].t - elapsedMs) <= Math.abs(referenceSamples[refIndex].t - elapsedMs)
    ) {
      refIndex++;
    }
    return referenceSamples[refIndex];
  }

  return {
    /** Call with the live elapsed time (ms) and current {pitch, roll, yaw}. */
    check(elapsedMs, live) {
      if (referenceSamples.length === 0) {
        return { deviationScore: 0, isDeviating: false };
      }

      const ref = nearestReferenceSample(elapsedMs);
      const deviationScore =
        Math.abs(live.pitch - ref.pitch) +
        Math.abs(live.roll - ref.roll) +
        Math.abs(live.yaw - ref.yaw);

      return { deviationScore, isDeviating: deviationScore > thresholdDeg };
    }
  };
}