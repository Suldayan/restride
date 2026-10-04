import { showScreen } from '../app.js';
import { listTrials, setReference } from '../core/trialStorage.js';
import { renderSavedTrial } from './trial.js';

export async function initHome() {
  await refreshList();
}

// Exported so other screens (e.g. after saving a new trial) can refresh this list
export async function refreshList() {
  const list = document.getElementById('trial-list');
  const trials = await listTrials();

  if (trials.length === 0) {
    list.innerHTML = '<p class="dim">No trials yet — record one to get started.</p>';
    return;
  }

  list.innerHTML = '';
  // Newest first
  trials.slice().reverse().forEach(trial => {
    const card = document.createElement('div');
    card.className = 'trial-card';
    card.innerHTML = `
      <div>${trial.isReference ? '⭐ ' : ''}${trial.label}</div>
      <div class="dim">${trial.samples.length} samples</div>
      <button class="ref-btn" data-id="${trial.id}">
        ${trial.isReference ? 'Reference' : 'Set as Reference'}
      </button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('ref-btn')) return; // handled separately below
      document.getElementById('trial-title').textContent = trial.label;
      renderSavedTrial(trial.samples);
      showScreen('trial');
    });

    card.querySelector('.ref-btn').addEventListener('click', async (e) => {
      e.stopPropagation(); 
      await setReference(trial.id);
      await refreshList(); 
    });

    list.appendChild(card);
  });
}