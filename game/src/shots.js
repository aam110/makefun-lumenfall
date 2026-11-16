// The screenshot scenes behind ?shot=start|play|blessing|end. Each one plays
// the real rules forward from a fresh run with a simple autopilot — seek the
// nearest shade, slash in range, dodge telegraphs and bullets, dash out of
// trouble — so every staged frame is what a real game looks like, and the
// same seed always stages the same scenes. The autopilot restarts a lost run
// and tries again, the way a player would.

import { STEP } from './config.js';
import { clearQueued, createInput } from './input.js';
import { startRun, step, enemiesLeft, STATE_TITLE, STATE_PLAY, STATE_BLESSING, STATE_VICTORY, STATE_GAMEOVER } from './game.js';

const MAX_TICKS = 60 * 420;

/** Steer one tick of autopilot input for the current game state. */
export function autopilotInput(game, input, tick) {
  input.moveX = 0;
  input.moveY = 0;
  input.attackQueued = false;
  input.dashQueued = false;
  input.confirmQueued = false;
  input.blessingQueued = -1;
  input.clickX = null;
  input.clickY = null;
  if (game.state === STATE_TITLE) {
    input.confirmQueued = true;
    return;
  }
  if (game.state === STATE_BLESSING) {
    // Prefer survival, then damage, then whatever is first.
    const names = game.blessingChoices.map((b) => b.id);
    let pick = 0;
    if (names.includes('wardens-heart') && game.player.hp <= 3) pick = names.indexOf('wardens-heart');
    else if (names.includes('ember-edge')) pick = names.indexOf('ember-edge');
    else if (names.includes('crit-lens')) pick = names.indexOf('crit-lens');
    input.blessingQueued = pick;
    return;
  }
  if (game.state !== STATE_PLAY) return;
  const player = game.player;
  // The open portal is the way down: walk into it.
  if (game.portal.open) {
    const dx = game.portal.x - player.x;
    const dy = game.portal.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    input.moveX = dx / dist;
    input.moveY = dy / dist;
    input.aimX = game.portal.x;
    input.aimY = game.portal.y;
    return;
  }
  // A hurt Warden detours for a heart.
  const heart = game.pickups.find((p) => p.kind === 'heart');
  if (heart && player.hp <= 2) {
    const dx = heart.x - player.x;
    const dy = heart.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    input.moveX = dx / dist;
    input.moveY = dy / dist;
    input.aimX = heart.x;
    input.aimY = heart.y;
    return;
  }
  // A materializing ring (3+ delayed bullets): run straight away from the
  // boss — its bullets fly outward slower than the Warden runs, so a radial
  // escape beats the ring, where dodging sideways would cross the next
  // bullet. Dash if the ring is about to fire.
  const delayed = game.bullets.filter((b) => b.delay > 0);
  if (delayed.length >= 3) {
    const boss = game.enemies.find((e) => e.kind === 'boss' && !e.dead);
    if (boss) {
      const dx = player.x - boss.x;
      const dy = player.y - boss.y;
      const dist = Math.hypot(dx, dy) || 1;
      input.moveX = dx / dist;
      input.moveY = dy / dist;
      input.aimX = boss.x;
      input.aimY = boss.y;
      if (Math.min(...delayed.map((b) => b.delay)) < 0.25) input.dashQueued = true;
      return;
    }
  }
  // Hunt the nearest shade (wisps first when the boss has summoned them).
  let target = null;
  let targetDist = Infinity;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const dist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    const priority = enemy.kind === 'wisp' && game.enemies.some((e) => e.kind === 'boss' && !e.dead) ? dist * 0.5 : dist;
    if (priority < targetDist) {
      targetDist = priority;
      target = enemy;
    }
  }
  if (!target) return;
  input.aimX = target.x;
  input.aimY = target.y;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  // The blade reaches 78 past the target's edge; orbit just inside that so
  // the big boss can be slashed without ever touching it.
  const reach = 78 + target.radius;
  const orbitDist = 52 + target.radius;
  // Dodge the single nearest threat — a telegraphing charge or the closest
  // closing bullet — instead of summing every bullet, which cancels out
  // against a radial ring. A bullet very close means dash through it.
  let threatX = 0;
  let threatY = 0;
  let threatDist = Infinity;
  let bulletPanic = false;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    if ((enemy.state === 'telegraph' || enemy.state === 'charging')) {
      const d = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (d < 240 && d < threatDist) {
        threatDist = d;
        threatX = -enemy.chargeDirY;
        threatY = enemy.chargeDirX;
      }
    }
  }
  for (const bullet of game.bullets) {
    if (bullet.delay > 0) continue;
    const bx = bullet.x - player.x;
    const by = bullet.y - player.y;
    const bdist = Math.hypot(bx, by);
    if (bdist > 110) continue;
    const closing = (bx * bullet.dx + by * bullet.dy) / (bdist || 1);
    if (closing < 0 && bdist < threatDist) {
      threatDist = bdist;
      threatX = -bullet.dy;
      threatY = bullet.dx;
      if (bdist < 55) bulletPanic = true;
    }
  }
  const threatLen = Math.hypot(threatX, threatY);
  if (threatLen > 0.1) {
    input.moveX = threatX / threatLen;
    input.moveY = threatY / threatLen;
    if (bulletPanic) input.dashQueued = true;
  } else if (dist > orbitDist) {
    // Close in, weaving a little so spitter shots miss.
    const weave = Math.sin(tick / 14) * 0.45;
    input.moveX = nx - ny * weave;
    input.moveY = ny + nx * weave;
  } else {
    // In range: orbit on the ring — drift out when too close, in when too
    // far — so the Warden slashes from a safe distance instead of spiralling
    // into the target's touch.
    const radial = dist < orbitDist - 6 ? -0.9 : dist > orbitDist + 25 ? 0.6 : 0;
    const orbit = tick % 240 < 120 ? 1 : -1;
    input.moveX = -ny * orbit * 0.8 + nx * radial;
    input.moveY = nx * orbit * 0.8 + ny * radial;
  }
  const moveLen = Math.hypot(input.moveX, input.moveY);
  if (moveLen > 1) {
    input.moveX /= moveLen;
    input.moveY /= moveLen;
  }
  if (dist < reach - 4) input.attackQueued = true;
}

/** Run the autopilot until `done(game)` is true, or the tick budget ends. */
function playUntil(game, done, maxTicks = MAX_TICKS) {
  const input = createInput();
  let tick = 0;
  while (tick < maxTicks) {
    autopilotInput(game, input, tick);
    step(game, input, STEP);
    clearQueued(input);
    tick += 1;
    if (game.state === STATE_GAMEOVER) {
      startRun(game);
      continue;
    }
    if (done(game)) return { ticks: tick, ok: true };
  }
  return { ticks: tick, ok: false };
}

/**
 * Set `game` to the named scene and return a note about it. The scenes:
 * start (the title), play (mid-combat on floor 3), blessing (the choice
 * after floor 1), end (the victory screen of a full 10-floor run).
 */
export function stageShot(name, game) {
  if (name === 'play') {
    const result = playUntil(game, (g) => g.state === STATE_PLAY && g.floor >= 3 && g.floorTime > 5 && enemiesLeft(g) >= 3);
    return { scene: 'play', staged: result.ok, ticks: result.ticks, floor: game.floor, score: game.score };
  }
  if (name === 'blessing') {
    const result = playUntil(game, (g) => g.state === STATE_BLESSING);
    return { scene: 'blessing', staged: result.ok, ticks: result.ticks, floor: game.floor, score: game.score };
  }
  if (name === 'end') {
    const result = playUntil(game, (g) => g.state === STATE_VICTORY, MAX_TICKS * 2);
    return { scene: 'end', staged: result.ok, ticks: result.ticks, floor: game.floor, score: game.score };
  }
  // Start: let the title breathe for a few seconds so the embers drift.
  const input = createInput();
  for (let i = 0; i < 60 * 4; i += 1) step(game, input, STEP);
  return { scene: 'start', staged: game.state === STATE_TITLE, ticks: 240, floor: 1, score: 0 };
}
