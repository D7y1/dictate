// One recording: microphone, live captions, audio upload, and the session's event stream.
//
// Two ways to talk:
//   key   (default) the mic is hot but only kept while a note is open: T opens a note, T closes it.
//   open  everything you say is kept; T still brackets a note when you want one.
import { SessionClient } from './api.js';
import { Voice } from './voice.js';
import { toast, uid } from './util.js';

const TAIL_MS = 450; // keep listening briefly after the key so the last word isn't clipped

export class Recorder extends EventTarget {
  constructor() {
    super();
    this.voice = new Voice();
    this.session = null;
    this.recording = false; // session is capturing (not paused)
    this.active = false; // a session exists and hasn't been stopped
    this.micMode = 'key';
    this.note = null; // {id, openedAt}
    this.pausedAt = null;
    this.pausedTotal = 0;
    this.lastSpeechStart = 0;
    this.notesAt = [];
    this.micLabel = null;
    this.deviceId = null;
    this.captionLang = 'en-US';
    this.tailTimer = null;
    this.audioLive = false;

    this.voice.addEventListener('onset', () => this.speechStart());
    this.voice.addEventListener('interim', (e) => {
      if (!this.listening()) return;
      if (e.detail.text) this.speechStart();
      this.emit('interim', e.detail);
    });
    this.voice.addEventListener('final', (e) => {
      if (!this.session || !this.active) return;
      const d = e.detail;
      const extra = this.decorateFinal ? this.decorateFinal(d) : {};
      this.session.event('speech.final', { id: d.id, text: d.text, tStart: d.tStart, tEnd: d.tEnd, confidence: d.confidence, note: this.note?.id, ...extra });
      this.emit('final', { ...d, ...extra, note: this.note?.id || this.lastClosedNote(d.tStart) });
    });
    this.voice.addEventListener('captions', (e) => this.emit('captions', e.detail));
    this.voice.addEventListener('level', (e) => this.emit('level', e.detail));
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  listening() {
    return this.recording && (this.micMode === 'open' || !!this.note);
  }

  // A caption that finishes just after the key was pressed still belongs to that note.
  lastClosedNote(t) {
    const c = this.closed;
    return c && t >= c.openedAt - 1500 && t <= c.closedAt + 2500 ? c.id : null;
  }

  speechStart() {
    if (!this.listening()) return;
    const now = Date.now();
    if (now - this.lastSpeechStart < 2000) return;
    this.lastSpeechStart = now;
    this.emit('speechstart', { t: now });
  }

  async openMic(deviceId = this.deviceId) {
    this.deviceId = deviceId;
    this.micLabel = await this.voice.open(deviceId);
    this.emit('mic', { label: this.micLabel });
    return this.micLabel;
  }

  get micOpen() {
    return !!this.voice.stream;
  }

  async start({ mode, video, startUrl, title, lang, captionLang, micMode }) {
    if (!this.micOpen) await this.openMic();
    this.session = await SessionClient.create({ mode, video, startUrl, title, lang });
    this.active = true;
    this.recording = true;
    this.pausedTotal = 0;
    this.pausedAt = null;
    this.notesAt = [];
    this.note = null;
    this.closed = null;
    this.micMode = micMode || this.micMode;
    this.captionLang = captionLang || this.captionLang;
    this.session.event('rec.start', { mode, micMode: this.micMode });
    this.voice.startRecording((chunk) => this.session.audio(chunk));
    this.session.event('audio.start');
    this.audioLive = true;
    if (this.micMode === 'open') this.voice.startCaptions(this.captionLang);
    else this.audioOff();
    this.emit('state');
    return this.session;
  }

  audioOn() {
    clearTimeout(this.tailTimer);
    if (this.audioLive) return;
    this.voice.resumeRecording();
    this.session.event('audio.resume');
    this.audioLive = true;
    this.voice.startCaptions(this.captionLang);
  }

  audioOff() {
    if (!this.audioLive) return;
    this.session.event('audio.pause');
    this.voice.pauseRecording();
    this.audioLive = false;
    this.voice.stopCaptions();
  }

  event(type, data) {
    if (!this.recording || !this.session) return null;
    return this.session.event(type, data);
  }

  nudge() {
    toast('Press T to talk, or Record to start tracking.');
    this.emit('nudge');
  }

  // ---------- notes (talk key) ----------

  // extra: { page } when the note was opened on a website rather than in the studio.
  openNote(extra = {}) {
    if (!this.recording || this.note) return this.note;
    this.note = { id: uid('k'), openedAt: Date.now() };
    this.session.event('note.start', { id: this.note.id, ...extra });
    this.audioOn();
    this.emit('note', { open: true, id: this.note.id });
    return this.note;
  }

  closeNote({ cancel = false } = {}) {
    if (!this.note) return null;
    const note = this.note;
    this.note = null;
    this.session.event(cancel ? 'note.cancel' : 'note.end', { id: note.id });
    this.closed = { ...note, closedAt: Date.now() };
    if (this.micMode === 'key') {
      clearTimeout(this.tailTimer);
      this.tailTimer = setTimeout(() => !this.note && this.recording && this.audioOff(), TAIL_MS);
    }
    this.emit('note', { open: false, id: note.id, cancelled: cancel });
    return note;
  }

  setMicMode(mode) {
    this.micMode = mode;
    if (!this.active || !this.recording) return;
    this.session.event('mic.mode', { mode });
    if (mode === 'open') this.audioOn();
    else if (!this.note) this.audioOff();
  }

  // ---------- session control ----------

  pause() {
    if (!this.recording) return;
    this.closeNote();
    clearTimeout(this.tailTimer);
    this.session.event('rec.pause');
    this.audioOff();
    this.recording = false;
    this.pausedAt = Date.now();
    this.emit('state');
  }

  resume() {
    if (!this.active || this.recording) return;
    this.pausedTotal += Date.now() - (this.pausedAt || Date.now());
    this.pausedAt = null;
    this.recording = true;
    this.session.event('rec.resume');
    if (this.micMode === 'open') this.audioOn();
    this.emit('state');
  }

  setCaptionLanguage(lang) {
    this.captionLang = lang;
    this.voice.setCaptionLanguage(lang);
  }

  elapsed() {
    if (!this.session) return 0;
    const pausedNow = this.pausedAt ? Date.now() - this.pausedAt : 0;
    return Date.now() - this.session.startedAt - this.pausedTotal - pausedNow;
  }

  async stop() {
    if (!this.active) return this.session;
    this.closeNote();
    clearTimeout(this.tailTimer);
    this.session.event('rec.stop', this.recording ? {} : { whilePaused: true });
    this.audioOff();
    this.recording = false;
    this.active = false;
    await new Promise((r) => setTimeout(r, 300)); // let the last caption land
    await this.voice.stopRecording();
    this.session.event('audio.stop');
    await this.session.drain();
    this.emit('state');
    return this.session;
  }

  reset() {
    this.session = null;
    this.active = false;
    this.recording = false;
    this.note = null;
    this.emit('state');
  }
}
