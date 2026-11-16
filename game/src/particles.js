// Particles and floating text: the juice. Bursts of sparks when a shade
// dies, a shockwave ring on a dash and on the boss's slam, drifting embers in
// the background, and damage numbers that rise and fade. Everything here is a
// plain list of short-lived objects; the renderer draws them, the game spawns
// them, and nothing touches the DOM.

/** A fresh particle store. */
export function createParticles() {
  return { sparks: [], rings: [], texts: [], embers: [] };
}

/** A burst of sparks flying out from a point. */
export function burst(store, x, y, color, count = 12, speed = 180) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.4 + Math.random() * 0.8);
    store.sparks.push({
      x, y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.4 + Math.random() * 0.35,
      maxLife: 0.75,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

/** An expanding ring (dash, slam, portal). */
export function ring(store, x, y, color, maxRadius = 70) {
  store.rings.push({ x, y, color, radius: 6, maxRadius, life: 0.4, maxLife: 0.4 });
}

/** A floating number or word that rises and fades. */
export function floatText(store, x, y, text, color = '#ffffff', size = 16) {
  store.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9 });
}

/** Seed the slow background embers that drift up through the abyss. */
export function seedEmbers(store, width, height, count = 40) {
  store.embers = [];
  for (let i = 0; i < count; i += 1) {
    store.embers.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1 + Math.random() * 2.2,
      speed: 8 + Math.random() * 22,
      drift: (Math.random() - 0.5) * 12,
      alpha: 0.15 + Math.random() * 0.4,
    });
  }
}

/** Advance every particle by dt; drop the spent ones. */
export function updateParticles(store, dt, width, height) {
  for (const spark of store.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= 0.94;
    spark.vy *= 0.94;
    spark.life -= dt;
  }
  store.sparks = store.sparks.filter((s) => s.life > 0);
  for (const item of store.rings) {
    item.life -= dt;
    item.radius = item.maxRadius * (1 - Math.max(0, item.life) / item.maxLife);
  }
  store.rings = store.rings.filter((r) => r.life > 0);
  for (const text of store.texts) {
    text.y -= 34 * dt;
    text.life -= dt;
  }
  store.texts = store.texts.filter((t) => t.life > 0);
  for (const ember of store.embers) {
    ember.y -= ember.speed * dt;
    ember.x += ember.drift * dt;
    if (ember.y < -6) {
      ember.y = height + 6;
      ember.x = Math.random() * width;
    }
    if (ember.x < -6) ember.x = width + 6;
    if (ember.x > width + 6) ember.x = -6;
  }
}
