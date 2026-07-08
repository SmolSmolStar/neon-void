// All canvas drawing. Neon-on-deep-space look with additive glow, parallax
// starfield, procedural ships, and in-world floating text.
import { TAU, clamp, lerp } from './math.js';
import { WEAPONS } from './config.js';

export class Starfield {
  constructor(w, h, rng) {
    this.w = w; this.h = h;
    this.layers = [
      { n: 60, speed: 22, size: [0.6, 1.2], alpha: 0.5, stars: [] },
      { n: 40, speed: 48, size: [1.0, 1.8], alpha: 0.75, stars: [] },
      { n: 22, speed: 90, size: [1.4, 2.6], alpha: 1.0, stars: [] },
    ];
    for (const L of this.layers) {
      for (let i = 0; i < L.n; i++) {
        L.stars.push({
          x: rng() * w,
          y: rng() * h,
          s: lerp(L.size[0], L.size[1], rng()),
          tw: rng() * TAU,
          tws: 1 + rng() * 3,
        });
      }
    }
    // A couple of soft nebula clouds for depth.
    this.nebulae = [];
    for (let i = 0; i < 3; i++) {
      this.nebulae.push({
        x: rng() * w, y: rng() * h,
        r: 120 + rng() * 160,
        hue: [200, 280, 320][i % 3],
        speed: 10 + rng() * 14,
        a: 0.06 + rng() * 0.05,
      });
    }
  }

  update(dt, boost = 1) {
    for (const L of this.layers) {
      for (const s of L.stars) {
        s.y += L.speed * boost * dt;
        s.tw += s.tws * dt;
        if (s.y > this.h + 4) { s.y = -4; s.x = Math.random() * this.w; }
      }
    }
    for (const n of this.nebulae) {
      n.y += n.speed * boost * dt;
      if (n.y - n.r > this.h) { n.y = -n.r; n.x = Math.random() * this.w; }
    }
  }

  draw(ctx) {
    // Nebulae (soft radial fog).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of this.nebulae) {
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      g.addColorStop(0, `hsla(${n.hue},80%,60%,${n.a})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.restore();
    // Stars.
    for (const L of this.layers) {
      for (const s of L.stars) {
        const tw = 0.6 + 0.4 * Math.sin(s.tw);
        ctx.globalAlpha = L.alpha * tw;
        ctx.fillStyle = '#dff2ff';
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
    }
    ctx.globalAlpha = 1;
  }
}

export class Renderer {
  constructor(ctx, w, h) {
    this.ctx = ctx;
    this.w = w;
    this.h = h;
  }

  clearBackground() {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#080c1c');
    g.addColorStop(0.5, '#0a0e22');
    g.addColorStop(1, '#05060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  vignette() {
    const { ctx, w, h } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Additive glow helper.
  glow(color, blur, fn) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    fn(ctx);
    ctx.restore();
  }

  // ---- Player ------------------------------------------------------------
  drawPlayer(p, t, thrust) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    const bank = clamp(p.vx / 320, -1, 1);
    ctx.rotate(bank * 0.28);
    const flick = p.invuln > 0 ? (Math.floor(t * 20) % 2 ? 0.35 : 1) : 1;
    ctx.globalAlpha = flick;

    // Engine flame (behind).
    const flame = 10 + Math.sin(t * 40) * 3 + thrust * 10;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createLinearGradient(0, 8, 0, 8 + flame);
    fg.addColorStop(0, 'rgba(140,230,255,0.9)');
    fg.addColorStop(0.5, 'rgba(90,150,255,0.6)');
    fg.addColorStop(1, 'rgba(90,150,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-5, 8); ctx.lineTo(5, 8);
    ctx.lineTo(0, 8 + flame); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Shield bubble.
    if (p.shield > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sr = p.r + 9 + Math.sin(t * 5) * 1.5;
      const sg = ctx.createRadialGradient(0, 0, sr * 0.6, 0, 0, sr);
      sg.addColorStop(0, 'rgba(90,210,255,0)');
      sg.addColorStop(0.8, `rgba(90,210,255,${0.15 + 0.1 * p.shield})`);
      sg.addColorStop(1, 'rgba(150,230,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, sr, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(150,235,255,${0.4 + 0.15 * p.shield})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    // Hull.
    const wc = WEAPONS[p.weapon.type].color;
    this.glow(wc, 14, (c) => {
      c.beginPath();
      c.moveTo(0, -p.r - 3);
      c.lineTo(p.r, p.r * 0.7);
      c.lineTo(p.r * 0.45, p.r);
      c.lineTo(-p.r * 0.45, p.r);
      c.lineTo(-p.r, p.r * 0.7);
      c.closePath();
      const hg = c.createLinearGradient(0, -p.r, 0, p.r);
      hg.addColorStop(0, '#eaffff');
      hg.addColorStop(0.5, wc);
      hg.addColorStop(1, '#14406a');
      c.fillStyle = hg;
      c.fill();
    });
    // Cockpit.
    ctx.fillStyle = 'rgba(230,250,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(0, -p.r * 0.2, 3, 5, 0, 0, TAU);
    ctx.fill();
    // Wing tips.
    ctx.fillStyle = wc;
    ctx.fillRect(-p.r - 1, p.r * 0.5, 3, 5);
    ctx.fillRect(p.r - 2, p.r * 0.5, 3, 5);

    ctx.restore();
  }

  // ---- Enemies -----------------------------------------------------------
  drawEnemy(e, t) {
    const ctx = this.ctx;
    const flash = e.hitFlash > 0 ? e.hitFlash : 0;
    const scale = 1 + (e.spawnPop || 0) * 0.4 + flash * 0.15;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(scale, scale);
    const col = flash > 0 ? '#ffffff' : e.color;

    switch (e.def.behavior) {
      case 'boss': this._drawBoss(e, t, col, flash); break;
      case 'sine': this._poly(6, e.r, col, t * 1.5, flash); break;
      case 'dive': this._dart(e.r, col, flash); break;
      case 'shooter': this._gunner(e.r, col, t, flash); break;
      default:
        if (e.type === 'tank') this._tank(e.r, col, flash);
        else this._diamond(e.r, col, flash);
    }
    ctx.restore();

    // Health bar for tough foes.
    if (e.maxHp > 24 && e.type !== 'boss' && e.hp < e.maxHp) {
      const w = e.r * 2, hpv = e.hp / e.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w, 3);
      ctx.fillStyle = hpv > 0.5 ? '#7dff8f' : hpv > 0.25 ? '#ffd166' : '#ff5a6a';
      ctx.fillRect(e.x - w / 2, e.y - e.r - 8, w * hpv, 3);
    }
  }

  _fillGlow(col, blur, path) {
    this.glow(col, blur, (c) => { path(c); c.fillStyle = col; c.fill(); });
  }

  _diamond(r, col, flash) {
    this.glow(col, 12 + flash * 10, (c) => {
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath();
      const g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, col); g.addColorStop(1, '#3a0d18');
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1; c.stroke();
    });
    c2(this.ctx, () => {
      this.ctx.fillStyle = 'rgba(255,255,255,0.85)';
      this.ctx.beginPath(); this.ctx.arc(0, 0, r * 0.28, 0, TAU); this.ctx.fill();
    });
  }

  _poly(sides, r, col, rot, flash) {
    this.glow(col, 12 + flash * 10, (c) => {
      c.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * TAU;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.6, col); g.addColorStop(1, '#3a1a05');
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1; c.stroke();
    });
  }

  _dart(r, col, flash) {
    this.glow(col, 12 + flash * 10, (c) => {
      c.beginPath();
      c.moveTo(0, r); c.lineTo(r * 0.8, -r); c.lineTo(0, -r * 0.4); c.lineTo(-r * 0.8, -r);
      c.closePath();
      const g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, col); g.addColorStop(1, '#1a3a05');
      c.fillStyle = g; c.fill();
    });
  }

  _gunner(r, col, t, flash) {
    this.glow(col, 12 + flash * 10, (c) => {
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.6, col); g.addColorStop(1, '#3a0a26');
      c.fillStyle = g; c.fill();
    });
    // Barrel.
    this.ctx.fillStyle = '#ffd0e6';
    this.ctx.fillRect(-2.5, r * 0.4, 5, r * 0.7);
    // Pulsing core.
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c2(this.ctx, () => {
      this.ctx.globalCompositeOperation = 'lighter';
      this.ctx.fillStyle = `rgba(255,180,220,${0.5 + pulse * 0.5})`;
      this.ctx.beginPath(); this.ctx.arc(0, 0, r * 0.3, 0, TAU); this.ctx.fill();
    });
  }

  _tank(r, col, flash) {
    this.glow(col, 14 + flash * 10, (c) => {
      roundRect(c, -r, -r, r * 2, r * 2, 6);
      const g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, col); g.addColorStop(1, '#241040');
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 2; c.stroke();
    });
    // Armor plates.
    this.ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(-r, -r * 0.2); this.ctx.lineTo(r, -r * 0.2);
    this.ctx.moveTo(-r, r * 0.4); this.ctx.lineTo(r, r * 0.4);
    this.ctx.stroke();
  }

  _drawBoss(e, t, col, flash) {
    const ctx = this.ctx;
    const r = e.r;
    // Rotating outer ring.
    ctx.save();
    ctx.rotate(t * 0.4);
    this.glow(col, 24, (c) => {
      c.lineWidth = 4;
      c.strokeStyle = col;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        c.beginPath();
        c.arc(0, 0, r * 0.92, a, a + 0.5);
        c.stroke();
      }
    });
    ctx.restore();
    // Core body.
    this.glow(flash > 0 ? '#fff' : col, 30, (c) => {
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * TAU;
        const px = Math.cos(a) * r, py = Math.sin(a) * r * 0.85;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
      const g = c.createRadialGradient(0, -r * 0.3, r * 0.2, 0, 0, r);
      g.addColorStop(0, '#ffd7e0');
      g.addColorStop(0.55, col);
      g.addColorStop(1, '#2a0410');
      c.fillStyle = g; c.fill();
    });
    // Glowing eye that tracks intensity.
    const beat = 0.5 + 0.5 * Math.sin(t * 4);
    c2(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,${80 + beat * 120},120,${0.6 + beat * 0.4})`;
      ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.28, 0, TAU); ctx.fill();
    });
    // Boss HP bar (top of screen).
    const bw = this.w * 0.7, bx = (this.w - bw) / 2, by = 14;
    const hpv = clamp(e.hp / e.maxHp, 0, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, bx - 2, by - 2, bw + 4, 12, 6); ctx.fill();
    const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    hg.addColorStop(0, '#ff4d6d'); hg.addColorStop(1, '#ff9a3d');
    ctx.fillStyle = hg;
    roundRect(ctx, bx, by, bw * hpv, 8, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◈ DREADNOUGHT ◈', this.w / 2, by + 24);
    ctx.restore();
  }

  // ---- Projectiles / drops / fx -----------------------------------------
  drawBullet(b) {
    const ctx = this.ctx;
    if (b.from === 'enemy') {
      this.glow(b.color, 12, (c) => {
        c.fillStyle = b.color;
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(b.x, b.y, b.r * 0.4, 0, TAU); c.fill();
      });
      return;
    }
    // Player bullet: bright streak with trailing glow.
    const ang = Math.atan2(b.vy, b.vx);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    const len = b.homing ? b.r * 2 : b.r * 3.5;
    this.glow(b.color, 14, (c) => {
      const g = c.createLinearGradient(-len, 0, len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.6, b.color);
      g.addColorStop(1, '#ffffff');
      c.fillStyle = g;
      roundRect(c, -len, -b.r, len * 2, b.r * 2, b.r);
      c.fill();
    });
    ctx.restore();
  }

  drawDrop(d, t) {
    const ctx = this.ctx;
    const bob = Math.sin(t * 4 + d.phase) * 2;
    ctx.save();
    ctx.translate(d.x, d.y + bob);
    const pulse = 0.6 + 0.4 * Math.sin(t * 6 + d.phase);
    // Halo.
    this.glow(d.color, 16, (c) => {
      c.fillStyle = d.color;
      c.globalAlpha = 0.3 + pulse * 0.3;
      c.beginPath(); c.arc(0, 0, d.r + 5, 0, TAU); c.fill();
    });
    // Gem body (rotating).
    ctx.rotate(t * 1.5);
    this.glow(d.color, 10, (c) => {
      c.beginPath();
      c.moveTo(0, -d.r); c.lineTo(d.r, 0); c.lineTo(0, d.r); c.lineTo(-d.r, 0); c.closePath();
      const g = c.createLinearGradient(0, -d.r, 0, d.r);
      g.addColorStop(0, '#fff'); g.addColorStop(1, d.color);
      c.fillStyle = g; c.fill();
    });
    ctx.rotate(-t * 1.5);
    // Glyph.
    ctx.fillStyle = '#08101c';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.glyph, 0, 1);
    ctx.restore();
  }

  drawParticles(particles) {
    const ctx = this.ctx;
    ctx.save();
    for (const p of particles.list) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'ring') {
        const r = lerp(p.r0, p.r1, 1 - k);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * k;
        ctx.shadowColor = p.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.shadowBlur = 0;
      if (p.kind === 'debris') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = k;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
        continue;
      }
      if (p.kind === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        const sz = p.grow ? p.size * (2 - k) : p.size;
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, TAU); ctx.fill();
        continue;
      }
      // spark
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.globalAlpha = k;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 8; }
      const sz = p.shrink ? p.size * k : p.size;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawFloaters(floaters) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floaters) {
      const k = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = k;
      ctx.font = `700 ${f.size}px system-ui, sans-serif`;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 8;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }

  // Full-screen flash (bomb / damage).
  flash(color, alpha) {
    if (alpha <= 0) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.w, this.h);
    this.ctx.restore();
  }
}

// Helpers -------------------------------------------------------------------
function c2(ctx, fn) { ctx.save(); fn(); ctx.restore(); }

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
