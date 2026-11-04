// `npx skills add` only copies the skill, so the first review sets up speech to text by itself.
// Setup runs in the background and live captions cover until it's done. It outlives the studio,
// because --once exits on Send and the download can take longer than a review.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, DATA_DIR } from './install.js';

const STATE_FILE = path.join(DATA_DIR, 'speech-setup.json');
const LOG_FILE = path.join(DATA_DIR, 'speech-setup.log');
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000; // a failed setup waits a day, or for `setup` by hand

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readSpeechSetup() {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
  if (state.status === 'running' && !alive(state.pid)) return { status: 'failed', detail: `Setup stopped before it finished; see ${LOG_FILE}.`, at: state.at };
  return state;
}

export function writeSpeechSetup(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function runSetup() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'setup.js'), '--speech-only'], { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.on('error', () => {});
  child.unref();
  fs.closeSync(out);
  return child;
}

export function startSpeechSetup({ log = () => {}, run = runSetup } = {}) {
  if (process.env.DICTATE_NO_WHISPER) return null;
  const last = readSpeechSetup();
  if (last?.status === 'running') return last;
  if (last?.status === 'failed' && Date.now() - last.at < RETRY_AFTER_MS) return last;
  const state = { status: 'running', pid: run().pid, at: Date.now() };
  writeSpeechSetup(state);
  log(`Setting up speech to text in the background (log: ${LOG_FILE})`);
  return state;
}
