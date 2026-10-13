import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export const VAR = path.resolve('var');
export const RUNS_DIR = path.join(VAR, 'runs');
export const ARTIFACTS_DIR = path.join(VAR, 'artifacts');

fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

const runs = new Map();

export function newId() {
  return randomBytes(5).toString('hex');
}

export function createRun(input) {
  const id = newId();
  const run = {
    id,
    createdAt: Date.now(),
    endedAt: null,
    status: 'starting',
    outcomeNote: null,

    vendor: input.vendor,
    startUrl: input.startUrl,
    allowOrigins: input.allowOrigins,
    objective: input.objective,
    mandate: input.mandate,
    // Held in memory for the lifetime of the run only. Not a vault.
    secrets: input.secrets,

    killed: false,
    turns: [],
    events: [],
    pending: null,

    metrics: {
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      spend: 0,
      snapshotCharsRaw: [],
      snapshotCharsSent: [],
      peakRssBytes: null,
      snapshotModes: {},
      approvalsRequested: 0,
      approvalsGranted: 0,
      humanSeconds: 0,
    },

    bus: new EventEmitter(),
  };
  run.bus.setMaxListeners(50);
  runs.set(id, run);
  return run;
}

export function getRun(id) {
  return runs.get(id);
}

export function listRuns() {
  return [...runs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function emit(run, type, data = {}) {
  const ev = { t: Date.now(), type, ...data };
  run.events.push(ev);
  try {
    fs.appendFileSync(path.join(RUNS_DIR, `${run.id}.jsonl`), JSON.stringify(ev) + '\n');
  } catch {
    /* best effort */
  }
  run.bus.emit('update', ev);
  return ev;
}

export function saveArtifact(run, name, buf) {
  const file = `${run.id}-${name}`;
  fs.writeFileSync(path.join(ARTIFACTS_DIR, file), buf);
  return file;
}

export function artifactPath(file) {
  const resolved = path.resolve(ARTIFACTS_DIR, file);
  if (!resolved.startsWith(ARTIFACTS_DIR + path.sep)) return null;
  return resolved;
}