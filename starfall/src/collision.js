// Pure collision helpers. No DOM.
import { dist2 } from './math.js';

// Circle vs circle overlap.
export const circleHit = (ax, ay, ar, bx, by, br) => {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
};

// Generic overlap for entities exposing {x, y, r}.
export const entitiesHit = (a, b) => circleHit(a.x, a.y, a.r, b.x, b.y, b.r);

// Is a point (or small circle) outside an expanded world box? Used for culling.
export const outOfBounds = (e, w, h, margin = 80) =>
  e.x < -margin || e.x > w + margin || e.y < -margin || e.y > h + margin;
