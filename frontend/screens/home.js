import { showScreen } from '../app.js';

// This runs once when the page loads. Later this is where we'll
// read saved trials from Firestore and render one .trial-card per trial.
export function initHome() {
  const list = document.getElementById('trial-list');

  // Placeholder data for now — this is where real Firestore trials go later
  const placeholderTrials = [
    { id: '1', label: 'Coach Approved — 11.82s' }
  ];

  list.innerHTML = '';
  placeholderTrials.forEach(trial => {
    const card = document.createElement('div');
    card.className = 'trial-card';
    card.textContent = trial.label;
    card.addEventListener('click', () => {
      document.getElementById('trial-title').textContent = trial.label;
      showScreen('trial');
    });
    list.appendChild(card);
  });
}
