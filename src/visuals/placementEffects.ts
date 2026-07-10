import { TILE_SIZE } from '../renderer';

/** Duration of the scale-pop on tile placement (ms). */
export const PLACE_EFFECT_DURATION = 120;
/** Duration of the shrink-fade overlay on tile removal (ms). */
export const REMOVE_EFFECT_DURATION = 150;
/** Duration of the horizontal shake on invalid placement (ms). */
export const SHAKE_DURATION = 200;
/** Duration of the undo/redo tile flash overlay (ms). */
export const UNDO_FLASH_DURATION = 250;
/** Duration of the sink gulp inward-particle burst on win (ms). */
export const SINK_GULP_DURATION = 450;
/** Duration of the gold-pipe shimmer sweep on placement (ms). */
export const GOLD_SHIMMER_DURATION = 220;
/** Duration of the cement hardening crack + dust effect (ms). */
export const CEMENT_HARDEN_DURATION = 1300;

const DUST_DURATION = 320;
const DUST_COUNT = 6;
const DUST_COLOR = '#b8c8d0';

interface DustParticle {
  startX: number;
  startY: number;
  vx: number;
  vy: number;
}

export interface PlacementEffect {
  row: number;
  col: number;
  startTime: number;
  dust: readonly DustParticle[];
}

export interface RemovalEffect {
  row: number;
  col: number;
  startTime: number;
}

export interface ShakeEffect {
  row: number;
  col: number;
  startTime: number;
}

export interface UndoFlashEffect {
  row: number;
  col: number;
  startTime: number;
  type: 'add' | 'remove';
}

export interface SinkGulpEffect {
  row: number;
  col: number;
  startTime: number;
}

export interface GoldShimmerEffect {
  row: number;
  col: number;
  startTime: number;
}

interface CrackLine {
  angle: number;
  length: number;
}

export interface CementHardenEffect {
  row: number;
  col: number;
  startTime: number;
  cracks: readonly CrackLine[];
  dust: readonly DustParticle[];
}

function _makeDust(row: number, col: number): DustParticle[] {
  const cx = (col + 0.5) * TILE_SIZE;
  const cy = (row + 0.5) * TILE_SIZE;
  const half = TILE_SIZE * 0.35;
  const particles: DustParticle[] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const angle = (i / DUST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
    const speed = 1.2 + Math.random() * 2.0;
    particles.push({
      startX: cx + (Math.random() - 0.5) * half,
      startY: cy + (Math.random() - 0.5) * half,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  return particles;
}

/**
 * Returns the scale factor for a placement tile at the given elapsed time.
 * 0→70ms: ease-out spring from 0.6 to 1.1 (fast expand)
 * 70→120ms: ease-in settle from 1.1 to 1.0 (slight overshoot correction)
 */
export function computePlacementScale(elapsed: number): number {
  const t = Math.min(elapsed / PLACE_EFFECT_DURATION, 1);
  const PEAK_T = 7 / 12; // 70ms / 120ms
  if (t <= PEAK_T) {
    const p = t / PEAK_T;
    const eased = 1 - (1 - p) * (1 - p); // ease-out quadratic
    return 0.6 + eased * 0.5;
  } else {
    const p = (t - PEAK_T) / (1 - PEAK_T);
    const eased = p * p; // ease-in quadratic
    return 1.1 - eased * 0.1;
  }
}

export function createPlacementEffect(row: number, col: number, now: number): PlacementEffect {
  return { row, col, startTime: now, dust: _makeDust(row, col) };
}

export function createRemovalEffect(row: number, col: number, now: number): RemovalEffect {
  return { row, col, startTime: now };
}

export function createShakeEffect(row: number, col: number, now: number): ShakeEffect {
  return { row, col, startTime: now };
}

export function createUndoFlashEffect(row: number, col: number, type: 'add' | 'remove', now: number): UndoFlashEffect {
  return { row, col, startTime: now, type };
}

export function createSinkGulpEffect(row: number, col: number, now: number): SinkGulpEffect {
  return { row, col, startTime: now };
}

export function createGoldShimmerEffect(row: number, col: number, now: number): GoldShimmerEffect {
  return { row, col, startTime: now };
}

const CEMENT_CRACK_COUNT = 5;
const CEMENT_CRACK_COLOR = '#7a8888';
const CEMENT_DUST_COLOR = '#9aadad';

export function createCementHardenEffect(row: number, col: number, now: number): CementHardenEffect {
  const cracks: CrackLine[] = [];
  for (let i = 0; i < CEMENT_CRACK_COUNT; i++) {
    const angle = (i / CEMENT_CRACK_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const length = TILE_SIZE * (0.38 + Math.random() * 0.12);
    cracks.push({ angle, length });
  }
  return { row, col, startTime: now, cracks, dust: _makeDust(row, col) };
}

/** Returns the horizontal pixel offset for a shake effect at the given elapsed time (2 full oscillations, damped). */
export function computeShakeOffset(elapsed: number): number {
  const t = Math.min(elapsed / SHAKE_DURATION, 1);
  return 3 * Math.sin(4 * Math.PI * t) * (1 - t);
}

export function renderUndoFlashEffects(
  ctx: CanvasRenderingContext2D,
  effects: UndoFlashEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= UNDO_FLASH_DURATION) {
      effects.splice(i, 1);
      continue;
    }
    const t = elapsed / UNDO_FLASH_DURATION;
    // Quick rise to peak alpha at t=0.2, then fade out
    const alpha = t < 0.2 ? (t / 0.2) * 0.45 : 0.45 * (1 - (t - 0.2) / 0.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = e.type === 'add' ? '#64b4ff' : '#ffa550';
    ctx.fillRect(e.col * TILE_SIZE, e.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.restore();
  }
}

export function renderPlacementEffects(
  ctx: CanvasRenderingContext2D,
  effects: PlacementEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= Math.max(PLACE_EFFECT_DURATION, DUST_DURATION)) {
      effects.splice(i, 1);
      continue;
    }

    // Dust particles scatter outward with gentle downward gravity.
    if (elapsed < DUST_DURATION) {
      const tDust = elapsed / DUST_DURATION;
      const frames = elapsed / 16; // nominal 60fps frames elapsed
      ctx.save();
      ctx.fillStyle = DUST_COLOR;
      for (const p of e.dust) {
        const px = p.startX + p.vx * frames;
        const py = p.startY + p.vy * frames + 0.04 * frames * frames;
        ctx.globalAlpha = 0.75 * (1 - tDust);
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function renderRemovalEffects(
  ctx: CanvasRenderingContext2D,
  effects: RemovalEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= REMOVE_EFFECT_DURATION) {
      effects.splice(i, 1);
      continue;
    }
    const t = elapsed / REMOVE_EFFECT_DURATION;
    const cx = (e.col + 0.5) * TILE_SIZE;
    const cy = (e.row + 0.5) * TILE_SIZE;
    // Light overlay that starts at full tile size and collapses to 20% while fading.
    const scale = 1.0 - t * 0.8;
    const alpha = 0.55 * (1 - t);
    const size = TILE_SIZE * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#c0d0dc';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.restore();
  }
}

const GULP_PARTICLE_COUNT = 14;
const GULP_COLOR = '#5ab4e8';

export function renderSinkGulpEffects(
  ctx: CanvasRenderingContext2D,
  effects: SinkGulpEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= SINK_GULP_DURATION) {
      effects.splice(i, 1);
      continue;
    }
    const t = elapsed / SINK_GULP_DURATION;
    const cx = (e.col + 0.5) * TILE_SIZE;
    const cy = (e.row + 0.5) * TILE_SIZE;
    const ringRadius = TILE_SIZE * 0.42;
    // Quick fade-in (0→0.15), hold, fade out in the last 30%.
    const alpha = t < 0.15 ? t / 0.15 : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    ctx.save();
    ctx.fillStyle = GULP_COLOR;
    for (let p = 0; p < GULP_PARTICLE_COUNT; p++) {
      const baseAngle = (p / GULP_PARTICLE_COUNT) * Math.PI * 2;
      // Slight counter-clockwise spiral as particles converge inward.
      const angle = baseAngle - t * Math.PI * 0.45;
      const radius = ringRadius * (1 - t);
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      const particleR = Math.max(0.5, 3.5 * (1 - t * 0.65));
      ctx.globalAlpha = alpha * 0.88;
      ctx.beginPath();
      ctx.arc(px, py, particleR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export function renderCementHardenEffects(
  ctx: CanvasRenderingContext2D,
  effects: CementHardenEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= CEMENT_HARDEN_DURATION) {
      effects.splice(i, 1);
      continue;
    }
    const t = elapsed / CEMENT_HARDEN_DURATION;
    const cx = (e.col + 0.5) * TILE_SIZE;
    const cy = (e.row + 0.5) * TILE_SIZE;

    // Cracks grow to full length over first 15%, hold until 23%, then fade over 1 second.
    const growFrac = Math.min(t / 0.15, 1.0);
    const alpha = t < 0.23 ? 1.0 : 1.0 - (t - 0.23) / 0.77;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';

    // Draw dark outline pass first (wider), then colored stroke on top.
    ctx.strokeStyle = '#1a2020';
    ctx.lineWidth = 5.5;
    for (const crack of e.cracks) {
      const len = crack.length * growFrac;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + len * Math.cos(crack.angle), cy + len * Math.sin(crack.angle));
      ctx.stroke();
    }
    ctx.strokeStyle = CEMENT_CRACK_COLOR;
    ctx.lineWidth = 3;
    for (const crack of e.cracks) {
      const len = crack.length * growFrac;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + len * Math.cos(crack.angle), cy + len * Math.sin(crack.angle));
      ctx.stroke();
    }
    ctx.restore();

    // Dust puff in stone gray.
    if (elapsed < DUST_DURATION) {
      const tDust = elapsed / DUST_DURATION;
      const frames = elapsed / 16;
      ctx.save();
      ctx.fillStyle = CEMENT_DUST_COLOR;
      for (const p of e.dust) {
        const px = p.startX + p.vx * frames;
        const py = p.startY + p.vy * frames + 0.04 * frames * frames;
        ctx.globalAlpha = 0.65 * (1 - tDust);
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

export function renderGoldShimmerEffects(
  ctx: CanvasRenderingContext2D,
  effects: GoldShimmerEffect[],
  now: number,
): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    const elapsed = now - e.startTime;
    if (elapsed >= GOLD_SHIMMER_DURATION) {
      effects.splice(i, 1);
      continue;
    }
    const t = elapsed / GOLD_SHIMMER_DURATION;
    const x = e.col * TILE_SIZE;
    const y = e.row * TILE_SIZE;

    // A bright stripe sweeps left-to-right across the tile, clipped to the tile bounds.
    const sweepX = x + (t * 1.5 - 0.25) * TILE_SIZE;
    const shimmerHalfW = TILE_SIZE * 0.32;
    const alpha = Math.sin(t * Math.PI) * 0.7;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.clip();

    const grad = ctx.createLinearGradient(sweepX - shimmerHalfW, y, sweepX + shimmerHalfW, y);
    grad.addColorStop(0, 'rgba(255, 242, 80, 0)');
    grad.addColorStop(0.5, `rgba(255, 242, 80, ${alpha})`);
    grad.addColorStop(1, 'rgba(255, 242, 80, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    ctx.restore();
  }
}
