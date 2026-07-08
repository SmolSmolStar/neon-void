// Game balance/config data. Pure data + pure scaling functions. No DOM.

export const WORLD = {
  width: 480,
  height: 720,
};

export const PLAYER = {
  r: 13,
  speed: 460,        // px/sec (keyboard)
  maxHp: 100,
  invulnTime: 1.2,   // seconds of i-frames after a hit
  drag: 0.86,
  accel: 3600,
};

// ---------------------------------------------------------------------------
// WEAPONS
// Each weapon is defined by level. `spec(level)` returns firing parameters.
// A "shot" is one trigger pull that may emit several projectiles.
// ---------------------------------------------------------------------------

export const WEAPON_TYPES = ['pulse', 'spread', 'laser', 'homing'];

export const WEAPONS = {
  pulse: {
    name: 'Pulse Cannon',
    color: '#7cf6ff',
    max: 6,
    // Fast, accurate straight shots. More barrels as it levels.
    spec(level) {
      const barrels = 1 + Math.floor(level / 2);        // 1,1,2,2,3,3...
      return {
        cooldown: Math.max(0.07, 0.16 - level * 0.012),
        damage: 6 + level * 2.2,
        speed: 720,
        radius: 4.5,
        pierce: 0,
        barrels,
        spreadAngle: barrels > 1 ? 0.14 : 0,
      };
    },
  },
  spread: {
    name: 'Scatter Gun',
    color: '#ffd166',
    max: 6,
    // Wide fan of pellets; great for crowds.
    spec(level) {
      const pellets = 3 + level;                         // 4..9
      return {
        cooldown: Math.max(0.22, 0.4 - level * 0.026),
        damage: 4 + level * 1.4,
        speed: 600,
        radius: 4,
        pierce: 0,
        pellets,
        arc: 0.5 + level * 0.06,
      };
    },
  },
  laser: {
    name: 'Lance Beam',
    color: '#c17bff',
    max: 6,
    // Piercing, high fire-rate lance. Cuts through lines of enemies.
    spec(level) {
      return {
        cooldown: Math.max(0.05, 0.12 - level * 0.011),
        damage: 5 + level * 1.9,
        speed: 1050,
        radius: 3 + level * 0.5,
        pierce: 1 + level,        // pass through this many enemies
        barrels: level >= 4 ? 2 : 1,
        spreadAngle: level >= 4 ? 0.05 : 0,
      };
    },
  },
  homing: {
    name: 'Swarm Missiles',
    color: '#ff7ab8',
    max: 6,
    // Seeking missiles. Fewer but relentless.
    spec(level) {
      const count = 1 + Math.ceil(level / 2);            // 2..4
      return {
        cooldown: Math.max(0.28, 0.5 - level * 0.03),
        damage: 9 + level * 2.6,
        speed: 380,
        radius: 5,
        pierce: 0,
        count,
        homing: true,
        turnRate: 3.2 + level * 0.35,
        blastRadius: 26 + level * 3,
      };
    },
  },
};

// ---------------------------------------------------------------------------
// DROPS — what enemies leave behind.
// ---------------------------------------------------------------------------

export const DROPS = {
  power:   { color: '#7dff8f', glyph: '+',  label: 'Power Up' },   // +1 weapon level
  spread:  { color: WEAPONS.spread.color, glyph: 'S', label: 'Scatter Gun' },
  laser:   { color: WEAPONS.laser.color,  glyph: 'L', label: 'Lance Beam' },
  homing:  { color: WEAPONS.homing.color, glyph: 'M', label: 'Missiles' },
  pulse:   { color: WEAPONS.pulse.color,  glyph: 'P', label: 'Pulse Cannon' },
  shield:  { color: '#66e0ff', glyph: '◈', label: 'Shield' },
  heal:    { color: '#ff5a7a', glyph: '♥', label: 'Repair' },
  bomb:    { color: '#ffe14d', glyph: '✸', label: 'Nova Bomb' },
};

// Weighted drop table. Weapon swaps rarer than power-ups.
export const DROP_TABLE = [
  ['power', 34],
  ['heal', 10],
  ['shield', 9],
  ['bomb', 6],
  ['spread', 10],
  ['laser', 10],
  ['homing', 10],
  ['pulse', 6],
];

// ---------------------------------------------------------------------------
// ENEMIES
// ---------------------------------------------------------------------------

export const ENEMIES = {
  grunt: {
    name: 'Drone', r: 15, hp: 10, speed: 90, score: 100,
    color: '#ff6b6b', contact: 18, dropChance: 0.14, behavior: 'straight',
  },
  weaver: {
    name: 'Weaver', r: 14, hp: 14, speed: 110, score: 150,
    color: '#ffa94d', contact: 18, dropChance: 0.18, behavior: 'sine',
    amp: 90, freq: 2.4,
  },
  darter: {
    name: 'Darter', r: 12, hp: 8, speed: 210, score: 130,
    color: '#a0ff6b', contact: 16, dropChance: 0.16, behavior: 'dive',
  },
  gunner: {
    name: 'Gunner', r: 17, hp: 22, speed: 70, score: 220,
    color: '#ff8cc6', contact: 20, dropChance: 0.30, behavior: 'shooter',
    fireEvery: 1.7, bulletSpeed: 240,
  },
  tank: {
    name: 'Bulwark', r: 26, hp: 70, speed: 46, score: 400,
    color: '#c07bff', contact: 26, dropChance: 0.55, behavior: 'straight',
  },
  boss: {
    name: 'Dreadnought', r: 60, hp: 1400, speed: 40, score: 5000,
    color: '#ff4d6d', contact: 55, dropChance: 1, behavior: 'boss',
    fireEvery: 1.15,
  },
};

// ---------------------------------------------------------------------------
// DIFFICULTY SCALING — driven by elapsed time (seconds) and wave number.
// ---------------------------------------------------------------------------

// Enemy HP multiplier grows slowly over the run.
export const hpScale = (t) => 1 + t / 55;

// Enemy speed multiplier, capped so it stays fair.
export const speedScale = (t) => Math.min(1.9, 1 + t / 150);

// Seconds between spawns — starts relaxed, tightens to a floor.
export const spawnInterval = (t) => Math.max(0.32, 1.5 - t / 90);

// How many enemies can be picked per spawn tick (batching ramps late).
export const spawnBatch = (t) => 1 + Math.floor(t / 75);

// Which enemy types are unlocked at a given elapsed time.
export function unlockedTypes(t) {
  const types = ['grunt'];
  if (t > 10) types.push('weaver');
  if (t > 22) types.push('darter');
  if (t > 38) types.push('gunner');
  if (t > 60) types.push('tank');
  return types;
}

// A boss arrives every BOSS_PERIOD seconds.
export const BOSS_PERIOD = 75;

export const SCORE = {
  comboWindow: 2.2,       // seconds to keep a combo alive
  comboStep: 0.1,         // +10% multiplier per combo tier
  comboMax: 5,            // caps at x5
};
