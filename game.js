/* ============================================================
   NEON VOID — a juicy neon vertical shooter
   Game logic + rendering. Logic is DOM-free so it can be
   simulation-tested headlessly in Node.
   ============================================================ */
(function (global) {
  'use strict';

  const W = 480, H = 720;

  // ---------- utils ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const TAU = Math.PI * 2;

  // ---------- weapon definitions ----------
  const WEAPONS = {
    blaster: { name: 'BLASTER', color: '#4df3ff', maxLv: 6 },
    spread:  { name: 'SPREAD',  color: '#7dff4d', maxLv: 6 },
    laser:   { name: 'LASER',   color: '#ff4df0', maxLv: 6 },
    missile: { name: 'MISSILE', color: '#ffb84d', maxLv: 6 },
  };
  const WEAPON_KEYS = Object.keys(WEAPONS);

  // ---------- enemy archetypes ----------
  const ENEMY_TYPES = {
    darter:  { hp: 2,  r: 14, score: 100, color: '#ff5a5a', drop: 0.14 },
    drone:   { hp: 3,  r: 15, score: 150, color: '#ffd25a', drop: 0.16 },
    weaver:  { hp: 4,  r: 16, score: 200, color: '#5affc8', drop: 0.18 },
    tank:    { hp: 14, r: 24, score: 400, color: '#b98cff', drop: 0.5 },
    splitter:{ hp: 6,  r: 18, score: 250, color: '#ff8cd2', drop: 0.2 },
    shard:   { hp: 1,  r: 9,  score: 50,  color: '#ff8cd2', drop: 0.05 },
    boss:    { hp: 320, r: 52, score: 5000, color: '#ff3b3b', drop: 1 },
  };

  // ---------- Dreadnought bosses (one per stage, escalating) ----------
  // move   = movement pattern,  phases = attack patterns it cycles through,
  // arms   = spiral/flower arm count,  hpMul = HP multiplier over the stage base.
  const BOSSES = [
    { name: 'DREADNOUGHT MK-I',    color: '#ff6b6b', bullet: '#ff9b6b', hpMul: 0.85, r: 50, move: 'hover',    phases: ['aimed', 'ring'],                          phaseTime: 5.0 },
    { name: 'DREADNOUGHT MK-II',   color: '#ff8c4d', bullet: '#ffb066', hpMul: 0.95, r: 50, move: 'pace',     moveSpd: 80,  phases: ['fan', 'twin'],              phaseTime: 5.0 },
    { name: 'DREADNOUGHT MK-III',  color: '#ffd25a', bullet: '#ffe08a', hpMul: 1.00, r: 52, move: 'sweep',    phases: ['ring', 'spiral'],   arms: 2,              phaseTime: 4.5 },
    { name: 'DREADNOUGHT MK-IV',   color: '#7dff4d', bullet: '#b6ff7a', hpMul: 1.06, r: 52, move: 'dive',     phases: ['aimed', 'wall'],                          phaseTime: 4.5 },
    { name: 'DREADNOUGHT MK-V',    color: '#5affc8', bullet: '#8affda', hpMul: 1.12, r: 54, move: 'figure8',  phases: ['spiral', 'fan'],    arms: 3,              phaseTime: 4.5 },
    { name: 'DREADNOUGHT MK-VI',   color: '#4dc3ff', bullet: '#8ad8ff', hpMul: 1.20, r: 54, move: 'teleport', phases: ['cross', 'shotgun'],                       phaseTime: 4.0 },
    { name: 'DREADNOUGHT MK-VII',  color: '#4df3ff', bullet: '#8af6ff', hpMul: 1.30, r: 56, move: 'pace',     moveSpd: 120, phases: ['flower', 'fan', 'twin'], arms: 4, phaseTime: 4.0 },
    { name: 'DREADNOUGHT MK-VIII', color: '#b98cff', bullet: '#d4bcff', hpMul: 1.42, r: 56, move: 'chase',    moveSpd: 72,  phases: ['spiral', 'wall', 'aimed'], arms: 4, phaseTime: 3.8 },
    { name: 'DREADNOUGHT MK-IX',   color: '#ff8cd2', bullet: '#ffb8e4', hpMul: 1.56, r: 58, move: 'figure8',  phases: ['ring', 'flower', 'shotgun'], arms: 5,      phaseTime: 3.6 },
    { name: 'DREADNOUGHT MK-X',    color: '#ff3b3b', bullet: '#ff7b5a', hpMul: 1.75, r: 62, move: 'teleport', phases: ['spiral', 'cross', 'fan', 'ring'], arms: 6, phaseTime: 3.3 },
  ];
  const STAGES = BOSSES.length;
  const WAVES_PER_STAGE = 5;

  // ============================================================
  // Game
  // ============================================================
  class Game {
    constructor(opts = {}) {
      this.sfx = opts.sfx || { play() {} };
      this.hiscore = opts.hiscore || 0;
      this.onHiscore = opts.onHiscore || function () {};
      this.state = 'menu'; // menu | play | over
      this.time = 0;
      this.reset();
    }

    reset() {
      this.player = {
        x: W / 2, y: H - 90, r: 11, hp: 5, maxHp: 5,
        shield: 0, inv: 0, fireCd: 0,
        weapon: 'blaster', level: 1,
        bombs: 3, alive: true, tilt: 0, engine: 0,
      };
      this.bullets = [];
      this.ebullets = [];
      this.enemies = [];
      this.drops = [];
      this.particles = [];
      this.floaters = [];
      this.score = 0;
      this.combo = 1;
      this.comboT = 0;
      this.kills = 0;
      this.time = 0;
      this.stage = 1;          // 1..STAGES (then endless)
      this.wave = 1;           // 1..WAVES_PER_STAGE within the stage
      this.waveT = 0;
      this.spawnT = 1.4;
      this.killsSinceDrop = 5; // pity counter starts warm so first drops come fast
      this.bossActive = false;
      this.won = false;
      this.shake = 0;
      this.hitstop = 0;
      this.flash = 0;
      this.banner = null; // {text, t}
      this.overT = 0;
    }

    start() {
      this.reset();
      this.state = 'play';
      this.stage = 1;
      this.wave = 1;
      this.announce('STAGE 1');
      this.sfx.play('start');
    }

    // Smooth, mostly stage-driven ramp. Gentle in stage 1 so players survive to
    // the first boss; scales up steadily across the 10 stages (then endless).
    difficulty() {
      return 1 + (this.stage - 1) * 0.42 + (this.wave - 1) * 0.05 + this.time * 0.0022;
    }

    announce(text) {
      this.banner = { text, t: 2.2 };
    }

    // ---------- main update ----------
    update(dt, input) {
      const firePressed = input.fire && !this._firePrev;
      this._firePrev = input.fire;
      if (this.state === 'menu') {
        this.time += dt;
        if (firePressed) this.start();
        return;
      }
      if (this.state === 'over') {
        this.overT += dt;
        this.updateParticles(dt);
        if (firePressed && this.overT > 1) this.start();
        return;
      }

      if (this.hitstop > 0) { this.hitstop -= dt; return; }

      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      this.flash = Math.max(0, this.flash - dt * 3);
      if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;

      this.updatePlayer(dt, input);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updateDrops(dt);
      this.updateParticles(dt);
      this.updateCollisions();

      // combo decay
      if ((this.comboT -= dt) <= 0) this.combo = 1;
    }

    // ---------- player ----------
    updatePlayer(dt, input) {
      const p = this.player;
      if (!p.alive) return;
      const sp = 320;
      let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      p.x = clamp(p.x + dx * sp * dt, p.r + 4, W - p.r - 4);
      p.y = clamp(p.y + dy * sp * dt, H * 0.35, H - p.r - 6);
      p.tilt = lerp(p.tilt, dx * 0.35, 1 - Math.pow(0.001, dt));
      p.inv = Math.max(0, p.inv - dt);
      p.engine += dt;

      // engine trail
      if (this.particles.length < 400) {
        this.particles.push(part(p.x + rand(-3, 3), p.y + 14, rand(-15, 15), rand(120, 200),
          rand(0.25, 0.45), rand(2, 4), Math.random() < 0.5 ? '#4df3ff' : '#2a6cff', 'trail'));
      }

      // firing
      p.fireCd -= dt;
      if (input.fire && p.fireCd <= 0) this.fireWeapon();

      // bomb
      if (input.bomb && !this._bombHeld && p.bombs > 0) this.useBomb();
      this._bombHeld = input.bomb;
    }

    fireWeapon() {
      const p = this.player, lv = p.level;
      const B = (x, y, vx, vy, dmg, opts = {}) => this.bullets.push(Object.assign({
        x, y, vx, vy, dmg, r: 4, color: WEAPONS[p.weapon].color, pierce: 0, homing: 0, trail: false,
      }, opts));

      switch (p.weapon) {
        case 'blaster': {
          p.fireCd = Math.max(0.07, 0.16 - lv * 0.012);
          const dmg = 1 + Math.floor(lv / 3);
          if (lv < 3) B(p.x, p.y - 14, 0, -640, dmg);
          else if (lv < 5) { B(p.x - 7, p.y - 10, 0, -640, dmg); B(p.x + 7, p.y - 10, 0, -640, dmg); }
          else { B(p.x - 9, p.y - 8, 0, -660, dmg); B(p.x + 9, p.y - 8, 0, -660, dmg); B(p.x, p.y - 16, 0, -700, dmg + 1); }
          this.sfx.play('shoot');
          break;
        }
        case 'spread': {
          p.fireCd = Math.max(0.11, 0.24 - lv * 0.014);
          const n = Math.min(3 + Math.floor((lv - 1) / 1.5), 7);
          const arc = 0.28 + n * 0.055;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
            B(p.x, p.y - 12, Math.cos(a) * 540, Math.sin(a) * 540, 1, { r: 3.5 });
          }
          this.sfx.play('shoot2');
          break;
        }
        case 'laser': {
          p.fireCd = Math.max(0.05, 0.11 - lv * 0.008);
          const dmg = 1 + lv * 0.35;
          B(p.x, p.y - 18, 0, -980, dmg, { r: 3, pierce: 1 + Math.floor(lv / 2), trail: true });
          if (lv >= 4) { B(p.x - 10, p.y - 8, 0, -980, dmg * 0.6, { r: 2.4, pierce: 1, trail: true }); B(p.x + 10, p.y - 8, 0, -980, dmg * 0.6, { r: 2.4, pierce: 1, trail: true }); }
          this.sfx.play('laser');
          break;
        }
        case 'missile': {
          p.fireCd = Math.max(0.16, 0.34 - lv * 0.022);
          const n = lv >= 3 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const off = n === 1 ? 0 : (i === 0 ? -12 : 12);
            B(p.x + off, p.y - 8, off * 8, -300, 2 + lv * 0.5, { r: 5, homing: 3.2 + lv * 0.35, splash: 46, trail: true });
          }
          if (lv >= 5) B(p.x, p.y - 16, 0, -320, 2 + lv * 0.5, { r: 5, homing: 4.2, splash: 46, trail: true });
          this.sfx.play('missile');
          break;
        }
      }
      // muzzle flash
      for (let i = 0; i < 2; i++)
        this.particles.push(part(p.x + rand(-4, 4), p.y - 16, rand(-40, 40), rand(-120, -60), 0.12, rand(2, 3.5), WEAPONS[p.weapon].color, 'spark'));
    }

    useBomb() {
      const p = this.player;
      p.bombs--;
      this.shake = 18;
      this.flash = 1;
      this.hitstop = 0.06;
      this.sfx.play('bomb');
      this.ebullets.length = 0;
      for (const e of this.enemies) {
        this.damageEnemy(e, e.type === 'boss' ? 40 : 999, true);
      }
      // ring particles
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * TAU;
        this.particles.push(part(p.x, p.y, Math.cos(a) * rand(300, 620), Math.sin(a) * rand(300, 620), rand(0.4, 0.8), rand(2, 5), '#ffffff', 'spark'));
      }
    }

    hurtPlayer(dmg) {
      const p = this.player;
      if (p.inv > 0 || !p.alive) return;
      if (this.god) {
        this.burst(p.x, p.y, 8, '#ffd25a');
        p.inv = 0.3;
        return;
      }
      if (p.shield > 0) {
        p.shield--;
        p.inv = 1.0;
        this.shake = 8;
        this.sfx.play('shieldHit');
        this.burst(p.x, p.y, 14, '#4dc3ff');
        return;
      }
      p.hp -= dmg;
      p.inv = 1.6;
      this.shake = 14;
      this.flash = 0.6;
      this.hitstop = 0.05;
      this.combo = 1;
      this.sfx.play('hurt');
      this.burst(p.x, p.y, 22, '#ff5a5a');
      if (p.hp <= 0) this.killPlayer();
    }

    killPlayer() {
      const p = this.player;
      p.alive = false;
      this.shake = 26;
      this.flash = 1;
      this.sfx.play('die');
      for (let i = 0; i < 90; i++)
        this.particles.push(part(p.x, p.y, rand(-360, 360), rand(-360, 360), rand(0.5, 1.4), rand(2, 6), ['#4df3ff', '#ffffff', '#ff5a5a'][randi(0, 2)], 'spark'));
      this.state = 'over';
      this.overT = 0;
      if (this.score > this.hiscore) { this.hiscore = this.score; this.onHiscore(this.hiscore); }
    }

    // ---------- spawning ----------
    updateSpawning(dt) {
      const WAVE_DUR = 11; // seconds per wave; a stage = 5 waves + a boss
      this.waveT += dt;
      if (!this.bossActive && this.waveT > WAVE_DUR) {
        this.waveT = 0;
        if (this.wave >= WAVES_PER_STAGE) {
          this.spawnBoss();
        } else {
          this.wave++;
          this.announce('WAVE ' + this.wave + '/' + WAVES_PER_STAGE);
          this.sfx.play('wave');
        }
      }
      if (this.bossActive) return; // boss controls the arena

      this.spawnT -= dt;
      const d = this.difficulty();
      // Cap concurrent hostiles so early stages never swarm the player.
      const cap = 4 + this.stage * 2;
      if (this.spawnT <= 0 && this.enemies.length < cap) {
        this.spawnT = Math.max(0.45, 1.5 - d * 0.07) * rand(0.75, 1.25);
        this.spawnEnemy(d);
      }
    }

    spawnEnemy(d) {
      // Progressive roster — new hostiles are introduced as stages advance,
      // so each stage brings a fresh threat (classic shmup progression).
      const roster = ['darter', 'drone'];
      if (this.stage >= 2) roster.push('weaver');
      if (this.stage >= 3) roster.push('splitter');
      if (this.stage >= 4) roster.push('tank');
      let type;
      if (this.stage <= 1) {
        type = Math.random() < 0.6 ? 'darter' : 'drone';
      } else {
        const weights = roster.map((tp) => tp === 'tank' ? 0.5 + this.stage * 0.07 : tp === 'splitter' ? 0.7 : tp === 'weaver' ? 1.0 : 1.4);
        const tot = weights.reduce((a, b) => a + b, 0);
        let acc = Math.random() * tot;
        type = roster[0];
        for (let i = 0; i < roster.length; i++) { acc -= weights[i]; if (acc <= 0) { type = roster[i]; break; } }
      }

      const t = ENEMY_TYPES[type];
      const x = rand(40, W - 40);
      const e = {
        type, x, y: -30, r: t.r,
        hp: Math.ceil(t.hp * (0.85 + d * 0.24)), maxHp: 0,
        color: t.color, score: t.score, dropChance: t.drop,
        t: rand(0, TAU), fireT: rand(0.8, 2.4), hitT: 0,
        vx: 0, vy: 0, baseX: x, spd: (0.85 + d * 0.055),
      };
      e.maxHp = e.hp;
      this.enemies.push(e);
    }

    spawnShards(x, y, d) {
      for (let i = 0; i < 3; i++) {
        const t = ENEMY_TYPES.shard;
        const a = -Math.PI / 2 + rand(-1.2, 1.2);
        this.enemies.push({
          type: 'shard', x, y, r: t.r,
          hp: Math.ceil(t.hp * (0.8 + d * 0.2)), maxHp: 1,
          color: t.color, score: t.score, dropChance: t.drop,
          t: rand(0, TAU), fireT: 999, hitT: 0,
          vx: Math.cos(a) * rand(60, 160), vy: rand(90, 170), baseX: x, spd: 1,
        });
      }
    }

    spawnBoss() {
      this.bossActive = true;
      const cfg = BOSSES[(this.stage - 1) % STAGES];
      this.announce('!! ' + cfg.name + ' !!');
      this.sfx.play('boss');
      const hp = Math.round((280 + this.stage * 210) * cfg.hpMul);
      const e = {
        type: 'boss', cfg, x: W / 2, y: -80, r: cfg.r,
        hp, maxHp: hp, color: cfg.color, score: 4000 + this.stage * 1200, dropChance: 1,
        t: 0, fireT: 2.0, hitT: 0, atkIdx: 0, atkT: 0, spiralA: rand(0, TAU),
        enrage: 0, entered: false, dir: 1, tpT: 0, tpX: W / 2,
        vx: 0, vy: 0, baseX: W / 2, spd: 1,
      };
      this.enemies.push(e);
    }

    // ---------- enemies ----------
    updateEnemies(dt) {
      const d = this.difficulty();
      const p = this.player;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.t += dt;
        e.hitT = Math.max(0, e.hitT - dt);
        const sp = e.spd;

        switch (e.type) {
          case 'darter':
            e.y += (150 + d * 26) * sp * dt;
            e.x = e.baseX + Math.sin(e.t * 2.2) * 26;
            break;
          case 'drone':
            e.y += (95 + d * 16) * sp * dt;
            e.x = e.baseX + Math.sin(e.t * 1.6) * 90;
            break;
          case 'weaver':
            e.y += (80 + d * 14) * sp * dt;
            e.x += Math.cos(e.t * 3.1) * 150 * dt;
            e.x = clamp(e.x, 24, W - 24);
            break;
          case 'splitter':
            e.y += (110 + d * 18) * sp * dt;
            break;
          case 'shard':
            e.x += e.vx * dt; e.y += e.vy * dt;
            break;
          case 'tank':
            e.y += (46 + d * 7) * sp * dt;
            break;
          case 'boss': this.updateBoss(e, dt, d); break;
        }

        // enemy shooting
        e.fireT -= dt;
        if (e.fireT <= 0 && p.alive && e.y > 0 && e.y < H - 160) {
          this.enemyFire(e, d);
        }

        // off screen
        if (e.y > H + 50 || e.x < -60 || e.x > W + 60) {
          this.enemies.splice(i, 1);
          continue;
        }
      }
    }

    enemyFire(e, d) {
      const p = this.player;
      const bs = 170 + d * 26; // bullet speed
      const aimAt = (spread, speed) => {
        const a = Math.atan2(p.y - e.y, p.x - e.x) + rand(-spread, spread);
        this.ebullets.push({ x: e.x, y: e.y + e.r * 0.6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, color: '#ff7b7b' });
      };
      switch (e.type) {
        case 'darter': e.fireT = rand(2.2, 3.6) / Math.sqrt(d); aimAt(0.15, bs); break;
        case 'drone': e.fireT = rand(1.8, 3.2) / Math.sqrt(d); aimAt(0.1, bs); break;
        case 'weaver':
          e.fireT = rand(2.4, 3.8) / Math.sqrt(d);
          for (let k = -1; k <= 1; k++) {
            const a = Math.PI / 2 + k * 0.35;
            this.ebullets.push({ x: e.x, y: e.y + 8, vx: Math.cos(a) * bs * 0.9, vy: Math.sin(a) * bs * 0.9, r: 5, color: '#7bffd9' });
          }
          break;
        case 'splitter': e.fireT = 999; break;
        case 'shard': e.fireT = 999; break;
        case 'tank':
          e.fireT = rand(1.6, 2.6) / Math.sqrt(d);
          aimAt(0.06, bs * 1.1); aimAt(0.3, bs * 0.9);
          break;
        case 'boss': this.bossFire(e, d); break;
      }
    }

    // Movement per boss.cfg.move + phase cycling + enrage as HP drops.
    updateBoss(e, dt, d) {
      const cfg = e.cfg;
      if (!e.entered) {
        e.y += 70 * dt;
        if (e.y >= 105) { e.y = 105; e.entered = true; }
        return;
      }
      const hf = e.hp / e.maxHp;
      e.enrage = hf < 0.25 ? 2 : hf < 0.55 ? 1 : 0;
      e.atkT += dt;
      if (e.atkT > cfg.phaseTime) { e.atkT = 0; e.atkIdx = (e.atkIdx + 1) % cfg.phases.length; }

      const cx = W / 2, tt = e.t, amp = W / 2 - e.r - 6;
      switch (cfg.move) {
        case 'hover': e.x = cx + Math.sin(tt * 1.0) * 44; e.y = 100 + Math.sin(tt * 0.8) * 10; break;
        case 'pace': {
          const s = cfg.moveSpd || 80;
          e.x += e.dir * s * dt;
          if (e.x < e.r + 8) { e.x = e.r + 8; e.dir = 1; }
          if (e.x > W - e.r - 8) { e.x = W - e.r - 8; e.dir = -1; }
          e.y = 100; break;
        }
        case 'sweep': e.x = cx + Math.sin(tt * 0.7) * amp; e.y = 104 + Math.sin(tt * 1.3) * 8; break;
        case 'figure8': e.x = cx + Math.sin(tt * (0.9 + e.enrage * 0.12)) * amp; e.y = 120 + Math.sin(tt * 1.8) * 46; break;
        case 'chase': {
          const s = cfg.moveSpd || 70;
          e.x += clamp(this.player.x - e.x, -s * dt, s * dt);
          e.y = 100 + Math.sin(tt * 1.1) * 8; break;
        }
        case 'dive': e.x = cx + Math.sin(tt * 0.6) * amp; e.y = 105 + Math.max(0, Math.sin(tt * 0.7)) * 175; break;
        case 'teleport': {
          e.tpT += dt;
          if (e.tpT > (2.2 - e.enrage * 0.4)) { e.tpT = 0; e.tpX = rand(e.r + 20, W - e.r - 20); this.burst(e.x, e.y, 12, cfg.color); }
          e.x += (e.tpX - e.x) * Math.min(1, dt * 9);
          e.y = 100 + Math.sin(tt * 1.4) * 10; break;
        }
        default: e.x = cx + Math.sin(tt * 0.7) * amp; e.y = 104;
      }
      e.x = clamp(e.x, e.r + 4, W - e.r - 4);
    }

    // Per-boss shooting patterns (data-driven by boss.cfg.phases).
    bossFire(e, d) {
      const p = this.player, cfg = e.cfg;
      const col = cfg.bullet || '#ff9b4d';
      const enr = 1 + e.enrage * 0.4;                 // faster when enraged
      const base = 150 + this.stage * 6 + d * 6;      // bullet speed (dodgeable)
      const shoot = (a, s, r, c) => this.ebullets.push({ x: e.x, y: e.y + 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: r || 5, color: c || col });
      const aim = Math.atan2(p.y - e.y, p.x - e.x);
      switch (cfg.phases[e.atkIdx]) {
        case 'aimed':
          e.fireT = 0.6 / enr;
          for (let k = -1; k <= 1; k++) shoot(aim + k * 0.16, base * 1.1);
          break;
        case 'fan': {
          e.fireT = 1.0 / enr;
          const n = 5 + this.stage + e.enrage;
          for (let i = 0; i < n; i++) shoot(aim + (i / (n - 1) - 0.5) * 0.95, base);
          break;
        }
        case 'ring': {
          e.fireT = 1.1 / enr;
          const n = 12 + this.stage + e.enrage * 4;
          const off = e.t * 0.7;
          for (let k = 0; k < n; k++) shoot(off + (k / n) * TAU, base * 0.82);
          this.sfx.play('bossShoot');
          break;
        }
        case 'spiral': {
          e.fireT = 0.085;
          const arms = cfg.arms || 2;
          e.spiralA += 0.28 + e.enrage * 0.05;
          for (let k = 0; k < arms; k++) shoot(e.spiralA + (k / arms) * TAU, base * 0.9);
          break;
        }
        case 'flower': {
          e.fireT = 0.11;
          const arms = cfg.arms || 5;
          e.spiralA += 0.6;
          for (let k = 0; k < arms; k++) shoot(e.spiralA + (k / arms) * TAU, base * 0.85);
          break;
        }
        case 'twin': {
          e.fireT = 0.13;
          const a = Math.PI / 2 + Math.sin(e.t * 2.4) * 0.85;
          for (const s of [-1, 1]) this.ebullets.push({ x: e.x + s * (e.r * 0.6), y: e.y + 16, vx: Math.cos(a) * base, vy: Math.sin(a) * base, r: 4.5, color: col });
          break;
        }
        case 'cross': {
          e.fireT = 0.5 / enr;
          const rot = e.t * 1.1;
          const dirs = 4 + (e.enrage >= 2 ? 4 : 0);
          for (let k = 0; k < dirs; k++) shoot(rot + (k / dirs) * TAU, base * 0.95);
          break;
        }
        case 'shotgun': {
          e.fireT = 1.2 / enr;
          const n = 6 + this.stage;
          for (let i = 0; i < n; i++) shoot(aim + rand(-0.5, 0.5), base * rand(0.8, 1.2));
          this.sfx.play('bossShoot');
          break;
        }
        case 'wall': {
          e.fireT = 1.5 / enr;
          const n = 11, gap = randi(1, n - 3);
          for (let i = 0; i < n; i++) {
            if (i === gap || i === gap + 1) continue; // a safe lane to slide into
            const bx = 24 + (i / (n - 1)) * (W - 48);
            this.ebullets.push({ x: bx, y: e.y, vx: 0, vy: base * 0.72, r: 5, color: col });
          }
          break;
        }
        default:
          e.fireT = 0.7 / enr;
          shoot(aim, base);
      }
    }

    damageEnemy(e, dmg, silent) {
      e.hp -= dmg;
      e.hitT = 0.08;
      if (e.hp <= 0) this.killEnemy(e, silent);
    }

    killEnemy(e, silent) {
      const idx = this.enemies.indexOf(e);
      if (idx < 0) return;
      this.enemies.splice(idx, 1);
      this.kills++;
      // combo
      this.combo = Math.min(9.9, this.combo + 0.25);
      this.comboT = 2.4;
      const pts = Math.floor(e.score * this.combo);
      this.score += pts;
      this.floaters.push({ x: e.x, y: e.y, text: '+' + pts, t: 0.9, color: '#ffffff' });
      if (this.combo >= 2 && Math.random() < 0.3)
        this.floaters.push({ x: e.x, y: e.y - 18, text: 'x' + this.combo.toFixed(1), t: 0.8, color: '#ffd25a' });

      // juice
      const big = e.type === 'tank' || e.type === 'boss';
      this.shake = Math.max(this.shake, big ? 14 : 5);
      if (big) this.hitstop = Math.max(this.hitstop, 0.045);
      if (!silent) this.sfx.play(big ? 'bigBoom' : 'boom');
      this.burst(e.x, e.y, big ? 46 : 18, e.color);
      this.burst(e.x, e.y, big ? 20 : 8, '#ffffff');

      if (e.type === 'splitter') this.spawnShards(e.x, e.y, this.difficulty());

      if (e.type === 'boss') {
        this.bossActive = false;
        this.waveT = 0;
        this.stage++;
        this.wave = 1;
        this.flash = 1;
        this.shake = 30;
        if (this.stage > STAGES && !this.won) { this.won = true; this.announce('SECTOR CLEARED!'); }
        else this.announce('STAGE ' + this.stage);
        // shower of drops as a reward
        for (let i = 0; i < 5; i++) this.spawnDrop(e.x + rand(-60, 60), e.y + rand(-30, 30), true);
        // clear enemy bullets as reward
        this.ebullets.length = 0;
      } else if (Math.random() < e.dropChance || this.killsSinceDrop >= 7) {
        this.spawnDrop(e.x, e.y, false);
        this.killsSinceDrop = 0;
      } else {
        this.killsSinceDrop++;
      }
    }

    burst(x, y, n, color) {
      const cap = 550 - this.particles.length;
      n = Math.min(n, Math.max(0, cap));
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), s = rand(40, 320);
        this.particles.push(part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.9), rand(1.5, 4.5), color, 'spark'));
      }
    }

    // ---------- drops ----------
    spawnDrop(x, y, generous) {
      const roll = Math.random();
      let kind;
      if (roll < (generous ? 0.6 : 0.62)) {
        kind = 'weapon:' + WEAPON_KEYS[randi(0, WEAPON_KEYS.length - 1)];
      } else if (roll < 0.78) kind = 'heal';
      else if (roll < 0.9) kind = 'shield';
      else kind = 'bomb';
      this.drops.push({ x, y, vy: 60, kind, t: 0, r: 12 });
    }

    updateDrops(dt) {
      const p = this.player;
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        d.t += dt;
        // magnet toward player when close
        if (p.alive && dist2(d.x, d.y, p.x, p.y) < 130 * 130) {
          const a = Math.atan2(p.y - d.y, p.x - d.x);
          d.x += Math.cos(a) * 300 * dt;
          d.y += Math.sin(a) * 300 * dt;
        } else {
          d.y += d.vy * dt;
          d.x += Math.sin(d.t * 3) * 20 * dt;
        }
        if (d.y > H + 30) { this.drops.splice(i, 1); continue; }
        if (p.alive && dist2(d.x, d.y, p.x, p.y) < (d.r + p.r + 4) * (d.r + p.r + 4)) {
          this.collectDrop(d);
          this.drops.splice(i, 1);
        }
      }
    }

    collectDrop(d) {
      const p = this.player;
      let label = '', color = '#ffffff';
      if (d.kind.startsWith('weapon:')) {
        const w = d.kind.slice(7);
        if (w === p.weapon) {
          if (p.level < WEAPONS[w].maxLv) { p.level++; label = WEAPONS[w].name + ' LV' + p.level; }
          else { this.score += 500; label = 'MAX +500'; }
        } else {
          p.weapon = w;
          label = WEAPONS[w].name + ' LV' + p.level;
        }
        color = WEAPONS[w].color;
        this.sfx.play('powerup');
      } else if (d.kind === 'heal') {
        if (p.hp < p.maxHp) { p.hp++; label = '+1 HULL'; }
        else { this.score += 300; label = '+300'; }
        color = '#7dff4d';
        this.sfx.play('heal');
      } else if (d.kind === 'shield') {
        p.shield = Math.min(3, p.shield + 1);
        label = 'SHIELD';
        color = '#4dc3ff';
        this.sfx.play('shieldUp');
      } else if (d.kind === 'bomb') {
        p.bombs = Math.min(5, p.bombs + 1);
        label = '+BOMB';
        color = '#ffb84d';
        this.sfx.play('powerup');
      }
      this.floaters.push({ x: p.x, y: p.y - 26, text: label, t: 1.1, color });
      this.burst(p.x, p.y, 12, color);
    }

    // ---------- bullets ----------
    updateBullets(dt) {
      // player bullets
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (b.homing && this.enemies.length) {
          let best = null, bd = 1e12;
          for (const e of this.enemies) {
            if (e.y < -10) continue;
            const dd = dist2(b.x, b.y, e.x, e.y);
            if (dd < bd) { bd = dd; best = e; }
          }
          if (best) {
            const want = Math.atan2(best.y - b.y, best.x - b.x);
            const cur = Math.atan2(b.vy, b.vx);
            let da = want - cur;
            while (da > Math.PI) da -= TAU;
            while (da < -Math.PI) da += TAU;
            const na = cur + clamp(da, -b.homing * dt, b.homing * dt);
            const sp = Math.min(560, Math.hypot(b.vx, b.vy) + 700 * dt);
            b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
          }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.trail && this.particles.length < 500)
          this.particles.push(part(b.x, b.y, rand(-10, 10), rand(20, 60), 0.18, 2, b.color, 'trail'));
        if (b.y < -20 || b.y > H + 20 || b.x < -20 || b.x > W + 20) this.bullets.splice(i, 1);
      }
      // enemy bullets
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) this.ebullets.splice(i, 1);
      }
    }

    // ---------- collisions ----------
    updateCollisions() {
      const p = this.player;
      // player bullets vs enemies
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (e.y < -e.r) continue;
          const rr = (b.r + e.r) * (b.r + e.r);
          if (dist2(b.x, b.y, e.x, e.y) < rr) {
            // splash damage
            if (b.splash) {
              for (let k = this.enemies.length - 1; k >= 0; k--) {
                const e2 = this.enemies[k];
                if (e2 !== e && dist2(b.x, b.y, e2.x, e2.y) < b.splash * b.splash)
                  this.damageEnemy(e2, b.dmg * 0.5);
              }
              this.burst(b.x, b.y, 10, '#ffb84d');
            }
            this.damageEnemy(e, b.dmg);
            this.sfx.play('hit');
            if (this.particles.length < 520)
              this.particles.push(part(b.x, b.y, rand(-60, 60), rand(-80, 0), 0.15, 2.5, '#ffffff', 'spark'));
            if (b.pierce > 0) { b.pierce--; }
            else { this.bullets.splice(i, 1); }
            break;
          }
        }
      }
      if (!p.alive) return;
      // enemy bullets vs player
      for (let i = this.ebullets.length - 1; i >= 0; i--) {
        const b = this.ebullets[i];
        if (dist2(b.x, b.y, p.x, p.y) < (b.r + p.r - 3) * (b.r + p.r - 3)) {
          this.ebullets.splice(i, 1);
          this.hurtPlayer(1);
        }
      }
      // enemies vs player (ram)
      for (const e of this.enemies) {
        if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 2) * (e.r + p.r - 2)) {
          if (e.type !== 'boss') this.damageEnemy(e, 999);
          this.hurtPlayer(1);
        }
      }
    }

    // ---------- particles / floaters ----------
    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pa = this.particles[i];
        pa.t -= dt;
        if (pa.t <= 0) { this.particles.splice(i, 1); continue; }
        pa.x += pa.vx * dt; pa.y += pa.vy * dt;
        pa.vx *= Math.pow(0.2, dt); pa.vy *= Math.pow(0.2, dt);
        if (pa.kind === 'spark') pa.vy += 60 * dt;
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.t -= dt;
        f.y -= 40 * dt;
        if (f.t <= 0) this.floaters.splice(i, 1);
      }
    }
  }

  function part(x, y, vx, vy, t, r, color, kind) {
    return { x, y, vx, vy, t, maxT: t, r, color, kind };
  }

  // ============================================================
  // Rendering (browser only — safe to skip in Node)
  // ============================================================
  const Render = {
    stars: null,
    nebulae: null,
    initBackdrop() {
      this.stars = [];
      for (let i = 0; i < 110; i++) {
        const layer = randi(0, 2);
        this.stars.push({ x: rand(0, W), y: rand(0, H), layer, r: [0.8, 1.3, 2][layer], sp: [22, 48, 95][layer], tw: rand(0, TAU) });
      }
      this.nebulae = [];
      const cols = ['rgba(80,40,160,', 'rgba(20,80,160,', 'rgba(160,40,120,'];
      for (let i = 0; i < 5; i++) {
        this.nebulae.push({ x: rand(0, W), y: rand(0, H), r: rand(120, 260), c: cols[randi(0, 2)], sp: rand(6, 14) });
      }
    },

    draw(ctx, g, dt) {
      if (!this.stars) this.initBackdrop();
      const t = g.time;

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#060312');
      bg.addColorStop(0.55, '#0a0620');
      bg.addColorStop(1, '#120a2e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // nebulae
      for (const n of this.nebulae) {
        n.y += n.sp * dt;
        if (n.y - n.r > H) { n.y = -n.r; n.x = rand(0, W); }
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        gr.addColorStop(0, n.c + '0.16)');
        gr.addColorStop(1, n.c + '0)');
        ctx.fillStyle = gr;
        ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      }

      // stars
      for (const s of this.stars) {
        s.y += s.sp * dt;
        if (s.y > H) { s.y = -2; s.x = rand(0, W); }
        const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + s.tw));
        ctx.fillStyle = 'rgba(255,255,255,' + (a * (0.35 + s.layer * 0.3)).toFixed(2) + ')';
        ctx.fillRect(s.x, s.y, s.r, s.r + s.layer);
      }

      // screen shake
      ctx.save();
      if (g.shake > 0) {
        ctx.translate(rand(-g.shake, g.shake) * 0.5, rand(-g.shake, g.shake) * 0.5);
      }

      this.drawDrops(ctx, g);
      this.drawEnemies(ctx, g);
      this.drawParticles(ctx, g);
      this.drawBullets(ctx, g);
      if (g.player.alive && g.state === 'play') this.drawPlayer(ctx, g);
      this.drawFloaters(ctx, g);

      ctx.restore();

      // white flash
      if (g.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (g.flash * 0.35).toFixed(2) + ')';
        ctx.fillRect(0, 0, W, H);
      }

      this.drawHUD(ctx, g);
      if (g.state === 'menu') this.drawMenu(ctx, g);
      if (g.state === 'over') this.drawGameOver(ctx, g);
    },

    glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; },
    noGlow(ctx) { ctx.shadowBlur = 0; },

    drawPlayer(ctx, g) {
      const p = g.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt);

      if (p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0) ctx.globalAlpha = 0.35;

      // engine flame
      const fl = 10 + Math.sin(p.engine * 40) * 4;
      this.glow(ctx, '#4df3ff', 18);
      ctx.fillStyle = '#8ef7ff';
      ctx.beginPath();
      ctx.moveTo(-4, 12); ctx.lineTo(0, 12 + fl); ctx.lineTo(4, 12);
      ctx.closePath(); ctx.fill();

      // hull
      this.glow(ctx, '#4df3ff', 16);
      ctx.fillStyle = '#eaffff';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(-5, -2); ctx.lineTo(-14, 8); ctx.lineTo(-6, 10); ctx.lineTo(-4, 13);
      ctx.lineTo(4, 13); ctx.lineTo(6, 10); ctx.lineTo(14, 8); ctx.lineTo(5, -2);
      ctx.closePath(); ctx.fill();
      // cockpit
      ctx.fillStyle = '#20e0ff';
      ctx.beginPath(); ctx.ellipse(0, -4, 3, 6, 0, 0, TAU); ctx.fill();
      // wing accents
      ctx.fillStyle = '#2a6cff';
      ctx.beginPath(); ctx.moveTo(-14, 8); ctx.lineTo(-6, 10); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, 8); ctx.lineTo(6, 10); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill();
      this.noGlow(ctx);
      ctx.globalAlpha = 1;
      ctx.restore();

      // shield ring
      if (p.shield > 0) {
        ctx.save();
        this.glow(ctx, '#4dc3ff', 14);
        ctx.strokeStyle = 'rgba(90,200,255,' + (0.4 + 0.2 * Math.sin(g.time * 6)).toFixed(2) + ')';
        ctx.lineWidth = 2;
        for (let i = 0; i < p.shield; i++) {
          ctx.beginPath(); ctx.arc(p.x, p.y, 20 + i * 4, 0, TAU); ctx.stroke();
        }
        this.noGlow(ctx);
        ctx.restore();
      }
    },

    drawEnemies(ctx, g) {
      for (const e of g.enemies) {
        ctx.save();
        ctx.translate(e.x, e.y);
        const flash = e.hitT > 0;
        this.glow(ctx, e.color, 14);
        ctx.fillStyle = flash ? '#ffffff' : e.color;

        switch (e.type) {
          case 'darter':
            ctx.rotate(Math.sin(e.t * 2.2) * 0.3);
            ctx.beginPath();
            ctx.moveTo(0, 14); ctx.lineTo(-10, -8); ctx.lineTo(0, -3); ctx.lineTo(10, -8);
            ctx.closePath(); ctx.fill();
            break;
          case 'drone':
            ctx.rotate(e.t * 2);
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * TAU;
              const r = k % 2 ? 8 : 15;
              ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath(); ctx.fill();
            break;
          case 'weaver':
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 9, Math.sin(e.t * 3) * 0.4, 0, TAU);
            ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#0a3f30';
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
            break;
          case 'splitter':
            ctx.rotate(e.t * 1.4);
            ctx.beginPath();
            ctx.rect(-12, -12, 24, 24);
            ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#7a2054';
            ctx.beginPath(); ctx.rect(-5, -5, 10, 10); ctx.fill();
            break;
          case 'shard':
            ctx.rotate(e.t * 6);
            ctx.beginPath();
            ctx.moveTo(0, -9); ctx.lineTo(6, 5); ctx.lineTo(-6, 5);
            ctx.closePath(); ctx.fill();
            break;
          case 'tank':
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * TAU + Math.PI / 8;
              ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * 24, Math.sin(a) * 24);
            }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#4a2a80';
            ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : e.color;
            ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
            break;
          case 'boss': {
            ctx.rotate(Math.sin(e.t * 0.7) * 0.06);
            // main hull
            ctx.beginPath();
            ctx.moveTo(0, 46); ctx.lineTo(-30, 26); ctx.lineTo(-52, -4); ctx.lineTo(-30, -34);
            ctx.lineTo(30, -34); ctx.lineTo(52, -4); ctx.lineTo(30, 26);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#5a0f0f';
            ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#ff8c4d';
            ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(e.t * 5) * 2, 0, TAU); ctx.fill();
            // turrets
            ctx.fillStyle = flash ? '#fff' : '#8c1f1f';
            ctx.beginPath(); ctx.arc(-34, 12, 8, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(34, 12, 8, 0, TAU); ctx.fill();
            break;
          }
        }
        this.noGlow(ctx);
        ctx.restore();

        // health bar for tanks (boss uses the big top bar)
        if (e.type === 'tank' && e.hp < e.maxHp) {
          const w = 40;
          const frac = clamp(e.hp / e.maxHp, 0, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w, 5);
          ctx.fillStyle = frac > 0.4 ? '#ff5a5a' : '#ffd25a';
          ctx.fillRect(e.x - w / 2, e.y - e.r - 12, w * frac, 5);
        }
      }
    },

    drawBullets(ctx, g) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const b of g.bullets) {
        this.glow(ctx, b.color, 12);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * 0.8, b.r * 1.8, Math.atan2(b.vy, b.vx) + Math.PI / 2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, b.r * 1.6, b.r * 2.8, Math.atan2(b.vy, b.vx) + Math.PI / 2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      for (const b of g.ebullets) {
        this.glow(ctx, b.color, 10);
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU); ctx.fill();
      }
      this.noGlow(ctx);
      ctx.restore();
    },

    drawDrops(ctx, g) {
      for (const d of g.drops) {
        ctx.save();
        ctx.translate(d.x, d.y + Math.sin(d.t * 4) * 3);
        let color = '#fff', label = '?';
        if (d.kind.startsWith('weapon:')) {
          const w = d.kind.slice(7);
          color = WEAPONS[w].color;
          label = WEAPONS[w].name[0];
        } else if (d.kind === 'heal') { color = '#7dff4d'; label = '+'; }
        else if (d.kind === 'shield') { color = '#4dc3ff'; label = 'S'; }
        else if (d.kind === 'bomb') { color = '#ffb84d'; label = 'B'; }

        this.glow(ctx, color, 16);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-9, -9, 18, 18);
        ctx.fillStyle = 'rgba(10,10,30,0.85)';
        ctx.fillRect(-9, -9, 18, 18);
        ctx.rotate(-Math.PI / 4);
        this.noGlow(ctx);
        ctx.fillStyle = color;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 0, 1);
        ctx.restore();
      }
    },

    drawParticles(ctx, g) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const pa of g.particles) {
        const a = clamp(pa.t / pa.maxT, 0, 1);
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = pa.color;
        const r = pa.r * (pa.kind === 'trail' ? a : (0.5 + a * 0.6));
        ctx.beginPath(); ctx.arc(pa.x, pa.y, r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    drawFloaters(ctx, g) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px monospace';
      for (const f of g.floaters) {
        ctx.globalAlpha = clamp(f.t / 0.4, 0, 1);
        this.glow(ctx, f.color, 6);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      this.noGlow(ctx);
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    drawHUD(ctx, g) {
      const p = g.player;
      ctx.save();
      ctx.font = 'bold 16px monospace';
      ctx.textBaseline = 'top';

      // score
      ctx.textAlign = 'left';
      this.glow(ctx, '#4df3ff', 8);
      ctx.fillStyle = '#eaffff';
      ctx.fillText(String(g.score).padStart(7, '0'), 12, 10);
      this.noGlow(ctx);
      ctx.fillStyle = 'rgba(160,200,255,0.6)';
      ctx.font = '11px monospace';
      ctx.fillText('HI ' + String(Math.max(g.hiscore, g.score)).padStart(7, '0'), 12, 30);

      if (g.state === 'play') {
        // combo
        if (g.combo > 1) {
          ctx.textAlign = 'center';
          ctx.font = 'bold 15px monospace';
          this.glow(ctx, '#ffd25a', 8);
          ctx.fillStyle = '#ffd25a';
          ctx.fillText('x' + g.combo.toFixed(1), W / 2, 10);
          this.noGlow(ctx);
        }
        // stage / wave
        ctx.textAlign = 'right';
        ctx.font = '12px monospace';
        ctx.fillStyle = 'rgba(160,200,255,0.7)';
        ctx.fillText(g.bossActive ? 'STAGE ' + g.stage + ' · BOSS' : 'STAGE ' + g.stage + ' · ' + g.wave + '/' + 5, W - 12, 12);

        // hull pips
        for (let i = 0; i < p.maxHp; i++) {
          ctx.fillStyle = i < p.hp ? '#ff5a7a' : 'rgba(255,90,122,0.18)';
          this.glow(ctx, '#ff5a7a', i < p.hp ? 8 : 0);
          ctx.beginPath();
          const hx = 20 + i * 20, hy = H - 24;
          ctx.moveTo(hx, hy - 4); ctx.bezierCurveTo(hx + 8, hy - 12, hx + 16, hy - 2, hx, hy + 8);
          ctx.bezierCurveTo(hx - 16, hy - 2, hx - 8, hy - 12, hx, hy - 4);
          ctx.fill();
        }
        this.noGlow(ctx);
        // bombs
        for (let i = 0; i < p.bombs; i++) {
          this.glow(ctx, '#ffb84d', 8);
          ctx.fillStyle = '#ffb84d';
          ctx.beginPath(); ctx.arc(W - 20 - i * 18, H - 20, 6, 0, TAU); ctx.fill();
        }
        this.noGlow(ctx);
        // weapon indicator
        const wcol = WEAPONS[p.weapon].color;
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px monospace';
        this.glow(ctx, wcol, 8);
        ctx.fillStyle = wcol;
        ctx.fillText(WEAPONS[p.weapon].name + ' LV' + p.level, W / 2, H - 30);
        this.noGlow(ctx);
        // level pips
        for (let i = 0; i < WEAPONS[p.weapon].maxLv; i++) {
          ctx.fillStyle = i < p.level ? wcol : 'rgba(255,255,255,0.15)';
          ctx.fillRect(W / 2 - 36 + i * 12, H - 14, 9, 4);
        }
      }

      // god mode badge
      if (g.god) {
        ctx.textAlign = 'right';
        ctx.font = 'bold 13px monospace';
        this.glow(ctx, '#ffd25a', 10);
        ctx.fillStyle = '#ffd25a';
        ctx.fillText('★ GOD', W - 12, 30);
        this.noGlow(ctx);
      }

      // banner
      if (g.banner) {
        const a = clamp(Math.min(g.banner.t, 2.2 - g.banner.t) * 2, 0, 1);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center';
        ctx.font = 'bold 30px monospace';
        this.glow(ctx, '#ff4df0', 20);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(g.banner.text, W / 2, H * 0.32);
        this.noGlow(ctx);
        ctx.globalAlpha = 1;
      }

      // boss name + health bar
      const boss = g.enemies.find(e => e.type === 'boss');
      if (boss && boss.y > 0) {
        const frac = clamp(boss.hp / boss.maxHp, 0, 1);
        const bcol = (boss.cfg && boss.cfg.color) || '#ff3b3b';
        ctx.textAlign = 'center';
        ctx.font = 'bold 11px monospace';
        this.glow(ctx, bcol, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText((boss.cfg && boss.cfg.name) || 'DREADNOUGHT', W / 2, 30);
        this.noGlow(ctx);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(40, 46, W - 80, 8);
        this.glow(ctx, bcol, 10);
        ctx.fillStyle = bcol;
        ctx.fillRect(40, 46, (W - 80) * frac, 8);
        this.noGlow(ctx);
      }
      ctx.restore();
    },

    drawMenu(ctx, g) {
      ctx.save();
      ctx.textAlign = 'center';
      const T = g.time;
      const horizon = H * 0.74;

      // --- synthwave sun (sits on the horizon, grid below) ---
      const sunY = horizon - 28, sunR = 54;
      ctx.save();
      ctx.beginPath(); ctx.arc(W / 2, sunY, sunR, 0, TAU); ctx.clip();
      const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
      sg.addColorStop(0, '#ffe98a'); sg.addColorStop(0.5, '#ff9b4d'); sg.addColorStop(1, '#ff4df0');
      ctx.fillStyle = sg; ctx.fillRect(W / 2 - sunR, sunY - sunR, sunR * 2, sunR * 2);
      ctx.fillStyle = '#06040f';
      for (let i = 0; i < 7; i++) { const yy = sunY + 6 + i * 7; ctx.fillRect(W / 2 - sunR, yy, sunR * 2, Math.min(5, 2 + i)); }
      ctx.restore();
      this.glow(ctx, '#ff7b4d', 26);
      ctx.strokeStyle = 'rgba(255,155,90,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(W / 2, sunY, sunR, 0, TAU); ctx.stroke();
      this.noGlow(ctx);

      // --- perspective grid ---
      ctx.strokeStyle = 'rgba(255,77,240,0.5)'; ctx.lineWidth = 1;
      const scroll = (T * 0.4) % 1;
      for (let i = 0; i < 16; i++) {
        const f = (i + scroll) / 16;
        const y = horizon + f * f * (H - horizon);
        ctx.globalAlpha = clamp(0.55 * (1 - f) + 0.05, 0, 0.6);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.globalAlpha = 0.3;
      for (let i = -7; i <= 7; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 9, horizon); ctx.lineTo(W / 2 + i * 72, H); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // --- title: chromatic glow + bob ---
      const ty = H * 0.24 + Math.sin(T * 1.6) * 4;
      ctx.font = 'bold 58px monospace';
      const chroma = (txt, y2, mainGlow, mainCol) => {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#00e5ff'; ctx.fillText(txt, W / 2 - 3, y2);
        ctx.fillStyle = '#ff2fd0'; ctx.fillText(txt, W / 2 + 3, y2);
        this.glow(ctx, mainGlow, 26); ctx.globalAlpha = 1;
        ctx.fillStyle = mainCol; ctx.fillText(txt, W / 2, y2); this.noGlow(ctx);
      };
      chroma('NEON', ty, '#4df3ff', '#eaffff');
      chroma('VOID', ty + 56, '#ff4df0', '#ffe0fb');

      // tagline + hi-score
      ctx.font = 'bold 12px monospace';
      this.glow(ctx, '#ffd25a', 8); ctx.fillStyle = '#ffd98a';
      ctx.fillText('10 STAGES · 10 DREADNOUGHTS · ONE PILOT', W / 2, ty + 90);
      this.noGlow(ctx);
      ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(180,220,255,0.75)';
      ctx.fillText('HI-SCORE  ' + String(g.hiscore).padStart(7, '0'), W / 2, ty + 114);

      // controls (kept above the sun so nothing overlaps)
      ctx.fillStyle = 'rgba(175,205,240,0.6)'; ctx.font = '11px monospace';
      ctx.fillText('MOVE  WASD / ARROWS      FIRE  SPACE      BOMB  X', W / 2, 350);
      ctx.fillText('collect chips to level up · beat a boss to advance', W / 2, 368);

      // blinking prompt
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(T * 5);
      this.glow(ctx, '#7dff4d', 16); ctx.fillStyle = '#c8ffb0';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('PRESS SPACE TO LAUNCH', W / 2, 410);
      this.noGlow(ctx); ctx.globalAlpha = 1;
      ctx.restore();
    },

    drawGameOver(ctx, g) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,2,14,' + clamp(g.overT, 0, 0.6).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';

      this.glow(ctx, '#ff3b3b', 26);
      ctx.fillStyle = '#ffdddd';
      ctx.font = 'bold 44px monospace';
      ctx.fillText('SHIP LOST', W / 2, H * 0.34);
      this.noGlow(ctx);

      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#eaffff';
      ctx.fillText('SCORE  ' + g.score, W / 2, H * 0.46);
      ctx.fillStyle = 'rgba(180,220,255,0.8)';
      ctx.font = '14px monospace';
      ctx.fillText('BEST   ' + g.hiscore + (g.score >= g.hiscore && g.score > 0 ? '  ★ NEW!' : ''), W / 2, H * 0.46 + 26);
      ctx.fillText('STAGE ' + g.stage + '   ·   ' + g.kills + ' KILLS', W / 2, H * 0.46 + 50);

      if (g.overT > 1) {
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(g.overT * 4);
        this.glow(ctx, '#7dff4d', 12);
        ctx.fillStyle = '#c8ffb0';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('PRESS SPACE TO RETRY', W / 2, H * 0.68);
        this.noGlow(ctx);
      }
      ctx.restore();
    },
  };

  // ============================================================
  // SFX — tiny WebAudio synth (browser only)
  // ============================================================
  class Sfx {
    constructor() { this.ctx = null; this.muted = false; }
    ensure() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    tone(freq, dur, type, vol, slide, delay) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
      gn.gain.setValueAtTime(vol || 0.08, t0);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn); gn.connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    }
    noise(dur, vol, delay) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gn = this.ctx.createGain();
      gn.gain.setValueAtTime(vol || 0.12, t0);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(gn); gn.connect(this.ctx.destination);
      src.start(t0);
    }
    play(name) {
      if (!this.ctx || this.muted) return;
      switch (name) {
        case 'shoot': this.tone(880, 0.07, 'square', 0.035, 0.5); break;
        case 'shoot2': this.tone(660, 0.09, 'sawtooth', 0.03, 0.55); break;
        case 'laser': this.tone(1400, 0.06, 'sawtooth', 0.03, 0.3); break;
        case 'missile': this.tone(300, 0.18, 'sawtooth', 0.045, 2.2); this.noise(0.1, 0.03); break;
        case 'hit': this.tone(220, 0.05, 'square', 0.03, 0.7); break;
        case 'boom': this.noise(0.22, 0.14); this.tone(140, 0.2, 'triangle', 0.1, 0.4); break;
        case 'bigBoom': this.noise(0.5, 0.22); this.tone(80, 0.5, 'triangle', 0.16, 0.3); this.tone(55, 0.6, 'sine', 0.14, 0.5, 0.05); break;
        case 'hurt': this.tone(180, 0.25, 'sawtooth', 0.12, 0.4); this.noise(0.2, 0.1); break;
        case 'die': this.noise(0.8, 0.25); this.tone(200, 0.9, 'sawtooth', 0.14, 0.15); break;
        case 'powerup': this.tone(520, 0.09, 'square', 0.06); this.tone(780, 0.09, 'square', 0.06, 1, 0.08); this.tone(1040, 0.14, 'square', 0.06, 1, 0.16); break;
        case 'heal': this.tone(620, 0.12, 'sine', 0.08, 1.4); break;
        case 'shieldUp': this.tone(440, 0.2, 'sine', 0.08, 1.8); break;
        case 'shieldHit': this.tone(900, 0.12, 'sine', 0.09, 0.6); break;
        case 'bomb': this.noise(0.7, 0.24); this.tone(60, 0.8, 'sine', 0.18, 0.6); break;
        case 'wave': this.tone(392, 0.1, 'square', 0.05); this.tone(523, 0.16, 'square', 0.05, 1, 0.1); break;
        case 'boss': this.tone(110, 0.5, 'sawtooth', 0.1, 0.7); this.tone(82, 0.6, 'sawtooth', 0.1, 0.8, 0.3); break;
        case 'bossShoot': this.tone(240, 0.1, 'square', 0.04, 0.8); break;
        case 'start': this.tone(392, 0.1, 'square', 0.06); this.tone(523, 0.1, 'square', 0.06, 1, 0.09); this.tone(659, 0.1, 'square', 0.06, 1, 0.18); this.tone(784, 0.2, 'square', 0.07, 1, 0.27); break;
      }
    }

    // ---------- procedural music (arcade / synthwave loop) ----------
    _mnote(freq, when, dur, type, vol, glide) {
      if (!this.ctx || this.muted) return;
      const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, when);
      if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(30, glide), when + dur);
      gn.gain.setValueAtTime(0.0001, when);
      gn.gain.exponentialRampToValueAtTime(vol, when + 0.012);
      gn.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(gn); gn.connect(this._mgain);
      o.start(when); o.stop(when + dur + 0.03);
    }
    _mkick(when) {
      if (!this.ctx || this.muted) return;
      const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, when); o.frequency.exponentialRampToValueAtTime(45, when + 0.12);
      gn.gain.setValueAtTime(0.26, when); gn.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      o.connect(gn); gn.connect(this._mgain); o.start(when); o.stop(when + 0.18);
    }
    _mhat(when, vol) {
      if (!this.ctx || this.muted) return;
      const n = Math.floor(this.ctx.sampleRate * 0.03), buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const gn = this.ctx.createGain(); gn.gain.setValueAtTime(vol || 0.05, when); gn.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
      src.connect(hp); hp.connect(gn); gn.connect(this._mgain); src.start(when);
    }
    startMusic(mode) {
      this.ensure();
      if (!this.ctx) return;
      this.musicMode = mode;
      if (!this._mgain) { this._mgain = this.ctx.createGain(); this._mgain.gain.value = 0.5; this._mgain.connect(this.ctx.destination); }
      if (this.musicOn) return;      // already looping — mode swap takes effect next bar
      this.musicOn = true; this._bar = 0;
      this._barTime = this.ctx.currentTime + 0.12;
      this._scheduleBar();
    }
    stopMusic() { this.musicOn = false; if (this._mtimer) { clearTimeout(this._mtimer); this._mtimer = null; } }
    _scheduleBar() {
      if (!this.musicOn || !this.ctx) return;
      const game = this.musicMode === 'game';
      const bpm = game ? 148 : 118;
      const step = 60 / bpm / 4; // 16th notes
      const prog = game
        ? [[110, 1], [97.999, 0], [87.307, 0], [82.407, 1]]   // Am · G · F · E(min)
        : [[110, 1], [87.307, 0], [130.813, 0], [97.999, 0]]; // Am · F · C · G
      const ch = prog[this._bar % prog.length], root = ch[0], min = ch[1];
      const third = root * (min ? 1.18921 : 1.259921), fifth = root * 1.498307;
      const arp = [root * 2, third * 2, fifth * 2, third * 2, root * 2, fifth * 2, third * 4, fifth * 2];
      const t0 = this._barTime;
      for (let s = 0; s < 16; s++) {
        const when = t0 + s * step;
        if (s % 4 === 0) { this._mnote(root, when, step * 3.4, 'sawtooth', 0.14, root * 0.98); this._mkick(when); }
        if (s % 2 === 0) this._mnote(arp[(s / 2) % arp.length], when, step * 1.5, 'square', game ? 0.06 : 0.05);
        this._mhat(when, s % 2 ? 0.05 : 0.03);
        if (game && s % 8 === 4) this._mnote(root * 3, when, step * 2, 'triangle', 0.05);
      }
      if (!game) { const mel = [fifth * 4, root * 4, third * 4, fifth * 4]; this._mnote(mel[this._bar % mel.length], t0 + step * 8, step * 6, 'triangle', 0.06); }
      this._bar++; this._barTime += step * 16;
      const aheadMs = (this._barTime - this.ctx.currentTime) * 1000 - 80;
      this._mtimer = setTimeout(() => this._scheduleBar(), Math.max(15, aheadMs));
    }
  }

  // ============================================================
  // Browser bootstrap
  // ============================================================
  function boot() {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const sfx = new Sfx();

    let hiscore = 0;
    try { hiscore = parseInt(localStorage.getItem('neonvoid_hi') || '0', 10) || 0; } catch (e) {}

    const game = new Game({
      sfx,
      hiscore,
      onHiscore(v) { try { localStorage.setItem('neonvoid_hi', String(v)); } catch (e) {} },
    });

    const input = { left: false, right: false, up: false, down: false, fire: false, bomb: false };
    let paused = false, musicState = null;

    const keymap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      Space: 'fire', KeyJ: 'fire',
      KeyX: 'bomb', KeyK: 'bomb',
    };
    window.addEventListener('keydown', (ev) => {
      sfx.ensure();
      if (ev.code === 'KeyP' && game.state === 'play') { paused = !paused; return; }
      if (ev.code === 'KeyM') { sfx.muted = !sfx.muted; return; }
      // --- test cheats ---
      if (ev.code === 'KeyG') {
        game.god = !game.god;
        game.floaters.push({ x: W / 2, y: H * 0.45, text: game.god ? 'GOD MODE ON' : 'GOD MODE OFF', t: 1.2, color: '#ffd25a' });
        return;
      }
      if (game.state === 'play') {
        const wkeys = { Digit1: 'blaster', Digit2: 'spread', Digit3: 'laser', Digit4: 'missile' };
        if (wkeys[ev.code]) { game.player.weapon = wkeys[ev.code]; return; }
        if (ev.code === 'KeyU') { game.player.level = Math.min(6, game.player.level + 1); return; }
        if (ev.code === 'KeyB' && !game.bossActive) { game.spawnBoss(); return; }
        if (ev.code === 'KeyH') { game.player.hp = game.player.maxHp; game.player.shield = 3; game.player.bombs = 5; return; }
      }
      const k = keymap[ev.code];
      if (k) { input[k] = true; ev.preventDefault(); }
    });
    window.addEventListener('keyup', (ev) => {
      const k = keymap[ev.code];
      if (k) { input[k] = false; ev.preventDefault(); }
    });
    window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
    // Unlock audio (and start menu music) on a click that doesn't launch the game.
    canvas.addEventListener('pointerdown', () => sfx.ensure());

    // scale canvas to fit window while keeping aspect
    function fit() {
      const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      canvas.style.width = Math.floor(W * scale) + 'px';
      canvas.style.height = Math.floor(H * scale) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();

    let last = performance.now();
    function frame(now) {
      let dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!paused) game.update(dt, input);
      // Arcade music follows game state once a gesture has unlocked audio.
      if (sfx.ctx && sfx.ctx.state === 'running') {
        const ms = game.state === 'play' ? 'game' : 'menu';
        if (ms !== musicState) { musicState = ms; sfx.startMusic(ms); }
      }
      Render.draw(ctx, game, paused ? 0 : dt);
      if (paused) {
        ctx.save();
        ctx.fillStyle = 'rgba(4,2,14,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#eaffff';
        ctx.font = 'bold 30px monospace';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.font = '13px monospace';
        ctx.fillStyle = 'rgba(180,220,255,0.8)';
        ctx.fillText('press P to resume', W / 2, H / 2 + 30);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // expose for smoke tests
    window.__game = game;
    window.__input = input;
    window.__sfx = sfx;
  }

  // exports
  const api = { Game, Render, WEAPONS, ENEMY_TYPES, W, H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.NeonVoid = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
