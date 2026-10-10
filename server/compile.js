// Turns a raw session (events + transcript) into anchored notes and a report.
// Pure functions only: everything here is exercised by test/compile.test.js.

// Words that mean "look where my cursor is". Matched after lowercasing and stripping punctuation.
const POINTING_WORDS = new Set([
  'this', 'that', 'here', 'there', 'these', 'those',
  'هذا', 'هذه', 'هذي', 'هاذا', 'هاذي', 'ذا', 'ذي', 'هنا', 'هناك', 'هنيه', 'هنيا', 'كذا', 'ذول', 'هذول', 'هذولا',
]);

const MARK_TYPES = new Set(['video.pin', 'video.box', 'video.range', 'video.marker', 'page.mark']);
const MARK_LEAD_MS = 5000; // a mark this long before speech still belongs to it ("pin, then talk")
const MARK_TRAIL_MS = 2000;

// ---------- time helpers ----------

export function fmtClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

export function fmtTimecode(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const total = Math.max(0, sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total - h * 3600 - m * 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

const round = (n, d = 3) => (n == null ? n : Math.round(n * 10 ** d) / 10 ** d);

// Maps a position in the recorded audio (seconds) to wall-clock ms, honoring pauses.
export function buildAudioClock(events) {
  const spans = [];
  let audioPos = 0;
  let open = null;
  for (const e of events) {
    if (e.type === 'audio.start' || e.type === 'audio.resume') {
      if (open) continue;
      open = { wall: e.t, audio: audioPos };
      spans.push(open);
    } else if ((e.type === 'audio.pause' || e.type === 'audio.stop') && open) {
      audioPos += (e.t - open.wall) / 1000;
      open = null;
    }
  }
  if (!spans.length) return null;
  return (sec) => {
    let span = spans[0];
    for (const s of spans) if (s.audio <= sec + 1e-6) span = s;
    return span.wall + (sec - span.audio) * 1000;
  };
}

// Video playhead (seconds) at wall time t, extrapolated from the last known player state.
export function videoTimeAt(states, t, duration) {
  let state = null;
  for (const s of states) {
    if (s.t <= t) state = s;
    else break;
  }
  if (!state) return null;
  let vt = state.time + (state.playing ? ((t - state.t) / 1000) * (state.rate || 1) : 0);
  if (duration) vt = Math.min(vt, duration);
  return Math.max(0, vt);
}

function lastBefore(list, t, maxAgeMs = Infinity) {
  let found = null;
  for (const item of list) {
    if (item.t <= t) found = item;
    else break;
  }
  if (found && t - found.t > maxAgeMs) return null;
  return found;
}

// Groups cursor samples into places the cursor rested. Samples only arrive on movement,
// so the gap until the next sample is time spent resting at that spot.
export function restingSpots(samples, from, to, { radius, minMs }) {
  const pts = [];
  const before = lastBefore(samples, from);
  if (before) pts.push({ ...before, t: from });
  for (const s of samples) if (s.t > from && s.t <= to) pts.push(s);
  if (!pts.length) return [];

  const spots = [];
  let cluster = null;
  const close = (endT) => {
    if (!cluster) return;
    const ms = endT - cluster.t;
    if (ms >= minMs) spots.push({ x: cluster.x, y: cluster.y, ms, t: cluster.t, ref: cluster.ref });
  };
  for (const p of pts) {
    if (cluster && Math.hypot(p.x - cluster.x, p.y - cluster.y) <= radius) continue;
    close(p.t);
    cluster = { x: p.x, y: p.y, t: p.t, ref: p };
  }
  close(to);

  // Merge spots that landed on the same place twice.
  const merged = [];
  for (const s of spots) {
    const same = merged.find((m) => Math.hypot(m.x - s.x, m.y - s.y) <= radius);
    if (same) same.ms += s.ms;
    else merged.push({ ...s });
  }
  return merged.sort((a, b) => b.ms - a.ms);
}

// ---------- utterances ----------

function cleanWord(w) {
  return String(w).toLowerCase().replace(/[.,!?;:"'“”‘’()«»،؟…]/g, '').trim();
}

export function utterancesFromTranscript(transcript, toWall) {
  if (!transcript?.segments?.length || !toWall) return [];
  const raw = transcript.segments.map((seg, i) => ({
    id: `s${i + 1}`,
    text: seg.text.trim(),
    tStart: toWall(seg.start),
    tEnd: toWall(seg.end),
    words: (seg.words || []).map((w) => ({ word: w.word.trim(), t: toWall(w.start), tEnd: toWall(w.end) })),
    source: 'whisper',
  }));
  // Fold tiny fragments ("Okay.", "And,") into the following sentence so they keep their anchor.
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const u = raw[i];
    const next = raw[i + 1];
    const tiny = u.words.length < 3 && u.tEnd - u.tStart < 1200;
    if (tiny && next && next.tStart - u.tEnd < 600) {
      next.text = `${u.text} ${next.text}`;
      next.tStart = u.tStart;
      next.words = [...u.words, ...next.words];
      next.id = u.id;
      continue;
    }
    out.push(u);
  }
  return out;
}

export function utterancesFromLive(events) {
  return events
    .filter((e) => e.type === 'speech.final' && e.text?.trim())
    .map((e) => ({
      id: `l${e.id ?? e.t}`,
      text: e.text.trim(),
      tStart: e.tStart ?? e.t,
      tEnd: e.tEnd ?? e.t,
      words: null,
      source: 'live',
      note: e.note || null, // the talk note that was open when this was said
    }));
}

// Notes opened and closed with the talk key (T). Each is one explicit note.
// Discarded notes (Esc, or removed from the rundown) come back with `cancelled: true`
// so the words spoken inside them can be dropped rather than resurfacing as free speech.
export function talkSegments(events, sessionEnd, { includeCancelled = false } = {}) {
  const cancelled = new Map(events.filter((e) => e.type === 'note.cancel').map((e) => [e.id, e.t]));
  const segs = [];
  for (const e of events) {
    if (e.type === 'note.start') segs.push({ id: e.id, start: e.t, end: null, cancelled: cancelled.has(e.id) });
    else if (e.type === 'note.end') {
      const seg = segs.find((s) => s.id === e.id);
      if (seg) seg.end = e.t;
    }
  }
  segs.forEach((s, i) => {
    s.end ??= (s.cancelled && cancelled.get(s.id) > s.start ? cancelled.get(s.id) : null) ?? segs[i + 1]?.start ?? sessionEnd;
  });
  return includeCancelled ? segs : segs.filter((s) => !s.cancelled);
}

const WORD_LEAD_MS = 300; // words just before the key press still belong to the note
const WORD_TRAIL_MS = 600;

function joinWords(words) {
  return words.map((w) => w.word).join(' ').replace(/\s+/g, ' ').replace(/\s+([.,!?;:،؟])/g, '$1').trim();
}

// Splits speech between talk-key notes and free speech outside them.
function splitBySegments(utterances, allSegs) {
  if (!allSegs.length) return utterances;
  const segs = allSegs.filter((s) => !s.cancelled);
  const byId = new Map(segs.map((s) => [s.id, { id: `n${s.id}`, text: '', tStart: s.start, tEnd: s.end, words: [], source: 'talk', talk: true, segId: s.id }]));
  const inside = (t, s) => t >= s.start - WORD_LEAD_MS && t <= s.end + WORD_TRAIL_MS;
  const free = [];
  for (const u of utterances) {
    if (u.words?.length) {
      const rest = [];
      for (const w of u.words) {
        const seg = allSegs.find((s) => inside(w.t, s));
        if (seg?.cancelled) continue; // spoken into a discarded note
        if (seg) byId.get(seg.id).words.push(w);
        else rest.push(w);
      }
      if (rest.length) free.push({ ...u, words: rest, text: joinWords(rest), tStart: rest[0].t, tEnd: rest.at(-1).tEnd ?? rest.at(-1).t });
    } else {
      // Live captions know which note was open; older events fall back to the nearest window.
      const seg = u.note ? allSegs.find((s) => s.id === u.note) : nearestSegment(allSegs, u.tStart);
      if (seg?.cancelled) continue;
      if (seg) {
        const note = byId.get(seg.id);
        note.text = `${note.text} ${u.text}`.trim();
      } else free.push(u);
    }
  }
  for (const note of byId.values()) {
    if (note.words.length) note.text = joinWords(note.words);
    note.source = utterances[0]?.source === 'live' ? 'live' : 'whisper';
  }
  return [...byId.values(), ...free];
}

function nearestSegment(segs, t) {
  let best = null;
  let bestDist = Infinity;
  for (const s of segs) {
    if (t < s.start - 1500 || t > s.end + 2500) continue;
    const dist = t < s.start ? s.start - t : t > s.end ? t - s.end : 0;
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best;
}

function typedNotes(events) {
  return events
    .filter((e) => e.type === 'note.text' && e.text?.trim())
    .map((e) => ({ id: `t${e.id ?? e.t}`, ref: e.id, text: e.text.trim(), tStart: e.t, tEnd: e.t, words: null, source: 'typed' }));
}

// ---------- marks ----------

function attachMarks(utterances, marks) {
  const owner = new Map();
  for (const m of marks) {
    let best = null;
    let bestDist = Infinity;
    for (const u of utterances) {
      if (u.source === 'typed') continue;
      // A note opened and closed with the talk key has explicit edges: only marks made inside it.
      if (u.talk) {
        if (m.t >= u.tStart && m.t <= u.tEnd) {
          best = u;
          bestDist = -1;
        }
        continue;
      }
      let dist;
      if (m.t < u.tStart) {
        if (u.tStart - m.t > MARK_LEAD_MS) continue;
        dist = (u.tStart - m.t) * 0.5; // favor the speech that follows a mark
      } else if (m.t > u.tEnd) {
        if (m.t - u.tEnd > MARK_TRAIL_MS) continue;
        dist = m.t - u.tEnd;
      } else {
        dist = 0;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = u;
      }
    }
    if (best) owner.set(m.id, best.id);
  }
  return owner;
}

function describeMark(m, video) {
  const base = { id: m.id, n: m.n, kind: m.kind, t: m.t };
  if (m.type === 'page.mark') {
    return { ...base, url: m.url, title: m.title, x: m.x, y: m.y, w: m.w, h: m.h, viewport: m.viewport, el: m.el || null, label: m.label || null };
  }
  const px = (fx, dim) => (dim ? Math.round(fx * dim) : null);
  const out = { ...base, vt: m.vt ?? null };
  if (m.kind === 'pin' || m.kind === 'box') {
    Object.assign(out, { x: round(m.x), y: round(m.y), px: { x: px(m.x, video?.width), y: px(m.y, video?.height) } });
  }
  if (m.kind === 'box') {
    Object.assign(out, { w: round(m.w), h: round(m.h), pxSize: { w: px(m.w, video?.width), h: px(m.h, video?.height) } });
  }
  if (m.kind === 'range') Object.assign(out, { in: m.in, out: m.out });
  return out;
}

// ---------- main compile ----------

export function compileSession({ meta, events, transcript = null }) {
  const evs = [...events].sort((a, b) => a.t - b.t);
  const mode = meta.mode;
  const t0 = meta.startedAt ?? evs[0]?.t ?? 0;
  const tEndSession = meta.endedAt ?? evs.at(-1)?.t ?? t0;

  const toWall = buildAudioClock(evs);
  let utterances = utterancesFromTranscript(transcript, toWall);
  const transcriptSource = utterances.length ? 'whisper' : 'live';
  if (!utterances.length) utterances = utterancesFromLive(evs);
  const allSegs = talkSegments(evs, tEndSession, { includeCancelled: true });
  const segs = allSegs.filter((s) => !s.cancelled);
  const removed = new Set(evs.filter((e) => e.type === 'mark.remove').map((e) => e.id));
  const typed = typedNotes(evs.filter((e) => !(e.type === 'note.text' && removed.has(e.id))));
  utterances = [...splitBySegments(utterances, allSegs), ...typed].sort((a, b) => a.tStart - b.tStart);
  // A talk note Whisper left empty (noise filtered, or nothing caught) keeps its live caption.
  const liveByNote = new Map();
  for (const e of evs) if (e.type === 'speech.final' && e.note && e.text?.trim()) liveByNote.set(e.note, `${liveByNote.get(e.note) || ''} ${e.text.trim()}`.trim());
  for (const u of utterances) {
    if (u.talk && !u.text && liveByNote.has(u.segId)) {
      u.text = liveByNote.get(u.segId);
      u.source = 'live';
    }
  }

  // A pin placed just before pressing T is linked to that note afterwards.
  const links = new Map(evs.filter((e) => e.type === 'mark.link').map((e) => [e.id, e.note]));
  const marks = evs
    .filter((e) => MARK_TYPES.has(e.type) && !removed.has(e.id))
    .map((m) => (links.has(m.id) && !m.note ? { ...m, note: links.get(m.id) } : m));
  const frames = evs.filter((e) => e.type === 'frame');
  // Marks made for a talk-key note belong to it outright; the rest attach by timing.
  const owner = attachMarks(utterances, marks.filter((m) => !m.note || !segs.some((s) => s.id === m.note)));
  for (const m of marks) if (m.note && segs.some((s) => s.id === m.note)) owner.set(m.id, `n${m.note}`);

  const video = meta.video || null;
  const videoStates = evs.filter((e) => e.type === 'video.state');
  const videoMouse = evs.filter((e) => e.type === 'video.mouse' && e.inside !== false);
  // The extension and the page can both report the same arrival; keep the first.
  const pageVisits = evs
    .filter((e) => e.type === 'page.visit')
    .filter((v, i, all) => !(i > 0 && all[i - 1].url === v.url && v.t - all[i - 1].t < 3000));
  const pageMouse = evs.filter((e) => e.type === 'page.mouse');
  const hovers = evs.filter((e) => e.type === 'page.hover');
  const clicks = evs.filter((e) => e.type === 'page.click');
  const selections = evs.filter((e) => e.type === 'page.select');

  const vt = (t) => (mode === 'video' ? videoTimeAt(videoStates, t, video?.duration) : null);

  const items = [
    ...utterances.map((u) => ({ ...u, marks: marks.filter((m) => owner.get(m.id) === u.id) })),
    ...marks
      .filter((m) => !owner.has(m.id))
      .map((m) => ({ id: `m${m.id}`, text: '', tStart: m.t, tEnd: m.t, words: null, source: 'mark', marks: [m] })),
  ].sort((a, b) => a.tStart - b.tStart);

  const notes = items.map((item, i) => {
    const note = {
      id: item.id,
      n: i + 1,
      source: item.source,
      talk: !!item.talk,
      text: item.text,
      at: item.tStart - t0,
      duration: item.tEnd - item.tStart,
      tStart: item.tStart,
      tEnd: item.tEnd,
      marks: item.marks.map((m) => describeMark(m, video)),
    };
    const markIds = new Set(item.marks.map((m) => m.id));
    const pointingWords = (item.words || []).filter((w) => POINTING_WORDS.has(cleanWord(w.word))).slice(0, 6);

    if (mode === 'video') {
      note.video = { from: round(vt(item.tStart), 2), to: round(vt(item.tEnd), 2) };
      const spots = restingSpots(videoMouse, item.tStart - 300, item.tEnd, { radius: 0.03, minMs: 400 }).slice(0, 3);
      note.video.cursorRested = spots.map((s) => ({ x: round(s.x), y: round(s.y), ms: Math.round(s.ms), vt: round(s.ref?.vt, 2) }));
      const at = lastBefore(videoMouse, item.tStart, 3000);
      note.video.cursorAtStart = at ? { x: round(at.x), y: round(at.y) } : null;
      note.pointing = pointingWords
        .map((w) => {
          const s = lastBefore(videoMouse, w.t, 4000);
          return s ? { word: w.word, t: w.t, vt: round(vt(w.t), 2), x: round(s.x), y: round(s.y) } : null;
        })
        .filter(Boolean);
    } else {
      const visit = lastBefore(pageVisits, item.tStart) || pageVisits[0] || null;
      note.page = visit ? { url: visit.url, title: visit.title } : null;
      const pagesDuring = pageVisits.filter((v) => v.t > item.tStart && v.t <= item.tEnd).map((v) => ({ url: v.url, title: v.title }));
      if (pagesDuring.length) note.navigatedTo = pagesDuring;

      // Element dwell: each hover lasts until the next hover or page change.
      const windowFrom = item.tStart - 1000;
      const dwell = new Map();
      for (let h = 0; h < hovers.length; h++) {
        const cur = hovers[h];
        const end = Math.min(hovers[h + 1]?.t ?? tEndSession, item.tEnd);
        const start = Math.max(cur.t, windowFrom);
        if (end <= start || !cur.el) continue;
        const key = cur.el.selector || cur.el.html;
        const prev = dwell.get(key);
        if (prev) prev.ms += end - start;
        else dwell.set(key, { el: cur.el, ms: end - start });
      }
      note.hovered = [...dwell.values()].filter((d) => d.ms >= 400).sort((a, b) => b.ms - a.ms).slice(0, 4).map((d) => ({ el: d.el, ms: Math.round(d.ms) }));
      note.clicks = clicks.filter((c) => c.t >= item.tStart - 2000 && c.t <= item.tEnd).map((c) => ({ el: c.el, x: c.x, y: c.y, t: c.t }));
      const sel = selections.filter((s) => s.t >= item.tStart - 4000 && s.t <= item.tEnd).at(-1);
      if (sel) note.selection = sel.text;
      note.pointing = pointingWords
        .map((w) => {
          const h = lastBefore(hovers, w.t, 8000);
          const m = lastBefore(pageMouse, w.t, 8000);
          if (!h && !m) return null;
          return { word: w.word, t: w.t, el: h?.el || null, x: m?.x ?? null, y: m?.y ?? null };
        })
        .filter(Boolean);
    }

    // Frames: ones taken for this note or its marks; otherwise the closest grab around when it began.
    const ownRef = item.segId || item.ref;
    const own = frames.filter((f) => f.ref && (markIds.has(f.ref) || f.ref === ownRef));
    const near = own.length
      ? []
      : frames
          .filter((f) => f.t >= item.tStart - 1500 && f.t <= item.tEnd + 500 && f.reason !== 'page')
          .sort((a, b) => Math.abs(a.t - item.tStart) - Math.abs(b.t - item.tStart))
          .slice(0, 1);
    let picked = [...own, ...near];
    if (!picked.length && mode === 'web' && note.page) {
      const pageShot = frames.filter((f) => f.reason === 'page' && f.url === note.page.url && f.t <= item.tEnd).at(-1);
      if (pageShot) picked = [pageShot];
    }
    note.frames = picked.map((f) => ({ file: f.file, reason: f.reason, t: f.t }));
    return note;
  });

  // Page history for web sessions.
  const pages = pageVisits.map((v, i) => {
    const end = pageVisits[i + 1]?.t ?? tEndSession;
    return {
      url: v.url,
      title: v.title,
      at: v.t - t0,
      ms: Math.max(0, end - v.t),
      notes: notes.filter((n) => n.page?.url === v.url && n.tStart >= v.t && n.tStart < end).map((n) => n.n),
    };
  });

  const allMarks = notes.flatMap((n) => n.marks);
  const stats = {
    durationMs: Math.max(0, tEndSession - t0),
    notes: notes.length,
    voiceNotes: notes.filter((n) => n.source === 'whisper' || n.source === 'live').length,
    pins: allMarks.filter((m) => m.kind === 'pin').length,
    boxes: allMarks.filter((m) => m.kind === 'box').length,
    ranges: allMarks.filter((m) => m.kind === 'range').length,
    markers: allMarks.filter((m) => m.kind === 'marker').length,
    pages: new Set(pageVisits.map((v) => v.url)).size,
    frames: frames.length,
  };

  return { transcriptSource, notes, pages, stats };
}

// Applies the user's edits from the Review screen.
export function applyEdits(compiled, edits = {}) {
  const noteEdits = edits.notes || {};
  const notes = compiled.notes
    .filter((n) => !noteEdits[n.id]?.deleted)
    .map((n) => (noteEdits[n.id]?.text != null ? { ...n, text: noteEdits[n.id].text.trim(), edited: true } : n))
    .map((n, i) => ({ ...n, n: i + 1 }));
  return { ...compiled, notes, general: (edits.general || '').trim() };
}

// ---------- report ----------

function describeEl(el) {
  if (!el) return '';
  const tag = el.tag || 'element';
  const id = el.id ? `#${el.id}` : '';
  const cls = (el.cls || []).slice(0, 3).map((c) => `.${c}`).join('');
  const name = el.text || el.label || el.alt || '';
  return `\`${tag}${id}${cls}\`${name ? ` "${truncate(name, 80)}"` : ''}`;
}

function truncate(s, n) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function pathOf(url) {
  try {
    const u = new URL(url);
    return (u.pathname + u.search + u.hash) || '/';
  } catch {
    return url;
  }
}

function xy(x, y) {
  return `x ${Number(x).toFixed(2)}, y ${Number(y).toFixed(2)}`;
}

function fmtSecs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function quote(text) {
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

export function renderReport({ meta, compiled }) {
  const { notes, pages, stats } = compiled;
  const isVideo = meta.mode === 'video';
  const video = meta.video;
  const L = [];
  const subject = isVideo ? video?.name || 'video' : meta.startUrl ? pathOf(meta.startUrl) : 'website';

  L.push(`# Dictate · ${isVideo ? 'Video review' : 'Web review'}${meta.title ? ` — ${meta.title}` : ` — ${subject}`}`);
  L.push('');
  const when = new Date(meta.startedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  L.push(`- **Session:** \`${meta.id}\` · recorded ${when} · ${fmtClock(stats.durationMs)} long`);
  if (meta.project) L.push(`- **Project:** ${meta.project}`);
  if (isVideo && video) {
    const dims = video.width ? ` · ${video.width}×${video.height}` : '';
    const dur = video.duration ? ` · ${fmtTimecode(video.duration)}` : '';
    L.push(`- **Video:** \`${video.name}\`${dims}${dur}`);
    L.push(video.path ? `- **Source file:** \`${video.path}\`` : `- **Source file:** dropped into the studio, so the path is unknown. Look for \`${video.name}\`${video.size ? ` (${video.size} bytes)` : ''} in the project.`);
  }
  if (!isVideo && meta.startUrl) L.push(`- **Start URL:** ${meta.startUrl}`);
  const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const counts = [
    count(stats.notes, 'note'),
    stats.pins && count(stats.pins, 'pin'),
    stats.boxes && count(stats.boxes, 'box', 'boxes'),
    stats.ranges && count(stats.ranges, 'range'),
    stats.markers && count(stats.markers, 'marker'),
    !isVideo && count(stats.pages, 'page'),
    count(stats.frames, 'image'),
  ].filter(Boolean);
  L.push(`- **Contents:** ${counts.join(' · ')}`);
  const tx = meta.transcript;
  L.push(
    `- **Transcript:** ${compiled.transcriptSource === 'whisper' ? `Whisper ${tx?.model || ''}${tx?.language ? ` (${tx.language})` : ''}, word-timed` : 'live browser captions (less precise; check audio.webm if something reads oddly)'}`,
  );
  L.push('');
  L.push(
    isVideo
      ? '> **How to read this:** each note is what the user said plus where they were pointing while they said it. Positions are fractions of the video frame (x 0→1 is left→right, y 0→1 is top→bottom), with source pixels in brackets. Timecodes are positions in the source video. Images in `frames/` show the frame with the user\'s numbered pins, boxes, and cursor (ring) drawn on top. "Pointing" lists where the cursor was at the moment the user said a word like "this" or "here".'
      : '> **How to read this:** each note is what the user said plus what they were pointing at on the page while they said it. Elements include a CSS selector, visible text, and an HTML snippet so you can find them in the codebase. Screenshots in `frames/` show numbered pins and boxes the user placed, plus the cursor (ring). "Pointing" lists the element under the cursor at the moment the user said a word like "this" or "here".',
  );
  L.push('');

  if (compiled.general) {
    L.push('## Overall direction');
    L.push('');
    L.push(compiled.general);
    L.push('');
  }

  L.push('## Notes');
  L.push('');
  if (!notes.length) L.push('_No notes were captured in this session._');

  for (const n of notes) {
    if (isVideo) {
      const range = n.video?.from != null ? (Math.abs((n.video.to ?? n.video.from) - n.video.from) >= 0.5 ? `${fmtTimecode(n.video.from)} – ${fmtTimecode(n.video.to)}` : fmtTimecode(n.video.from)) : 'no video loaded';
      L.push(`### ${n.n}. ${range}`);
    } else {
      L.push(`### ${n.n}. ${n.page ? pathOf(n.page.url) : 'page'} · ${fmtClock(n.at)} into the session`);
    }
    L.push('');
    if (!isVideo && n.page) L.push(`Page: [${truncate(n.page.title || n.page.url, 90)}](${n.page.url})`, '');
    if (n.text) L.push(quote(n.text), '');
    else if (n.talk) L.push('_The user opened a voice note here but no words were picked up. Check `audio.webm` at this time._', '');
    else L.push('_No words. The user marked this spot without speaking._', '');

    const bullets = [];
    if (n.source === 'typed') bullets.push('**Typed note** (not spoken)');
    for (const m of n.marks) {
      if (m.kind === 'range') bullets.push(`**Range R${m.n}:** ${fmtTimecode(m.in)} → ${fmtTimecode(m.out)} (${(m.out - m.in).toFixed(2)}s)`);
      else if (m.kind === 'marker') bullets.push(`**Marker M${m.n}** at ${fmtTimecode(m.vt)}`);
      else if (isVideo && m.kind === 'pin') bullets.push(`**Pin P${m.n}** at ${xy(m.x, m.y)}${m.px?.x != null ? ` [${m.px.x}, ${m.px.y} px]` : ''} · ${fmtTimecode(m.vt)}`);
      else if (isVideo && m.kind === 'box') bullets.push(`**Box B${m.n}** from ${xy(m.x, m.y)}, size ${Number(m.w).toFixed(2)} × ${Number(m.h).toFixed(2)}${m.px?.x != null ? ` [${m.px.x}, ${m.px.y} px · ${m.pxSize.w}×${m.pxSize.h} px]` : ''} · ${fmtTimecode(m.vt)}`);
      else if (!isVideo) {
        const label = m.kind === 'box' ? `**Box B${m.n}**` : `**Pin P${m.n}**`;
        const lines = [`${label} → ${m.el ? describeEl(m.el) : 'area'}`];
        if (m.el?.selector) lines.push(`  - selector: \`${m.el.selector}\``);
        if (m.el?.html) lines.push(`  - html: \`${truncate(m.el.html, 220)}\``);
        if (m.kind === 'box' || m.el?.rect) {
          const r = m.kind === 'box' ? m : m.el.rect;
          lines.push(`  - ${m.kind === 'box' ? 'area' : 'element box'}: ${Math.round(r.x)},${Math.round(r.y)} · ${Math.round(r.w)}×${Math.round(r.h)} px${m.viewport ? ` in a ${m.viewport.w}×${m.viewport.h} viewport` : ''}`);
        }
        bullets.push(lines.join('\n'));
      }
    }
    for (const p of n.pointing || []) {
      if (isVideo) bullets.push(`**Pointing** "${p.word}" → ${xy(p.x, p.y)}${p.vt != null ? ` · ${fmtTimecode(p.vt)}` : ''}`);
      else bullets.push(`**Pointing** "${p.word}" → ${p.el ? describeEl(p.el) : `cursor at ${p.x}, ${p.y} px`}`);
    }
    if (isVideo && n.video?.cursorRested?.length) {
      bullets.push(`**Cursor rested** ${n.video.cursorRested.map((s) => `${xy(s.x, s.y)} (${fmtSecs(s.ms)})`).join('; ')}`);
    }
    if (!isVideo) {
      if (n.hovered?.length) bullets.push(`**Hovered** ${n.hovered.map((h) => `${describeEl(h.el)} (${fmtSecs(h.ms)})`).join(', ')}`);
      if (n.clicks?.length) bullets.push(`**Clicked** ${n.clicks.map((c) => describeEl(c.el)).join(', ')}`);
      if (n.selection) bullets.push(`**Selected text** "${truncate(n.selection, 200)}"`);
      if (n.navigatedTo?.length) bullets.push(`**Navigated to** ${n.navigatedTo.map((p) => pathOf(p.url)).join(' → ')}`);
    }
    if (n.edited) bullets.push('_Text corrected by the user before submitting._');
    for (const f of n.frames) bullets.push(`**${isVideo ? 'Frame' : 'Screenshot'}** \`${f.file}\``);
    if (bullets.length) L.push(bullets.map((b) => `- ${b}`).join('\n'), '');
  }

  if (isVideo) {
    const ranges = notes.flatMap((n) => n.marks.filter((m) => m.kind === 'range').map((m) => ({ ...m, note: n.n })));
    if (ranges.length) {
      L.push('## Ranges', '', '| Range | In | Out | Length | Note |', '|---|---|---|---|---|');
      for (const r of ranges) L.push(`| R${r.n} | ${fmtTimecode(r.in)} | ${fmtTimecode(r.out)} | ${(r.out - r.in).toFixed(2)}s | ${r.note} |`);
      L.push('');
    }
  } else if (pages.length) {
    L.push('## Pages visited', '', '| # | At | Page | Time on page | Notes |', '|---|---|---|---|---|');
    pages.forEach((p, i) => L.push(`| ${i + 1} | ${fmtClock(p.at)} | [${truncate(p.title || pathOf(p.url), 60).replace(/\|/g, '/')}](${p.url}) | ${fmtClock(p.ms)} | ${p.notes.join(', ') || '—'} |`));
    L.push('');
  }

  L.push('## Files in this folder', '');
  L.push('- `report.md`: this report');
  L.push('- `session.json`: the same notes as structured data, with cursor dwell, element details, and timings');
  L.push('- `events.jsonl`: the raw event stream (every cursor sample, click, and page change)');
  if (compiled.transcriptSource === 'whisper') L.push('- `transcript.json`: word-level transcript');
  L.push(`- \`frames/\`: ${stats.frames} ${isVideo ? 'frame grabs' : 'screenshots'}`);
  if (meta.audioBytes) L.push('- `audio.webm`: the voice recording');
  L.push('');
  return L.join('\n');
}
