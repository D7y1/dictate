// Review & submit: fix transcripts, void notes, add overall direction, send.
import { $, h, timecodeShort, clock, pathOf, dirOf, toast } from './util.js';

export class Review {
  constructor({ root, onSubmitted }) {
    this.root = root;
    this.list = $('#review-list', root);
    this.onSubmitted = onSubmitted;
    this.edits = {};
    this.session = null;
    this.compiled = null;
    $('#review-submit', root).addEventListener('click', () => this.submit());
  }

  show({ session, compiled, mode }) {
    this.session = session;
    this.compiled = compiled;
    this.mode = mode;
    this.edits = {};
    $('#review-general', this.root).value = '';
    $('#review-title', this.root).value = compiled.meta?.title || '';
    const { stats } = compiled;
    const bits = [
      `${stats.notes} ${stats.notes === 1 ? 'note' : 'notes'}`,
      `${clock(stats.durationMs)} recorded`,
      mode === 'web' ? `${stats.pages} ${stats.pages === 1 ? 'page' : 'pages'}` : null,
      `${stats.frames} ${mode === 'web' ? 'screenshots' : 'frames'}`,
    ].filter(Boolean);
    $('#review-stats', this.root).textContent = bits.join(' · ');
    const tx = compiled.meta?.transcript;
    const source = $('#review-source', this.root);
    if (compiled.transcriptSource === 'whisper') {
      source.textContent = `Transcribed by Whisper ${tx?.model || ''} on ${tx?.device === 'cuda' ? 'your GPU' : 'CPU'}${tx?.language ? ` · detected ${tx.language === 'ar' ? 'Arabic' : tx.language === 'en' ? 'English' : tx.language}` : ''}`;
      source.className = 'review-source ok';
    } else {
      source.textContent = tx?.error ? `Using live captions (Whisper unavailable: ${tx.error})` : 'Using live captions';
      source.className = 'review-source warn';
    }
    this.render();
    this.updateSubmit();
  }

  render() {
    const notes = this.compiled.notes;
    this.list.replaceChildren();
    if (!notes.length) {
      this.list.append(h('li', { class: 'review-empty' }, h('p', {}, 'Nothing was captured. You can still send overall direction below, or go back and record again.')));
      return;
    }
    for (const note of notes) this.list.append(this.card(note));
  }

  anchor(note) {
    if (this.mode === 'video') {
      if (note.video?.from == null) return 'no video';
      const a = note.video.from;
      const b = note.video.to;
      return b != null && Math.abs(b - a) >= 0.5 ? `${timecodeShort(a)} – ${timecodeShort(b)}` : timecodeShort(a);
    }
    return note.page ? pathOf(note.page.url) : 'page';
  }

  card(note) {
    const voided = () => this.edits[note.id]?.deleted;
    const text = h('textarea', {
      class: 'note-text',
      rows: 2,
      dir: dirOf(note.text),
      placeholder: note.text ? '' : 'No words. Add what this mark is for (optional).',
      'aria-label': `Note ${note.n} text`,
    });
    text.value = note.text;
    const grow = () => {
      text.style.height = 'auto';
      text.style.height = `${text.scrollHeight}px`;
    };
    text.addEventListener('input', () => {
      this.edits[note.id] = { ...this.edits[note.id], text: text.value };
      text.dir = dirOf(text.value);
      grow();
    });
    requestAnimationFrame(grow);

    const chips = [];
    for (const m of note.marks) chips.push(h('span', { class: 'chip chip-mark' }, markLabel(m, this.mode)));
    for (const p of note.pointing || []) chips.push(h('span', { class: 'chip', title: 'Where the cursor was when you said this' }, `“${p.word}” → ${p.el ? elName(p.el) : `${(p.x ?? 0).toFixed?.(2)}, ${(p.y ?? 0).toFixed?.(2)}`}`));
    if (this.mode === 'web') for (const hv of (note.hovered || []).slice(0, 2)) chips.push(h('span', { class: 'chip chip-quiet' }, `hovered ${elName(hv.el)}`));
    if (note.source === 'typed') chips.push(h('span', { class: 'chip chip-quiet' }, 'typed'));

    const voidBtn = h('button', { class: 'btn btn-ghost note-void', type: 'button' }, 'Void');
    const li = h(
      'li',
      { class: 'note', dataset: { id: note.id } },
      h('div', { class: 'note-head' },
        h('span', { class: 'note-n' }, String(note.n).padStart(3, '0')),
        h('span', { class: 'note-anchor' }, this.anchor(note)),
        this.mode === 'web' && note.page?.title ? h('span', { class: 'note-page', title: note.page.url }, note.page.title) : null,
        h('span', { class: 'note-void-stamp', 'aria-hidden': 'true' }, 'VOID'),
        voidBtn,
      ),
      h('div', { class: 'note-body' },
        note.frames.length
          ? h('div', { class: 'note-frames' },
              note.frames.slice(0, 2).map((f) =>
                h('a', { href: this.session.frameUrl(f.file), target: '_blank', class: 'note-frame', title: 'Open full size' },
                  h('img', { src: this.session.frameUrl(f.file), alt: `${f.reason} capture for note ${note.n}`, loading: 'lazy' }))),
            )
          : h('div', { class: 'note-frames note-frames-none' }, h('span', {}, 'no image')),
        h('div', { class: 'note-main' }, text, chips.length ? h('div', { class: 'note-chips' }, chips) : null),
      ),
    );
    voidBtn.addEventListener('click', () => {
      const now = !voided();
      this.edits[note.id] = { ...this.edits[note.id], deleted: now };
      li.classList.toggle('voided', now);
      voidBtn.textContent = now ? 'Restore' : 'Void';
      text.disabled = now;
      this.updateSubmit();
    });
    return li;
  }

  updateSubmit() {
    const kept = this.compiled.notes.filter((n) => !this.edits[n.id]?.deleted).length;
    $('#review-submit-count', this.root).textContent = `${kept} ${kept === 1 ? 'note' : 'notes'}`;
  }

  async submit() {
    const btn = $('#review-submit', this.root);
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('busy');
    try {
      const result = await this.session.submit({
        notes: this.edits,
        general: $('#review-general', this.root).value,
        title: $('#review-title', this.root).value.trim() || undefined,
      });
      this.onSubmitted(result);
    } catch (err) {
      toast(`Couldn't send: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('busy');
    }
  }
}

function elName(el) {
  if (!el) return 'element';
  const name = el.text || el.label || '';
  return `${el.tag}${name ? ` “${name.slice(0, 32)}”` : ''}`;
}

function markLabel(m, mode) {
  const tag = { pin: 'P', box: 'B', range: 'R', marker: 'M' }[m.kind] + m.n;
  if (m.kind === 'range') return `${tag} ${timecodeShort(m.in)} → ${timecodeShort(m.out)}`;
  if (mode === 'web') return `${tag} ${m.el ? elName(m.el) : 'area'}`;
  if (m.kind === 'marker') return `${tag} ${timecodeShort(m.vt)}`;
  return `${tag} ${m.x.toFixed(2)}, ${m.y.toFixed(2)}`;
}
