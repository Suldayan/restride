import { initHome } from './screens/home.js';
import { initTrial } from './screens/trial.js';
import { initStart } from './screens/start.js';

// This is the entire "navigation system." No router library, no URLs to manage.
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// Wire up the back buttons here since they're the same on every screen
document.getElementById('trial-back-btn').addEventListener('click', () => showScreen('home'));
document.getElementById('start-back-btn').addEventListener('click', () => showScreen('home'));
document.getElementById('new-trial-btn').addEventListener('click', () => showScreen('start'));

// Each screen's own file handles its own setup logic (populating lists,
// attaching its own buttons, etc.) — app.js just kicks that off once.
initHome();
initTrial();
initStart();
