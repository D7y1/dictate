// Web review: browse your platform while talking; the extension does the tracking.
import { $, h, clock, pathOf, hostOf, dirOf, toast, prefs, savePref, revealInList } from './util.js';

const PANEL_WIDTH = 460;

export class WebReview {
  constructor({ root, recorder, ext, config }) {
    this.root = root;
    this.rec = recorder;
    this.ext = ext;
    this.config = config;
    this.log = $('#web-log', root);
    this.urlInput = $('#web-url', root);
    this.lastCapture = 0;
    this.stream = null;
    this.pages = new Set();
    this.markCount = 0;
    this.urlInput.value = config.url || prefs('lastUrl', '');
    this.bind();
    this.renderExt();
    this.renderLogEmpty();
  }

  bind() {
    $('#web-open', this.root).addEventListener('click', () => this.openSite());
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.openSite();
    });
    $('#ext-folder', this.root)?.addEventListener('click', () => fetch('/api/open-path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"target":"extension"}' }));
    $('#ext-copy', this.root)?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(this.config.extensionDir);
      toast('Folder path copied.');
    });
    $('#ext-recheck', this.root)?.addEventListener('click', () => {
      this.ext.recheck();
      setTimeout(() => {
        this.renderExt();
        if (!this.ext.connected) toast('Still not connected. Reload this window after loading the extension.', 'error');
      }, 800);
    });
    this.ext.addEventListener('change', () => this.renderExt());
  }

  renderExt() {
    this.root.classList.toggle('ext-missing', !this.ext.connected);
    $('#ext-path', this.root).textContent = this.config.extensionDir;
  }

  normalizedUrl() {
    let url = this.urlInput.value.trim();
    if (!url) return null;
    if (!/^[a-z]+:\/\//i.test(url)) url = /^(localhost|127\.|\d+\.\d+\.\d+\.\d+)/.test(url) ? `http://${url}` : `https://${url}`;
    return url;
  }

  // Studio docks to the right edge; the site opens in a window filling the rest.
  // Opening the site starts the session, so the first T on the site already works.
  async openSite() {
    const url = this.normalizedUrl();
    if (!url) {
      this.urlInput.focus();
      return;
    }
    savePref('lastUrl', url);
    if (!this.rec.active && this.onNeedSession) await this.onNeedSession();
    this.dock();
    const s = window.screen;
    const bounds = { left: s.availLeft ?? 0, top: s.availTop ?? 0, width: Math.max(800, s.availWidth - PANEL_WIDTH), height: s.availHeight };
    if (this.ext.connected) {
      try {
        await this.ext.call('open', { url, ...bounds });
        return;
      } catch {
        // fall through
      }
    }
    window.open(url, '_blank', `popup=no,left=${bounds.left},top=${bounds.top},width=${bounds.width},height=${bounds.height}`);
  }

  dock() {
    try {
      const s = window.screen;
      window.resizeTo(PANEL_WIDTH, s.availHeight);
      window.moveTo((s.availLeft ?? 0) + s.availWidth - PANEL_WIDTH, s.availTop ?? 0);
    } catch {
      // not allowed in a normal tab; harmless
    }
  }

  // ---------- recording hooks ----------

  async onRecordingStart(session) {
    this.log.replaceChildren();
    this.pages.clear();
    this.markCount = 0;
    this.renderLogEmpty();
    this.updateCounts();
    if (!this.ext.connected) {
      toast('Recording your voice only. Load the extension to track pages and clicks.', 'error');
      return;
    }
    try {
      await this.ext.call('start', { sessionId: session.id, server: location.origin, startedAt: session.startedAt, bindings: this.extBindings });
    } catch (err) {
      toast(`The extension didn't start: ${err.message}`, 'error');
    }
    this.stream = session.stream((msg) => this.onServer(msg));
  }

  onRecordingPause() {
    if (this.ext.connected) this.ext.call('pause').catch(() => {});
  }

  onRecordingResume() {
    if (this.ext.connected) this.ext.call('resume').catch(() => {});
  }

  async onRecordingStop() {
    if (this.ext.connected) await this.ext.call('stop').catch(() => {});
    this.stream?.close();
    this.stream = null;
  }

  // T pressed (here or on the site): the extension pins what was under the cursor.
  async onNoteOpen(noteId, anchor) {
    this.lastCapture = Date.now();
    if (!this.ext.connected) return;
    await this.ext.call('note-open', { noteId, anchor: anchor ? { ...anchor, type: undefined, phase: undefined } : null }).catch(() => {});
  }

  onNoteClose() {
    if (this.ext.connected) this.ext.call('note-close').catch(() => {});
  }

  logNote(noteId, anchor) {
    const el = anchor?.el;
    const where = el ? `${el.tag}${el.text ? ` “${el.text.slice(0, 40)}”` : ''}` : '';
    const row = this.row({ kind: 'note', tag: 'VO', text: '', id: noteId });
    if (where) row.querySelector('.log-text').dataset.where = where;
    return row;
  }

  onSpeechStart() {
    const now = Date.now();
    if (!this.ext.connected || now - this.lastCapture < 2500) return;
    this.lastCapture = now;
    this.ext.call('capture', { reason: 'speech', t: now }).catch(() => {});
  }

  onServer(msg) {
    if (msg.kind === 'events') {
      for (const e of msg.events) {
        if (e.type === 'page.visit') this.onVisit(e);
        else if (e.type === 'page.mark') this.onMark(e);
        else if (e.type === 'page.hover' && e.el) this.setPointer(e.el);
      }
    } else if (msg.kind === 'frame') {
      const img = $('#web-shot', this.root);
      img.src = this.rec.session.frameUrl(msg.frame.file);
      img.hidden = false;
    }
  }

  onVisit(e) {
    this.pages.add(e.url);
    $('#web-now-title', this.root).textContent = e.title || pathOf(e.url);
    $('#web-now-url', this.root).textContent = `${hostOf(e.url)}${pathOf(e.url)}`;
    this.root.classList.add('has-page');
    const last = this.log.lastElementChild;
    if (last?.dataset.url === e.url && last.classList.contains('log-page')) return;
    this.row({ kind: 'page', tag: 'PAGE', tagClass: 'tag-page', text: pathOf(e.url), url: e.url });
    this.updateCounts();
  }

  onMark(e) {
    this.markCount += 1;
    const el = e.el;
    const what = el ? `${el.tag}${el.cls?.length ? `.${el.cls.slice(0, 2).join('.')}` : ''}${el.text ? ` "${el.text.slice(0, 60)}"` : ''}` : 'area';
    // Pins made for a talk note are shown on the note's row.
    if (e.note && this.root.querySelector(`[data-id="${e.note}"]`)) {
      const text = this.root.querySelector(`[data-id="${e.note}"] .log-text`);
      text.dataset.where = what;
      this.root.querySelector(`[data-id="${e.note}"] .tag`).textContent = `${e.kind === 'box' ? 'B' : 'P'}${e.n}`;
      this.root.querySelector(`[data-id="${e.note}"] .tag`).classList.add('tag-mark');
      this.updateCounts();
      return;
    }
    this.row({ kind: 'mark', tag: `${e.kind === 'box' ? 'B' : 'P'}${e.n}`, tagClass: 'tag-mark', text: what });
    this.updateCounts();
  }

  setPointer(el) {
    const name = el.text || el.label || '';
    $('#web-pointer', this.root).textContent = `${el.tag}${el.cls?.length ? `.${el.cls[0]}` : ''}${name ? ` · ${name.slice(0, 48)}` : ''}`;
  }

  logSpeech({ id, text }) {
    return this.row({ kind: 'speech', tag: 'VO', text, id });
  }

  renderLogEmpty() {
    if (this.log.children.length) return;
    this.log.append(
      h('li', { class: 'log-empty' },
        h('p', {}, 'Pages you visit, things you pin and what you say land here, in order.'),
        h('p', {}, h('kbd', { class: 'key' }, 'Esc'), ' discards an open note. ', h('kbd', { class: 'key' }, 'Alt'), h('kbd', { class: 'key' }, 'A'), ' pins or boxes without talking.'),
      ),
    );
  }

  row({ kind, tag, tagClass = '', text, url, id }) {
    this.log.querySelector('.log-empty')?.remove();
    const at = this.rec.session ? clock(this.rec.elapsed()) : '';
    const li = h(
      'li',
      { class: `log-row log-${kind}`, dataset: { url: url || '', id: id || '' } },
      h('span', { class: 'log-tc' }, at),
      h('span', { class: `tag ${tagClass}` }, tag),
      h('span', { class: 'log-text', dir: dirOf(text) }, text),
    );
    this.log.append(li);
    revealInList(li);
    return li;
  }

  updateCounts() {
    $('#web-count-pages', this.root).textContent = this.pages.size;
    $('#web-count-marks', this.root).textContent = this.markCount;
  }
}
