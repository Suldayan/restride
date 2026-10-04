import { deleteTrial, getTrials, getTrialDurationSeconds, setTrialReference } from '../core/trials.js';
import { renderDeviationTrend } from './deviationTrend.js';
import { renderTrial } from './trial.js';
import { showScreen } from '../app.js';

function formatDate(dateString, options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  return new Date(dateString).toLocaleString(undefined, options);
}

function formatDuration(seconds) {
  if (seconds < 0.05) return '0 sec';
  if (seconds < 60) return `${seconds.toFixed(1)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
}

function openTrial(trial) {
  renderTrial(trial);
  showScreen('trial');
}

function createTrialRow(trial) {
  const row = document.createElement('article');
  row.className = 'trial-row';
  row.innerHTML = `
    <button class="trial-row-open" type="button">
      <span class="trial-row-icon" aria-hidden="true">↗</span>
      <span class="trial-row-copy"><small></small><strong></strong><em></em></span>
      <span class="trial-row-duration"></span>
    </button>
    <div class="trial-row-actions">
      <button class="reference-button" type="button"></button>
      <button class="delete-trial-button" type="button">Delete</button>
    </div>
  `;
  row.querySelector('small').textContent = formatDate(trial.createdAt);
  row.querySelector('strong').textContent = trial.label;
  row.querySelector('em').textContent = trial.isReference ? 'Reference trial' : 'Completed';
  row.querySelector('.trial-row-duration').textContent = formatDuration(getTrialDurationSeconds(trial));
  row.querySelector('.trial-row-open').addEventListener('click', () => openTrial(trial));

  const referenceButton = row.querySelector('.reference-button');
  referenceButton.textContent = trial.isReference ? '★ Reference' : 'Set Reference';
  referenceButton.setAttribute('aria-pressed', String(trial.isReference));
  referenceButton.addEventListener('click', async () => {
    referenceButton.disabled = true;
    try {
      await setTrialReference(trial.id);
      document.dispatchEvent(new CustomEvent('restride:reference-changed'));
    } catch (error) {
      referenceButton.disabled = false;
      referenceButton.textContent = `Could not update: ${error.message}`;
    }
  });

  const deleteButton = row.querySelector('.delete-trial-button');
  deleteButton.setAttribute('aria-label', `Delete trial ${trial.label}`);
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Delete "${trial.label}"? This cannot be undone.`)) return;
    deleteButton.disabled = true;
    try {
      await deleteTrial(trial.id);
      document.dispatchEvent(new CustomEvent('restride:trial-deleted', { detail: { id: trial.id } }));
    } catch (error) {
      deleteButton.disabled = false;
      deleteButton.textContent = 'Could not delete';
      deleteButton.title = error.message;
    }
  });
  return row;
}

function renderOverview(container, trials) {
  const totalDuration = trials.reduce((total, trial) => total + getTrialDurationSeconds(trial), 0);
  const reference = trials.find(trial => trial.isReference);
  container.innerHTML = `
    <div class="overview-stats">
      <article class="overview-stat"><small>TRIALS</small><strong>${trials.length}</strong><span>saved runs</span></article>
      <article class="overview-stat"><small>TIME RECORDED</small><strong>${formatDuration(totalDuration)}</strong><span>across all runs</span></article>
      <article class="overview-stat"><small>REFERENCE</small><strong class="reference-stat"></strong><span class="reference-subtitle"></span></article>
    </div>
    <section class="home-start-card">
      <div><p class="eyebrow">${trials.length ? 'READY FOR ANOTHER RUN?' : 'READY FOR YOUR FIRST RUN?'}</p><h2>${trials.length ? 'Keep building your movement history.' : 'Your training starts with one trial.'}</h2><p>${trials.length ? 'Record a new run and compare it with your saved trials.' : 'Record a run to build your movement history and see your results.'}</p></div>
      <button type="button" class="primary-button">${trials.length ? 'Start Another Trial' : 'Record a Trial'} <span aria-hidden="true">→</span></button>
    </section>
  `;

  container.querySelector('.reference-stat').textContent = reference ? 'Set' : 'Not set';
  container.querySelector('.reference-subtitle').textContent = reference
    ? reference.label
    : 'choose a trial to compare';
  container.querySelector('.primary-button').addEventListener('click', () => {
    showScreen('start');
    document.dispatchEvent(new CustomEvent('restride:start-trial'));
  });
}

export function initHome() {
  const overview = document.getElementById('home-overview');
  const list = document.getElementById('home-trials');
  const deviationTrend = document.getElementById('home-deviation-trend');
  const today = document.getElementById('today-date');
  today.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  function renderTrials() {
    const trials = getTrials();
    renderOverview(overview, trials);
    const reference = trials.find(trial => trial.isReference);
    renderDeviationTrend(deviationTrend, trials, reference?.id ?? '', async id => {
      if (!id) return;
      await setTrialReference(id);
      document.dispatchEvent(new CustomEvent('restride:reference-changed'));
    });
    list.replaceChildren();

    if (trials.length === 0) {
      list.innerHTML = '<p class="empty-list">Your next saved run will show up here.</p>';
      return;
    }
    trials.slice(0, 3).forEach(trial => list.appendChild(createTrialRow(trial)));
  }

  document.addEventListener('restride:trial-saved', renderTrials);
  document.addEventListener('restride:reference-changed', renderTrials);
  document.addEventListener('restride:trial-deleted', renderTrials);
  renderTrials();
}
