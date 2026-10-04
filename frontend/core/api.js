const API_BASE_URL = 'https://restride.onrender.com';

/**
 * Sends a saved trial to the backend for processing.
 * @param {{ samples: Array<{ t: number, pitch: number, roll: number, yaw: number, accel: { x: number, y: number, z: number } }> }} trial
 */
export async function processTrial(trial) {
  const samples = trial.samples.map(({ t, pitch, roll, yaw, accel }) => ({
    t,
    pitch,
    roll,
    yaw,
    accelMag: Math.sqrt(
      accel.x * accel.x +
      accel.y * accel.y +
      accel.z * accel.z
    )
  }));

  const response = await fetch(`${API_BASE_URL}/process-trial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples })
  });

  if (!response.ok) {
    throw new Error(`Trial processing failed with HTTP ${response.status}.`);
  }

  return response.json();
}
