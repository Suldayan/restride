import { initHome } from './screens/home.js';
import { initTrial, renderLatestTrial } from './screens/trial.js';
import { initStart } from './screens/start.js';
import { hydrateTrials } from './core/trials.js';

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `screen-${name}`);
  });
  document.querySelectorAll('.nav-item').forEach(button => {
    const isActive = button.dataset.screenLink === name;
    button.classList.toggle('active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('[data-screen-link]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.screenLink === 'trial') renderLatestTrial();
    showScreen(button.dataset.screenLink);
  });
});

let storageError = null;
try {
  await hydrateTrials();
} catch (error) {
  storageError = error;
}

initHome();
initTrial();
initStart();

if (storageError) {
  const banner = document.createElement('p');
  banner.className = 'storage-error-banner';
  banner.setAttribute('role', 'alert');
  banner.textContent = `Saved trials could not be loaded: ${storageError.message}`;
  document.querySelector('.app-main').prepend(banner);
}
