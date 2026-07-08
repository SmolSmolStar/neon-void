// Core simulation: player, enemies, projectiles, drops, and all the "juice"
// bookkeeping (screen shake, hitstop, flashes, floating text). Rendering lives
// in render.js; this module only mutates state and emits fx requests.
import {
  WORLD, PLAYER, ENEMIES, DROPS, hpScale,
} from './config.js';
import { makeRng, clamp, dist2, norm, rotateToward, TAU } from './math.js';
import { entitiesHit, outOfBounds } from './collision.js';
import { fire, enemyBullet } from './weapons.js';
import { rollDrop, applyDrop, freshPlayer } from './upgrades.js';
import { makeDirector, tick as directorTick, bossCleared } from './spawn.js';
import { makeScore, addKill, tickScore } from './score.js';
import { Particles } from './particles.js';

export class Game {
  constructor(audio = null, seed = 12345) {
    this.audio = audio;
    this.w = WORLD.width;
    this.h = WORLD.height;
    this.rng = makeRng(seed);
    this.particles = new Particles(1000);
    this.reset();
  }

  reset() {
    this.state = 'playing';           // 'playing' | 'dead'
    this.time = 0;
    this.player = freshPlayer();
    this.player.x = this.w / 2;
    this.player.y = this.h - 90;
    this.player.fireTimer = 0;
    this.enemies = [];
    this.pbullets = [];               // player projectiles
    this.ebullets = [];               // enemy projectiles
    this.drops = [];
    this.floaters = [];
    this.director = makeDirector();
    this.score = makeScore();
    this.nextId = 1;
    // Juice state.
    this.trauma = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.hitstop = 0;
    this.flashColor = '#fff';
    this.flashAlpha = 0;
    this.timeScale = 1;
    this.starBoost = 1;
    this.boss = null;
    this.stats = { kills: 0, shots: 0 };
    this.newWeaponToast = null;
  }

  // -------------------------------------------------------------- juice fx
  addShake(a) { this.trauma = clamp(this.trauma + a, 0, 1); }
  doHitstop(s) { this.hitstop = Math.max(this.hitstop, s); }
  doFlash(color, a) { this.flashColor = color; this.flashAlpha = Math.max(this.flashAlpha, a); }

  floater(text, x, y, color = '#fff', size = 14, vy = -34) {
    this.floaters.push({ text, x, y, color, size, vy, life: 0.9, max: 0.9 });
  }

  explosion(x, y, color, scale = 1, big = false) {
    const P = this.particles;
    const R = this.rng;
    P.ring(x, y, { color, r0: 4, r1: 40 * scale, life: 0.45, width: 3 });
    P.spark(x, y, {
      count: Math.round(14 * scale), speed: 200 * scale, color,
      life: 0.6, size: 3, rng: R, glow: true,
    });
    P.spark(x, y, {
      count: Math.round(8 * scale), speed: 120 * scale, color: '#ffffff',
      life: 0.35, size: 2, rng: R,
    });
    P.debris(x, y, { count: Math.round(5 * scale), speed: 110 * scale, color, life: 0.9, rng: R });
    for (let i = 0; i < Math.round(3 * scale); i++) {
      P.smoke(x + (R() - 0.5) * 10, y, { rng: R });
    }
    if (this.audio) this.audio.explosion(big);
  }

  // ------------------------------------------------------------------ input
  // input: { moveX, moveY, dirX, dirY, firing, bomb, pointer }
  update(dt, input) {
    // Clamp + apply hitstop / time scale for slow-mo flourishes.
    dt = Math.min(dt, 1 / 30);
    let sim = dt * this.timeScale;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sim = 0; // freeze the world, but keep fx timers ticking below
    }

    this._updateJuice(dt);

    if (this.state === 'dead') {
      this.particles.update(dt);
      this._updateFloaters(dt);
      return;
    }

    this.time += sim;
    if (sim > 0) {
      this._updatePlayer(sim, input);
      this._spawn(sim);
      this._updateEnemies(sim);
      this._updatePBullets(sim);
      this._updateEBullets(sim);
      this._updateDrops(sim);
      tickScore(this.score, sim);
    } else {
      // Still let the player aim/fire feedback breathe during hitstop? No —
      // hitstop is meant to freeze. Only fx advance.
    }

    this.particles.update(dt);
    this._updateFloaters(dt);
    this._handleBomb(input);
  }

  _updateJuice(dt) {
    // Trauma-based shake (shake ∝ trauma²) for a punchy, non-linear feel.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const amt = this.trauma * this.trauma;
    const R = this.rng;
    this.shakeX = (R() * 2 - 1) * 16 * amt;
    this.shakeY = (R() * 2 - 1) * 16 * amt;
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.5);
    // Ease timeScale back to normal after slow-mo.
    this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 4);
    if (this.newWeaponToast) {
      this.newWeaponToast.life -= dt;
      if (this.newWeaponToast.life <= 0) this.newWeaponToast = null;
    }
  }

  _updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.92;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ player
  _updatePlayer(dt, input) {
    const p = this.player;
    if (input.pointer) {
      // Smoothly chase the pointer for a responsive-but-weighty feel.
      const tx = clamp(input.moveX, p.r, this.w - p.r);
      const ty = clamp(input.moveY, p.r, this.h - p.r);
      p.vx = (tx - p.x) * 12;
      p.vy = (ty - p.y) * 12;
    } else {
      const ax = (input.dirX || 0) * PLAYER.accel;
      const ay = (input.dirY || 0) * PLAYER.accel;
      p.vx += ax * dt;
      p.vy += ay * dt;
      p.vx *= Math.pow(PLAYER.drag, dt * 60);
      p.vy *= Math.pow(PLAYER.drag, dt * 60);
      const max = PLAYER.speed;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > max) { p.vx = p.vx / sp * max; p.vy = p.vy / sp * max; }
    }
    p.x = clamp(p.x + p.vx * dt, p.r, this.w - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, this.h - p.r);
    if (p.x <= p.r || p.x >= this.w - p.r) p.vx = 0;
    if (p.y <= p.r || p.y >= this.h - p.r) p.vy = 0;

    if (p.invuln > 0) p.invuln -= dt;

    // Thruster trail.
    if (this.rng() < 0.8) {
      this.particles.spark(p.x + (this.rng() - 0.5) * 6, p.y + p.r, {
        count: 1, speed: 60, dir: Math.PI / 2, spread: 0.5,
        color: 'rgba(120,200,255,0.9)', life: 0.3, size: 2, rng: this.rng,
      });
    }

    // Firing.
    p.fireTimer -= dt;
    if (input.firing && p.fireTimer <= 0) {
      const { projectiles, cooldown } = fire(p.weapon, { x: p.x, y: p.y - p.r });
      for (const proj of projectiles) {
        proj.id = this.nextId++;
        this.pbullets.push(proj);
      }
      p.fireTimer = cooldown;
      this.stats.shots++;
      if (this.audio) this.audio.shoot(p.weapon.type);
      // Muzzle flash.
      this.particles.spark(p.x, p.y - p.r, {
        count: 4, speed: 90, dir: -Math.PI / 2, spread: 0.8,
        color: this._weaponColor(), life: 0.18, size: 2, rng: this.rng,
      });
      this.addShake(0.03);
    }
  }

  _weaponColor() {
    return { pulse: '#7cf6ff', spread: '#ffd166', laser: '#c17bff', homing: '#ff7ab8' }[this.player.weapon.type];
  }

  // ------------------------------------------------------------------ spawn
  _spawn(dt) {
    if (this.boss) return; // director paused while boss alive
    const out = directorTick(this.director, dt, this.rng);
    for (const s of out.spawns) this._spawnEnemy(s);
    if (out.boss) {
      const b = this._spawnEnemy(out.boss);
      this.boss = b;
      this.starBoost = 1;
      this.floater('⚠ WARNING ⚠', this.w / 2, this.h / 2 - 40, '#ff4d6d', 22, -10);
    }
  }

  _spawnEnemy(s) {
    const def = ENEMIES[s.type];
    const e = {
      id: this.nextId++,
      type: s.type,
      def,
      x: s.x, y: s.y,
      vx: 0, vy: def.speed,
      r: def.r,
      hp: s.hp, maxHp: s.maxHp,
      color: def.color,
      speed: s.speed,
      phase: s.phase,
      baseX: s.x,
      fireTimer: (def.fireEvery || 2) * (0.5 + this.rng() * 0.5),
      hitFlash: 0,
      spawnPop: 1,
      t: 0,
      strafeDir: this.rng() < 0.5 ? -1 : 1,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ enemies
  _updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.t += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt * 6);
      e.spawnPop = Math.max(0, e.spawnPop - dt * 3);

      switch (e.def.behavior) {
        case 'sine':
          e.y += e.speed * dt;
          e.x = e.baseX + Math.sin(e.phase + e.t * (e.def.freq || 2)) * (e.def.amp || 60);
          break;
        case 'dive':
          // Initial slight lock onto player x, then dive fast.
          if (e.t < 0.5) e.x += (p.x - e.x) * dt * 2;
          e.y += e.speed * dt;
          break;
        case 'shooter':
          e.y += e.speed * dt;
          if (e.y > 60) e.y -= e.speed * dt * 0.5; // ease down and hover-ish
          this._enemyFire(e, dt);
          break;
        case 'boss':
          this._updateBoss(e, dt);
          break;
        default:
          e.y += e.speed * dt;
      }

      // Contact damage.
      if (entitiesHit(e, p) && p.invuln <= 0) {
        this._damagePlayer(e.def.contact, e.x, e.y);
        if (e.type !== 'boss' && e.type !== 'tank') {
          this._killEnemy(e, i, false); // small foes pop on ramming
        } else {
          e.hitFlash = 1;
        }
        continue;
      }

      if (e.type !== 'boss' && e.y > this.h + e.r + 20) {
        this.enemies.splice(i, 1); // left the field, no penalty
      }
    }
  }

  _updateBoss(e, dt) {
    // Descend to a hover line, then strafe and fire spreads.
    const targetY = 120;
    if (e.y < targetY) {
      e.y += e.speed * dt;
    } else {
      e.x += e.strafeDir * 60 * dt;
      if (e.x < e.r + 10) { e.x = e.r + 10; e.strafeDir = 1; }
      if (e.x > this.w - e.r - 10) { e.x = this.w - e.r - 10; e.strafeDir = -1; }
      this._bossFire(e, dt);
    }
  }

  _bossFire(e, dt) {
    e.fireTimer -= dt;
    if (e.fireTimer > 0) return;
    e.fireTimer = e.def.fireEvery;
    e.shotPhase = (e.shotPhase || 0) + 1;
    const p = this.player;
    if (e.shotPhase % 3 === 0) {
      // Radial burst.
      const n = 18;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + e.t;
        this.ebullets.push(enemyBullet(e.x, e.y, a, 170, 14));
      }
    } else {
      // Aimed 5-shot fan.
      const base = Math.atan2(p.y - e.y, p.x - e.x);
      for (let i = -2; i <= 2; i++) {
        this.ebullets.push(enemyBullet(e.x, e.y, base + i * 0.18, 220, 12));
      }
    }
    if (this.audio) this.audio.hit();
  }

  _enemyFire(e, dt) {
    e.fireTimer -= dt;
    if (e.fireTimer > 0) return;
    e.fireTimer = e.def.fireEvery;
    const p = this.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    this.ebullets.push(enemyBullet(e.x, e.y, a, e.def.bulletSpeed || 220, 12));
    if (this.audio) this.audio.hit();
  }

  // ------------------------------------------------------------ player bullets
  _updatePBullets(dt) {
    for (let i = this.pbullets.length - 1; i >= 0; i--) {
      const b = this.pbullets[i];
      b.life -= dt;

      // Homing steering.
      if (b.homing || b.targetSeek) {
        const tgt = this._nearestEnemy(b.x, b.y);
        if (tgt) {
          const desired = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          const na = rotateToward(cur, desired, (b.turnRate || 3) * dt);
          const sp = Math.hypot(b.vx, b.vy) || b.speed;
          b.vx = Math.cos(na) * sp;
          b.vy = Math.sin(na) * sp;
        }
        // Missile trail.
        if (this.rng() < 0.9) {
          this.particles.spark(b.x, b.y, {
            count: 1, speed: 30, color: b.color, life: 0.3, size: 2, rng: this.rng,
          });
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      if (b.life <= 0 || outOfBounds(b, this.w, this.h, 40)) {
        this.pbullets.splice(i, 1);
        continue;
      }

      // Collide with enemies.
      let consumed = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hits && b.hits.includes(e.id)) continue;
        if (entitiesHit(b, e)) {
          this._hitEnemy(e, j, b.damage, b.x, b.y);
          if (b.blastRadius) this._splashDamage(b.x, b.y, b.blastRadius, b.damage * 0.5, e.id);
          if (b.pierce > 0) {
            b.pierce -= 1;
            b.hits.push(e.id);
          } else {
            consumed = true;
          }
          // Impact sparks.
          this.particles.spark(b.x, b.y, {
            count: 3, speed: 90, color: b.color, life: 0.2, size: 2, rng: this.rng,
          });
          if (consumed) break;
        }
      }
      if (consumed) this.pbullets.splice(i, 1);
    }
  }

  _splashDamage(x, y, radius, dmg, exceptId) {
    const r2 = radius * radius;
    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const e = this.enemies[j];
      if (e.id === exceptId) continue;
      if (dist2(x, y, e.x, e.y) <= r2) this._hitEnemy(e, j, dmg, e.x, e.y);
    }
    this.particles.ring(x, y, { color: '#ff9a3d', r0: 4, r1: radius, life: 0.3, width: 2 });
  }

  _hitEnemy(e, index, dmg, hx, hy) {
    e.hp -= dmg;
    e.hitFlash = 1;
    this.floater(Math.round(dmg), hx + (this.rng() - 0.5) * 8, hy, '#ffe9a8', 11, -40);
    if (this.audio) this.audio.hit();
    if (e.hp <= 0) {
      const idx = this.enemies.indexOf(e);
      if (idx >= 0) this._killEnemy(e, idx, true);
    }
  }

  _killEnemy(e, index, byWeapon) {
    if (index < 0 || this.enemies[index] !== e) index = this.enemies.indexOf(e);
    if (index >= 0) this.enemies.splice(index, 1);
    this.stats.kills++;

    const isBoss = e.type === 'boss';
    this.explosion(e.x, e.y, e.color, isBoss ? 3.2 : e.r > 20 ? 1.6 : 1, isBoss);
    this.addShake(isBoss ? 0.9 : e.r > 20 ? 0.35 : 0.16);
    if (isBoss) {
      this.doHitstop(0.12);
      this.timeScale = 0.35;
      this.doFlash('#ff9a3d', 0.5);
    } else if (e.r > 20) {
      this.doHitstop(0.04);
    }

    const gained = addKill(this.score, e.def.score);
    const comboTxt = this.score.combo > 2 ? `x${this.score.combo}` : '';
    this.floater(`+${gained}${comboTxt ? ' ' + comboTxt : ''}`, e.x, e.y - 6,
      this.score.combo > 4 ? '#ffd166' : '#bfefff', isBoss ? 22 : 13, -46);

    // Drops.
    if (isBoss) {
      this._spawnDrops(e.x, e.y, 5, true);
      this.boss = null;
      bossCleared(this.director);
      this.floater('DREADNOUGHT DOWN', this.w / 2, this.h / 2, '#ffd166', 24, -6);
    } else if (this.rng() < e.def.dropChance) {
      this._spawnDrops(e.x, e.y, 1, false);
    }
  }

  _spawnDrops(x, y, count, boss) {
    for (let i = 0; i < count; i++) {
      let type;
      if (boss) {
        // Guarantee a nice mix from a boss.
        type = i === 0 ? 'power' : i === 1 ? 'bomb' : rollDrop(this.rng);
      } else {
        type = rollDrop(this.rng);
      }
      const d = DROPS[type];
      this.drops.push({
        type, glyph: d.glyph, color: d.color, label: d.label,
        x: x + (this.rng() - 0.5) * (boss ? 60 : 0),
        y, vx: (this.rng() - 0.5) * 60, vy: -40 - this.rng() * 40,
        r: 9, phase: this.rng() * TAU, life: 12,
      });
    }
  }

  _nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------ enemy bullets
  _updateEBullets(dt) {
    const p = this.player;
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || outOfBounds(b, this.w, this.h, 30)) {
        this.ebullets.splice(i, 1);
        continue;
      }
      if (p.invuln <= 0 && entitiesHit(b, p)) {
        this.ebullets.splice(i, 1);
        this._damagePlayer(b.damage, b.x, b.y);
      }
    }
  }

  // ------------------------------------------------------------------ drops
  _updateDrops(dt) {
    const p = this.player;
    const magnetR2 = 90 * 90;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      // Gravity-ish then float; magnet toward player when close.
      const d2 = dist2(d.x, d.y, p.x, p.y);
      if (d2 < magnetR2) {
        const [nx, ny] = norm(p.x - d.x, p.y - d.y);
        d.vx += nx * 900 * dt;
        d.vy += ny * 900 * dt;
      }
      d.vy += 60 * dt; // slight drift down
      d.vx *= Math.pow(0.9, dt * 60);
      d.vy = clamp(d.vy, -200, 260);
      d.x += d.vx * dt;
      d.y += d.vy * dt;

      if (entitiesHit(d, p)) {
        this._pickup(d);
        this.drops.splice(i, 1);
        continue;
      }
      if (d.life <= 0 || d.y > this.h + 30) this.drops.splice(i, 1);
    }
  }

  _pickup(d) {
    const prevType = this.player.weapon.type;
    const res = applyDrop(d.type, this.player);
    this.floater(res.text, this.player.x, this.player.y - 26,
      d.color, 14, -50);
    this.particles.ring(this.player.x, this.player.y, { color: d.color, r0: 6, r1: 46, life: 0.4, width: 3 });
    this.particles.spark(d.x, d.y, {
      count: 10, speed: 130, color: d.color, life: 0.5, size: 2.5, rng: this.rng,
    });
    this.doFlash(d.color, 0.12);
    if (res.kind === 'weapon' || (res.kind === 'power')) {
      if (this.audio) this.audio.powerup();
      if (res.kind === 'weapon' && this.player.weapon.type !== prevType) {
        this.newWeaponToast = { name: res.text, life: 1.8 };
      }
    } else {
      if (this.audio) this.audio.pickup();
    }
  }

  // ------------------------------------------------------------------ damage
  _damagePlayer(amount, sx, sy) {
    const p = this.player;
    if (p.invuln > 0) return;
    if (p.shield > 0) {
      p.shield -= 1;
      p.invuln = 0.6;
      this.doFlash('#66e0ff', 0.35);
      this.addShake(0.3);
      this.particles.ring(p.x, p.y, { color: '#66e0ff', r0: p.r, r1: p.r + 30, life: 0.35, width: 3 });
      if (this.audio) this.audio.hit();
      this.floater('SHIELD', p.x, p.y - 24, '#66e0ff', 13, -40);
      return;
    }
    p.hp -= amount;
    p.invuln = PLAYER.invulnTime;
    this.addShake(0.6);
    this.doFlash('#ff2b4e', 0.4);
    this.doHitstop(0.05);
    this.explosion(p.x, p.y, '#ff5a7a', 0.8);
    if (this.audio) this.audio.playerHurt();
    if (p.hp <= 0) {
      p.hp = 0;
      this._gameOver();
    }
  }

  _gameOver() {
    this.state = 'dead';
    this.addShake(1);
    this.doFlash('#ff2b4e', 0.7);
    this.explosion(this.player.x, this.player.y, '#7cf6ff', 2.4, true);
    this.timeScale = 0.4;
    if (this.audio) this.audio.gameOver();
  }

  // ------------------------------------------------------------------ bomb
  _handleBomb(input) {
    if (!input.bomb) { this._bombLatch = false; return; }
    if (this._bombLatch) return;
    this._bombLatch = true;
    if (this.state !== 'playing' || this.player.bombs <= 0) return;
    this.player.bombs -= 1;
    this._detonateBomb();
  }

  _detonateBomb() {
    const p = this.player;
    this.doFlash('#ffe14d', 0.8);
    this.addShake(0.8);
    this.doHitstop(0.06);
    this.particles.ring(p.x, p.y, { color: '#ffe14d', r0: 10, r1: this.w, life: 0.6, width: 6 });
    this.particles.ring(p.x, p.y, { color: '#ffffff', r0: 6, r1: this.w * 0.7, life: 0.45, width: 4 });
    if (this.audio) this.audio.bomb();
    // Clear enemy bullets.
    for (const b of this.ebullets) {
      this.particles.spark(b.x, b.y, { count: 2, speed: 80, color: '#ffe14d', life: 0.3, size: 2, rng: this.rng });
    }
    this.ebullets.length = 0;
    // Damage every enemy heavily.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      this._hitEnemy(e, i, 90 * hpScale(this.time), e.x, e.y);
    }
  }

  // Accuracy helper for end screen.
  get accuracy() {
    return this.stats.shots ? Math.min(100, Math.round((this.stats.kills / this.stats.shots) * 100)) : 0;
  }
}
