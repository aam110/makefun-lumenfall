// Projectiles and pickups: the things that fly across the arena. Enemy
// bullets hurt the Warden; the Warden's light bolts (a blessing) pierce
// shades; shards and hearts drift toward the Warden once close enough. All
// updates are pure motion and timers — no DOM — so the flight rules are
// testable in plain Node.

import { ARENA } from './config.js';

/**
 * An enemy bullet flying in a straight line. `delay` holds it still first —
 * the boss's ring materializes with a warning flash before it flies, so the
 * pattern is dodgeable instead of a point-blank surprise.
 */
export function spawnBullet(list, x, y, dx, dy, speed, radius = 6, damage = 1, delay = 0) {
  list.push({ x, y, dx, dy, speed, radius, damage, life: 6, dead: false, kind: 'bullet', delay });
}

/** A light bolt from the Twin Fang blessing: fast, piercing, short-lived. */
export function spawnBolt(list, x, y, angle, damage) {
  list.push({
    x, y,
    dx: Math.cos(angle), dy: Math.sin(angle),
    speed: 520, radius: 7, damage, life: 0.9, dead: false, kind: 'bolt', hitSet: new Set(),
  });
}

/** Move bullets and bolts; drop the ones that leave the arena or expire. */
export function updateProjectiles(list, dt, pillars) {
  for (const p of list) {
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    p.x += p.dx * p.speed * dt;
    p.y += p.dy * p.speed * dt;
    p.life -= dt;
    if (p.life <= 0) p.dead = true;
    if (p.x < ARENA.left || p.x > ARENA.right || p.y < ARENA.top || p.y > ARENA.bottom) p.dead = true;
    if (!p.dead) {
      for (const pillar of pillars) {
        if (Math.hypot(p.x - pillar.x, p.y - pillar.y) < pillar.radius + p.radius) {
          p.dead = true;
          break;
        }
      }
    }
  }
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].dead) list.splice(i, 1);
  }
}

/** A shard (score) or a heart (healing) dropped by a fallen shade. */
export function spawnPickup(list, kind, x, y, rng) {
  const angle = rng ? rng() * Math.PI * 2 : Math.random() * Math.PI * 2;
  const speed = 60 + (rng ? rng() * 60 : Math.random() * 60);
  list.push({
    kind,
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: kind === 'heart' ? 11 : 8,
    life: 14,
    magnet: false,
    dead: false,
    bob: Math.random() * Math.PI * 2,
  });
}

/**
 * Drift pickups: they scatter, slow down, then fly to the Warden once inside
 * the pickup radius. Returns the pickups collected this tick.
 */
export function updatePickups(list, player, pickupRadius, dt) {
  const collected = [];
  for (const item of list) {
    item.life -= dt;
    if (item.life <= 0) {
      item.dead = true;
      continue;
    }
    item.bob += dt * 4;
    const dx = player.x - item.x;
    const dy = player.y - item.y;
    const dist = Math.hypot(dx, dy);
    if (dist < pickupRadius) item.magnet = true;
    if (item.magnet && dist > 1) {
      const pull = 420;
      item.vx += (dx / dist) * pull * dt * 4;
      item.vy += (dy / dist) * pull * dt * 4;
      item.vx *= 0.9;
      item.vy *= 0.9;
    } else {
      item.vx *= 0.92;
      item.vy *= 0.92;
    }
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    if (dist < player.radius + item.radius + 4) {
      item.dead = true;
      collected.push(item);
    }
  }
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].dead) list.splice(i, 1);
  }
  return collected;
}
