// Keyboard and pointer input. Held keys give a steering vector and the aim follows
// the mouse; one-shot presses (start or restart, pause, dash, mute) are queued as bit
// flags and taken once by the loop, so a press between two frames is never lost and
// never counted twice. Dash is a press, not a hold: holding Space does not re-dash.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

/**
 * `target` is the canvas (for pointer coordinates) and `toField` converts a client
 * point to field coordinates. The mouse aims the ship; holding the button fires.
 */
export function createInput(target, toField) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let firing = false;
  let aimX = 640;
  let aimY = 360;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) keys.up = true;
    else if (DOWN.has(event.code)) keys.down = true;
    else if (LEFT.has(event.code)) keys.left = true;
    else if (RIGHT.has(event.code)) keys.right = true;
    else if (event.code === 'Space') {
      if (!event.repeat) actions |= ACTION_DASH | ACTION_CONFIRM;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    firing = false;
  });

  function trackPointer(event) {
    const point = toField(event.clientX, event.clientY);
    aimX = point.x;
    aimY = point.y;
  }
  target.addEventListener('pointermove', trackPointer);
  target.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    firing = false;
  });
  target.addEventListener('pointerleave', () => {
    firing = false;
  });
  target.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Move vector in [-1, 1] each way, normalised on the diagonal. */
    move() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x !== 0 && y !== 0) {
        const len = Math.hypot(x, y);
        return { x: x / len, y: y / len };
      }
      return { x, y };
    },
    aim() {
      return { x: aimX, y: aimY };
    },
    isFiring() {
      return firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
