import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';

const IDLE_SHUTDOWN_MS = 10 * 60 * 1000; // release GPU memory when nobody is recording

// Owns the Python faster-whisper worker: finds Python, warms the model while the user
// records, and answers transcription requests.
export class Transcriber {
  constructor({ script, log = () => {} }) {
    this.script = script;
    this.log = log;
    this.python = null;
    this.status = 'unknown'; // unknown | unavailable | available | starting | ready | error
    this.detail = null;
    this.proc = null;
    this.ready = null;
    this.pending = new Map();
    this.nextId = 1;
    this.idleTimer = null;
  }

  probe() {
    if (process.env.DICTATE_NO_WHISPER) {
      this.status = 'unavailable';
      this.detail = 'Disabled with DICTATE_NO_WHISPER';
      return false;
    }
    const candidates = process.platform === 'win32' ? [['python'], ['py', '-3'], ['python3']] : [['python3'], ['python']];
    for (const [cmd, ...pre] of candidates) {
      const r = spawnSync(cmd, [...pre, '-c', 'import faster_whisper'], { timeout: 20000, windowsHide: true });
      if (r.status === 0) {
        this.python = [cmd, ...pre];
        this.status = 'available';
        return true;
      }
    }
    this.status = 'unavailable';
    this.detail = 'Python with faster-whisper was not found (pip install faster-whisper)';
    return false;
  }

  info() {
    return { status: this.status, detail: this.detail, model: this.model || null, device: this.device || null };
  }

  warm() {
    if (this.status === 'unknown') this.probe();
    if (!this.python || this.proc) return this.ready;
    this.status = 'starting';
    const [cmd, ...pre] = this.python;
    const proc = spawn(cmd, [...pre, '-u', this.script], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONWARNINGS: 'ignore' },
      windowsHide: true,
    });
    this.proc = proc;
    const stderrTail = [];
    proc.stderr.on('data', (d) => {
      stderrTail.push(String(d));
      if (stderrTail.length > 20) stderrTail.shift();
    });

    this.ready = new Promise((resolve, reject) => {
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.event === 'ready') {
          this.status = 'ready';
          this.model = msg.model;
          this.device = msg.device;
          this.log(`Whisper ready (${msg.model} on ${msg.device})`);
          resolve(msg);
        } else if (msg.event === 'error') {
          this.status = 'error';
          this.detail = msg.error;
          reject(new Error(msg.error));
        } else if (msg.event === 'fallback') {
          this.log(`Whisper fell back to CPU: ${msg.reason}`);
          this.device = 'cpu';
        } else if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve: done, reject: fail, timer } = this.pending.get(msg.id);
          clearTimeout(timer);
          this.pending.delete(msg.id);
          if (msg.ok) {
            if (msg.model) this.model = msg.model;
            if (msg.device) this.device = msg.device;
            done(msg);
          } else fail(new Error(msg.error || 'Transcription failed'));
        }
      });
      proc.on('exit', (code) => {
        const why = new Error(`Whisper worker exited (${code}). ${stderrTail.join('').slice(-400)}`);
        if (this.status !== 'ready') {
          this.status = 'error';
          this.detail = why.message;
        } else {
          this.status = 'available';
        }
        this.proc = null;
        this.ready = null;
        reject(why);
        for (const { reject: fail, timer } of this.pending.values()) {
          clearTimeout(timer);
          fail(why);
        }
        this.pending.clear();
      });
    });
    this.ready.catch(() => {});
    this.touch();
    return this.ready;
  }

  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.pending.size) this.stop();
    }, IDLE_SHUTDOWN_MS);
    this.idleTimer.unref?.();
  }

  async transcribe(audioPath, { language = null, durationSec = 600 } = {}) {
    if (this.status === 'unknown') this.probe();
    if (!this.python) throw new Error(this.detail || 'Whisper unavailable');
    await this.warm();
    this.touch();
    const id = this.nextId++;
    const timeoutMs = Math.max(120000, durationSec * 3000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Transcription timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ id, audio: audioPath, language })}\n`);
    });
  }

  stop() {
    clearTimeout(this.idleTimer);
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = null;
    }
    if (this.status === 'ready' || this.status === 'starting') this.status = 'available';
  }
}
