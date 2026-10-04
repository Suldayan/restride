// Single responsibility: decide WHEN a run has slowed down enough to be over.
// Just calls onStop() when it decides,
// same as a manual button press would.

export function createAutoStopDetector(onStop, options = {}) {
  const graceMs = options.graceMs ?? 2000; // ignore everything right after arming
  const quietMs = options.quietMs ?? 1500; // how long "slow" must persist to count
  const motionThreshold = options.motionThreshold ?? 2; // m/s² of net motion still counted as "running"
  const onStateChange = options.onStateChange ?? (() => {});

  let armed = false;
  let armTime = 0;
  let lastActiveTime = 0;
  let movementDetected = false;
  let currentState = 'disarmed';

  function setState(state) {
    if (state === currentState) return;
    currentState = state;
    onStateChange(state);
  }

  return {
    /** Call this the instant recording starts. Resets all internal timers. */
    arm() {
      armed = true;
      movementDetected = false;
      armTime = performance.now();
      lastActiveTime = armTime;
      setState('grace');
    },

    disarm() {
      armed = false;
      movementDetected = false;
      setState('disarmed');
    },

    /** Feed raw accel readings (incl. gravity) as they arrive while armed. */
    addSample(accel) {
      if (!armed) return;

      const now = performance.now();
      if (now - armTime < graceMs) return;

      // Net motion = how far this reading is from gravity-at-rest (~9.8 m/s²)
      const magnitude = Math.sqrt(accel.x ** 2 + accel.y ** 2 + accel.z ** 2);
      const netMotion = Math.abs(magnitude - 9.8);

      if (netMotion > motionThreshold) {
        movementDetected = true;
        lastActiveTime = now; // still moving — reset the quiet clock
        setState('monitoring');
        return;
      }

      if (!movementDetected) {
        setState('waiting-for-movement');
        return;
      }

      if (now - lastActiveTime > quietMs) {
        armed = false; // fire once, then go quiet until re-armed
        setState('stopped');
        onStop();
      }
    }
  };
}