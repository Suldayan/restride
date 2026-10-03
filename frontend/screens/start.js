import { requestMotionPermission, startListening } from '../core/sensors.js';
import { createCalibrator } from '../core/calibration.js';
import { createRecorder } from '../core/recorder.js';
import { createAutoStopDetector } from '../core/autoStop.js';
import { renderTrial } from './trial.js';
import { showScreen } from '../app.js';

let stopListening = null;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0 };
const calibrator = createCalibrator();
const recorder = createRecorder();

// Exported so trial.js can read the most recent recording later.
export let lastTrialSamples = [];

export function initStart() {
  const controls = document.getElementById('start-controls');

  controls.innerHTML = `
    <div class="dim" id="start-status">Tap Enable to request motion access.</div>
    <button class="primary" id="enable-btn">Enable Motion</button>
    <button id="calibrate-btn" disabled>Calibrate Zero</button>
    <button id="record-btn" disabled>Start Recording</button>
    <button id="view-chart-btn" disabled>View Chart</button>
    <div class="dim" id="hz-readout" style="text-align:right;margin-top:8px;">-- Hz</div>
    <div class="dim" id="recording-readout" style="text-align:right;">not recording</div>

    <div class="trial-card">
      <strong>Orientation (&deg; from calibration)</strong>
      <div>Pitch: <span id="val-pitch">--</span></div>
      <div>Roll: <span id="val-roll">--</span></div>
      <div>Yaw: <span id="val-yaw">--</span></div>
    </div>

    <div class="trial-card">
      <strong>Acceleration (m/s&sup2;, incl. gravity)</strong>
      <div>X: <span id="val-ax">--</span></div>
      <div>Y: <span id="val-ay">--</span></div>
      <div>Z: <span id="val-az">--</span></div>
    </div>
  `;

  const statusEl = document.getElementById('start-status');
  const enableBtn = document.getElementById('enable-btn');
  const calibrateBtn = document.getElementById('calibrate-btn');
  const recordBtn = document.getElementById('record-btn');
  const viewChartBtn = document.getElementById('view-chart-btn');
  const hzEl = document.getElementById('hz-readout');

  viewChartBtn.addEventListener('click', () => {
    document.getElementById('trial-title').textContent = 'Latest Recording';
    renderTrial();
    showScreen('trial');
  });

  // Both the manual Stop button and the auto-detector call this one function
  function finishRecording(reason) {
    lastTrialSamples = recorder.stop();
    recordBtn.textContent = 'Start Recording';
    recordingEl.textContent = `${lastTrialSamples.length} samples captured (${reason})`;
    viewChartBtn.disabled = false;
  }

  const autoStop = createAutoStopDetector(() => finishRecording('auto-stopped'));
  const recordingEl = document.getElementById('recording-readout');

  let sampleTimes = [];
  let latestRelative = { pitch: 0, roll: 0, yaw: 0 };
  let latestAccel = { x: 0, y: 0, z: 0 };

  enableBtn.addEventListener('click', async () => {
    enableBtn.disabled = true;

    const granted = await requestMotionPermission();
    if (!granted) {
      statusEl.textContent = 'Permission denied. Check your browser\'s site settings.';
      enableBtn.disabled = false;
      return;
    }

    if (stopListening) stopListening();

    stopListening = startListening(
      (orientation) => {
        latestOrientation = orientation;
        latestRelative = calibrator.isCalibrated
          ? calibrator.getRelative(orientation)
          : { pitch: 0, roll: 0, yaw: 0 };

        document.getElementById('val-pitch').textContent = latestRelative.pitch.toFixed(1) + '°';
        document.getElementById('val-roll').textContent = latestRelative.roll.toFixed(1) + '°';
        document.getElementById('val-yaw').textContent = latestRelative.yaw.toFixed(1) + '°';

        const now = performance.now();
        sampleTimes.push(now);
        if (sampleTimes.length > 30) sampleTimes.shift();
        if (sampleTimes.length > 1) {
          const span = (sampleTimes.at(-1) - sampleTimes[0]) / 1000;
          hzEl.textContent = ((sampleTimes.length - 1) / span).toFixed(0) + ' Hz';
        }

        // Recorder decides for itself whether this counts — safe to call always
        recorder.addSample({ pitch: latestRelative.pitch, roll: latestRelative.roll, yaw: latestRelative.yaw, accel: latestAccel });
      },
      (motion) => {
        latestAccel = motion.accel;
        document.getElementById('val-ax').textContent = motion.accel.x.toFixed(1);
        document.getElementById('val-ay').textContent = motion.accel.y.toFixed(1);
        document.getElementById('val-az').textContent = motion.accel.z.toFixed(1);

        if (recorder.isRecording) {
          autoStop.addSample(motion.accel);
        }
      }
    );

    statusEl.textContent = 'Live. Hold running position, then tap Calibrate Zero.';
    enableBtn.textContent = 'Enabled';
    calibrateBtn.disabled = false;
  });

  calibrateBtn.addEventListener('click', () => {
    calibrator.calibrate(latestOrientation);
    statusEl.textContent = 'Calibrated. Tap Start Recording when ready to run.';
    recordBtn.disabled = false;
  });

  recordBtn.addEventListener('click', () => {
    if (!recorder.isRecording) {
      recorder.start();
      autoStop.arm();
      recordBtn.textContent = 'Stop Recording';
      recordingEl.textContent = 'recording... (auto-stop armed after 2s)';
    } else {
      finishRecording('manual');
    }
  });
}