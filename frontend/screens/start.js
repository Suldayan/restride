// This is where calibration + live sensor capture + the run loop will go next.
export function initStart() {
  const controls = document.getElementById('start-controls');
  controls.innerHTML = '<p class="dim">Calibration and sensor capture go here.</p>';
}
