// Everything LUMENFALL shows: the abyss, the arena, the Warden, the shades,
// the HUD and every screen. All art is drawn in code — gradients, glow and
// geometry — so the game ships no image files at all. draw() takes the game,
// the input (for the aim reticle) and a wall-clock time for ambient motion;
// the game module never draws, so logic and looks stay separate.

import { ARENA, PALETTE, PLAYER, VIEW } from './config.js';
import { blessingCardRects, endButtonRects, pauseButtonRects, enemiesLeft, liveBoss, STATE_TITLE, STATE_PLAY, STATE_BLESSING, STATE_PAUSED, STATE_VICTORY, STATE_GAMEOVER } from './game.js';
import { blessingById } from './blessings.js';
import { dashReadyFraction } from './player.js';

const FONT = "'Trebuchet MS','Segoe UI',Verdana,sans-serif";

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glowText(ctx, text, x, y, font, color, glowColor, glow = 18) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Draw one frame: world, then HUD, then the screen overlay. */
export function draw(ctx, game, input, time) {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground(ctx, game, time);
  if (game.state === STATE_TITLE) {
    drawTitleScene(ctx, game, time);
  } else {
    drawArena(ctx, game, time);
    drawPickups(ctx, game);
    drawPortal(ctx, game, time);
    drawEnemies(ctx, game, time);
    drawPlayer(ctx, game, time);
    drawProjectiles(ctx, game);
    drawParticles(ctx, game);
  }
  ctx.restore();
  drawVignette(ctx);
  // The HUD belongs to the run itself: play, blessing and pause show it; the
  // end screens carry their own stats and stay clean.
  if (game.state === STATE_PLAY || game.state === STATE_BLESSING || game.state === STATE_PAUSED) drawHud(ctx, game);
  if (game.state === STATE_PLAY && input) drawReticle(ctx, input);
  if (game.messageTime > 0 && game.message) drawMessage(ctx, game);
  if (game.state === STATE_TITLE) drawTitle(ctx, game, time);
  if (game.state === STATE_BLESSING) drawBlessing(ctx, game, input);
  if (game.state === STATE_PAUSED) drawPause(ctx, game, input);
  if (game.state === STATE_VICTORY) drawEnd(ctx, game, true, input);
  if (game.state === STATE_GAMEOVER) drawEnd(ctx, game, false, input);
}

function drawBackground(ctx, game, time) {
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  gradient.addColorStop(0, PALETTE.abyssTop);
  gradient.addColorStop(1, PALETTE.abyssBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(-20, -20, VIEW.width + 40, VIEW.height + 40);
  // Drifting embers rise through the whole descent.
  for (const ember of game.particles.embers) {
    ctx.globalAlpha = ember.alpha * (0.7 + 0.3 * Math.sin(time + ember.x));
    ctx.fillStyle = '#b79cff';
    ctx.beginPath();
    ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawArena(ctx, game, time) {
  // Floor: a faint checker of two dark stones.
  const tile = 48;
  for (let y = ARENA.top; y < ARENA.bottom; y += tile) {
    for (let x = ARENA.left; x < ARENA.right; x += tile) {
      const even = ((Math.floor(x / tile) + Math.floor(y / tile)) % 2) === 0;
      ctx.fillStyle = even ? PALETTE.floorA : PALETTE.floorB;
      ctx.fillRect(x, y, Math.min(tile, ARENA.right - x), Math.min(tile, ARENA.bottom - y));
    }
  }
  // Walls: a thick neon-edged frame.
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(0, 0, VIEW.width, ARENA.top);
  ctx.fillRect(0, ARENA.bottom, VIEW.width, VIEW.height - ARENA.bottom);
  ctx.fillRect(0, ARENA.top, ARENA.left, ARENA.bottom - ARENA.top);
  ctx.fillRect(ARENA.right, ARENA.top, VIEW.width - ARENA.right, ARENA.bottom - ARENA.top);
  ctx.strokeStyle = PALETTE.wallEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(ARENA.left + 1, ARENA.top + 1, ARENA.right - ARENA.left - 2, ARENA.bottom - ARENA.top - 2);
  // (The floor number lives in the HUD above, not carved here, so the two
  // never print over each other.)
  // Glowing decor crystals pulse gently.
  for (const crystal of game.arena.crystals) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 2 + crystal.phase);
    const color = crystal.hue === 0 ? '#7c5cff' : crystal.hue === 1 ? '#38e1ff' : '#ff4fd8';
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(crystal.x, crystal.y - crystal.size);
    ctx.lineTo(crystal.x + crystal.size * 0.6, crystal.y);
    ctx.lineTo(crystal.x, crystal.y + crystal.size);
    ctx.lineTo(crystal.x - crystal.size * 0.6, crystal.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Pillars: dark columns with a neon rim and a glowing core.
  for (const pillar of game.arena.pillars) {
    ctx.fillStyle = PALETTE.pillar;
    ctx.beginPath();
    ctx.arc(pillar.x, pillar.y, pillar.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.pillarEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = PALETTE.crystal;
    ctx.shadowBlur = 14;
    ctx.fillStyle = PALETTE.crystal;
    ctx.beginPath();
    ctx.arc(pillar.x, pillar.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPortal(ctx, game, time) {
  if (!game.portal.open) return;
  const { x, y } = game.portal;
  const pulse = 1 + 0.1 * Math.sin(time * 4);
  ctx.save();
  ctx.shadowColor = PALETTE.portal;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = PALETTE.portal;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * pulse, 40 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(138,255,209,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y, 20 * pulse, 34 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.font = `700 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.portal;
  ctx.fillText('▼  DESCEND  ▼', x, y + 58);
}

function drawPickups(ctx, game) {
  for (const item of game.pickups) {
    const bob = Math.sin(item.bob) * 3;
    const fade = item.life < 3 ? (Math.sin(item.life * 10) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    if (item.kind === 'shard') {
      ctx.shadowColor = PALETTE.shard;
      ctx.shadowBlur = 12;
      ctx.fillStyle = PALETTE.shard;
      ctx.save();
      ctx.translate(item.x, item.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    } else {
      ctx.shadowColor = PALETTE.heart;
      ctx.shadowBlur = 12;
      ctx.fillStyle = PALETTE.heart;
      drawHeart(ctx, item.x, item.y + bob, 9);
    }
    ctx.restore();
  }
}

function drawHeart(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.8);
  ctx.bezierCurveTo(x - size * 1.4, y, x - size * 0.7, y - size, x, y - size * 0.3);
  ctx.bezierCurveTo(x + size * 0.7, y - size, x + size * 1.4, y, x, y + size * 0.8);
  ctx.fill();
}

function drawEnemies(ctx, game, time) {
  for (const enemy of game.enemies) {
    if (enemy.dead) continue;
    const flash = enemy.flash > 0;
    if (enemy.kind === 'boss') drawBoss(ctx, enemy, time, flash);
    else drawShade(ctx, enemy, time, flash);
    // A small health bar over anything hurt.
    if (enemy.hp < enemy.maxHp && enemy.kind !== 'boss') {
      const w = enemy.radius * 2;
      const ratio = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w, 5);
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(enemy.x - w / 2, enemy.y - enemy.radius - 12, w * ratio, 5);
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

function drawShade(ctx, enemy, time, flash) {
  const color = flash ? '#ffffff' : shadeColor(enemy.kind);
  const telegraph = enemy.state === 'telegraph';
  ctx.save();
  ctx.shadowColor = telegraph ? PALETTE.danger : color;
  ctx.shadowBlur = telegraph ? 26 : 16;
  ctx.fillStyle = color;
  if (enemy.kind === 'wisp') {
    // A round orb with a trailing tail.
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y + enemy.radius * 0.9, enemy.radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (enemy.kind === 'spitter') {
    // A spiked diamond.
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + time;
      const r = i % 2 === 0 ? enemy.radius + 4 : enemy.radius - 3;
      const px = enemy.x + Math.cos(angle) * r;
      const py = enemy.y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'charger') {
    // A heavy orb with horns; it blazes red while telegraphing.
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = telegraph ? '#ff2e4d' : '#ffd166';
    ctx.beginPath();
    ctx.moveTo(enemy.x - enemy.radius * 0.7, enemy.y - enemy.radius * 0.5);
    ctx.lineTo(enemy.x - enemy.radius * 1.2, enemy.y - enemy.radius * 1.2);
    ctx.lineTo(enemy.x - enemy.radius * 0.2, enemy.y - enemy.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(enemy.x + enemy.radius * 0.7, enemy.y - enemy.radius * 0.5);
    ctx.lineTo(enemy.x + enemy.radius * 1.2, enemy.y - enemy.radius * 1.2);
    ctx.lineTo(enemy.x + enemy.radius * 0.2, enemy.y - enemy.radius * 0.8);
    ctx.closePath();
    ctx.fill();
  } else if (enemy.kind === 'splitter') {
    // A wobbling blob with a bright nucleus.
    ctx.beginPath();
    ctx.ellipse(enemy.x, enemy.y, enemy.radius * (1 + 0.1 * Math.sin(time * 5 + enemy.wobble)), enemy.radius * (1 - 0.1 * Math.sin(time * 5 + enemy.wobble)), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#eaffea';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Two eyes, always watching the Warden.
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#12081f';
  ctx.beginPath();
  ctx.arc(enemy.x - 5, enemy.y - 2, 2.6, 0, Math.PI * 2);
  ctx.arc(enemy.x + 5, enemy.y - 2, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoss(ctx, boss, time, flash) {
  const enraged = boss.hp <= boss.maxHp * 0.5;
  const color = flash ? '#ffffff' : enraged ? '#ff5d73' : PALETTE.boss;
  const spin = time * (enraged ? 1.6 : 0.7);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 34;
  ctx.fillStyle = color;
  // A five-pointed star with a burning core.
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = spin + (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? boss.radius + 12 : boss.radius * 0.55;
    const px = boss.x + Math.cos(angle) * r;
    const py = boss.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.bossCore;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, 12 + 3 * Math.sin(time * 6), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12081f';
  ctx.beginPath();
  ctx.arc(boss.x - 5, boss.y - 2, 2.6, 0, Math.PI * 2);
  ctx.arc(boss.x + 5, boss.y - 2, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (boss.state === 'telegraph') {
    ctx.save();
    ctx.strokeStyle = PALETTE.danger;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.radius + 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPlayer(ctx, game, time) {
  const player = game.player;
  if (player.invuln > 0 && Math.floor(time * 18) % 2 === 0 && player.dashTime <= 0) return; // blink while invulnerable
  const dashing = player.dashTime > 0;
  ctx.save();
  // The blade's arc, sweeping where the Warden aims.
  if (player.slashTime > 0) {
    const progress = 1 - player.slashTime / 0.16;
    const sweep = player.slashAngle - PLAYER.slashArc / 2 + PLAYER.slashArc * progress;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = PALETTE.blade;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = PALETTE.blade;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER.slashRange * 0.8, sweep - 0.7, sweep + 0.7);
    ctx.stroke();
    ctx.restore();
  }
  // Dash trail.
  if (dashing) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(player.x - player.dashDirX * 22, player.y - player.dashDirY * 22, player.radius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // The Warden: a hooded keeper with a glowing core.
  ctx.shadowColor = PALETTE.player;
  ctx.shadowBlur = 20;
  const bob = player.moving ? Math.sin(player.walkCycle) * 2 : Math.sin(time * 2) * 1.5;
  ctx.fillStyle = '#123a4d';
  ctx.beginPath();
  ctx.arc(player.x, player.y + bob, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y + bob - player.radius - 4);
  ctx.lineTo(player.x - 11, player.y + bob - 2);
  ctx.lineTo(player.x + 11, player.y + bob - 2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.playerCore;
  ctx.beginPath();
  ctx.arc(player.x, player.y + bob, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b2b3a';
  ctx.beginPath();
  ctx.arc(player.x - 4 + Math.cos(player.aim) * 3, player.y + bob - 3 + Math.sin(player.aim) * 3, 2.2, 0, Math.PI * 2);
  ctx.arc(player.x + 4 + Math.cos(player.aim) * 3, player.y + bob - 3 + Math.sin(player.aim) * 3, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // The thorn halo, when the blessing is held.
  if (player.thorns) {
    ctx.strokeStyle = PALETTE.splitter;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(player.x, player.y + bob, player.radius + 9, time, time + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawProjectiles(ctx, game) {
  for (const bullet of game.bullets) {
    ctx.save();
    if (bullet.delay > 0) {
      // A materializing bullet: a pulsing warning, not yet a threat.
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 60);
      ctx.globalAlpha = 0.45 + 0.45 * pulse;
      ctx.strokeStyle = '#ff8fa0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, bullet.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.shadowColor = '#ff5d73';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff8fa0';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const bolt of game.bolts) {
    ctx.save();
    ctx.shadowColor = PALETTE.blade;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = PALETTE.blade;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bolt.x - bolt.dx * 16, bolt.y - bolt.dy * 16);
    ctx.lineTo(bolt.x, bolt.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawParticles(ctx, game) {
  for (const spark of game.particles.sparks) {
    ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const item of game.particles.rings) {
    ctx.globalAlpha = Math.max(0, item.life / item.maxLife);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const text of game.particles.texts) {
    ctx.globalAlpha = Math.max(0, text.life / text.maxLife);
    ctx.font = `700 ${text.size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;
}

function drawVignette(ctx) {
  const gradient = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(4,0,12,0.55)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function drawHud(ctx, game) {
  const player = game.player;
  // Hearts, top-left.
  for (let i = 0; i < player.maxHp; i += 1) {
    ctx.save();
    if (i < player.hp) {
      ctx.shadowColor = PALETTE.heart;
      ctx.shadowBlur = 10;
      ctx.fillStyle = PALETTE.heart;
    } else {
      ctx.fillStyle = '#3a2a4d';
    }
    drawHeart(ctx, 44 + i * 30, 32, 11);
    ctx.restore();
  }
  // Floor and shades left, top-centre.
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`FLOOR ${game.floor} / ${game.totalFloors}`, VIEW.width / 2, 26);
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = game.portal.open ? PALETTE.portal : PALETTE.dim;
  ctx.fillText(game.portal.open ? 'PORTAL OPEN — DESCEND' : `SHADES LEFT: ${enemiesLeft(game)}`, VIEW.width / 2, 46);
  // Score and shards, top-right.
  ctx.textAlign = 'right';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`${game.score}`, VIEW.width - 28, 30);
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = PALETTE.shard;
  ctx.fillText(`◆ ${game.shards}   BEST ${Math.max(game.best, game.score)}`, VIEW.width - 28, 50);
  // Dash cooldown, bottom-left.
  const fraction = dashReadyFraction(player);
  ctx.textAlign = 'left';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillStyle = fraction >= 1 ? PALETTE.player : PALETTE.dim;
  ctx.fillText(fraction >= 1 ? 'DASH READY [SHIFT]' : 'DASH…', 28, VIEW.height - 34);
  ctx.fillStyle = '#2a1a4d';
  ctx.fillRect(28, VIEW.height - 28, 120, 8);
  ctx.fillStyle = PALETTE.player;
  ctx.fillRect(28, VIEW.height - 28, 120 * fraction, 8);
  // Time, bottom-right.
  ctx.textAlign = 'right';
  ctx.font = `400 13px ${FONT}`;
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`${formatTime(game.time)}   ·   M mute   ·   P pause`, VIEW.width - 28, VIEW.height - 22);
  // Boss bar.
  const boss = liveBoss(game);
  if (boss) {
    const w = 420;
    const x = (VIEW.width - w) / 2;
    const y = 56;
    ctx.textAlign = 'center';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillStyle = PALETTE.boss;
    ctx.fillText('✦ THE HOLLOW STAR ✦', VIEW.width / 2, y - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = boss.hp <= boss.maxHp * 0.5 ? '#ff5d73' : PALETTE.boss;
    ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 10);
  }
}

function drawReticle(ctx, input) {
  ctx.save();
  ctx.strokeStyle = 'rgba(165,243,252,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(input.aimX, input.aimY, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(165,243,252,0.9)';
  ctx.beginPath();
  ctx.arc(input.aimX, input.aimY, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMessage(ctx, game) {
  const alpha = Math.min(1, game.messageTime * 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  glowText(ctx, game.message.text, VIEW.width / 2, 118, `700 34px ${FONT}`, PALETTE.text, '#7c5cff', 22);
  if (game.message.sub) {
    ctx.font = `400 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(game.message.sub, VIEW.width / 2, 148);
  }
  ctx.restore();
}

function drawTitleScene(ctx, game, time) {
  // A few wild wisps drift across the title, so the menu feels alive.
  for (let i = 0; i < 5; i += 1) {
    const x = VIEW.width * (0.15 + 0.17 * i) + Math.sin(time * 0.5 + i * 2) * 30;
    const y = 400 + Math.sin(time * 0.8 + i * 1.7) * 22;
    ctx.save();
    ctx.shadowColor = PALETTE.wisp;
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = PALETTE.wisp;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawTitle(ctx, game, time) {
  ctx.fillStyle = 'rgba(6,2,16,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  glowText(ctx, 'LUMENFALL', VIEW.width / 2, 132, `700 84px ${FONT}`, '#eafcff', '#38e1ff', 30);
  ctx.font = `400 19px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('Descent of the Last Light  ·  a neon roguelite in 10 floors', VIEW.width / 2, 182);
  const pulse = 0.65 + 0.35 * Math.sin(time * 3);
  ctx.save();
  ctx.globalAlpha = pulse;
  glowText(ctx, 'PRESS ENTER OR CLICK TO DESCEND', VIEW.width / 2, 252, `700 22px ${FONT}`, PALETTE.shard, '#ffd166', 16);
  ctx.restore();
  // Controls.
  ctx.font = `400 15px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.textAlign = 'center';
  ctx.fillText('WASD / Arrows — move        Mouse — aim        Click / Space — slash        Shift — dash', VIEW.width / 2, 300);
  ctx.fillText('Clear every shade, step into the portal, choose a blessing, descend.', VIEW.width / 2, 326);
  ctx.fillText('Slay the Hollow Star on floor 10 to light the abyss again.', VIEW.width / 2, 350);
  if (game.best > 0) {
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = PALETTE.shard;
    ctx.fillText(`BEST SCORE  ${game.best}`, VIEW.width / 2, 392);
  }
  ctx.font = `400 12px ${FONT}`;
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText('An original game by Silowek  ·  built for make.fun best-game-01  ·  M mute  ·  P pause', VIEW.width / 2, VIEW.height - 18);
}

function drawBlessing(ctx, game, input) {
  ctx.fillStyle = 'rgba(6,2,16,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  glowText(ctx, 'THE ABYSS OFFERS', VIEW.width / 2, 84, `700 36px ${FONT}`, PALETTE.text, '#7c5cff', 20);
  ctx.font = `400 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`Floor ${game.floor} cleared — choose one blessing, then descend`, VIEW.width / 2, 116);
  const rects = blessingCardRects(game.blessingChoices.length);
  game.blessingChoices.forEach((choice, i) => {
    const rect = rects[i];
    const hovered = input && input.aimX >= rect.x && input.aimX <= rect.x + rect.w && input.aimY >= rect.y && input.aimY <= rect.y + rect.h;
    ctx.save();
    ctx.shadowColor = choice.color;
    ctx.shadowBlur = hovered ? 26 : 12;
    ctx.fillStyle = hovered ? '#241145' : '#170b31';
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = choice.color;
    ctx.lineWidth = hovered ? 3 : 2;
    roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.stroke();
    ctx.fillStyle = choice.color;
    ctx.font = `700 54px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(choice.glyph, rect.x + rect.w / 2, rect.y + 82);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(choice.name, rect.x + rect.w / 2, rect.y + 138);
    ctx.fillStyle = PALETTE.dim;
    ctx.font = `400 14px ${FONT}`;
    wrapText(ctx, choice.desc, rect.x + rect.w / 2, rect.y + 168, rect.w - 32, 20);
    ctx.fillStyle = choice.color;
    ctx.font = `700 14px ${FONT}`;
    ctx.fillText(`[ ${i + 1} ]  or click`, rect.x + rect.w / 2, rect.y + rect.h - 18);
    ctx.restore();
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  lines.forEach((entry, i) => ctx.fillText(entry, x, y + i * lineHeight));
}

function drawButton(ctx, rect, label, hovered, accent) {
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = hovered ? 18 : 8;
  ctx.fillStyle = hovered ? '#2a1454' : '#170b31';
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  roundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}

function hoveredRect(input, rect) {
  return input && input.aimX >= rect.x && input.aimX <= rect.x + rect.w && input.aimY >= rect.y && input.aimY <= rect.y + rect.h;
}

function drawPause(ctx, game, input) {
  ctx.fillStyle = 'rgba(6,2,16,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  glowText(ctx, 'PAUSED', VIEW.width / 2, 150, `700 52px ${FONT}`, PALETTE.text, '#7c5cff', 22);
  ctx.font = `400 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.dim;
  ctx.fillText(`Floor ${game.floor}  ·  Score ${game.score}  ·  the abyss waits`, VIEW.width / 2, 205);
  ctx.fillText('WASD move  ·  Click / Space slash  ·  Shift dash  ·  Esc resume', VIEW.width / 2, 240);
  const buttons = pauseButtonRects();
  drawButton(ctx, buttons.resume, 'RESUME  [Esc]', hoveredRect(input, buttons.resume), PALETTE.player);
  drawButton(ctx, buttons.restart, 'RESTART  [R]', hoveredRect(input, buttons.restart), PALETTE.danger);
}

function drawEnd(ctx, game, won, input) {
  ctx.fillStyle = won ? 'rgba(20,10,2,0.6)' : 'rgba(6,2,16,0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  if (won) {
    glowText(ctx, 'THE STAR IS LIT', VIEW.width / 2, 118, `700 56px ${FONT}`, '#fff3c4', '#ffd166', 28);
    ctx.font = `400 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText('The Hollow Star burns bright again. The descent is complete.', VIEW.width / 2, 162);
  } else {
    glowText(ctx, 'THE LIGHT FADES', VIEW.width / 2, 118, `700 56px ${FONT}`, PALETTE.text, '#ff5d73', 28);
    ctx.font = `400 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.dim;
    ctx.fillText(`The abyss claims another warden on floor ${game.floor}.`, VIEW.width / 2, 162);
  }
  ctx.font = `700 30px ${FONT}`;
  ctx.fillStyle = PALETTE.shard;
  ctx.fillText(`SCORE  ${game.score}`, VIEW.width / 2, 222);
  if (game.score >= game.best && game.score > 0) {
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = PALETTE.portal;
    ctx.fillText('★ NEW BEST ★', VIEW.width / 2, 252);
  }
  ctx.font = `400 16px ${FONT}`;
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`Floors cleared ${won ? game.totalFloors : game.floor - 1}   ·   Shades slain ${game.kills}   ·   Shards ${game.shards}   ·   Time ${formatTime(game.time)}`, VIEW.width / 2, 292);
  ctx.fillStyle = PALETTE.dim;
  const blessingNames = game.blessingsTaken.map((id) => (blessingById(id) || { name: id }).name);
  const blessingLine = blessingNames.length ? `Blessings: ${blessingNames.join('  ·  ')}` : 'Blessings: none taken';
  ctx.font = `400 14px ${FONT}`;
  wrapText(ctx, blessingLine, VIEW.width / 2, 318, 820, 20);
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText('Press Enter or R to play again', VIEW.width / 2, 356);
  const buttons = endButtonRects();
  drawButton(ctx, buttons.restart, 'PLAY AGAIN  [R]', hoveredRect(input, buttons.restart), PALETTE.player);
  drawButton(ctx, buttons.menu, 'TITLE SCREEN', hoveredRect(input, buttons.menu), PALETTE.dim);
}
