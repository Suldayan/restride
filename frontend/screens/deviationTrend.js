const COMPARISON_SAMPLE_COUNT = 80;
const ZERO_MATCH_ERROR_DEGREES = 45;
const comparisonColor = index => `hsl(${(index * 137.508 + 38) % 360} 78% 65%)`;

function angleDifference(a, b) {
  const difference = (b - a) % 360;
  return ((difference + 540) % 360) - 180;
}

function sampleAtProgress(trial, progress) {
  const samples = trial.samples;
  const firstTime = samples[0].t;
  const lastTime = samples.at(-1).t;
  const targetTime = firstTime + (lastTime - firstTime) * progress;

  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle].t < targetTime) low = middle + 1;
    else high = middle;
  }

  const after = samples[low];
  const before = samples[Math.max(0, low - 1)];
  const duration = after.t - before.t;
  const ratio = duration > 0 ? (targetTime - before.t) / duration : 0;
  return {
    pitch: before.pitch + angleDifference(before.pitch, after.pitch) * ratio,
    roll: before.roll + angleDifference(before.roll, after.roll) * ratio,
    yaw: before.yaw + angleDifference(before.yaw, after.yaw) * ratio
  };
}

export function calculateDeviationSimilarity(reference, trial) {
  if (reference.samples.length < 2 || trial.samples.length < 2) return null;

  let totalError = 0;
  for (let index = 0; index < COMPARISON_SAMPLE_COUNT; index++) {
    const progress = index / (COMPARISON_SAMPLE_COUNT - 1);
    const referenceSample = sampleAtProgress(reference, progress);
    const trialSample = sampleAtProgress(trial, progress);
    totalError += Math.hypot(
      angleDifference(referenceSample.pitch, trialSample.pitch),
      angleDifference(referenceSample.roll, trialSample.roll),
      angleDifference(referenceSample.yaw, trialSample.yaw)
    );
  }

  const meanErrorDegrees = totalError / COMPARISON_SAMPLE_COUNT;
  return {
    meanErrorDegrees,
    score: Math.round(Math.max(0, 1 - meanErrorDegrees / ZERO_MATCH_ERROR_DEGREES) * 100),
    category: meanErrorDegrees <= 7.5
      ? 'Very close'
      : meanErrorDegrees <= 18
        ? 'Somewhat different'
        : 'Significantly different'
  };
}

function formatTrialDate(trial) {
  return new Date(trial.createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function createTrendLineChart(reference, comparisons, metric) {
  const plottedTrials = [reference, ...comparisons.map(comparison => comparison.trial)];
  let maxMagnitude = 0;
  plottedTrials.forEach(trial => {
    for (let index = 0; index < COMPARISON_SAMPLE_COUNT; index++) {
      const sample = sampleAtProgress(trial, index / (COMPARISON_SAMPLE_COUNT - 1));
      maxMagnitude = Math.max(maxMagnitude, Math.abs(sample[metric.key]));
    }
  });

  const axisLimit = Math.min(180, Math.max(5, Math.ceil(maxMagnitude / 5) * 5));
  const width = 640;
  const height = 225;
  const padding = { left: 48, right: 14, top: 15, bottom: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = progress => padding.left + progress * plotWidth;
  const y = value => padding.top + ((axisLimit - value) / (axisLimit * 2)) * plotHeight;
  const yTicks = [-axisLimit, -axisLimit / 2, 0, axisLimit / 2, axisLimit];
  const xTicks = [0, 0.25, 0.5, 0.75, 1];

  function pathFor(trial) {
    return Array.from({ length: COMPARISON_SAMPLE_COUNT }, (_, index) => {
      const progress = index / (COMPARISON_SAMPLE_COUNT - 1);
      const sample = sampleAtProgress(trial, progress);
      return `${index ? 'L' : 'M'}${x(progress).toFixed(1)},${y(sample[metric.key]).toFixed(1)}`;
    }).join(' ');
  }

  const grid = [
    ...yTicks.map(value => `
      <line class="trend-grid-line${value === 0 ? ' zero-line' : ''}" x1="${padding.left}" y1="${y(value)}" x2="${width - padding.right}" y2="${y(value)}"/>
      <text class="trend-tick-label" x="${padding.left - 8}" y="${y(value) + 3}" text-anchor="end">${value}°</text>
    `),
    ...xTicks.map(progress => `
      <line class="trend-grid-line vertical-grid-line" x1="${x(progress)}" y1="${padding.top}" x2="${x(progress)}" y2="${height - padding.bottom}"/>
      <text class="trend-tick-label" x="${x(progress)}" y="${height - 12}" text-anchor="middle">${Math.round(progress * 100)}%</text>
    `)
  ].join('');

  const comparisonPaths = comparisons.map(({ trial, color }, index) => `
    <path class="deviation-path comparison-path" d="${pathFor(trial)}" stroke="${color ?? comparisonColor(index)}"/>
  `).join('');

  return `
    <svg class="deviation-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.label} angle across normalized trial progress, comparing the reference and saved trials.">
      <g class="trend-grid">${grid}</g>
      ${comparisonPaths}
      <path class="deviation-path reference-path" d="${pathFor(reference)}"/>
    </svg>
  `;
}

function createLegendItem({ trial, result = null, color = null, isReference = false }) {
  const item = document.createElement('li');
  if (isReference) item.classList.add('deviation-legend-reference');

  const swatch = document.createElement('span');
  swatch.className = 'deviation-legend-swatch';
  if (color) swatch.style.setProperty('--trial-color', color);

  const copy = document.createElement('span');
  copy.className = 'deviation-legend-copy';
  const title = document.createElement('strong');
  title.textContent = isReference ? `Reference · ${trial.label}` : trial.label;
  const subtitle = document.createElement('small');
  subtitle.textContent = isReference
    ? `${formatTrialDate(trial)} · baseline movement path`
    : result
      ? `${formatTrialDate(trial)} · ${result.category} · ${result.meanErrorDegrees.toFixed(1)}° mean difference`
      : `${formatTrialDate(trial)} · not enough movement samples to compare`;
  copy.append(title, subtitle);

  const score = document.createElement('span');
  score.className = 'deviation-legend-score';
  score.textContent = isReference ? 'BASELINE' : result ? `${result.score}%` : 'N/A';
  if (!isReference && result) {
    const match = document.createElement('small');
    match.textContent = 'match';
    score.append(' ', match);
  }

  item.append(swatch, copy, score);
  return item;
}

export function renderDeviationTrend(container, trials, selectedReferenceId, onReferenceChange) {
  const reference = trials.find(trial => trial.id === selectedReferenceId) ?? null;
  container.innerHTML = `
    <section class="deviation-trend-card" aria-labelledby="deviation-trend-title">
      <div class="deviation-trend-heading">
        <div><p class="eyebrow">MOVEMENT CONSISTENCY</p><h2 id="deviation-trend-title">Deviation Trend</h2></div>
        <span class="deviation-trend-icon" aria-hidden="true">↗</span>
      </div>
      <p class="deviation-trend-description">Compare how closely each saved run reproduced your reference movement path.</p>
      <label class="deviation-reference-field" for="deviation-reference-select"><span>Reference Trial</span><select id="deviation-reference-select"></select></label>
      <p class="deviation-score-note">Match scores compare orientation paths at the same percentage of each run. They measure similarity, not better or worse form; 45° mean orientation error maps to 0%.</p>
      <p class="deviation-trend-error" role="alert" hidden></p>
      <div class="deviation-trend-content"></div>
    </section>
  `;

  const select = container.querySelector('#deviation-reference-select');
  select.add(new Option('Select a reference trial', ''));
  trials.forEach(trial => {
    const option = new Option(`${trial.label} · ${formatTrialDate(trial)}`, trial.id);
    option.selected = trial.id === selectedReferenceId;
    select.add(option);
  });
  select.disabled = trials.length === 0;
  select.addEventListener('change', async () => {
    if (!select.value) {
      select.disabled = trials.length === 0;
      return;
    }
    select.disabled = true;
    try {
      await onReferenceChange(select.value);
    } catch (error) {
      select.disabled = false;
      select.value = selectedReferenceId;
      const errorElement = container.querySelector('.deviation-trend-error');
      errorElement.textContent = `Could not update reference trial: ${error.message}`;
      errorElement.hidden = false;
    }
  });

  const content = container.querySelector('.deviation-trend-content');
  if (!trials.length) {
    content.innerHTML = '<p class="deviation-trend-empty">Save a completed trial to choose a reference.</p>';
    return;
  }
  if (!reference) {
    content.innerHTML = '<p class="deviation-trend-empty">Choose a saved trial above to set your reference movement path.</p>';
    return;
  }
  if (reference.samples.length < 2) {
    content.innerHTML = '<p class="deviation-trend-empty">This reference trial does not have enough movement samples to draw a trajectory. Choose another trial with recorded movement.</p>';
    return;
  }

  const comparisons = trials
    .filter(trial => trial.id !== reference.id)
    .map((trial, index) => ({
      trial,
      result: calculateDeviationSimilarity(reference, trial),
      color: comparisonColor(index)
    }));
  const plottedComparisons = comparisons.filter(comparison => comparison.result);
  content.innerHTML = `
    <div class="deviation-trend-charts">
      <section class="deviation-axis-card">
        <div class="deviation-axis-heading"><div><p class="eyebrow">PITCH</p><h3>Up &amp; Down</h3></div><span>Angle · degrees</span></div>
        <div class="deviation-line-chart-wrap">${createTrendLineChart(reference, plottedComparisons, { key: 'pitch', label: 'Up and down' })}</div>
      </section>
      <section class="deviation-axis-card">
        <div class="deviation-axis-heading"><div><p class="eyebrow">ROLL</p><h3>Side to Side</h3></div><span>Angle · degrees</span></div>
        <div class="deviation-line-chart-wrap">${createTrendLineChart(reference, plottedComparisons, { key: 'roll', label: 'Side to side' })}</div>
      </section>
    </div>
    <p class="deviation-map-note">Lines show angle through each run, sampled at matching percentages of trial progress. The reference is highlighted; scores use the recorded orientation samples.</p>
    <ul class="deviation-trend-legend"></ul>
    ${comparisons.length
      ? ''
      : '<p class="deviation-trend-empty">Save another run to compare its movement path with this reference.</p>'}
  `;
  const legend = content.querySelector('.deviation-trend-legend');
  legend.appendChild(createLegendItem({ trial: reference, isReference: true }));
  comparisons.forEach(comparison => {
    legend.appendChild(createLegendItem({
      ...comparison,
    }));
  });
}
