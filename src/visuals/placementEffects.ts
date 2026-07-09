import { TILE_SIZE } from '../renderer';

/** Duration of the scale-pop on tile placement (ms). */
export const PLACE_EFFECT_DURATION = 120;
/** Duration of the shrink-fade overlay on tile removal (ms). */
export const REMOVE_EFFECT_DURATION = 150;

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

    const cx = (e.col + 0.5) * TILE_SIZE;
    const cy = (e.row + 0.5) * TILE_SIZE;

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
