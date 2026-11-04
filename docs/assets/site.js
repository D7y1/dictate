// The Dictate site: copy buttons, the hero demo, and the What you say / What Claude gets tabs.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// --- Navigation -------------------------------------------------------------

const nav = $('#nav');
const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// --- Copy -------------------------------------------------------------------

for (const button of $$('[data-copy]')) {
  let timer;
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
      button.classList.add('copied');
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
// Plays on its own, moving from one thing to the next. Point at the card and it follows you.

const demo = $('#demo');
if (demo) {
  const site = $('.site', demo);
  const pin = $('.pin', demo);
  const cursor = $('.cursor', demo);
  const text = $('.say-text', demo);
  const tag = $('.pin-tag', demo);
  const start = $('[data-start]', demo);
  const tour = [start, $('.site-title', demo), $('.mug-spot', demo)];
  const PIN_PAD = 10;
  let current = null;
  let step = 0;
  let timer = null;
  let visible = true;
  let pointing = false;

  function speak(sentence) {
    text.replaceChildren(...sentence.split(' ').map((word, i, words) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.style.setProperty('--i', i);
      if (word === 'this') span.append(Object.assign(document.createElement('mark'), { textContent: word }));
      else span.textContent = word;
      if (i < words.length - 1) span.append(' ');
      return span;
    }));
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
    pin.classList.toggle('flip', box.right - r.right - PIN_PAD < tag.offsetWidth + 18);
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
    if (calm.matches || pointing || !visible) return;
    timer = setTimeout(() => {
      step = (step + 1) % tour.length;
      point(tour[step]);
      schedule();
    }, 4800);
  }

  site.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-say]');
    if (el) point(el);
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

  addEventListener('resize', () => current && place(current));

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
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  function select(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const on = other === tab;
      other.setAttribute('aria-selected', on);
      other.tabIndex = on ? 0 : -1;
      const panel = panelOf(other);
      panel.hidden = !on;
      panel.classList.toggle('enter', on);
    }
    if (focus) tab.focus();
  }

  $('[role="tablist"]').hidden = false;
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
}
