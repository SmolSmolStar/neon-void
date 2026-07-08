// Keyboard + pointer/touch input. Exposes a per-frame snapshot the game reads.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerActive = false;
    this.px = 0; this.py = 0;
    this.firing = false;
    this.bomb = false;
    this._justPressed = new Set();
    this.bind();
  }

  bind() {
    const kd = (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this._justPressed.add(k);
      this.keys.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    const ku = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    const rect = () => this.canvas.getBoundingClientRect();
    const toLocal = (cx, cy) => {
      const r = rect();
      return {
        x: (cx - r.left) * (this.canvas.width / r.width),
        y: (cy - r.top) * (this.canvas.height / r.height),
      };
    };
    const move = (cx, cy) => {
      const { x, y } = toLocal(cx, cy);
      this.px = x; this.py = y;
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      this.pointerActive = true;
      this.firing = true;
      move(e.clientX, e.clientY);
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.pointerActive) move(e.clientX, e.clientY);
    });
    const end = () => { this.pointerActive = false; this.firing = false; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  consumePressed(key) {
    if (this._justPressed.has(key)) { this._justPressed.delete(key); return true; }
    return false;
  }

  endFrame() { this._justPressed.clear(); }

  // Build the snapshot the game consumes.
  snapshot() {
    const k = this.keys;
    const left = k.has('arrowleft') || k.has('a');
    const right = k.has('arrowright') || k.has('d');
    const up = k.has('arrowup') || k.has('w');
    const down = k.has('arrowdown') || k.has('s');
    const keyFiring = k.has(' ') || k.has('j');
    return {
      pointer: this.pointerActive,
      moveX: this.px,
      moveY: this.py,
      dirX: (right ? 1 : 0) - (left ? 1 : 0),
      dirY: (down ? 1 : 0) - (up ? 1 : 0),
      firing: this.pointerActive ? this.firing : keyFiring,
      bomb: k.has('shift') || k.has('b') || this._justPressed.has('b'),
    };
  }
}
