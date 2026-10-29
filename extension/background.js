// Dictate extension service worker.
// Receives tracking events from every tab, takes screenshots, and relays it all to the
// local Dictate server for the session the studio started.

const CAPTURE_GAP_MS = 550; // Chrome allows ~2 captureVisibleTab calls per second
// scope 'all' (web review) tracks every page; 'refs' (video review) records a site only when
// you talk, pin or take a screenshot on it, since everything there is a reference.
const state = { active: false, paused: false, scope: 'all', sessionId: null, server: null, startedAt: 0, markN: 0, studioTabId: null, talk: { open: false, noteId: null }, site: { home: [], roles: {} }, lastHome: null, bindings: { talk: ['KeyT', 'MouseBack'], discard: ['Escape'], annotate: ['Alt+KeyA'], shot: ['Alt+KeyS'] } };
let target = null; // { tabId, windowId } — the tab being reviewed (never the studio)
let lastMark = null; // { id, t, tabId, note } — a pin made just before T anchors that note
const recorded = new Map(); // tabId → URL last sent as a page.visit, in 'refs' scope
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
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function post(path, body) {
  const res = await fetch(api(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 404 || res.status === 409) {
    await stop(); // the studio finished or the server restarted
    throw new Error('Session closed');
  }
  if (!res.ok) throw new Error(`Server said ${res.status}`);
  return res.json();
}

// ---------- your site vs. references ----------
// The site under review is the one the studio opened (or the first one recorded). Any other
// site is a reference: somewhere the user goes to show what they like. The toolbar on each
// page can flip that per host.

function hostOf(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$|\.localhost$|\.test$/;

function sameSite(a, b) {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`) || (LOOPBACK.test(a) && LOOPBACK.test(b));
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return url;
  }
}

function isReference(url) {
  if (state.scope === 'refs') return /^https?:|^file:/.test(url || '');
  const host = hostOf(url);
  if (!host) return false;
  const role = state.site.roles[host];
  if (role) return role === 'reference';
  return state.site.home.length > 0 && !state.site.home.some((h) => sameSite(h, host));
}

function learnHome(url) {
  const host = hostOf(url);
  if (!host || state.site.home.length) return;
  state.site.home.push(host);
  persist();
}

// A reference applies to the last page of the user's own site they were on.
function visited(event) {
  if (event.reference) return;
  state.lastHome = event.url;
  persist();
}

function appliesTo() {
  if (state.scope === 'refs') return 'your video';
  return state.lastHome ? pathOf(state.lastHome) : null;
}

// In 'refs' scope a page is recorded the first time you act on it.
function ensureVisit(tab) {
  if (state.scope !== 'refs' || !tab?.url || recorded.get(tab.id) === tab.url) return;
  recorded.set(tab.id, tab.url);
  enqueue([{ type: 'page.visit', t: Date.now() - 1, url: tab.url, title: tab.title, tabId: tab.id, via: 'action', reference: true }]);
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
    const shot = job.reason === 'shot';
    try {
      // A screenshot is the area you chose, so it carries no cursor ring.
      await chrome.tabs.sendMessage(tab.id, { type: 'dictate:pre-capture', cursor: !shot });
    } catch {
      // no tracker in this tab; capture anyway
    }
    let dataUrl = null;
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: shot ? 90 : 82 });
      if (dataUrl && job.crop) dataUrl = await cropImage(dataUrl, job.crop);
    } catch (err) {
      console.warn('Dictate capture failed', err.message);
    }
    chrome.tabs.sendMessage(tab.id, { type: 'dictate:post-capture', shot: shot ? { n: job.n, ok: !!dataUrl, rect: job.crop || null } : null }).catch(() => {});
    lastCaptureAt = Date.now();
    if (!dataUrl) continue;
    try {
      await post('/frames', { src: 'ext', dataUrl, meta: { t: job.t, reason: job.reason, ref: job.ref || null, url: tab.url, title: tab.title, reference: isReference(tab.url) } });
    } catch {
      // dropped frame; events still carry the context
    }
  }
  capturing = false;
}

// Cuts the dragged area out of a capture. The capture is in device pixels, the rect in CSS pixels.
async function cropImage(dataUrl, { x, y, w, h, vw }) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = bitmap.width / vw;
  const sx = Math.max(0, Math.round(x * scale));
  const sy = Math.max(0, Math.round(y * scale));
  const sw = Math.min(bitmap.width - sx, Math.round(w * scale));
  const sh = Math.min(bitmap.height - sy, Math.round(h * scale));
  if (sw < 2 || sh < 2) return dataUrl;
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

// ---------- session control ----------

async function broadcastState() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, { type: 'dictate:state', state: publicState(t) }).catch(() => {})));
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

function publicState(tab) {
  return {
    active: state.active, paused: state.paused, scope: state.scope, startedAt: state.startedAt, markN: state.markN, talk: state.talk, bindings: state.bindings,
    reference: tab ? isReference(tab.url) : false, appliesTo: appliesTo(),
  };
}

// Events and screenshots only ever go to the Dictate server on this computer.
function localServer(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
}

async function start({ sessionId, server: requested, startedAt, bindings, startUrl, scope }, studioTabId) {
  const server = localServer(requested);
  if (!server) throw new Error('Dictate only sends to a studio running on this computer');
  const home = hostOf(startUrl);
  Object.assign(state, {
    active: true, paused: false, scope: scope === 'refs' ? 'refs' : 'all', sessionId, server, startedAt: startedAt || Date.now(), markN: 0, studioTabId,
    talk: { open: false, noteId: null }, site: { home: home ? [home] : [], roles: {} }, lastHome: null, bindings: bindings || state.bindings,
  });
  lastMark = null;
  queue = [];
  recorded.clear();
  await persist();
  await ensureTrackers();
  await broadcastState();
  if (state.scope === 'refs') return;
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
  await broadcastState();
}

async function setPaused(paused) {
  state.paused = paused;
  await persist();
  await broadcastState();
}

function setTarget(tab, why) {
  if (!tab || tab.id === state.studioTabId || !/^https?:|^file:/.test(tab.url || '')) return;
  const changed = target?.tabId !== tab.id;
  target = { tabId: tab.id, windowId: tab.windowId };
  if (changed && why !== 'event' && state.scope === 'all') {
    learnHome(tab.url);
    const event = { type: 'page.visit', t: Date.now(), url: tab.url, title: tab.title, tabId: tab.id, via: why, reference: isReference(tab.url) };
    visited(event);
    enqueue([event]);
    capture('page', { tabId: tab.id });
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await restored;
  if (!state.active) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    setTarget(tab, 'tab');
    // Its toolbar may still name an older page of yours under "for".
    chrome.tabs.sendMessage(tabId, { type: 'dictate:state', state: publicState(tab) }).catch(() => {});
  } catch {
    // tab closed
  }
});

// The Screenshot button (or its key): you drag around an area and that crop is saved as a
// numbered mark (S1, S2…), kept even when nothing is said, so it works for showing a site you like.
// A plain click saves the whole visible screen.
async function shoot(tab, { rect, viewport, el } = {}) {
  if (!state.active || state.paused) return { n: null };
  if (!tab || !/^https?:|^file:/.test(tab.url || '')) return { error: 'Open a page first, then take the screenshot.' };
  const crop = rect && viewport?.w && rect.w >= 12 && rect.h >= 12 ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h, vw: viewport.w } : null;
  state.markN += 1;
  await persist();
  ensureVisit(tab);
  const event = {
    type: 'page.shot', t: Date.now(), id: newId('s'), kind: 'shot', n: state.markN, url: tab.url, title: tab.title, tabId: tab.id,
    reference: isReference(tab.url), note: state.talk.open ? state.talk.noteId : undefined, viewport: viewport || null, el: el || null,
    ...(crop ? { x: Math.round(crop.x), y: Math.round(crop.y), w: Math.round(crop.w), h: Math.round(crop.h), crop: true } : { crop: false }),
  };
  target = { tabId: tab.id, windowId: tab.windowId };
  enqueue([event]);
  await flush();
  capture('shot', { tabId: tab.id, ref: event.id, t: event.t, n: event.n, crop });
  return { n: event.n };
}

// ---------- messages ----------

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    await restored;
    const tab = sender.tab;
    switch (msg.type) {
      case 'dictate:hello':
        return publicState(tab);
      case 'dictate:events':
        if (tab && tab.id !== state.studioTabId) {
          target = { tabId: tab.id, windowId: tab.windowId };
          enqueue(msg.events.map((e) => ({ ...e, tabId: tab.id })));
          if (msg.flush) await flush();
        }
        return { ok: true };
      case 'dictate:visit':
        if (tab && state.scope === 'all') {
          target = { tabId: tab.id, windowId: tab.windowId };
          learnHome(msg.event.url);
          const event = { ...msg.event, tabId: tab.id, reference: isReference(msg.event.url) };
          visited(event);
          enqueue([event]);
          // Give the page a moment to paint before the screenshot.
          setTimeout(() => capture('page', { tabId: tab.id }), 700);
        }
        return { ok: true };
      case 'dictate:mark': {
        if (!state.active || state.paused || !tab) return { n: null };
        state.markN += 1;
        await persist();
        const event = { ...msg.event, n: state.markN, tabId: tab.id, reference: isReference(tab.url) };
        target = { tabId: tab.id, windowId: tab.windowId };
        ensureVisit(tab);
        lastMark = { id: event.id, t: Date.now(), tabId: tab.id, note: event.note || null };
        enqueue([event]);
        await flush();
        capture('mark', { tabId: tab.id, ref: event.id, t: event.t });
        return { n: state.markN };
      }
      case 'dictate:shot':
        return shoot(tab, msg);
      case 'dictate:role': {
        // The toolbar's Your site / Reference switch, remembered per host for this session.
        const host = hostOf(tab?.url);
        if (!state.active || state.paused || !host) return { reference: false };
        state.site.roles[host] = msg.reference ? 'reference' : 'site';
        await persist();
        enqueue([{ type: 'site.role', t: Date.now(), host, reference: !!msg.reference, url: tab.url }]);
        await flush();
        await broadcastState();
        return { reference: isReference(tab.url) };
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
    case 'shot': {
      // The studio's Screenshot button: the page being reviewed comes forward, ready to drag.
      if (!state.active || state.paused) return { error: 'Start the session first, then take the screenshot.' };
      const tab = target ? await chrome.tabs.get(target.tabId).catch(() => null) : null;
      if (!tab || !/^https?:|^file:/.test(tab.url || '')) return { error: 'Open a page first, then take the screenshot.' };
      const ready = await chrome.tabs.sendMessage(tab.id, { type: 'dictate:crop' }).catch(() => null);
      if (!ready?.ok) return { error: "Chrome doesn't let extensions capture this page. Try another page." };
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      return { ok: true };
    }
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
        ensureVisit({ id: anchor.tabId, url: anchor.url, title: anchor.title });
        const event = {
          type: 'page.mark', t: Date.now(), id: newId('w'),
          kind: 'pin', auto: true, note: noteId, n: state.markN, tabId: anchor.tabId, url: anchor.url, title: anchor.title, reference: isReference(anchor.url),
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
      await broadcastState();
      return { n: state.markN };
    }
    case 'note-close':
      state.talk = { open: false, noteId: null };
      await persist();
      await broadcastState();
      return { ok: true };
    case 'settings':
      if (payload.bindings) state.bindings = payload.bindings;
      await persist();
      await broadcastState();
      return publicState();
    case 'open': {
      // Open the site being reviewed in a normal browser window next to the studio.
      const bounds = {};
      for (const k of ['left', 'top', 'width', 'height']) if (Number.isFinite(payload[k])) bounds[k] = Math.round(payload[k]);
      const host = hostOf(payload.url);
      if (host && !state.site.home.some((h) => sameSite(h, host))) {
        state.site.home.push(host); // typed into the studio's "Your site" field
        await persist();
      }
      const win = await chrome.windows.create({ url: payload.url, focused: true, type: 'normal', ...bounds });
      if (win.tabs?.[0]) target = { tabId: win.tabs[0].id, windowId: win.id };
      return { ok: true };
    }
    default:
      return { error: `Unknown action ${action}` };
  }
}
