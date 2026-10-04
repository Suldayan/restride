function angleDifference(a, b) {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

function accelerationMagnitude(accel) {
  return Math.hypot(accel.x, accel.y, accel.z);
}

export function createDeviationTracker(referenceSamples, options = {}) {
  const thresholdDeg = options.thresholdDeg ?? 15;
  const thresholdAccelMps2 = options.thresholdAccelMps2 ?? 3;
  const sustainedMs = options.sustainedMs ?? 1500;
  const cooldownMs = options.cooldownMs ?? 5000;
  const onStateChange = options.onStateChange ?? (() => {});
  let outsideSince = null;
  let lastAlertAt = -Infinity;
  let state = 'within-range';

  function setState(nextState) {
    if (nextState === state) return;
    state = nextState;
    onStateChange(nextState);
  }

  function nearestReferenceSample(elapsedMs) {
    let low = 0;
    let high = referenceSamples.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const next = middle + 1;
      if (Math.abs(referenceSamples[next].t - elapsedMs) <=
          Math.abs(referenceSamples[middle].t - elapsedMs)) {
        low = next;
      } else {
        high = middle;
      }
    }
    return referenceSamples[low];
  }

  return {
    check(elapsedMs, live, accel = referenceSamples[0]?.accel, now = performance.now()) {
      if (referenceSamples.length === 0) {
        setState('unavailable');
        return { deviationScore: 0, isDeviating: false, alertTriggered: false };
      }

      const reference = nearestReferenceSample(elapsedMs);
      const orientationDeviation =
        angleDifference(live.pitch, reference.pitch) +
        angleDifference(live.roll, reference.roll) +
        angleDifference(live.yaw, reference.yaw);
      const accelerationDeviation = Math.abs(
        accelerationMagnitude(accel) - accelerationMagnitude(reference.accel)
      );
      const isDeviating =
        orientationDeviation > thresholdDeg ||
        accelerationDeviation > thresholdAccelMps2;

      if (!isDeviating) {
        outsideSince = null;
        setState('within-range');
        return {
          isDeviating: false,
          deviationScore: 0,
          orientationDeviation,
          accelerationDeviation,
          alertTriggered: false
        };
      }

      if (outsideSince === null) {
        outsideSince = now;
        setState('pending');
      }

      const alertTriggered =
        now - outsideSince >= sustainedMs &&
        now - lastAlertAt >= cooldownMs;
      if (alertTriggered) {
        lastAlertAt = now;
        setState('alert');
      }

      return {
        isDeviating: true,
        deviationScore: orientationDeviation,
        orientationDeviation,
        accelerationDeviation,
        alertTriggered
      };
    }
  };
}
