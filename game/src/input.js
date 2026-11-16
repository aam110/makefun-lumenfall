// Keyboard and mouse state for LUMENFALL, read by the game once per tick.
//
// The input object is the only thing the game loop reads: movement as a
// normalized vector, the aim point in canvas coordinates, and edge-triggered
// actions (attack, dash, pause, mute, confirm, blessing keys) that the game
// consumes once per press. Buttons on the title, blessing and end screens are
// plain canvas hit-boxes, so clicks are reported the same way everywhere.

export function createInput() {
  return {
    keys: new Set(),
    moveX: 0,
    moveY: 0,
    aimX: 480,
    aimY: 270,
    mouseDown: false,
    attackQueued: false,
    dashQueued: false,
    pauseQueued: false,
    muteQueued: false,
    confirmQueued: false,
    restartQueued: false,
    blessingQueued: -1,
    clickX: null,
    clickY: null,
    anyKeyQueued: false,
  };
}

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

function recomputeMove(input) {
  let x = 0;
  let y = 0;
  for (const code of input.keys) {
    const dir = MOVE_KEYS[code];
    if (dir) {
      x += dir[0];
      y += dir[1];
    }
  }
  const length = Math.hypot(x, y);
  input.moveX = length > 0 ? x / length : 0;
  input.moveY = length > 0 ? y / length : 0;
}

/**
 * Wire the canvas and the window to an input object. Returns a function that
 * removes the listeners. Coordinates are converted through the canvas's
 * bounding box, so CSS scaling never skews the aim.
 */
export function attachInput(input, canvas) {
  const toCanvas = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const onKeyDown = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    input.keys.add(event.code);
    input.anyKeyQueued = true;
    if (event.code === 'Space' || event.code === 'KeyJ') input.attackQueued = true;
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyK') input.dashQueued = true;
    if (event.code === 'Escape' || event.code === 'KeyP') input.pauseQueued = true;
    if (event.code === 'KeyM') input.muteQueued = true;
    if (event.code === 'Enter') input.confirmQueued = true;
    if (event.code === 'KeyR') input.restartQueued = true;
    if (event.code === 'Digit1') input.blessingQueued = 0;
    if (event.code === 'Digit2') input.blessingQueued = 1;
    if (event.code === 'Digit3') input.blessingQueued = 2;
    recomputeMove(input);
  };
  const onKeyUp = (event) => {
    input.keys.delete(event.code);
    recomputeMove(input);
  };
  const onMouseMove = (event) => {
    const point = toCanvas(event);
    input.aimX = point.x;
    input.aimY = point.y;
  };
  const onMouseDown = (event) => {
    const point = toCanvas(event);
    input.aimX = point.x;
    input.aimY = point.y;
    input.mouseDown = true;
    input.attackQueued = true;
    input.clickX = point.x;
    input.clickY = point.y;
  };
  const onMouseUp = () => {
    input.mouseDown = false;
  };
  const onBlur = () => {
    input.keys.clear();
    input.mouseDown = false;
    recomputeMove(input);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
  };
}

/** Clear every edge-triggered flag after the game has read them this tick. */
export function clearQueued(input) {
  input.attackQueued = false;
  input.dashQueued = false;
  input.pauseQueued = false;
  input.muteQueued = false;
  input.confirmQueued = false;
  input.restartQueued = false;
  input.blessingQueued = -1;
  input.clickX = null;
  input.clickY = null;
  input.anyKeyQueued = false;
}
