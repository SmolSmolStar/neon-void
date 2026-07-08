// Pure upgrade & drop resolution. No DOM.
import { DROP_TABLE, DROPS, PLAYER, WEAPON_TYPES } from './config.js';
import { clampLevel, weaponMax } from './weapon-util.js';
import { clamp } from './math.js';

// Roll a drop type from the weighted table using an rng() in [0,1).
export function rollDrop(rng) {
  const total = DROP_TABLE.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [type, w] of DROP_TABLE) {
    r -= w;
    if (r <= 0) return type;
  }
  return DROP_TABLE[0][0];
}

// Apply a picked-up drop to the player state. Returns a result describing what
// happened (used to drive UI toasts / sfx). Mutates `player`.
export function applyDrop(type, player) {
  switch (type) {
    case 'power': {
      const before = player.weapon.level;
      player.weapon.level = clampLevel(player.weapon.type, before + 1);
      const maxed = player.weapon.level === before;
      return {
        kind: 'power',
        text: maxed ? 'MAX POWER' : `${labelFor(player.weapon.type)} Lv${player.weapon.level}`,
        maxed,
      };
    }
    case 'pulse':
    case 'spread':
    case 'laser':
    case 'homing': {
      if (player.weapon.type === type) {
        const before = player.weapon.level;
        player.weapon.level = clampLevel(type, before + 1);
      } else {
        // Switching to a new weapon: keep momentum by starting one level in if
        // the player already has some power banked, else level 1.
        const carried = clamp(Math.floor(player.weapon.level / 2), 0, weaponMax(type) - 1);
        player.weapon = { type, level: Math.max(1, carried) };
      }
      return {
        kind: 'weapon',
        text: `${DROPS[type].label} Lv${player.weapon.level}`,
      };
    }
    case 'heal': {
      const amt = 30;
      player.hp = clamp(player.hp + amt, 0, PLAYER.maxHp);
      return { kind: 'heal', text: '+30 HULL', amount: amt };
    }
    case 'shield': {
      player.shield = Math.min((player.shield || 0) + 1, 3);
      return { kind: 'shield', text: `SHIELD x${player.shield}` };
    }
    case 'bomb': {
      player.bombs = (player.bombs || 0) + 1;
      return { kind: 'bomb', text: `NOVA x${player.bombs}` };
    }
    default:
      return { kind: 'none', text: '' };
  }
}

function labelFor(type) {
  return DROPS[type] ? DROPS[type].label : type;
}

export function freshWeapon() {
  return { type: 'pulse', level: 1 };
}

export function freshPlayer() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: PLAYER.maxHp,
    r: PLAYER.r,
    shield: 0,
    bombs: 1,
    invuln: 0,
    weapon: freshWeapon(),
  };
}

export { WEAPON_TYPES };
