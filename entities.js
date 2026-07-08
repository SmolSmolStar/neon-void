class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 40;
        this.vx = 0;
        this.vy = 0;
        this.speed = 5;
        this.health = 100;
        this.maxHealth = 100;
        this.invulnerable = 0;
        this.angle = -Math.PI / 2;

        this.weapons = {
            1: { level: 1, cooldown: 0, maxCooldown: 6 },
            2: { level: 0, cooldown: 0, maxCooldown: 8 },
            3: { level: 0, cooldown: 0, maxCooldown: 12 }
        };
        this.activeWeapon = 1;
        this.autoFire = true;
    }

    update(mouseX, mouseY, canvasWidth, canvasHeight) {
        // Aim toward mouse
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        this.angle = Math.atan2(dy, dx);

        // Move toward mouse
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 50) {
            const moveX = (dx / dist) * this.speed;
            const moveY = (dy / dist) * this.speed;
            this.x += moveX;
            this.y += moveY;
        }

        // Bounds
        this.x = Math.max(this.width / 2, Math.min(canvasWidth - this.width / 2, this.x));
        this.y = Math.max(this.height / 2, Math.min(canvasHeight - this.height / 2, this.y));

        // Update invulnerability
        if (this.invulnerable > 0) this.invulnerable--;

        // Update weapon cooldowns
        for (let w = 1; w <= 3; w++) {
            if (this.weapons[w].cooldown > 0) {
                this.weapons[w].cooldown--;
            }
        }
    }

    shoot() {
        const bullets = [];
        const weapon = this.weapons[this.activeWeapon];

        if (weapon.level === 0) return bullets;
        if (weapon.cooldown > 0) return bullets;

        weapon.cooldown = weapon.maxCooldown;

        const bulletSpeed = 8;

        if (this.activeWeapon === 1) { // Laser
            const bx = this.x + Math.cos(this.angle) * 20;
            const by = this.y + Math.sin(this.angle) * 20;
            const vx = Math.cos(this.angle) * bulletSpeed;
            const vy = Math.sin(this.angle) * bulletSpeed;
            bullets.push(new Bullet(bx, by, vx, vy, 'laser', weapon.level));

            if (weapon.level >= 2) {
                bullets.push(new Bullet(bx - 8, by, vx, vy, 'laser', weapon.level));
                bullets.push(new Bullet(bx + 8, by, vx, vy, 'laser', weapon.level));
            }

            if (weapon.level >= 3) {
                bullets.push(new Bullet(bx - 12, by, vx, vy, 'laser', weapon.level));
                bullets.push(new Bullet(bx + 12, by, vx, vy, 'laser', weapon.level));
            }
        } else if (this.activeWeapon === 2) { // Spread
            const angleSpread = Math.PI / 4;
            for (let i = -weapon.level; i <= weapon.level; i++) {
                const angle = this.angle + (i * angleSpread / weapon.level);
                const vx = Math.cos(angle) * bulletSpeed;
                const vy = Math.sin(angle) * bulletSpeed;
                const bx = this.x + Math.cos(angle) * 15;
                const by = this.y + Math.sin(angle) * 15;
                bullets.push(new Bullet(bx, by, vx, vy, 'spread', 1));
            }
        } else if (this.activeWeapon === 3) { // Missile
            const bx = this.x + Math.cos(this.angle) * 20;
            const by = this.y + Math.sin(this.angle) * 20;
            const vx = Math.cos(this.angle) * (bulletSpeed - 1);
            const vy = Math.sin(this.angle) * (bulletSpeed - 1);
            bullets.push(new Missile(bx, by, vx, vy, weapon.level));
        }

        return bullets;
    }

    takeDamage(amount) {
        if (this.invulnerable > 0) return false;
        this.health -= amount;
        this.invulnerable = 30;
        return true;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    upgradeWeapon(weaponType) {
        if (this.weapons[weaponType].level < 3) {
            this.weapons[weaponType].level++;
            if (this.weapons[weaponType].level === 1) {
                this.weapons[weaponType].maxCooldown -= 2;
            } else {
                this.weapons[weaponType].maxCooldown = Math.max(2, this.weapons[weaponType].maxCooldown - 1);
            }
        }
    }

    draw(ctx) {
        ctx.save();

        if (this.invulnerable > 0 && Math.floor(this.invulnerable / 5) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Rotate to face angle
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Engine glow
        ctx.fillStyle = 'rgba(0, 255, 136, 0.2)';
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.fill();

        // Ship body
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-15, -15);
        ctx.lineTo(-10, 0);
        ctx.lineTo(-15, 15);
        ctx.closePath();
        ctx.fill();

        // Bright glow
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Engine trails
        ctx.strokeStyle = 'rgba(0, 150, 100, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, -8);
        ctx.lineTo(-18, -10);
        ctx.moveTo(-10, 8);
        ctx.lineTo(-18, 10);
        ctx.stroke();

        // Shield indicator
        if (this.invulnerable > 0) {
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.8)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    isDead() {
        return this.health <= 0;
    }
}

class Bullet {
    constructor(x, y, vx, vy, type, level = 1) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.type = type;
        this.level = level;
        this.size = type === 'laser' ? 3 : 2;
        this.damage = type === 'laser' ? 10 + level * 2 : 8;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        const color = this.type === 'laser' ? '#00ff88' : '#ff00ff';
        const glowColor = this.type === 'laser' ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 0, 255, 0.3)';

        // Outer glow
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();

        // Main bullet
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        // Bright edge
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < 0 || this.x > canvasWidth || this.y < 0 || this.y > canvasHeight;
    }
}

class Missile extends Bullet {
    constructor(x, y, vx, vy, level = 1) {
        super(x, y, vx, vy, 'missile', level);
        this.size = 4;
        this.damage = 25 + level * 5;
        this.explosionRadius = 40 + level * 10;
        this.trail = [];
    }

    update() {
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 10) this.trail.shift();

        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.15; // gravity
    }

    draw(ctx) {
        // Glow trail
        ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
            if (i === 0) ctx.moveTo(this.trail[i].x, this.trail[i].y);
            else ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.stroke();

        // Main trail
        ctx.strokeStyle = 'rgba(255, 150, 0, 0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
            if (i === 0) ctx.moveTo(this.trail[i].x, this.trail[i].y);
            else ctx.lineTo(this.trail[i].x, this.trail[i].y);
        }
        ctx.stroke();

        // Outer glow
        ctx.fillStyle = 'rgba(255, 100, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

class Enemy {
    constructor(x, y, type = 'basic') {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.type = type;
        this.health = this.getMaxHealth();
        this.maxHealth = this.health;
        this.width = 25;
        this.height = 25;
        this.angle = 0;
        this.shootCooldown = 0;
        this.shootRate = this.getShootRate();
        this.value = this.getPointValue();
        this.dropChance = this.getDropChance();
    }

    getMaxHealth() {
        switch (this.type) {
            case 'weak': return 20;
            case 'basic': return 35;
            case 'armored': return 60;
            case 'fast': return 25;
            default: return 35;
        }
    }

    getShootRate() {
        switch (this.type) {
            case 'weak': return 120;
            case 'basic': return 100;
            case 'armored': return 80;
            case 'fast': return 90;
            default: return 100;
        }
    }

    getPointValue() {
        switch (this.type) {
            case 'weak': return 50;
            case 'basic': return 100;
            case 'armored': return 200;
            case 'fast': return 150;
            default: return 100;
        }
    }

    getDropChance() {
        switch (this.type) {
            case 'weak': return 0.15;
            case 'basic': return 0.25;
            case 'armored': return 0.4;
            case 'fast': return 0.3;
            default: return 0.25;
        }
    }

    update(playerX, playerY) {
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            const speed = this.type === 'fast' ? 2 : 1.5;
            this.vx = (dx / dist) * speed;
            this.vy = (dy / dist) * speed;
            this.angle = Math.atan2(dy, dx);
        }

        this.x += this.vx;
        this.y += this.vy;

        if (this.shootCooldown > 0) this.shootCooldown--;
    }

    shoot() {
        if (this.shootCooldown > 0) return null;
        this.shootCooldown = this.shootRate;
        return new EnemyBullet(this.x, this.y, Math.cos(this.angle) * 3, Math.sin(this.angle) * 3);
    }

    takeDamage(amount) {
        this.health -= amount;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);

        // Body color based on type
        let baseColor = '#ff00ff';
        let glowColor = 'rgba(255, 0, 255, 0.3)';
        let outerGlow = 'rgba(255, 0, 255, 0.15)';
        if (this.type === 'weak') {
            baseColor = '#ff6b00';
            glowColor = 'rgba(255, 107, 0, 0.3)';
            outerGlow = 'rgba(255, 107, 0, 0.15)';
        } else if (this.type === 'armored') {
            baseColor = '#ff0000';
            glowColor = 'rgba(255, 0, 0, 0.3)';
            outerGlow = 'rgba(255, 0, 0, 0.15)';
        } else if (this.type === 'fast') {
            baseColor = '#ffff00';
            glowColor = 'rgba(255, 255, 0, 0.3)';
            outerGlow = 'rgba(255, 255, 0, 0.15)';
        }

        // Outer aura
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(-18, 18);
        ctx.lineTo(0, 14);
        ctx.lineTo(18, 18);
        ctx.closePath();
        ctx.fill();

        // Body
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(-12, 12);
        ctx.lineTo(0, 8);
        ctx.lineTo(12, 12);
        ctx.closePath();
        ctx.fill();

        // Glow
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Health bar
        if (this.health < this.maxHealth) {
            ctx.restore();
            const barWidth = 20;
            const barX = this.x - barWidth / 2;
            const barY = this.y - 18;
            const healthPercent = this.health / this.maxHealth;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX - 1, barY - 1, barWidth + 2, 4);

            ctx.fillStyle = healthPercent > 0.5 ? '#00ff88' : (healthPercent > 0.25 ? '#ffff00' : '#ff0000');
            ctx.fillRect(barX, barY, barWidth * healthPercent, 2);
            return;
        }

        ctx.restore();
    }

    isDead() {
        return this.health <= 0;
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < -50 || this.x > canvasWidth + 50 || this.y < -50 || this.y > canvasHeight + 50;
    }
}

class EnemyBullet {
    constructor(x, y, vx, vy) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = 2;
        this.damage = 10;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 68, 68, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    isOffScreen(canvasWidth, canvasHeight) {
        return this.x < 0 || this.x > canvasWidth || this.y < 0 || this.y > canvasHeight;
    }
}

class Pickup {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'weapon1', 'weapon2', 'weapon3', 'health'
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = -2;
        this.size = 8;
        this.rotation = 0;
        this.age = 0;
        this.lifetime = 300; // 5 seconds at 60fps
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1;
        this.rotation += 0.05;
        this.age++;
    }

    draw(ctx) {
        if (this.age > this.lifetime - 30) {
            ctx.globalAlpha = (this.lifetime - this.age) / 30;
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        let color = '#00ff88';
        if (this.type === 'weapon1') color = '#00ff88';
        else if (this.type === 'weapon2') color = '#ff00ff';
        else if (this.type === 'weapon3') color = '#ff6600';
        else if (this.type === 'health') color = '#ff0000';

        // Outer glow
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Middle glow
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, this.size * 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Star
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(this.size, 0);
        for (let i = 1; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            ctx.lineTo(Math.cos(angle) * this.size, Math.sin(angle) * this.size);
        }
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    isDead() {
        return this.age > this.lifetime;
    }
}
