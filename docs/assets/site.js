// The Dictate site. One idea runs through all of it: whatever you point at, Dictate knows
// exactly what you mean. A dashed amber box carries that from the hero to the transcript.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 981px)');
const touch = matchMedia('(hover: none)');

// While you're trying it on this page, everything else on the page holds still.
let trying = false;
const holds = [];
const setTrying = (on) => {
  trying = on;
  for (const hold of holds) hold(on);
};
let heroLeaveTry = () => {};

// --- Navigation -------------------------------------------------------------

const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// --- Copy -------------------------------------------------------------------

for (const button of $$('[data-copy]')) {
  let timer;
  let noteTimer;
  const after = $('.after-copy', button.parentElement);
  const pitch = button.closest('.pitch');
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    clearTimeout(noteTimer);
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
      button.classList.add('copied');
      // The next step, where you're already looking.
      after.innerHTML = 'Now run it, then type <code>/dictate</code> in Claude Code.';
      after.classList.add('on');
      if (pitch) {
        pitch.classList.add('just-copied');
        heroLeaveTry();
      }
      noteTimer = setTimeout(() => {
        after.classList.remove('on');
        pitch?.classList.remove('just-copied');
      }, 7000);
    } catch {
      // No clipboard access: select the command so Ctrl+C works.
      getSelection().selectAllChildren($('code', button.parentElement));
      button.textContent = 'Press Ctrl+C';
    }
    timer = setTimeout(() => {
      button.textContent = 'Copy';
      button.classList.remove('copied');
    }, 1800);
  });
}

// --- Hero demo --------------------------------------------------------------
// Plays on its own, moving from one thing to the next, then walks off the card onto this page.
// Point at the card and it follows you.

const demo = $('#demo');
if (demo) {
  const site = $('.site', demo);
  const pin = $('.pin', demo);
  const cursor = $('.cursor', demo);
  const text = $('.say-text', demo);
  const rec = $('.rec', demo);
  const tag = $('.pin-tag', demo);
  const start = $('[data-start]', demo);
  const card = [start, $('.site-title', demo), $('.mug-spot', demo)];
  const page = [$('.pitch .install'), $('#try')];
  const PIN_PAD = 10;
  if (touch.matches) page[1].dataset.say = 'Tap this and try it yourself.';
  let current = null;
  let step = 0;
  let timer = null;
  let recTimer = null;
  let visible = true;
  let pointing = false;

  // Side by side, the box can reach the install bar. Stacked, it would leave the screen.
  // The Try button steps aside for the line that follows Copy.
  const tour = () => (wide.matches ? [...card, ...page.filter((el) => !el.closest('.just-copied') || el.matches('.install'))] : card);

  function speak(sentence) {
    const words = sentence.split(' ');
    text.replaceChildren(...words.map((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', i);
      if (word === 'this') span.append(Object.assign(document.createElement('mark'), { textContent: word }));
      else span.textContent = word;
      if (i < words.length - 1) span.append(' ');
      return span;
    }));
    rec.classList.add('talk');
    clearTimeout(recTimer);
    recTimer = setTimeout(() => rec.classList.remove('talk'), words.length * 120 + 500);
  }

  function place(el) {
    const box = site.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    Object.assign(pin.style, {
      left: `${r.left - box.left - PIN_PAD}px`,
      top: `${r.top - box.top - PIN_PAD}px`,
      width: `${r.width + PIN_PAD * 2}px`,
      height: `${r.height + PIN_PAD * 2}px`,
    });
    // The tag sits on the box's right. Near the card's edge it moves to the left.
    const under = el.dataset.tag === 'under';
    pin.classList.toggle('under', under);
    pin.classList.toggle('flip', !under && box.right - r.right - PIN_PAD < tag.offsetWidth + 18);
    // The arrow's tip is 5px in and 3px down from the corner of its SVG.
    const [x, y] = (el.dataset.cursor || '0.86 0.8').split(' ').map(Number);
    cursor.style.transform = `translate(${r.left - box.left + r.width * x - 5}px, ${r.top - box.top + r.height * y - 3}px)`;
  }

  function point(el) {
    if (el === current) return;
    current = el;
    place(el);
    pin.classList.add('on');
    cursor.classList.add('on');
    speak(el.dataset.say);
  }

  function schedule() {
    clearTimeout(timer);
    if (calm.matches || pointing || !visible || trying) return;
    timer = setTimeout(() => {
      const stops = tour();
      step = (step + 1) % stops.length;
      point(stops[step]);
      schedule();
    }, 4800);
  }

  holds.push((held) => {
    if (held) clearTimeout(timer);
    else schedule();
  });

  heroLeaveTry = () => {
    if (current !== page[1]) return;
    step = card.length;
    point(page[0]);
    schedule();
  };

  site.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-say]');
    if (el && !trying) point(el);
  });
  site.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    pointing = true;
    site.classList.add('pointing');
    schedule();
  });
  site.addEventListener('pointerleave', () => {
    pointing = false;
    site.classList.remove('pointing');
    schedule();
  });

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }).observe(demo);

  addEventListener('resize', () => {
    if (!current) return;
    if (!wide.matches && page.includes(current)) {
      step = 0;
      point(start);
    } else place(current);
  });

  // The page starts on the button with its sentence already showing. Measure once the fonts
  // and the mug are in, so the pin lands exactly, and only then let it glide.
  Promise.all([document.fonts.ready, ...$$('img', site).map((img) => img.decode().catch(() => {}))]).then(() => {
    current = start;
    place(start);
    pin.classList.add('on');
    cursor.classList.add('on');
    site.classList.add('live');
    requestAnimationFrame(() => requestAnimationFrame(() => site.classList.add('glide')));
    schedule();
  });
}

// --- What you say, what Claude gets ------------------------------------------

const tabs = $$('[role="tab"]');
if (tabs.length) {
  const tablist = $('[role="tablist"]');
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  const thumb = Object.assign(document.createElement('span'), { className: 'tab-thumb' });
  thumb.setAttribute('aria-hidden', 'true');
  tablist.prepend(thumb);

  function moveThumb() {
    const tab = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
    thumb.style.width = `${tab.offsetWidth}px`;
    thumb.style.transform = `translateX(${tab.offsetLeft}px)`;
  }

  // A wire from the spoken word to the report line it resolves to. It runs above the words and
  // down the gutter, so it never crosses text.
  function wire(panel) {
    const pane = $('.pane-gets', panel);
    const box = panel.getBoundingClientRect();
    if (!box.width || !wide.matches) return;
    let svg = $('.wire', panel);
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'wire');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path pathLength="1"/><circle r="3"/><circle class="wire-end" r="3"/>';
      panel.append(svg);
    }
    const mark = $('.spoken mark', panel).getBoundingClientRect();
    const hit = $('.hit', panel).getClientRects()[0];
    const gets = pane.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(pane).paddingLeft);
    const x1 = mark.left + mark.width / 2 - box.left;
    const y1 = mark.top - box.top - 2;
    const band = Math.max(10, y1 - 15);
    const gutter = gets.left - box.left + pad * 0.42;
    const y2 = hit.top + hit.height / 2 - box.top;
    const x2 = gets.left - box.left + pad - 9;
    const r = 9;
    const [path, from, to] = svg.children;
    path.setAttribute('d', `M${x1} ${y1}V${band + r}Q${x1} ${band} ${x1 + r} ${band}H${gutter - r}Q${gutter} ${band} ${gutter} ${band + r}V${y2 - r}Q${gutter} ${y2} ${gutter + r} ${y2}H${x2}`);
    from.setAttribute('cx', x1);
    from.setAttribute('cy', y1);
    to.setAttribute('cx', x2);
    to.setAttribute('cy', y2);
  }

  function draw(panel) {
    wire(panel);
    panel.classList.remove('drawn');
    void panel.offsetWidth;
    panel.classList.add('drawn');
  }

  function select(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', on);
      other.tabIndex = on ? 0 : -1;
      const panel = panelOf(other);
      panel.hidden = !on;
      panel.classList.toggle('enter', on);
    }
    moveThumb();
    draw(panelOf(tab));
    if (focus) tab.focus();
  }

  tablist.hidden = false;
  for (const tab of tabs) panelOf(tab).hidden = tab !== tabs[0];

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });
  });

  const shown = () => panelOf(tabs.find((t) => t.getAttribute('aria-selected') === 'true'));

  document.fonts.ready.then(() => {
    moveThumb();
    wire(shown());
    requestAnimationFrame(() => requestAnimationFrame(() => thumb.classList.add('glide')));
  });

  addEventListener('resize', () => {
    moveThumb();
    wire(shown());
  });

  // Draw it the first time you reach it.
  new IntersectionObserver(([entry], io) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    draw(shown());
  }, { threshold: 0.45 }).observe(panelOf(tabs[0]));
}

// --- The steps walk the real studio -------------------------------------------

const stepItems = $$('.steps > li[data-spot]');
const stepPin = $('.step-pin');
if (stepItems.length && stepPin) {
  const shot = $('.shot');
  const tag = $('.pin-tag', stepPin);
  let active = -1;
  let timer = null;
  let visible = false;
  let holding = false;

  function show(i) {
    if (i === active) return;
    active = i;
    const item = stepItems[i];
    const [left, top, width, height] = item.dataset.spot.split(' ');
    Object.assign(stepPin.style, { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` });
    tag.textContent = item.dataset.tag;
    stepPin.classList.toggle('under', item.dataset.side === 'under');
    stepPin.classList.toggle('under-end', item.dataset.side === 'under-end');
    stepPin.classList.add('on');
    stepItems.forEach((other) => other.classList.toggle('on', other === item));
  }

  function schedule() {
    clearTimeout(timer);
    if (calm.matches || holding || !visible || trying) return;
    timer = setTimeout(() => {
      show((active + 1) % stepItems.length);
      schedule();
    }, 3400);
  }

  holds.push(schedule);

  stepItems.forEach((item, i) => {
    item.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      holding = true;
      show(i);
      schedule();
    });
    item.addEventListener('pointerleave', () => {
      holding = false;
      schedule();
    });
  });

  show(0);
  requestAnimationFrame(() => requestAnimationFrame(() => stepPin.classList.add('glide')));

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    schedule();
  }, { threshold: 0.3 }).observe(shot);
}

// --- The transcript plays at its own timestamps --------------------------------

const timed = $('.timed');
if (timed && !calm.matches) {
  const words = $$('.w', timed);
  const resolved = $('.resolved');
  const lines = $$('li', resolved);
  const replay = $('.replay');
  const timeOf = (w) => parseFloat($('i', w).textContent);
  const t0 = timeOf(words[0]);
  let timers = [];

  function play() {
    timers.forEach(clearTimeout);
    timers = [];
    for (const el of [...words, ...lines]) el.classList.remove('said');
    timed.classList.add('playing');
    resolved.classList.add('playing');
    let line = 0;
    let end = 0;
    for (const w of words) {
      const at = (timeOf(w) - t0) * 1000 + 300;
      end = at;
      const lands = $('mark', w) ? lines[line++] : null;
      timers.push(setTimeout(() => {
        w.classList.add('said');
        if (lands) timers.push(setTimeout(() => lands.classList.add('said'), 220));
      }, at));
    }
    timers.push(setTimeout(() => {
      timed.classList.remove('playing');
      resolved.classList.remove('playing');
    }, end + 900));
  }

  replay.hidden = false;
  replay.addEventListener('click', play);

  new IntersectionObserver(([entry], io) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    if (!trying) play();
  }, { threshold: 0.7 }).observe(timed);
}

// --- Try it on this page --------------------------------------------------------
// This page answers to T the way a reviewed site does. What it builds follows extension/content.js
// and server/compile.js, so the report is the real format, made from this page's real elements.
// Nothing leaves the tab, except what the browser's speech service hears if you press the mic.

const panel = $('#tp');
if (panel) {
  const tryButton = $('#try');
  const hoverBox = $('#tp-box');
  const hint = $('#tp-hint');
  const reportEl = $('#tp-report');
  const form = $('#tp-say');
  const input = $('#tp-input');
  const micButton = $('#tp-mic');
  const micNote = $('#tp-mic-note');
  const foot = $('#tp-foot');
  const copyButton = $('#tp-copy');
  const closeButton = $('#tp-close');
  const installLink = $('#tp-install');

  const MEANINGFUL = 'a,button,input,select,textarea,label,img,video,picture,h1,h2,h3,h4,h5,h6,p,li,td,th,summary,figure,nav,header,footer,[role],[data-testid],[aria-label]';
  const HASHY = /^(css|sc|jsx|emotion|svelte|tw)-[a-z0-9]{4,}$|^[a-z]{1,3}[A-Za-z0-9_-]{5,}$/;
  const POINTING_WORDS = new Set([
    'this', 'that', 'here', 'there', 'these', 'those',
    'هذا', 'هذه', 'هذي', 'هاذا', 'هاذي', 'ذا', 'ذي', 'هنا', 'هناك', 'هنيه', 'هنيا', 'كذا', 'ذول', 'هذول', 'هذولا',
  ]);
  // Page furniture: nothing a person means by pointing at it.
  const FURNITURE = 'html,body,main,section,header,footer,nav,.wrap,.hero-grid,.pitch,.demo,.site,.site-body,.pane,.split,.steps,.shot,.shot-frame,.timed,.timed-ar,.facts,.skip,.more-row';
  const PIN_PAD = 6;

  let state = 'off'; // off, armed, noting
  let t0 = 0;
  let pinCount = 0;
  const notes = [];
  let draft = null;
  const pinned = []; // { el, box }
  let hovered = null; // what the box is on now
  let pointer = null; // { x, y }
  let frame = 0;
  let listening = null;

  // ---------- what the extension would record ----------

  function ownText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) return true;
    return false;
  }

  function pick(target) {
    if (!(target instanceof Element)) return null;
    let el = target;
    if (el.classList.contains('mug-spot')) return $('img', el.parentElement);
    if (el.closest('svg')) el = el.closest('a,button,[role="button"]') || el.closest('svg');
    if (el.closest('.tp, #try, .tp-pin, .tp-box')) return null;
    let cur = el;
    for (let depth = 0; cur && cur !== document.body && depth < 5; depth++) {
      if (cur.matches(MEANINGFUL) || ownText(cur)) return cur.matches(FURNITURE) ? null : cur;
      cur = cur.parentElement;
    }
    return el.matches(FURNITURE) ? null : el;
  }

  const stableClasses = (el) => [...el.classList].filter((c) => !HASHY.test(c)).slice(0, 6);

  function cssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement && parts.length < 6) {
      if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) {
        parts.unshift(`#${cur.id}`);
        break;
      }
      let part = cur.tagName.toLowerCase();
      const cls = stableClasses(cur).slice(0, 2);
      if (cls.length) part += cls.map((c) => `.${CSS.escape(c)}`).join('');
      const parent = cur.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
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
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 140 ? `${t.slice(0, 139)}…` : t;
  }

  function describe(el) {
    const r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const text = textOf(el);
    const empty = ['img', 'video', 'input', 'br', 'hr'].includes(tag);
    const html = `${openingTag(el)}${empty ? '' : text.slice(0, 120)}${['img', 'input', 'br', 'hr'].includes(tag) ? '' : `</${tag}>`}`;
    return {
      tag,
      id: el.id || undefined,
      cls: stableClasses(el),
      text: text || undefined,
      label: el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || undefined,
      selector: cssPath(el),
      html: html.length > 400 ? `${html.slice(0, 399)}…` : html,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      viewport: { w: innerWidth, h: innerHeight },
    };
  }

  // ---------- the report, as server/compile.js writes it ----------

  const truncate = (s, n) => {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  };
  const cleanWord = (w) => String(w).toLowerCase().replace(/[.,!?;:"'“”‘’()«»،؟…]/g, '').trim();

  function describeEl(el) {
    const id = el.id ? `#${el.id}` : '';
    const cls = (el.cls || []).slice(0, 3).map((c) => `.${c}`).join('');
    const name = el.text || el.label || '';
    return `\`${el.tag}${id}${cls}\`${name ? ` "${truncate(name, 80)}"` : ''}`;
  }

  function fmtClock(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Each pointing word resolves to whatever you were on the moment it appeared, as it does in a
  // real session. Move the mouse between "this" and "that" and they land on different things.
  function resolvePointing(note) {
    const seen = new Map();
    note.pointing = note.text.split(/\s+/).map(cleanWord).filter((w) => POINTING_WORDS.has(w)).slice(0, 6).map((word) => {
      const n = seen.get(word) || 0;
      seen.set(word, n + 1);
      const key = `${word}:${n}`;
      if (!note.resolved.has(key)) {
        const on = hovered || note.pins.at(-1).el;
        note.resolved.set(key, describe(on));
      }
      return { word, el: note.resolved.get(key) };
    });
  }

  function noteLines(note, n) {
    const lines = [
      { kind: 'h', md: `### ${n}. ${location.pathname} · ${fmtClock(note.at)} into the session` },
      { kind: 'page', md: `Page: [${truncate(document.title, 90)}](${location.href.split('#')[0]})` },
      { kind: 'q', md: `> ${note.text}`, text: note.text },
    ];
    if (!note.spoken) lines.push({ kind: 'li', md: '- **Typed note** (not spoken)' });
    for (const pin of note.pins) {
      const d = pin.desc;
      lines.push({ kind: 'li', md: `- **Pin ${pin.id}** → ${describeEl(d)}` });
      lines.push({ kind: 'sub', md: `  - selector: \`${d.selector}\`` });
      lines.push({ kind: 'sub', md: `  - html: \`${truncate(d.html, 220)}\`` });
      const r = d.rect;
      lines.push({ kind: 'sub', md: `  - element box: ${r.x},${r.y} · ${r.w}×${r.h} px in a ${d.viewport.w}×${d.viewport.h} viewport` });
    }
    for (const p of note.pointing) lines.push({ kind: 'hit', md: `- **Pointing** "${p.word}" → ${describeEl(p.el)}` });
    return lines;
  }

  const reportMarkdown = () => notes.map((note, i) => {
    const lines = noteLines(note, i + 1);
    const head = lines.filter((l) => ['h', 'page', 'q'].includes(l.kind)).map((l) => l.md);
    const bullets = lines.filter((l) => !['h', 'page', 'q'].includes(l.kind)).map((l) => l.md);
    return [...head, bullets.join('\n')].join('\n\n');
  }).join('\n\n');

  // On screen: bold labels, no ** or backticks, the same as the examples above.
  function plain(md) {
    const fragment = document.createDocumentFragment();
    const clean = md.replace(/^\s*- /, '').replace(/`/g, '').replace(/\[([^\]]*)\]\(([^)]*)\)/, '$1 ($2)');
    clean.split(/\*\*/).forEach((part, i) => {
      if (!part) return;
      fragment.append(i % 2 ? Object.assign(document.createElement('b'), { textContent: part }) : part);
    });
    return fragment;
  }

  function renderNote(note, n) {
    const wrap = document.createElement('div');
    wrap.className = 'tp-note';
    let list = null;
    let sub = null;
    for (const line of noteLines(note, n)) {
      if (line.kind === 'h' || line.kind === 'page') {
        const p = document.createElement('p');
        if (line.kind === 'h') p.className = 'h';
        p.append(plain(line.md));
        wrap.append(p);
      } else if (line.kind === 'q') {
        const p = document.createElement('p');
        p.className = 'q';
        // What you wrote is text, never formatting. It stays its own run, so Arabic reads right.
        if (line.text) p.append('> ', Object.assign(document.createElement('bdi'), { textContent: line.text }));
        wrap.append(p);
      } else if (line.kind === 'sub') {
        if (!sub) {
          sub = document.createElement('ul');
          list.lastElementChild.append(sub);
        }
        const li = document.createElement('li');
        li.append(plain(line.md));
        sub.append(li);
      } else {
        if (!list) {
          list = document.createElement('ul');
          wrap.append(list);
        }
        sub = null;
        const li = document.createElement('li');
        if (line.kind === 'hit') {
          const hit = Object.assign(document.createElement('span'), { className: 'hit' });
          hit.append(plain(line.md));
          li.append(hit);
        } else li.append(plain(line.md));
        list.append(li);
      }
    }
    return wrap;
  }

  let hitCount = 0;

  function render() {
    const all = draft ? [...notes, draft] : notes;
    reportEl.hidden = !all.length;
    foot.hidden = !notes.length;
    const hits = all.reduce((sum, note) => sum + note.pointing.length, 0);
    reportEl.replaceChildren(...all.map((note, i) => renderNote(note, i + 1)));
    // Only a line that just resolved lights up, not the ones already there.
    for (const hit of $$('.hit', reportEl).slice(0, hitCount)) hit.style.animation = 'none';
    hitCount = hits;
    reportEl.scrollTop = reportEl.scrollHeight;
  }

  // ---------- boxes on the page ----------

  function place(box, el) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) {
      box.style.display = 'none';
      return;
    }
    const docWidth = document.documentElement.clientWidth;
    const left = Math.max(2, r.left - PIN_PAD);
    const right = Math.min(docWidth - 2, r.right + PIN_PAD);
    const top = r.top + scrollY - PIN_PAD;
    const inNav = !!el.closest('.nav');
    Object.assign(box.style, {
      display: '',
      left: `${left + scrollX}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${r.height + PIN_PAD * 2}px`,
    });
    box.classList.toggle('over-nav', inNav);
    // Beside the box if there's room, so it stays off the line above. Else above it, and
    // below it up in the navigation.
    const tagWidth = $('.pin-tag', box).offsetWidth;
    const below = inNav || r.top < 110;
    const beside = !below && right + tagWidth + 20 < docWidth;
    box.classList.toggle('flip', !below && !beside);
    box.classList.toggle('under-end', below);
  }

  function syncAll() {
    frame = 0;
    if (state === 'off') return;
    for (const { el, box } of pinned) place(box, el);
    if (pointer) setHover(pick(document.elementFromPoint(pointer.x, pointer.y)));
    else if (hovered) place(hoverBox, hovered);
  }

  const requestSync = () => {
    if (!frame) frame = requestAnimationFrame(syncAll);
  };

  function setHover(el) {
    hovered = el;
    const pinnedHere = el && draft?.pins.some((p) => p.el === el);
    if (!el || pinnedHere || touch.matches) {
      hoverBox.classList.remove('on');
      return;
    }
    place(hoverBox, el);
    if (!hoverBox.classList.contains('on')) {
      // First appearance lands in place rather than flying in from the last one.
      hoverBox.classList.remove('glide');
      hoverBox.classList.add('on');
      void hoverBox.offsetWidth;
    }
    if (!calm.matches) hoverBox.classList.add('glide');
  }

  // ---------- the states ----------

  function say(message) {
    hint.textContent = message;
  }

  const armedHint = () => {
    if (notes.length) return touch.matches ? 'Tap the next thing, or copy the report.' : 'Point at the next thing, or copy the report.';
    return touch.matches ? 'Tap anything on this page.' : 'Point at anything, then press T.';
  };

  function arm() {
    if (state !== 'off') return;
    state = 'armed';
    setTrying(true);
    if (!t0) t0 = Date.now();
    document.documentElement.classList.add('trying');
    tryButton.setAttribute('aria-pressed', 'true');
    panel.classList.add('in');
    panel.hidden = false;
    form.hidden = true;
    say(armedHint());
    render();
  }

  function exit() {
    if (state === 'noting') cancelNote();
    const hadFocus = panel.contains(document.activeElement);
    state = 'off';
    setTrying(false);
    stopMic();
    document.documentElement.classList.remove('trying');
    tryButton.setAttribute('aria-pressed', 'false');
    hoverBox.classList.remove('on', 'glide');
    panel.classList.remove('in');
    panel.hidden = true;
    pointer = null;
    hovered = null;
    if (hadFocus) tryButton.focus({ preventScroll: true, focusVisible: false });
  }

  function addPin(el) {
    pinCount += 1;
    const id = `P${pinCount}`;
    const box = document.createElement('div');
    box.className = 'pin on tp-pin';
    box.setAttribute('aria-hidden', 'true');
    box.append(Object.assign(document.createElement('span'), { className: 'pin-tag', textContent: id }));
    document.body.append(box);
    place(box, el);
    pinned.push({ el, box });
    draft.pins.push({ id, el, desc: describe(el), box });
    setHover(hovered);
  }

  // Keep what you pinned in sight above the panel and, on a phone, the keyboard.
  function keepInSight(el) {
    const r = el.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const overlaps = r.right > p.left && r.left < p.right;
    if (overlaps && r.bottom > p.top - 12) scrollBy({ top: r.bottom - p.top + 28, behavior: calm.matches ? 'auto' : 'smooth' });
  }

  const noteHint = () => (touch.matches ? 'Say what you want, then press Add.' : 'Say what you want. Enter adds it.');

  function openNote(el) {
    state = 'noting';
    panel.classList.add('noting');
    draft = { at: Date.now() - t0, text: '', pins: [], pointing: [], resolved: new Map(), spoken: false };
    addPin(el);
    form.hidden = false;
    micButton.hidden = !Speech;
    micNote.hidden = !Speech;
    input.value = '';
    say(noteHint());
    render();
    input.focus({ preventScroll: true });
    requestAnimationFrame(() => keepInSight(el));
  }

  function changed() {
    if (!draft) return;
    draft.text = input.value.trim();
    resolvePointing(draft);
    render();
  }

  function land() {
    if (!draft) return;
    stopMic();
    changed();
    if (!draft.text) {
      say('Type what you want first, or press Esc.');
      input.focus();
      return;
    }
    notes.push(draft);
    draft = null;
    state = 'armed';
    panel.classList.remove('noting');
    form.hidden = true;
    say(armedHint());
    render();
    // The field is gone. Keep keyboard focus nearby, without a ring on anything.
    panel.focus({ preventScroll: true });
  }

  function cancelNote() {
    if (!draft) return;
    stopMic();
    for (const pin of draft.pins) {
      pin.box.remove();
      pinned.splice(pinned.findIndex((p) => p.box === pin.box), 1);
    }
    pinCount -= draft.pins.length;
    draft = null;
    state = 'armed';
    panel.classList.remove('noting');
    form.hidden = true;
    say(armedHint());
    render();
  }

  // ---------- the mic, only when you press it ----------

  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;

  function stopMic() {
    if (!listening) return;
    const rec = listening;
    listening = null;
    rec.onresult = rec.onerror = rec.onend = null;
    try { rec.stop(); } catch { /* already stopped */ }
    micButton.setAttribute('aria-pressed', 'false');
  }

  function startMic() {
    if (!Speech) return;
    const rec = new Speech();
    rec.continuous = true;
    rec.interimResults = true;
    if (navigator.language) rec.lang = navigator.language;
    const before = input.value.trim();
    rec.onresult = (e) => {
      const heard = [...e.results].map((r) => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
      input.value = before ? `${before} ${heard}` : heard;
      draft.spoken = true;
      changed();
    };
    rec.onerror = () => {
      stopMic();
      say('The mic isn’t available here. Type it instead.');
      input.focus();
    };
    rec.onend = () => {
      if (listening !== rec) return;
      stopMic();
      say('Mic stopped. Enter adds it.');
    };
    try {
      rec.start();
    } catch {
      say('The mic isn’t available here. Type it instead.');
      return;
    }
    listening = rec;
    micButton.setAttribute('aria-pressed', 'true');
    say(touch.matches ? 'Listening. Point by tapping. Add when you’re done.' : 'Listening. Point as you talk. Press T when you’re done.');
  }

  // ---------- input ----------

  tryButton.hidden = false;
  tryButton.addEventListener('click', () => {
    if (state === 'off') arm();
    else exit();
  });
  closeButton.addEventListener('click', exit);
  installLink.addEventListener('click', exit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    land();
  });
  input.addEventListener('input', changed);
  micButton.addEventListener('click', () => {
    if (listening) {
      stopMic();
      say(noteHint());
    } else startMic();
    input.focus({ preventScroll: true });
  });

  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(reportMarkdown());
      copyButton.textContent = 'Copied';
    } catch {
      getSelection().selectAllChildren(reportEl);
      copyButton.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { copyButton.textContent = 'Copy report'; }, 1800);
  });

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer = { x: e.clientX, y: e.clientY };
    if (state !== 'off') requestSync();
  }, { passive: true });

  document.documentElement.addEventListener('pointerleave', () => {
    pointer = null;
    if (state !== 'off') setHover(null);
  });

  // Tabbing moves the box as well, until the mouse moves again.
  document.addEventListener('focusin', (e) => {
    if (state === 'off' || panel.contains(e.target) || !e.target.matches(':focus-visible')) return;
    pointer = null;
    setHover(pick(e.target));
  });

  // The navigation settles after you scroll, and boxes on it settle with it.
  nav.addEventListener('transitionend', requestSync);

  addEventListener('scroll', () => {
    if (state !== 'off') requestSync();
  }, { passive: true });
  addEventListener('resize', () => {
    if (state !== 'off') requestSync();
  });

  // In this mode a click pins, as it does in a review, instead of following the link.
  document.addEventListener('click', (e) => {
    if (state === 'off' || e.target.closest?.('.tp, #try')) return;
    e.preventDefault();
    e.stopPropagation();
    const el = pick(e.target);
    if (!el) return;
    if (state === 'armed') openNote(el);
    else if (!draft.pins.some((p) => p.el === el)) {
      addPin(el);
      changed();
      input.focus({ preventScroll: true });
    }
  }, true);

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state !== 'off') {
      e.preventDefault();
      if (state === 'noting') cancelNote();
      else exit();
      return;
    }
    // e.code, so T works the same on an Arabic keyboard.
    if (e.code !== 'KeyT' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
    const inField = e.target.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
    if (inField) {
      if (inField === input && listening) {
        e.preventDefault();
        land();
      }
      return;
    }
    e.preventDefault();
    if (state === 'off') {
      const on = pick(pointer ? document.elementFromPoint(pointer.x, pointer.y) : document.activeElement);
      arm();
      if (on) {
        setHover(on);
        openNote(on);
      }
    } else if (state === 'armed') {
      const on = hovered || pick(document.activeElement);
      if (on) openNote(on);
      else say(touch.matches ? 'Tap anything on this page.' : 'Point at something first, then press T.');
    } else if (input.value.trim()) land();
    else input.focus({ preventScroll: true });
  });

  // On a phone, ride above the keyboard.
  visualViewport?.addEventListener('resize', () => {
    const lift = Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop);
    panel.style.setProperty('--tp-lift', `${lift}px`);
  });
}
