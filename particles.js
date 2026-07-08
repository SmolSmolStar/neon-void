class Particle {
    constructor(x, y, vx, vy, color, life, size = 3) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.maxLife = life;
        this.life = life;
        this.size = size;
        this.opacity = 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // gravity
        this.life--;
        this.opacity = this.life / this.maxLife;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    isDead() {
        return this.life <= 0;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(x, y, vx, vy, color, count = 1, life = 30, size = 3) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 3 + 1;
            const px = vx !== undefined ? vx * speed * Math.cos(angle) + Math.random() * 2 - 1 : speed * Math.cos(angle);
            const py = vy !== undefined ? vy * speed * Math.sin(angle) + Math.random() * 2 - 1 : speed * Math.sin(angle);
            this.particles.push(new Particle(x, y, px, py, color, life, size));
        }
    }

    explosion(x, y, color = '#ff6b00', intensity = 30) {
        for (let i = 0; i < intensity; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 4 + 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const life = Math.random() * 30 + 20;
            const size = Math.random() * 3 + 1;
            this.particles.push(new Particle(x, y, vx, vy, color, life, size));
        }
        // Add secondary particles
        for (let i = 0; i < intensity * 0.5; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 2 + 1;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, '#ffaa00', 15, 1));
        }
    }

    laserHit(x, y) {
        for (let i = 0; i < 8; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 3 + 2;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, '#00ff88', 20, 2));
        }
    }

    spreadHit(x, y) {
        for (let i = 0; i < 6; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = Math.random() * 2 + 1;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            this.particles.push(new Particle(x, y, vx, vy, '#ff00ff', 15, 2));
        }
    }

    missileHit(x, y) {
        this.explosion(x, y, '#ff4400', 40);
    }

    damageFlash(x, y) {
        for (let i = 0; i < 3; i++) {
            const angle = (Math.random() * Math.PI * 2);
            this.particles.push(new Particle(x, y, Math.cos(angle) * 2, Math.sin(angle) * 2, '#ff0000', 10, 2));
        }
    }

    pickupSparkle(x, y, color) {
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const vx = Math.cos(angle) * 2;
            const vy = Math.sin(angle) * 2;
            this.particles.push(new Particle(x, y, vx, vy, color, 30, 2));
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].isDead()) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        for (const particle of this.particles) {
            particle.draw(ctx);
        }
    }
}
