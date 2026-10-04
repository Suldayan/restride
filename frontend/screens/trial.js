import { lastTrialSamples } from './start.js';

let chartInstance = null;

export function initTrial() {
  // Nothing to draw at page load — a render call happens once there's
  // actual data, either from start.js (just recorded) or home.js (saved trial).
}

export function renderSavedTrial(samples) {
  const details = document.getElementById('trial-details');
  details.innerHTML = '<canvas id="trial-chart"></canvas>';

  if (chartInstance) {
    chartInstance.destroy(); 
  }

  const labels = samples.map(s => (s.t / 1000).toFixed(2));

  chartInstance = new Chart(document.getElementById('trial-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pitch', data: samples.map(s => s.pitch), borderColor: '#ff7a3d', pointRadius: 0 },
        { label: 'Roll', data: samples.map(s => s.roll), borderColor: '#4ade80', pointRadius: 0 },
        { label: 'Yaw', data: samples.map(s => s.yaw), borderColor: '#60a5fa', pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: { title: { display: true, text: 'Time (s)' } },
        y: { title: { display: true, text: 'Degrees' } }
      }
    }
  });
}

export function renderTrial() {
  renderSavedTrial(lastTrialSamples);
}