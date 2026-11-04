import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dictate-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
delete process.env.DICTATE_NO_WHISPER;
const { readSpeechSetup, startSpeechSetup, writeSpeechSetup } = await import('../server/speech-setup.js');

const HOUR = 60 * 60 * 1000;
const DEAD_PID = 2 ** 30;

function starts(state) {
  if (state) writeSpeechSetup(state);
  else fs.rmSync(path.join(home, '.dictate'), { recursive: true, force: true });
  let runs = 0;
  const result = startSpeechSetup({
    run: () => {
      runs += 1;
      return { pid: process.pid };
    },
  });
  return { runs, result };
}

test('the first review starts setup', () => {
  const { runs, result } = starts(null);
  assert.equal(runs, 1);
  assert.equal(result.status, 'running');
  assert.equal(readSpeechSetup().status, 'running');
});

test('a setup already running is not started twice', () => {
  const { runs, result } = starts({ status: 'running', pid: process.pid, at: Date.now() });
  assert.equal(runs, 0);
  assert.equal(result.status, 'running');
});

test('a setup whose process died reads as failed and waits a day', () => {
  const { runs, result } = starts({ status: 'running', pid: DEAD_PID, at: Date.now() });
  assert.equal(runs, 0);
  assert.equal(result.status, 'failed');
  assert.match(result.detail, /speech-setup\.log/);
});

test('a recent failure waits, an old one retries', () => {
  assert.equal(starts({ status: 'failed', detail: 'Install Python.', at: Date.now() - HOUR }).runs, 0);
  assert.equal(starts({ status: 'failed', detail: 'Install Python.', at: Date.now() - 25 * HOUR }).runs, 1);
});

test('finished setup with Whisper missing again starts over', () => {
  assert.equal(starts({ status: 'done', at: Date.now() }).runs, 1);
});

test('DICTATE_NO_WHISPER turns it off', () => {
  process.env.DICTATE_NO_WHISPER = '1';
  try {
    const { runs, result } = starts(null);
    assert.equal(runs, 0);
    assert.equal(result, null);
  } finally {
    delete process.env.DICTATE_NO_WHISPER;
  }
});
