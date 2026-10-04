import { getTrials, getTrialDurationSeconds, setTrialReference } from '../core/trials.js';

let chartInstances = [];

function formatDate(dateString) {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function destroyCharts() {
  chartInstances.forEach(chart => chart.destroy());
  chartInstances = [];
}

function drawCharts(trial) {
  const labels = trial.samples.map(sample => (sample.t / 1000).toFixed(2));
  const metrics = [
    { id: 'pitch', unit: '°', values: trial.samples.map(sample => sample.pitch) },
    { id: 'roll', unit: '°', values: trial.samples.map(sample => sample.roll) },
    { id: 'yaw', unit: '°', values: trial.samples.map(sample => sample.yaw) },
    { id: 'accel-x', unit: 'm/s²', values: trial.samples.map(sample => sample.accel.x) },
    { id: 'accel-y', unit: 'm/s²', values: trial.samples.map(sample => sample.accel.y) },
    { id: 'accel-z', unit: 'm/s²', values: trial.samples.map(sample => sample.accel.z) }
  ];

  metrics.forEach(metric => {
    const canvas = document.getElementById(`chart-${metric.id}`);
    if (!canvas || metric.values.length === 0) return;
    canvas.closest('.metric-chart-card').querySelector('.metric-chart-value').textContent =
      `${metric.values.at(-1).toFixed(1)} ${metric.unit}`;

    chartInstances.push(new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: metric.values,
          borderColor: '#5b9cff',
          backgroundColor: context => {
            const { chart } = context;
            const { chartArea } = chart;
            if (!chartArea) return 'rgba(91, 156, 255, .12)';
            const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            gradient.addColorStop(0, 'rgba(91, 156, 255, .25)');
            gradient.addColorStop(1, 'rgba(91, 156, 255, .015)');
            return gradient;
          },
          fill: true,
          pointRadius: 0,
          pointHitRadius: 10,
          borderWidth: 2,
          tension: .25
        }]
      },
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: context => `${context.parsed.y.toFixed(1)} ${metric.unit}` }
          }
        },
        scales: {
          x: {
            ticks: { color: '#8290a1', maxTicksLimit: 3, maxRotation: 0, font: { size: 8 }, autoSkip: true },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            ticks: { color: '#8290a1', maxTicksLimit: 3, font: { size: 8 } },
            grid: { color: 'rgba(164, 183, 207, .09)' },
            border: { display: false }
          }
        }
      }
    }));
  });
}

function createHistoryRow(trial, selectedTrial) {
  const row = document.createElement('article');
  row.className = `history-row${selectedTrial ? ' current-trial' : ''}`;
  row.innerHTML = `
    <button type="button" class="history-open">
      <span class="history-icon" aria-hidden="true">↗</span>
      <span class="history-copy"><small></small><strong></strong><em></em></span>
      <span class="history-time"></span>
    </button>
    <button type="button" class="reference-button" aria-label="Set as reference trial"></button>
  `;
  row.querySelector('small').textContent = formatDate(trial.createdAt);
  row.querySelector('strong').textContent = trial.label;
  row.querySelector('em').textContent = trial.isReference ? 'Reference trial' : 'Completed';
  row.querySelector('.history-time').textContent = `${getTrialDurationSeconds(trial).toFixed(2)} sec`;
  row.querySelector('.history-open').addEventListener('click', () => renderTrial(trial));
  const referenceButton = row.querySelector('.reference-button');
  referenceButton.textContent = trial.isReference ? '★ Reference' : 'Set Reference';
  referenceButton.setAttribute('aria-pressed', String(trial.isReference));
  referenceButton.addEventListener('click', async () => {
    referenceButton.disabled = true;
    try {
      await setTrialReference(trial.id);
      document.dispatchEvent(new CustomEvent('restride:reference-changed'));
      renderTrial(getTrials().find(savedTrial => savedTrial.id === trial.id));
    } catch (error) {
      referenceButton.disabled = false;
      referenceButton.textContent = `Could not update: ${error.message}`;
    }
  });
  return row;
}

export function initTrial() {}

export function renderLatestTrial() {
  renderTrial(getTrials()[0] ?? null);
}

export function renderTrial(trial, { isDraft = false } = {}) {
  const details = document.getElementById('trial-details');
  destroyCharts();

  if (!trial) {
    details.innerHTML = `
      <section class="trial-empty-state">
        <p class="eyebrow">LATEST TRIAL PREVIEW</p>
        <h2>No saved trial to preview yet.</h2>
        <p>Once you save a run, its movement summary and charts will appear here.</p>
      </section>
      <section class="history-section">
        <div class="section-heading"><div><p class="eyebrow">YOUR SESSIONS</p><h2>Previous Trials</h2></div></div>
        <p class="empty-list">Your saved trials will appear here.</p>
      </section>
    `;
    return;
  }

  const duration = getTrialDurationSeconds(trial);
  const savedTrials = getTrials();
  details.innerHTML = `
    ${isDraft ? '<div class="draft-notice"><span class="orange-dot"></span> UNSAVED PREVIEW · Save or delete this run from Start.</div>' : ''}
    <div class="trial-detail-heading">
      <div><p class="eyebrow">${isDraft ? 'RUN PREVIEW' : 'TRIAL BREAKDOWN'}</p><h2 class="selected-trial-name"></h2><p class="selected-trial-meta"></p></div>
      <span class="saved-badge">${isDraft ? 'DRAFT' : trial.isReference ? 'REFERENCE' : 'SAVED'}</span>
    </div>
    <section class="summary-card" aria-label="Run summary">
      <p class="eyebrow">RUN SUMMARY</p>
      <div class="summary-row"><span>Duration</span><strong>${duration.toFixed(2)} sec</strong></div>
      <div class="summary-row"><span>Date &amp; Time</span><strong class="created-at"></strong></div>
      <div class="summary-row"><span>Movement samples collected</span><strong>${trial.samples.length}</strong></div>
      <div class="summary-row"><span>Trial type</span><strong>${trial.isReference ? 'Reference' : 'Run'}</strong></div>
    </section>
    <section class="metrics-section">
      <div class="section-heading"><div><p class="eyebrow">ORIENTATION · DEGREES</p><h2>Body Movement</h2></div></div>
      <div class="metrics-grid">
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Forward / back tilt</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-pitch" aria-label="Forward and back tilt over the trial"></canvas></div><small class="metric-chart-foot">Relative to your calibrated start</small></article>
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Side-to-side tilt</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-roll" aria-label="Side-to-side tilt over the trial"></canvas></div><small class="metric-chart-foot">Relative to your calibrated start</small></article>
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Turning</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-yaw" aria-label="Turning over the trial"></canvas></div><small class="metric-chart-foot">Relative to your calibrated start</small></article>
      </div>
    </section>
    <section class="metrics-section acceleration-section">
      <div class="section-heading"><div><p class="eyebrow">ACCELERATION · M/S²</p><h2>Movement Forces</h2></div></div>
      <div class="metrics-grid">
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Forward · X</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-accel-x" aria-label="Forward acceleration on the x axis over the trial"></canvas></div><small class="metric-chart-foot">Includes gravity</small></article>
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Side · Y</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-accel-y" aria-label="Side acceleration on the y axis over the trial"></canvas></div><small class="metric-chart-foot">Includes gravity</small></article>
        <article class="metric-chart-card"><div class="metric-chart-heading"><h3>Vertical · Z</h3><strong class="metric-chart-value"></strong></div><div class="metric-chart-wrap"><canvas id="chart-accel-z" aria-label="Vertical acceleration on the z axis over the trial"></canvas></div><small class="metric-chart-foot">Includes gravity</small></article>
      </div>
    </section>
    <section class="history-section">
      <div class="section-heading"><div><p class="eyebrow">YOUR SESSIONS</p><h2>Previous Trials</h2><p>Choose a saved run to review its breakdown or set a reference.</p></div><span class="history-count"></span></div>
      <div class="history-list"></div>
    </section>
  `;

  details.querySelector('.selected-trial-name').textContent = trial.label;
  details.querySelector('.selected-trial-meta').textContent = `${formatDate(trial.createdAt)} · ${trial.isReference ? 'Reference trial' : isDraft ? 'Unsaved preview' : 'Completed'}`;
  details.querySelector('.created-at').textContent = formatDate(trial.createdAt);

  if (trial.samples.length === 0) {
    details.querySelector('.metrics-section').innerHTML = `
      <div class="section-heading"><div><p class="eyebrow">ORIENTATION · DEGREES</p><h2>Body Movement</h2></div></div>
      <p class="empty-list">This trial has no movement samples to chart.</p>
    `;
    details.querySelector('.acceleration-section').innerHTML = `
      <div class="section-heading"><div><p class="eyebrow">ACCELERATION · M/S²</p><h2>Movement Forces</h2></div></div>
      <p class="empty-list">This trial has no acceleration samples to chart.</p>
    `;
  }

  const history = details.querySelector('.history-list');
  details.querySelector('.history-count').textContent = String(savedTrials.length).padStart(2, '0');
  if (savedTrials.length === 0) {
    history.innerHTML = '<p class="empty-list">No previous trials yet.</p>';
  } else {
    savedTrials.forEach(savedTrial => history.appendChild(createHistoryRow(savedTrial, savedTrial.id === trial.id)));
  }
  if (trial.samples.length > 0) drawCharts(trial);
}
