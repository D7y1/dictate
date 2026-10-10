// Microphone: recording, level meter, speech detection, and live captions.
//
// Events (EventTarget):
//   level      {level}                       ~30x a second, 0..1
//   onset      {t}                           voice started (energy based, fast)
//   interim    {text, tStart}                live caption in progress
//   final      {id, text, tStart, tEnd, confidence}
//   captions   {state: 'on'|'off'|'unsupported'|'error', message}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export class Voice extends EventTarget {
  constructor() {
    super();
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.recorder = null;
    this.level = 0;
    this.lastOnset = 0;
    this.speaking = false;
    this.recognition = null;
    this.captionsOn = false;
    this.lang = 'en-US';
    this.run = 0;
    this.starts = new Map();
    this.finalCount = 0;
    this.backoff = 250;
    this.raf = null;
  }

  static captionsSupported() {
    return !!Recognition;
  }

  static async inputs() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  async open(deviceId) {
    this.close();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: true, // keeps the video's own audio out of your notes
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.meter();
    return this.stream.getAudioTracks()[0]?.label || 'Microphone';
  }

  // Level meter + a simple adaptive voice-activity detector.
  meter() {
    const data = new Float32Array(this.analyser.fftSize);
    let floor = 0.01;
    let above = 0;
    let below = 0;
    let last = performance.now();
    const loop = (now) => {
      if (!this.analyser) return;
      const dt = now - last;
      last = now;
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length);
      floor = rms < floor ? floor * 0.9 + rms * 0.1 : floor * 0.999 + rms * 0.001;
      const loud = rms > Math.max(0.015, floor * 3);
      if (loud) {
        above += dt;
        below = 0;
        if (!this.speaking && above > 180) {
          this.speaking = true;
          this.lastOnset = Date.now() - above;
          this.emit('onset', { t: this.lastOnset });
        }
      } else {
        below += dt;
        above = 0;
        if (this.speaking && below > 900) this.speaking = false;
      }
      this.level = Math.min(1, rms * 6);
      this.emit('level', { level: this.level, speaking: this.speaking });
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- recording ----------

  startRecording(onChunk) {
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m));
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 64000 });
    this.recorder.ondataavailable = (e) => e.data.size && onChunk(e.data);
    this.recorder.start(1000);
  }

  pauseRecording() {
    if (this.recorder?.state === 'recording') this.recorder.pause();
  }

  resumeRecording() {
    if (this.recorder?.state === 'paused') this.recorder.resume();
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') return resolve();
      this.recorder.addEventListener('stop', () => setTimeout(resolve, 50), { once: true });
      this.recorder.stop();
    });
  }

  // ---------- live captions ----------

  startCaptions(lang) {
    if (lang) this.lang = lang;
    if (!Recognition) {
      this.emit('captions', { state: 'unsupported', message: 'Live captions need Chrome or Edge. Your voice is still recorded and transcribed after you stop.' });
      return;
    }
    this.captionsOn = true;
    this.spawnRecognition();
  }

  setCaptionLanguage(lang) {
    this.lang = lang;
    if (this.captionsOn) this.recognition?.stop(); // restarts with the new language on end
  }

  spawnRecognition() {
    const rec = new Recognition();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    const run = ++this.run;
    this.recognition = rec;

    rec.onstart = () => {
      this.backoff = 250;
      this.emit('captions', { state: 'on' });
    };
    rec.onresult = (event) => {
      let interim = '';
      let interimStart = null;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const key = `${run}:${i}`;
        if (!this.starts.has(key)) {
          const recentOnset = Date.now() - this.lastOnset < 3000 ? this.lastOnset : Date.now() - 600;
          this.starts.set(key, recentOnset);
        }
        const text = result[0].transcript;
        if (result.isFinal) {
          const tStart = this.starts.get(key);
          this.starts.delete(key);
          if (text.trim()) this.emit('final', { id: `${run}-${++this.finalCount}`, text: text.trim(), tStart, tEnd: Date.now(), confidence: result[0].confidence });
        } else {
          interim += text;
          interimStart ??= this.starts.get(key);
        }
      }
      this.emit('interim', { text: interim.trim(), tStart: interimStart });
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.captionsOn = false;
        this.emit('captions', { state: 'error', message: 'Live captions were blocked. Your voice is still recorded and transcribed after you stop.' });
      } else if (e.error === 'network') {
        this.emit('captions', { state: 'error', message: 'Live captions need an internet connection. Recording continues.' });
        this.backoff = Math.min(this.backoff * 2, 8000);
      } else if (e.error === 'language-not-supported') {
        this.captionsOn = false;
        this.emit('captions', { state: 'error', message: `Live captions don't support ${this.lang}.` });
      }
    };
    rec.onend = () => {
      if (run !== this.run) return;
      this.emit('interim', { text: '', tStart: null });
      if (this.captionsOn) setTimeout(() => this.captionsOn && run === this.run && this.spawnRecognition(), this.backoff);
      else this.emit('captions', { state: 'off' });
    };
    try {
      rec.start();
    } catch {
      setTimeout(() => this.captionsOn && this.spawnRecognition(), 500);
    }
  }

  stopCaptions() {
    this.captionsOn = false;
    this.run += 1;
    try {
      this.recognition?.stop();
    } catch {
      // already stopped
    }
    this.recognition = null;
  }

  close() {
    this.stopCaptions();
    cancelAnimationFrame(this.raf);
    this.analyser = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
