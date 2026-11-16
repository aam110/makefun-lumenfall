// The Warden: the player character. Movement, the dash (with invulnerability
// frames) and the radiant blade all live here; the game module owns combat
// resolution, because a slash needs the enemy list. Stats start from
// config.PLAYER and grow through blessings, which write onto the same fields
// (bonusDamage, speedMul, dashCooldownMul, critChance, boltOnSlash, magnetMul,
// thorns, secondWind, healOnFloor).

import { PLAYER } from './config.js';
import { clampToArena, resolvePillars } from './arena.js';

/** A fresh Warden at the given spawn point. */
export function createPlayer(x, y) {
  return {
    x, y,
    radius: PLAYER.radius,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    aim: -Math.PI / 2,
    facing: 1,
    speedMul: 1,
    bonusDamage: 0,
    critChance: 0.05,
    dashCooldownMul: 1,
    magnetMul: 1,
    boltOnSlash: false,
    thorns: false,
    secondWind: false,
    secondWindUsed: false,
    healOnFloor: false,
    dashTime: 0,
    dashCooldown: 0,
    dashDirX: 0,
    dashDirY: -1,
    slashCooldown: 0,
    slashTime: 0,
    slashAngle: 0,
    invuln: 0,
    hurtFlash: 0,
    walkCycle: 0,
    moving: false,
  };
}

/** The Warden's current move speed, blessings included. */
export function playerSpeed(player) {
  return PLAYER.speed * player.speedMul;
}

/** The Warden's current slash damage, blessings included. */
export function slashDamage(player) {
  return PLAYER.slashDamage + player.bonusDamage;
}

/** Is the Warden mid-dash (and therefore invulnerable)? */
export function isDashing(player) {
  return player.dashTime > 0;
}

/** Is the Warden currently immune to damage? */
export function isInvulnerable(player) {
  return player.dashTime > 0 || player.invuln > 0;
}

/** The dash cooldown as a 0..1 fraction (1 = ready). */
export function dashReadyFraction(player) {
  const total = PLAYER.dashCooldown * player.dashCooldownMul;
  return 1 - Math.max(0, player.dashCooldown) / total;
}

/**
 * Move the Warden for one tick: dashing overrides steering, otherwise the
 * move vector steers at full speed. Timers tick down here too.
 */
export function updatePlayer(player, input, dt, pillars) {
  player.slashCooldown = Math.max(0, player.slashCooldown - dt);
  player.slashTime = Math.max(0, player.slashTime - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  player.hurtFlash = Math.max(0, player.hurtFlash - dt);

  player.aim = Math.atan2(input.aimY - player.y, input.aimX - player.x);
  if (Math.abs(input.moveX) > 0.01) player.facing = input.moveX > 0 ? 1 : -1;

  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.x += player.dashDirX * PLAYER.dashSpeed * dt;
    player.y += player.dashDirY * PLAYER.dashSpeed * dt;
  } else {
    player.x += input.moveX * playerSpeed(player) * dt;
    player.y += input.moveY * playerSpeed(player) * dt;
    player.moving = Math.abs(input.moveX) > 0.01 || Math.abs(input.moveY) > 0.01;
    if (player.moving) player.walkCycle += dt * 11;
  }
  clampToArena(player);
  resolvePillars(player, pillars);
}

/** Start a dash in the current move direction (or the aim, when standing). */
export function tryDash(player, input) {
  if (player.dashCooldown > 0 || player.dashTime > 0) return false;
  let dx = input.moveX;
  let dy = input.moveY;
  if (Math.hypot(dx, dy) < 0.1) {
    dx = Math.cos(player.aim);
    dy = Math.sin(player.aim);
  }
  const length = Math.hypot(dx, dy) || 1;
  player.dashDirX = dx / length;
  player.dashDirY = dy / length;
  player.dashTime = PLAYER.dashTime;
  player.dashCooldown = PLAYER.dashCooldown * player.dashCooldownMul;
  return true;
}

/** Start a slash toward the aim. Returns false while the blade recharges. */
export function trySlash(player) {
  if (player.slashCooldown > 0) return false;
  player.slashCooldown = PLAYER.slashCooldown;
  player.slashTime = 0.16;
  player.slashAngle = player.aim;
  return true;
}

/**
 * Hurt the Warden for `amount` hearts. Returns false when invulnerable (the
 * hit is ignored) or when the second wind saves them; the caller reads
 * player.hp to learn whether the run ended.
 */
export function hurtPlayer(player, amount) {
  if (isInvulnerable(player)) return false;
  player.hp -= amount;
  player.invuln = PLAYER.hurtInvuln;
  player.hurtFlash = 0.35;
  if (player.hp <= 0 && player.secondWind && !player.secondWindUsed) {
    player.secondWindUsed = true;
    player.hp = 2;
    player.invuln = 2;
    return 'second-wind';
  }
  return player.hp > 0 ? 'hurt' : 'dead';
}

/** Heal the Warden, never past the maximum. Returns the hearts restored. */
export function healPlayer(player, amount) {
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return player.hp - before;
}
