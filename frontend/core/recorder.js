// Collect timestamped samples between start() and stop().
// A manual button for now, but will be replaced later with
// a future auto-stop (stride detection) both just call recorder.stop().

export function createRecorder() {
  let samples = [];
  let recording = false;
  let startTime = 0;

  return {
    get isRecording() {
      return recording;
    },

    start() {
      samples = [];
      startTime = performance.now();
      recording = true;
    },

    /** Call this from the live sensor callbacks — it's a no-op when not recording. */
    addSample(sample) {
      if (!recording) return;
      samples.push({ t: performance.now() - startTime, ...sample });
    },

    /** Stops recording and returns the collected samples. */
    stop() {
      recording = false;
      return samples;
    }
  };
}