// will change to firestore eventually

const STORAGE_KEY = 'restride_trials';

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function writeAll(trials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trials));
}

/**
 * Saves a new trial:
 * { id, label, isReference, createdAt, samples: [{t, pitch, roll, yaw, accel}] }
 */
export async function saveTrial(trial) {
  const trials = readAll();
  trials.push(trial);
  writeAll(trials);
  return trial;
}

export async function listTrials() {
  return readAll();
}

export async function getTrial(id) {
  return readAll().find(t => t.id === id) ?? null;
}

/** Marks one trial as the reference, unmarking any previous reference. */
export async function setReference(id) {
  const trials = readAll().map(t => ({ ...t, isReference: t.id === id }));
  writeAll(trials);
}

export async function deleteTrial(id) {
  writeAll(readAll().filter(t => t.id !== id));
}