// The shades of the abyss: four enemy kinds, each with its own way of
// hunting, plus the Hollow Star boss. An enemy is a plain object; updateEnemy
// steers it for one tick and returns events (a shot fired, a charge begun)
// that the game module turns into projectiles and sound. Nothing here touches
// the DOM.

import { BOSS, ENEMIES } from './config.js';
import { clampToArena, resolvePillars, segmentBlocked } from './arena.js';

/** Make an enemy of `kind` at a position, scaled a little by floor. */
export function createEnemy(kind, x, y, floor) {
  const base = ENEMIES[kind];
  const hpBonus = kind === 'wisp' ? 0 : Math.floor((floor - 1) / 4);
  return {
    kind,
    x, y,
    radius: base.radius,
    hp: base.hp + hpBonus,
    maxHp: base.hp + hpBonus,
    speed: base.speed * (1 + Math.min(0.35, (floor - 1) * 0.03)),
    touch: base.touch,
    score: base.score,
    shards: base.shards,
    state: 'hunt',
    stateTime: 0,
    shotCooldown: 1 + Math.random() * 1.2,
    chargeDirX: 0,
    chargeDirY: 0,
    flash: 0,
    wobble: Math.random() * Math.PI * 2,
    thornCooldown: 0,
    dead: false,
  };
}

/** The Hollow Star: the boss of the final floor. */
export function createBoss(x, y) {
  return {
    kind: 'boss',
    x, y,
    radius: BOSS.radius,
    hp: BOSS.hp,
    maxHp: BOSS.hp,
    speed: BOSS.speed,
    touch: 1,
    score: BOSS.score,
    shards: 12,
    state: 'hunt',
    stateTime: 0,
    ringCooldown: 2,
    summonCooldown: 6,
    chargeDirX: 0,
    chargeDirY: -1,
    flash: 0,
    wobble: 0,
    thornCooldown: 0,
    dead: false,
  };
}

function steerToward(enemy, tx, ty, dt, speed) {
  const dx = tx - enemy.x;
  const dy = ty - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;
  enemy.x += (dx / dist) * speed * dt;
  enemy.y += (dy / dist) * speed * dt;
}

/**
 * Steer one enemy for one tick. `events` collects what happened: {type:
 * 'shoot', x, y, dx, dy, speed} for a spitter shot, {type: 'split', enemy}
 * when a splitter dies, {type: 'ring'} / {type: 'summon'} / {type: 'charge'}
 * for the boss. The caller applies the events.
 */
export function updateEnemy(enemy, player, dt, pillars, events) {
  enemy.stateTime += dt;
  enemy.flash = Math.max(0, enemy.flash - dt);
  enemy.thornCooldown = Math.max(0, enemy.thornCooldown - dt);
  enemy.wobble += dt * 3;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (enemy.kind === 'wisp') {
    // A wisp drifts toward the Warden with a lazy sine wobble.
    const wob = Math.sin(enemy.wobble) * 0.5;
    const px = -dy / dist;
    const py = dx / dist;
    enemy.x += ((dx / dist) + px * wob) * enemy.speed * dt;
    enemy.y += ((dy / dist) + py * wob) * enemy.speed * dt;
  } else if (enemy.kind === 'spitter') {
    // A spitter holds its distance and fires when it has a clear line.
    const base = ENEMIES.spitter;
    if (dist < base.keepAway - 40) steerToward(enemy, enemy.x - dx, enemy.y - dy, dt, enemy.speed);
    else if (dist > base.keepAway + 60) steerToward(enemy, player.x, player.y, dt, enemy.speed);
    enemy.shotCooldown -= dt;
    if (enemy.shotCooldown <= 0 && dist < 430 && !segmentBlocked(enemy.x, enemy.y, player.x, player.y, pillars)) {
      enemy.shotCooldown = base.shotCooldown;
      events.push({ type: 'shoot', x: enemy.x, y: enemy.y, dx: dx / dist, dy: dy / dist, speed: base.shotSpeed, radius: 6, damage: 1, fromBoss: false });
    }
  } else if (enemy.kind === 'charger') {
    // A charger telegraphs (flashing, still), then rushes in a straight line.
    const base = ENEMIES.charger;
    if (enemy.state === 'hunt') {
      steerToward(enemy, player.x, player.y, dt, enemy.speed);
      if (dist < 250 && enemy.stateTime > 0.8) {
        enemy.state = 'telegraph';
        enemy.stateTime = 0;
        enemy.chargeDirX = dx / dist;
        enemy.chargeDirY = dy / dist;
        events.push({ type: 'telegraph', enemy });
      }
    } else if (enemy.state === 'telegraph') {
      if (enemy.stateTime >= base.telegraph) {
        enemy.state = 'charging';
        enemy.stateTime = 0;
        events.push({ type: 'charge', enemy });
      }
    } else if (enemy.state === 'charging') {
      enemy.x += enemy.chargeDirX * base.chargeSpeed * dt;
      enemy.y += enemy.chargeDirY * base.chargeSpeed * dt;
      if (enemy.stateTime >= base.chargeTime) {
        enemy.state = 'recover';
        enemy.stateTime = 0;
      }
    } else if (enemy.state === 'recover') {
      if (enemy.stateTime >= base.recover) {
        enemy.state = 'hunt';
        enemy.stateTime = 0;
      }
    }
  } else if (enemy.kind === 'splitter') {
    // A splitter lumbers after the Warden and bursts into wisps when slain.
    steerToward(enemy, player.x, player.y, dt, enemy.speed);
  } else if (enemy.kind === 'boss') {
    updateBoss(enemy, player, dt, events);
  }

  clampToArena(enemy);
  resolvePillars(enemy, pillars);
}

function updateBoss(boss, player, dt, events) {
  const enraged = boss.hp <= boss.maxHp * BOSS.enrageBelow;
  const ringEvery = enraged ? BOSS.ringCooldown * 0.65 : BOSS.ringCooldown;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (boss.state === 'hunt') {
    steerToward(boss, player.x, player.y, dt, boss.speed * (enraged ? 1.35 : 1));
    boss.ringCooldown -= dt;
    boss.summonCooldown -= dt;
    if (boss.ringCooldown <= 0) {
      boss.ringCooldown = ringEvery;
      events.push({ type: 'ring', enemy: boss });
    }
    if (boss.summonCooldown <= 0) {
      boss.summonCooldown = BOSS.summonCooldown;
      events.push({ type: 'summon', enemy: boss });
    }
    if (dist < 320 && boss.stateTime > 3) {
      boss.state = 'telegraph';
      boss.stateTime = 0;
      boss.chargeDirX = dx / dist;
      boss.chargeDirY = dy / dist;
      events.push({ type: 'telegraph', enemy: boss });
    }
  } else if (boss.state === 'telegraph') {
    if (boss.stateTime >= BOSS.chargeTelegraph) {
      boss.state = 'charging';
      boss.stateTime = 0;
      events.push({ type: 'charge', enemy: boss });
    }
  } else if (boss.state === 'charging') {
    boss.x += boss.chargeDirX * BOSS.chargeSpeed * dt;
    boss.y += boss.chargeDirY * BOSS.chargeSpeed * dt;
    if (boss.stateTime >= 0.55) {
      boss.state = 'hunt';
      boss.stateTime = 0;
      events.push({ type: 'slam', enemy: boss });
    }
  }
}

/** Damage an enemy; returns true when the blow killed it. */
export function damageEnemy(enemy, amount) {
  enemy.hp -= amount;
  enemy.flash = 0.12;
  if (enemy.hp <= 0) {
    enemy.dead = true;
    return true;
  }
  return false;
}
