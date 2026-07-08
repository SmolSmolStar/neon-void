// Pure score + combo system. No DOM.
import { SCORE } from './config.js';

export function makeScore() {
  return { value: 0, combo: 0, comboTimer: 0, best: 0, multiplier: 1 };
}

// Register a kill worth `base` points. Extends the combo.
export function addKill(state, base) {
  state.combo += 1;
  state.comboTimer = SCORE.comboWindow;
  const tier = Math.min(state.combo, SCORE.comboMax);
  state.multiplier = 1 + (tier - 1) * SCORE.comboStep;
  const gained = Math.round(base * state.multiplier);
  state.value += gained;
  if (state.value > state.best) state.best = state.value;
  return gained;
}

// Decay the combo window over time. Returns true if the combo just broke.
export function tickScore(state, dt) {
  if (state.combo > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 0;
      state.multiplier = 1;
      return true;
    }
  }
  return false;
}
