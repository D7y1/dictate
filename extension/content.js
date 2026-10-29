// Dictate content script.
// On the Dictate Studio page it is a bridge between the studio and the extension.
// On every other page it tracks the cursor, hovered and clicked elements, scrolling,
// selections and navigation while a session is recording, and runs annotate mode and the
// drag-to-crop Screenshot. On a reference site it also measures the look of what you mark.
// Typed values are never read.

(() => {
  if (window.__dictateLoaded) return;
  window.__dictateLoaded = true;

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);

  // Only a studio served from this computer can drive the extension; any other page that
  // copies the marker is tracked like a normal page.
  const local = location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (local && document.querySelector('meta[name="dictate-studio"]')) {
    bridge();
    return;
  }
  if (window.top !== window) return;
  tracker();

  // ======================================================================
  // Studio bridge
  // ======================================================================
  function bridge() {
    const hello = () => window.postMessage({ __dictate: 'ext', type: 'hello', payload: { version: chrome.runtime.getManifest().version } }, '*');
    window.addEventListener('message', async (e) => {
      if (e.source !== window || e.data?.__dictate !== 'studio') return;
      const { type, id, payload } = e.data;
      if (type === 'ping') return hello();
      let reply = null;
      let error = null;
      try {
        reply = await chrome.runtime.sendMessage({ type: 'dictate:studio', action: type, payload });
      } catch (err) {
        error = err.message;
      }
      window.postMessage({ __dictate: 'ext', type: 'reply', id, payload: reply, error }, '*');
    });
    // The talk key pressed on another page reaches the studio this way.
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'dictate:to-studio') window.postMessage({ __dictate: 'ext', type: 'push', payload: msg.payload }, '*');
    });
    hello();
  }

  // ======================================================================
  // Page tracker
  // ======================================================================
  function tracker() {
    let active = false;
    let paused = false;
    let startedAt = 0;
    let annotating = false;
    let buffer = [];
    let flushTimer = null;
    let lastMouse = { x: -1, y: -1 };
    let lastSampleAt = 0;
    let hoverEl = null;
    let hoverTimer = null;
    let lastUrl = location.href;
    let lastSelection = '';
    let ui = null;
    let binds = { talk: ['KeyT', 'MouseBack'], discard: ['Escape'], annotate: ['Alt+KeyA'], shot: ['Alt+KeyS'] };
    let scope = 'all'; // 'refs' in video review: only what you do while talking, pinning or capturing
    let reference = false; // this site is one the user is showing as inspiration
    let talking = false;
    let noteId = null;
    let annotatingBeforeTalk = false;

    // ---------- element description ----------

    const MEANINGFUL = 'a,button,input,select,textarea,label,img,video,picture,h1,h2,h3,h4,h5,h6,p,li,td,th,summary,figure,nav,header,footer,[role],[data-testid],[aria-label]';
    const HASHY = /^(css|sc|jsx|emotion|svelte|tw)-[a-z0-9]{4,}$|^[a-z]{1,3}[A-Za-z0-9_-]{5,}$/;

    function ownText(el) {
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) return true;
      return false;
    }

    function meaningful(el) {
      if (!el || el.nodeType !== 1) return null;
      if (el.closest('svg')) el = el.closest('a,button,[role="button"]') || el.closest('svg');
      let cur = el;
      for (let depth = 0; cur && cur !== document.body && depth < 5; depth++) {
        if (cur.matches(MEANINGFUL) || ownText(cur)) return cur;
        cur = cur.parentElement;
      }
      return el;
    }

    function isPrivate(el) {
      return el.matches('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
    }

    function stableClasses(el) {
      return [...el.classList].filter((c) => !HASHY.test(c)).slice(0, 6);
    }

    function cssPath(el) {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
        if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) {
          parts.unshift(`#${cur.id}`);
          break;
        }
        let part = cur.tagName.toLowerCase();
        const testid = cur.getAttribute('data-testid');
        if (testid) part += `[data-testid="${testid}"]`;
        else {
          const cls = stableClasses(cur).slice(0, 2);
          if (cls.length) part += cls.map((c) => `.${CSS.escape(c)}`).join('');
          const parent = cur.parentElement;
          if (parent) {
            const same = [...parent.children].filter((c) => c.tagName === cur.tagName);
            if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
          }
        }
        parts.unshift(part);
        try {
          if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
        } catch {
          break;
        }
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    }

    function openingTag(el) {
      const attrs = [];
      for (const a of el.attributes) {
        if (a.name === 'value' || a.name === 'style' || a.name.startsWith('on') || a.name === 'd') continue;
        let v = a.value;
        if (v.startsWith('data:')) v = 'data:…';
        if (v.length > 80) v = `${v.slice(0, 79)}…`;
        attrs.push(v === '' ? a.name : `${a.name}="${v.replace(/"/g, '&quot;')}"`);
      }
      const tag = el.tagName.toLowerCase();
      return `<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`;
    }

    function textOf(el) {
      if (isPrivate(el)) return '';
      const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      return t.length > 140 ? `${t.slice(0, 139)}…` : t;
    }

    // ---------- measured look (reference sites) ----------
    // A screenshot shows what a design looks like; these numbers make it reproducible.

    function hex(color) {
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(color || '');
      if (!m) return color || null;
      const a = m[4] == null ? 1 : Number(m[4]);
      if (a === 0) return null;
      const h = `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
      return a < 1 ? `${h} at ${Math.round(a * 100)}%` : h;
    }

    // The color the element sits on: its own background, or the nearest ancestor's.
    function surface(el) {
      for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
        const cs = getComputedStyle(cur);
        if (/gradient/.test(cs.backgroundImage)) return cs.backgroundImage.replace(/rgba?\([^)]+\)/g, (c) => hex(c) || 'transparent').slice(0, 160);
        const bg = hex(cs.backgroundColor);
        if (bg) return bg;
      }
      return null;
    }

    function lookOf(el) {
      const cs = getComputedStyle(el);
      const set = (v) => (v && v !== '0px' && v !== 'none' && v !== 'normal' ? v : undefined);
      const family = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      const flex = cs.display.includes('flex');
      const grid = cs.display.includes('grid');
      return {
        font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${family}`,
        color: hex(cs.color),
        background: surface(el),
        padding: set(cs.padding),
        radius: set(cs.borderRadius),
        border: parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' ? `${cs.borderTopWidth} ${cs.borderTopStyle} ${hex(cs.borderTopColor)}` : undefined,
        shadow: set(cs.boxShadow)?.replace(/rgba?\([^)]+\)/g, (c) => hex(c) || 'transparent').slice(0, 160),
        layout: flex || grid ? [flex ? `flex ${cs.flexDirection}` : `grid ${cs.gridTemplateColumns.slice(0, 80)}`, set(cs.gap) && `gap ${cs.gap}`].filter(Boolean).join(', ') : undefined,
      };
    }

    // The panel the element belongs to (a sidebar, a header), which is usually what was meant.
    const REGION = 'aside,nav,header,footer,dialog,[role="navigation"],[role="complementary"],[role="banner"],[role="dialog"],[role="menu"],[role="tablist"]';
    function regionOf(el) {
      const region = el.parentElement?.closest(REGION);
      if (!region || region === document.body) return null;
      const r = region.getBoundingClientRect();
      return {
        tag: region.tagName.toLowerCase(),
        id: region.id || undefined,
        cls: stableClasses(region),
        label: region.getAttribute('aria-label') || undefined,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        look: lookOf(region),
      };
    }

    function describe(el, { look = false } = {}) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const tag = el.tagName.toLowerCase();
      const text = textOf(el);
      const inner = isPrivate(el) || ['img', 'video', 'input', 'br', 'hr'].includes(tag) ? '' : text.slice(0, 120);
      const html = `${openingTag(el)}${inner}${['img', 'input', 'br', 'hr'].includes(tag) ? '' : `</${tag}>`}`;
      return {
        tag,
        id: el.id || undefined,
        cls: stableClasses(el),
        text: text || undefined,
        label: el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.getAttribute('name') || undefined,
        role: el.getAttribute('role') || undefined,
        href: el.getAttribute('href') || undefined,
        src: tag === 'img' ? (el.currentSrc || el.src || '').slice(0, 200) : undefined,
        testid: el.getAttribute('data-testid') || undefined,
        selector: cssPath(el),
        html: html.length > 400 ? `${html.slice(0, 399)}…` : html,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        look: look ? lookOf(el) : undefined,
        within: look ? regionOf(el) || undefined : undefined,
      };
    }

    // ---------- event plumbing ----------

    function push(event, { now = false } = {}) {
      if (!active || paused || (scope === 'refs' && !talking)) return;
      buffer.push({ t: Date.now(), url: location.href, ...event });
      if (now) flush(true);
      else if (!flushTimer) flushTimer = setTimeout(() => flush(false), 500);
    }

    function flush(urgent) {
      clearTimeout(flushTimer);
      flushTimer = null;
      if (!buffer.length) return;
      const events = buffer;
      buffer = [];
      send({ type: 'dictate:events', events, flush: urgent });
    }

    function visit() {
      if (!active || paused || scope === 'refs') return;
      const event = {
        type: 'page.visit',
        t: Date.now(),
        url: location.href,
        title: document.title,
        viewport: { w: innerWidth, h: innerHeight },
        dpr: devicePixelRatio,
        docH: document.documentElement.scrollHeight,
      };
      flush(true);
      send({ type: 'dictate:visit', event });
    }

    // ---------- listeners ----------

    function onMove(e) {
      if (!active || paused) return;
      lastMouse = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      if (now - lastSampleAt >= 100) {
        lastSampleAt = now;
        push({ type: 'page.mouse', x: e.clientX, y: e.clientY, sx: Math.round(scrollX), sy: Math.round(scrollY) });
      }
      if (annotating || ui?.cropping() || ui?.host.contains(e.target)) return;
      const el = meaningful(e.target);
      if (el === hoverEl) return;
      hoverEl = el;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => push({ type: 'page.hover', el: describe(el) }), 150);
    }

    function onClick(e) {
      if (!active || paused || annotating || ui?.host.contains(e.target)) return;
      push({ type: 'page.click', x: e.clientX, y: e.clientY, el: describe(meaningful(e.target)) }, { now: true });
    }

    let scrollTimer = null;
    function onScroll() {
      if (!active || paused || scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        push({ type: 'page.scroll', sy: Math.round(scrollY), maxY: document.documentElement.scrollHeight - innerHeight });
        ui?.repositionMarks();
      }, 400);
    }

    let selTimer = null;
    function onSelection() {
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        if (!active || paused) return;
        const sel = getSelection();
        const text = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
        if (text.length < 2 || text === lastSelection) return;
        const anchor = sel.anchorNode?.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
        if (anchor && isPrivate(anchor)) return;
        lastSelection = text;
        push({ type: 'page.select', text: text.slice(0, 500), el: describe(meaningful(anchor)) });
      }, 700);
    }

    function onFocus(e) {
      if (!active || paused) return;
      const el = e.target;
      if (el?.matches?.('input,textarea,select,[contenteditable]') && el.type !== 'password') push({ type: 'page.focus', el: describe(el) });
    }

    function isTypingTarget(e) {
      const t = e.composedPath?.()[0] || e.target;
      return !!t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
    }

    function elementAtPoint(x, y) {
      for (const el of document.elementsFromPoint(x, y)) if (el !== ui?.host) return meaningful(el);
      return null;
    }

    function elementUnderCursor() {
      return lastMouse.x < 0 ? null : elementAtPoint(lastMouse.x, lastMouse.y);
    }

    // Same binding names as the studio: 'KeyT', 'Alt+KeyA', 'MouseBack', 'MouseForward', 'MouseMiddle'.
    const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);
    function fromKey(e) {
      if (!e.code || MODIFIER_CODES.has(e.code)) return null;
      return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.code].filter(Boolean).join('+');
    }
    function fromMouse(e) {
      if (e.button === 0 || e.button === 2) return null;
      return { 1: 'MouseMiddle', 3: 'MouseBack', 4: 'MouseForward' }[e.button] || `Mouse${e.button + 1}`;
    }
    function boundAction(binding) {
      if (!binding) return null;
      if (binds.talk?.includes(binding)) return 'talk';
      if (binds.discard?.includes(binding)) return 'discard';
      if (binds.annotate?.includes(binding)) return 'annotate';
      if (binds.shot?.includes(binding)) return 'shot';
      return null;
    }

    function sendTalk(phase) {
      const el = phase === 'down' ? elementUnderCursor() : null;
      flush(true);
      send({
        type: 'dictate:talk',
        phase,
        x: lastMouse.x,
        y: lastMouse.y,
        sx: Math.round(scrollX),
        sy: Math.round(scrollY),
        viewport: { w: innerWidth, h: innerHeight },
        el: el ? describe(el, { look: reference }) : null,
      });
    }

    // rect is the dragged area in viewport pixels, or null for the whole visible screen.
    async function shoot(rect) {
      const el = rect ? elementAtPoint(rect.x + rect.w / 2, rect.y + rect.h / 2) : null;
      flush(true);
      const res = await send({ type: 'dictate:shot', rect, viewport: { w: innerWidth, h: innerHeight }, el: el ? describe(el, { look: reference }) : null });
      if (res?.error) ui?.notice(res.error);
    }

    function runBound(action, phase) {
      if (action === 'talk') sendTalk(phase);
      else if (phase !== 'down') return;
      else if (action === 'discard' && talking) send({ type: 'dictate:talk', phase: 'cancel' });
      else if (action === 'annotate') setAnnotating(!annotating);
      else if (action === 'shot') ui?.toggleCrop();
    }

    // Keys: the talk key is ignored while you type in the site's own fields.
    function onBoundKey(e) {
      if (!active || paused || isTypingTarget(e)) return false;
      const action = boundAction(fromKey(e));
      if (!action || (action === 'discard' && !talking)) return false;
      if (e.type === 'keyup' && action !== 'talk') return false;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) runBound(action, e.type === 'keydown' ? 'down' : 'up');
      return true;
    }

    // Middle and side buttons. While bound, their page defaults (going back or forward,
    // autoscroll, opening a link in a new tab) are cancelled so the review stays put.
    function onBoundMouse(e) {
      if (!active || paused) return;
      const action = boundAction(fromMouse(e));
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'mousedown') runBound(action, 'down');
      else if (e.type === 'mouseup') runBound(action, 'up');
    }

    function onKey(e) {
      if (!active) return;
      if (e.key === 'Escape' && ui?.cropping()) {
        e.preventDefault();
        e.stopPropagation();
        ui.cancelCrop();
        return;
      }
      if (onBoundKey(e)) return;
      if (annotating && !talking && e.key === 'Escape') {
        e.preventDefault();
        setAnnotating(false);
      }
    }

    function watchUrl() {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      ui?.clearMarks();
      setTimeout(visit, 300); // let single-page apps update the title
    }

    addEventListener('mousemove', onMove, { capture: true, passive: true });
    addEventListener('click', onClick, { capture: true, passive: true });
    addEventListener('scroll', onScroll, { capture: true, passive: true });
    addEventListener('keydown', onKey, { capture: true });
    addEventListener('keyup', onBoundKey, { capture: true });
    for (const type of ['mousedown', 'mouseup', 'auxclick']) addEventListener(type, onBoundMouse, { capture: true });
    addEventListener('focusin', onFocus, { capture: true, passive: true });
    document.addEventListener('selectionchange', onSelection);
    addEventListener('popstate', watchUrl);
    addEventListener('hashchange', watchUrl);
    setInterval(watchUrl, 500);
    addEventListener('pagehide', () => flush(true));
    // Coming back to this window: refresh what the toolbar says (which page of yours "for" names).
    addEventListener('focus', () => active && send({ type: 'dictate:hello' }).then((s) => s && applyState(s)));
    document.addEventListener('mouseleave', () => {
      hoverEl = null;
      clearTimeout(hoverTimer);
      push({ type: 'page.hover', el: null });
    });

    // ---------- annotate mode ----------

    function setAnnotating(on) {
      annotating = on && active && !paused;
      ui?.setMode(annotating);
    }

    async function mark(kind, data) {
      const event = { type: 'page.mark', t: Date.now(), id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, url: location.href, title: document.title, viewport: { w: innerWidth, h: innerHeight }, note: talking ? noteId : undefined, ...data };
      flush(true);
      const res = await send({ type: 'dictate:mark', event });
      return res?.n ?? null;
    }

    // ---------- state ----------

    // While a voice note is open, clicks pin elements instead of following links.
    function applyTalk(talk) {
      const open = !!talk?.open && active && !paused;
      if (open === talking) {
        noteId = talk?.noteId || noteId;
        return;
      }
      talking = open;
      noteId = open ? talk.noteId : null;
      if (open) {
        annotatingBeforeTalk = annotating;
        setAnnotating(true);
      } else {
        setAnnotating(annotatingBeforeTalk);
      }
      ui?.setTalking(open);
    }

    function applyState(s) {
      const wasActive = active;
      active = !!s.active;
      paused = !!s.paused;
      startedAt = s.startedAt || 0;
      scope = s.scope === 'refs' ? 'refs' : 'all';
      reference = !!s.reference;
      if (s.bindings) binds = { ...binds, ...s.bindings };
      if (active && !ui) ui = createUI();
      if (ui) ui.update({ active, paused, startedAt, marks: s.markN || 0, talk: binds.talk || [], shot: binds.shot || [], scope, reference, appliesTo: s.appliesTo });
      if (!active) {
        setAnnotating(false);
        ui?.cancelCrop();
      }
      applyTalk(s.talk);
      if (active && !wasActive && !paused) {
        lastUrl = location.href;
        if (document.visibilityState === 'visible') visit();
      }
    }

    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg.type === 'dictate:state') applyState(msg.state);
      else if (msg.type === 'dictate:ping') reply({ ok: true });
      else if (msg.type === 'dictate:draw-pin') ui?.addMark('pin', msg.n, { x: msg.x + scrollX, y: msg.y + scrollY, el: elementUnderCursor() });
      else if (msg.type === 'dictate:crop') {
        if (active && !paused) ui?.startCrop();
        reply({ ok: active && !paused });
      } else if (msg.type === 'dictate:pre-capture') {
        ui?.beforeCapture(msg.cursor === false ? { x: -1, y: -1 } : lastMouse);
        requestAnimationFrame(() => requestAnimationFrame(() => reply({ ok: true })));
        return true;
      } else if (msg.type === 'dictate:post-capture') {
        ui?.afterCapture();
        if (msg.shot) ui?.shotDone(msg.shot);
      }
      return false;
    });

    send({ type: 'dictate:hello' }).then((s) => s && applyState(s));

    // ======================================================================
    // In-page UI (shadow DOM so the site's CSS can't touch it)
    // ======================================================================
    function createUI() {
      const host = document.createElement('dictate-overlay');
      host.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${UI_CSS}</style>
        <div class="marks"></div>
        <div class="veil" hidden></div>
        <div class="hl" hidden><span class="hl-tag"></span></div>
        <div class="drag" hidden></div>
        <div class="cursor" hidden></div>
        <div class="crop" hidden><div class="crop-sel" hidden><span class="crop-size"></span></div></div>
        <div class="crop-hint" role="status" hidden>
          <span class="crop-legend">SCREENSHOT</span><span>Drag around the part you mean</span><span class="crop-dot">·</span><span>Click for the whole screen</span>
          <button class="crop-cancel" type="button">Cancel <kbd>Esc</kbd></button>
        </div>
        <div class="flash" hidden></div>
        <div class="bar" role="toolbar" aria-label="Dictate">
          <span class="grip" title="Drag to move"></span>
          <span class="tally" aria-hidden="true"></span>
          <span class="clock">00:00</span>
          <button class="loc" type="button" aria-pressed="false">YOUR SITE</button>
          <span class="for" hidden></span>
          <span class="sep"></span>
          <button class="seg seg-browse" data-mode="browse" aria-pressed="true">Browse</button>
          <button class="seg seg-annotate" data-mode="annotate" aria-pressed="false" title="Alt+A">Annotate <kbd>Alt A</kbd></button>
          <button class="seg seg-shot" type="button" title="Drag around the part you want Claude to see">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="shot-label">Screenshot</span><kbd class="shot-key">Alt S</kbd>
          </button>
          <span class="sep"></span>
          <span class="talk" aria-live="polite"><kbd class="talk-key">T</kbd><span class="talk-label">to talk</span></span>
          <span class="count" title="Marks placed">0 marks</span>
        </div>`;
      (document.body || document.documentElement).appendChild(host);

      const $ = (s) => root.querySelector(s);
      const bar = $('.bar');
      const veil = $('.veil');
      const hl = $('.hl');
      const hlTag = $('.hl-tag');
      const drag = $('.drag');
      const cursor = $('.cursor');
      const marksLayer = $('.marks');
      const cropEl = $('.crop');
      const sel = $('.crop-sel');
      const hint = $('.crop-hint');
      const flashEl = $('.flash');
      const loc = $('.loc');
      const shotLabel = $('.shot-label');
      const placed = [];
      let clockTimer = null;
      let start = null;
      let hoverTarget = null;
      let talkIdleLabel = 'to talk';
      let scopeNow = 'all';
      let crop = null; // { down } while you choose the area
      let savedTimer = null;
      let noticeTimer = null;

      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (btn) setAnnotating(btn.dataset.mode === 'annotate');
        else if (e.target.closest('.seg-shot')) toggleCrop();
      });

      // Your site / Reference: flips how Claude reads every page of this site.
      loc.addEventListener('click', () => {
        if (scopeNow === 'refs') return;
        if (bar.style.transform !== 'none') Object.assign(bar.style, { left: `${bar.getBoundingClientRect().left}px`, transform: 'none' });
        send({ type: 'dictate:role', reference: !reference });
      });

      // ---------- Screenshot: drag around the part you mean ----------

      function startCrop() {
        if (crop) return;
        crop = { down: null };
        cropEl.classList.remove('dragging');
        cropEl.hidden = false;
        sel.hidden = true;
        hint.hidden = false;
        hl.hidden = true;
        bar.classList.add('cropping');
      }

      function endCrop() {
        crop = null;
        cropEl.hidden = true;
        sel.hidden = true;
        hint.hidden = true;
        bar.classList.remove('cropping');
      }

      function toggleCrop() {
        if (crop) endCrop();
        else startCrop();
      }

      const clampX = (x) => Math.min(Math.max(0, x), innerWidth);
      const clampY = (y) => Math.min(Math.max(0, y), innerHeight);
      function dragged(e) {
        const x = clampX(e.clientX);
        const y = clampY(e.clientY);
        return { x: Math.min(crop.down.x, x), y: Math.min(crop.down.y, y), w: Math.abs(x - crop.down.x), h: Math.abs(y - crop.down.y) };
      }

      cropEl.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || !crop) return;
        e.preventDefault();
        cropEl.setPointerCapture(e.pointerId);
        crop.down = { x: e.clientX, y: e.clientY };
      });
      cropEl.addEventListener('pointermove', (e) => {
        if (!crop?.down) return;
        const r = dragged(e);
        if (r.w < 4 && r.h < 4) return;
        cropEl.classList.add('dragging');
        hint.hidden = true;
        sel.hidden = false;
        Object.assign(sel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
        sel.classList.toggle('near-top', r.y < 30);
        $('.crop-size').textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
      });
      cropEl.addEventListener('pointerup', (e) => {
        if (!crop?.down) return;
        const r = dragged(e);
        endCrop();
        // A click (or a sliver) means the whole visible screen.
        shoot(r.w >= 12 && r.h >= 12 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : null);
      });
      cropEl.addEventListener('pointercancel', () => endCrop());
      cropEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        endCrop();
      });
      $('.crop-cancel').addEventListener('click', () => endCrop());

      const keyText = (binding) => binding.split('+').map((p) => p.replace(/^Key|^Digit/, '').replace('Escape', 'Esc')).join(' ');

      function notice(text) {
        const count = root.querySelector('.count');
        const before = count.dataset.marks || count.textContent;
        count.dataset.marks = before;
        count.textContent = text;
        count.classList.add('notice');
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => {
          count.textContent = count.dataset.marks;
          delete count.dataset.marks;
          count.classList.remove('notice');
        }, 3200);
      }

      // Draggable toolbar, remembered per site.
      const posKey = `dictate-bar:${location.host}`;
      try {
        const saved = JSON.parse(localStorage.getItem(posKey) || 'null');
        if (saved) Object.assign(bar.style, { left: `${saved.x}px`, top: `${saved.y}px`, bottom: 'auto', transform: 'none' });
      } catch {
        // storage blocked
      }
      $('.grip').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const r = bar.getBoundingClientRect();
        const dx = e.clientX - r.left;
        const dy = e.clientY - r.top;
        const move = (ev) => {
          const x = Math.min(Math.max(4, ev.clientX - dx), innerWidth - r.width - 4);
          const y = Math.min(Math.max(4, ev.clientY - dy), innerHeight - r.height - 4);
          Object.assign(bar.style, { left: `${x}px`, top: `${y}px`, bottom: 'auto', transform: 'none' });
        };
        const up = () => {
          removeEventListener('pointermove', move, true);
          removeEventListener('pointerup', up, true);
          const nr = bar.getBoundingClientRect();
          try {
            localStorage.setItem(posKey, JSON.stringify({ x: Math.round(nr.left), y: Math.round(nr.top) }));
          } catch {
            // storage blocked
          }
        };
        addEventListener('pointermove', move, true);
        addEventListener('pointerup', up, true);
      });
      // A placed bar stays on screen when the window gets narrower.
      addEventListener('resize', () => {
        if (bar.style.transform !== 'none') return;
        const r = bar.getBoundingClientRect();
        bar.style.left = `${Math.max(4, Math.min(r.left, innerWidth - r.width - 4))}px`;
        if (bar.style.top) bar.style.top = `${Math.max(4, Math.min(r.top, innerHeight - r.height - 4))}px`;
      });

      // Annotate interactions happen on the veil, so the page never receives the click.
      function elementAt(x, y) {
        for (const el of document.elementsFromPoint(x, y)) if (el !== host) return meaningful(el);
        return null;
      }

      function showHighlight(el) {
        hoverTarget = el;
        if (!el) {
          hl.hidden = true;
          return;
        }
        const r = el.getBoundingClientRect();
        Object.assign(hl.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
        const cls = stableClasses(el).slice(0, 2).map((c) => `.${c}`).join('');
        hlTag.textContent = `${el.tagName.toLowerCase()}${cls}  ${Math.round(r.width)}×${Math.round(r.height)}`;
        hl.hidden = false;
      }

      let down = null;
      veil.addEventListener('pointermove', (e) => {
        lastMouse = { x: e.clientX, y: e.clientY };
        if (down) {
          const x = Math.min(down.x, e.clientX);
          const y = Math.min(down.y, e.clientY);
          const w = Math.abs(e.clientX - down.x);
          const h = Math.abs(e.clientY - down.y);
          if (w > 6 || h > 6) {
            down.dragging = true;
            hl.hidden = true;
            Object.assign(drag.style, { left: `${x + scrollX}px`, top: `${y + scrollY}px`, width: `${w}px`, height: `${h}px` });
            drag.hidden = false;
          }
          return;
        }
        showHighlight(elementAt(e.clientX, e.clientY));
      });
      veil.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        veil.setPointerCapture(e.pointerId);
        down = { x: e.clientX, y: e.clientY, dragging: false };
      });
      veil.addEventListener('pointerup', async (e) => {
        if (!down) return;
        const d = down;
        down = null;
        drag.hidden = true;
        if (d.dragging) {
          const x = Math.min(d.x, e.clientX);
          const y = Math.min(d.y, e.clientY);
          const w = Math.abs(e.clientX - d.x);
          const h = Math.abs(e.clientY - d.y);
          const inside = elementAt(x + w / 2, y + h / 2);
          const local = { x: x + scrollX, y: y + scrollY, w, h };
          const n = await mark('box', { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), sx: Math.round(scrollX), sy: Math.round(scrollY), el: describe(inside, { look: reference }) });
          if (n != null) addMark('box', n, local);
        } else {
          const el = hoverTarget || elementAt(e.clientX, e.clientY);
          const n = await mark('pin', { x: Math.round(e.clientX), y: Math.round(e.clientY), sx: Math.round(scrollX), sy: Math.round(scrollY), el: describe(el, { look: reference }) });
          if (n != null) addMark('pin', n, { x: e.clientX + scrollX, y: e.clientY + scrollY, el });
        }
      });

      function addMark(kind, n, pos) {
        const node = document.createElement('div');
        node.className = `mark mark-${kind}`;
        if (kind === 'box') {
          Object.assign(node.style, { left: `${pos.x}px`, top: `${pos.y}px`, width: `${pos.w}px`, height: `${pos.h}px` });
          node.innerHTML = `<span class="mark-label">B${n}</span>`;
        } else {
          if (pos.el) {
            const r = pos.el.getBoundingClientRect();
            const ring = document.createElement('div');
            ring.className = 'mark-outline';
            Object.assign(ring.style, { left: `${r.left + scrollX}px`, top: `${r.top + scrollY}px`, width: `${r.width}px`, height: `${r.height}px` });
            marksLayer.appendChild(ring);
            placed.push(ring);
          }
          Object.assign(node.style, { left: `${pos.x}px`, top: `${pos.y}px` });
          node.innerHTML = `<span class="mark-label">P${n}</span>`;
        }
        marksLayer.appendChild(node);
        placed.push(node);
        setCount(n);
      }

      function setCount(n) {
        const count = root.querySelector('.count');
        const text = `${n} ${n === 1 ? 'mark' : 'marks'}`;
        if (count.classList.contains('notice')) count.dataset.marks = text;
        else count.textContent = text;
      }

      function tick() {
        if (!start) return;
        const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = String(s % 60).padStart(2, '0');
        root.querySelector('.clock').textContent = h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
      }

      return {
        host,
        addMark,
        notice,
        startCrop,
        toggleCrop,
        cropping: () => !!crop,
        cancelCrop() {
          if (crop) endCrop();
        },
        // The capture landed: flash the area that was saved and confirm it on the bar.
        shotDone({ n, ok, rect }) {
          if (!ok) {
            notice("Chrome didn't allow that screenshot. Try again.");
            return;
          }
          const r = rect || { x: 0, y: 0, w: innerWidth, h: innerHeight };
          Object.assign(flashEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
          flashEl.hidden = false;
          flashEl.classList.remove('go');
          void flashEl.offsetWidth;
          flashEl.classList.add('go');
          setTimeout(() => {
            flashEl.hidden = true;
          }, 500);
          setCount(n);
          const tag = document.createElement('span');
          tag.className = 'mark-label';
          tag.textContent = `S${n}`;
          shotLabel.replaceChildren(tag, 'saved');
          clearTimeout(savedTimer);
          savedTimer = setTimeout(() => {
            shotLabel.textContent = 'Screenshot';
          }, 1800);
        },
        setTalking(open) {
          bar.classList.toggle('talking', open);
          const key = root.querySelector('.talk-key');
          const hasKey = !key.hidden;
          root.querySelector('.talk-label').textContent = open ? (hasKey ? 'TALKING · press again to finish' : 'TALKING · click again to finish') : talkIdleLabel;
        },
        update({ active: on, paused: isPaused, startedAt: since, marks, talk = [], shot = [], scope: sc = 'all', reference: isRef = false, appliesTo = null }) {
          const keyBinding = talk.find((b) => !b.startsWith('Mouse'));
          const mouse = talk.find((b) => b.startsWith('Mouse'));
          const key = root.querySelector('.talk-key');
          key.hidden = !keyBinding;
          if (keyBinding) key.textContent = keyText(keyBinding);
          const shotKey = shot.find((b) => !b.startsWith('Mouse'));
          const sk = root.querySelector('.shot-key');
          sk.hidden = !shotKey;
          if (shotKey) sk.textContent = keyText(shotKey);

          scopeNow = sc;
          bar.classList.toggle('reference', isRef);
          loc.textContent = isRef ? 'REFERENCE' : 'YOUR SITE';
          loc.setAttribute('aria-pressed', String(isRef));
          loc.setAttribute('aria-disabled', String(sc === 'refs'));
          loc.title = sc === 'refs'
            ? 'Video review: every site you show here is a reference for your video.'
            : isRef ? 'Claude reads this site as inspiration, not your code. Click if it is your site.' : 'Claude reads this as your site. Click if it is a reference you are showing.';
          const forText = isRef && appliesTo ? `for ${appliesTo}` : '';
          const forEl = root.querySelector('.for');
          forEl.textContent = forText;
          forEl.title = forText;
          forEl.hidden = !forText;
          talkIdleLabel = keyBinding && mouse ? 'or side button to talk' : mouse ? 'Side button to talk' : 'to talk';
          if (!bar.classList.contains('talking')) root.querySelector('.talk-label').textContent = talkIdleLabel;
          host.style.display = on ? '' : 'none';
          bar.classList.toggle('paused', isPaused);
          start = since;
          clearInterval(clockTimer);
          if (on) {
            tick();
            clockTimer = setInterval(tick, 1000);
          }
          setCount(marks);
          if (!on) this.clearMarks();
        },
        setMode(on) {
          veil.hidden = !on;
          hl.hidden = true;
          bar.classList.toggle('annotating', on);
          root.querySelector('.seg-browse').setAttribute('aria-pressed', String(!on));
          root.querySelector('.seg-annotate').setAttribute('aria-pressed', String(on));
        },
        clearMarks() {
          for (const n of placed.splice(0)) n.remove();
        },
        repositionMarks() {},
        beforeCapture(mouse) {
          bar.style.visibility = 'hidden';
          hl.style.visibility = 'hidden';
          flashEl.style.visibility = 'hidden';
          if (mouse.x >= 0) {
            Object.assign(cursor.style, { left: `${mouse.x + scrollX}px`, top: `${mouse.y + scrollY}px` });
            cursor.hidden = false;
          }
        },
        afterCapture() {
          bar.style.visibility = '';
          hl.style.visibility = '';
          flashEl.style.visibility = '';
          cursor.hidden = true;
        },
      };
    }
  }

  // Broadcast-gallery styling, matching Dictate Studio. Plain CSS inside the shadow root.
  var UI_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .bar {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 24px);
      display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 6px 0 6px; white-space: nowrap;
      background: #121315; color: #f2f2ee; border: 1px solid #2c2f34; border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.4), 0 1px 0 rgba(255,255,255,.05) inset;
      font: 500 13px/1 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
      user-select: none; pointer-events: auto;
    }
    .bar > * { flex: none; }
    .grip { width: 10px; height: 22px; cursor: grab; background-image: radial-gradient(#5b5e63 1px, transparent 1.3px); background-size: 4px 4px; }
    .tally { width: 10px; height: 10px; border-radius: 50%; background: #e23b2e; box-shadow: 0 0 0 3px rgba(226,59,46,.25); }
    .bar.paused .tally { background: #5b5e63; box-shadow: none; }
    .clock { font: 600 13px/1 "Cascadia Mono", Consolas, ui-monospace, monospace; font-variant-numeric: tabular-nums; min-width: 44px; }
    .sep { width: 1px; height: 22px; background: #2c2f34; }
    .seg { all: unset; cursor: pointer; height: 32px; padding: 0 12px; border-radius: 6px; color: #9a9ea6; display: inline-flex; align-items: center; gap: 8px; }
    .seg:hover { color: #f2f2ee; background: #1e2023; }
    .seg[aria-pressed="true"] { color: #f2f2ee; background: #2a2d32; box-shadow: 0 0 0 1px #3a3e44 inset; }
    .seg:focus-visible { outline: 2px solid #f3b33d; outline-offset: 2px; }
    kbd { font: 600 10px/1 "Cascadia Mono", Consolas, monospace; padding: 3px 5px; border-radius: 4px; border: 1px solid #3a3e44; color: #9a9ea6; background: #1a1c1f; }
    .talk { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border-radius: 6px; color: #9a9ea6; }
    .bar.talking .talk { background: #e23b2e; color: #fff; font-weight: 700; letter-spacing: .02em; }
    .bar.talking .talk kbd { border-color: rgba(255,255,255,.5); color: #fff; background: rgba(0,0,0,.18); }
    .bar.talking { box-shadow: 0 0 0 2px rgba(226,59,46,.55), 0 12px 32px rgba(0,0,0,.4); }
    .count { color: #9a9ea6; font-variant-numeric: tabular-nums; padding-right: 6px; }
    .veil { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: transparent; }
    .hl { position: absolute; pointer-events: none; outline: 2px solid #f3b33d; outline-offset: 1px; background: rgba(243,179,61,.10); border-radius: 2px; }
    .hl-tag { position: absolute; left: -2px; top: -24px; white-space: nowrap; padding: 4px 6px; border-radius: 4px; background: #f3b33d; color: #121315; font: 600 11px/1 "Cascadia Mono", Consolas, monospace; }
    .drag { position: absolute; pointer-events: none; border: 2px dashed #f3b33d; background: rgba(243,179,61,.10); }
    .marks { position: absolute; top: 0; left: 0; pointer-events: none; }
    .mark { position: absolute; pointer-events: none; }
    .mark-pin { width: 0; height: 0; }
    .mark-pin::before { content: ""; position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; border-radius: 50%; background: #f3b33d; border: 2px solid #121315; }
    .mark-pin .mark-label { position: absolute; left: 10px; top: -24px; }
    .mark-box { border: 2px dashed #f3b33d; background: rgba(243,179,61,.08); }
    .mark-box .mark-label { position: absolute; left: -2px; top: -24px; }
    .mark-outline { position: absolute; pointer-events: none; outline: 2px solid #f3b33d; outline-offset: 2px; }
    .mark-label { padding: 4px 7px; border-radius: 3px; background: #f3b33d; color: #121315; font: 700 12px/1 "Cascadia Mono", Consolas, monospace; white-space: nowrap; }
    .cursor { position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; border: 4px solid #e23b2e; box-shadow: 0 0 0 2px rgba(255,255,255,.9); pointer-events: none; }
    /* Where you are: your site (page blue, quiet) or a reference (page blue, lit). */
    .loc { all: unset; box-sizing: border-box; cursor: pointer; height: 24px; padding: 0 8px; border-radius: 3px; display: inline-flex; align-items: center; white-space: nowrap;
      font: 700 11px/1 "Cascadia Mono", Consolas, monospace; letter-spacing: .06em; color: #8fa6d1; background: #1e2737; box-shadow: 0 0 0 1px #2c3a52 inset; transition: box-shadow .15s; }
    .loc:hover { box-shadow: 0 0 0 1px #8fa6d1 inset; }
    .loc:focus-visible { outline: 2px solid #f3b33d; outline-offset: 2px; }
    .bar.reference .loc { background: #8fa6d1; color: #121315; box-shadow: none; }
    .loc[aria-disabled="true"] { cursor: default; }
    .for { margin-left: -4px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 500 12px/1 "Cascadia Mono", Consolas, monospace; color: #9a9ea6; }
    .seg svg { width: 16px; height: 16px; flex: none; }
    .shot-label { display: inline-flex; align-items: center; gap: 6px; }
    .shot-label .mark-label { padding: 3px 6px; font-size: 11px; }
    .count.notice { color: #f2f2ee; }
    .bar.cropping { visibility: hidden; }
    .crop { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(5,5,6,.42); }
    .crop.dragging { background: transparent; }
    .crop-sel { position: fixed; pointer-events: none; outline: 2px solid #f3b33d; box-shadow: 0 0 0 100vmax rgba(5,5,6,.42); }
    .crop-size { position: absolute; left: -2px; top: -26px; padding: 4px 7px; border-radius: 3px; background: #f3b33d; color: #121315; white-space: nowrap;
      font: 700 12px/1 "Cascadia Mono", Consolas, monospace; font-variant-numeric: tabular-nums; }
    .crop-sel.near-top .crop-size { left: 6px; top: 6px; }
    .crop-hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 6px 0 14px;
      background: #050506; color: #f2f2ee; border: 1px solid #2c2f34; border-radius: 4px; box-shadow: 0 12px 32px rgba(0,0,0,.4); pointer-events: auto; white-space: nowrap;
      font: 500 13px/1 "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
    .crop-legend { font: 600 12px/1 "Cascadia Mono", Consolas, monospace; letter-spacing: .12em; color: #9a9ea6; }
    .crop-dot { color: #5b5e63; }
    .crop-cancel { all: unset; cursor: pointer; height: 28px; padding: 0 6px 0 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; color: #9a9ea6; }
    .crop-cancel:hover { background: #1e2023; color: #f2f2ee; }
    .crop-cancel:focus-visible { outline: 2px solid #f3b33d; outline-offset: 2px; }
    .flash { position: fixed; pointer-events: none; background: #fff; opacity: 0; }
    .flash.go { animation: dictate-flash .45s cubic-bezier(.16, 1, .3, 1); }
    @keyframes dictate-flash { from { opacity: .5; } to { opacity: 0; } }
    @media (max-width: 1180px) { .for { display: none; } .seg kbd { display: none; } }
    @media (max-width: 860px) { .crop-hint > span:nth-child(n+3) { display: none; } .talk-label { display: none; } }
    @media (prefers-reduced-motion: reduce) { .flash.go { animation-duration: .01s; } }
    [hidden] { display: none !important; }
  `;
})();
