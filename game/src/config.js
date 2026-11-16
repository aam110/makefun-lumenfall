// LUMENFALL tuning: every number the game plays by lives here, so a balance
// change is one edit and the rest of the code reads like the design.
// The game is a neon roguelite descent: 10 floors of arena combat, a blessing
// choice after each cleared floor, and a boss on the last one.

/** The canvas's internal resolution (16:9); CSS scales it to the window. */
export const VIEW = { width: 960, height: 540 };

/** The walled play field inside the view; the walls are the arena's edge. */
export const ARENA = { left: 28, top: 64, right: 932, bottom: 512 };

/** Fixed simulation step: 60 ticks a second, decoupled from the frame rate. */
export const STEP = 1 / 60;

/** Floors in one descent; the boss waits on the last one. */
export const TOTAL_FLOORS = 10;

/** The palette: a deep indigo abyss lit by cyan, gold and magenta neon. */
export const PALETTE = {
  abyssTop: '#0b0618',
  abyssBottom: '#150a2e',
  wall: '#241544',
  wallEdge: '#3d2a6b',
  floorA: '#120a26',
  floorB: '#170d31',
  pillar: '#1d1140',
  pillarEdge: '#4b2f86',
  crystal: '#7c5cff',
  player: '#7df9ff',
  playerCore: '#eafcff',
  blade: '#a5f3fc',
  wisp: '#38e1ff',
  spitter: '#ff4fd8',
  charger: '#ff9f43',
  splitter: '#7dff6a',
  boss: '#ffd166',
  bossCore: '#fff3c4',
  shard: '#ffe066',
  heart: '#ff5d73',
  portal: '#8affd1',
  text: '#f2ecff',
  dim: '#a99ac9',
  danger: '#ff5d73',
};

/** The Warden: the player character. */
export const PLAYER = {
  radius: 14,
  speed: 215,
  maxHp: 5,
  slashRange: 78,
  slashArc: Math.PI * 0.75,
  slashCooldown: 0.32,
  slashDamage: 1,
  dashSpeed: 620,
  dashTime: 0.16,
  dashCooldown: 1.6,
  pickupRadius: 46,
  hurtInvuln: 0.9,
};

/** Enemy archetypes: each one moves and fights differently. */
export const ENEMIES = {
  wisp: { hp: 2, speed: 82, radius: 13, score: 50, shards: 2, touch: 1 },
  spitter: { hp: 3, speed: 62, radius: 14, score: 80, shards: 3, touch: 1, shotCooldown: 2.1, shotSpeed: 165, keepAway: 230 },
  charger: { hp: 4, speed: 70, radius: 15, score: 100, shards: 3, touch: 1, telegraph: 0.65, chargeSpeed: 430, chargeTime: 0.45, recover: 0.7 },
  splitter: { hp: 3, speed: 52, radius: 17, score: 90, shards: 2, touch: 1, children: 2 },
};

/** The Hollow Star, the boss of the final floor. */
export const BOSS = {
  hp: 60,
  speed: 58,
  radius: 34,
  score: 2000,
  ringCooldown: 3,
  ringBullets: 8,
  bulletSpeed: 135,
  ringDelay: 0.45,
  summonCooldown: 9,
  chargeTelegraph: 0.8,
  chargeSpeed: 380,
  enrageBelow: 0.5,
};

/** Scoring: kills, shards, floor clears and the victory bonus. */
export const SCORE = {
  shard: 10,
  floorClear: 250,
  floorTimeBonus: 120,
  victory: 2000,
  heartDropChance: 0.09,
};

/**
 * How many enemies a floor holds, and which kinds may appear on it.
 * Floor 1 is gentle (wisps only); new kinds join as the descent deepens.
 */
export function floorPlan(floor) {
  const count = 4 + floor;
  const kinds = ['wisp'];
  if (floor >= 2) kinds.push('spitter');
  if (floor >= 3) kinds.push('charger');
  if (floor >= 4) kinds.push('splitter');
  return { count, kinds };
}

/** Pillars per floor: more cover as the rooms get busier. */
export function pillarCount(floor) {
  return 3 + Math.min(4, Math.floor(floor / 2));
}
