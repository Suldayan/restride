import { deleteTrial as deleteStoredTrial, listTrials, saveTrial, setReference } from './trialStorage.js';

const trials = [];

/**
 * @typedef {{ t: number, pitch: number, roll: number, yaw: number, accel: { x: number, y: number, z: number } }} TrialSample
 * @typedef {{ id: string, label: string, isReference: boolean, createdAt: string | number, samples: TrialSample[] }} Trial
 */

function createTrialId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `trial-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** @param {TrialSample} sample @param {number} index @returns {TrialSample} */
function validateSample(sample, index) {
  for (const field of ['t', 'pitch', 'roll', 'yaw']) {
    if (!Number.isFinite(sample[field])) {
      throw new TypeError(`Trial sample ${index} must have a numeric ${field}.`);
    }
  }
  if (!sample.accel || !['x', 'y', 'z'].every(axis => Number.isFinite(sample.accel[axis]))) {
    throw new TypeError(`Trial sample ${index} must have numeric accel x, y, and z values.`);
  }
  return {
    t: sample.t,
    pitch: sample.pitch,
    roll: sample.roll,
    yaw: sample.yaw,
    accel: { x: sample.accel.x, y: sample.accel.y, z: sample.accel.z }
  };
}

/**
 * @param {{ id?: string, label: string, isReference?: boolean, createdAt?: string | number, samples: TrialSample[] }} trial
 * @returns {Trial}
 */
export function createTrial({ id = createTrialId(), label, isReference = false, createdAt = new Date().toISOString(), samples }) {
  if (typeof label !== 'string' || !label.trim()) throw new TypeError('A trial must have a non-empty label.');
  if (typeof id !== 'string' || !id) throw new TypeError('A trial must have a non-empty id.');
  if (typeof isReference !== 'boolean') throw new TypeError('A trial isReference value must be a boolean.');
  if ((typeof createdAt !== 'string' && typeof createdAt !== 'number') ||
      Number.isNaN(typeof createdAt === 'number' ? createdAt : Date.parse(createdAt))) {
    throw new TypeError('A trial must have a valid createdAt date.');
  }
  if (!Array.isArray(samples)) throw new TypeError('A trial must have a samples array.');

  return {
    id,
    label: label.trim(),
    isReference,
    createdAt,
    samples: samples.map(validateSample)
  };
}

/** Loads saved trials from the storage used by main. */
export async function hydrateTrials() {
  const storedTrials = await listTrials();
  trials.splice(0, trials.length, ...storedTrials.map(trial => createTrial(trial)));
  trials.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return getTrials();
}

/** @param {Trial} trial @returns {Promise<Trial>} */
export async function addTrial(trial) {
  const normalizedTrial = createTrial(trial);
  await saveTrial(normalizedTrial);
  trials.unshift(normalizedTrial);
  return normalizedTrial;
}

export async function setTrialReference(id) {
  await setReference(id);
  for (const trial of trials) trial.isReference = trial.id === id;
  return getTrials();
}

export async function deleteTrial(id) {
  await deleteStoredTrial(id);
  const index = trials.findIndex(trial => trial.id === id);
  if (index !== -1) trials.splice(index, 1);
  return index !== -1;
}

/** @returns {Trial[]} */
export function getTrials() {
  return [...trials];
}

export function getTrialDurationSeconds(trial) {
  const firstSample = trial.samples[0];
  const lastSample = trial.samples.at(-1);
  return firstSample && lastSample ? Math.max(0, (lastSample.t - firstSample.t) / 1000) : 0;
}
