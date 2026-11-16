// LUMENFALL's heart: the state machine, the combat, the scoring and the
// descent. One game object holds the whole run; step() advances it one tick
// from an input object, and the renderer draws whatever it holds. The states
// are title → play → blessing → play … → victory or gameover, with pause
// overlaid on play. Nothing here touches the DOM except the best-score
// storage (guarded) and the sound calls (guarded in audio.js), so the rules
// can be driven headlessly by the tests and the screenshot staging.

import { ARENA, BOSS, PALETTE, PLAYER, SCORE, TOTAL_FLOORS, VIEW, floorPlan } from './config.js';
import { makeRng, pick } from './rng.js';
import { generateArena, playerSpawn, enemySpawn, circlesOverlap } from './arena.js';
import { createPlayer, updatePlayer, tryDash, trySlash, hurtPlayer, healPlayer, slashDamage, isInvulnerable, isDashing } from './player.js';
import { createEnemy, createBoss, updateEnemy, damageEnemy } from './enemies.js';
import { spawnBullet, spawnBolt, spawnPickup, updateProjectiles, updatePickups } from './projectiles.js';
import { createParticles, burst, ring, floatText, seedEmbers, updateParticles } from './particles.js';
import { rollBlessings } from './blessings.js';
import { sfx } from './audio.js';

export const STATE_TITLE = 'title';
export const STATE_PLAY = 'play';
export const STATE_BLESSING = 'blessing';
export const STATE_PAUSED = 'paused';
export const STATE_VICTORY = 'victory';
export const STATE_GAMEOVER = 'gameover';

/** The blessing cards' hit-boxes, centred — usually 3, fewer near the end
 * of a run when the pool runs low. The renderer draws them here. */
export function blessingCardRects(count = 3) {
  const w = 230;
  const h = 260;
  const gap = 30;
  const total = w * count + gap * (count - 1);
  const x0 = (VIEW.width - total) / 2;
  const y0 = 150;
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (w + gap), y: y0, w, h }));
}

/** The end screens' buttons: restart, and back to the title. */
export function endButtonRects() {
  return {
    restart: { x: VIEW.width / 2 - 190, y: 398, w: 180, h: 52 },
    menu: { x: VIEW.width / 2 + 10, y: 398, w: 180, h: 52 },
  };
}

/** The pause screen's buttons. */
export function pauseButtonRects() {
  return {
    resume: { x: VIEW.width / 2 - 190, y: 300, w: 180, h: 52 },
    restart: { x: VIEW.width / 2 + 10, y: 300, w: 180, h: 52 },
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function loadBest() {
  try {
    if (typeof localStorage === 'undefined') return 0;
    return Number(localStorage.getItem('lumenfall-best') || 0);
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('lumenfall-best', String(score));
  } catch {
    // Private mode or no storage: the run still counts, the best just
    // does not persist.
  }
}

/**
 * A fresh game. `opts.quick` shortens the descent to 3 floors (a test hook);
 * `opts.startFloor` begins on a later floor (the boss, for staging).
 */
export function createGame(seed = 1, opts = {}) {
  const rng = makeRng(seed);
  const game = {
    seed,
    rng,
    totalFloors: opts.quick ? 3 : TOTAL_FLOORS,
    state: STATE_TITLE,
    floor: 1,
    player: createPlayer(480, 400),
    arena: generateArena(rng, 1),
    enemies: [],
    bullets: [],
    bolts: [],
    pickups: [],
    particles: createParticles(),
    score: 0,
    shards: 0,
    kills: 0,
    time: 0,
    floorTime: 0,
    blessingsTaken: [],
    blessingChoices: [],
    portal: { open: false, x: 480, y: 280 },
    shake: 0,
    hitStop: 0,
    message: null,
    messageTime: 0,
    best: loadBest(),
    muted: false,
    bossAnnounced: false,
    stats: { slashes: 0, dashes: 0, damageDealt: 0 },
    titleTime: 0,
  };
  seedEmbers(game.particles, VIEW.width, VIEW.height);
  return game;
}

/** (Re)start a run from floor 1 with a fresh Warden. */
export function startRun(game) {
  game.floor = 1;
  game.score = 0;
  game.shards = 0;
  game.kills = 0;
  game.time = 0;
  game.blessingsTaken = [];
  game.blessingChoices = [];
  game.bullets = [];
  game.bolts = [];
  game.pickups = [];
  game.stats = { slashes: 0, dashes: 0, damageDealt: 0 };
  game.portal.open = false;
  game.shake = 0;
  game.hitStop = 0;
  setupFloor(game, 1);
  game.state = STATE_PLAY;
}

function showMessage(game, text, sub = '', seconds = 2.2) {
  game.message = { text, sub };
  game.messageTime = seconds;
}

/** Build a floor: a fresh room, a fresh wave, the Warden at the spawn. */
export function setupFloor(game, floor) {
  game.floor = floor;
  game.arena = generateArena(game.rng, floor);
  const spawn = playerSpawn();
  if (floor === 1 || !game.player) game.player = createPlayer(spawn.x, spawn.y);
  else {
    game.player.x = spawn.x;
    game.player.y = spawn.y;
    game.player.dashTime = 0;
    game.player.invuln = 0;
  }
  game.enemies = [];
  game.bullets = [];
  game.bolts = [];
  game.pickups = [];
  game.portal.open = false;
  game.portal.x = (ARENA.left + ARENA.right) / 2;
  game.portal.y = (ARENA.top + ARENA.bottom) / 2;
  game.floorTime = 0;
  game.bossAnnounced = false;
  if (floor === game.totalFloors) {
    const boss = createBoss(game.portal.x, ARENA.top + 110);
    game.enemies.push(boss);
    showMessage(game, 'THE HOLLOW STAR', 'Slay the heart of the abyss', 2.6);
    sfx.boss();
    game.bossAnnounced = true;
  } else {
    const plan = floorPlan(floor);
    for (let i = 0; i < plan.count; i += 1) {
      const spot = enemySpawn(game.rng, game.arena.pillars, spawn.x, spawn.y);
      game.enemies.push(createEnemy(pick(game.rng, plan.kinds), spot.x, spot.y, floor));
    }
    showMessage(game, `FLOOR ${floor}`, floor === 1 ? 'Clear the shades — find the way down' : `${plan.count} shades bar the way`, 2);
  }
}

/** Descend through the portal: take the floor bonus, then offer blessings. */
function enterPortal(game) {
  const timeBonus = Math.max(0, Math.round(SCORE.floorTimeBonus - game.floorTime));
  game.score += SCORE.floorClear + timeBonus;
  floatText(game.particles, game.player.x, game.player.y - 30, `+${SCORE.floorClear + timeBonus}`, PALETTE.shard, 20);
  game.messageTime = 0;
  if (game.floor >= game.totalFloors) {
    winRun(game);
    return;
  }
  game.blessingChoices = rollBlessings(game.rng, game.blessingsTaken, 3);
  if (game.blessingChoices.length === 0) {
    // The pool is empty (every blessing taken): descend without a choice.
    setupFloor(game, game.floor + 1);
    game.state = STATE_PLAY;
    return;
  }
  game.state = STATE_BLESSING;
  sfx.portal();
}

/** Take a blessing and descend to the next floor. */
export function chooseBlessing(game, index) {
  const choice = game.blessingChoices[index];
  if (!choice) return false;
  choice.apply(game.player);
  game.blessingsTaken.push(choice.id);
  burst(game.particles, game.player.x, game.player.y, choice.color, 24, 220);
  if (game.player.healOnFloor) healPlayer(game.player, 1);
  sfx.blessing();
  setupFloor(game, game.floor + 1);
  game.state = STATE_PLAY;
  return true;
}

function winRun(game) {
  game.score += SCORE.victory;
  game.state = STATE_VICTORY;
  game.portal.open = false;
  game.messageTime = 0;
  game.particles.texts = [];
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.score);
  }
  burst(game.particles, game.player.x, game.player.y, PALETTE.boss, 60, 320);
  ring(game.particles, game.player.x, game.player.y, PALETTE.portal, 200);
  sfx.victory();
}

function loseRun(game) {
  game.state = STATE_GAMEOVER;
  game.portal.open = false;
  game.messageTime = 0;
  game.particles.texts = [];
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.score);
  }
  burst(game.particles, game.player.x, game.player.y, PALETTE.danger, 40, 260);
  sfx.defeat();
}

/** The enemies still standing (the HUD's remaining count). */
export function enemiesLeft(game) {
  return game.enemies.filter((e) => !e.dead).length;
}

/** The boss, when the current floor has one alive. */
export function liveBoss(game) {
  return game.enemies.find((e) => e.kind === 'boss' && !e.dead) || null;
}

/** Advance the whole run by one fixed tick. */
export function step(game, input, dt) {
  updateParticles(game.particles, dt, VIEW.width, VIEW.height);
  if (game.messageTime > 0) game.messageTime -= dt;
  game.shake = Math.max(0, game.shake - dt * 26);

  if (input.muteQueued) {
    game.muted = !game.muted;
  }

  if (game.state === STATE_TITLE) {
    game.titleTime += dt;
    if (input.confirmQueued || input.clickX !== null) {
      startRun(game);
    }
    return;
  }

  if (game.state === STATE_PAUSED) {
    if (input.pauseQueued) game.state = STATE_PLAY;
    if (input.restartQueued) startRun(game);
    if (input.clickX !== null) {
      const buttons = pauseButtonRects();
      if (pointInRect(input.clickX, input.clickY, buttons.resume)) game.state = STATE_PLAY;
      if (pointInRect(input.clickX, input.clickY, buttons.restart)) startRun(game);
    }
    return;
  }

  if (game.state === STATE_BLESSING) {
    if (input.blessingQueued >= 0) chooseBlessing(game, input.blessingQueued);
    else if (input.clickX !== null) {
      const rects = blessingCardRects(game.blessingChoices.length);
      rects.forEach((rect, i) => {
        if (pointInRect(input.clickX, input.clickY, rect)) chooseBlessing(game, i);
      });
    }
    return;
  }

  if (game.state === STATE_VICTORY || game.state === STATE_GAMEOVER) {
    if (input.confirmQueued || input.restartQueued) startRun(game);
    if (input.clickX !== null) {
      const buttons = endButtonRects();
      if (pointInRect(input.clickX, input.clickY, buttons.restart)) startRun(game);
      if (pointInRect(input.clickX, input.clickY, buttons.menu)) {
        game.state = STATE_TITLE;
        game.enemies = [];
      }
    }
    return;
  }

  if (game.state !== STATE_PLAY) return;

  if (input.pauseQueued) {
    game.state = STATE_PAUSED;
    return;
  }

  // Hit-stop: a kill freezes the world for a beat; particles keep moving.
  if (game.hitStop > 0) {
    game.hitStop -= dt;
    return;
  }

  game.time += dt;
  game.floorTime += dt;
  const player = game.player;

  if (input.dashQueued && tryDash(player, input)) {
    game.stats.dashes += 1;
    ring(game.particles, player.x, player.y, PALETTE.player, 46);
    sfx.dash();
  }
  updatePlayer(player, input, dt, game.arena.pillars);

  if (input.attackQueued && trySlash(player)) {
    game.stats.slashes += 1;
    sfx.slash();
    resolveSlash(game);
    if (player.boltOnSlash) spawnBolt(game.bolts, player.x, player.y, player.aim, slashDamage(player));
  }

  const events = [];
  for (const enemy of game.enemies) {
    if (!enemy.dead) updateEnemy(enemy, player, dt, game.arena.pillars, events);
  }
  applyEnemyEvents(game, events);

  updateProjectiles(game.bullets, dt, game.arena.pillars);
  updateProjectiles(game.bolts, dt, game.arena.pillars);
  resolveBolts(game);
  resolveBullets(game);
  resolveTouch(game);

  const collected = updatePickups(game.pickups, player, PLAYER.pickupRadius * player.magnetMul, dt);
  for (const item of collected) {
    if (item.kind === 'shard') {
      game.shards += 1;
      game.score += SCORE.shard;
      sfx.pickup();
    } else if (item.kind === 'heart') {
      if (healPlayer(player, 1) > 0) {
        floatText(game.particles, player.x, player.y - 26, '+1 ♥', PALETTE.heart, 18);
        sfx.heart();
      } else {
        game.score += 50;
      }
    }
  }

  // Sweep the dead, then check the floor: all shades down opens the portal.
  game.enemies = game.enemies.filter((e) => !e.dead);
  if (game.enemies.length === 0 && !game.portal.open) {
    game.portal.open = true;
    showMessage(game, 'THE WAY DOWN OPENS', 'Step into the portal', 2);
    ring(game.particles, game.portal.x, game.portal.y, PALETTE.portal, 120);
    sfx.portal();
  }
  if (game.portal.open) {
    const dx = player.x - game.portal.x;
    const dy = player.y - game.portal.y;
    if (Math.hypot(dx, dy) < 34) enterPortal(game);
  }
}

/** The slash: every shade inside the arc and range takes the blade. */
function resolveSlash(game) {
  const player = game.player;
  const range = PLAYER.slashRange;
  const halfArc = PLAYER.slashArc / 2;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range + enemy.radius) continue;
    let diff = Math.atan2(dy, dx) - player.slashAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > halfArc) continue;
    const crit = Math.random() < player.critChance;
    const damage = slashDamage(player) * (crit ? 2 : 1);
    game.stats.damageDealt += damage;
    floatText(game.particles, enemy.x, enemy.y - enemy.radius - 6, crit ? `${damage} CRIT` : `${damage}`, crit ? PALETTE.shard : '#ffffff', crit ? 20 : 15);
    burst(game.particles, enemy.x, enemy.y, PALETTE.blade, 6, 160);
    sfx.hit();
    if (damageEnemy(enemy, damage)) killEnemy(game, enemy);
  }
}

/** Light bolts pierce shades, hurting each one at most once. */
function resolveBolts(game) {
  for (const bolt of game.bolts) {
    if (bolt.dead) continue;
    for (const enemy of game.enemies) {
      if (enemy.dead || bolt.hitSet.has(enemy)) continue;
      if (circlesOverlap(bolt, enemy)) {
        bolt.hitSet.add(enemy);
        game.stats.damageDealt += bolt.damage;
        burst(game.particles, enemy.x, enemy.y, PALETTE.blade, 5, 140);
        if (damageEnemy(enemy, bolt.damage)) killEnemy(game, enemy);
      }
    }
  }
}

/** Enemy bullets that reach the Warden hurt them. */
function resolveBullets(game) {
  const player = game.player;
  for (const bullet of game.bullets) {
    if (bullet.dead || bullet.delay > 0) continue;
    if (circlesOverlap(bullet, player)) {
      bullet.dead = true;
      hurtWarden(game, bullet.damage, bullet.x, bullet.y);
    }
  }
}

/** Shades that touch the Warden hurt them (and take thorns in return). */
function resolveTouch(game) {
  const player = game.player;
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    if (!circlesOverlap(enemy, player)) continue;
    if (player.thorns && enemy.thornCooldown <= 0) {
      enemy.thornCooldown = 0.6;
      if (damageEnemy(enemy, 1)) {
        killEnemy(game, enemy);
        continue;
      }
    }
    if (!isInvulnerable(player) && !isDashing(player)) {
      hurtWarden(game, enemy.touch, enemy.x, enemy.y);
    }
  }
}

function hurtWarden(game, amount, fromX, fromY) {
  const player = game.player;
  const result = hurtPlayer(player, amount);
  if (result === false) return;
  game.shake = 10;
  burst(game.particles, player.x, player.y, PALETTE.danger, 14, 200);
  sfx.hurt();
  // A shove away from the blow, so a hit never chains into another.
  const dx = player.x - fromX;
  const dy = player.y - fromY;
  const dist = Math.hypot(dx, dy) || 1;
  player.x += (dx / dist) * 26;
  player.y += (dy / dist) * 26;
  if (result === 'second-wind') {
    showMessage(game, 'SECOND WIND', 'The light refuses to go out', 2);
    ring(game.particles, player.x, player.y, PALETTE.portal, 110);
  } else if (result === 'dead') {
    loseRun(game);
  }
}

/** A shade falls: score, drops, juice — and a splitter bursts into wisps. */
function killEnemy(game, enemy) {
  game.kills += 1;
  game.score += enemy.score;
  floatText(game.particles, enemy.x, enemy.y - 20, `+${enemy.score}`, PALETTE.shard, 15);
  burst(game.particles, enemy.x, enemy.y, shadeColor(enemy.kind), 18, 230);
  game.hitStop = Math.max(game.hitStop, enemy.kind === 'boss' ? 0.22 : 0.045);
  if (enemy.kind === 'boss') game.shake = 14;
  sfx.kill();
  for (let i = 0; i < enemy.shards; i += 1) spawnPickup(game.pickups, 'shard', enemy.x, enemy.y, game.rng);
  if (Math.random() < SCORE.heartDropChance) spawnPickup(game.pickups, 'heart', enemy.x, enemy.y, game.rng);
  if (enemy.kind === 'splitter') {
    for (let i = 0; i < 2; i += 1) {
      const child = createEnemy('wisp', enemy.x + (i === 0 ? -18 : 18), enemy.y, game.floor);
      child.hp = 1;
      child.maxHp = 1;
      game.enemies.push(child);
    }
  }
}

function shadeColor(kind) {
  if (kind === 'wisp') return PALETTE.wisp;
  if (kind === 'spitter') return PALETTE.spitter;
  if (kind === 'charger') return PALETTE.charger;
  if (kind === 'splitter') return PALETTE.splitter;
  return PALETTE.boss;
}

/** Turn enemy AI events into bullets, summons and shakes. */
function applyEnemyEvents(game, events) {
  for (const event of events) {
    if (event.type === 'shoot') {
      spawnBullet(game.bullets, event.x, event.y, event.dx, event.dy, event.speed, event.radius, event.damage);
    } else if (event.type === 'ring') {
      const boss = event.enemy;
      const count = BOSS.ringBullets;
      const offset = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i += 1) {
        const angle = offset + (i / count) * Math.PI * 2;
        spawnBullet(game.bullets, boss.x + Math.cos(angle) * (boss.radius + 12), boss.y + Math.sin(angle) * (boss.radius + 12), Math.cos(angle), Math.sin(angle), BOSS.bulletSpeed, 7, 1, BOSS.ringDelay);
      }
      ring(game.particles, boss.x, boss.y, PALETTE.boss, 90);
      sfx.boss();
    } else if (event.type === 'summon') {
      const boss = event.enemy;
      for (let i = 0; i < 2; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        game.enemies.push(createEnemy('wisp', boss.x + Math.cos(angle) * 70, boss.y + Math.sin(angle) * 70, game.floor));
      }
      burst(game.particles, boss.x, boss.y, PALETTE.spitter, 16, 200);
    } else if (event.type === 'telegraph') {
      burst(game.particles, event.enemy.x, event.enemy.y, PALETTE.danger, 8, 120);
    } else if (event.type === 'charge') {
      sfx.dash();
    } else if (event.type === 'slam') {
      game.shake = 12;
      ring(game.particles, event.enemy.x, event.enemy.y, PALETTE.boss, 130);
      sfx.hurt();
    }
  }
}
