// The arena: one procedurally built room per floor. A room is a walled
// rectangle with round crystal pillars (solid cover), glowing crystal shards
// (decoration) and spawn points. Generation is seeded, so the same seed and
// floor always build the same room; nothing here touches the DOM, so the
// layout rules are testable in plain Node.

import { ARENA, pillarCount } from './config.js';
import { int, range } from './rng.js';

/** Build a floor's room: pillars, decor crystals and enemy spawn points. */
export function generateArena(rng, floor) {
  const pillars = [];
  const target = pillarCount(floor);
  let guard = 0;
  while (pillars.length < target && guard < 200) {
    guard += 1;
    const pillar = {
      x: range(rng, ARENA.left + 70, ARENA.right - 70),
      y: range(rng, ARENA.top + 70, ARENA.bottom - 70),
      radius: int(rng, 22, 34),
    };
    // Keep the player's spawn clear and the pillars out of each other.
    const spawnX = (ARENA.left + ARENA.right) / 2;
    const spawnY = ARENA.bottom - 70;
    if (Math.hypot(pillar.x - spawnX, pillar.y - spawnY) < pillar.radius + 70) continue;
    if (pillars.some((other) => Math.hypot(pillar.x - other.x, pillar.y - other.y) < pillar.radius + other.radius + 46)) continue;
    pillars.push(pillar);
  }
  const crystals = [];
  for (let i = 0; i < 14; i += 1) {
    crystals.push({
      x: range(rng, ARENA.left + 16, ARENA.right - 16),
      y: range(rng, ARENA.top + 16, ARENA.bottom - 16),
      size: range(rng, 4, 11),
      phase: range(rng, 0, Math.PI * 2),
      hue: i % 3,
    });
  }
  return { floor, pillars, crystals };
}

/** The player's spawn: centre-bottom of the room, always clear. */
export function playerSpawn() {
  return { x: (ARENA.left + ARENA.right) / 2, y: ARENA.bottom - 70 };
}

/**
 * An enemy spawn point: near a random wall, away from the player and out of
 * the pillars, so nothing spawns on top of the Warden or inside cover.
 */
export function enemySpawn(rng, pillars, px, py) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const edge = int(rng, 0, 3);
    let x;
    let y;
    if (edge === 0) { x = range(rng, ARENA.left + 40, ARENA.right - 40); y = ARENA.top + 46; }
    else if (edge === 1) { x = range(rng, ARENA.left + 40, ARENA.right - 40); y = ARENA.bottom - 46; }
    else if (edge === 2) { x = ARENA.left + 46; y = range(rng, ARENA.top + 40, ARENA.bottom - 40); }
    else { x = ARENA.right - 46; y = range(rng, ARENA.top + 40, ARENA.bottom - 40); }
    if (Math.hypot(x - px, y - py) < 190) continue;
    if (pillars.some((p) => Math.hypot(x - p.x, y - p.y) < p.radius + 26)) continue;
    return { x, y };
  }
  return { x: ARENA.left + 60, y: ARENA.top + 60 };
}

/** Clamp a circle inside the arena walls. */
export function clampToArena(body) {
  body.x = Math.min(ARENA.right - body.radius, Math.max(ARENA.left + body.radius, body.x));
  body.y = Math.min(ARENA.bottom - body.radius, Math.max(ARENA.top + body.radius, body.y));
}

/** Push a circle out of every pillar it overlaps. Returns true if it moved. */
export function resolvePillars(body, pillars) {
  let moved = false;
  for (const pillar of pillars) {
    const dx = body.x - pillar.x;
    const dy = body.y - pillar.y;
    const dist = Math.hypot(dx, dy);
    const min = pillar.radius + body.radius;
    if (dist < min && dist > 0.001) {
      body.x = pillar.x + (dx / dist) * min;
      body.y = pillar.y + (dy / dist) * min;
      moved = true;
    } else if (dist <= 0.001) {
      body.x = pillar.x + min;
      moved = true;
    }
  }
  return moved;
}

/** Do two circles overlap? The one collision test the combat uses. */
export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const min = a.radius + b.radius;
  return dx * dx + dy * dy < min * min;
}

/** Does the segment from (x1,y1) to (x2,y2) cross a pillar? For enemy sight. */
export function segmentBlocked(x1, y1, x2, y2, pillars) {
  for (const pillar of pillars) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    let t = lengthSq === 0 ? 0 : ((pillar.x - x1) * dx + (pillar.y - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    if (Math.hypot(pillar.x - closestX, pillar.y - closestY) < pillar.radius) return true;
  }
  return false;
}
