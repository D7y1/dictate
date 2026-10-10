import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MAX_EVENTS_PER_BATCH = 5000;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export class SessionStore {
  constructor(outDir) {
    this.outDir = outDir;
    this.sessions = new Map();
  }

  async ensureOutDir() {
    await fsp.mkdir(this.outDir, { recursive: true });
    // Keep recordings out of the host project's git history without touching its .gitignore.
    const ignore = path.join(this.outDir, '.gitignore');
    if (!fs.existsSync(ignore)) await fsp.writeFile(ignore, '# Dictate sessions are local recordings\n*\n');
  }

  async create({ mode, lang, title, project, video, startUrl, version }) {
    await this.ensureOutDir();
    let id = `${stamp()}-${mode}`;
    for (let i = 2; fs.existsSync(path.join(this.outDir, id)); i++) id = `${stamp()}-${mode}-${i}`;
    const dir = path.join(this.outDir, id);
    await fsp.mkdir(path.join(dir, 'frames'), { recursive: true });

    const meta = {
      id,
      version,
      mode,
      lang: lang || null,
      title: title || null,
      project: project || null,
      startedAt: Date.now(),
      endedAt: null,
      video: video || null,
      startUrl: startUrl || null,
    };
    const session = {
      id,
      dir,
      meta,
      events: [],
      frameCount: 0,
      audioBytes: 0,
      audioSeq: -1,
      state: 'recording',
      preview: null,
      queue: Promise.resolve(),
      eventLog: fs.createWriteStream(path.join(dir, 'events.jsonl'), { flags: 'a' }),
    };
    this.sessions.set(id, session);
    await this.writeMeta(session);
    return session;
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  // Serializes disk writes per session so audio chunks and frames land in order.
  enqueue(session, fn) {
    const run = session.queue.then(fn, fn);
    session.queue = run.catch(() => {});
    return run;
  }

  async writeMeta(session) {
    await fsp.writeFile(path.join(session.dir, 'meta.json'), JSON.stringify(session.meta, null, 2));
  }

  addEvents(session, events, src) {
    if (!Array.isArray(events)) return [];
    const accepted = [];
    for (const e of events.slice(0, MAX_EVENTS_PER_BATCH)) {
      if (!e || typeof e.type !== 'string' || typeof e.t !== 'number') continue;
      const ev = { ...e, src: e.src || src };
      session.events.push(ev);
      session.eventLog.write(`${JSON.stringify(ev)}\n`);
      accepted.push(ev);
    }
    return accepted;
  }

  async addFrame(session, { dataUrl, meta = {}, src }) {
    const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/s.exec(dataUrl || '');
    if (!match) throw new Error('Expected a base64 image data URL');
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const reason = String(meta.reason || 'frame').replace(/[^a-z0-9-]/gi, '').slice(0, 16) || 'frame';
    return this.enqueue(session, async () => {
      const n = ++session.frameCount;
      const file = `frames/${String(n).padStart(4, '0')}-${reason}.${ext}`;
      await fsp.writeFile(path.join(session.dir, file), Buffer.from(match[2], 'base64'));
      const ev = { ...meta, type: 'frame', t: typeof meta.t === 'number' ? meta.t : Date.now(), src, file, reason };
      this.addEvents(session, [ev], src);
      return ev;
    });
  }

  async appendAudio(session, buf, seq) {
    return this.enqueue(session, async () => {
      if (Number.isInteger(seq) && seq <= session.audioSeq) return; // duplicate retry
      await fsp.appendFile(path.join(session.dir, 'audio.webm'), buf);
      session.audioBytes += buf.length;
      if (Number.isInteger(seq)) session.audioSeq = seq;
    });
  }

  async closeLog(session) {
    await new Promise((resolve) => session.eventLog.end(resolve));
  }

  async list(limit = 12) {
    let names = [];
    try {
      names = await fsp.readdir(this.outDir);
    } catch {
      return [];
    }
    const rows = [];
    for (const name of names.sort().reverse()) {
      if (rows.length >= limit) break;
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(this.outDir, name, 'meta.json'), 'utf8'));
        const hasReport = fs.existsSync(path.join(this.outDir, name, 'report.md'));
        rows.push({
          id: meta.id,
          mode: meta.mode,
          title: meta.title || meta.video?.name || meta.startUrl || null,
          startedAt: meta.startedAt,
          endedAt: meta.endedAt,
          notes: meta.noteCount ?? null,
          submitted: hasReport && !meta.draft,
          draft: !!meta.draft,
          dir: path.join(this.outDir, name),
        });
      } catch {
        // not a session folder
      }
    }
    return rows;
  }
}
