// Bootstrap: canvas setup, game-state machine (menu → playing → gameover),
// the main loop, and HUD / overlay drawing.
import { WORLD, WEAPONS } from './config.js';
import { Game } from './game.js';
import { Renderer, Starfield, roundRect } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { makeRng, clamp } from './math.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = WORLD.width * DPR;
canvas.height = WORLD.height * DPR;
ctx.scale(DPR, DPR);

function resize() {
  const pad = 24;
  const availW = window.innerWidth - pad;
  const availH = window.innerHeight - pad;
  const scale = Math.min(availW / WORLD.width, availH / WORLD.height);
  canvas.style.width = `${Math.floor(WORLD.width * scale)}px`;
  canvas.style.height = `${Math.floor(WORLD.height * scale)}px`;
}
window.addEventListener('resize', resize);
resize();

const audio = new Audio();
const input = new Input(canvas);
const renderer = new Renderer(ctx, WORLD.width, WORLD.height);
const menuRng = makeRng(7);
const stars = new Starfield(WORLD.width, WORLD.height, menuRng);
let game = new Game(audio, (Date.now?.() ?? 1) & 0xffffff);

let mode = 'menu';           // 'menu' | 'playing' | 'paused' | 'gameover'
let deadTimer = 0;
let last = performance.now();
let uiPulse = 0;
let frameCount = 0;

const mutedKey = 'starfall.muted';
audio.setMuted(localStorage.getItem(mutedKey) === '1');

function startGame() {
  audio.resume();
  game.reset();
  mode = 'playing';
  deadTimer = 0;
}

// Global gesture to advance from menu/gameover screens.
function handleAdvance() {
  if (mode === 'menu') startGame();
  else if (mode === 'gameover') startGame();
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'enter' || (k === ' ' && (mode === 'menu' || mode === 'gameover'))) {
    handleAdvance();
  }
  if (k === 'p' || k === 'escape') {
    if (mode === 'playing') mode = 'paused';
    else if (mode === 'paused') mode = 'playing';
  }
  if (k === 'm') {
    const nowMuted = !audio.muted;
    audio.setMuted(nowMuted);
    localStorage.setItem(mutedKey, nowMuted ? '1' : '0');
  }
});
canvas.addEventListener('pointerdown', () => {
  if (mode === 'menu' || mode === 'gameover') handleAdvance();
});

// -------------------------------------------------------------------- loop
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // avoid spiral after tab-away
  uiPulse += dt;
  frameCount++;

  if (mode === 'playing') {
    const snap = input.snapshot();
    game.update(dt, snap);
    input.endFrame();
    if (game.state === 'dead') {
      deadTimer += dt;
      if (deadTimer > 1.6) mode = 'gameover';
    }
    stars.update(dt, 1 + game.trauma);
  } else if (mode === 'paused') {
    stars.update(dt * 0.15);
  } else {
    stars.update(dt);
  }

  render();
  requestAnimationFrame(frame);
}

function render() {
  renderer.clearBackground();

  // Camera shake.
  ctx.save();
  if (mode === 'playing' || mode === 'paused' || (mode === 'gameover')) {
    ctx.translate(game.shakeX || 0, game.shakeY || 0);
  }
  stars.draw(ctx);

  if (mode === 'menu') {
    drawMenu();
  } else {
    drawScene();
    if (mode === 'paused') drawPause();
    if (mode === 'gameover') drawGameOver();
  }
  ctx.restore();

  renderer.vignette();
  // Scanline sheen for a bit of arcade CRT flavor.
  drawScanlines();
}

function drawScene() {
  const g = game;
  // Drops (under everything so pickups read clearly against ships).
  for (const d of g.drops) renderer.drawDrop(d, g.time);
  // Enemy bullets.
  for (const b of g.ebullets) renderer.drawBullet(b);
  // Enemies.
  for (const e of g.enemies) renderer.drawEnemy(e, g.time);
  // Player bullets.
  for (const b of g.pbullets) renderer.drawBullet(b);
  // Player.
  if (g.state !== 'dead') {
    const snap = mode === 'playing' ? input.snapshot() : { dirY: 0 };
    const thrust = clamp(-(snap.dirY || 0), 0, 1);
    renderer.drawPlayer(g.player, g.time, thrust);
  }
  // Particles + floaters on top.
  renderer.drawParticles(g.particles);
  renderer.drawFloaters(g.floaters);
  // Full-screen flashes.
  renderer.flash(g.flashColor, g.flashAlpha);
  // HUD (drawn without shake for readability — reset transform locally).
  ctx.save();
  ctx.translate(-(game.shakeX || 0), -(game.shakeY || 0));
  drawHUD();
  ctx.restore();
}

// -------------------------------------------------------------------- HUD
function drawHUD() {
  const g = game;
  const p = g.player;
  ctx.save();
  ctx.textBaseline = 'top';

  // Score (top-left).
  ctx.textAlign = 'left';
  ctx.fillStyle = '#eaffff';
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.shadowColor = '#7cf6ff'; ctx.shadowBlur = 8;
  ctx.fillText(g.score.value.toLocaleString(), 12, 10);
  ctx.shadowBlur = 0;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(180,220,255,0.7)';
  ctx.fillText(`WAVE ${g.director.wave}`, 12, 36);

  // Combo multiplier (top-left under wave).
  if (g.score.combo > 1) {
    const pulse = 1 + 0.1 * Math.sin(uiPulse * 12);
    ctx.save();
    ctx.translate(12, 52);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = g.score.combo > 4 ? '#ffd166' : '#7cf6ff';
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
    ctx.fillText(`x${g.score.multiplier.toFixed(1)}`, 0, 0);
    ctx.restore();
  }

  // Weapon (top-right).
  const wdef = WEAPONS[p.weapon.type];
  ctx.textAlign = 'right';
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.fillStyle = wdef.color;
  ctx.shadowColor = wdef.color; ctx.shadowBlur = 8;
  ctx.fillText(wdef.name.toUpperCase(), WORLD.width - 12, 10);
  ctx.shadowBlur = 0;
  // Level pips.
  const pipR = 3.5, gap = 10, total = wdef.max;
  for (let i = 0; i < total; i++) {
    const x = WORLD.width - 12 - i * gap;
    ctx.beginPath();
    ctx.arc(x, 34, pipR, 0, Math.PI * 2);
    if (i < p.weapon.level) {
      ctx.fillStyle = wdef.color;
      ctx.shadowColor = wdef.color; ctx.shadowBlur = 6;
      ctx.fill();
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1; ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  // Bombs (top-right, below pips).
  ctx.textAlign = 'right';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('✸'.repeat(Math.max(0, p.bombs)) || '—', WORLD.width - 12, 44);

  // Shields (small icons near hull bar).
  // Hull bar (bottom).
  const barW = WORLD.width - 24, barH = 10, bx = 12, by = WORLD.height - 22;
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, bx, by, barW, barH, 5); ctx.fill();
  const hpv = clamp(p.hp / 100, 0, 1);
  const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
  if (hpv > 0.5) { grad.addColorStop(0, '#39d98a'); grad.addColorStop(1, '#7dff8f'); }
  else if (hpv > 0.25) { grad.addColorStop(0, '#ffb84d'); grad.addColorStop(1, '#ffd166'); }
  else { grad.addColorStop(0, '#ff4d6d'); grad.addColorStop(1, '#ff7a90'); }
  ctx.fillStyle = grad;
  if (hpv > 0) { roundRect(ctx, bx, by, barW * hpv, barH, 5); ctx.fill(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  roundRect(ctx, bx, by, barW, barH, 5); ctx.stroke();
  ctx.fillStyle = '#eaffff';
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('HULL', bx + 4, by + barH / 2 + 1);
  if (p.shield > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#66e0ff';
    ctx.fillText('◈'.repeat(p.shield), bx + barW - 4, by + barH / 2 + 1);
  }

  // New-weapon toast (center).
  if (g.newWeaponToast) {
    const a = clamp(g.newWeaponToast.life / 0.4, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#7cf6ff'; ctx.shadowBlur = 12;
    ctx.fillText(g.newWeaponToast.name, WORLD.width / 2, WORLD.height * 0.4);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// -------------------------------------------------------------------- menu
function drawMenu() {
  const cx = WORLD.width / 2;
  ctx.save();
  ctx.textAlign = 'center';
  // Title.
  const bob = Math.sin(uiPulse * 1.5) * 4;
  ctx.font = '900 58px system-ui, sans-serif';
  const g = ctx.createLinearGradient(0, 140, 0, 210);
  g.addColorStop(0, '#7cf6ff'); g.addColorStop(1, '#c17bff');
  ctx.fillStyle = g;
  ctx.shadowColor = '#7cf6ff'; ctx.shadowBlur = 24;
  ctx.fillText('STARFALL', cx, 150 + bob);
  ctx.shadowBlur = 0;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,230,255,0.75)';
  ctx.fillText('a juicy vertical shooter', cx, 220 + bob);

  // Prompt.
  const blink = 0.55 + 0.45 * Math.sin(uiPulse * 3);
  ctx.globalAlpha = blink;
  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.fillText('CLICK or PRESS ENTER', cx, 340);
  ctx.globalAlpha = 1;

  // Controls.
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,220,255,0.65)';
  const lines = [
    'MOVE   mouse / drag  •  WASD / arrows',
    'FIRE   auto while dragging  •  Space / J',
    'BOMB   Shift / B     •   PAUSE   P / Esc',
    'MUTE   M',
  ];
  lines.forEach((l, i) => ctx.fillText(l, cx, 430 + i * 26));

  // Weapon legend.
  ctx.font = '700 12px system-ui, sans-serif';
  const wk = Object.keys(WEAPONS);
  wk.forEach((key, i) => {
    const x = cx - (wk.length - 1) * 55 / 2 + i * 55;
    ctx.fillStyle = WEAPONS[key].color;
    ctx.shadowColor = WEAPONS[key].color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(x, 570, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(220,235,255,0.7)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText(WEAPONS[key].name.split(' ')[0], x, 588);
  });
  ctx.fillStyle = 'rgba(180,200,230,0.5)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText('collect drops to upgrade & swap weapons', cx, 620);
  ctx.restore();
}

function drawPause() {
  dimScreen(0.5);
  const cx = WORLD.width / 2, cy = WORLD.height / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaffff';
  ctx.font = '900 40px system-ui, sans-serif';
  ctx.shadowColor = '#7cf6ff'; ctx.shadowBlur = 16;
  ctx.fillText('PAUSED', cx, cy - 20);
  ctx.shadowBlur = 0;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,225,255,0.75)';
  ctx.fillText('press P or Esc to resume', cx, cy + 20);
  ctx.restore();
}

function drawGameOver() {
  dimScreen(0.62);
  const g = game;
  const cx = WORLD.width / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 46px system-ui, sans-serif';
  ctx.fillStyle = '#ff5a7a';
  ctx.shadowColor = '#ff2b4e'; ctx.shadowBlur = 20;
  ctx.fillText('GAME OVER', cx, 220);
  ctx.shadowBlur = 0;

  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(210,230,255,0.8)';
  ctx.fillText('FINAL SCORE', cx, 290);
  ctx.font = '900 40px system-ui, sans-serif';
  ctx.fillStyle = '#ffd166';
  ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12;
  ctx.fillText(g.score.value.toLocaleString(), cx, 320);
  ctx.shadowBlur = 0;

  const stats = [
    ['WAVE REACHED', g.director.wave],
    ['ENEMIES DOWN', g.stats.kills],
    ['ACCURACY', `${g.accuracy}%`],
    ['TIME', `${Math.floor(g.time)}s`],
  ];
  ctx.font = '600 14px system-ui, sans-serif';
  stats.forEach(([label, val], i) => {
    const y = 380 + i * 30;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(190,215,250,0.7)';
    ctx.fillText(label, cx - 110, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#eaffff';
    ctx.fillText(String(val), cx + 110, y);
  });

  const blink = 0.55 + 0.45 * Math.sin(uiPulse * 3);
  ctx.globalAlpha = blink;
  ctx.textAlign = 'center';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = '#7cf6ff';
  ctx.fillText('CLICK or PRESS ENTER to retry', cx, 540);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function dimScreen(a) {
  ctx.save();
  ctx.fillStyle = `rgba(4,6,15,${a})`;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.restore();
}

function drawScanlines() {
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = '#000';
  for (let y = 0; y < WORLD.height; y += 3) ctx.fillRect(0, y, WORLD.width, 1);
  ctx.restore();
}

requestAnimationFrame((t) => { last = t; frame(t); });

// Expose for smoke testing in a headless browser.
window.__STARFALL__ = {
  get game() { return game; },
  get mode() { return mode; },
  get deadTimer() { return deadTimer; },
  get frameCount() { return frameCount; },
  startGame,
};
