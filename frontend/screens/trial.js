import { getTrials, getTrialDurationSeconds, setTrialReference } from '../core/trials.js';

let chartInstances = [];

const metrics = [
  { id: 'pitch', title: 'Forward / back tilt', unit: '°', description: 'Change in forward and backward phone orientation from your calibrated starting position.', value: sample => sample.pitch },
  { id: 'roll', title: 'Side-to-side tilt', unit: '°', description: 'Change in side-to-side phone orientation from your calibrated starting position.', value: sample => sample.roll },
  { id: 'yaw', title: 'Turning', unit: '°', description: 'Change in turning orientation from your calibrated starting position.', value: sample => sample.yaw },
  { id: 'accel-x', title: 'Forward · X', unit: 'm/s²', description: 'Acceleration measured on the X axis. Values include gravity.', value: sample => sample.accel.x },
  { id: 'accel-y', title: 'Side · Y', unit: 'm/s²', description: 'Acceleration measured on the Y axis. Values include gravity.', value: sample => sample.accel.y },
  { id: 'accel-z', title: 'Vertical · Z', unit: 'm/s²', description: 'Acceleration measured on the Z axis. Values include gravity.', value: sample => sample.accel.z }
];

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

function chartDatasets(metric, trial, referenceTrial) {
  const currentSamples = trial.samples.map(sample => ({
    x: sample.t / 1000,
    y: metric.value(sample)
  }));
  const datasets = [{
    label: 'This run',
    data: currentSamples,
    borderColor: '#5b9cff',
    backgroundColor: context => {
      const { chart } = context;
      const { chartArea } = chart;
      if (!chartArea) return 'rgba(91, 156, 255, .12)';
      const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, 'rgba(91, 156, 255, .22)');
      gradient.addColorStop(1, 'rgba(91, 156, 255, .015)');
      return gradient;
    },
    fill: true,
    pointRadius: 0,
    pointHitRadius: 10,
    borderWidth: 2.5,
    tension: .25
  }];

  if (referenceTrial) {
    datasets.push({
      label: 'Reference',
      data: referenceTrial.samples.map(sample => ({
        x: sample.t / 1000,
        y: metric.value(sample)
      })),
      borderColor: '#c4ff70',
      backgroundColor: '#c4ff70',
      pointBackgroundColor: '#c4ff70',
      pointBorderColor: '#07110c',
      pointBorderWidth: 1,
      pointRadius: 2,
      pointHoverRadius: 5,
      borderWidth: 3,
      borderDash: [7, 4],
      fill: false,
      tension: .18
    });
  }

  return datasets;
}

function drawChart(canvas, metric, trial, referenceTrial, detailed = false) {
  const chart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: chartDatasets(metric, trial, referenceTrial)
      },
      options: {
        responsive: true,
        animation: false,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'nearest', axis: 'x' },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: items => items.length ? `${items[0].parsed.x.toFixed(2)} sec` : '',
              label: context => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} ${metric.unit}`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            title: detailed ? { display: true, text: 'Elapsed time (sec)', color: '#94a69a', font: { size: 10 } } : { display: false },
            ticks: {
              color: '#8290a1',
              maxTicksLimit: detailed ? 7 : 3,
              maxRotation: 0,
              font: { size: detailed ? 10 : 8 },
              callback: value => Number(value).toFixed(1)
            },
            grid: { display: false },
            border: { display: false }
          },
          y: {
            title: detailed ? { display: true, text: metric.unit, color: '#94a69a', font: { size: 10 } } : { display: false },
            ticks: { color: '#8290a1', maxTicksLimit: detailed ? 7 : 3, font: { size: detailed ? 10 : 8 } },
            grid: { color: 'rgba(164, 183, 207, .09)' },
            border: { display: false }
          }
        }
      }
    });
  chartInstances.push(chart);
  return chart;
}

function getMetricStats(metric, trial) {
  const samples = trial.samples.map(sample => ({
    time: sample.t / 1000,
    value: metric.value(sample)
  }));
  let min = samples[0];
  let max = samples[0];
  let total = 0;

  samples.forEach(sample => {
    if (sample.value < min.value) min = sample;
    if (sample.value > max.value) max = sample;
    total += sample.value;
  });

  return {
    min,
    max,
    average: total / samples.length,
    range: max.value - min.value
  };
}

function showMetricDetail(metric, trial, referenceTrial) {
  const dialog = document.getElementById('chart-detail-dialog');
  if (!dialog) return;
  const chart = dialog.querySelector('canvas');
  const stats = getMetricStats(metric, trial);

  dialog.querySelector('.chart-detail-title').textContent = metric.title;
  dialog.querySelector('.chart-detail-description').textContent = metric.description;
  dialog.querySelector('.chart-detail-trial').textContent = `${trial.label} · ${formatDate(trial.createdAt)}`;
  dialog.querySelector('.chart-detail-reference').hidden = !referenceTrial;
  dialog.querySelector('.chart-detail-reference-name').textContent = referenceTrial?.label ?? '';
  dialog.querySelector('.chart-detail-legend').hidden = !referenceTrial;
  dialog.querySelector('.chart-detail-stat-min').textContent = `${stats.min.value.toFixed(2)} ${metric.unit}`;
  dialog.querySelector('.chart-detail-stat-min-time').textContent = `at ${stats.min.time.toFixed(2)} sec`;
  dialog.querySelector('.chart-detail-stat-max').textContent = `${stats.max.value.toFixed(2)} ${metric.unit}`;
  dialog.querySelector('.chart-detail-stat-max-time').textContent = `at ${stats.max.time.toFixed(2)} sec`;
  dialog.querySelector('.chart-detail-stat-average').textContent = `${stats.average.toFixed(2)} ${metric.unit}`;
  dialog.querySelector('.chart-detail-stat-range').textContent = `${stats.range.toFixed(2)} ${metric.unit}`;
  dialog.showModal();
  drawChart(chart, metric, trial, referenceTrial, true);
  dialog.querySelector('.chart-detail-close').focus();
}

function renderMetricCard(metric, referenceTrial) {
  const referenceLegend = referenceTrial
    ? '<span class="chart-legend-item reference-legend"><i></i> Reference</span>'
    : '';
  return `
    <article class="metric-chart-card" data-metric="${metric.id}" tabindex="0" role="button" aria-label="View detailed ${metric.title} chart">
      <div class="metric-chart-heading"><h3>${metric.title}</h3><strong class="metric-chart-value"></strong></div>
      <div class="metric-chart-wrap"><canvas id="chart-${metric.id}" aria-label="${metric.title} over the trial"></canvas></div>
      <div class="metric-chart-footer">
        <small class="metric-chart-foot">Tap chart for details</small>
        <span class="chart-legend-item"><i></i> This run</span>${referenceLegend}
      </div>
    </article>
  `;
}

function renderChartCards(trial, referenceTrial, details) {
  metrics.forEach(metric => {
    const card = details.querySelector(`[data-metric="${metric.id}"]`);
    const chartCanvas = card?.querySelector('canvas');
    if (!card || !chartCanvas) return;
    const values = trial.samples.map(metric.value);
    card.querySelector('.metric-chart-value').textContent = `${values.at(-1).toFixed(1)} ${metric.unit}`;
    card.addEventListener('click', () => showMetricDetail(metric, trial, referenceTrial));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      showMetricDetail(metric, trial, referenceTrial);
    });
    drawChart(chartCanvas, metric, trial, referenceTrial);
  });

  const dialog = details.querySelector('#chart-detail-dialog');
  dialog.addEventListener('close', () => {
    const detailChart = Chart.getChart(dialog.querySelector('canvas'));
    if (!detailChart) return;
    detailChart.destroy();
    chartInstances = chartInstances.filter(chart => chart !== detailChart);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('.chart-detail-close').addEventListener('click', () => dialog.close());
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
  const referenceTrial = savedTrials.find(savedTrial =>
    savedTrial.isReference &&
    savedTrial.id !== trial.id &&
    savedTrial.samples.length > 0
  ) ?? null;
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
        ${metrics.slice(0, 3).map(metric => renderMetricCard(metric, referenceTrial)).join('')}
      </div>
    </section>
    <section class="metrics-section acceleration-section">
      <div class="section-heading"><div><p class="eyebrow">ACCELERATION · M/S²</p><h2>Movement Forces</h2></div></div>
      <div class="metrics-grid">
        ${metrics.slice(3).map(metric => renderMetricCard(metric, referenceTrial)).join('')}
      </div>
    </section>
    <dialog class="chart-detail-dialog" id="chart-detail-dialog" aria-labelledby="chart-detail-title">
      <div class="chart-detail-heading">
        <div><p class="eyebrow">CHART DETAIL</p><h2 class="chart-detail-title"></h2></div>
        <button type="button" class="chart-detail-close" aria-label="Close chart details">×</button>
      </div>
      <p class="chart-detail-description"></p>
      <p class="chart-detail-trial"></p>
      <p class="chart-detail-reference" hidden>Dashed green line: <strong class="chart-detail-reference-name"></strong></p>
      <div class="chart-detail-legend">
        <span class="chart-legend-item"><i></i> This run</span>
        <span class="chart-legend-item reference-legend"><i></i> Reference</span>
      </div>
      <div class="chart-detail-chart-wrap"><canvas aria-label="Detailed chart"></canvas></div>
      <div class="chart-detail-stats">
        <article><small>MINIMUM</small><strong class="chart-detail-stat-min"></strong><span class="chart-detail-stat-min-time"></span></article>
        <article><small>MAXIMUM</small><strong class="chart-detail-stat-max"></strong><span class="chart-detail-stat-max-time"></span></article>
        <article><small>AVERAGE</small><strong class="chart-detail-stat-average"></strong><span>across this run</span></article>
        <article><small>TOTAL RANGE</small><strong class="chart-detail-stat-range"></strong><span>maximum minus minimum</span></article>
      </div>
    </dialog>
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
  if (trial.samples.length > 0) renderChartCards(trial, referenceTrial, details);
}
