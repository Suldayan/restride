import { requestMotionPermission, startListening } from '../core/sensors.js';

let stopListening = null; // holds the cleanup function once sensors are live

export function initStart() {
  const controls = document.getElementById('start-controls');

  controls.innerHTML = `
    <div class="dim" id="start-status">Tap Enable to request motion access.</div>
    <button class="primary" id="enable-btn">Enable Motion</button>
    <div class="dim" id="hz-readout" style="text-align:right;margin-top:8px;">-- Hz</div>

    <div class="trial-card">
      <strong>Orientation (°)</strong>
      <div>Pitch (β): <span id="val-beta">--</span></div>
      <div>Roll (γ): <span id="val-gamma">--</span></div>
      <div>Yaw (α): <span id="val-alpha">--</span></div>
    </div>

    <div class="trial-card">
      <strong>Acceleration (m/s², incl. gravity)</strong>
      <div>X: <span id="val-ax">--</span></div>
      <div>Y: <span id="val-ay">--</span></div>
      <div>Z: <span id="val-az">--</span></div>
    </div>
  `;

  const statusEl = document.getElementById('start-status');
  const enableBtn = document.getElementById('enable-btn');
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

    // Guard against double-attaching listeners if this ever runs twice
    if (stopListening) stopListening();

    stopListening = startListening(
      (orientation) => {
        document.getElementById('val-beta').textContent = orientation.beta.toFixed(1);
        document.getElementById('val-gamma').textContent = orientation.gamma.toFixed(1);
        document.getElementById('val-alpha').textContent = orientation.alpha.toFixed(1);

        // Sample-rate readout — this is your "terminal" on a phone with no console
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

    statusEl.textContent = 'Live. Values below should update as you move the phone.';
    enableBtn.textContent = 'Enabled';
  });
}