// The blessings: the upgrade the abyss offers after every cleared floor.
// The Warden picks one of three. Each blessing is a small object with a name,
// a glyph drawn on its card, a one-line promise, and an apply() that writes
// onto the player. The pool is rolled from the seeded RNG, so the same run
// offers the same choices.

import { shuffled } from './rng.js';

/** The whole pool. Every entry changes the run in a different way. */
export const BLESSINGS = [
  {
    id: 'ember-edge', name: 'Ember Edge', glyph: '⚔', color: '#ff9f43',
    desc: '+1 slash damage. Your blade burns brighter.',
    apply(player) { player.bonusDamage += 1; },
  },
  {
    id: 'swift-boots', name: 'Swift Boots', glyph: '»', color: '#7df9ff',
    desc: '+15% move speed. The dark cannot catch you.',
    apply(player) { player.speedMul *= 1.15; },
  },
  {
    id: 'wardens-heart', name: "Warden's Heart", glyph: '♥', color: '#ff5d73',
    desc: '+1 max heart, and mend 1 heart now.',
    apply(player) { player.maxHp += 1; player.hp = Math.min(player.maxHp, player.hp + 1); },
  },
  {
    id: 'blink-charm', name: 'Blink Charm', glyph: '✦', color: '#c084fc',
    desc: 'Dash recharges 30% faster.',
    apply(player) { player.dashCooldownMul *= 0.7; },
  },
  {
    id: 'twin-fang', name: 'Twin Fang', glyph: '≋', color: '#a5f3fc',
    desc: 'Every slash also fires a piercing light bolt.',
    apply(player) { player.boltOnSlash = true; },
  },
  {
    id: 'magnet-core', name: 'Magnet Core', glyph: '◉', color: '#ffe066',
    desc: 'Shards and hearts fly to you from much further.',
    apply(player) { player.magnetMul *= 2.5; },
  },
  {
    id: 'thorn-halo', name: 'Thorn Halo', glyph: '✳', color: '#7dff6a',
    desc: 'Shades that touch you take 1 damage.',
    apply(player) { player.thorns = true; },
  },
  {
    id: 'second-wind', name: 'Second Wind', glyph: '↻', color: '#8affd1',
    desc: 'Once per run, death returns you with 2 hearts.',
    apply(player) { player.secondWind = true; },
  },
  {
    id: 'crit-lens', name: 'Crit Lens', glyph: '◎', color: '#ffd166',
    desc: '+25% critical chance. Crits strike for double.',
    apply(player) { player.critChance += 0.25; },
  },
  {
    id: 'vital-bloom', name: 'Vital Bloom', glyph: '❀', color: '#ff8fd8',
    desc: 'Mend 1 heart whenever you descend a floor.',
    apply(player) { player.healOnFloor = true; },
  },
];

/** Roll `count` distinct blessings, never repeating one already taken. When
 * fewer than `count` are left, the abyss offers only what remains — a
 * blessing is never offered twice in one run. */
export function rollBlessings(rng, taken, count = 3) {
  const available = BLESSINGS.filter((b) => !taken.includes(b.id));
  return shuffled(rng, available).slice(0, count);
}

/** Find a blessing by id. */
export function blessingById(id) {
  return BLESSINGS.find((b) => b.id === id) || null;
}
