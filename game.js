class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;

        this.state = 'start'; // start, playing, gameOver
        this.score = 0;
        this.wave = 1;
        this.waveKills = 0;
        this.waveEnemiesKilled = 0;
        this.waveEnemiesNeeded = 5;

        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.pickups = [];
        this.particleSystem = new ParticleSystem();

        this.spawnTimer = 0;
        this.spawnRate = 120;
        this.mouseX = this.canvas.width / 2;
        this.mouseY = this.canvas.height / 2;

        this.screenShake = 0;
        this.killCombo = 0;
        this.lastKillTime = 0;

        this.setupEventListeners();
        this.draw();
    }

    setupEventListeners() {
        document.getElementById('startBtn').addEventListener('click', () => this.startGame());
        document.getElementById('restartBtn').addEventListener('click', () => this.startGame());

        document.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
        });

        document.addEventListener('click', () => {
            if (this.state === 'playing' && this.player) {
                const bullets = this.player.shoot();
                this.bullets.push(...bullets);
                if (bullets.length > 0) {
                    this.playSound(this.player.activeWeapon);
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (this.state === 'playing' && this.player) {
                if (e.key === '1') this.switchWeapon(1);
                if (e.key === '2') this.switchWeapon(2);
                if (e.key === '3') this.switchWeapon(3);
                if (e.key === ' ') {
                    e.preventDefault();
                    this.player.autoFire = !this.player.autoFire;
                }
            }
        });
    }

    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.wave = 1;
        this.waveKills = 0;
        this.waveEnemiesKilled = 0;
        this.waveEnemiesNeeded = 5;

        this.player = new Player(this.canvas.width / 2, this.canvas.height - 80);
        this.enemies = [];
        this.bullets = [];
        this.enemyBullets = [];
        this.pickups = [];
        this.particleSystem = new ParticleSystem();

        this.spawnTimer = 0;
        this.spawnRate = 120;

        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('gameOverScreen').classList.add('hidden');
    }

    switchWeapon(weaponNum) {
        if (this.player.weapons[weaponNum].level > 0) {
            this.player.activeWeapon = weaponNum;
            this.updateWeaponUI();
            this.playSound('switch');
        }
    }

    updateWeaponUI() {
        document.querySelectorAll('.weapon-info').forEach(el => el.classList.remove('active'));
        document.querySelector(`.weapon-info[data-weapon="${this.player.activeWeapon}"]`).classList.add('active');
        for (let i = 1; i <= 3; i++) {
            const el = document.querySelector(`.weapon-info[data-weapon="${i}"] .weapon-level`);
            const level = this.player.weapons[i].level;
            el.textContent = `Lv${level}`;
            el.style.color = level === 0 ? '#444' : '#888';
        }
    }

    update() {
        if (this.state !== 'playing') return;

        // Player update
        this.player.update(this.mouseX, this.mouseY, this.canvas.width, this.canvas.height);

        // Auto fire
        if (this.player.autoFire) {
            const bullets = this.player.shoot();
            this.bullets.push(...bullets);
            if (bullets.length > 0) {
                this.playSound(this.player.activeWeapon);
            }
        }

        // Enemy spawning with scaling difficulty
        this.spawnTimer--;
        if (this.spawnTimer <= 0) {
            const difficultyMultiplier = 1 + (this.wave - 1) * 0.15;
            this.spawnRate = Math.max(30, 120 - this.wave * 8);
            this.spawnTimer = this.spawnRate;

            let types = ['basic', 'weak'];
            if (this.wave >= 2) types.push('fast');
            if (this.wave >= 3) types.push('armored');
            if (this.wave >= 5) {
                types = ['armored', 'fast', 'basic'];
            }

            const type = types[Math.floor(Math.random() * types.length)];
            const x = Math.random() * (this.canvas.width - 60) + 30;
            this.enemies.push(new Enemy(x, -25, type));
        }

        // Enemy updates
        for (let enemy of this.enemies) {
            enemy.update(this.player.x, this.player.y);

            if (Math.random() < 0.01) { // Enemy shoot chance
                const bullet = enemy.shoot();
                if (bullet) this.enemyBullets.push(bullet);
            }
        }

        // Bullet updates
        for (let bullet of this.bullets) {
            bullet.update();
        }

        // Enemy bullet updates
        for (let bullet of this.enemyBullets) {
            bullet.update();
        }

        // Pickup updates
        for (let pickup of this.pickups) {
            pickup.update();
        }

        // Collision detection - player bullets vs enemies
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            let hit = false;

            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                const dx = bullet.x - enemy.x;
                const dy = bullet.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 20) {
                    hit = true;
                    enemy.takeDamage(bullet.damage);

                    if (bullet.type === 'laser') {
                        this.particleSystem.laserHit(bullet.x, bullet.y);
                    } else if (bullet.type === 'spread') {
                        this.particleSystem.spreadHit(bullet.x, bullet.y);
                    }

                    if (enemy.isDead()) {
                        const timeSinceLastKill = performance.now() - this.lastKillTime;
                        if (timeSinceLastKill < 2000) {
                            this.killCombo++;
                        } else {
                            this.killCombo = 1;
                        }
                        this.lastKillTime = performance.now();

                        const comboMultiplier = 1 + (this.killCombo - 1) * 0.1;
                        this.score += Math.floor(enemy.value * comboMultiplier);
                        this.waveEnemiesKilled++;
                        this.screenShake = Math.min(10, this.killCombo);
                        this.particleSystem.explosion(enemy.x, enemy.y, '#ff6b00', 20 + this.killCombo * 2);
                        this.playSound('explosion');

                        // Weapon drops
                        if (Math.random() < enemy.dropChance) {
                            const dropType = Math.random();
                            let type = 'health';
                            if (dropType < 0.35) type = 'weapon1';
                            else if (dropType < 0.65) type = 'weapon2';
                            else if (dropType < 0.9) type = 'weapon3';
                            this.pickups.push(new Pickup(enemy.x, enemy.y, type));
                        }

                        this.enemies.splice(j, 1);
                    }
                    break;
                }
            }

            if (hit || bullet.isOffScreen(this.canvas.width, this.canvas.height)) {
                this.bullets.splice(i, 1);
            }
        }

        // Missile explosions
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            if (bullet instanceof Missile) {
                let exploded = false;
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const enemy = this.enemies[j];
                    const dx = bullet.x - enemy.x;
                    const dy = bullet.y - enemy.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < bullet.explosionRadius) {
                        const dmgFalloff = 1 - (dist / bullet.explosionRadius);
                        enemy.takeDamage(bullet.damage * dmgFalloff);

                        if (enemy.isDead()) {
                            const timeSinceLastKill = performance.now() - this.lastKillTime;
                            if (timeSinceLastKill < 2000) {
                                this.killCombo++;
                            } else {
                                this.killCombo = 1;
                            }
                            this.lastKillTime = performance.now();

                            const comboMultiplier = 1 + (this.killCombo - 1) * 0.1;
                            this.score += Math.floor(enemy.value * comboMultiplier);
                            this.waveEnemiesKilled++;
                            this.screenShake = Math.min(12, this.killCombo);
                            this.particleSystem.explosion(enemy.x, enemy.y, '#ff6b00', 20 + this.killCombo * 2);
                            this.playSound('explosion');

                            if (Math.random() < enemy.dropChance) {
                                const dropType = Math.random();
                                let type = 'health';
                                if (dropType < 0.35) type = 'weapon1';
                                else if (dropType < 0.65) type = 'weapon2';
                                else if (dropType < 0.9) type = 'weapon3';
                                this.pickups.push(new Pickup(enemy.x, enemy.y, type));
                            }

                            this.enemies.splice(j, 1);
                        }
                        exploded = true;
                    }
                }

                if (exploded || bullet.y > this.canvas.height) {
                    if (exploded) this.particleSystem.missileHit(bullet.x, bullet.y);
                    this.bullets.splice(i, 1);
                }
            }
        }

        // Enemy bullets vs player
        for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
            const bullet = this.enemyBullets[i];
            const dx = bullet.x - this.player.x;
            const dy = bullet.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 20) {
                if (this.player.takeDamage(bullet.damage)) {
                    this.particleSystem.damageFlash(this.player.x, this.player.y);
                    this.playSound('damage');
                }
                this.enemyBullets.splice(i, 1);
            } else if (bullet.isOffScreen(this.canvas.width, this.canvas.height)) {
                this.enemyBullets.splice(i, 1);
            }
        }

        // Pickup collection
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pickup = this.pickups[i];
            const dx = pickup.x - this.player.x;
            const dy = pickup.y - this.player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 25) {
                if (pickup.type === 'health') {
                    this.player.heal(50);
                } else {
                    const weaponNum = parseInt(pickup.type.replace('weapon', ''));
                    this.player.upgradeWeapon(weaponNum);
                    this.updateWeaponUI();
                }

                this.particleSystem.pickupSparkle(pickup.x, pickup.y, pickup.type === 'health' ? '#ff0000' : '#00ff88');
                this.playSound('pickup');
                this.pickups.splice(i, 1);
            } else if (pickup.isDead()) {
                this.pickups.splice(i, 1);
            }
        }

        // Clean up off-screen enemies
        this.enemies = this.enemies.filter(e => !e.isOffScreen(this.canvas.width, this.canvas.height));

        // Wave progression
        if (this.waveEnemiesKilled >= this.waveEnemiesNeeded) {
            this.wave++;
            this.waveEnemiesKilled = 0;
            this.waveEnemiesNeeded = 5 + this.wave * 2;
            this.score += 500 * this.wave;
            this.playSound('waveComplete');
        }

        // Game over check
        if (this.player.isDead()) {
            this.endGame();
        }

        // Particle update
        this.particleSystem.update();

        this.updateHUD();
    }

    updateHUD() {
        document.getElementById('score').textContent = `Score: ${this.score}`;
        document.getElementById('health').textContent = `HP: ${Math.max(0, this.player.health)}`;
        const waveText = this.killCombo > 1 ? `Wave: ${this.wave} [${this.killCombo}x]` : `Wave: ${this.wave}`;
        document.getElementById('wave').textContent = waveText;
    }

    endGame() {
        this.state = 'gameOver';
        const gameOverScreen = document.getElementById('gameOverScreen');
        document.getElementById('finalScore').textContent = `Final Score: ${this.score}`;
        document.getElementById('finalWave').textContent = `Wave Reached: ${this.wave}`;
        document.getElementById('finalStats').textContent = `Enemies Defeated: ${this.waveEnemiesKilled}`;
        gameOverScreen.classList.remove('hidden');
    }

    playSound(type) {
        // Web Audio API - simple beep-like sounds without needing audio files
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.connect(gain);
        gain.connect(audioContext.destination);

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        if (type === 1 || type === 'laser') { // Laser - high pitch
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 2 || type === 'spread') { // Spread - medium pitch
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);
        } else if (type === 3 || type === 'missile') { // Missile - low pitch whoosh
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'explosion') {
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'pickup') {
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'damage') {
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } else if (type === 'waveComplete') {
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    }

    draw() {
        // Screen shake effect
        let shakeX = 0;
        let shakeY = 0;
        if (this.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * this.screenShake;
            shakeY = (Math.random() - 0.5) * this.screenShake;
            this.screenShake *= 0.9;
        }

        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);

        // Background
        this.ctx.fillStyle = '#0a0e27';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Animated starfield
        for (let i = 0; i < 100; i++) {
            const x = (i * 73) % this.canvas.width;
            const y = (i * 97 + this.wave * 20) % this.canvas.height;
            const brightness = 0.2 + Math.sin(i + this.wave * 0.1) * 0.2;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            this.ctx.fillRect(x, y, 1, 1);
        }

        if (this.state === 'playing' && this.player) {
            // Draw game entities
            for (let enemy of this.enemies) {
                enemy.draw(this.ctx);
            }

            for (let bullet of this.bullets) {
                bullet.draw(this.ctx);
            }

            for (let bullet of this.enemyBullets) {
                bullet.draw(this.ctx);
            }

            for (let pickup of this.pickups) {
                pickup.draw(this.ctx);
            }

            // Particles
            this.particleSystem.draw(this.ctx);

            // Player
            this.player.draw(this.ctx);

            // Draw crosshair
            const crosshairSize = 15;
            this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(this.mouseX - crosshairSize, this.mouseY);
            this.ctx.lineTo(this.mouseX + crosshairSize, this.mouseY);
            this.ctx.moveTo(this.mouseX, this.mouseY - crosshairSize);
            this.ctx.lineTo(this.mouseX, this.mouseY + crosshairSize);
            this.ctx.stroke();

            // Draw circle
            this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
            this.ctx.beginPath();
            this.ctx.arc(this.mouseX, this.mouseY, 25, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        this.ctx.restore();

        requestAnimationFrame(() => {
            this.update();
            this.draw();
        });
    }
}

// Initialize game
const game = new Game();
