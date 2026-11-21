// Keyboard and mouse state: held keys, one-shot presses, look deltas and pointer lock.

const CAPTURED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyF', 'KeyR', 'KeyC', 'KeyX', 'KeyM', 'KeyB', 'KeyH']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.mouseHeld = new Set();
    this.locked = false;
    this.sensitivity = 0.0024;
    this.wheelDelta = 0;

    window.addEventListener('keydown', (event) => {
      if (CAPTURED_KEYS.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.held.delete(event.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.pressed.clear();
      this.mouseHeld.clear();
    });
    window.addEventListener('mousedown', (event) => {
      this.mouseHeld.add(event.button);
      if (event.button === 0) this.pressed.add('Mouse0');
    });
    window.addEventListener('mouseup', (event) => this.mouseHeld.delete(event.button));
    window.addEventListener('wheel', (event) => { this.wheelDelta += Math.sign(event.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('click', () => {
      if (canvas.requestPointerLock && document.pointerLockElement !== canvas) canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked && event.buttons === 0) return;
      this.lookX += event.movementX || 0;
      this.lookY += event.movementY || 0;
    });
  }

  isDown(code) {
    return this.held.has(code);
  }

  mouseDown(button) {
    return this.mouseHeld.has(button);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  movementAxis() {
    const forward = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    const strafe = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    return { forward, strafe };
  }

  consumeLook() {
    const delta = { x: this.lookX * this.sensitivity, y: this.lookY * this.sensitivity };
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  consumeWheel() {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return d;
  }

  endFrame() {
    this.pressed.clear();
  }
}
