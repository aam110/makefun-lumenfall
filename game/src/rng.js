// A tiny seeded random number generator (mulberry32), so a run started with
// ?seed=N plays the same rooms, the same enemy mixes and the same blessings
// every time. The screenshot staging and the tests both lean on it: a staged
// frame is a real game, played forward from a known seed.

/** Make a generator from an integer seed. */
export function makeRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** An integer in [min, max]. */
export function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of an array, uniformly. */
export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

/** A shuffled copy of an array (Fisher-Yates). */
export function shuffled(rng, items) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}
