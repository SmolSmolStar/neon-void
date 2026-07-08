// Pure weapon firing. Given a weapon {type, level}, the shooter position and a
// target, returns an array of projectile descriptors + the cooldown before the
// next shot. No DOM, no global state → fully unit-testable.

import { WEAPONS, clampLevel } from './weapon-util.js';
import { TAU } from './math.js';

// Build the projectiles for a single trigger pull.
// origin: {x, y}  target: {x, y}|null  aimAngle defaults to straight up.
export function fire(weapon, origin, target = null) {
  const def = WEAPONS[weapon.type];
  const level = clampLevel(weapon.type, weapon.level);
  const s = def.spec(level);
  const up = -Math.PI / 2; // straight up
  const shots = [];

  const base = {
    from: 'player',
    damage: s.damage,
    r: s.radius,
    pierce: s.pierce || 0,
    color: def.color,
    homing: !!s.homing,
    turnRate: s.turnRate || 0,
    blastRadius: s.blastRadius || 0,
    kind: weapon.type,
  };

  if (weapon.type === 'spread') {
    const n = s.pellets;
    const arc = s.arc;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = up + (t - 0.5) * arc;
      shots.push(mkProj(base, origin, ang, s.speed));
    }
  } else if (weapon.type === 'homing') {
    const n = s.count;
    for (let i = 0; i < n; i++) {
      // Fan the launch angle a little; missiles curve to the target after.
      const spread = 0.5;
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = up + (t - 0.5) * spread;
      const p = mkProj(base, origin, ang, s.speed);
      p.targetSeek = true;
      shots.push(p);
    }
  } else {
    // pulse / laser: `barrels` parallel-ish shots with a tiny spread.
    const n = s.barrels || 1;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = up + (t - 0.5) * (s.spreadAngle || 0);
      shots.push(mkProj(base, origin, ang, s.speed));
    }
  }

  return { projectiles: shots, cooldown: s.cooldown };
}

function mkProj(base, origin, angle, speed) {
  return {
    ...base,
    x: origin.x,
    y: origin.y - 6,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle,
    speed,
    life: 2.2,
    hits: [], // ids already damaged (for pierce)
  };
}

// Enemy bullet factory (radial or aimed).
export function enemyBullet(x, y, angle, speed, damage = 12) {
  return {
    from: 'enemy',
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 5,
    damage,
    color: '#ff3b6b',
    life: 6,
  };
}

export { TAU };
