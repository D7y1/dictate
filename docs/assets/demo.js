// The landing page is the site under review. Point at anything and press T (or the
// mouse back button once a session runs), type what you would have said, press Enter.
// "Finish & send" writes the same report.md Dictate writes (server/compile.js), and
// the terminal answers with Claude's numbered plan.

const AR = document.documentElement.lang === 'ar';

const arNotes = (n) => (n === 0 ? 'لا ملاحظات بعد' : n === 1 ? 'ملاحظة واحدة' : n === 2 ? 'ملاحظتان' : n <= 10 ? `${n} ملاحظات` : `${n} ملاحظة`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const S = AR
  ? {
      talk: 'تكلّم', on: 'مباشر', ready: 'جاهز', rec: 'تسجيل', sent: 'أُرسلت',
      hint: 'أشِر إلى أي شيء في هذه الصفحة واضغط T.',
      hintTouch: 'المس زر «تكلّم»، ثم المس أي شيء في الصفحة.',
      pick: 'انقر أي شيء في الصفحة لتثبيته.',
      pickTouch: 'المس أي شيء في الصفحة لتثبيته.',
      placeholder: 'اكتب ما كنت ستقوله',
      inputHint: '<kbd class="key">Enter</kbd> للحفظ · <kbd class="key">Esc</kbd> للإلغاء · النقر يضيف تثبيتًا',
      noWords: 'تثبيت بلا كلام',
      count: (n) => (n ? `${arNotes(n)} · صفحة واحدة` : arNotes(0)),
      opened: (n, what) => `فُتحت الملاحظة ${n} على ${what}. اكتب ثم اضغط Enter.`,
      saved: (n) => `حُفظت الملاحظة ${n}.`,
      discarded: 'أُلغيت الملاحظة.',
      cleared: 'مُسحت الملاحظات.',
      sentStatus: 'أُرسلت. خطة Claude في الطرفية.',
      copy: 'نسخ', copied: 'نُسخ',
      showNotes: 'اعرض الملاحظات', hideNotes: 'أخفِ الملاحظات',
      understood: 'هذا ما فهمته:',
      starting: 'سأبدأ بالبند 1، ثم البقية بالترتيب.',
      noText: '(تثبيت بلا كلام)',
      seeds: [
        { text: 'كبّر هذا العنوان.', lang: 'ar' },
        { text: 'Make this button clearer.', lang: 'en' },
      ],
    }
  : {
      talk: 'TALK', on: 'ON', ready: 'READY', rec: 'REC', sent: 'SENT',
      hint: 'Point at anything on this page and press T.',
      hintTouch: 'Tap TALK, then tap anything on the page.',
      pick: 'Click anything on the page to pin it.',
      pickTouch: 'Tap anything on the page to pin it.',
      placeholder: 'Type what you’d say',
      inputHint: '<kbd class="key">Enter</kbd> saves · <kbd class="key">Esc</kbd> discards · clicks add pins',
      noWords: 'Pinned without words',
      count: (n) => (n ? `${plural(n, 'note')} · 1 page` : 'No notes yet'),
      opened: (n, what) => `Note ${n} open on ${what}. Type, then press Enter.`,
      saved: (n) => `Note ${n} saved.`,
      discarded: 'Note discarded.',
      cleared: 'Rundown cleared.',
      sentStatus: 'Sent. Claude’s plan is in the terminal.',
      copy: 'Copy', copied: 'Copied',
      showNotes: 'Show notes', hideNotes: 'Hide notes',
      understood: 'Here’s what I understood:',
      starting: 'Starting with 1, then the rest in order.',
      noText: '(a pin, no words)',
      seeds: [
        { text: 'Make this bigger.', lang: 'en' },
        { text: 'اجعل هذا الزر أوضح.', lang: 'ar' },
      ],
    };

const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
const main = $('#main');
const dock = $('#dock');
const log = $('#log');
const talk = $('#talk');
const talkWord = $('.talk-word', talk);
const hintMain = $('.hint-main');
const pill = $('#rec-pill');
const pillLabel = $('.rec-label', pill);
const count = $('#dock-count');
const status = $('#demo-status');
const btnSend = $('#btn-send');
const btnClear = $('#btn-clear');
const expand = $('#dock-expand');
const terminal = $('#terminal');
const termBody = $('#term-body');
const termReport = $('#term-report');
const termTabs = $('#term-tabs');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;

const PINNABLE = 'a, button, h1, h2, h3, p, li, pre, figure, img, kbd, code, dt, dd, .tag, .page-strip, .unit, .step, .reqs li';
const SEED_OFFSET = 24_000; // the example notes sit at 00:12 and 00:19, so your first note lands after them

const state = {
  notes: [],
  open: null,
  started: false,
  sent: false,
  t0: 0,
  picking: false,
  hoverEl: null,
  overMain: false,
  ptr: { x: 0, y: 0 },
  restoreFocus: null,
};
let clock = 0;

// ---------- marks drawn on the page ----------

const layer = document.createElement('div');
layer.className = 'marks';
layer.setAttribute('aria-hidden', 'true');
document.body.append(layer);
const hover = document.createElement('div');
hover.className = 'm-hover';
hover.hidden = true;

function docRect(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
}

function place(el, x, y, w, h) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  if (w != null) el.style.width = `${w}px`;
  if (h != null) el.style.height = `${h}px`;
}

function drawMarks(fresh) {
  const topLimit = docRect(main).y + 8;
  const parts = [];
  for (const note of state.notes) {
    for (const m of note.marks) {
      if (!m.el.isConnected) continue;
      const r = docRect(m.el);
      if (!r.w && !r.h) continue;
      const pad = 10;
      const box = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
      const g = document.createElement('div');
      if (fresh === 'all' || fresh === m.n) g.className = 'm-new';

      const b = document.createElement('div');
      b.className = 'm-box';
      place(b, box.x, box.y, box.w, box.h);

      const label = `P${m.n}`;
      const tabW = 18 + label.length * 9.2;
      const tab = document.createElement('div');
      tab.className = 'm-tab';
      tab.textContent = label;
      const above = box.y - 44 > topLimit;
      const tx = AR ? box.x + box.w - 22 - tabW : box.x + 22;
      if (above) {
        place(tab, tx, box.y - 44);
        const lead = document.createElement('div');
        lead.className = 'm-lead';
        place(lead, AR ? tx + 6 : tx + tabW - 6, box.y - 20, 28);
        lead.style.transform = `rotate(${AR ? 135 : 45}deg)`;
        g.append(b, lead, tab);
      } else {
        place(tab, AR ? box.x + box.w - 6 - tabW : box.x + 6, box.y + 6);
        g.append(b, tab);
      }
      parts.push(g);
    }
  }
  const ringNote = state.open || state.notes.at(-1);
  const ringMark = ringNote?.marks.at(-1);
  if (ringMark?.el.isConnected && ringMark.fx != null) {
    const r = docRect(ringMark.el);
    const ring = document.createElement('div');
    ring.className = 'm-ring';
    let x = r.x + r.w * ringMark.fx;
    if (ringMark.edge) {
      // the example cursor sits in the button's leading padding, clear of its label at every width
      const inset = Math.max(0, (parseFloat(getComputedStyle(ringMark.el).paddingInlineStart) || 0) - 18);
      x = AR ? r.x + r.w - inset : r.x + inset;
    }
    place(ring, x, r.y + r.h * ringMark.fy);
    parts.push(ring);
  }
  layer.replaceChildren(hover, ...parts);
}

function showHover(el) {
  if (!el || !(state.open || state.picking)) {
    hover.hidden = true;
    return;
  }
  const r = docRect(el);
  hover.hidden = false;
  place(hover, r.x - 4, r.y - 4, r.w + 8, r.h + 8);
}

// ---------- describing elements the way the extension does ----------

const truncate = (s, n) => {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function nameOf(el) {
  return el.getAttribute('aria-label') || el.getAttribute('alt') || el.innerText || el.textContent || '';
}

function describeEl(el) {
  const id = el.id ? `#${el.id}` : '';
  const cls = [...el.classList].slice(0, 3).map((c) => `.${c}`).join('');
  const name = truncate(nameOf(el), 80);
  return `\`${el.tagName.toLowerCase()}${id}${cls}\`${name ? ` "${name}"` : ''}`;
}

const tagOf = (t) => `${t.tagName.toLowerCase()}${t.id ? `#${t.id}` : t.classList[0] ? `.${t.classList[0]}` : ''}`;

function shortName(t) {
  const name = truncate(nameOf(t), 40);
  return `${tagOf(t)}${name ? ` "${name}"` : ''}`;
}

// The quoted text can be Arabic, so it gets its own bidi island inside the left-to-right selector.
function anchorParts(t) {
  const name = truncate(nameOf(t), 40);
  return name ? [tagOf(t), ' "', el('bdi', {}, name), '"'] : [tagOf(t)];
}

function selectorFor(el) {
  const parts = [];
  let cur = el;
  while (cur && cur !== document.body && parts.length < 5) {
    if (cur.id) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    let p = cur.tagName.toLowerCase();
    if (cur.classList[0]) p += `.${cur.classList[0]}`;
    const same = cur.parentElement ? [...cur.parentElement.children].filter((c) => c.tagName === cur.tagName && c.classList[0] === cur.classList[0]) : [];
    if (same.length > 1) p += `:nth-of-type(${[...cur.parentElement.children].filter((c) => c.tagName === cur.tagName).indexOf(cur) + 1})`;
    parts.unshift(p);
    cur = cur.parentElement;
  }
  return parts.join(' > ');
}

function pinnableFrom(node) {
  if (!(node instanceof Element) || !main.contains(node)) return null;
  const el = node.closest(PINNABLE);
  if (el && main.contains(el)) return el;
  return node.closest('section, article, footer');
}

// ---------- session ----------

const elapsed = () => (state.started || state.sent ? performance.now() - state.t0 : 0);
const pad = (n, w = 2) => String(n).padStart(w, '0');
function fmtTC(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

function setPill(mode) {
  pill.dataset.state = mode;
  if (mode === 'rec') pillLabel.textContent = `${S.rec} ${fmtTC(elapsed())}`;
  else pillLabel.textContent = mode === 'sent' ? S.sent : S.ready;
}

function startSession() {
  if (state.started) return;
  state.started = true;
  state.t0 = performance.now() - (state.notes.length ? SEED_OFFSET : 0);
  setPill('rec');
  clearInterval(clock);
  clock = setInterval(() => setPill('rec'), 1000);
}

function seed() {
  const targets = [$('#hero-title'), $('#cta-github')];
  state.notes = S.seeds.map((s, i) => ({
    n: i + 1,
    at: [12_000, 19_000][i],
    text: s.text,
    lang: s.lang,
    typed: false,
    marks: [{ n: i + 1, el: targets[i], ...(i === 1 ? { fx: AR ? 0.92 : 0.08, fy: 0.5, edge: true } : {}) }],
  }));
}

const nextMark = () => 1 + Math.max(0, ...state.notes.flatMap((n) => n.marks.map((m) => m.n)));

function markFor(el, x, y) {
  const r = docRect(el);
  return {
    n: nextMark(),
    el,
    fx: r.w ? Math.min(1, Math.max(0, (x - r.x) / r.w)) : 0.5,
    fy: r.h ? Math.min(1, Math.max(0, (y - r.y) / r.h)) : 0.5,
  };
}

function openNote(el, x, y) {
  if (state.sent) reset(false);
  if (state.open) closeNote();
  cancelPick();
  startSession();
  const mark = markFor(el, x, y);
  const note = { n: state.notes.length + 1, at: elapsed(), text: '', typed: true, marks: [mark] };
  state.notes.push(note);
  state.open = note;
  setTalk(true);
  renderLog();
  drawMarks(mark.n);
  showHover(state.hoverEl);
  const row = log.lastElementChild;
  if (!reduced) {
    row.classList.add('flash');
    talk.classList.remove('flash');
    void talk.offsetWidth;
    talk.classList.add('flash');
  }
  if (dock.classList.contains('expanded') || touch || innerWidth <= 980) setExpanded(true);
  row.scrollIntoView({ block: 'nearest' });
  $('.row-input', row)?.focus({ preventScroll: true });
  announce(S.opened(note.n, shortName(el)));
}

function closeNote() {
  const note = state.open;
  if (!note) return;
  const input = $('.row-input', log);
  note.text = (input?.value || '').trim();
  state.open = null;
  setTalk(false);
  renderLog();
  drawMarks();
  showHover(null);
  announce(S.saved(note.n));
  const back = state.restoreFocus;
  state.restoreFocus = null;
  if (back?.isConnected) back.focus({ preventScroll: true });
  else if (document.activeElement && dock.contains(document.activeElement)) document.activeElement.blur();
}

function discardNote() {
  if (!state.open) return;
  state.notes = state.notes.filter((n) => n !== state.open);
  state.notes.forEach((n, i) => (n.n = i + 1));
  state.open = null;
  setTalk(false);
  renderLog();
  drawMarks();
  showHover(null);
  announce(S.discarded);
}

function addPin(el, x, y) {
  const mark = markFor(el, x, y);
  state.open.marks.push(mark);
  const input = $('.row-input', log);
  const typed = input?.value;
  renderLog();
  const again = $('.row-input', log);
  if (again) {
    again.value = typed || '';
    again.focus({ preventScroll: true });
  }
  drawMarks(mark.n);
}

function setTalk(on) {
  talk.setAttribute('aria-pressed', String(on));
  talkWord.textContent = on ? S.on : S.talk;
}

function startPick() {
  if (state.sent) reset(false);
  startSession();
  state.picking = true;
  talk.dataset.picking = 'true';
  document.body.classList.add('picking');
  hintMain.textContent = touch ? S.pickTouch : S.pick;
  announce(hintMain.textContent);
}

function cancelPick() {
  if (!state.picking) return;
  state.picking = false;
  delete talk.dataset.picking;
  document.body.classList.remove('picking');
  hintMain.textContent = touch ? S.hintTouch : S.hint;
  showHover(null);
}

function toggleFromPointer() {
  if (state.open) return closeNote();
  const f = document.activeElement;
  if (f && f !== main && main.contains(f) && f.matches(':focus-visible')) {
    const el = pinnableFrom(f) || f;
    const r = docRect(el);
    state.restoreFocus = f;
    return openNote(el, r.x + r.w / 2, r.y + r.h / 2);
  }
  if (!state.overMain || !state.hoverEl) return startPick();
  openNote(state.hoverEl, state.ptr.x, state.ptr.y);
}

function reset(announceIt = true) {
  state.open = null;
  state.notes = [];
  state.started = false;
  state.sent = false;
  clearInterval(clock);
  cancelPick();
  setTalk(false);
  setPill('ready');
  restoreTerminal();
  renderLog();
  drawMarks();
  if (announceIt) announce(S.cleared);
}

// ---------- rundown ----------

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...kids.filter((k) => k != null));
  return node;
}

function rowFor(note) {
  const open = note === state.open;
  const tags = note.marks.map((m) => el('span', { class: 'tag tag-mark' }, `P${m.n}`));
  if (note.typed) tags.push(el('span', { class: 'tag tag-txt', title: 'typed' }, 'TXT'));
  let body;
  if (open) {
    const input = el('input', { class: 'row-input', type: 'text', placeholder: S.placeholder, 'aria-label': S.placeholder, dir: 'auto', autocomplete: 'off', enterkeyhint: 'done' });
    input.value = note.text || '';
    input.addEventListener('input', () => (note.text = input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        closeNote();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        discardNote();
      }
    });
    body = el('span', { class: 'row-body' }, input, el('span', { class: 'row-input-hint', html: S.inputHint }));
  } else {
    const text = note.text
      ? el('span', { class: 'row-text', lang: note.lang || null, dir: 'auto' }, note.text)
      : el('span', { class: 'row-text empty' }, S.noWords);
    body = el('span', { class: 'row-body' }, text, el('span', { class: 'row-anchor' }, ...anchorParts(note.marks[0].el)));
  }
  return el(
    'li',
    { class: `row${open ? ' open' : ''}` },
    el('span', { class: 'row-n' }, pad(note.n, 3)),
    el('span', { class: 'row-sep' }),
    el('span', { class: 'row-tc' }, fmtTC(note.at)),
    el('span', { class: 'row-sep' }),
    el('span', { class: 'row-tags' }, ...tags),
    body,
  );
}

function renderLog() {
  log.replaceChildren(...state.notes.map(rowFor));
  count.textContent = S.count(state.notes.length);
  btnSend.disabled = !state.notes.length || state.sent;
  btnClear.disabled = !state.notes.length && !state.sent;
}

function setExpanded(on) {
  dock.classList.toggle('expanded', on);
  expand.setAttribute('aria-expanded', String(on));
  expand.setAttribute('aria-label', on ? S.hideNotes : S.showNotes);
  expand.style.transform = on ? 'rotate(180deg)' : '';
}

let announceTimer = 0;
function announce(text) {
  clearTimeout(announceTimer);
  status.textContent = '';
  announceTimer = setTimeout(() => (status.textContent = text), 50);
}

// ---------- the report Claude receives ----------

function sessionId() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}_web`;
}

function buildReport(id) {
  const url = location.href.split('#')[0];
  const path = new URL(url).pathname;
  const title = document.title;
  const pins = state.notes.reduce((s, n) => s + n.marks.length, 0);
  const vp = `${innerWidth}×${innerHeight}`;
  const when = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const L = [];
  L.push(`# Dictate · Web review — ${title}`, '');
  L.push(`- **Session:** \`${id}\` · recorded ${when} · ${fmtClock(elapsed())} long`);
  L.push(`- **Start URL:** ${url}`);
  L.push(`- **Contents:** ${[plural(state.notes.length, 'note'), plural(pins, 'pin'), '1 page', plural(pins, 'image')].join(' · ')}`);
  L.push('- **Transcript:** typed in the landing page demo (the studio uses Whisper, word-timed)', '');
  L.push('> **How to read this:** each note is what the user said plus what they were pointing at on the page while they said it. Elements include a CSS selector, visible text, and an HTML snippet so you can find them in the codebase. Screenshots in `frames/` show numbered pins and boxes the user placed, plus the cursor (ring).', '');
  L.push('## Notes', '');
  let frame = 0;
  for (const n of state.notes) {
    L.push(`### ${n.n}. ${path} · ${fmtClock(n.at)} into the session`, '');
    L.push(`Page: [${truncate(title, 90)}](${url})`, '');
    L.push(n.text ? n.text.split('\n').map((l) => `> ${l}`).join('\n') : '_No words. The user marked this spot without speaking._', '');
    const bullets = [];
    if (n.typed) bullets.push('**Typed note** (not spoken)');
    for (const m of n.marks) {
      if (!m.el.isConnected) continue;
      const r = m.el.getBoundingClientRect();
      const html = truncate(m.el.outerHTML, 220);
      bullets.push(
        [
          `**Pin P${m.n}** → ${describeEl(m.el)}`,
          `  - selector: \`${selectorFor(m.el)}\``,
          `  - html: \`${html}\``,
          `  - element box: ${Math.round(r.left)},${Math.round(r.top)} · ${Math.round(r.width)}×${Math.round(r.height)} px in a ${vp} viewport`,
        ].join('\n'),
      );
    }
    for (const m of n.marks) bullets.push(`**Screenshot** \`frames/${pad(++frame, 4)}-p${m.n}.jpg\``);
    L.push(bullets.map((b) => `- ${b}`).join('\n'), '');
  }
  L.push('## Files in this folder', '');
  L.push('- `report.md`: this report');
  L.push('- `session.json`: the same notes as structured data, with cursor dwell, element details, and timings');
  L.push('- `events.jsonl`: the raw event stream (every cursor sample, click, and page change)');
  L.push(`- \`frames/\`: ${plural(pins, 'screenshot')}`, '');
  return L.join('\n');
}

// ---------- terminal ----------

const termInitial = termBody.innerHTML;

function restoreTerminal() {
  termBody.innerHTML = termInitial;
  for (const l of termBody.querySelectorAll('.intro-line')) l.classList.add('show');
  termReport.textContent = '';
  termReport.hidden = true;
  termBody.hidden = false;
  termTabs.hidden = true;
  selectTab('term');
}

function line(cls, ...kids) {
  return el('span', { class: cls }, ...kids, '\n');
}

function writeTerminal(id) {
  const pins = state.notes.reduce((s, n) => s + n.marks.length, 0);
  $('.cursor-block', termBody)?.remove();
  const plan = state.notes.map((n, i) =>
    el(
      'span',
      { class: 't-plan', style: 'display:block' },
      el('span', { class: 't-fg' }, `${i + 1}. `),
      el('bdi', {}, ...anchorParts(n.marks[0].el)),
      ' → ',
      el('bdi', { class: n.lang === 'ar' || (!n.lang && AR) ? 't-ar t-fg' : 't-fg', dir: 'auto' }, n.text || S.noText),
    ),
  );
  termBody.append(
    el('span', { class: 't-sp' }),
    line('t-ok', `DICTATE_SUBMITTED .dictate/sessions/${id}`),
    line('t-fg', `● Read report.md · ${plural(state.notes.length, 'note')} · ${plural(pins, 'screenshot')}`),
    el('span', { class: 't-sp' }),
    line(AR ? 't-fg t-ar' : 't-fg', S.understood),
    ...plan,
    el('span', { class: 't-sp' }),
    line(AR ? 't-fg t-ar' : 't-fg', S.starting),
    el('span', { class: 'cursor-block', 'aria-hidden': 'true' }),
  );
}

function selectTab(which) {
  for (const t of termTabs.querySelectorAll('.term-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === which));
  termBody.hidden = which !== 'term';
  termReport.hidden = which !== 'report';
}

function send() {
  if (state.open) closeNote();
  cancelPick();
  if (!state.notes.length) return;
  const id = sessionId();
  termReport.textContent = buildReport(id);
  state.sent = true;
  state.started = false;
  clearInterval(clock);
  setPill('sent');
  writeTerminal(id);
  termTabs.hidden = false;
  selectTab('term');
  renderLog();
  drawMarks();
  announce(S.sentStatus);
  if (innerWidth <= 980) setExpanded(false);
  terminal.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
}

// ---------- input ----------

const typing = (t) => t instanceof Element && (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') != null);

function lightTile(sel) {
  const tile = $(sel);
  if (!tile) return;
  tile.classList.add('lit');
  setTimeout(() => tile.classList.remove('lit'), 220);
}

addEventListener(
  'pointermove',
  (e) => {
    state.ptr = { x: e.pageX, y: e.pageY };
    state.overMain = main.contains(e.target);
    if (state.overMain) state.hoverEl = pinnableFrom(e.target);
    showHover(state.overMain ? state.hoverEl : null);
  },
  { passive: true },
);

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.open && !typing(e.target)) {
      e.preventDefault();
      discardNote();
    } else if (state.picking) cancelPick();
    return;
  }
  if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
  e.preventDefault();
  lightTile('#tile-t');
  toggleFromPointer();
});

// The mouse back button is Talk, like the studio's default binding. It only stops the
// browser from going back while a session runs, or while you point at the TALK row.
function onMouse(e) {
  if (e.button !== 3) return;
  const onTalkRow = e.target instanceof Element && e.target.closest('.talk-row');
  if (!state.started && !state.open && !onTalkRow) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.type === 'mousedown') {
    lightTile('#tile-mouse');
    if (onTalkRow && !state.open) startPick();
    else toggleFromPointer();
  }
}
for (const type of ['mousedown', 'mouseup', 'auxclick']) addEventListener(type, onMouse, true);

// While a note is open (or after TALK is pressed), clicks on the page pin instead of following links.
addEventListener(
  'click',
  (e) => {
    if (e.button !== 0 || !main.contains(e.target)) return;
    if (!state.open && !state.picking) return;
    const target = pinnableFrom(e.target);
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.picking) openNote(target, e.pageX, e.pageY);
    else addPin(target, e.pageX, e.pageY);
  },
  true,
);

talk.addEventListener('click', () => {
  if (state.open) closeNote();
  else if (state.picking) cancelPick();
  else startPick();
});
btnSend.addEventListener('click', send);
btnClear.addEventListener('click', () => reset(true));
expand.addEventListener('click', () => setExpanded(!dock.classList.contains('expanded')));
for (const t of termTabs.querySelectorAll('.term-tab')) t.addEventListener('click', () => selectTab(t.dataset.tab));

for (const b of document.querySelectorAll('[data-copy]')) {
  const label = $('span', b);
  b.addEventListener('click', async () => {
    const text = b.dataset.copy || $('code', b.parentElement).innerText.trim();
    try {
      await navigator.clipboard.writeText(text);
      b.dataset.done = '';
      label.textContent = S.copied;
      setTimeout(() => {
        delete b.dataset.done;
        label.textContent = S.copy;
      }, 1600);
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('code', b.parentElement));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });
}

// ---------- start: /dictate types itself, then the studio docks ----------

if (touch) hintMain.textContent = S.hintTouch;
seed();
renderLog();
setPill('ready');

const redraw = () => requestAnimationFrame(() => drawMarks());
new ResizeObserver(redraw).observe(main);
addEventListener('load', redraw);
document.fonts?.ready.then(redraw);

function intro() {
  const lines = [...termBody.querySelectorAll('.intro-line')];
  if (reduced) {
    drawMarks();
    root.classList.add('ready');
    return;
  }
  const cmd = $('#term-cmd');
  const full = cmd.textContent;
  cmd.textContent = '';
  root.classList.add('typing');
  let i = 0;
  const tick = () => {
    cmd.textContent = full.slice(0, ++i);
    if (i < full.length) return setTimeout(tick, 30);
    setTimeout(() => lines[0]?.classList.add('show'), 220);
    setTimeout(() => lines[1]?.classList.add('show'), 460);
    setTimeout(() => {
      drawMarks('all');
      root.classList.add('ready');
      for (const r of log.children) r.classList.add('flash');
    }, 760);
  };
  setTimeout(tick, 320);
}
intro();
