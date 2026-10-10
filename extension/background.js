// Dictate extension service worker.
// Receives tracking events from every tab, takes screenshots, and relays it all to the
// local Dictate server for the session the studio started.

const CAPTURE_GAP_MS = 550; // Chrome allows ~2 captureVisibleTab calls per second
const state = { active: false, paused: false, sessionId: null, server: null, startedAt: 0, markN: 0, studioTabId: null, talk: { open: false, noteId: null }, bindings: { talk: ['KeyT', 'MouseBack'], discard: ['Escape'], annotate: ['Alt+KeyA'] } };
let target = null; // { tabId, windowId } — the tab being reviewed (never the studio)
let lastMark = null; // { id, t, tabId, note } — a pin made just before T anchors that note
let queue = [];
let flushTimer = null;
const captures = [];
let capturing = false;
let lastCaptureAt = 0;

const restored = chrome.storage.session.get('dictate').then(({ dictate }) => {
  if (dictate) Object.assign(state, dictate);
});

function persist() {
  return chrome.storage.session.set({ dictate: { ...state } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (path) => `${state.server}/api/sessions/${state.sessionId}${path}`;

async function post(path, body) {
  const res = await fetch(api(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 404 || res.status === 409) {
    await stop(); // the studio finished or the server restarted
    throw new Error('Session closed');
  }
  if (!res.ok) throw new Error(`Server said ${res.status}`);
  return res.json();
}

// ---------- events ----------

function enqueue(events) {
  if (!state.active || state.paused) return;
  queue.push(...events);
  if (!flushTimer) flushTimer = setTimeout(flush, 400);
}

async function flush() {
  flushTimer = null;
  if (!state.active || !queue.length) return;
  const batch = queue;
  queue = [];
  try {
    await post('/events', { src: 'ext', events: batch });
  } catch (err) {
    if (state.active) {
      queue = batch.concat(queue); // keep it; the server may just be busy
      flushTimer = setTimeout(flush, 2000);
    }
  }
}

// ---------- screenshots ----------

function capture(reason, extra = {}) {
  if (!state.active || state.paused) return;
  captures.push({ reason, t: Date.now(), ...extra });
  if (!capturing) drainCaptures();
}

async function drainCaptures() {
  capturing = true;
  while (captures.length) {
    const job = captures.shift();
    // Page-load shots are superseded by any newer shot of the same tab.
    if (job.reason === 'page' && captures.some((c) => c.tabId === job.tabId)) continue;
    const wait = lastCaptureAt + CAPTURE_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    const tabId = job.tabId ?? target?.tabId;
    if (tabId == null) continue;
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      continue;
    }
    if (!tab.active || !/^https?:|^file:/.test(tab.url || '')) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'dictate:pre-capture' });
    } catch {
      // no tracker in this tab; capture anyway
    }
    let dataUrl = null;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 82 });
    } catch (err) {
      console.warn('Dictate capture failed', err.message);
    }
    chrome.tabs.sendMessage(tab.id, { type: 'dictate:post-capture' }).catch(() => {});
    lastCaptureAt = Date.now();
    if (!dataUrl) continue;
    try {
      await post('/frames', { src: 'ext', dataUrl, meta: { t: job.t, reason: job.reason, ref: job.ref || null, url: tab.url, title: tab.title } });
    } catch {
      // dropped frame; events still carry the context
    }
  }
  capturing = false;
}

// ---------- session control ----------

async function broadcast(message) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, message).catch(() => {})));
}

// Tabs opened before the extension was installed have no tracker yet.
async function ensureTrackers() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (tab.id === state.studioTabId) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'dictate:ping' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {});
    }
  }
}

function publicState() {
  return { active: state.active, paused: state.paused, startedAt: state.startedAt, markN: state.markN, talk: state.talk, bindings: state.bindings };
}

async function start({ sessionId, server, startedAt, bindings }, studioTabId) {
  Object.assign(state, { active: true, paused: false, sessionId, server, startedAt: startedAt || Date.now(), markN: 0, studioTabId, talk: { open: false, noteId: null }, bindings: bindings || state.bindings });
  lastMark = null;
  queue = [];
  await persist();
  await ensureTrackers();
  await broadcast({ type: 'dictate:state', state: publicState() });
  // Record where the user already is: the visible web tab in any window other than the studio's.
  if (!target) {
    const visible = (await chrome.tabs.query({ active: true, windowType: 'normal' })).filter((t) => t.id !== studioTabId && /^https?:/.test(t.url || ''));
    if (visible.length === 1) setTarget(visible[0], 'start');
  } else {
    try {
      setTarget(await chrome.tabs.get(target.tabId), 'start-known');
    } catch {
      target = null;
    }
  }
}

async function stop() {
  if (!state.active) return;
  await flush();
  Object.assign(state, { active: false, paused: false, talk: { open: false, noteId: null } });
  await persist();
  await broadcast({ type: 'dictate:state', state: publicState() });
}

async function setPaused(paused) {
  state.paused = paused;
  await persist();
  await broadcast({ type: 'dictate:state', state: publicState() });
}

function setTarget(tab, why) {
  if (!tab || tab.id === state.studioTabId || !/^https?:|^file:/.test(tab.url || '')) return;
  const changed = target?.tabId !== tab.id;
  target = { tabId: tab.id, windowId: tab.windowId };
  if (changed && why !== 'event') {
    enqueue([{ type: 'page.visit', t: Date.now(), url: tab.url, title: tab.title, tabId: tab.id, via: why }]);
    capture('page', { tabId: tab.id });
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await restored;
  if (!state.active) return;
  try {
    setTarget(await chrome.tabs.get(tabId), 'tab');
  } catch {
    // tab closed
  }
});

// ---------- messages ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    await restored;
    const tab = sender.tab;
    switch (msg.type) {
      case 'dictate:hello':
        return publicState();
      case 'dictate:events':
        if (tab && tab.id !== state.studioTabId) {
          target = { tabId: tab.id, windowId: tab.windowId };
          enqueue(msg.events.map((e) => ({ ...e, tabId: tab.id })));
          if (msg.flush) await flush();
        }
        return { ok: true };
      case 'dictate:visit':
        if (tab) {
          target = { tabId: tab.id, windowId: tab.windowId };
          enqueue([{ ...msg.event, tabId: tab.id }]);
          // Give the page a moment to paint before the screenshot.
          setTimeout(() => capture('page', { tabId: tab.id }), 700);
        }
        return { ok: true };
      case 'dictate:mark': {
        if (!state.active || state.paused || !tab) return { n: null };
        state.markN += 1;
        await persist();
        const event = { ...msg.event, n: state.markN, tabId: tab.id };
        target = { tabId: tab.id, windowId: tab.windowId };
        lastMark = { id: event.id, t: Date.now(), tabId: tab.id, note: event.note || null };
        enqueue([event]);
        await flush();
        capture('mark', { tabId: tab.id, ref: event.id, t: event.t });
        return { n: state.markN };
      }
      case 'dictate:talk': {
        // The studio owns the microphone, so the key press is relayed there.
        if (!state.active || state.paused || !tab || state.studioTabId == null) return { ok: false };
        target = { tabId: tab.id, windowId: tab.windowId };
        const recent = lastMark && !lastMark.note && lastMark.tabId === tab.id && Date.now() - lastMark.t < 5000 ? lastMark.id : null;
        const payload = { type: 'talk', phase: msg.phase, tabId: tab.id, url: tab.url, title: tab.title, x: msg.x, y: msg.y, sx: msg.sx, sy: msg.sy, viewport: msg.viewport, el: msg.el, recentMark: recent, t: Date.now() };
        await chrome.tabs.sendMessage(state.studioTabId, { type: 'dictate:to-studio', payload }).catch(() => {});
        return { ok: true };
      }
      case 'dictate:studio':
        return handleStudio(msg.action, msg.payload || {}, tab);
      default:
        return null;
    }
  })().then(reply, (err) => reply({ error: err.message }));
  return true; // async reply
});

async function handleStudio(action, payload, tab) {
  switch (action) {
    case 'status':
      return { version: chrome.runtime.getManifest().version, ...publicState() };
    case 'start':
      await start(payload, tab?.id ?? null);
      return publicState();
    case 'stop':
      await stop();
      return publicState();
    case 'pause':
      await setPaused(true);
      return publicState();
    case 'resume':
      await setPaused(false);
      return publicState();
    case 'capture':
      capture(payload.reason || 'speech', { t: payload.t || Date.now(), ref: payload.ref || null });
      return { ok: true };
    case 'note-open': {
      const { noteId, anchor } = payload;
      state.talk = { open: true, noteId };
      await persist();
      if (anchor?.recentMark) {
        enqueue([{ type: 'mark.link', t: Date.now(), id: anchor.recentMark, note: noteId }]);
        if (lastMark) lastMark.note = noteId;
        capture('note', { tabId: anchor.tabId, ref: noteId });
      } else if (anchor && anchor.x >= 0) {
        // Nothing clicked first: pin whatever is under the cursor.
        state.markN += 1;
        await persist();
        const event = {
          type: 'page.mark', t: Date.now(), id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
          kind: 'pin', auto: true, note: noteId, n: state.markN, tabId: anchor.tabId, url: anchor.url, title: anchor.title,
          x: Math.round(anchor.x), y: Math.round(anchor.y), sx: anchor.sx, sy: anchor.sy, viewport: anchor.viewport, el: anchor.el,
        };
        lastMark = { id: event.id, t: Date.now(), tabId: anchor.tabId, note: noteId };
        enqueue([event]);
        await flush();
        chrome.tabs.sendMessage(anchor.tabId, { type: 'dictate:draw-pin', n: state.markN, x: anchor.x, y: anchor.y }).catch(() => {});
        capture('mark', { tabId: anchor.tabId, ref: event.id });
      } else {
        capture('note', { ref: noteId });
      }
      await broadcast({ type: 'dictate:state', state: publicState() });
      return { n: state.markN };
    }
    case 'note-close':
      state.talk = { open: false, noteId: null };
      await persist();
      await broadcast({ type: 'dictate:state', state: publicState() });
      return { ok: true };
    case 'settings':
      if (payload.bindings) state.bindings = payload.bindings;
      await persist();
      await broadcast({ type: 'dictate:state', state: publicState() });
      return publicState();
    case 'open': {
      // Open the site being reviewed in a normal browser window next to the studio.
      const bounds = {};
      for (const k of ['left', 'top', 'width', 'height']) if (Number.isFinite(payload[k])) bounds[k] = Math.round(payload[k]);
      const win = await chrome.windows.create({ url: payload.url, focused: true, type: 'normal', ...bounds });
      if (win.tabs?.[0]) target = { tabId: win.tabs[0].id, windowId: win.id };
      return { ok: true };
    }
    default:
      return { error: `Unknown action ${action}` };
  }
}
