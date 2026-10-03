// orientation/motion events. No calibration or stride logic belongs here.

/**
 * Requests device motion/orientation permission where the browser requires it
 * (iOS Safari 13+). On browsers that don't require an explicit prompt
 * (most Android browsers), this resolves true immediately.
 * Must be called from inside a user gesture handler (e.g. a button click).
 */
export async function requestMotionPermission() {
  let granted = true;

  if (typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    const result = await DeviceMotionEvent.requestPermission();
    granted = granted && result === 'granted';
  }

  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const result = await DeviceOrientationEvent.requestPermission();
    granted = granted && result === 'granted';
  }

  return granted;
}

/**
 * Starts listening to both sensor events and forwards raw readings to the
 * given callbacks. Returns a stop() function to remove the listeners —
 * always call it when a run ends so listeners don't pile up across trials.
 *
 * onOrientation receives: { alpha, beta, gamma }
 * onMotion receives: { accel: {x,y,z}, rotationRate: {alpha, beta, gamma} }
 */
export function startListening(onOrientation, onMotion) {
  function handleOrientation(e) {
    onOrientation({
      alpha: e.alpha ?? 0,
      beta: e.beta ?? 0,
      gamma: e.gamma ?? 0
    });
  }

  function handleMotion(e) {
    const acc = e.accelerationIncludingGravity || {};
    const rot = e.rotationRate || {};
    onMotion({
      accel: { x: acc.x ?? 0, y: acc.y ?? 0, z: acc.z ?? 0 },
      rotationRate: { alpha: rot.alpha ?? 0, beta: rot.beta ?? 0, gamma: rot.gamma ?? 0 }
    });
  }

  window.addEventListener('deviceorientation', handleOrientation);
  window.addEventListener('devicemotion', handleMotion);

  return function stop() {
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('devicemotion', handleMotion);
  };
}