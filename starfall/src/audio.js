// Procedural WebAudio SFX + a light ambient pad. All synthesized — no assets.
// Guarded so it silently no-ops if WebAudio is unavailable (e.g. under Node).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.enabled = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  // Must be called from a user gesture (click/keydown) to satisfy autoplay policy.
  resume() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._startPad();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _env(node, t, a, d, peak = 1, sustain = 0) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
  }

  _tone({ type = 'sine', f0, f1, dur, a = 0.005, gain = 0.3, dest }) {
    if (!this.ctx || this.muted) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this._env(g, t, a, dur, gain);
    o.connect(g);
    g.connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, gain, filterFreq, filterType = 'lowpass') {
    if (!this.ctx || this.muted) return null;
    const t = this.t;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    this._env(g, t, 0.003, dur, gain);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    return { src, g };
  }

  // ---- SFX ---------------------------------------------------------------
  shoot(kind = 'pulse') {
    const map = {
      pulse: { type: 'square', f0: 880, f1: 500, dur: 0.08, gain: 0.12 },
      spread: { type: 'sawtooth', f0: 520, f1: 300, dur: 0.1, gain: 0.1 },
      laser: { type: 'sawtooth', f0: 1400, f1: 700, dur: 0.07, gain: 0.09 },
      homing: { type: 'triangle', f0: 300, f1: 620, dur: 0.14, gain: 0.11 },
    };
    this._tone({ ...(map[kind] || map.pulse) });
  }

  hit() { this._tone({ type: 'square', f0: 320, f1: 140, dur: 0.06, gain: 0.08 }); }

  explosion(big = false) {
    this._noise(big ? 0.55 : 0.28, big ? 0.5 : 0.28, big ? 900 : 1600);
    this._tone({ type: 'sine', f0: big ? 160 : 240, f1: big ? 40 : 70, dur: big ? 0.5 : 0.25, gain: big ? 0.35 : 0.2 });
  }

  pickup() {
    this._tone({ type: 'triangle', f0: 660, f1: 990, dur: 0.09, gain: 0.18 });
    this._tone({ type: 'triangle', f0: 990, f1: 1480, dur: 0.12, gain: 0.14 });
  }

  powerup() {
    [523, 659, 784, 1046].forEach((f, i) => {
      if (!this.ctx || this.muted) return;
      const t = this.t + i * 0.06;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.24);
    });
  }

  playerHurt() {
    this._noise(0.3, 0.3, 700);
    this._tone({ type: 'sawtooth', f0: 200, f1: 60, dur: 0.3, gain: 0.25 });
  }

  bomb() {
    this._noise(0.9, 0.6, 500);
    this._tone({ type: 'sine', f0: 120, f1: 30, dur: 0.9, gain: 0.4 });
    this._tone({ type: 'sawtooth', f0: 400, f1: 60, dur: 0.6, gain: 0.2 });
  }

  gameOver() {
    [440, 349, 262].forEach((f, i) => {
      this._tone({ type: 'sawtooth', f0: f, f1: f * 0.6, dur: 0.5, gain: 0.2, a: 0.02 });
    });
  }

  // Soft evolving ambient drone so silence never feels dead.
  _startPad() {
    if (!this.ctx) return;
    const t = this.t;
    const pad = this.ctx.createGain();
    pad.gain.value = 0.05;
    pad.connect(this.master);
    [55, 82.4, 110].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.5 / (i + 1);
      lfo.frequency.value = 0.05 + i * 0.03;
      lfoG.gain.value = f * 0.01;
      lfo.connect(lfoG); lfoG.connect(o.frequency);
      o.connect(g); g.connect(pad);
      o.start(t); lfo.start(t);
    });
  }
}
