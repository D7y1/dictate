// Dictate Studio: screens, settings, and the talk → review → submit flow.
import { $, $$, h, clock, dirOf, isTyping, toast, prefs, savePref, revealInList } from './util.js';
import { getJSON } from './api.js';
import { Extension } from './ext.js';
import { Recorder } from './recorder.js';
import { Voice } from './voice.js';
import { VideoReview } from './video.js';
import { WebReview } from './web.js';
import { Review } from './review.js';
import { ACTIONS, FIXED, defaults, loadBindings, saveBindings, fromKeyEvent, fromMouseEvent, isMouse, label, actionFor, keyHint, forExtension } from './bindings.js';

const LANGS = {
  auto: { label: 'Arabic + English', whisper: 'auto' },
  en: { label: 'English', whisper: 'en', captions: 'en-US' },
  ar: { label: 'العربية', whisper: 'ar', captions: 'ar-SA' },
};
const HOLD_MS = 600; // holding the talk key longer than this makes it push-to-talk

const app = {
  config: null,
  screen: 'home',
  mode: null,
  lang: prefs('lang', 'auto'),
  captionLang: prefs('captionLang', 'en-US'),
  bindings: loadBindings(),
  micMode: prefs('micMode', 'key'),
  noteRows: new Map(),
  talkPress: null,
  opening: false,
};

const ext = new Extension();
const recorder = new Recorder();
recorder.micMode = app.micMode;


async function boot() {
  app.config = await getJSON('/api/config');
  new EventSource('/api/presence'); // lets a --once launcher know this window is still open
  document.title = app.config.project ? `Dictate · ${app.config.project}` : 'Dictate Studio';
  const project = app.config.project && app.config.project.toLowerCase() !== 'dictate' ? app.config.project : '';
  for (const el of $$('.project-name')) el.textContent = project;

  app.video = new VideoReview({ root: $('#screen-video'), recorder, config: app.config });
  app.web = new WebReview({ root: $('#screen-web'), recorder, ext, config: app.config });
  app.review = new Review({ root: $('#screen-review'), onSubmitted: showDone });
  app.video.onNeedSession = ensureSession;
  app.video.onRemoveNote = (id) => {
    if (recorder.note?.id === id) closeNote({ cancel: true });
    else recorder.event('note.cancel', { id });
    app.noteRows.delete(id);
  };
  app.web.onNeedSession = ensureSession;
  app.web.extBindings = forExtension(app.bindings);

  // ?debug exposes internals for scripted UI checks.
  if (new URLSearchParams(location.search).has('debug')) window.__dictate = { app, recorder, ext };

  bindHome();
  bindRecording();
  bindInput();
  renderControls();
  renderKeyLabels();
  $('#controls-reset').addEventListener('click', resetControls);
  renderWhisper(app.config.whisper, app.config.setupCommand);
  renderExtStatus();
  ext.addEventListener('change', renderExtStatus);
  ext.addEventListener('push', (e) => onExtensionPush(e.detail));
  loadRecent();

  if (app.config.video) {
    app.video.load({ url: app.config.video.url, name: app.config.video.name, size: app.config.video.size, path: app.config.video.path });
    enter('video');
  } else if (app.config.mode === 'web' || app.config.url) {
    enter('web');
  } else if (app.config.mode === 'video') {
    enter('video');
  } else {
    show('home');
  }
}

// ---------- screens ----------

function show(name) {
  app.screen = name;
  for (const s of $$('.screen')) s.hidden = s.id !== `screen-${name}`;
  document.body.dataset.screen = name;
}

function enter(mode) {
  app.mode = mode;
  show(mode);
  if (mode === 'web') app.web.dock();
  // Open the mic now so the first T press starts capturing instantly.
  if (!recorder.micOpen) openMic({ quiet: true });
}

// ---------- home & settings ----------

function bindHome() {
  for (const card of $$('[data-enter]')) card.addEventListener('click', () => enter(card.dataset.enter));
  for (const btn of $$('[data-home]')) {
    btn.addEventListener('click', () => {
      if (recorder.active) {
        toast('Finish this review first.', 'error');
        return;
      }
      show('home');
    });
  }

  const lang = $('#set-lang');
  for (const [value, { label }] of Object.entries(LANGS)) lang.append(h('option', { value }, label));
  lang.value = app.lang;
  lang.addEventListener('change', () => {
    app.lang = lang.value;
    savePref('lang', app.lang);
    syncCaptionLang();
  });
  for (const btn of $$('[data-caption-lang]')) {
    btn.addEventListener('click', () => {
      app.captionLang = btn.dataset.captionLang;
      savePref('captionLang', app.captionLang);
      syncCaptionLang();
      recorder.setCaptionLanguage(captionLang());
    });
  }
  syncCaptionLang();

  $('#set-mic-test').addEventListener('click', async () => {
    if (await openMic()) toast('Mic is live. The meter moves when you speak.');
  });
  $('#set-mic').addEventListener('change', async (e) => {
    savePref('mic', e.target.value);
    await openMic({ deviceId: e.target.value });
  });

  for (const box of $$('.open-mic')) {
    box.checked = app.micMode === 'open';
    box.addEventListener('change', () => {
      app.micMode = box.checked ? 'open' : 'key';
      savePref('micMode', app.micMode);
      for (const b of $$('.open-mic')) b.checked = box.checked;
      recorder.setMicMode(app.micMode);
      document.body.dataset.mic = app.micMode;
    });
  }
  document.body.dataset.mic = app.micMode;

  // Video: choose a file or paste a path.
  $('#video-pick').addEventListener('click', () => $('#video-file').click());
  $('#video-file').addEventListener('change', (e) => app.video.loadFile(e.target.files[0]));
  $('#video-path-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#video-path');
    const path = input.value.trim();
    if (!path) return;
    try {
      const res = await fetch('/api/media/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      app.video.load({ url: body.url, name: body.name, size: body.size, path: body.path });
      input.value = '';
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function renderKeyLabels() {
  const key = keyHint(app.bindings, 'talk');
  const mouse = app.bindings.talk.find(isMouse);
  for (const el of $$('.talk-key-label')) {
    el.textContent = key || '';
    el.hidden = !key;
  }
  const mouseHint = mouse ? `${key ? ' or ' : ''}the ${mouse === 'MouseMiddle' ? 'middle mouse button' : 'mouse side button'}` : '';
  for (const el of $$('.talk-mouse-hint')) el.textContent = mouseHint;
  if (app.video) {
    app.video.talkKeyLabel = key;
    app.video.talkMouseHint = mouseHint;
  }
}

// ---------- controls (customizable bindings) ----------

const SCOPE_LABEL = { all: 'Everywhere', video: 'Video', web: 'On your site' };

function renderControls() {
  const list = $('#controls-list');
  list.replaceChildren(
    ...ACTIONS.map((a) =>
      h('li', { class: 'control-row' },
        h('div', { class: 'control-name' }, h('span', {}, a.label), a.hint ? h('small', {}, a.hint) : null),
        h('span', { class: 'control-scope' }, SCOPE_LABEL[a.scope]),
        h('div', { class: 'control-binds' },
          ...app.bindings[a.id].map((b) =>
            h('span', { class: `bind-chip${isMouse(b) ? ' bind-mouse' : ''}` },
              isMouse(b) ? icon('i-mouse') : null,
              h('span', {}, label(b)),
              h('button', { type: 'button', class: 'bind-remove', 'aria-label': `Remove ${label(b)} from ${a.label}`, onclick: () => setBindings(a.id, app.bindings[a.id].filter((x) => x !== b)) }, icon('i-close')),
            ),
          ),
          h('button', { type: 'button', class: 'bind-add', onclick: (e) => captureBinding(a, e.currentTarget) }, icon('i-plus'), h('span', {}, 'Add')),
        ),
      ),
    ),
  );
}

function icon(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function setBindings(id, list) {
  app.bindings = { ...app.bindings, [id]: list };
  saveBindings(app.bindings);
  app.web.extBindings = forExtension(app.bindings);
  if (ext.connected) ext.call('settings', { bindings: app.web.extBindings }).catch(() => {});
  renderControls();
  renderKeyLabels();
}

function resetControls() {
  app.bindings = defaults();
  setBindings('talk', app.bindings.talk);
  toast('Controls reset to the defaults.');
}

// Click Add, then press any key, or the middle or a side mouse button. Left click elsewhere cancels.
function captureBinding(action, button) {
  if (app.capturing) app.capturing();
  button.classList.add('listening');
  button.lastChild.textContent = 'Press a key or mouse button';
  const done = (binding) => {
    removeEventListener('keydown', onKey, true);
    removeEventListener('mousedown', onMouse, true);
    removeEventListener('mouseup', swallow, true);
    removeEventListener('auxclick', swallow, true);
    app.capturing = null;
    if (binding) assign(action, binding);
    else renderControls();
  };
  const onKey = (e) => {
    const b = fromKeyEvent(e);
    if (!b) return; // a lone modifier: wait for the real key
    e.preventDefault();
    e.stopPropagation();
    done(b);
  };
  const onMouse = (e) => {
    if (e.button === 0 || e.button === 2) {
      if (!button.contains(e.target)) done(null);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const b = fromMouseEvent(e);
    setTimeout(() => done(b), 0); // the matching mouseup is still swallowed below
  };
  const swallow = (e) => {
    if (e.button !== 0) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  app.capturing = () => done(null);
  addEventListener('keydown', onKey, true);
  addEventListener('mousedown', onMouse, true);
  addEventListener('mouseup', swallow, true);
  addEventListener('auxclick', swallow, true);
}

function assign(action, binding) {
  if (FIXED.has(binding)) {
    toast(`${label(binding)} steps through the video, so it stays fixed.`, 'error');
    renderControls();
    return;
  }
  if (app.bindings[action.id].includes(binding)) {
    renderControls();
    return;
  }
  // One binding, one action: take it from wherever it was.
  for (const other of ACTIONS) {
    if (other.id !== action.id && app.bindings[other.id].includes(binding)) {
      app.bindings = { ...app.bindings, [other.id]: app.bindings[other.id].filter((b) => b !== binding) };
      toast(`Moved ${label(binding)} from ${other.label} to ${action.label}.`);
    }
  }
  setBindings(action.id, [...app.bindings[action.id], binding]);
}

function captionLang() {
  return LANGS[app.lang].captions || app.captionLang;
}

function syncCaptionLang() {
  const auto = app.lang === 'auto';
  for (const el of $$('.caption-lang')) el.hidden = !auto;
  for (const btn of $$('[data-caption-lang]')) btn.setAttribute('aria-pressed', String(btn.dataset.captionLang === app.captionLang));
}

async function openMic({ deviceId, quiet = false } = {}) {
  try {
    const label = await recorder.openMic(deviceId ?? prefs('mic', undefined));
    await fillMics();
    for (const el of $$('.mic-name')) el.textContent = label;
    document.body.classList.add('mic-ready');
    return true;
  } catch (err) {
    document.body.classList.remove('mic-ready');
    if (!quiet || err.name !== 'NotAllowedError') {
      toast(err.name === 'NotAllowedError' ? 'Microphone blocked. Allow it from the icon in the address bar, then try again.' : `Microphone problem: ${err.message}`, 'error');
    }
    return false;
  }
}

async function fillMics() {
  const select = $('#set-mic');
  const inputs = await Voice.inputs();
  const current = recorder.deviceId || prefs('mic', '');
  select.replaceChildren(
    h('option', { value: '' }, 'System default'),
    ...inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => h('option', { value: d.deviceId }, d.label || 'Microphone')),
  );
  select.value = inputs.some((d) => d.deviceId === current) ? current : '';
}

function renderWhisper(w, setupCommand) {
  const el = $('#whisper-status');
  if (w.status === 'unavailable') {
    el.textContent = `Live captions only. For accurate transcripts, run ${setupCommand || 'Dictate setup'} in a terminal.`;
    el.dataset.state = 'warn';
  } else {
    el.textContent = 'Whisper transcribes on this machine when you finish.';
    el.dataset.state = 'ok';
  }
}

function renderExtStatus() {
  for (const el of $$('.ext-status')) {
    el.dataset.state = ext.connected ? 'ok' : 'missing';
    el.textContent = ext.connected ? `Extension connected${ext.version ? ` · v${ext.version}` : ''}` : 'Extension not loaded';
  }
}

async function loadRecent() {
  const list = $('#recent');
  try {
    const { sessions } = await getJSON('/api/sessions');
    list.replaceChildren(
      ...sessions.slice(0, 6).map((s) =>
        h('li', { class: 'recent-row' },
          h('span', { class: 'recent-mode' }, s.mode === 'video' ? 'VID' : 'WEB'),
          h('span', { class: 'recent-title', dir: dirOf(s.title) }, s.title || s.id),
          h('span', { class: 'recent-meta' }, s.draft ? 'draft' : s.submitted ? `${s.notes ?? 0} notes` : 'unfinished'),
          h('span', { class: 'recent-when' }, new Date(s.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
        ),
      ),
    );
    $('#recent-wrap').hidden = !sessions.length;
  } catch {
    $('#recent-wrap').hidden = true;
  }
}

// ---------- session ----------

function controller() {
  return app.mode === 'video' ? app.video : app.web;
}

// Starts the session, or resumes it if paused. Used by Record, T, clicking the frame, and Open.
async function ensureSession() {
  if (recorder.active) {
    if (!recorder.recording) {
      recorder.resume();
      controller().onRecordingResume?.();
    }
    return true;
  }
  return startRecording();
}

async function toggleRecord() {
  if (app.screen !== 'video' && app.screen !== 'web') return;
  if (!recorder.active) return startRecording();
  if (recorder.recording) {
    recorder.pause();
    controller().onRecordingPause?.();
  } else {
    recorder.resume();
    controller().onRecordingResume?.();
  }
}

async function startRecording() {
  const mode = app.mode;
  if (mode === 'video' && !app.video.source) {
    toast('Load a video first: drop a file or paste its path.', 'error');
    return false;
  }
  if (!recorder.micOpen && !(await openMic())) return false;
  try {
    const session = await recorder.start({
      mode,
      micMode: app.micMode,
      lang: LANGS[app.lang].whisper,
      captionLang: captionLang(),
      video: mode === 'video' ? app.video.videoInfo() : undefined,
      startUrl: mode === 'web' ? app.web.normalizedUrl() : undefined,
      title: app.config.title || undefined,
    });
    recorder.decorateFinal = (d) => (app.mode === 'video' ? { vt: app.video.vtAt(d.tStart) } : {});
    app.noteRows.clear();
    if (mode === 'video') app.video.onRecordingStart();
    else await app.web.onRecordingStart(session);
    return true;
  } catch (err) {
    toast(`Couldn't start: ${err.message}`, 'error');
    return false;
  }
}

async function finishRecording() {
  if (!recorder.active) return;
  const mode = app.mode;
  show('finishing');
  setFinishing('Saving your recording');
  if (mode === 'web') await app.web.onRecordingStop();
  if (mode === 'video') app.video.video.pause();
  const session = await recorder.stop();
  const stream = session.stream((msg) => {
    if (msg.kind === 'status') setFinishing(msg.message);
  });
  try {
    setFinishing('Transcribing your voice');
    const compiled = await session.finish(LANGS[app.lang].whisper);
    stream.close();
    show('review');
    app.review.show({ session, compiled, mode });
  } catch (err) {
    stream.close();
    setFinishing(`Something went wrong: ${err.message}`);
    toast(err.message, 'error');
  }
}

function setFinishing(message) {
  $('#finishing-message').textContent = message;
}

// ---------- talk key ----------

async function talkDown({ hold = true, anchor = null } = {}) {
  if (app.screen !== 'video' && app.screen !== 'web') return;
  if (recorder.note) {
    closeNote();
    app.talkPress = null;
    return;
  }
  if (app.opening) return;
  app.opening = true;
  try {
    if (!(await ensureSession())) return;
    const note = recorder.openNote();
    if (!note) return;
    app.talkPress = hold ? { at: Date.now(), id: note.id } : null;
    if (app.mode === 'video') await app.video.onNoteOpen(note.id);
    else await app.web.onNoteOpen(note.id, anchor);
    const row = app.mode === 'video' ? app.video.logNote(note.id) : app.web.logNote(note.id, anchor);
    row.classList.add('open');
    app.noteRows.set(note.id, { row, text: '' });
  } finally {
    app.opening = false;
  }
}

function talkUp() {
  const press = app.talkPress;
  app.talkPress = null;
  if (press && recorder.note?.id === press.id && Date.now() - press.at > HOLD_MS) closeNote();
}

function closeNote({ cancel = false } = {}) {
  const note = recorder.closeNote({ cancel });
  if (!note) return;
  if (app.mode === 'web') app.web.onNoteClose();
  const entry = app.noteRows.get(note.id);
  if (!entry) return;
  entry.row.classList.remove('open');
  if (cancel) {
    entry.row.remove();
    app.noteRows.delete(note.id);
    toast('Note discarded.');
  } else if (!entry.text) {
    entry.row.querySelector('.log-text').textContent = 'Transcribed when you finish';
    entry.row.classList.add('pending');
  }
}

function onExtensionPush(p) {
  if (p?.type !== 'talk') return;
  if (p.phase === 'down') talkDown({ anchor: p });
  else if (p.phase === 'up') talkUp();
  else if (p.phase === 'cancel') closeNote({ cancel: true });
}

function setNoteText(id, text, interim = '') {
  const entry = app.noteRows.get(id);
  if (!entry) return false;
  const el = entry.row.querySelector('.log-text');
  el.textContent = text;
  if (interim) el.append(h('span', { class: 'interim' }, `${text ? ' ' : ''}${interim}`));
  el.dir = dirOf(text || interim);
  entry.row.classList.toggle('pending', !text && !interim);
  if (entry.row.classList.contains('open')) revealInList(entry.row);
  return true;
}

// ---------- wiring ----------

function bindRecording() {
  for (const btn of $$('[data-action="record"]')) btn.addEventListener('click', () => toggleRecord());
  for (const btn of $$('[data-action="finish"]')) btn.addEventListener('click', () => finishRecording());
  for (const btn of $$('[data-action="talk"]')) btn.addEventListener('click', () => talkDown({ hold: false }));

  recorder.addEventListener('state', () => {
    const state = !recorder.active ? 'idle' : recorder.recording ? 'recording' : 'paused';
    document.body.dataset.rec = state;
    for (const btn of $$('[data-action="record"]')) {
      const label = $('.btn-label', btn) || btn;
      label.textContent = state === 'idle' ? 'Record' : state === 'recording' ? 'Pause' : 'Resume';
    }
  });

  recorder.addEventListener('note', (e) => {
    document.body.dataset.talk = e.detail.open ? 'open' : '';
    for (const btn of $$('[data-action="talk"]')) btn.setAttribute('aria-pressed', String(e.detail.open));
    if (!e.detail.open) for (const el of $$('.live-caption')) el.textContent = '';
  });

  recorder.addEventListener('level', (e) => {
    const lvl = Math.min(1, e.detail.level * 1.4).toFixed(3);
    for (const m of $$('.meter')) m.style.setProperty('--level', lvl);
  });

  recorder.addEventListener('interim', (e) => {
    const { text } = e.detail;
    for (const el of $$('.live-caption')) {
      el.textContent = text || '';
      el.dir = dirOf(text);
    }
    if (recorder.note) {
      const entry = app.noteRows.get(recorder.note.id);
      if (entry) setNoteText(recorder.note.id, entry.text, text);
    }
  });

  recorder.addEventListener('final', (e) => {
    const d = e.detail;
    const entry = d.note && app.noteRows.get(d.note);
    if (entry) {
      entry.text = `${entry.text} ${d.text}`.trim();
      setNoteText(d.note, entry.text);
      return;
    }
    // Open mic: free speech gets its own row.
    if (app.mode === 'video') {
      app.video.logSpeech({ id: d.id, text: d.text, vt: d.vt });
      recorder.notesAt.push({ vt: d.vt });
    } else app.web.logSpeech({ id: d.id, text: d.text });
  });

  recorder.addEventListener('speechstart', () => controller().onSpeechStart?.());

  recorder.addEventListener('captions', (e) => {
    const { state, message } = e.detail;
    for (const el of $$('.captions-state')) {
      el.dataset.state = state;
      el.title = message || '';
    }
    if (message && state !== 'on' && !app.captionWarned) {
      app.captionWarned = true;
      toast(message, state === 'unsupported' ? 'info' : 'error');
    }
  });

  // Typed notes.
  for (const form of $$('.note-form')) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('input', form);
      const text = input.value.trim();
      if (!text || !(await ensureSession())) return;
      const id = `t${Date.now().toString(36)}`;
      recorder.event('note.text', { id, text });
      if (app.mode === 'video') app.video.logTyped({ id, text });
      else app.web.row({ kind: 'typed', tag: 'TXT', tagClass: 'tag-txt', text, id });
      input.value = '';
      input.blur();
    });
  }

  setInterval(() => {
    const t = recorder.active ? clock(recorder.elapsed()) : '00:00';
    for (const el of $$('.rec-clock')) el.textContent = t;
  }, 250);

  window.addEventListener('beforeunload', (e) => {
    if (recorder.active) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function runAction(action, phase) {
  if (phase === 'up') {
    if (action === 'talk') talkUp();
    return;
  }
  switch (action) {
    case 'talk':
      talkDown();
      break;
    case 'discard':
      if (recorder.note) closeNote({ cancel: true });
      else if (app.mode === 'video') app.video.cancelPending();
      break;
    case 'record':
      toggleRecord();
      break;
    case 'typeNote':
      $(`#screen-${app.screen} .note-form input`)?.focus();
      break;
    case 'playPause':
      app.video.togglePlay();
      break;
    case 'markIn':
      app.video.markIn();
      break;
    case 'markOut':
      app.video.markOut();
      break;
    case 'marker':
      app.video.addMark('marker', app.video.mouse ? { x: app.video.mouse.x, y: app.video.mouse.y } : {});
      break;
    default:
      break;
  }
}

function inReview() {
  return (app.screen === 'video' || app.screen === 'web') && !app.capturing;
}

function bindInput() {
  // Hand focus back after a toggle or select so single-key shortcuts keep working.
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('select, input[type="checkbox"], input[type="range"]')) e.target.blur();
  });

  document.addEventListener('keydown', (e) => {
    if (!inReview()) return;
    if (e.key === 'Escape' && isTyping(e)) {
      e.target.blur();
      return;
    }
    if (isTyping(e)) return;
    const action = actionFor(app.bindings, fromKeyEvent(e), app.mode);
    if (action) {
      e.preventDefault();
      if (!e.repeat) runAction(action, 'down');
      return;
    }
    if (app.screen === 'video' && !e.ctrlKey && !e.metaKey && !e.altKey && app.video.onKey(e)) e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (!inReview() || isTyping(e)) return;
    const action = actionFor(app.bindings, fromKeyEvent(e), app.mode);
    if (action) runAction(action, 'up');
  });

  // Middle and side mouse buttons. Their browser defaults (back, forward, autoscroll,
  // open in a new tab) are cancelled whenever they are bound to something here.
  const onMouse = (e) => {
    if (!inReview()) return;
    const action = actionFor(app.bindings, fromMouseEvent(e), app.mode);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'mousedown') runAction(action, 'down');
    else if (e.type === 'mouseup') runAction(action, 'up');
  };
  for (const type of ['mousedown', 'mouseup', 'auxclick']) document.addEventListener(type, onMouse, true);
}

// ---------- done ----------

function showDone(result) {
  show('done');
  recorder.reset();
  $('#done-path').textContent = result.dir;
  $('#done-headline').textContent = result.once ? 'Sent to Claude' : 'Saved';
  $('#done-sub').textContent = result.once ? 'Claude is reading it now. You can close this window.' : 'Ask Claude to “read my latest dictate session”, or copy the report.';
  document.body.classList.toggle('server-gone', !!result.once);
  $('#done-copy').onclick = async () => {
    await navigator.clipboard.writeText(result.report);
    toast('Report copied.');
  };
  $('#done-open').onclick = () => fetch(`/api/sessions/${encodeURIComponent(result.dir.split(/[\\/]/).pop())}/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  $('#done-new').onclick = () => location.reload();
  $('#done-close').onclick = () => window.close();
}

boot().catch((err) => {
  document.body.replaceChildren(h('main', { class: 'fatal' }, h('h1', {}, 'Dictate could not start'), h('p', {}, err.message)));
});
