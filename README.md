# ✦ STARFALL

A juicy neon **vertical shooter** with drop-based weapon upgrades, escalating
difficulty, and a boss every 75 seconds. Pure vanilla JavaScript + Canvas —
no build step, no runtime dependencies.

## Play

Because the game uses ES modules, it must be served over HTTP (not opened as a
`file://`). Any static server works:

```bash
npm run serve          # → http://127.0.0.1:8080/
# or
npx serve .            # any static host is fine
```

Then open the printed URL.

### Controls

| Action | Keys |
| --- | --- |
| Move | **Mouse / drag** · `W A S D` · Arrow keys |
| Fire | Auto while dragging · `Space` · `J` |
| Nova bomb | `Shift` · `B` |
| Pause | `P` · `Esc` |
| Mute | `M` |

Drag anywhere on the play area to fly **and** auto-fire at once — the ship
smoothly chases your pointer.

## Weapons

Enemies drop gems. Collect them to power up, or grab a different weapon crate to
swap loadouts. Each weapon levels independently (up to Lv6).

| Gem | Weapon | Feel |
| --- | --- | --- |
| 🔵 Pulse | fast straight shots, more barrels as it levels |
| 🟡 Scatter | wide fan of pellets — crowd control |
| 🟣 Lance | piercing high-rate beam — cuts through lines |
| 🔴 Swarm | homing missiles with splash damage |
| 🟢 Power | +1 level to your current weapon |
| ♥ / ◈ / ✸ | repair hull · shield · nova bomb |

## Juice

Trauma-based screen shake, hit-stop, particle explosions with shockwave rings,
debris & smoke, parallax starfield + drifting nebulae, additive-blend glow on
everything, combo multiplier, floating damage/score text, pickup magnet, weapon
flashes, boss slow-mo on death, full-screen bomb nova, vignette + scanlines, and
a fully procedural WebAudio soundtrack & SFX (no audio files).

## Architecture

All gameplay logic lives in **pure, DOM-free modules** so it can be unit-tested
in Node; the DOM/canvas layer is a thin shell on top.

```
src/
  math.js        vectors, seedable RNG, easing        (pure)
  collision.js   circle overlap, culling              (pure)
  config.js      balance data + difficulty scaling    (pure)
  weapons.js     firing → projectile descriptors      (pure)
  weapon-util.js shared weapon helpers                 (pure)
  upgrades.js    drop rolls + pickup application       (pure)
  spawn.js       wave/boss director                    (pure)
  score.js       combo + multiplier                    (pure)
  particles.js   capped particle pool
  audio.js       procedural WebAudio SFX + pad
  render.js      neon drawing, starfield, HUD helpers
  game.js        simulation: entities, collisions, fx
  input.js       keyboard + pointer/touch
  main.js        state machine, loop, HUD, menus
```

## Tests

```bash
npm test      # Node unit tests for all pure logic (weapons, drops, spawns, score)
npm run smoke # headless-Chrome test: loads the real game, drives 120s of
              # simulation, verifies bosses/bombs/weapon-swaps/death, screenshots
```

`npm run smoke` needs Chrome or Edge installed (it drives the real page via
`puppeteer-core`) and writes screenshots to `test/shots/`.
