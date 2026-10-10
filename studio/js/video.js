// Video review: play, point, draw, and talk over a video.
import { $, h, timecode, cssVar, isTyping, uid, dirOf, toast, prefs, savePref, revealInList } from './util.js';

const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
const MARK_VISIBLE_S = 0.75; // pins and boxes belong to a moment, not the whole video
const MAX_ZOOM = 32;

export class VideoReview {
  constructor({ root, recorder, config }) {
    this.root = root;
    this.rec = recorder; // shared Recorder (voice + session)
    this.config = config;
    this.video = $('#video', root);
    this.stage = $('#stage', root);
    this.overlay = $('#overlay', root);
    this.timeline = $('#timeline', root);
    this.log = $('#video-log', root);
    this.fps = 30;
    this.marks = []; // {id, n, kind, x, y, w, h, vt, in, out, note, thumb}
    this.counters = { pin: 0, box: 0, range: 0, marker: 0 };
    this.pendingIn = null;
    this.mouse = null; // {x, y} normalized, or null when off-frame
    this.trail = [];
    this.drag = null;
    this.zoom = 1;
    this.viewLock = null;
    this.lastMouseSent = 0;
    this.lastStateSent = 0;
    this.lastSpeechGrab = 0;
    this.source = null; // {name, size, path, url}
    this.noteThumbs = new Map();
    this.pauseOnSpeech = prefs('pauseOnSpeech', true);
    this.bind();
    this.renderLogEmpty();
  }

  // ---------- loading ----------

  async loadFile(file) {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(file.name)) {
      toast(`${file.name} isn't a video file.`, 'error');
      return;
    }
    this.load({ url: URL.createObjectURL(file), name: file.name, size: file.size, path: null });
  }

  load(source) {
    this.source = source;
    this.video.src = source.url;
    this.root.classList.add('has-video');
    for (const el of [$('#video-name', this.root), $('#video-name-top', this.root)]) {
      el.textContent = source.name;
      el.title = source.path || source.name;
    }
  }

  videoInfo() {
    const v = this.video;
    return {
      name: this.source?.name,
      size: this.source?.size ?? null,
      path: this.source?.path ?? null,
      fromPath: !!this.source?.path,
      duration: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) / 1000 : null,
      width: v.videoWidth || null,
      height: v.videoHeight || null,
      fps: this.fps,
    };
  }

  detectFps() {
    if (!this.video.requestVideoFrameCallback) return;
    const samples = [];
    let last = null;
    const step = (_now, meta) => {
      if (last != null && meta.mediaTime > last) samples.push(meta.mediaTime - last);
      last = meta.mediaTime;
      if (samples.length < 20) this.video.requestVideoFrameCallback(step);
      else {
        samples.sort((a, b) => a - b);
        const guess = 1 / samples[Math.floor(samples.length / 2)];
        this.fps = COMMON_FPS.reduce((a, b) => (Math.abs(b - guess) < Math.abs(a - guess) ? b : a));
        $('#fps', this.root).textContent = `${String(this.fps).replace(/\.0+$/, '')} fps`;
        this.rec.session?.meta({ video: this.videoInfo() });
      }
    };
    this.video.requestVideoFrameCallback(step);
  }

  // ---------- geometry ----------

  // The rectangle the picture actually occupies inside the letterboxed stage.
  contentRect() {
    const r = this.stage.getBoundingClientRect();
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    const scale = Math.min(r.width / vw, r.height / vh);
    const w = vw * scale;
    const hgt = vh * scale;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hgt) / 2, width: w, height: hgt, stage: r };
  }

  toNorm(e) {
    const c = this.contentRect();
    return { x: (e.clientX - c.left) / c.width, y: (e.clientY - c.top) / c.height };
  }

  // Visible slice of the timeline. Zoomed in, it follows the playhead.
  view() {
    const dur = this.video.duration;
    if (!Number.isFinite(dur) || dur <= 0) return null;
    if (this.viewLock) return this.viewLock;
    const span = dur / this.zoom;
    const start = this.zoom > 1 ? Math.min(Math.max(this.video.currentTime - span / 2, 0), dur - span) : 0;
    return { start, end: start + span, span };
  }

  // ---------- binding ----------

  bind() {
    const v = this.video;
    v.addEventListener('loadedmetadata', () => {
      this.root.classList.remove('video-error');
      $('#video-dims', this.root).textContent = `${v.videoWidth}×${v.videoHeight}`;
      this.detectFps();
      this.resize();
      this.rec.session?.meta({ video: this.videoInfo() });
    });
    v.addEventListener('error', () => {
      this.root.classList.add('video-error');
      toast("This video can't play in the browser. Export an H.264 MP4 proxy and load that instead.", 'error');
    });
    for (const type of ['play', 'pause', 'seeked', 'ratechange', 'ended']) v.addEventListener(type, () => this.sendState(type));
    v.addEventListener('play', () => this.root.classList.add('playing'));
    v.addEventListener('pause', () => this.root.classList.remove('playing'));
    v.addEventListener('volumechange', () => this.root.classList.toggle('muted', v.muted));

    // Pointer on the picture: hover tracks, click pins, drag boxes.
    this.stage.addEventListener('pointermove', (e) => this.onMove(e));
    this.stage.addEventListener('pointerleave', () => {
      this.mouse = null;
      this.sendMouse(null, true);
    });
    this.stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.source) return;
      const p = this.toNorm(e);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      this.stage.setPointerCapture(e.pointerId);
      this.drag = { start: p, now: p };
    });
    this.stage.addEventListener('pointerup', () => {
      if (!this.drag) return;
      const d = this.drag;
      this.drag = null;
      const c = this.contentRect();
      const dx = (d.now.x - d.start.x) * c.width;
      const dy = (d.now.y - d.start.y) * c.height;
      if (Math.hypot(dx, dy) > 8) {
        const x = clamp01(Math.min(d.start.x, d.now.x));
        const y = clamp01(Math.min(d.start.y, d.now.y));
        this.addMark('box', { x, y, w: clamp01(Math.max(d.start.x, d.now.x)) - x, h: clamp01(Math.max(d.start.y, d.now.y)) - y });
      } else {
        this.addMark('pin', { x: clamp01(d.start.x), y: clamp01(d.start.y) });
      }
    });

    // Transport.
    $('#btn-play', this.root).addEventListener('click', () => this.togglePlay());
    $('#btn-back', this.root).addEventListener('click', () => this.step(-1));
    $('#btn-fwd', this.root).addEventListener('click', () => this.step(1));
    $('#btn-in', this.root).addEventListener('click', () => this.markIn());
    $('#btn-out', this.root).addEventListener('click', () => this.markOut());
    $('#btn-marker', this.root).addEventListener('click', () => this.addMark('marker', {}));
    $('#btn-mute', this.root).addEventListener('click', () => (v.muted = !v.muted));
    $('#rate', this.root).addEventListener('change', (e) => (v.playbackRate = Number(e.target.value)));
    const pos = $('#pause-on-speech');
    if (pos) {
      pos.checked = this.pauseOnSpeech;
      pos.addEventListener('change', () => {
        this.pauseOnSpeech = pos.checked;
        savePref('pauseOnSpeech', pos.checked);
      });
    }

    // Timeline: scrub, and zoom with the slider, the buttons, or Ctrl+wheel.
    const zoomInput = $('#tl-zoom', this.root);
    const setZoom = (z) => {
      this.zoom = Math.min(MAX_ZOOM, Math.max(1, z));
      zoomInput.value = String(Math.log2(this.zoom));
    };
    zoomInput.addEventListener('input', () => setZoom(2 ** Number(zoomInput.value)));
    $('#tl-zoom-in', this.root).addEventListener('click', () => setZoom(this.zoom * 2));
    $('#tl-zoom-out', this.root).addEventListener('click', () => setZoom(this.zoom / 2));
    this.timeline.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(this.zoom * (e.deltaY < 0 ? 1.25 : 0.8));
    }, { passive: false });

    const timeAt = (e) => {
      const view = this.view();
      if (!view) return null;
      const r = this.timeline.getBoundingClientRect();
      return view.start + clamp01((e.clientX - r.left) / r.width) * view.span;
    };
    this.timeline.addEventListener('pointerdown', (e) => {
      if (!this.view()) return;
      this.timeline.setPointerCapture(e.pointerId);
      this.viewLock = this.view(); // hold the view still while dragging
      this.scrubbing = true;
      v.currentTime = timeAt(e);
    });
    this.timeline.addEventListener('pointermove', (e) => {
      if (this.scrubbing) v.currentTime = timeAt(e);
      this.hoverT = timeAt(e);
    });
    const endScrub = () => {
      this.scrubbing = false;
      this.viewLock = null;
    };
    this.timeline.addEventListener('pointerup', endScrub);
    this.timeline.addEventListener('pointercancel', endScrub);
    this.timeline.addEventListener('pointerleave', () => (this.hoverT = null));

    // Drop a file anywhere on the screen.
    this.root.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.root.classList.add('dropping');
    });
    this.root.addEventListener('dragleave', (e) => {
      if (!this.root.contains(e.relatedTarget)) this.root.classList.remove('dropping');
    });
    this.root.addEventListener('drop', (e) => {
      e.preventDefault();
      this.root.classList.remove('dropping');
      if (this.rec.active) {
        toast('Finish this review before loading another video.', 'error');
        return;
      }
      this.loadFile(e.dataTransfer.files[0]);
    });

    new ResizeObserver(() => this.resize()).observe(this.stage);
    new ResizeObserver(() => this.resize()).observe(this.timeline);
    new ResizeObserver(() => revealInList(this.log.querySelector('.log-row.open'))).observe(this.log);
    const frame = () => {
      this.draw();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // Fixed navigation keys (everything else is a customizable binding in main.js).
  onKey(e) {
    if (isTyping(e)) return false;
    const v = this.video;
    switch (e.code) {
      case 'ArrowLeft':
        this.step(e.shiftKey ? -this.fps : -1);
        break;
      case 'ArrowRight':
        this.step(e.shiftKey ? this.fps : 1);
        break;
      case 'KeyJ':
        v.currentTime = Math.max(0, v.currentTime - 5);
        break;
      case 'KeyL':
        v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
        break;
      case 'Backspace':
      case 'Delete':
        this.undo();
        break;
      default:
        return false;
    }
    return true;
  }

  // Drop a box being dragged or an in-point waiting for its out.
  cancelPending() {
    this.drag = null;
    this.pendingIn = null;
  }

  togglePlay() {
    if (!this.source) return;
    if (this.video.paused) this.video.play().catch(() => {});
    else this.video.pause();
  }

  step(frames) {
    this.video.pause();
    this.video.currentTime = Math.max(0, Math.min(this.video.duration || 0, this.video.currentTime + frames / this.fps));
  }

  // ---------- recording hooks ----------

  sendState(why) {
    if (!this.rec.recording) return;
    const now = performance.now();
    if (why === 'seeked' && now - this.lastStateSent < 150) return;
    this.lastStateSent = now;
    const v = this.video;
    this.rec.event('video.state', { time: round3(v.currentTime), playing: !v.paused && !v.ended, rate: v.playbackRate, why });
  }

  onMove(e) {
    const p = this.toNorm(e);
    const inside = p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    this.mouse = inside ? p : null;
    if (this.drag) this.drag.now = { x: clamp01(p.x), y: clamp01(p.y) };
    if (inside) {
      this.trail.push({ ...p, t: performance.now() });
      if (this.trail.length > 40) this.trail.shift();
    }
    this.sendMouse(inside ? p : null);
  }

  sendMouse(p, force = false) {
    if (!this.rec.recording) return;
    const now = performance.now();
    if (!force && now - this.lastMouseSent < 66) return;
    this.lastMouseSent = now;
    if (p) this.rec.event('video.mouse', { x: round3(p.x), y: round3(p.y), vt: round3(this.video.currentTime), inside: true });
    else this.rec.event('video.mouse', { inside: false, vt: round3(this.video.currentTime) });
  }

  // Open mic: the recorder heard you start talking.
  onSpeechStart() {
    if (!this.source) return;
    if (this.pauseOnSpeech && !this.video.paused) this.video.pause();
    const now = Date.now();
    if (now - this.lastSpeechGrab > 2500) {
      this.lastSpeechGrab = now;
      this.grab('speech');
    }
  }

  onRecordingStart() {
    this.sendState('start');
    this.counters = { pin: 0, box: 0, range: 0, marker: 0 };
    this.marks = [];
    this.noteThumbs.clear();
    this.log.replaceChildren();
    this.renderLogEmpty();
  }

  // ---------- marks ----------

  markIn() {
    if (!this.source) return;
    this.pendingIn = this.video.currentTime;
  }

  markOut() {
    if (!this.source) return;
    const t = this.video.currentTime;
    if (this.pendingIn == null) {
      toast('Press I at the start of the range first.');
      return;
    }
    const [a, b] = [this.pendingIn, t].sort((x, y) => x - y);
    this.pendingIn = null;
    if (b - a < 1 / this.fps) return;
    this.addMark('range', { in: round3(a), out: round3(b) });
  }

  async addMark(kind, data) {
    if (!this.source) return null;
    if (!this.rec.recording) {
      // Pointing at the picture is enough to start (or resume) a session.
      if (this.onNeedSession) await this.onNeedSession();
      if (!this.rec.recording) return null;
    }
    const n = ++this.counters[kind];
    const mark = { id: uid(kind[0]), n, kind, vt: round3(this.video.currentTime), ...data };
    for (const k of ['x', 'y', 'w', 'h']) if (mark[k] != null) mark[k] = round3(mark[k]);
    mark.createdAt = Date.now();
    this.marks.push(mark);
    const { createdAt, ...event } = mark;
    this.rec.event(`video.${kind}`, event);
    mark.thumb = this.grab('mark', { ref: mark.id });
    // A pin made for a talk note shows up on the note's row instead of its own.
    if (!mark.note) this.logMark(mark);
    return mark;
  }

  // T pressed: tie the new note to what you just pointed at, or to whatever is under the cursor.
  async onNoteOpen(noteId) {
    if (!this.source) return;
    if (this.pauseOnSpeech && !this.video.paused) this.video.pause();
    this.lastSpeechGrab = Date.now();
    const recent = this.marks.at(-1);
    if (recent && !recent.note && recent.kind !== 'range' && Date.now() - recent.createdAt < 5000) {
      recent.note = noteId;
      this.rec.event('mark.link', { id: recent.id, note: noteId });
      this.log.querySelector(`[data-id="${recent.id}"]`)?.remove(); // folds into the note's row
      this.noteThumbs.set(noteId, recent.thumb);
      return;
    }
    if (this.mouse) {
      const mark = await this.addMark('pin', { x: this.mouse.x, y: this.mouse.y, note: noteId, auto: true });
      this.noteThumbs.set(noteId, mark?.thumb);
    } else {
      this.noteThumbs.set(noteId, this.grab('note', { ref: noteId }));
    }
  }

  removeMark(mark) {
    const i = this.marks.indexOf(mark);
    if (i < 0) return;
    this.marks.splice(i, 1);
    this.rec.event('mark.remove', { id: mark.id });
    this.log.querySelector(`[data-id="${mark.id}"]`)?.remove();
    this.renumber();
  }

  undo() {
    const mark = this.marks.findLast((m) => !m.note);
    if (!mark) return;
    this.removeMark(mark);
    toast(`Removed ${label(mark)}.`);
  }

  // ---------- frame grabs ----------

  grab(reason, { ref = null } = {}) {
    const v = this.video;
    if (!this.rec.recording || !v.videoWidth) return undefined;
    const scale = Math.min(1, 1920 / v.videoWidth);
    const w = Math.round(v.videoWidth * scale);
    const hgt = Math.round(v.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(v, 0, 0, w, hgt);
    } catch {
      return undefined;
    }
    const unit = Math.max(1, w / 1280);
    this.paintMarks(ctx, w, hgt, v.currentTime, unit);
    if (this.mouse) paintCursor(ctx, this.mouse.x * w, this.mouse.y * hgt, 14 * unit);
    // Timecode stamp so the image stands on its own.
    const stamp = `${timecode(v.currentTime, this.fps)}  ${this.source?.name || ''}`;
    const fs = Math.round(15 * unit);
    ctx.font = `600 ${fs}px "Cascadia Mono", Consolas, monospace`;
    const tw = ctx.measureText(stamp).width;
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    ctx.fillRect(fs * 0.6, hgt - fs * 2.4, tw + fs * 1.2, fs * 1.8);
    ctx.fillStyle = '#fff';
    ctx.fillText(stamp, fs * 1.2, hgt - fs * 1.05);
    this.rec.session.frame(canvas.toDataURL('image/jpeg', 0.86), { reason, ref, vt: round3(v.currentTime) });
    // Small copy for the rundown row.
    const thumb = document.createElement('canvas');
    thumb.width = 240;
    thumb.height = Math.round((240 * hgt) / w);
    thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL('image/jpeg', 0.75);
  }

  // ---------- drawing ----------

  resize() {
    const dpr = devicePixelRatio || 1;
    for (const c of [this.overlay, this.timeline]) {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
  }

  draw() {
    this.drawOverlay();
    this.drawTimeline();
    const v = this.video;
    $('#tc', this.root).textContent = timecode(v.currentTime, this.fps);
    // Short playhead history so a sentence can be stamped with where the video was when it began.
    const now = Date.now();
    if (!this.history) this.history = [];
    if (!this.history.length || now - this.history.at(-1).t >= 100) {
      this.history.push({ t: now, vt: v.currentTime });
      if (this.history.length > 900) this.history.shift();
    }
  }

  vtAt(t) {
    if (!this.source || !this.history?.length) return this.currentTime();
    let best = this.history[0];
    for (const s of this.history) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
    return round3(best.vt);
  }

  drawOverlay() {
    const c = this.overlay;
    const ctx = c.getContext('2d');
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!this.source || !this.video.videoWidth) return;
    const cr = this.contentRect();
    ctx.setTransform(1, 0, 0, 1, (cr.left - cr.stage.left) * dpr, (cr.top - cr.stage.top) * dpr);
    const w = cr.width * dpr;
    const hgt = cr.height * dpr;
    const unit = dpr * Math.max(0.85, cr.width / 1280);
    this.paintMarks(ctx, w, hgt, this.video.currentTime, unit);

    if (this.drag) {
      const d = this.drag;
      ctx.setLineDash([6 * dpr, 4 * dpr]);
      ctx.strokeStyle = cssVar('--mark');
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(Math.min(d.start.x, d.now.x) * w, Math.min(d.start.y, d.now.y) * hgt, Math.abs(d.now.x - d.start.x) * w, Math.abs(d.now.y - d.start.y) * hgt);
      ctx.setLineDash([]);
    }

    // While recording, a fading trail shows the pointer is being followed;
    // while a note is open, the target ring marks exactly what you're talking about.
    if (this.rec.recording && this.trail.length > 1) {
      const now = performance.now();
      const pts = this.trail.filter((p) => now - p.t < 700);
      ctx.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        const a = 1 - (now - pts[i].t) / 700;
        ctx.strokeStyle = `rgba(226, 59, 46, ${0.5 * a})`;
        ctx.lineWidth = 3 * dpr * a + dpr;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x * w, pts[i - 1].y * hgt);
        ctx.lineTo(pts[i].x * w, pts[i].y * hgt);
        ctx.stroke();
      }
    }
    if (this.rec.note && this.mouse) paintCursor(ctx, this.mouse.x * w, this.mouse.y * hgt, 14 * unit);
  }

  paintMarks(ctx, w, hgt, t, unit) {
    const amber = cssVar('--mark') || '#f3b33d';
    const ink = cssVar('--mark-ink') || '#121315';
    ctx.font = `700 ${15 * unit}px "Cascadia Mono", Consolas, monospace`;
    for (const m of this.marks) {
      if (m.kind === 'range' || m.x == null || Math.abs(m.vt - t) > MARK_VISIBLE_S) continue;
      const x = m.x * w;
      const y = m.y * hgt;
      if (m.kind === 'box') {
        const bw = m.w * w;
        const bh = m.h * hgt;
        ctx.fillStyle = hexA(amber, 0.1);
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = amber;
        ctx.lineWidth = 3 * unit;
        ctx.strokeRect(x, y, bw, bh);
        tab(ctx, label(m), x, y, unit, amber, ink); // seated in the top-left corner
      } else {
        // Pin: dot, a short leader, and the label up and to the left.
        const lx = x - 26 * unit;
        const ly = y - 26 * unit;
        ctx.strokeStyle = amber;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(lx, ly);
        ctx.stroke();
        const size = tabSize(ctx, label(m), unit);
        tab(ctx, label(m), lx - size.w + 4 * unit, ly - size.h + 4 * unit, unit, amber, ink);
        ctx.fillStyle = amber;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.arc(x, y, 7 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  drawTimeline() {
    const c = this.timeline;
    const ctx = c.getContext('2d');
    const dpr = devicePixelRatio || 1;
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    const track = cssVar('--tl-track') || '#1d2024';
    const tick = cssVar('--line-2') || '#363b42';
    const amber = cssVar('--mark') || '#f3b33d';
    const ink = cssVar('--mark-ink') || '#121315';
    const red = cssVar('--rec') || '#e23b2e';
    const label2 = cssVar('--fg-3') || '#878c95';
    const top = H * 0.36;
    const th = H * 0.58;
    ctx.fillStyle = track;
    ctx.fillRect(0, top, W, th);
    const view = this.view();
    if (!view) return;
    const X = (t) => ((t - view.start) / view.span) * W;
    $('#tl-start', this.root).textContent = timecode(view.start, this.fps);
    $('#duration', this.root).textContent = timecode(view.end, this.fps);

    // Ruler: pick a step that keeps labels ~90px apart.
    const steps = [1 / this.fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const step = steps.find((s) => (s / view.span) * W >= 90 * dpr) || 3600;
    ctx.font = `500 ${10.5 * dpr}px "Cascadia Mono", Consolas, monospace`;
    for (let t = Math.ceil(view.start / step) * step; t <= view.end + 1e-6; t += step) {
      const x = Math.round(X(t));
      ctx.fillStyle = tick;
      ctx.fillRect(x, top - 10 * dpr, dpr, 10 * dpr);
      ctx.fillStyle = label2;
      ctx.fillText(timecode(t, this.fps).slice(0, step < 1 ? 11 : 8), x + 4 * dpr, top - 14 * dpr);
    }
    // Minor ticks.
    ctx.fillStyle = tick;
    for (let t = Math.ceil(view.start / (step / 5)) * (step / 5); t <= view.end; t += step / 5) ctx.fillRect(Math.round(X(t)), top - 4 * dpr, dpr, 4 * dpr);

    // Ranges: band, in/out handles, and an R tab.
    for (const m of this.marks.filter((k) => k.kind === 'range')) {
      const a = X(m.in);
      const b = X(m.out);
      ctx.fillStyle = hexA(amber, 0.28);
      ctx.fillRect(a, top, Math.max(dpr, b - a), th);
      ctx.fillStyle = amber;
      ctx.fillRect(a, top, 2 * dpr, th);
      ctx.fillRect(b - 2 * dpr, top, 2 * dpr, th);
      ctx.fillRect(a, top, b - a, 2 * dpr);
      ctx.font = `700 ${11 * dpr}px "Cascadia Mono", Consolas, monospace`;
      tab(ctx, label(m), a, top + 2 * dpr, dpr * 0.8, amber, ink);
    }
    if (this.pendingIn != null) {
      const a = Math.min(this.pendingIn, this.video.currentTime);
      const b = Math.max(this.pendingIn, this.video.currentTime);
      ctx.fillStyle = hexA(amber, 0.16);
      ctx.fillRect(X(a), top, X(b) - X(a), th);
      ctx.fillStyle = amber;
      ctx.fillRect(X(this.pendingIn) - dpr, top, 2 * dpr, th);
    }
    // Pins, boxes and markers: amber stems through the track with a flag head.
    for (const m of this.marks.filter((k) => k.kind !== 'range')) {
      const x = Math.round(X(m.vt));
      ctx.fillStyle = amber;
      ctx.fillRect(x - dpr, top, 2 * dpr, th);
      ctx.beginPath();
      ctx.moveTo(x - dpr, top - 2 * dpr);
      ctx.lineTo(x + 8 * dpr, top + 2 * dpr);
      ctx.lineTo(x - dpr, top + 7 * dpr);
      ctx.fill();
    }
    // Voice notes: short ticks along the bottom of the track.
    ctx.fillStyle = label2;
    for (const n of this.rec.notesAt || []) if (n.vt != null) ctx.fillRect(X(n.vt) - dpr, top + th - 8 * dpr, 2 * dpr, 8 * dpr);
    // Hover line + playhead.
    if (this.hoverT != null) {
      ctx.fillStyle = hexA(label2, 0.6);
      ctx.fillRect(X(this.hoverT), top - 10 * dpr, dpr, th + 10 * dpr);
    }
    const px = X(this.video.currentTime);
    ctx.fillStyle = this.rec.recording ? red : cssVar('--fg') || '#f2f2ee';
    ctx.fillRect(px - dpr, top - 12 * dpr, 2 * dpr, th + 12 * dpr);
    ctx.beginPath();
    ctx.arc(px, top - 12 * dpr, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- rundown ----------

  renderLogEmpty() {
    if (this.log.children.length) return;
    const key = () => h('kbd', { class: 'key talk-key-label', hidden: this.talkKeyLabel === null }, this.talkKeyLabel || 'T');
    const mouse = () => h('span', { class: 'talk-mouse-hint' }, this.talkMouseHint || '');
    this.log.append(
      h('li', { class: 'log-empty' },
        h('p', {}, 'Click the picture (or just hover), press ', key(), mouse(), ', say what to change, then press it again.'),
        h('p', {}, 'Every note lands here with its timecode and what you pointed at.'),
        h('p', {}, h('kbd', { class: 'key' }, 'Drag'), ' box an area  ', h('kbd', { class: 'key' }, 'I'), h('kbd', { class: 'key' }, 'O'), ' range  ', h('kbd', { class: 'key' }, 'M'), ' marker'),
      ),
    );
  }

  renumber() {
    let n = 0;
    for (const el of this.log.querySelectorAll('.log-row .log-n')) el.textContent = String(++n).padStart(3, '0');
  }

  logRow({ id, kind, tag, tagClass = '', text, vt, thumb, onRemove }) {
    this.log.querySelector('.log-empty')?.remove();
    const tc = vt != null ? timecode(vt, this.fps) : '';
    const menu = onRemove
      ? h('details', { class: 'log-menu' },
          h('summary', { 'aria-label': 'More' }, h('span', { class: 'dots', 'aria-hidden': 'true' })),
          h('button', { type: 'button', class: 'log-menu-item', onclick: (e) => { e.target.closest('details').open = false; onRemove(); } }, 'Remove from rundown'))
      : h('span');
    const row = h(
      'li',
      { class: `log-row log-${kind}`, dataset: { id } },
      h('span', { class: 'log-n' }, '000'),
      h('div', { class: 'log-meta' },
        h('button', { class: 'log-tc', type: 'button', title: 'Jump here', onclick: () => vt != null && (this.video.currentTime = vt) }, tc),
        h('span', { class: `tag ${tagClass}` }, tag),
      ),
      thumb ? h('img', { class: 'log-thumb', src: thumb, alt: '' }) : h('span', { class: 'log-thumb log-thumb-none' }),
      h('span', { class: 'log-text', dir: dirOf(text) }, text || ''),
      menu,
    );
    this.log.append(row);
    this.renumber();
    revealInList(row);
    return row;
  }

  logMark(m) {
    const detail = m.kind === 'range' ? `Range to ${timecode(m.out, this.fps)}` : m.kind === 'marker' ? 'Marker' : m.kind === 'box' ? 'Boxed area' : 'Pinned';
    this.logRow({ id: m.id, kind: 'mark', tag: label(m), tagClass: tagClass(m), text: detail, vt: m.kind === 'range' ? m.in : m.vt, thumb: m.thumb, onRemove: () => this.removeMark(m) });
  }

  logSpeech({ id, text, vt }) {
    return this.logRow({ id, kind: 'speech', tag: 'VO', text, vt: vt ?? this.currentTime() });
  }

  // A talk-key note: one row that fills in as you speak.
  logNote(noteId) {
    const vt = this.currentTime();
    this.rec.notesAt.push({ vt });
    const mark = this.marks.find((m) => m.note === noteId);
    return this.logRow({
      id: noteId, kind: 'note', tag: mark ? label(mark) : 'VO', tagClass: mark ? tagClass(mark) : '', text: '', vt, thumb: this.noteThumbs.get(noteId),
      onRemove: () => {
        this.onRemoveNote?.(noteId);
        if (mark) this.removeMark(mark);
        this.log.querySelector(`[data-id="${noteId}"]`)?.remove();
        this.renumber();
      },
    });
  }

  logTyped({ id, text }) {
    return this.logRow({
      id, kind: 'typed', tag: 'TXT', tagClass: 'tag-txt', text, vt: this.currentTime(), thumb: this.grab('note', { ref: id }),
      onRemove: () => {
        this.rec.event('mark.remove', { id });
        this.log.querySelector(`[data-id="${id}"]`)?.remove();
        this.renumber();
      },
    });
  }

  currentTime() {
    return this.source ? round3(this.video.currentTime) : null;
  }
}

function label(m) {
  return { pin: 'P', box: 'B', range: 'R', marker: 'M' }[m.kind] + m.n;
}

function tagClass(m) {
  return m.kind === 'range' ? 'tag-range' : m.kind === 'marker' ? '' : 'tag-mark';
}

function tabSize(ctx, text, unit) {
  return { w: ctx.measureText(text).width + 12 * unit, h: 24 * unit };
}

// Solid amber label tab with ink lettering, top-left at (x, y).
function tab(ctx, text, x, y, unit, bg, fg) {
  const { w, h: hh } = tabSize(ctx, text, unit);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, hh, 3 * unit);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 6 * unit, y + hh / 2 + unit);
  ctx.textBaseline = 'alphabetic';
}

function paintCursor(ctx, x, y, r) {
  ctx.lineWidth = r / 3.5;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.beginPath();
  ctx.arc(x, y, r + r / 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#e23b2e';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r / 2.4, 0, Math.PI * 2);
  ctx.stroke();
}

function hexA(color, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round3 = (n) => Math.round(n * 1000) / 1000;
