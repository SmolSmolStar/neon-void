import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, clamp, lerp, rotateToward, norm, dist } from '../src/math.js';
import { circleHit, outOfBounds } from '../src/collision.js';
import { fire } from '../src/weapons.js';
import { WEAPONS, clampLevel } from '../src/weapon-util.js';
import { rollDrop, applyDrop, freshPlayer } from '../src/upgrades.js';
import { makeDirector, tick, bossCleared } from '../src/spawn.js';
import { makeScore, addKill, tickScore } from '../src/score.js';
import { WEAPON_TYPES, hpScale, speedScale, spawnInterval, unlockedTypes } from '../src/config.js';

test('math: clamp/lerp basics', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(lerp(0, 10, 0.5), 5);
});

test('math: norm produces unit vector', () => {
  const [x, y] = norm(3, 4);
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9);
});

test('math: rotateToward never overshoots and wraps', () => {
  const step = 0.1;
  const r = rotateToward(0, Math.PI, step);
  assert.ok(Math.abs(r) <= step + 1e-9);
  // Target behind should rotate the short way (negative), still within step.
  const r2 = rotateToward(0.05, -3.1, step);
  assert.ok(Math.abs(r2 - 0.05) <= step + 1e-9);
});

test('rng: deterministic + helpers in range', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.range(5, 9);
    assert.ok(v >= 5 && v < 9);
    const n = r.int(1, 6);
    assert.ok(n >= 1 && n <= 6);
  }
});

test('collision: circle hit + bounds', () => {
  assert.ok(circleHit(0, 0, 5, 3, 0, 5));
  assert.ok(!circleHit(0, 0, 2, 100, 0, 2));
  assert.ok(outOfBounds({ x: -200, y: 10 }, 480, 720));
  assert.ok(!outOfBounds({ x: 10, y: 10 }, 480, 720));
});

test('weapons: every type at every level fires valid projectiles', () => {
  for (const type of WEAPON_TYPES) {
    for (let lvl = 1; lvl <= WEAPONS[type].max; lvl++) {
      const { projectiles, cooldown } = fire({ type, level: lvl }, { x: 240, y: 700 }, { x: 240, y: 0 });
      assert.ok(cooldown > 0, `${type} lv${lvl} cooldown`);
      assert.ok(projectiles.length >= 1, `${type} lv${lvl} emits projectiles`);
      for (const p of projectiles) {
        assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy), 'finite velocity');
        assert.ok(p.damage > 0, 'positive damage');
        assert.ok(p.r > 0, 'positive radius');
        // Player shots travel upward (negative vy) overall.
        assert.ok(p.vy < 0, `${type} shot goes up`);
      }
    }
  }
});

test('weapons: higher level never fires slower or weaker', () => {
  for (const type of WEAPON_TYPES) {
    let prevCd = Infinity, prevDmg = 0;
    for (let lvl = 1; lvl <= WEAPONS[type].max; lvl++) {
      const spec = WEAPONS[type].spec(lvl);
      assert.ok(spec.cooldown <= prevCd + 1e-9, `${type} cooldown monotonic`);
      assert.ok(spec.damage >= prevDmg - 1e-9, `${type} damage monotonic`);
      prevCd = spec.cooldown;
      prevDmg = spec.damage;
    }
  }
});

test('clampLevel respects per-weapon max', () => {
  assert.equal(clampLevel('pulse', 999), WEAPONS.pulse.max);
  assert.equal(clampLevel('pulse', -5), 1);
});

test('drops: rollDrop always returns a known type', () => {
  const rng = makeRng(123);
  for (let i = 0; i < 5000; i++) {
    const d = rollDrop(rng);
    assert.ok(typeof d === 'string' && d.length > 0);
  }
});

test('upgrades: power up raises weapon level and caps', () => {
  const p = freshPlayer();
  p.weapon = { type: 'pulse', level: 1 };
  applyDrop('power', p);
  assert.equal(p.weapon.level, 2);
  for (let i = 0; i < 20; i++) applyDrop('power', p);
  assert.equal(p.weapon.level, WEAPONS.pulse.max);
  const res = applyDrop('power', p);
  assert.ok(res.maxed, 'reports maxed when already at cap');
});

test('upgrades: same-weapon pickup levels, different switches', () => {
  const p = freshPlayer(); // pulse lv1
  applyDrop('laser', p);
  assert.equal(p.weapon.type, 'laser');
  const lvlAfterSwitch = p.weapon.level;
  applyDrop('laser', p);
  assert.equal(p.weapon.level, clampLevel('laser', lvlAfterSwitch + 1));
});

test('upgrades: heal clamps to max, shield/bomb stack with caps', () => {
  const p = freshPlayer();
  p.hp = 90;
  applyDrop('heal', p);
  assert.ok(p.hp <= 100);
  p.shield = 0;
  for (let i = 0; i < 10; i++) applyDrop('shield', p);
  assert.equal(p.shield, 3);
  const before = p.bombs;
  applyDrop('bomb', p);
  assert.equal(p.bombs, before + 1);
});

test('difficulty: scalers move the right direction', () => {
  assert.ok(hpScale(120) > hpScale(0));
  assert.ok(speedScale(300) > speedScale(0));
  assert.ok(speedScale(1e6) <= 1.9 + 1e-9, 'speed capped');
  assert.ok(spawnInterval(0) > spawnInterval(300), 'spawns speed up');
  assert.ok(spawnInterval(1e6) >= 0.32 - 1e-9, 'spawn floor');
  assert.ok(unlockedTypes(0).length < unlockedTypes(120).length);
});

test('director: spawns enemies and schedules a boss', () => {
  const rng = makeRng(9);
  const dir = makeDirector();
  let spawned = 0, sawBoss = false;
  // Simulate ~90s in 1/30s steps.
  for (let i = 0; i < 30 * 90; i++) {
    const out = tick(dir, 1 / 30, rng);
    spawned += out.spawns.length;
    if (out.boss) {
      sawBoss = true;
      assert.equal(out.boss.type, 'boss');
      assert.ok(out.boss.hp > 0);
      bossCleared(dir); // simulate killing it so sim continues
    }
    for (const s of out.spawns) {
      assert.ok(s.hp > 0 && s.maxHp > 0 && s.speed > 0);
      assert.ok(Number.isFinite(s.x) && s.y < 0);
    }
  }
  assert.ok(spawned > 20, `expected many spawns, got ${spawned}`);
  assert.ok(sawBoss, 'a boss should have appeared within 90s');
});

test('score: combo raises multiplier then breaks', () => {
  const s = makeScore();
  const g1 = addKill(s, 100);
  assert.equal(g1, 100); // first kill x1
  addKill(s, 100);
  addKill(s, 100);
  assert.ok(s.multiplier > 1, 'combo builds multiplier');
  const broke = tickScore(s, 999);
  assert.ok(broke && s.combo === 0 && s.multiplier === 1);
});
