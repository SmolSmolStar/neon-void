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
    spread:  { name: 'SPREAD',  color: '#ffd94d', maxLv: 6 },
    laser:   { name: 'LASER',   color: '#ff4df0', maxLv: 6 },
    missile: { name: 'MISSILE', color: '#d08cff', maxLv: 6 },
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
    { name: 'DREADNOUGHT OMEGA',   color: '#ff3b3b', bullet: '#ff7b5a', hpMul: 1.75, r: 80, move: 'teleport', phases: ['spiral', 'cross', 'fan', 'ring'], arms: 6, phaseTime: 3.3, final: true },
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
      this.onWin = opts.onWin || function () {};
      this.haptic = opts.haptic || function () {}; // mobile vibration (no-op elsewhere)
      this.cleared = !!opts.cleared; // lifetime "beat all 10 stages" achievement
      this.state = 'menu'; // menu | play | over
      this.time = 0;
      this.reset();
    }

    reset() {
      this.player = {
        x: W / 2, y: H - 90, r: 11, hp: 3, maxHp: 5, // start 3 hearts, heal up to 5
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
      this.victoryT = 0;
      this._chip1 = null;      // last two weapon-chip types (anti-streak guard)
      this._chip2 = null;
      this.usedCheats = false; // tainted runs never submit to the leaderboard
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
      if (this.god) this.usedCheats = true; // god left on from a previous run
      this.announce('STAGE 1');
      this.sfx.play('start');
    }

    // Smooth, mostly stage-driven ramp. Gentle in stage 1 so players survive to
    // the first boss; scales up steadily across the 10 stages (then endless).
    difficulty() {
      return 1 + (this.stage - 1) * 0.42 + (this.wave - 1) * 0.05 + this.time * 0.0022;
    }

    // Weapon power is gated by progression: the level cap rises as you clear
    // stages (3,3,4,4,5,5,6...) so there is always a next unlock to work toward.
    weaponLevelCap() {
      return Math.min(6, Math.ceil(this.stage / 2) + 2);
    }

    // Where the next weapon-cap unlock happens (null once cap is maxed) — used
    // to tell the player exactly what to aim for ("LV4 UNLOCKS AT STAGE 3").
    nextCapInfo() {
      const cur = this.weaponLevelCap();
      if (cur >= 6) return null;
      let s = this.stage + 1;
      while (Math.min(6, Math.ceil(s / 2) + 2) <= cur) s++;
      return { stage: s, level: cur + 1 };
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
      if (this.state === 'victory') {
        // a breather after the 10-stage campaign: the arena is frozen and safe;
        // fireworks play until the player opts into endless mode
        this.time += dt;
        this.victoryT = Math.max(this.victoryT, 1); // keep celebrating while paused
        this.updateParticles(dt);
        if (Math.random() < 0.25)
          this.burst(rand(60, W - 60), rand(70, H * 0.5), 14, ['#ffd25a', '#4df3ff', '#ff4df0', '#7dff4d'][randi(0, 3)]);
        if (firePressed && this.time - this._victoryAt > 1) {
          this.state = 'play';
          this.victoryT = 3; // a last sparkle as endless begins
          this.spawnT = 1.5; this.waveT = 0;
          this.announce('∞ ENDLESS · STAGE ' + this.stage);
          this.sfx.play('wave');
        }
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

      // victory fireworks
      if (this.victoryT > 0) {
        this.victoryT -= dt;
        if (Math.random() < 0.3) {
          this.burst(rand(60, W - 60), rand(70, H * 0.5), 18, ['#ffd25a', '#4df3ff', '#ff4df0', '#7dff4d'][randi(0, 3)]);
        }
      }
    }

    // ---------- player ----------
    updatePlayer(dt, input) {
      const p = this.player;
      if (!p.alive) return;
      if (input.dragActive) {
        // touch / mouse drag: the ship follows the finger 1:1 (relative drag)
        const nx = clamp(input.tx, p.r + 4, W - p.r - 4);
        const ny = clamp(input.ty, H * 0.35, H - p.r - 6);
        input.tx = nx; input.ty = ny;
        p.tilt = lerp(p.tilt, clamp((nx - p.x) * 0.05, -0.4, 0.4), 1 - Math.pow(0.001, dt));
        p.x = nx; p.y = ny;
      } else {
        const sp = 320;
        let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
        p.x = clamp(p.x + dx * sp * dt, p.r + 4, W - p.r - 4);
        p.y = clamp(p.y + dy * sp * dt, H * 0.35, H - p.r - 6);
        p.tilt = lerp(p.tilt, dx * 0.35, 1 - Math.pow(0.001, dt));
      }
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

      // Every level makes a clear difference: smooth +damage per level, bullets
      // grow, and the bullet-count jumps stay as the big milestone moments.
      switch (p.weapon) {
        case 'blaster': {
          p.fireCd = Math.max(0.07, 0.16 - lv * 0.012);
          const dmg = 1 + (lv - 1) * 0.5;
          const r = 4 + lv * 0.5;
          const barrels = lv < 3 ? 1 : lv < 5 ? 2 : 3;
          if (barrels === 1) B(p.x, p.y - 14, 0, -640, dmg, { r });
          else if (barrels === 2) { B(p.x - 7, p.y - 10, 0, -650, dmg, { r }); B(p.x + 7, p.y - 10, 0, -650, dmg, { r }); }
          else { B(p.x - 9, p.y - 8, 0, -660, dmg, { r }); B(p.x + 9, p.y - 8, 0, -660, dmg, { r }); B(p.x, p.y - 18, 0, -720, dmg + 1, { r: r + 1 }); }
          this.sfx.play('shoot', lv);
          break;
        }
        case 'spread': {
          p.fireCd = Math.max(0.11, 0.24 - lv * 0.014);
          const n = Math.min(3 + (lv - 1), 8);
          // tighter fan: higher levels add pellets without spraying so wide
          // that single targets (bosses!) become unhittable
          const arc = 0.26 + n * 0.028;
          const dmg = 1 + (lv - 1) * 0.22;
          const r = 3.5 + lv * 0.35;
          for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (n === 1 ? 0 : (i / (n - 1) - 0.5) * arc);
            B(p.x, p.y - 12, Math.cos(a) * 560, Math.sin(a) * 560, dmg, { r });
          }
          this.sfx.play('shoot2', lv);
          break;
        }
        case 'laser': {
          p.fireCd = Math.max(0.05, 0.11 - lv * 0.008);
          const dmg = 1 + lv * 0.4;
          const r = 3 + lv * 0.4;
          B(p.x, p.y - 18, 0, -980, dmg, { r, pierce: 1 + Math.floor(lv / 2), trail: true });
          if (lv >= 4) { B(p.x - 10, p.y - 8, 0, -980, dmg * 0.6, { r: r * 0.8, pierce: 1, trail: true }); B(p.x + 10, p.y - 8, 0, -980, dmg * 0.6, { r: r * 0.8, pierce: 1, trail: true }); }
          this.sfx.play('laser', lv);
          break;
        }
        case 'missile': {
          p.fireCd = Math.max(0.16, 0.34 - lv * 0.03);
          const dmg = 2 + lv * 0.95;
          const r = 5 + lv * 0.4;
          const n = lv >= 3 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const off = n === 1 ? 0 : (i === 0 ? -12 : 12);
            B(p.x + off, p.y - 8, off * 8, -300, dmg, { r, homing: 3.2 + lv * 0.35, splash: 46 + lv * 4, trail: true });
          }
          if (lv >= 5) B(p.x, p.y - 16, 0, -320, dmg, { r, homing: 4.2, splash: 46 + lv * 4, trail: true });
          this.sfx.play('missile', lv);
          break;
        }
      }
      // muzzle flash grows a touch with level
      const mf = 2 + Math.floor(lv / 2);
      for (let i = 0; i < mf; i++)
        this.particles.push(part(p.x + rand(-4, 4), p.y - 16, rand(-40, 40), rand(-120, -60), 0.12, rand(2, 3.5), WEAPONS[p.weapon].color, 'spark'));
    }

    useBomb() {
      const p = this.player;
      p.bombs--;
      this.haptic([40, 30, 80]);
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
        this.haptic(25);
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
      this.haptic(50);
      if (p.hp <= 0) this.killPlayer();
    }

    killPlayer() {
      const p = this.player;
      p.alive = false;
      this.haptic([90, 50, 160]);
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
      const cap = 6 + this.stage * 3;   // higher ceiling so later stages pressure
      if (this.spawnT <= 0 && this.enemies.length < cap) {
        // Formations arrive larger and more often as stages advance; the 5th
        // wave is a crescendo assault right before the boss.
        const crescendo = this.wave >= WAVES_PER_STAGE ? 0.5 : 0;
        this.spawnT = Math.max(1.05, 2.8 - this.stage * 0.14 - (this.wave - 1) * 0.1 - crescendo) * rand(0.85, 1.15);
        this.spawnFormation(d);
      }
    }

    // Build one enemy at (x, y), scaled to difficulty d.
    mkEnemy(type, x, y, d) {
      const t = ENEMY_TYPES[type];
      const e = {
        type, x, y, r: t.r,
        hp: Math.ceil(t.hp * (0.8 + d * 0.24)), maxHp: 0, // snappy kills; density carries the pressure
        color: t.color, score: t.score, dropChance: t.drop,
        t: rand(0, TAU), fireT: rand(0.8, 2.4), hitT: 0,
        vx: 0, vy: 0, baseX: x, spd: (0.85 + d * 0.055),
      };
      e.maxHp = e.hp;
      this.enemies.push(e);
      return e;
    }

    // Stage-weighted random enemy type (progressive roster).
    pickType() {
      if (this.stage <= 1) return Math.random() < 0.6 ? 'darter' : 'drone';
      const roster = ['darter', 'drone', 'weaver'];
      if (this.stage >= 3) roster.push('splitter');
      if (this.stage >= 4) roster.push('tank');
      const weights = roster.map((tp) => tp === 'tank' ? 0.5 + this.stage * 0.07 : tp === 'splitter' ? 0.7 : tp === 'weaver' ? 1.0 : 1.4);
      const tot = weights.reduce((a, b) => a + b, 0);
      let acc = Math.random() * tot;
      for (let i = 0; i < roster.length; i++) { acc -= weights[i]; if (acc <= 0) return roster[i]; }
      return roster[0];
    }

    // Back-compat single spawn (used by tests).
    spawnEnemy(d) { this.mkEnemy(this.pickType(), rand(40, W - 40), -30, d); }

    // Coordinated formations that grow + quicken with the stage.
    spawnFormation(d) {
      const s = this.stage;
      const kinds = ['line', 'stream'];
      if (s >= 2) kinds.push('vee', 'swarm');
      if (s >= 3) kinds.push('flank', 'escort');
      const kind = kinds[randi(0, kinds.length - 1)];
      const basic = () => (s >= 2 && Math.random() < 0.5) ? 'weaver' : (Math.random() < 0.6 ? 'darter' : 'drone');
      switch (kind) {
        case 'line': {              // a row sweeping down together
          const n = 2 + Math.floor(s / 2), type = basic();
          for (let i = 0; i < n; i++) this.mkEnemy(type, 46 + (i + 0.5) * (W - 92) / n, -30, d);
          break;
        }
        case 'stream': {            // a conga line pouring from one column
          const n = 3 + Math.floor(s / 2), x = rand(70, W - 70), type = basic();
          for (let i = 0; i < n; i++) this.mkEnemy(type, x, -30 - i * 46, d);
          break;
        }
        case 'vee': {               // arrowhead formation
          const n = 2 + Math.floor(s / 3);
          this.mkEnemy('drone', W / 2, -30, d);
          for (let i = 1; i <= n; i++) { this.mkEnemy('drone', W / 2 - i * 34, -30 - i * 24, d); this.mkEnemy('drone', W / 2 + i * 34, -30 - i * 24, d); }
          break;
        }
        case 'flank': {             // pincer from both edges
          const n = 2 + Math.floor(s / 3);
          for (let i = 0; i < n; i++) { this.mkEnemy('weaver', 34, -30 - i * 42, d); this.mkEnemy('weaver', W - 34, -30 - i * 42, d); }
          break;
        }
        case 'swarm': {             // a fast cloud of light enemies
          const n = 3 + s;
          for (let i = 0; i < n; i++) this.mkEnemy(Math.random() < 0.7 ? 'darter' : 'drone', rand(40, W - 40), -30 - rand(0, 130), d);
          break;
        }
        case 'escort': {            // a tank shielded by drones, aimed at you
          this.mkEnemy('tank', clamp(this.player.x + rand(-80, 80), 60, W - 60), -44, d);
          const n = 2 + Math.floor(s / 3);
          for (let i = 0; i < n; i++) this.mkEnemy('drone', rand(50, W - 50), -30 - i * 20, d);
          break;
        }
      }
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

    spawnMini(x) {
      // a scaled-down dreadnought escort — modest HP, guaranteed drop
      this.enemies.push({
        type: 'mini', x, y: -40, r: 26,
        hp: 340, maxHp: 340, color: '#ff6b6b', score: 2500, dropChance: 1,
        t: rand(0, TAU), fireT: rand(1.4, 2.2), hitT: 0,
        vx: 0, vy: 0, baseX: x, spd: 1, dir: Math.random() < 0.5 ? -1 : 1,
      });
    }

    spawnBoss() {
      this.bossActive = true;
      const cfg = BOSSES[(this.stage - 1) % STAGES];
      this.announce('!! ' + cfg.name + ' !!');
      this.sfx.play('boss');
      const hp = Math.round((300 + this.stage * 230) * cfg.hpMul);
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
          case 'mini':
            if (e.y < 195) e.y += 85 * dt;
            else {
              e.x += e.dir * 70 * dt;
              if (e.x < e.r + 8) { e.x = e.r + 8; e.dir = 1; }
              if (e.x > W - e.r - 8) { e.x = W - e.r - 8; e.dir = -1; }
            }
            break;
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
        case 'mini':
          e.fireT = rand(2.0, 3.0);
          aimAt(0.06, bs * 0.95);
          aimAt(0.32, bs * 0.85);
          break;
      }
    }

    // Movement per boss.cfg.move + phase cycling + enrage as HP drops.
    updateBoss(e, dt, d) {
      const cfg = e.cfg;
      const entryY = cfg.final ? 140 : 105; // the huge final boss sits lower
      if (!e.entered) {
        e.y += 70 * dt;
        if (e.y >= entryY) { e.y = entryY; e.entered = true; }
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
      if (cfg.final) e.y += 35; // keep the oversized final boss clear of the HP bar
      e.x = clamp(e.x, e.r + 4, W - e.r - 4);

      // OMEGA phase reinforcements: escorts at 66% and 33% HP — intensity
      // spikes with guaranteed drops, so the fight spices up but stays fair.
      if (cfg.final) {
        e.minis = e.minis || 0;
        const hf2 = e.hp / e.maxHp;
        if ((e.minis === 0 && hf2 < 0.66) || (e.minis === 2 && hf2 < 0.33)) {
          this.spawnMini(clamp(e.x - 150, 40, W - 40));
          this.spawnMini(clamp(e.x + 150, 40, W - 40));
          e.minis += 2;
          this.floaters.push({ x: W / 2, y: H * 0.4, text: '⚠ ESCORTS DEPLOYED ⚠', t: 1.5, color: '#ff8c5a' });
          this.sfx.play('boss');
        }
      }
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
        // stage-clear bonus: visible payoff for progressing (scales with stage)
        const clearBonus = 1500 * this.stage;
        this.score += clearBonus;
        this.floaters.push({ x: W / 2, y: H * 0.5, text: 'STAGE CLEAR +' + clearBonus, t: 1.8, color: '#ffd25a' });
        const capBefore = this.weaponLevelCap();
        this.stage++;
        const capAfter = this.weaponLevelCap();
        if (capAfter > capBefore) {
          // celebrate the unlock so the cap system teaches itself
          this.floaters.push({ x: W / 2, y: H * 0.58, text: 'WEAPON CAP RAISED — LV' + capAfter + ' UNLOCKED!', t: 2.2, color: '#7dff4d' });
          this.sfx.play('levelup', capAfter);
        }
        this.wave = 1;
        this.flash = 1;
        this.shake = 30;
        this.haptic([25, 30, 25, 30, 70]);
        if (this.stage > STAGES && !this.won) {
          // Cleared all stages — pause into a victory screen (a breather);
          // the player presses fire to opt into endless mode.
          this.won = true;
          this.cleared = true;
          this.victoryT = 8;
          this.state = 'victory';
          this._victoryAt = this.time;
          this.sfx.play('victory');
          this.onWin();
          this.player.hp = this.player.maxHp;
          this.player.bombs = Math.min(this.player.bombs + 2, 6);
          this.burst(W / 2, H * 0.4, 90, '#ffd25a');
          this.burst(W / 2, H * 0.4, 40, '#ffffff');
        } else {
          this.announce((this.stage > STAGES ? '∞ ENDLESS · STAGE ' : 'STAGE ') + this.stage);
        }
        // shower of drops as a reward
        for (let i = 0; i < 5; i++) this.spawnDrop(e.x + rand(-60, 60), e.y + rand(-30, 30), true);
        // clear enemy bullets as reward
        this.ebullets.length = 0;
      } else if (e.type === 'mini') {
        // escorts drop supportive items only — a lifeline mid-boss-fight,
        // never a weapon chip that baits you into switching off your build
        const roll = Math.random();
        this.drops.push({ x: e.x, y: e.y, vy: 60, kind: roll < 0.45 ? 'heal' : roll < 0.75 ? 'shield' : 'bomb', t: 0, r: 12 });
      } else if (Math.random() < e.dropChance || this.killsSinceDrop >= 6) {
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
        // Mild bias toward the current weapon (steady leveling) while keeping
        // real variety — other weapons appear often enough to plan switches.
        let w;
        if (Math.random() < 0.4) w = this.player.weapon;
        else { const others = WEAPON_KEYS.filter((k) => k !== this.player.weapon); w = others[randi(0, others.length - 1)]; }
        // anti-streak: never the same weapon chip three times in a row
        if (w === this._chip1 && w === this._chip2) {
          const alts = WEAPON_KEYS.filter((k) => k !== w);
          w = alts[randi(0, alts.length - 1)];
        }
        this._chip2 = this._chip1; this._chip1 = w;
        kind = 'weapon:' + w;
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
        // magnet: a gentle chase — chips trail behind (260 vs your 320), so
        // there's real time to kite/reposition the ones you don't want. When
        // the player is actively PULLING AWAY the chase budget drains 4x
        // faster, so a deliberate retreat dumps an unwanted chip in ~0.45s
        // even in late-stage bullet storms. Never relentless.
        d.magT = d.magT || 0;
        const dNow = dist2(d.x, d.y, p.x, p.y);
        if (p.alive && d.magT < 1.8 && dNow < 120 * 120) {
          d.magT += (d.pd != null && dNow > d.pd) ? dt * 4 : dt;
          const a = Math.atan2(p.y - d.y, p.x - d.x);
          d.x += Math.cos(a) * 260 * dt;
          d.y += Math.sin(a) * 260 * dt;
        } else {
          d.y += d.vy * dt;
          d.x += Math.sin(d.t * 3) * 20 * dt;
        }
        // post-move distance: next frame's comparison then isolates PLAYER
        // motion (updatePlayer runs before updateDrops) = true retreat intent
        d.pd = dist2(d.x, d.y, p.x, p.y);
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
      this.sfx.play('collect'); // bright "grabbed it" chime on every pickup
      if (d.kind.startsWith('weapon:')) {
        const w = d.kind.slice(7);
        color = WEAPONS[w].color;
        if (w === p.weapon) {
          // your weapon's chip → level it up (celebration), gated by the stage cap
          const cap = this.weaponLevelCap();
          if (p.level < cap) {
            p.level++;
            label = WEAPONS[w].name + ' LV' + p.level;
            this.flash = Math.max(this.flash, 0.5);
            this.shake = Math.max(this.shake, 7);
            this.burst(p.x, p.y, 28, color);
            this.burst(p.x, p.y, 10, '#ffffff');
            this.floaters.push({ x: p.x, y: p.y - 44, text: 'LEVEL ' + p.level + '!', t: 1.0, color });
            this.sfx.play('levelup', p.level);
          } else if (p.level >= WEAPONS[w].maxLv) {
            this.score += 500;
            label = WEAPONS[w].name + ' MAX +500';
            this.sfx.play('powerup');
          } else {
            this.score += 250;
            label = 'LV CAP +250';
            // quiet hint only — a big banner here would stomp the STAGE announce
            // (boss drop-showers are collected right at stage transitions)
            const nxt = this.nextCapInfo();
            if (nxt) this.floaters.push({ x: p.x, y: p.y - 44, text: 'LV' + nxt.level + ' UNLOCKS AT STAGE ' + nxt.stage, t: 1.4, color: '#8fb2cf' });
            this.sfx.play('powerup');
          }
        } else {
          // a different weapon → switch to it (keep your level). A tactical
          // commitment: grab it only if that weapon suits the moment.
          p.weapon = w;
          label = '▶ ' + WEAPONS[w].name + ' LV' + p.level;
          this.burst(p.x, p.y, 14, color);
          this.sfx.play('powerup');
        }
      } else if (d.kind === 'heal') {
        if (p.hp < p.maxHp) { p.hp++; label = '+1 HULL'; }
        else { this.score += 300; label = '+300'; }
        color = '#7dff4d';
        this.sfx.play('heal');
      } else if (d.kind === 'shield') {
        const before = p.shield;
        p.shield = Math.min(3, p.shield + 1);
        label = before === p.shield ? 'SHIELD FULL' : 'SHIELD x' + p.shield;
        color = '#4dc3ff';
        this.sfx.play('shieldUp');
      } else if (d.kind === 'bomb') {
        const before = p.bombs;
        p.bombs = Math.min(5, p.bombs + 1);
        label = before === p.bombs ? 'BOMB FULL' : 'BOMB x' + p.bombs;
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
        // proximity fuse: homing missiles that fail to connect (e.g. orbiting a
        // teleporting boss) self-detonate after 3s, applying their splash
        if (b.homing) {
          b.age = (b.age || 0) + dt;
          if (b.age > 3) {
            if (b.splash) {
              for (let k = this.enemies.length - 1; k >= 0; k--) {
                const e2 = this.enemies[k];
                if (e2.y > -e2.r && dist2(b.x, b.y, e2.x, e2.y) < b.splash * b.splash) this.damageEnemy(e2, b.dmg * 0.75);
              }
              this.burst(b.x, b.y, 8, '#ffb84d');
            }
            this.bullets.splice(i, 1);
            continue;
          }
        }
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
          if (b.hitList && b.hitList.indexOf(e) !== -1) continue; // pierced through already — no re-hit "drilling"
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
            if (b.pierce > 0) { b.pierce--; (b.hitList = b.hitList || []).push(e); }
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
  // Per-stage ambience: the void's gradient + nebula tints drift subtly as the
  // player progresses (loosely foreshadowing each stage's boss hue). Endless
  // mode cycles the set. Transitions hide under the stage-clear flash.
  const STAGE_BG = [
    { top: '#060312', mid: '#0a0620', bot: '#120a2e', neb: ['rgba(80,40,160,', 'rgba(20,80,160,'] },   // 1 · classic violet
    { top: '#070311', mid: '#0c0720', bot: '#1a0d26', neb: ['rgba(80,40,160,', 'rgba(170,90,40,'] },   // 2 · ember drift
    { top: '#070410', mid: '#0d0a1e', bot: '#1c1424', neb: ['rgba(90,50,150,', 'rgba(160,130,40,'] },  // 3 · gold haze
    { top: '#040510', mid: '#081120', bot: '#0a2022', neb: ['rgba(40,90,150,', 'rgba(40,150,90,'] },   // 4 · verdant deep
    { top: '#03060f', mid: '#071522', bot: '#0a1e2c', neb: ['rgba(50,80,170,', 'rgba(40,160,170,'] },  // 5 · teal current
    { top: '#040414', mid: '#080d26', bot: '#0a1432', neb: ['rgba(70,50,180,', 'rgba(40,90,190,'] },   // 6 · blue abyss
    { top: '#030512', mid: '#061524', bot: '#082032', neb: ['rgba(50,70,180,', 'rgba(50,160,200,'] },  // 7 · cyan trench
    { top: '#070314', mid: '#0e0726', bot: '#180c34', neb: ['rgba(90,40,180,', 'rgba(130,70,210,'] },  // 8 · violet storm
    { top: '#090312', mid: '#140724', bot: '#220c2c', neb: ['rgba(140,40,150,', 'rgba(200,60,140,'] }, // 9 · rose nebula
    { top: '#0a0208', mid: '#160512', bot: '#260810', neb: ['rgba(150,40,90,', 'rgba(190,45,50,'] },   // 10 · crimson void
  ];

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
      for (let i = 0; i < 5; i++) {
        this.nebulae.push({ x: rand(0, W), y: rand(0, H), r: rand(120, 260), ci: randi(0, 1), sp: rand(6, 14) });
      }
    },

    draw(ctx, g, dt) {
      if (!this.stars) this.initBackdrop();
      const t = g.time;
      const pal = STAGE_BG[((g.stage || 1) - 1) % STAGE_BG.length];

      // background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, pal.top);
      bg.addColorStop(0.55, pal.mid);
      bg.addColorStop(1, pal.bot);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // nebulae (tinted by the stage palette)
      for (const n of this.nebulae) {
        n.y += n.sp * dt;
        if (n.y - n.r > H) { n.y = -n.r; n.x = rand(0, W); }
        const c = pal.neb[n.ci % pal.neb.length];
        const gr = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
        gr.addColorStop(0, c + '0.16)');
        gr.addColorStop(1, c + '0)');
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
      if (g.player.alive && (g.state === 'play' || g.state === 'victory')) this.drawPlayer(ctx, g);
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
      if (g.state === 'victory') this.drawVictory(ctx, g);
    },

    glow(ctx, color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; },
    noGlow(ctx) { ctx.shadowBlur = 0; },

    drawPlayer(ctx, g) {
      const p = g.player;

      // streak halo — a glow that grows and shifts cyan → gold as the combo climbs
      if (g.combo >= 2) {
        const s = clamp((g.combo - 2) / 6, 0, 1);
        const r = 22 + s * 16 + Math.sin(g.time * 8) * 2;
        const hue = Math.round(lerp(190, 45, s));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grd = ctx.createRadialGradient(p.x, p.y, r * 0.35, p.x, p.y, r);
        grd.addColorStop(0, 'hsla(' + hue + ',100%,70%,' + (0.12 + s * 0.3).toFixed(2) + ')');
        grd.addColorStop(1, 'hsla(' + hue + ',100%,60%,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        if (g.combo >= 4) {
          ctx.strokeStyle = 'hsla(' + hue + ',100%,78%,' + (0.28 + s * 0.4).toFixed(2) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }

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
          case 'mini': {
            // a pocket dreadnought — same hull silhouette, half scale
            ctx.rotate(Math.sin(e.t * 1.1) * 0.08);
            const msc = e.r / 52;
            ctx.scale(msc, msc);
            ctx.beginPath();
            ctx.moveTo(0, 46); ctx.lineTo(-30, 26); ctx.lineTo(-52, -4); ctx.lineTo(-30, -34);
            ctx.lineTo(30, -34); ctx.lineTo(52, -4); ctx.lineTo(30, 26);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#5a0f0f';
            ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#ff8c4d';
            ctx.beginPath(); ctx.arc(0, 0, 10 + Math.sin(e.t * 6) * 2, 0, TAU); ctx.fill();
            break;
          }
          case 'boss': {
            ctx.rotate(Math.sin(e.t * 0.7) * 0.06);
            // scale the artwork to the boss's radius (the final boss is much larger)
            const bsc = e.r / 52;
            ctx.scale(bsc, bsc);
            const isFinal = !!(e.cfg && e.cfg.final);
            if (isFinal) {
              // OMEGA only: rotating gold blade-ring so the end boss reads instantly
              ctx.save();
              ctx.rotate(e.t * 0.5);
              this.glow(ctx, '#ffd25a', 22);
              ctx.strokeStyle = flash ? '#fff' : 'rgba(255,210,90,0.85)';
              ctx.lineWidth = 4;
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * TAU;
                ctx.beginPath(); ctx.arc(0, 0, 62, a, a + 0.62); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * 58, Math.sin(a) * 58);
                ctx.lineTo(Math.cos(a) * 74, Math.sin(a) * 74);
                ctx.stroke();
              }
              ctx.restore();
              this.glow(ctx, e.color, 18);
              ctx.fillStyle = flash ? '#ffffff' : e.color;
            }
            // main hull
            ctx.beginPath();
            ctx.moveTo(0, 46); ctx.lineTo(-30, 26); ctx.lineTo(-52, -4); ctx.lineTo(-30, -34);
            ctx.lineTo(30, -34); ctx.lineTo(52, -4); ctx.lineTo(30, 26);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : '#5a0f0f';
            ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
            ctx.fillStyle = flash ? '#fff' : (isFinal ? '#ffd25a' : '#ff8c4d');
            ctx.beginPath(); ctx.arc(0, 0, (isFinal ? 12 : 10) + Math.sin(e.t * 5) * 2, 0, TAU); ctx.fill();
            // turrets
            ctx.fillStyle = flash ? '#fff' : '#8c1f1f';
            ctx.beginPath(); ctx.arc(-34, 12, 8, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(34, 12, 8, 0, TAU); ctx.fill();
            break;
          }
        }
        this.noGlow(ctx);
        ctx.restore();

        // health bar for tanks + minis (boss uses the big top bar)
        if ((e.type === 'tank' || e.type === 'mini') && e.hp < e.maxHp) {
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
        else if (d.kind === 'shield') { color = '#4dc3ff'; label = '◈'; }
        else if (d.kind === 'bomb') { color = '#ffb84d'; label = '✸'; }

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
        const stg = (g.stage > 10 ? '∞ ENDLESS S' : 'STAGE ') + g.stage;
        ctx.fillText(g.bossActive ? stg + ' · BOSS' : stg + ' · ' + g.wave + '/' + 5, W - 12, 12);

        // hull hearts — labelled, filled = bright, empty slots outlined so it
        // is obvious how much health you have (and how many you can still gain).
        this.noGlow(ctx);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = 'rgba(255,150,170,0.75)';
        ctx.fillText('HULL', 14, H - 40);
        for (let i = 0; i < p.maxHp; i++) {
          const hx = 24 + i * 26, hy = H - 22, filled = i < p.hp;
          ctx.beginPath();
          ctx.moveTo(hx, hy - 5); ctx.bezierCurveTo(hx + 10, hy - 15, hx + 20, hy - 2, hx, hy + 9);
          ctx.bezierCurveTo(hx - 20, hy - 2, hx - 10, hy - 15, hx, hy - 5);
          if (filled) {
            this.glow(ctx, '#ff5a7a', 10);
            ctx.fillStyle = '#ff5a7a'; ctx.fill();
            this.noGlow(ctx);
          } else {
            ctx.fillStyle = 'rgba(255,90,122,0.05)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255,120,150,0.28)'; ctx.lineWidth = 1; ctx.stroke();
          }
        }
        // shields + bombs (bottom-right), labelled with slots so it's clear they
        // recharge: filled = you have it, outline = a slot you can still fill.
        this.noGlow(ctx);
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = 'rgba(90,200,255,0.8)';
        ctx.fillText('SHIELD', W - 12, H - 52);
        for (let i = 0; i < 3; i++) {
          const sx = W - 16 - i * 15, sy = H - 42, filled = i < p.shield;
          ctx.beginPath();
          ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 5, sy); ctx.closePath();
          if (filled) { this.glow(ctx, '#4dc3ff', 8); ctx.fillStyle = '#4dc3ff'; ctx.fill(); this.noGlow(ctx); }
          else { ctx.strokeStyle = 'rgba(90,200,255,0.32)'; ctx.lineWidth = 1; ctx.stroke(); }
        }
        ctx.fillStyle = 'rgba(255,184,77,0.8)';
        ctx.fillText('BOMB', W - 12, H - 28);
        for (let i = 0; i < 5; i++) {
          const bx = W - 16 - i * 15, by = H - 18, filled = i < p.bombs;
          ctx.beginPath(); ctx.arc(bx, by, 5, 0, TAU);
          if (filled) { this.glow(ctx, '#ffb84d', 8); ctx.fillStyle = '#ffb84d'; ctx.fill(); this.noGlow(ctx); }
          else { ctx.strokeStyle = 'rgba(255,184,77,0.3)'; ctx.lineWidth = 1; ctx.stroke(); }
        }
        this.noGlow(ctx);
        // weapon indicator (shows the stage-gated level cap)
        const wcol = WEAPONS[p.weapon].color;
        const cap = g.weaponLevelCap();
        const atCap = p.level >= cap && cap < WEAPONS[p.weapon].maxLv;
        ctx.textAlign = 'center';
        ctx.font = 'bold 12px monospace';
        this.glow(ctx, wcol, 8);
        ctx.fillStyle = wcol;
        ctx.fillText(WEAPONS[p.weapon].name + ' LV' + p.level + (atCap ? ' · CAP' : ''), W / 2, H - 30);
        this.noGlow(ctx);
        // level pips: filled = earned, outline = available now, dark = locked
        // until later stages (clear stages to raise the cap)
        for (let i = 0; i < WEAPONS[p.weapon].maxLv; i++) {
          const x = W / 2 - 36 + i * 12;
          if (i < p.level) { ctx.fillStyle = wcol; ctx.fillRect(x, H - 14, 9, 4); }
          else if (i < cap) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x, H - 14, 9, 4); }
          else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x, H - 14, 9, 4); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, H - 13.5, 8, 3); }
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

      // brief sparkle text right after resuming into endless mode
      if (g.state === 'play' && g.victoryT > 0 && g.won) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.globalAlpha = clamp(g.victoryT / 3, 0, 1);
        this.glow(ctx, '#ffd25a', 16);
        ctx.fillStyle = '#ffe98a';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('∞ THE VOID IS YOURS — GO FOR THE RECORD ∞', W / 2, H * 0.2);
        this.noGlow(ctx);
        ctx.restore();
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
      ctx.fillText('ONE PILOT AGAINST THE VOID', W / 2, ty + 90);
      this.noGlow(ctx);
      ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(180,220,255,0.75)';
      ctx.fillText('HI-SCORE  ' + String(g.hiscore).padStart(7, '0'), W / 2, ty + 114);
      if (g.cleared) {
        ctx.font = 'bold 11px monospace'; this.glow(ctx, '#ffd25a', 10); ctx.fillStyle = '#ffe98a';
        ctx.fillText('★ SECTOR CLEARED — MASTER PILOT ★', W / 2, ty + 136); this.noGlow(ctx);
      }

      // controls — bright keycap boxes so nobody misses BOMB or PAUSE
      const keycap = (kx, ky, label) => {
        const kw = Math.max(24, label.length * 8 + 12), kh = 19, r = 4;
        const x0 = kx - kw / 2, y0 = ky - kh / 2;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y0); ctx.lineTo(x0 + kw - r, y0); ctx.arcTo(x0 + kw, y0, x0 + kw, y0 + r, r);
        ctx.lineTo(x0 + kw, y0 + kh - r); ctx.arcTo(x0 + kw, y0 + kh, x0 + kw - r, y0 + kh, r);
        ctx.lineTo(x0 + r, y0 + kh); ctx.arcTo(x0, y0 + kh, x0, y0 + kh - r, r);
        ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r);
        ctx.closePath();
        ctx.fillStyle = 'rgba(10,10,30,0.85)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,210,90,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = '#ffe98a'; ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, kx, ky + 0.5);
        return kw;
      };
      const control = (cx2, cy2, key, label) => {
        const kw = keycap(cx2, cy2, key);
        ctx.fillStyle = '#eaffff'; ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(label, cx2 + kw / 2 + 9, cy2 + 0.5);
      };
      if (g.isTouch) {
        control(130, 352, 'DRAG', 'FLY + AUTO-FIRE');
        control(130, 382, '✸', 'BOMB (button, bottom-right)');
      } else {
        control(105, 352, 'WASD', 'MOVE');
        control(300, 352, 'SPACE', 'FIRE');
        control(105, 382, 'X', 'BOMB');
        control(300, 382, 'P', 'PAUSE');
        control(105, 412, 'M', 'MUTE');
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(185,215,250,0.75)'; ctx.font = '11px monospace';
      ctx.fillText('collect chips to level up · clear stages to raise the level cap', W / 2, 444);

      // blinking prompt — one press starts the game (music comes with it)
      ctx.fillStyle = 'rgba(3,1,9,0.6)';
      ctx.fillRect(W / 2 - 160, 460, 320, 30); // backing band so the prompt reads over the sun
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(T * 5);
      ctx.font = 'bold 20px monospace';
      this.glow(ctx, '#7dff4d', 16); ctx.fillStyle = '#c8ffb0';
      ctx.fillText(g.isTouch ? 'TAP TO LAUNCH' : 'PRESS SPACE TO LAUNCH', W / 2, 481);
      this.noGlow(ctx); ctx.globalAlpha = 1;
      ctx.restore();
    },

    drawVictory(ctx, g) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,2,14,0.66)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      const vpulse = 1 + Math.sin(g.time * 4) * 0.03;
      ctx.save();
      ctx.translate(W / 2, H * 0.28);
      ctx.scale(vpulse, vpulse);
      this.glow(ctx, '#ffd25a', 30);
      ctx.fillStyle = '#ffe98a';
      ctx.font = 'bold 34px monospace';
      ctx.fillText('CONGRATULATIONS!', 0, 0);
      ctx.restore();
      this.glow(ctx, '#4df3ff', 18);
      ctx.fillStyle = '#eaffff';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('★ SECTOR CLEARED ★', W / 2, H * 0.28 + 38);
      this.noGlow(ctx);
      ctx.font = '13px monospace';
      ctx.fillStyle = 'rgba(200,230,255,0.9)';
      ctx.fillText('ALL 10 DREADNOUGHTS DESTROYED', W / 2, H * 0.28 + 66);
      ctx.fillText('THE VOID IS YOURS, PILOT', W / 2, H * 0.28 + 86);
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ffd25a';
      ctx.fillText('SCORE  ' + g.score.toLocaleString(), W / 2, H * 0.28 + 122);
      // endless is opt-in — take a breather first
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(g.time * 4);
      this.glow(ctx, '#ff4df0', 14);
      ctx.fillStyle = '#ffd6f8';
      ctx.font = 'bold 17px monospace';
      ctx.fillText(g.isTouch ? '∞ TAP FOR ENDLESS MODE ∞' : '∞ PRESS SPACE FOR ENDLESS MODE ∞', W / 2, H * 0.64);
      this.noGlow(ctx);
      ctx.globalAlpha = 1;
      ctx.font = '11px monospace';
      ctx.fillStyle = 'rgba(160,190,225,0.7)';
      ctx.fillText('take a breather — the fight resumes when you are ready', W / 2, H * 0.64 + 24);
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
    play(name, lv) {
      if (!this.ctx || this.muted) return;
      var pt = 1 + ((lv || 1) - 1) * 0.03; // shots pitch up as the weapon levels
      switch (name) {
        case 'shoot': this.tone(880 * pt, 0.07, 'square', 0.035, 0.5); break;
        case 'shoot2': this.tone(660 * pt, 0.09, 'sawtooth', 0.03, 0.55); break;
        case 'laser': this.tone(1400 * (1 + ((lv || 1) - 1) * 0.022), 0.06, 'sawtooth', 0.03, 0.3); break;
        case 'missile': this.tone(300 * pt, 0.18, 'sawtooth', 0.045, 2.2); this.noise(0.1, 0.03); break;
        case 'levelup': { var lb = 1 + ((lv || 1) - 1) * 0.045; this.tone(660 * lb, 0.08, 'square', 0.06); this.tone(990 * lb, 0.1, 'square', 0.055, 1, 0.06); this.tone(1480 * lb, 0.16, 'triangle', 0.05, 1, 0.12); break; }
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
        case 'collect': this.tone(988, 0.05, 'triangle', 0.07); this.tone(1319, 0.07, 'triangle', 0.06, 1, 0.04); this.tone(1760, 0.11, 'triangle', 0.05, 1, 0.09); break;
        case 'victory': [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, 0.5, 'square', 0.07, 1, i * 0.12)); this.tone(1568, 0.9, 'triangle', 0.06, 1, 0.62); break;
        case 'fanfare': [784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.13, 'square', 0.06, 1, i * 0.07)); this.tone(1568, 0.5, 'triangle', 0.06, 1, 0.28); this.tone(2093, 0.5, 'triangle', 0.045, 1, 0.28); break;
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
    setMusicVolume(v) { if (this._mgain && this.ctx) this._mgain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25); }
    _scheduleBar() {
      if (!this.musicOn || !this.ctx) return;
      const boss = this.musicMode === 'boss';   // final-boss variant: same voices, more menace
      const game = this.musicMode === 'game' || boss;
      const bpm = boss ? 172 : game ? 148 : 118;
      const step = 60 / bpm / 4; // 16th notes
      const prog = boss
        ? [[110, 1], [116.541, 0], [110, 1], [82.407, 0]]     // Am · B♭ · Am · E — urgent, Neapolitan dread
        : game
          ? [[110, 1], [97.999, 0], [87.307, 0], [82.407, 1]]   // Am · G · F · E(min)
          : [[110, 1], [87.307, 0], [130.813, 0], [97.999, 0]]; // Am · F · C · G
      const ch = prog[this._bar % prog.length], root = ch[0], min = ch[1];
      const third = root * (min ? 1.18921 : 1.259921), fifth = root * 1.498307;
      const arp = [root * 2, third * 2, fifth * 2, third * 2, root * 2, fifth * 2, third * 4, fifth * 2];
      const t0 = this._barTime;
      for (let s = 0; s < 16; s++) {
        const when = t0 + s * step;
        if (s % 4 === 0) { this._mnote(root, when, step * 3.4, 'sawtooth', boss ? 0.16 : 0.14, root * 0.98); this._mkick(when); }
        if (boss && s % 4 === 2) this._mkick(when); // double-time kick — heartbeat under pressure
        if (boss ? true : s % 2 === 0) this._mnote(arp[(boss ? s : s / 2) % arp.length], when, step * (boss ? 0.9 : 1.5), 'square', boss ? 0.055 : game ? 0.06 : 0.05);
        this._mhat(when, s % 2 ? (boss ? 0.07 : 0.05) : 0.03);
        if (game && !boss && s % 8 === 4) this._mnote(root * 3, when, step * 2, 'triangle', 0.05);
      }
      if (boss) this._mnote(root * 4, t0, step * 10, 'sawtooth', 0.045, root * 2.9); // descending siren wail each bar
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
    let cleared = false;
    try { cleared = localStorage.getItem('neonvoid_cleared') === '1'; } catch (e) {}

    const game = new Game({
      sfx,
      hiscore,
      cleared,
      onHiscore(v) { try { localStorage.setItem('neonvoid_hi', String(v)); } catch (e) {} },
      onWin() { try { localStorage.setItem('neonvoid_cleared', '1'); } catch (e) {} },
    });

    const input = { left: false, right: false, up: false, down: false, fire: false, bomb: false, dragActive: false, tx: W / 2, ty: H - 90 };
    let paused = false, musicState = null, audioUnlocked = false, musicVol = 0.5, orientationBlocked = false;
    const isTouch = (typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches) || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    game.audioReady = false;
    game.isTouch = isTouch;
    // Haptics: short vibration on hits/bombs (mobile only; no-op where unsupported, e.g. iOS).
    game.haptic = (pat) => { try { if (isTouch && navigator.vibrate) navigator.vibrate(pat); } catch (e) {} };
    // Browsers block autoplay: the first gesture "powers on" audio + menu music.
    const unlock = () => { if (audioUnlocked) return; audioUnlocked = true; game.audioReady = true; sfx.ensure(); };

    const keymap = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      Space: 'fire', KeyJ: 'fire',
      KeyX: 'bomb', KeyK: 'bomb',
    };
    window.addEventListener('keydown', (ev) => {
      unlock(); // the keypress itself is the audio-unlock gesture — start + music in one press
      if (ev.code === 'KeyP' && game.state === 'play') { paused = !paused; return; }
      if (ev.code === 'KeyM') { sfx.muted = !sfx.muted; return; }
      // --- test cheats ---
      // Cheats exist ONLY on the private test page (window.NEONVOID_TEST);
      // on the live site these keys do nothing at all.
      if (window.NEONVOID_TEST) {
        if (ev.code === 'KeyG') {
          game.god = !game.god;
          game.usedCheats = true; // tainted — leaderboard refuses it (belt & braces)
          game.floaters.push({ x: W / 2, y: H * 0.45, text: game.god ? 'GOD MODE ON' : 'GOD MODE OFF', t: 1.2, color: '#ffd25a' });
          return;
        }
        if (game.state === 'play') {
          const wkeys = { Digit1: 'blaster', Digit2: 'spread', Digit3: 'laser', Digit4: 'missile' };
          if (wkeys[ev.code]) { game.player.weapon = wkeys[ev.code]; game.usedCheats = true; return; }
          if (ev.code === 'KeyU') { game.player.level = Math.min(6, game.player.level + 1); game.usedCheats = true; return; }
          if (ev.code === 'KeyB' && !game.bossActive) { game.spawnBoss(); game.usedCheats = true; return; }
          if (ev.code === 'KeyH') { game.player.hp = game.player.maxHp; game.player.shield = 3; game.player.bombs = 5; game.usedCheats = true; return; }
        }
      }
      const k = keymap[ev.code];
      if (k) { input[k] = true; ev.preventDefault(); }
    });
    window.addEventListener('keyup', (ev) => {
      const k = keymap[ev.code];
      if (k) { input[k] = false; ev.preventDefault(); }
    });
    window.addEventListener('blur', () => { for (const k in input) input[k] = false; });
    // ---- pointer / touch controls: drag-to-fly + auto-fire (also mouse-drag) ----
    const canvasPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
    };
    let dragId = null, prevX = 0, prevY = 0;
    canvas.addEventListener('pointerdown', (e) => {
      unlock();
      if (game.state === 'over') return;        // results overlay handles retry
      input.fire = true;                        // one tap starts the game (and fires while held)
      if (game.state === 'play') {
        const pos = canvasPos(e);
        prevX = pos.x; prevY = pos.y;
        input.tx = game.player.x; input.ty = game.player.y;
        input.dragActive = true; dragId = e.pointerId;
        if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
      }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!input.dragActive || e.pointerId !== dragId) return;
      const pos = canvasPos(e);
      input.tx += pos.x - prevX; input.ty += pos.y - prevY;
      prevX = pos.x; prevY = pos.y;
      e.preventDefault();
    });
    const endPtr = (e) => { input.fire = false; if (e.pointerId === dragId) { input.dragActive = false; dragId = null; } };
    canvas.addEventListener('pointerup', endPtr);
    canvas.addEventListener('pointercancel', endPtr);

    // On-screen bomb button (shown on touch devices via CSS).
    const bombBtn = document.getElementById('nv-bomb-btn');
    if (bombBtn) {
      bombBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); unlock(); input.bomb = true; });
      const bombUp = (e) => { e.stopPropagation(); input.bomb = false; };
      bombBtn.addEventListener('pointerup', bombUp);
      bombBtn.addEventListener('pointercancel', bombUp);
    }

    // scale canvas to fit window while keeping aspect
    function fit() {
      const pad = 14;
      const scale = Math.min((window.innerWidth - pad) / W, (window.innerHeight - pad) / H);
      canvas.style.width = Math.floor(W * scale) + 'px';
      canvas.style.height = Math.floor(H * scale) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();

    // Rotate-to-portrait: on a phone held sideways, freeze the game (a CSS overlay
    // prompts the player to rotate back).
    const rotateMQ = (typeof matchMedia !== 'undefined') ? matchMedia('(hover: none) and (pointer: coarse) and (orientation: landscape)') : null;
    function checkOrientation() {
      orientationBlocked = !!(rotateMQ && rotateMQ.matches);
      game.orientationBlocked = orientationBlocked;
      if (orientationBlocked) { for (const k in input) if (input[k] === true) input[k] = false; input.dragActive = false; }
    }
    if (rotateMQ) { rotateMQ.addEventListener ? rotateMQ.addEventListener('change', checkOrientation) : rotateMQ.addListener(checkOrientation); }
    window.addEventListener('resize', checkOrientation);
    checkOrientation();

    let last = performance.now();
    function frame(now) {
      let dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!paused && !orientationBlocked) game.update(dt, input);
      // Arcade music follows game state once a gesture has unlocked audio.
      // 'play' uses the driving track; menu + results use the slower menu track,
      // ducked to a quieter volume on the results/leaderboard screen.
      if (sfx.ctx && sfx.ctx.state === 'running') {
        // the final boss gets an urgent variant of the game track
        const omegaUp = game.state === 'play' && game.bossActive &&
          game.enemies.some((e) => e.type === 'boss' && e.cfg && e.cfg.final);
        const ms = game.state === 'play' ? (omegaUp ? 'boss' : 'game') : 'menu';
        if (ms !== musicState) { musicState = ms; sfx.musicMode = ms; sfx.startMusic(ms); }
        const vol = game.state === 'over' ? 0.176 : 0.5; // results screen ducked (10% louder than before)
        if (vol !== musicVol) { musicVol = vol; sfx.setMusicVolume(vol); }
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
