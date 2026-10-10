import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SessionStore } from './store.js';
import { Transcriber } from './transcriber.js';
import { compileSession, applyEdits, renderReport } from './compile.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_DIR = path.join(ROOT, 'studio');
export const EXTENSION_DIR = path.join(ROOT, 'extension');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
// Chrome plays H.264 .mov/.mkv happily when told it's MP4/WebM.
const VIDEO_MIME = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/webm', '.ogv': 'video/ogg' };

const LIMITS = { json: 5 * 1024 * 1024, frame: 25 * 1024 * 1024, audio: 16 * 1024 * 1024 };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req, limit = LIMITS.json) {
  const type = req.headers['content-type'] || '';
  if (!type.includes('application/json')) throw Object.assign(new Error('Expected application/json'), { status: 415 });
  const buf = await readBody(req, limit);
  try {
    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function openInExplorer(target) {
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [target], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
}

export async function startServer(opts) {
  const {
    port = 4747,
    outDir,
    once = false,
    project = null,
    log = (m) => console.log(`[dictate] ${m}`),
    onSubmit = () => {},
    onAbandon = () => {},
  } = opts;

  const store = new SessionStore(outDir);
  const transcriber = new Transcriber({ script: path.join(ROOT, 'server', 'whisper_worker.py'), log });
  setImmediate(() => transcriber.probe());

  const state = {
    video: opts.video ? { path: path.resolve(opts.video) } : null,
    mode: opts.mode || (opts.video ? 'video' : opts.url ? 'web' : null),
    url: opts.url || null,
    lang: opts.lang || null,
    title: opts.title || null,
  };
  if (state.video && !fs.existsSync(state.video.path)) {
    log(`Video not found: ${state.video.path}`);
    state.video = null;
  }

  const streams = new Map(); // sessionId -> Set(res)
  const presence = new Set(); // open studio windows
  let abandonTimer = null;

  function broadcast(sessionId, payload) {
    const set = streams.get(sessionId);
    if (!set) return;
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) res.write(line);
  }

  function status(session, phase, message) {
    broadcast(session.id, { kind: 'status', phase, message });
  }

  // ---------- finishing ----------

  async function finish(session, { language } = {}) {
    if (session.preview) return session.preview;
    if (session.finishing) return session.finishing;
    session.finishing = (async () => {
      session.state = 'finishing';
      await session.queue; // all audio chunks and frames are on disk
      const stop = [...session.events].reverse().find((e) => e.type === 'rec.stop');
      session.meta.endedAt = stop?.t ?? Date.now();
      session.meta.audioBytes = session.audioBytes;

      let transcript = null;
      const audioPath = path.join(session.dir, 'audio.webm');
      if (session.audioBytes > 2000 && transcriber.status !== 'unavailable') {
        const durationSec = (session.meta.endedAt - session.meta.startedAt) / 1000;
        status(session, 'transcribing', transcriber.status === 'ready' ? 'Transcribing your voice' : 'Loading the speech model');
        try {
          const lang = language && language !== 'auto' ? language.split('-')[0] : null;
          transcript = await transcriber.transcribe(audioPath, { language: lang, durationSec });
          await fsp.writeFile(path.join(session.dir, 'transcript.json'), JSON.stringify(transcript, null, 2));
          session.meta.transcript = { engine: 'whisper', model: transcript.model, device: transcript.device, language: transcript.language };
        } catch (err) {
          log(`Whisper failed, using live captions: ${err.message}`);
          session.meta.transcript = { engine: 'live', error: err.message };
        }
      } else {
        session.meta.transcript = { engine: 'live', error: transcriber.status === 'unavailable' ? transcriber.detail : null };
      }

      status(session, 'compiling', 'Lining notes up with your cursor');
      const compiled = compileSession({ meta: session.meta, events: session.events, transcript });
      session.preview = compiled;
      session.state = 'review';
      await store.writeMeta(session);
      await fsp.writeFile(path.join(session.dir, 'preview.json'), JSON.stringify(compiled, null, 2));
      return compiled;
    })();
    try {
      return await session.finishing;
    } finally {
      session.finishing = null;
    }
  }

  async function submit(session, edits = {}, { draft = false } = {}) {
    const compiled = applyEdits(await finish(session, { language: session.meta.lang }), edits);
    if (edits.title) session.meta.title = String(edits.title).slice(0, 120);
    session.meta.noteCount = compiled.notes.length;
    session.meta.submittedAt = Date.now();
    if (draft) session.meta.draft = true;
    const report = renderReport({ meta: session.meta, compiled });
    const reportPath = path.join(session.dir, 'report.md');
    await fsp.writeFile(reportPath, report);
    await fsp.writeFile(
      path.join(session.dir, 'session.json'),
      JSON.stringify({ meta: session.meta, ...compiled }, null, 2),
    );
    await fsp.rm(path.join(session.dir, 'preview.json'), { force: true });
    await store.writeMeta(session);
    await store.closeLog(session);
    session.state = 'submitted';
    return { dir: session.dir, reportPath, report, noteCount: compiled.notes.length };
  }

  // In --once mode, never leave the caller hanging: if every studio window closes,
  // save whatever was recorded and exit.
  function schedulePresenceCheck() {
    if (!once) return;
    clearTimeout(abandonTimer);
    if (presence.size) return;
    abandonTimer = setTimeout(async () => {
      if (presence.size) return;
      const active = [...store.sessions.values()].find((s) => s.state !== 'submitted' && s.events.length);
      if (active) {
        try {
          const result = await submit(active, {}, { draft: true });
          onAbandon(result);
          return;
        } catch (err) {
          log(`Could not save the unfinished session: ${err.message}`);
        }
      }
      onAbandon(null);
    }, 3 * 60 * 1000);
  }

  // ---------- routing ----------

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin;

    // Only the studio itself and the Dictate extension may talk to this server.
    const host = `${req.headers.host || ''}`;
    const sameOrigin = origin === `http://${host}` || origin === `http://localhost:${server.address()?.port}` || origin === `http://127.0.0.1:${server.address()?.port}`;
    const fromExtension = origin?.startsWith('chrome-extension://') || origin?.startsWith('extension://');
    if (origin && !sameOrigin && !fromExtension) return send(res, 403, { error: 'Origin not allowed' });
    if (fromExtension) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', 'content-type');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS') return send(res, 204, '');

    try {
      await route(req, res, url);
    } catch (err) {
      const code = err.status || 500;
      if (code >= 500) log(`Error on ${req.method} ${url.pathname}: ${err.stack || err.message}`);
      if (!res.headersSent) send(res, code, { error: err.message });
      else res.end();
    }
  });

  async function route(req, res, url) {
    const p = url.pathname;
    const m = (re) => re.exec(p);
    let match;

    // ---- api ----
    if (p === '/api/config' && req.method === 'GET') {
      return send(res, 200, {
        version: VERSION,
        once,
        project,
        outDir,
        extensionDir: EXTENSION_DIR,
        mode: state.mode,
        url: state.url,
        lang: state.lang,
        title: state.title,
        video: state.video ? { name: path.basename(state.video.path), path: state.video.path, url: '/media/video', size: fs.statSync(state.video.path).size } : null,
        whisper: transcriber.info(),
      });
    }

    if (p === '/api/presence' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hi\n\n');
      presence.add(res);
      clearTimeout(abandonTimer);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => {
        clearInterval(ping);
        presence.delete(res);
        schedulePresenceCheck();
      });
      return;
    }

    if (p === '/api/media/path' && req.method === 'POST') {
      const body = await readJson(req);
      const file = path.resolve(String(body.path || '').trim().replace(/^"|"$/g, ''));
      const ext = path.extname(file).toLowerCase();
      if (!VIDEO_MIME[ext]) return send(res, 400, { error: `Not a supported video type (${ext || 'no extension'})` });
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: 'File not found' });
      state.video = { path: file };
      return send(res, 200, { name: path.basename(file), path: file, url: `/media/video?v=${Date.now()}`, size: fs.statSync(file).size });
    }

    if (p === '/api/sessions' && req.method === 'GET') {
      return send(res, 200, { sessions: await store.list() });
    }

    if (p === '/api/sessions' && req.method === 'POST') {
      const body = await readJson(req);
      if (!['video', 'web'].includes(body.mode)) return send(res, 400, { error: 'mode must be video or web' });
      const video = body.video ? { ...body.video } : null;
      if (video && state.video && video.fromPath) video.path = state.video.path;
      delete video?.fromPath;
      const session = await store.create({ mode: body.mode, lang: body.lang, title: body.title, project, video, startUrl: body.startUrl, version: VERSION });
      transcriber.warm(); // load the model while the user talks
      log(`Recording ${session.id}`);
      return send(res, 200, { id: session.id, dir: session.dir, startedAt: session.meta.startedAt });
    }

    if ((match = m(/^\/api\/sessions\/([\w-]+)\/(.+)$/))) {
      const session = store.get(match[1]);
      if (!session) return send(res, 404, { error: 'Unknown or expired session' });
      const action = match[2];

      if (action === 'events' && req.method === 'POST') {
        const body = await readJson(req);
        if (session.state === 'submitted') return send(res, 409, { error: 'Session already submitted' });
        const src = body.src === 'ext' ? 'ext' : 'studio';
        const accepted = store.addEvents(session, body.events, src);
        if (src === 'ext' && accepted.length) broadcast(session.id, { kind: 'events', events: accepted });
        return send(res, 200, { ok: true, accepted: accepted.length });
      }

      if (action === 'meta' && req.method === 'POST') {
        const body = await readJson(req);
        if (body.video) session.meta.video = { ...session.meta.video, ...body.video, path: session.meta.video?.path ?? body.video.path ?? null };
        if (body.title != null) session.meta.title = String(body.title).slice(0, 120) || null;
        if (body.lang) session.meta.lang = body.lang;
        await store.writeMeta(session);
        return send(res, 200, { ok: true });
      }

      if (action === 'frames' && req.method === 'POST') {
        const body = await readJson(req, LIMITS.frame);
        const src = body.src === 'ext' ? 'ext' : 'studio';
        const ev = await store.addFrame(session, { dataUrl: body.dataUrl, meta: body.meta, src });
        broadcast(session.id, { kind: 'frame', frame: ev });
        return send(res, 200, { file: ev.file });
      }

      if (action === 'audio' && req.method === 'POST') {
        const buf = await readBody(req, LIMITS.audio);
        const seq = Number.parseInt(url.searchParams.get('seq') ?? '', 10);
        await store.appendAudio(session, buf, Number.isNaN(seq) ? undefined : seq);
        return send(res, 200, { ok: true, bytes: session.audioBytes });
      }

      if (action === 'stream' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': hi\n\n');
        if (!streams.has(session.id)) streams.set(session.id, new Set());
        streams.get(session.id).add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 15000);
        req.on('close', () => {
          clearInterval(ping);
          streams.get(session.id)?.delete(res);
        });
        return;
      }

      if (action === 'finish' && req.method === 'POST') {
        const body = await readJson(req);
        if (body.lang) session.meta.lang = body.lang;
        const compiled = await finish(session, { language: session.meta.lang });
        return send(res, 200, { ...compiled, meta: session.meta });
      }

      if (action === 'submit' && req.method === 'POST') {
        const body = await readJson(req);
        if (session.state === 'submitted') return send(res, 409, { error: 'Already submitted' });
        const result = await submit(session, body.edits || {});
        log(`Submitted ${session.id} (${result.noteCount} notes)`);
        send(res, 200, { dir: result.dir, reportPath: result.reportPath, report: result.report, once });
        setTimeout(() => onSubmit(result), 250);
        return;
      }

      if (action === 'open' && req.method === 'POST') {
        openInExplorer(session.dir);
        return send(res, 200, { ok: true });
      }

      if ((match = /^frames\/([\w.-]+)$/.exec(action)) && req.method === 'GET') {
        const file = path.join(session.dir, 'frames', match[1]);
        if (!fs.existsSync(file)) return send(res, 404, 'Not found');
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'max-age=3600' });
        return fs.createReadStream(file).pipe(res);
      }

      return send(res, 404, { error: 'Unknown action' });
    }

    if (p === '/api/open-path' && req.method === 'POST') {
      const body = await readJson(req);
      const target = body.target === 'extension' ? EXTENSION_DIR : body.target === 'out' ? outDir : null;
      if (!target) return send(res, 400, { error: 'Unknown target' });
      await fsp.mkdir(target, { recursive: true });
      openInExplorer(target);
      return send(res, 200, { ok: true });
    }

    if (p === '/api/cancel' && req.method === 'POST') {
      send(res, 200, { ok: true });
      setTimeout(() => onAbandon(null, { cancelled: true }), 200);
      return;
    }

    // ---- media ----
    if (p === '/media/video' && req.method === 'GET') {
      if (!state.video) return send(res, 404, 'No video');
      return streamFile(req, res, state.video.path, VIDEO_MIME[path.extname(state.video.path).toLowerCase()] || 'video/mp4');
    }

    // ---- studio static ----
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
    const file = path.resolve(STUDIO_DIR, rel);
    if (!file.startsWith(STUDIO_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  function streamFile(req, res, file, type) {
    const { size } = fs.statSync(file);
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : size - Number(range[2]);
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start < 0) {
        res.writeHead(416, { 'content-range': `bytes */${size}` });
        return res.end();
      }
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }

  // ---------- listen ----------

  const actualPort = await new Promise((resolve, reject) => {
    let attempt = port;
    const tryListen = () => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < port + 20) {
          attempt += 1;
          tryListen();
        } else reject(err);
      });
      server.listen(attempt, '127.0.0.1', () => resolve(attempt));
    };
    tryListen();
  });

  return {
    url: `http://localhost:${actualPort}`,
    port: actualPort,
    close() {
      transcriber.stop();
      for (const set of streams.values()) for (const r of set) r.end();
      for (const r of presence) r.end();
      server.close();
    },
  };
}
