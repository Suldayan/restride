import { requestMotionPermission, startListening } from '../core/sensors.js';
import { createCalibrator } from '../core/calibration.js';
import { createRecorder } from '../core/recorder.js';
import { createAutoStopDetector } from '../core/autoStop.js';
import { createDeviationTracker } from '../core/deviation.js';
import { addTrial, createTrial, getTrials, setTrialReference } from '../core/trials.js';
import { processTrial } from '../core/api.js';
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
let countdownAudioContext = null;
let countdownAudioResume = null;
let deviationTracker = null;

function resumeCountdownAudio() {
  if (!countdownAudioContext || countdownAudioContext.state === 'running') {
    return Promise.resolve();
  }

  if (!countdownAudioResume) {
    countdownAudioResume = countdownAudioContext.resume().finally(() => {
      countdownAudioResume = null;
    });
  }
  return countdownAudioResume;
}

function initializeCountdownAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    console.warn('Countdown audio is not supported by this browser.');
    return;
  }

  try {
    countdownAudioContext ??= new AudioContextConstructor();
    const unlockBuffer = countdownAudioContext.createBuffer(1, 1, 22050);
    const unlockSource = countdownAudioContext.createBufferSource();
    unlockSource.buffer = unlockBuffer;
    unlockSource.connect(countdownAudioContext.destination);
    unlockSource.start();

    void resumeCountdownAudio().then(() => {
      console.info('Countdown audio context state:', countdownAudioContext.state);
    }).catch(error => {
      console.warn('Could not resume countdown audio.', error);
    });
  } catch (error) {
    console.warn('Could not initialize countdown audio.', error);
  }
}

function playCountdownBeep(isGo = false) {
  if (!countdownAudioContext) return;

  void resumeCountdownAudio().catch(error => {
    console.warn('Could not resume countdown audio for beep playback.', error);
  });

  const now = countdownAudioContext.currentTime + 0.01;
  const duration = isGo ? 0.35 : 0.14;
  const oscillator = countdownAudioContext.createOscillator();
  const gain = countdownAudioContext.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(isGo ? 1046 : 880, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.7, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(countdownAudioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
  console.info(`Countdown ${isGo ? 'GO' : 'number'} beep scheduled`, {
    state: countdownAudioContext.state,
    frequencyHz: isGo ? 1046 : 880,
    durationSeconds: duration
  });
}

function playDeviationAlert() {
  if (!countdownAudioContext) return;
  void resumeCountdownAudio().catch(error => {
    console.warn('Could not resume audio for deviation alert.', error);
  });

  const now = countdownAudioContext.currentTime + 0.01;
  const oscillator = countdownAudioContext.createOscillator();
  const gain = countdownAudioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(520, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  oscillator.connect(gain);
  gain.connect(countdownAudioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
}

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
      <section class="angle-readout" aria-label="Live phone angles">
        <div class="angle-readout-heading"><strong>Live Phone Angles</strong><small id="angle-readout-mode">Enable motion to view angles</small></div>
        <div class="angle-readout-values" aria-live="off">
          <div><small>FORWARD / BACK</small><strong><span id="angle-pitch">--</span>°</strong></div>
          <div><small>SIDE TO SIDE</small><strong><span id="angle-roll">--</span>°</strong></div>
          <div><small>TURNING</small><strong><span id="angle-yaw">--</span>°</strong></div>
        </div>
      </section>
      <div class="delay-setting">
        <div><strong>Start Delay</strong><small>Countdown before the run timer starts</small></div>
        <div class="delay-adjust">
          <button type="button" id="delay-minus" aria-label="Decrease start delay">−</button>
          <strong id="delay-value">${countdownSeconds}</strong><span>sec</span>
          <button type="button" id="delay-plus" aria-label="Increase start delay">+</button>
        </div>
      </div>
      <section class="deviation-settings" aria-label="Deviation warning thresholds">
        <p class="eyebrow">FORM ALERT SENSITIVITY</p>
        <label for="deviation-angle">Orientation tolerance <output id="deviation-angle-value">15°</output></label>
        <input id="deviation-angle" type="range" min="5" max="60" step="1" value="15">
        <label for="deviation-accel">Acceleration tolerance <output id="deviation-accel-value">3.0 m/s²</output></label>
        <input id="deviation-accel" type="range" min="1" max="8" step="0.5" value="3">
        <small>Alerts compare your movement with the saved reference trial.</small>
      </section>
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

  function updateAngleReadout() {
    const angles = calibrator.isCalibrated
      ? latestRelative
      : {
        pitch: latestOrientation.beta,
        roll: latestOrientation.gamma,
        yaw: latestOrientation.alpha
      };
    document.getElementById('angle-pitch').textContent = angles.pitch.toFixed(1);
    document.getElementById('angle-roll').textContent = angles.roll.toFixed(1);
    document.getElementById('angle-yaw').textContent = angles.yaw.toFixed(1);
    document.getElementById('angle-readout-mode').textContent = calibrator.isCalibrated
      ? 'Relative to calibrated zero'
      : 'Current phone angle · calibrate to set zero';
  }

  function updateDelay(value) {
    countdownSeconds = Math.max(1, Math.min(15, value));
    document.getElementById('delay-value').textContent = countdownSeconds;
  }

  document.getElementById('delay-minus').addEventListener('click', () => updateDelay(countdownSeconds - 1));
  document.getElementById('delay-plus').addEventListener('click', () => updateDelay(countdownSeconds + 1));
  const deviationAngleInput = document.getElementById('deviation-angle');
  const deviationAccelInput = document.getElementById('deviation-accel');
  deviationAngleInput.addEventListener('input', () => {
    document.getElementById('deviation-angle-value').textContent = `${deviationAngleInput.value}°`;
  });
  deviationAccelInput.addEventListener('input', () => {
    document.getElementById('deviation-accel-value').textContent = `${Number(deviationAccelInput.value).toFixed(1)} m/s²`;
  });

  function finishRecording(reason) {
    if (!recorder.isRecording) return;
    draftSamples = recorder.stop();
    autoStop.disarm();
    deviationTracker = null;
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
          void processTrial(savedTrial).catch(error => {
            console.error('Could not process the saved trial with the backend.', error);
          });
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
        startButton.disabled = !isEnabled || !calibrator.isCalibrated;
        enableButton.disabled = isEnabled;
        calibrateButton.disabled = !isEnabled;
        status.textContent = 'Trial saved. Start another whenever you’re ready.';
        showScreen('trial');
        runState.innerHTML = `
          <div class="saved-confirmation">
            <span aria-hidden="true">✓</span>
            <div><small>TRIAL SAVED</small><strong></strong><p>Saved to Previous Trials. Return to Start whenever you’re ready for another run.</p></div>
          </div>
        `;
        runState.querySelector('.saved-confirmation strong').textContent = savedTrial.label;
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
    const referenceTrial = getTrials().find(trial => trial.isReference && trial.samples.length > 0);
    deviationTracker = referenceTrial
      ? createDeviationTracker(referenceTrial.samples, {
        thresholdDeg: Number(deviationAngleInput.value),
        thresholdAccelMps2: Number(deviationAccelInput.value),
        sustainedMs: 1500,
        cooldownMs: 5000,
        onStateChange(state) {
          const warning = document.getElementById('deviation-status');
          if (!warning) return;
          const messages = {
            pending: 'Deviation detected. Return to range within 1.5 seconds to avoid an alert.',
            alert: 'Form deviation: movement is outside your reference range.',
            'within-range': 'Back within your acceptable movement range.'
          };
          if (messages[state]) warning.textContent = messages[state];
        }
      })
      : null;
    runState.innerHTML = `
      <div class="recording-panel">
        <div class="recording-status"><i></i><span><small>TRIAL IN PROGRESS</small><strong>Recording Your Movement</strong></span></div>
        <div class="elapsed-display"><small>ELAPSED</small><strong id="elapsed-time">00:00</strong><span class="recording-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
        <p class="auto-stop-status" id="auto-stop-status" aria-live="polite">Auto-stop is waiting for the 2-second grace period.</p>
        <p class="deviation-status" id="deviation-status" aria-live="polite"></p>
        <button type="button" class="delete-button" id="stop-run-btn">Stop Trial</button>
      </div>
    `;
    document.getElementById('deviation-status').textContent = referenceTrial
      ? `Monitoring against ${referenceTrial.label}.`
      : 'Set a saved reference trial to enable form deviation alerts.';
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
    initializeCountdownAudio();
    let remaining = countdownSeconds;
    startButton.disabled = true;
    runState.innerHTML = `
      <div class="countdown-panel" aria-live="assertive">
        <small>TRIAL STARTS IN</small><strong id="countdown-number">${remaining}</strong><span>SECONDS</span>
        <div class="countdown-track"><i></i></div>
        <button type="button" class="cancel-button" id="cancel-countdown">Cancel</button>
      </div>
    `;
    if (remaining === 3) playCountdownBeep();
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
      if (remaining === 3 || remaining === 2 || remaining === 1) playCountdownBeep();
      if (remaining <= 0) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        playCountdownBeep(true);
        startRecording();
      }
    }, 1000);
  }

  document.addEventListener('restride:start-trial', () => {
    if (isEnabled && calibrator.isCalibrated && !recorder.isRecording && countdownTimer === null) {
      beginCountdown();
    }
  });

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
          updateAngleReadout();
          recorder.addSample({
            pitch: latestRelative.pitch,
            roll: latestRelative.roll,
            yaw: latestRelative.yaw,
            accel: latestAccel
          });
        },
        motion => {
          latestAccel = motion.accel;
          if (recorder.isRecording) {
            autoStop.addSample(motion.accel);
            const deviation = deviationTracker?.check(
              performance.now() - recordingStartedAt,
              latestRelative,
              motion.accel
            );
            if (deviation?.alertTriggered) playDeviationAlert();
          }
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
    updateAngleReadout();
    status.textContent = 'Calibrated. Choose your delay and start the trial.';
    startButton.disabled = false;
  });

  startButton.addEventListener('click', beginCountdown);
}
