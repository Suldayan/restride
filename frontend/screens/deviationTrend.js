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

function createTrajectorySvg(reference, comparisons) {
  const plottedTrials = [reference, ...comparisons.map(comparison => comparison.trial)];
  let maxMagnitude = 0;
  plottedTrials.forEach(trial => trial.samples.forEach(sample => {
    maxMagnitude = Math.max(maxMagnitude, Math.abs(sample.roll), Math.abs(sample.pitch));
  }));
  const axisLimit = Math.min(180, Math.max(10, Math.ceil(maxMagnitude / 5) * 5));
  const width = 440;
  const height = 360;
  const centerX = 220;
  const centerY = 177;
  const radius = 148;
  const scale = radius / axisLimit;
  const x = value => centerX + value * scale;
  const y = value => centerY - value * scale;
  const gridStep = axisLimit <= 20 ? 5 : axisLimit <= 60 ? 10 : 30;

  function pathFor(trial) {
    const points = Array.from({ length: COMPARISON_SAMPLE_COUNT }, (_, index) => {
      const sample = sampleAtProgress(trial, index / (COMPARISON_SAMPLE_COUNT - 1));
      return { x: x(sample.roll), y: y(sample.pitch) };
    });
    const smoothedPoints = points.map((point, index) => {
      const window = points.slice(Math.max(0, index - 2), Math.min(points.length, index + 3));
      return {
        x: window.reduce((total, item) => total + item.x, 0) / window.length,
        y: window.reduce((total, item) => total + item.y, 0) / window.length
      };
    });
    smoothedPoints[0] = points[0];
    smoothedPoints[smoothedPoints.length - 1] = points.at(-1);
    return smoothedPoints.map((point, index) =>
      `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
    ).join(' ');
  }

  const rings = [];
  for (let value = gridStep; value <= axisLimit; value += gridStep) {
    const gridRadius = value * scale;
    rings.push(`<circle class="trajectory-ring${value === axisLimit ? ' outer-ring' : ''}" cx="${centerX}" cy="${centerY}" r="${gridRadius.toFixed(1)}"/>`);
    rings.push(`<text class="trajectory-ring-label" x="${centerX + 4}" y="${(centerY - gridRadius + 10).toFixed(1)}">${value}°</text>`);
  }

  const comparisonPaths = comparisons.map(({ trial, color }, index) => {
    const trialColor = color ?? comparisonColor(index);
    const start = sampleAtProgress(trial, 0);
    const end = sampleAtProgress(trial, 1);
    return `
      <path class="deviation-path comparison-path" d="${pathFor(trial)}" stroke="${trialColor}"/>
      <circle class="comparison-endpoint" cx="${x(start.roll)}" cy="${y(start.pitch)}" r="3" fill="${trialColor}"/>
      <circle class="comparison-endpoint" cx="${x(end.roll)}" cy="${y(end.pitch)}" r="3" fill="${trialColor}"/>
    `;
  }).join('');
  const referencePath = pathFor(reference);
  const firstReferencePoint = sampleAtProgress(reference, 0);
  const lastReferencePoint = sampleAtProgress(reference, 1);
  const firstX = x(firstReferencePoint.roll);
  const firstY = y(firstReferencePoint.pitch);
  const lastX = x(lastReferencePoint.roll);
  const lastY = y(lastReferencePoint.pitch);

  return `
    <svg class="deviation-trajectory" viewBox="0 0 ${width} ${height}" role="img" aria-label="Smoothed overlay of phone orientation movement paths around the calibrated zero position. The same angular scale is used horizontally and vertically.">
      <defs>
        <radialGradient id="trajectory-glow">
          <stop offset="0%" stop-color="#5b9cff" stop-opacity=".13"/>
          <stop offset="100%" stop-color="#5b9cff" stop-opacity="0"/>
        </radialGradient>
        <filter id="reference-soft-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5"/>
        </filter>
      </defs>
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="url(#trajectory-glow)"/>
      <g class="trajectory-grid">${rings.join('')}</g>
      <line class="trajectory-crosshair" x1="${centerX - radius}" y1="${centerY}" x2="${centerX + radius}" y2="${centerY}"/>
      <line class="trajectory-crosshair" x1="${centerX}" y1="${centerY - radius}" x2="${centerX}" y2="${centerY + radius}"/>
      <g class="trajectory-axis-labels">
        <text x="${centerX}" y="23" text-anchor="middle">FORWARD / BACK · PITCH</text>
        <text x="${centerX}" y="346" text-anchor="middle">SIDE-TO-SIDE · ROLL</text>
        <text x="${centerX + 7}" y="${centerY + 11}">ZERO</text>
      </g>
      ${comparisonPaths}
      <path class="reference-path reference-path-glow" d="${referencePath}" filter="url(#reference-soft-glow)"/>
      <path class="deviation-path reference-path" d="${referencePath}"/>
      <circle class="reference-start" cx="${firstX}" cy="${firstY}" r="5"/>
      <circle class="reference-end" cx="${lastX}" cy="${lastY}" r="5"/>
      <text class="trajectory-point-label" x="${firstX + 8}" y="${firstY - 8}">START</text>
      <text class="trajectory-point-label" x="${lastX + 8}" y="${lastY - 8}">FINISH</text>
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
    <div class="deviation-trajectory-flow"><strong>Movement map</strong><span>·</span><span>start → finish</span></div>
    <div class="deviation-trajectory-wrap">${createTrajectorySvg(reference, plottedComparisons)}</div>
    <p class="deviation-map-note">Each path follows a run from start to finish. Rings show angle from calibrated zero; equal scales preserve movement shape. Paths are lightly smoothed for display; scores use recorded samples.</p>
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
