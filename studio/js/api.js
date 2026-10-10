// Talks to the local Dictate server.

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const type = res.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body?.error || body || `Request failed (${res.status})`);
  return body;
}

export const getJSON = (url) => request(url);
export const postJSON = (url, data = {}) =>
  request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

// One recording session: batches events, uploads frames and audio in order,
// and can drain everything before finishing.
export class SessionClient {
  constructor({ id, dir, startedAt }) {
    this.id = id;
    this.dir = dir;
    this.startedAt = startedAt;
    this.buffer = [];
    this.timer = null;
    this.audioSeq = 0;
    this.audioChain = Promise.resolve();
    this.pending = new Set();
    this.failed = 0;
  }

  static async create(data) {
    return new SessionClient(await postJSON('/api/sessions', data));
  }

  url(path) {
    return `/api/sessions/${this.id}${path}`;
  }

  event(type, data = {}) {
    const e = { type, t: Date.now(), ...data };
    this.buffer.push(e);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 500);
    return e;
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.buffer.length) return;
    const events = this.buffer;
    this.buffer = [];
    try {
      await postJSON(this.url('/events'), { src: 'studio', events });
    } catch {
      this.buffer = events.concat(this.buffer); // retry on the next flush
      this.failed += 1;
      this.timer = setTimeout(() => this.flush(), 1500);
    }
  }

  track(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise)).catch(() => {});
    return promise;
  }

  frame(dataUrl, meta) {
    return this.track(postJSON(this.url('/frames'), { src: 'studio', dataUrl, meta: { t: Date.now(), ...meta } }));
  }

  audio(blob) {
    const seq = this.audioSeq++;
    const upload = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await request(this.url(`/audio?seq=${seq}`), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
    };
    this.audioChain = this.audioChain.then(upload);
    return this.audioChain;
  }

  meta(patch) {
    return postJSON(this.url('/meta'), patch).catch(() => {});
  }

  async drain() {
    await this.flush();
    await this.audioChain;
    await Promise.allSettled([...this.pending]);
    await this.flush();
  }

  stream(onMessage) {
    const es = new EventSource(this.url('/stream'));
    es.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data));
      } catch {
        // ignore malformed
      }
    };
    return es;
  }

  finish(lang) {
    return postJSON(this.url('/finish'), { lang });
  }

  submit(edits) {
    return postJSON(this.url('/submit'), { edits });
  }

  openFolder() {
    return postJSON(this.url('/open'));
  }

  frameUrl(file) {
    return this.url(`/${file}`);
  }
}
