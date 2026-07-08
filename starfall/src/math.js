// Pure math + helpers. No DOM. Safe to unit-test in Node.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const len = (x, y) => Math.hypot(x, y);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

export const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

// Approach `target` from `current` by at most `maxDelta` (frame-rate-scaled by caller).
export const approach = (current, target, maxDelta) => {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
};

// Smoothly rotate `current` angle toward `target` by at most `maxStep` radians.
export const rotateToward = (current, target, maxStep) => {
  let diff = ((target - current + Math.PI) % TAU) - Math.PI;
  if (diff < -Math.PI) diff += TAU;
  if (diff > maxStep) diff = maxStep;
  if (diff < -maxStep) diff = -maxStep;
  return current + diff;
};

// Deterministic seedable RNG (mulberry32) — used so tests are reproducible.
export function makeRng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  const rng = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  rng.int = (lo, hi) => Math.floor(rng.range(lo, hi + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}
