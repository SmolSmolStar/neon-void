// Pure spawn director. Decides WHAT to spawn and WHEN based on elapsed time.
// Returns spawn descriptors; the game layer turns them into live entities.
import {
  ENEMIES, WORLD, unlockedTypes, spawnInterval, spawnBatch,
  hpScale, speedScale, BOSS_PERIOD,
} from './config.js';

export function makeDirector() {
  return {
    elapsed: 0,
    timer: 0,           // counts down to next spawn tick
    nextBossAt: BOSS_PERIOD,
    bossActive: false,
    wave: 1,
  };
}

// Advance the director by dt seconds. `rng` is a seedable rng() in [0,1).
// Returns { spawns: [...], boss: descriptor|null }.
export function tick(dir, dt, rng) {
  dir.elapsed += dt;
  const out = { spawns: [], boss: null };

  // Boss scheduling: pause normal spawning while a boss is on the field.
  if (!dir.bossActive && dir.elapsed >= dir.nextBossAt) {
    dir.bossActive = true;
    out.boss = makeSpawn('boss', dir.elapsed, rng);
    return out;
  }
  if (dir.bossActive) return out; // wait for game layer to clear the boss

  dir.timer -= dt;
  if (dir.timer <= 0) {
    dir.timer += spawnInterval(dir.elapsed);
    const batch = spawnBatch(dir.elapsed);
    const pool = unlockedTypes(dir.elapsed);
    for (let i = 0; i < batch; i++) {
      const type = weightedType(pool, dir.elapsed, rng);
      out.spawns.push(makeSpawn(type, dir.elapsed, rng));
    }
    dir.wave = 1 + Math.floor(dir.elapsed / 15);
  }

  return out;
}

// Call when the game layer has confirmed the boss is dead/off-field.
export function bossCleared(dir) {
  dir.bossActive = false;
  dir.nextBossAt = dir.elapsed + BOSS_PERIOD;
  dir.timer = 2; // brief calm after a boss
}

// Bias later spawns toward tougher enemies without ever excluding basics.
function weightedType(pool, t, rng) {
  const weights = pool.map((type) => {
    switch (type) {
      case 'grunt': return 5;
      case 'weaver': return 4;
      case 'darter': return Math.min(5, 2 + t / 40);
      case 'gunner': return Math.min(4, 1 + t / 50);
      case 'tank': return Math.min(3, 0.5 + t / 90);
      default: return 1;
    }
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

function makeSpawn(type, t, rng) {
  const def = ENEMIES[type];
  const margin = def.r + 6;
  const x = type === 'boss'
    ? WORLD.width / 2
    : margin + rng() * (WORLD.width - margin * 2);
  const hp = Math.round(def.hp * (type === 'boss' ? bossHpScale(t) : hpScale(t)));
  const speed = def.speed * (type === 'boss' ? 1 : speedScale(t));
  return {
    type,
    x,
    y: -margin,
    hp,
    maxHp: hp,
    speed,
    phase: rng() * Math.PI * 2, // for sine weavers
    seed: rng(),
  };
}

// Bosses get meaningfully tankier each appearance.
function bossHpScale(t) {
  const appearance = Math.max(1, Math.round(t / BOSS_PERIOD));
  return 1 + (appearance - 1) * 0.6;
}
