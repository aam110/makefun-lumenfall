// LUMENFALL's bootstrap: wire the canvas, the input and the game together,
// then run the fixed-step loop. The query string steers test modes only —
// the game itself never reads the network:
//   ?seed=N        play a seeded run (rooms, waves and blessings repeat)
//   ?shot=name     stage a screenshot scene (start|play|blessing|end), draw
//                  it, freeze, and set window.__shotReady for the capture
//   ?quick=1       shorten the descent to 3 floors (a test hook)
//   ?boss=1        begin on the boss floor (a test hook)
// The live game is exposed as window.__lumenfall for play-testing.

import { STEP, VIEW } from './config.js';
import { createGame, step, setupFloor, STATE_PLAY } from './game.js';
import { attachInput, clearQueued, createInput } from './input.js';
import { draw } from './render.js';
import { stageShot } from './shots.js';
import { unlockAudio, setMuted } from './audio.js';

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed')) || 1;
const shot = params.get('shot');
const quick = params.get('quick') === '1';
const bossStart = params.get('boss') === '1';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;
const ctx = canvas.getContext('2d');

const input = createInput();
attachInput(input, canvas);
const game = createGame(seed, { quick });
if (bossStart) {
  game.state = STATE_PLAY;
  setupFloor(game, game.totalFloors);
}

window.__lumenfall = { game, input };

let audioUnlocked = false;
function unlockOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  unlockAudio();
}
window.addEventListener('pointerdown', unlockOnce);
window.addEventListener('keydown', unlockOnce);

if (shot) {
  // Screenshot mode: stage the scene, draw it twice, freeze.
  const report = stageShot(shot, game);
  const now = performance.now() / 1000;
  draw(ctx, game, input, now);
  draw(ctx, game, input, now + 0.05);
  window.__shotReport = report;
  window.__shotReady = true;
} else {
  // The live game: a fixed 60 Hz simulation under a rAF render loop.
  let last = performance.now();
  let accumulator = 0;
  let lastMuted = game.muted;
  function frame(nowMs) {
    const now = nowMs / 1000;
    let elapsed = (nowMs - last) / 1000;
    last = nowMs;
    if (elapsed > 0.25) elapsed = 0.25;
    accumulator += elapsed;
    let guard = 0;
    while (accumulator >= STEP && guard < 8) {
      step(game, input, STEP);
      clearQueued(input);
      accumulator -= STEP;
      guard += 1;
    }
    if (guard >= 8) accumulator = 0;
    if (game.muted !== lastMuted) {
      lastMuted = game.muted;
      setMuted(game.muted);
    }
    draw(ctx, game, input, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
