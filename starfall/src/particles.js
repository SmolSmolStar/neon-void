// Lightweight particle system with a hard cap + object reuse to limit GC.
import { TAU } from './math.js';

export class Particles {
  constructor(cap = 900) {
    this.cap = cap;
    this.list = [];
  }

  clear() { this.list.length = 0; }

  _add(p) {
    if (this.list.length >= this.cap) this.list.shift();
    this.list.push(p);
    return p;
  }

  spark(x, y, opts = {}) {
    const {
      count = 1, speed = 120, spread = TAU, dir = 0,
      color = '#fff', life = 0.6, size = 2.5, drag = 0.9,
      gravity = 0, glow = true, shrink = true, rng = Math.random,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = dir + (rng() - 0.5) * spread;
      const sp = speed * (0.4 + rng() * 0.8);
      this._add({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life, max: life,
        size: size * (0.6 + rng() * 0.8),
        color, drag, gravity, glow, shrink,
        rot: 0, vr: 0, kind: 'spark',
      });
    }
  }

  // Expanding hollow ring shockwave.
  ring(x, y, opts = {}) {
    const { color = '#fff', life = 0.5, r0 = 4, r1 = 60, width = 3, glow = true } = opts;
    this._add({ x, y, life, max: life, color, r0, r1, width, glow, kind: 'ring' });
  }

  // Drifting debris chunk (little rotating shard).
  debris(x, y, opts = {}) {
    const { count = 1, speed = 90, color = '#fff', life = 0.9, size = 3, rng = Math.random } = opts;
    for (let i = 0; i < count; i++) {
      const a = rng() * TAU;
      const sp = speed * (0.3 + rng() * 0.9);
      this._add({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life, max: life,
        size: size * (0.7 + rng() * 0.7),
        color, drag: 0.94, gravity: 40, glow: false, shrink: false,
        rot: rng() * TAU, vr: (rng() - 0.5) * 12, kind: 'debris',
      });
    }
  }

  // Rising soft smoke puff.
  smoke(x, y, opts = {}) {
    const { color = 'rgba(255,180,120,0.5)', life = 0.7, size = 6, vy = -30, rng = Math.random } = opts;
    this._add({
      x, y,
      vx: (rng() - 0.5) * 20, vy: vy * (0.6 + rng() * 0.8),
      life, max: life, size, color, drag: 0.96, gravity: 0,
      glow: false, shrink: false, grow: true, kind: 'smoke',
    });
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }
      if (p.kind === 'ring') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.drag) { p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60); }
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
  }

  get count() { return this.list.length; }
}
