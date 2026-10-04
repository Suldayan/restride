import { requestMotionPermission, startListening } from '../core/sensors.js';
import { createCalibrator } from '../core/calibration.js';
import { createRecorder } from '../core/recorder.js';
import { createAutoStopDetector } from '../core/autoStop.js';
import { addTrial, createTrial, getTrials, setTrialReference } from '../core/trials.js';
import { renderTrial } from './trial.js';
import { showScreen } from '../app.js';

const calibrator = createCalibrator();
const recorder = createRecorder();

let stopListening = null;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0 };
let latestRelative = { pitch: 0, roll: 0, yaw: 0 };
let latestAccel = { x: 0, y: 0, z: 0 };
let recordingStartedAt = 0;
let isEnabled = false;
let countdownSeconds = 5;
let countdownTimer = null;
let elapsedTimer = null;
let recordingCreatedAt = null;
let draftSamples = null;
let draftSavedTrialId = null;

function formatElapsed(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function initStart() {
  const controls = document.getElementById('start-controls');
  controls.innerHTML = `
    <section class="start-card">
      <div class="setup-status"><span class="status-dot"></span><span id="start-status">Enable motion, calibrate, then start when ready.</span></div>
      <div class="start-steps">
        <div class="start-step"><span>01</span><div><strong>Secure your phone</strong><small>Keep it in the same position for the whole trial.</small></div></div>
        <div class="start-step"><span>02</span><div><strong>Get into position</strong><small>Calibrate your phone before each new run.</small></div></div>
      </div>
      <div class="start-actions">
        <button class="secondary-button" id="enable-btn" type="button"><span>Enable Motion</span><b>01</b></button>
        <button class="secondary-button" id="calibrate-btn" type="button" disabled><span>Calibrate Zero</span><b>02</b></button>
      </div>
      <div class="delay-setting">
        <div><strong>Start Delay</strong><small>Countdown before the run timer starts</small></div>
        <div class="delay-adjust">
          <button type="button" id="delay-minus" aria-label="Decrease start delay">−</button>
          <strong id="delay-value">${countdownSeconds}</strong><span>sec</span>
          <button type="button" id="delay-plus" aria-label="Increase start delay">+</button>
        </div>
      </div>
      <button class="primary-button start-run-button" id="start-run-btn" type="button" disabled><span>Start Trial</span><span>→</span></button>
      <p class="start-hint">Auto-stop waits 2 seconds after recording begins, then ends the trial after 1.5 seconds without movement.</p>
    </section>
    <section id="run-state" class="run-state" aria-live="polite"></section>
  `;

  const status = document.getElementById('start-status');
  const enableButton = document.getElementById('enable-btn');
  const calibrateButton = document.getElementById('calibrate-btn');
  const startButton = document.getElementById('start-run-btn');
  const runState = document.getElementById('run-state');

  function updateDelay(value) {
    countdownSeconds = Math.max(1, Math.min(15, value));
    document.getElementById('delay-value').textContent = countdownSeconds;
  }

  document.getElementById('delay-minus').addEventListener('click', () => updateDelay(countdownSeconds - 1));
  document.getElementById('delay-plus').addEventListener('click', () => updateDelay(countdownSeconds + 1));

  function finishRecording(reason) {
    if (!recorder.isRecording) return;
    draftSamples = recorder.stop();
    autoStop.disarm();
    window.clearInterval(elapsedTimer);
    runState.innerHTML = `
      <div class="run-state-heading"><p class="eyebrow">ATTEMPT COMPLETE · ${reason === 'auto-stopped' ? 'AUTO-STOPPED' : 'STOPPED'}</p><h2>Preview Your Run</h2><p>Review your results, delete this attempt, or save it with a name.</p></div>
      <div class="summary-card compact-summary">
        <p class="eyebrow">RUN SUMMARY</p>
        <div class="summary-row"><span>Duration</span><strong>${(draftSamples.at(-1)?.t / 1000 || 0).toFixed(2)} sec</strong></div>
        <div class="summary-row"><span>Date &amp; Time</span><strong>${new Date(recordingCreatedAt).toLocaleString()}</strong></div>
        <div class="summary-row"><span>Movement samples collected</span><strong>${draftSamples.length}</strong></div>
      </div>
      <label class="trial-name-field" for="trial-label">Name This Run<input id="trial-label" type="text" maxlength="80" placeholder="e.g. Saturday Track Session"></label>
      <label class="reference-option"><input id="reference-trial" type="checkbox"> Mark as a reference trial</label>
      <div class="run-buttons"><button class="secondary-button" type="button" id="preview-run-btn">Preview Results <span>↗</span></button><button class="delete-button" type="button" id="delete-run-btn">Delete This Run</button></div>
      <button class="primary-button save-run-button" type="button" id="save-run-btn"><span>Save to Previous Trials</span><span>↓</span></button>
      <p class="save-error" id="save-error" role="alert"></p>
    `;
    document.getElementById('preview-run-btn').addEventListener('click', () => {
      const previewTrial = createTrial({
        label: document.getElementById('trial-label').value.trim() || 'Run Preview',
        isReference: document.getElementById('reference-trial').checked,
        createdAt: recordingCreatedAt,
        samples: draftSamples
      });
      renderTrial(previewTrial, { isDraft: true });
      showScreen('trial');
    });
    document.getElementById('delete-run-btn').addEventListener('click', resetForNextRun);
    document.getElementById('save-run-btn').addEventListener('click', async () => {
      const nameInput = document.getElementById('trial-label');
      const label = nameInput.value.trim();
      if (!label) {
        nameInput.setCustomValidity('Enter a name for this run.');
        nameInput.reportValidity();
        nameInput.addEventListener('input', () => nameInput.setCustomValidity(''), { once: true });
        nameInput.focus();
        return;
      }

      const saveButton = document.getElementById('save-run-btn');
      const saveError = document.getElementById('save-error');
      saveButton.disabled = true;
      saveError.textContent = '';
      try {
        let savedTrial = draftSavedTrialId
          ? getTrials().find(trial => trial.id === draftSavedTrialId)
          : null;
        if (!savedTrial) {
          savedTrial = await addTrial(createTrial({
            label,
            isReference: false,
            createdAt: recordingCreatedAt,
            samples: draftSamples
          }));
          draftSavedTrialId = savedTrial.id;
          document.dispatchEvent(new CustomEvent('restride:trial-saved', { detail: savedTrial }));
        }
        if (document.getElementById('reference-trial').checked) {
          await setTrialReference(savedTrial.id);
          savedTrial = getTrials().find(trial => trial.id === savedTrial.id);
        }
        document.dispatchEvent(new CustomEvent('restride:trial-saved', { detail: savedTrial }));
        renderTrial(savedTrial);
        draftSamples = null;
        draftSavedTrialId = null;
        showScreen('trial');
        runState.innerHTML = `
          <div class="saved-confirmation">
            <span aria-hidden="true">✓</span>
            <div><small>TRIAL SAVED</small><strong></strong><p>Saved to Previous Trials and ready to review.</p></div>
            <button type="button" class="secondary-button" id="another-trial-btn">Record Another Trial</button>
          </div>
        `;
        runState.querySelector('.saved-confirmation strong').textContent = savedTrial.label;
        document.getElementById('another-trial-btn').addEventListener('click', resetForNextRun);
      } catch (error) {
        saveButton.disabled = false;
        saveError.textContent = draftSavedTrialId
          ? `Trial saved, but its reference status could not be updated: ${error.message}`
          : `Could not save trial: ${error.message}`;
      }
    });
  }

  const autoStop = createAutoStopDetector(
    () => finishRecording('auto-stopped'),
    {
      onStateChange(state) {
        const statusElement = document.getElementById('auto-stop-status');
        if (!statusElement) return;
        const messages = {
          grace: 'Auto-stop is waiting for the 2-second grace period.',
          'waiting-for-movement': 'Move to begin the trial. Auto-stop will not trigger until movement is detected.',
          monitoring: 'Movement detected. Auto-stop will finish the trial after 1.5 seconds without movement.'
        };
        if (messages[state]) statusElement.textContent = messages[state];
      }
    }
  );

  function startRecording() {
    recordingCreatedAt = new Date().toISOString();
    runState.innerHTML = `
      <div class="recording-panel">
        <div class="recording-status"><i></i><span><small>TRIAL IN PROGRESS</small><strong>Recording Your Movement</strong></span></div>
        <div class="elapsed-display"><small>ELAPSED</small><strong id="elapsed-time">00:00</strong><span class="recording-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
        <p class="auto-stop-status" id="auto-stop-status" aria-live="polite">Auto-stop is waiting for the 2-second grace period.</p>
        <button type="button" class="delete-button" id="stop-run-btn">Stop Trial</button>
      </div>
    `;
    recorder.start();
    recordingStartedAt = performance.now();
    autoStop.arm();
    startButton.disabled = true;
    enableButton.disabled = true;
    calibrateButton.disabled = true;
    elapsedTimer = window.setInterval(() => {
      const elapsed = formatElapsed(performance.now() - recordingStartedAt);
      const elapsedElement = document.getElementById('elapsed-time');
      if (elapsedElement) elapsedElement.textContent = elapsed;
    }, 250);
    document.getElementById('stop-run-btn').addEventListener('click', () => finishRecording('manual'));
  }

  function beginCountdown() {
    let remaining = countdownSeconds;
    startButton.disabled = true;
    runState.innerHTML = `
      <div class="countdown-panel" aria-live="assertive">
        <small>TRIAL STARTS IN</small><strong id="countdown-number">${remaining}</strong><span>SECONDS</span>
        <div class="countdown-track"><i></i></div>
        <button type="button" class="cancel-button" id="cancel-countdown">Cancel</button>
      </div>
    `;
    const progress = runState.querySelector('.countdown-track i');
    window.requestAnimationFrame(() => {
      progress.style.transitionDuration = `${countdownSeconds}s`;
      progress.style.width = '100%';
    });
    document.getElementById('cancel-countdown').addEventListener('click', () => {
      window.clearInterval(countdownTimer);
      countdownTimer = null;
      runState.replaceChildren();
      startButton.disabled = false;
    });
    countdownTimer = window.setInterval(() => {
      remaining -= 1;
      const number = document.getElementById('countdown-number');
      if (number) number.textContent = remaining;
      if (remaining <= 0) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        startRecording();
      }
    }, 1000);
  }

  function resetForNextRun() {
    window.clearInterval(elapsedTimer);
    draftSamples = null;
    draftSavedTrialId = null;
    runState.replaceChildren();
    startButton.disabled = !isEnabled || !calibrator.isCalibrated;
    enableButton.disabled = isEnabled;
    calibrateButton.disabled = !isEnabled;
    status.textContent = 'Your unsaved run was deleted. Start another whenever you’re ready.';
  }

  enableButton.addEventListener('click', async () => {
    enableButton.disabled = true;
    try {
      const granted = await requestMotionPermission();
      if (!granted) {
        status.textContent = 'Motion permission was denied. Check your browser site settings.';
        enableButton.disabled = false;
        return;
      }
      if (stopListening) stopListening();
      stopListening = startListening(
        orientation => {
          latestOrientation = orientation;
          latestRelative = calibrator.isCalibrated
            ? calibrator.getRelative(orientation)
            : { pitch: 0, roll: 0, yaw: 0 };
          recorder.addSample({
            pitch: latestRelative.pitch,
            roll: latestRelative.roll,
            yaw: latestRelative.yaw,
            accel: latestAccel
          });
        },
        motion => {
          latestAccel = motion.accel;
          if (recorder.isRecording) autoStop.addSample(motion.accel);
        }
      );
      isEnabled = true;
      status.textContent = 'Motion is enabled. Calibrate your starting position.';
      enableButton.querySelector('span').textContent = 'Motion Enabled';
      calibrateButton.disabled = false;
    } catch (error) {
      status.textContent = `Could not enable motion: ${error.message}`;
      enableButton.disabled = false;
    }
  });

  calibrateButton.addEventListener('click', () => {
    calibrator.calibrate(latestOrientation);
    latestRelative = { pitch: 0, roll: 0, yaw: 0 };
    status.textContent = 'Calibrated. Choose your delay and start the trial.';
    startButton.disabled = false;
  });

  startButton.addEventListener('click', beginCountdown);
}
