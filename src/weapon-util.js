// Shared weapon helpers built on top of the config data.
import { WEAPONS as WEAPON_DEFS } from './config.js';
import { clamp } from './math.js';

export const WEAPONS = WEAPON_DEFS;

export const clampLevel = (type, level) => clamp(level | 0, 1, WEAPON_DEFS[type].max);

export const weaponMax = (type) => WEAPON_DEFS[type].max;
