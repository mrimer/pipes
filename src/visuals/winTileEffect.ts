/**
 * Win-level cascading tile-glow effect.
 *
 * On level win a glowing blue square (the size of a board tile) is displayed
 * in the background of every tile connected to the source.  The effect pulses
 * once – alpha ramps up to a peak then fades out quickly.
 *
 * The sequence starts with the source tile and all tiles directly connected to
 * it (BFS layer 0 + 1 fire simultaneously at t=0).  Each subsequent BFS layer
 * starts {@link WIN_TILE_LAYER_DELAY_MS} milliseconds after the previous one,
 * creating a ripple that propagates outward until every connected tile has been
 * triggered.
 */

import { Board, posKey, NEIGHBOUR_DELTA } from '../board';
import { Direction } from '../types';
import { TILE_SIZE } from '../renderer';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Total duration in milliseconds for a single tile glow. */
export const WIN_TILE_GLOW_DURATION = 500;

/** Fraction of {@link WIN_TILE_GLOW_DURATION} spent ramping UP to peak alpha. */
const PEAK_FRAC = 0.35;

/** Delay in milliseconds between consecutive BFS layers. */
export const WIN_TILE_LAYER_DELAY_MS = 100;

/** Peak fill alpha of the glow square. */
const FILL_PEAK_ALPHA = 0.55;

/** Peak shadow-blur radius (canvas pixels) at the glow peak. */
const SHADOW_BLUR_PEAK = 18;

/** Glow / shadow color. */
const GLOW_COLOR = '#56c8e8';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single tile-glow effect instance. */
export interface WinTileGlow {
  row: number;
  col: number;
  /** `performance.now()` timestamp when the effect starts (may be in the future). */
  startTime: number;
}

// ── BFS layer computation ─────────────────────────────────────────────────────

/**
 * Build `WinTileGlow` entries for every tile connected to the source on
 * `board`, with start times spaced {@link WIN_TILE_LAYER_DELAY_MS} apart by
 * BFS layer.
 *
 * BFS depth 0 (source) and depth 1 (tiles immediately connected to the source)
 * both fire at `baseTime` (delay = 0).  Depth 2 fires at `baseTime + 100 ms`,
 * depth 3 at `baseTime + 200 ms`, and so on.
 *
 * @param board    The solved game board.
 * @param baseTime `performance.now()` of the win moment (the delay anchor).
 */
export function computeWinTileGlows(board: Board, baseTime: number): WinTileGlow[] {
  const filled = board.getFilledPositions();
  const glows: WinTileGlow[] = [];

  // BFS from source recording depth.
  const depths = new Map<string, number>();
  const sourceKey = posKey(board.source.row, board.source.col);
  depths.set(sourceKey, 0);
  const queue: Array<{ row: number; col: number; depth: number }> = [
    { row: board.source.row, col: board.source.col, depth: 0 },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const dir of Object.values(Direction)) {
      if (!board.areMutuallyConnected(cur, dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const next = { row: cur.row + delta.row, col: cur.col + delta.col };
      const key = posKey(next.row, next.col);
      if (depths.has(key)) continue;
      const nextDepth = cur.depth + 1;
      depths.set(key, nextDepth);
      queue.push({ row: next.row, col: next.col, depth: nextDepth });
    }
  }

  for (const key of filled) {
    const depth = depths.get(key) ?? 0;
    // depth 0 and 1 both fire at t=0; depth d >= 2 fires at (d-1)*delay.
    const delayMs = Math.max(0, depth - 1) * WIN_TILE_LAYER_DELAY_MS;
    const [row, col] = key.split(',').map(Number);
    glows.push({ row, col, startTime: baseTime + delayMs });
  }

  return glows;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Draw the current state of all active win tile glow effects onto `ctx`.
 * Glows not yet started or already expired are silently skipped.
 * Call this between pass-1 (backgrounds) and pass-2 (tile content) so the
 * glow appears behind tile items but above the board background.
 */
export function renderWinTileGlows(
  ctx: CanvasRenderingContext2D,
  glows: WinTileGlow[],
  now: number,
): void {
  if (glows.length === 0) return;

  ctx.save();
  for (const glow of glows) {
    const elapsed = now - glow.startTime;
    if (elapsed < 0 || elapsed >= WIN_TILE_GLOW_DURATION) continue;

    const progress = elapsed / WIN_TILE_GLOW_DURATION;
    // Alpha ramps from 0→1 over the first PEAK_FRAC, then 1→0 over the rest.
    const alpha = progress < PEAK_FRAC
      ? progress / PEAK_FRAC
      : 1 - (progress - PEAK_FRAC) / (1 - PEAK_FRAC);

    const x = glow.col * TILE_SIZE;
    const y = glow.row * TILE_SIZE;
    const fillAlpha = alpha * FILL_PEAK_ALPHA;

    ctx.shadowColor = GLOW_COLOR;
    ctx.shadowBlur = SHADOW_BLUR_PEAK * alpha;
    ctx.fillStyle = `rgba(86,200,232,${fillAlpha.toFixed(3)})`;
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }
  ctx.restore();
}
