// Browser smoke test: loads the real game in headless Chrome, drives it, checks
// for runtime errors, and verifies gameplay actually happens. Also runs a fast
// in-page deterministic simulation to exercise long-run behavior (bosses,
// bombs, weapon swaps, death) and captures screenshots for visual review.
import { startServer } from './server.mjs';
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

const SHOT_DIR = fileURLToPath(new URL('../shots/', import.meta.url));

function assert(cond, msg) {
  if (!cond) { throw new Error('ASSERT FAILED: ' + msg); }
  console.log('  ✔ ' + msg);
}

const { existsSync } = await import('node:fs');
const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('No Chrome/Edge found'); process.exit(2); }

await mkdir(SHOT_DIR, { recursive: true });
const { server, port } = await startServer(0);
const base = `http://127.0.0.1:${port}/`;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-gpu', '--window-size=560,820',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});

const errors = [];
let exitCode = 0;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 560, height: 820, deviceScaleFactor: 2 });
  await page.bringToFront(); // keep requestAnimationFrame running at full rate
  const ignore = (s) => /favicon\.ico/.test(s);
  page.on('console', (m) => { if (m.type() === 'error' && !ignore(m.text())) errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => { if (!ignore(r.url())) errors.push('reqfailed: ' + r.url() + ' ' + r.failure()?.errorText); });

  console.log('\n[1] Load + module init');
  await page.goto(base + 'index.html', { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__STARFALL__ !== undefined', { timeout: 5000 });
  assert(errors.length === 0, 'no errors during load: ' + JSON.stringify(errors));
  assert(await page.evaluate(() => window.__STARFALL__.mode === 'menu'), 'starts in menu mode');
  await page.screenshot({ path: SHOT_DIR + '01-menu.png' });

  console.log('\n[2] Start game + live play (real rAF, ~2.5s, auto-fire)');
  await page.evaluate(() => window.__STARFALL__.startGame());
  // Simulate holding fire + drifting to exercise input path.
  await page.keyboard.down(' ');
  await new Promise((r) => setTimeout(r, 1200));
  await page.keyboard.down('ArrowLeft');
  await new Promise((r) => setTimeout(r, 700));
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await new Promise((r) => setTimeout(r, 700));
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up(' ');

  const live = await page.evaluate(() => {
    const g = window.__STARFALL__.game;
    return {
      mode: window.__STARFALL__.mode,
      state: g.state,
      pbullets: g.pbullets.length,
      shots: g.stats.shots,
      enemiesSeen: g.nextId,
      time: g.time,
    };
  });
  assert(live.mode === 'playing', 'in playing mode');
  assert(live.state === 'playing', 'player alive after 2.5s');
  assert(live.shots > 0, `fired shots (${live.shots})`);
  // Headless rAF is throttled, so wall-clock ≠ sim time; just confirm it advanced.
  assert(live.time > 0.2, `sim time advanced (${live.time.toFixed(2)}s)`);
  await page.screenshot({ path: SHOT_DIR + '02-playing.png' });

  console.log('\n[3] Deterministic long-run simulation (exercise everything)');
  // Drive game.update directly in-page with scripted "god" input so we can
  // fast-forward through bosses, weapon swaps, bombs and death, catching any
  // thrown error over thousands of frames.
  const sim = await page.evaluate(async () => {
    const g = window.__STARFALL__.game;
    g.reset();
    const events = { bossesSpawned: 0, bossesKilled: 0, drops: 0, weaponSwaps: 0, maxEnemies: 0, bombsUsed: 0 };
    const seenWeapons = new Set([g.player.weapon.type]);
    let lastBoss = null;
    let err = null;
    const dt = 1 / 60;
    try {
      for (let frame = 0; frame < 60 * 120; frame++) { // 120s of sim
        // God-mode: keep player healthy so we reach late game & bosses.
        g.player.hp = 100;
        g.player.invuln = Math.max(g.player.invuln, 0.1);
        // Steer toward nearest drop to force pickups; else hover mid.
        let tx = g.w / 2, ty = g.h - 90;
        if (g.drops.length) { tx = g.drops[0].x; ty = g.drops[0].y; }
        const input = {
          pointer: true, moveX: tx, moveY: ty,
          dirX: 0, dirY: 0, firing: true,
          bomb: (frame % 400 === 399), // periodically bomb
        };
        const bombsBefore = g.player.bombs;
        g.update(dt, input);
        if (g.player.bombs < bombsBefore) events.bombsUsed++;
        events.maxEnemies = Math.max(events.maxEnemies, g.enemies.length);
        seenWeapons.add(g.player.weapon.type);
        if (g.boss && g.boss !== lastBoss) { events.bossesSpawned++; lastBoss = g.boss; }
        if (!g.boss && lastBoss) { events.bossesKilled++; lastBoss = null; }
        // Nudge boss dead quickly so we cycle to the next one.
        if (g.boss && frame % 3 === 0) g._hitEnemy(g.boss, g.enemies.indexOf(g.boss), 60, g.boss.x, g.boss.y);
      }
      events.weaponSwaps = seenWeapons.size;
      events.finalScore = g.score.value;
      events.kills = g.stats.kills;
    } catch (e) {
      err = (e && e.stack) || String(e);
    }
    return { err, events, score: g.score.value };
  });
  assert(sim.err === null, 'no exception over 120s deterministic sim' + (sim.err ? '\n' + sim.err : ''));
  assert(sim.events.kills > 50, `killed many enemies (${sim.events.kills})`);
  assert(sim.events.bossesSpawned >= 1, `boss(es) spawned (${sim.events.bossesSpawned})`);
  assert(sim.events.bossesKilled >= 1, `boss(es) killed & director resumed (${sim.events.bossesKilled})`);
  assert(sim.events.weaponSwaps >= 2, `weapon changed via drops (${sim.events.weaponSwaps} types seen)`);
  assert(sim.events.bombsUsed >= 1, `bombs detonated (${sim.events.bombsUsed})`);
  assert(sim.events.finalScore > 1000, `score accumulated (${sim.events.finalScore})`);
  assert(errors.length === 0, 'no runtime errors during sim: ' + JSON.stringify(errors));

  console.log('\n[4] Death → GAME OVER overlay (end-to-end via real loop)');
  await page.evaluate(() => {
    const S = window.__STARFALL__;
    S.startGame();
    const g = S.game;
    g.player.shield = 0; g.player.invuln = 0;
    g._damagePlayer(9999, g.player.x, g.player.y); // force death; loop drives the transition
  });
  assert(await page.evaluate(() => window.__STARFALL__.game.state === 'dead'), 'player death handled → state dead');
  // The main loop advances a ~1.6s dead-timer before showing the overlay.
  let gover = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const st = await page.evaluate(() => ({
      mode: window.__STARFALL__.mode,
      dt: window.__STARFALL__.deadTimer,
      f: window.__STARFALL__.frameCount,
    }));
    if (st.mode === 'gameover') { gover = true; break; }
    if (i === 20) console.log('    …still waiting:', JSON.stringify(st));
  }
  assert(gover, 'mode transitioned to gameover');
  await page.screenshot({ path: SHOT_DIR + '03-game-over.png' });

  console.log('\n[5] Render a live juicy frame for visual review');
  await page.evaluate(() => {
    const S = window.__STARFALL__;
    S.startGame();
    const g = S.game;
    // Seed a lively scene: spawn a spread of enemies + a boss + drops.
    for (let i = 0; i < 8; i++) g._spawnEnemy({ type: ['grunt','weaver','darter','gunner','tank'][i%5], x: 60+i*45, y: 120+(i%3)*60, hp: 30, maxHp: 30, speed: 60, phase: i });
    g.player.weapon = { type: 'spread', level: 4 };
  });
  await page.keyboard.down(' ');
  await new Promise((r) => setTimeout(r, 900));
  await page.keyboard.up(' ');
  await page.screenshot({ path: SHOT_DIR + '04-action.png' });

  console.log('\nAll smoke checks passed. Screenshots in test/shots/.');
} catch (e) {
  console.error('\nSMOKE TEST FAILED:\n', e.message);
  exitCode = 1;
} finally {
  await browser.close();
  server.close();
  if (errors.length) {
    console.error('\nCollected page errors:\n' + errors.join('\n'));
  }
  process.exit(exitCode);
}
