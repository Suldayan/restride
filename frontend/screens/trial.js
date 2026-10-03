import { lastTrialSamples } from './start.js';

let chartInstance = null;

export function initTrial() {
  // Nothing to draw at page load — renderTrial() is called once a
  // recording actually exists, from start.js's "View Chart" button.
}

export function renderTrial() {
  const details = document.getElementById('trial-details');
  details.innerHTML = '<canvas id="trial-chart"></canvas>';

  if (chartInstance) {
    chartInstance.destroy(); 
  }

  const labels = lastTrialSamples.map(s => (s.t / 1000).toFixed(2));

  chartInstance = new Chart(document.getElementById('trial-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pitch', data: lastTrialSamples.map(s => s.pitch), borderColor: '#ff7a3d', pointRadius: 0 },
        { label: 'Roll', data: lastTrialSamples.map(s => s.roll), borderColor: '#4ade80', pointRadius: 0 },
        { label: 'Yaw', data: lastTrialSamples.map(s => s.yaw), borderColor: '#60a5fa', pointRadius: 0 }
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