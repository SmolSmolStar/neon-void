# STELLAR SHOOTER 🎮

A beautiful, fast-paced vertical arcade shooter with upgradeable weapons, enemy variety, and progressive difficulty.

## Features ✨

### Gameplay
- **Three Unique Weapon Systems**
  - **Laser**: Fast, accurate shots. Upgrades add spread pattern
  - **Spread**: Fires multiple shots in a fan pattern. More projectiles at higher levels
  - **Missile**: Powerful shots with explosion radius damage. Better splash at upgrades

- **Weapon Upgrade Drops**: Defeat enemies to collect weapon upgrades that permanently enhance your arsenal
  - Level 1: Unlock weapon
  - Level 2: Better fire rate and damage
  - Level 3: Maximum effectiveness with perfect balance

- **Kill Combo System**: Chain rapid kills within 2 seconds for score multipliers
  - 1-3 kills = 1.1x-1.3x multiplier
  - Combos increase screen shake intensity for visceral feedback
  - Combo counter displayed in real-time HUD

### Enemy Variety
- **Weak Enemies** (Orange): Fast, low health, worth 50 points
- **Basic Enemies** (Purple): Balanced threat, worth 100 points
- **Fast Enemies** (Yellow): Quick moving targets, worth 150 points
- **Armored Enemies** (Red): High health, dangerous, worth 200 points
- Enemy composition scales with wave (Wave 5+ focuses on armored & fast)

### Visual Polish & "Juice"
- **Dynamic Screen Shake**: Intensity increases with kill combos
- **Particle Effects**:
  - Laser hit sparkles (green)
  - Spread impact effects (magenta)
  - Explosion particles (orange)
  - Damage flash feedback (red)
  - Pickup collection sparkles
- **Glow Effects**: All game objects have layered glows for depth
- **Enhanced Player Ship**: Engine trails, shield indicator
- **Beautiful Missile Trails**: Layered glow trails with gravity
- **Animated Starfield**: Breathing background stars
- **Enemy Auras**: Color-coded visual distinction

### Progressive Difficulty
- **Wave System**: Complete wave objectives to advance
  - Wave 1: 5 enemies to defeat
  - Wave 2+: 5 + (wave × 2) enemies
  - Bonus points: 500 × wave number per completed wave

- **Scaling Mechanics**:
  - Enemy spawn rate increases (120 → min 30 frames)
  - Higher waves introduce tougher enemy types
  - Attack patterns remain challenging throughout

### Audio Feedback
- Web Audio API synthesized sound effects
- Unique tones for each weapon type
- Explosion sounds with pitch variation
- Damage impact feedback
- Wave completion fanfare

### Complete UI
- Real-time score display
- Health indicator
- Current wave with combo multiplier
- Weapon selector showing level of each weapon type
- Game over stats (score, wave reached, enemies defeated)
- Start screen with controls guide

## Controls 🎮

| Input | Action |
|-------|--------|
| **Mouse** | Aim position / Move toward cursor |
| **Click** | Fire active weapon |
| **1/2/3** | Switch to Laser/Spread/Missile weapon |
| **Space** | Toggle auto-fire mode |

## Game Rules 📋

- Start with 100 HP
- Collecting health pickups restores 50 HP (50% health pickup chance)
- Taking damage triggers brief invulnerability (30 frames)
- Game ends when health reaches 0
- Weapons unlock at level 1 from drops, then upgrade to max level 3

## Strategy Tips 💡

1. **Weapon Selection**: 
   - Use Laser for precise single targets
   - Switch to Spread when surrounded
   - Deploy Missiles for armored enemies

2. **Positioning**:
   - Stay mid-screen for balanced threat coverage
   - Use edges to escape incoming fire
   - Maintain distance when health is low

3. **Combo Farming**:
   - Prioritize rapid kills for score multipliers
   - Focus on weak enemies early for combo setup
   - Watch the 2-second combo window in HUD

4. **Upgrades**:
   - Collect weapon drops for permanent upgrades
   - All weapons level up equally - no respec needed
   - Higher level weapons have better cooldown and damage

## Technical Details 🔧

- **Engine**: Vanilla JavaScript, HTML5 Canvas
- **Performance**: Optimized for 60 FPS on modern browsers
- **Rendering**: Canvas 2D with transform matrix for screen shake
- **Audio**: Web Audio API for procedural sound synthesis
- **Save State**: Score/wave tracked per session (no persistence)

## File Structure 📁

```
├── index.html          # Main game container and UI
├── game.js             # Core game loop, update, render
├── entities.js         # Player, Enemy, Bullet, Pickup classes
├── particles.js        # Particle system and effects
└── styles.css          # Game and UI styling
```

## How to Play 🚀

1. Open `index.html` in a modern web browser
2. Click **START GAME**
3. Move toward enemies, aim with your mouse
4. Click to shoot or enable auto-fire with Space
5. Defeat enemies to progress waves
6. Collect weapon drops to upgrade your arsenal
7. Achieve high score before you fall!

## Browser Compatibility ✅

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Any browser supporting:
  - Canvas 2D API
  - Web Audio API
  - ES6 JavaScript

## Performance 🎯

- Smooth 60 FPS on mid-range hardware
- Efficient particle pooling
- Optimized collision detection
- Minimal memory footprint (<5MB)

## Game Design Notes 📝

**Difficulty Progression**: The game intentionally gets harder not through sudden spikes but through gradual escalation - more enemies, faster spawns, tougher varieties. This keeps players engaged for longer sessions.

**Juice & Feel**: Every action has visual and audio feedback. Screen shake on kills, particle explosions, glow effects, and synthesized sounds make each interaction feel impactful and satisfying.

**Weapon Balance**: Each weapon fills a different role:
- Laser: High single-target DPS, good range
- Spread: Excellent for crowd control, lower per-bullet damage
- Missile: Unique curved trajectory, excellent for bunched enemies

**Combo System**: Encourages aggressive, skill-based play by rewarding players who defeat enemies rapidly. Also adds an additional layer of feedback through the HUD and screen effects.

## Future Enhancement Ideas 🎨

- Power-up system (shield, rapid fire, slow-motion)
- Boss encounters at wave milestones
- Local high score leaderboard
- Multiple difficulty modes
- Different game modes (survival, time attack)
- Procedural enemy patterns
- Weapon special abilities

---

**Version**: 1.0  
**Created**: 2026  
**Genre**: Vertical Arcade Shooter  
**Playtime**: 2-5 minutes per session  

Made with ❤️ for arcade game enthusiasts!