/**
 * Spinning vortex particle effect rendered on top of sink tiles in-game.
 *
 * Particles orbit the sink centre, spiralling slowly inward, to give the
 * impression of water being drawn into the sink.  The color of each particle
 * matches the sink tile color so the effect blends naturally.
 */

import { TILE_SIZE, scalePx as _s } from '../renderer';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** A single particle in the vortex spiral around a sink tile. */
export interface VortexParticle {
  /** Initial orbital radius from the sink centre, in canvas pixels. */
  spawnRadius: number;
  /** Starting angle in radians (0 = right, increases clockwise). */
  startAngle: number;
  /** Angular velocity in radians per millisecond (clockwise). */
  angularSpeed: number;
  /** Rendered dot radius in canvas pixels. */
  dotSize: number;
  /** `performance.now()` timestamp when this particle was created. */
  startTime: number;
  /** Total lifetime in milliseconds. */
  duration: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** Maximum number of simultaneously active vortex particles. */
const VORTEX_MAX_PARTICLES = 18;

/**
 * Outer spawn radius as a fraction of the tile half-size.
 * Particles begin their orbit at approximately 80 % of the tile's half-size.
 */
const SPAWN_RADIUS_FRACTION = 0.8;

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to add one new vortex particle to the pool.
 * Does nothing when the pool is already at capacity.
 *
 * @param particles  Mutable array of active particles (modified in place).
 */
export function spawnVortexParticle(particles: VortexParticle[]): void {
  if (particles.length >= VORTEX_MAX_PARTICLES) return;

  const half = TILE_SIZE / 2;
  const spawnRadius = half * SPAWN_RADIUS_FRACTION * (0.7 + Math.random() * 0.3);
  const angularSpeed = 0.0012 + Math.random() * 0.0008; // rad/ms
  const duration     = 900 + Math.random() * 600;       // ms

  particles.push({
    spawnRadius,
    startAngle:   Math.random() * Math.PI * 2,
    angularSpeed,
    dotSize:      _s(2.5 + Math.random() * 2),
    startTime:    performance.now(),
    duration,
  });
}

/**
 * Advance and render all vortex particles for a single sink tile, then remove
 * expired ones.
 *
 * @param ctx       2D rendering context of the game canvas.
 * @param particles Mutable array of active vortex particles (modified in place).
 * @param sinkCx    Canvas X-coordinate of the sink tile centre.
 * @param sinkCy    Canvas Y-coordinate of the sink tile centre.
 * @param color     CSS colour string matching the current sink tile color.
 */
export function renderVortex(
  ctx: CanvasRenderingContext2D,
  particles: VortexParticle[],
  sinkCx: number,
  sinkCy: number,
  color: string,
): void {
  const now = performance.now();
  let i = 0;

  while (i < particles.length) {
    const p = particles[i];
    const elapsed = now - p.startTime;

    if (elapsed >= p.duration) {
      particles.splice(i, 1);
      continue;
    }

    const progress = elapsed / p.duration;

    // Spiral inward: radius shrinks linearly from spawnRadius to 0.
    const radius = p.spawnRadius * (1 - progress);

    // Angle advances monotonically (clockwise).
    const angle = p.startAngle + p.angularSpeed * elapsed;

    // Alpha: fade in during the first 20 % of lifetime, full opacity until
    // 70 %, then fade out so particles vanish smoothly at the centre.
    let alpha: number;
    if (progress < 0.2) {
      alpha = progress / 0.2;
    } else if (progress < 0.7) {
      alpha = 1;
    } else {
      alpha = (1 - progress) / 0.3;
    }

    const x = sinkCx + Math.cos(angle) * radius;
    const y = sinkCy + Math.sin(angle) * radius;

    ctx.save();
    ctx.globalAlpha = alpha * 0.75; // keep slightly translucent at full alpha
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, p.dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    i++;
  }
}
