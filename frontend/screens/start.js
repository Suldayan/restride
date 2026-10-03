import { requestMotionPermission, startListening } from '../core/sensors.js';
import { createCalibrator } from '../core/calibration.js';

let stopListening = null;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0 };
const calibrator = createCalibrator();

export function initStart() {
  const controls = document.getElementById('start-controls');

  controls.innerHTML = `
    <div class="dim" id="start-status">Tap Enable to request motion access.</div>
    <button class="primary" id="enable-btn">Enable Motion</button>
    <button id="calibrate-btn" disabled>Calibrate Zero</button>
    <div class="dim" id="hz-readout" style="text-align:right;margin-top:8px;">-- Hz</div>

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
  const hzEl = document.getElementById('hz-readout');

  let sampleTimes = [];

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

        const relative = calibrator.isCalibrated
          ? calibrator.getRelative(orientation)
          : { pitch: 0, roll: 0, yaw: 0 };

        document.getElementById('val-pitch').textContent = relative.pitch.toFixed(1) + '°';
        document.getElementById('val-roll').textContent = relative.roll.toFixed(1) + '°';
        document.getElementById('val-yaw').textContent = relative.yaw.toFixed(1) + '°';

        const now = performance.now();
        sampleTimes.push(now);
        if (sampleTimes.length > 30) sampleTimes.shift();
        if (sampleTimes.length > 1) {
          const span = (sampleTimes.at(-1) - sampleTimes[0]) / 1000;
          hzEl.textContent = ((sampleTimes.length - 1) / span).toFixed(0) + ' Hz';
        }
      },
      (motion) => {
        document.getElementById('val-ax').textContent = motion.accel.x.toFixed(1);
        document.getElementById('val-ay').textContent = motion.accel.y.toFixed(1);
        document.getElementById('val-az').textContent = motion.accel.z.toFixed(1);
      }
    );

    statusEl.textContent = 'Live. Hold running position, then tap Calibrate Zero.';
    enableBtn.textContent = 'Enabled';
    calibrateBtn.disabled = false;
  });

  calibrateBtn.addEventListener('click', () => {
    calibrator.calibrate(latestOrientation);
    statusEl.textContent = 'Calibrated. Values above are now relative to this pose.';
  });
}