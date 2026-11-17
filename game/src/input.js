// Re-authored in the r3 rebuild session (2026-11-18).
// Keyboard and mouse for a third-person open world. Held keys steer and drive;
// one-shot presses (start, pause, enter a car, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost.
// The mouse drags the camera; the wheel zooms it; holding the left button fires.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseDown = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let deltaX = 0;
  let deltaY = 0;
  let wheel = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Space' || event.code === 'Enter') actions |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
    dragging = false;
  });

  // The screens (title, pause, busted, complete) cover the canvas, so the
  // click that starts the game lands on them, not on the canvas. Listen on
  // the window for the one-shot confirm; only a press that actually reaches
  // the canvas (play mode, the HUD lets clicks through) arms the trigger,
  // so starting the game by clicking never fires a stray shot.
  window.addEventListener('pointerdown', (event) => {
    if (event.button === 0 && event.target === canvas) {
      mouseDown = true;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) {
      mouseDown = false;
      dragging = false;
    }
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    deltaX += event.clientX - lastX;
    deltaY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  });
  canvas.addEventListener('wheel', (event) => {
    wheel += event.deltaY;
    event.preventDefault();
  }, { passive: false });

  const has = (...codes) => codes.some((c) => held.has(c));

  return {
    /** On-foot movement in camera space. */
    move() {
      return {
        f: has('KeyW', 'ArrowUp'),
        b: has('KeyS', 'ArrowDown'),
        l: has('KeyA', 'ArrowLeft'),
        r: has('KeyD', 'ArrowRight'),
        run: has('ShiftLeft', 'ShiftRight'),
        jump: has('Space'),
      };
    },
    /** Driving: throttle forward/back and steering -1..1. */
    drive() {
      return {
        fwd: has('KeyW', 'ArrowUp'),
        back: has('KeyS', 'ArrowDown'),
        steer: (has('KeyA', 'ArrowLeft') ? -1 : 0) + (has('KeyD', 'ArrowRight') ? 1 : 0),
      };
    },
    get firing() {
      return mouseDown;
    },
    /** Camera orbit deltas since the last call, in pixels. */
    takeMouse() {
      const d = { dx: deltaX, dy: deltaY, wheel };
      deltaX = 0;
      deltaY = 0;
      wheel = 0;
      return d;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
