/**
 * Win-level cascading tile-glow effect.
 *
 * On level win a glowing blue square (the size of a board tile) is displayed
 * in the background of every tile connected to the source.  The effect pulses
 * once – alpha ramps up to a peak then fades out quickly.
 *
 * The sequence starts with the source tile and all tiles directly connected to
 * it (BFS depth 0 = source, BFS depth 1 = immediate neighbours, both fire
 * simultaneously at t=0).  Each subsequent BFS depth fires
 * {@link WIN_TILE_LAYER_DELAY_MS} milliseconds after the previous one,
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

/** Delay in milliseconds between consecutive BFS layers on the level screen. */
export const WIN_TILE_LAYER_DELAY_MS = 100;

/**
 * Delay in milliseconds between consecutive BFS layers on the chapter map screen.
 * Slower than the level-screen rate so each new wave of tiles fires once per second.
 */
export const CHAPTER_MAP_WIN_LAYER_DELAY_MS = 1000;

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
 * BFS from `sourceKey`, recording the minimum graph distance (depth) from the
 * source to every reachable node.
 *
 * @param sourceKey         The `"row,col"` key of the BFS start node.
 * @param sourceRow         Row index of the start node.
 * @param sourceCol         Column index of the start node.
 * @param getNeighborKeys   Given a `(row, col)`, returns the `{ row, col, key }`
 *                          entries for all nodes directly reachable from that cell.
 * @returns A map from `"row,col"` key → BFS depth.
 */
function _bfsDepths(
  sourceKey: string,
  sourceRow: number,
  sourceCol: number,
  getNeighborKeys: (row: number, col: number) => Array<{ row: number; col: number; key: string }>,
): Map<string, number> {
  const depths = new Map<string, number>();
  depths.set(sourceKey, 0);
  const queue: Array<{ row: number; col: number; depth: number }> = [
    { row: sourceRow, col: sourceCol, depth: 0 },
  ];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const { row, col, key } of getNeighborKeys(cur.row, cur.col)) {
      if (depths.has(key)) continue;
      depths.set(key, cur.depth + 1);
      queue.push({ row, col, depth: cur.depth + 1 });
    }
  }
  return depths;
}

/**
 * Convert a BFS depth-map to `WinTileGlow` entries for every key in
 * `filledKeys`.
 *
 * Depth 0 and 1 both fire at `baseTime` (no delay); depth d ≥ 2 fires at
 * `baseTime + (d − 1) * layerDelayMs`.
 */
function _buildGlowsFromDepths(
  filledKeys: Iterable<string>,
  depths: Map<string, number>,
  baseTime: number,
  layerDelayMs: number,
): WinTileGlow[] {
  const glows: WinTileGlow[] = [];
  for (const key of filledKeys) {
    const depth = depths.get(key) ?? 0;
    const delayMs = Math.max(0, depth - 1) * layerDelayMs;
    const [row, col] = key.split(',').map(Number);
    glows.push({ row, col, startTime: baseTime + delayMs });
  }
  return glows;
}

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
  const sourceKey = posKey(board.source.row, board.source.col);

  const depths = _bfsDepths(
    sourceKey,
    board.source.row,
    board.source.col,
    (row, col) => {
      const neighbors: Array<{ row: number; col: number; key: string }> = [];
      for (const dir of Object.values(Direction)) {
        if (!board.areMutuallyConnected({ row, col }, dir)) continue;
        const delta = NEIGHBOUR_DELTA[dir];
        const nr = row + delta.row;
        const nc = col + delta.col;
        neighbors.push({ row: nr, col: nc, key: posKey(nr, nc) });
      }
      return neighbors;
    },
  );

  return _buildGlowsFromDepths(filled, depths, baseTime, WIN_TILE_LAYER_DELAY_MS);
}

/**
 * Build `WinTileGlow` entries for all water-filled cells on the chapter map,
 * with start times spaced {@link CHAPTER_MAP_WIN_LAYER_DELAY_MS} apart by BFS layer.
 *
 * Uses the same depth-stagger rules as {@link computeWinTileGlows}: BFS depth 0
 * (source) and depth 1 fire at `baseTime`; depth d ≥ 2 fires at
 * `baseTime + (d − 1) * CHAPTER_MAP_WIN_LAYER_DELAY_MS`.
 *
 * @param filledKeys  Set of `"row,col"` strings for water-reachable cells.
 * @param sourceRow   Row index of the source tile.
 * @param sourceCol   Column index of the source tile.
 * @param baseTime    `performance.now()` timestamp of the animation start.
 */
export function computeChapterMapWinGlows(
  filledKeys: Set<string>,
  sourceRow: number,
  sourceCol: number,
  baseTime: number,
): WinTileGlow[] {
  const srcKey = `${sourceRow},${sourceCol}`;
  if (!filledKeys.has(srcKey)) return [];

  const DIRS: Array<{ dr: number; dc: number }> = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ];

  const depths = _bfsDepths(
    srcKey,
    sourceRow,
    sourceCol,
    (row, col) => {
      const neighbors: Array<{ row: number; col: number; key: string }> = [];
      for (const { dr, dc } of DIRS) {
        const nr = row + dr;
        const nc = col + dc;
        const key = `${nr},${nc}`;
        if (filledKeys.has(key)) neighbors.push({ row: nr, col: nc, key });
      }
      return neighbors;
    },
  );

  return _buildGlowsFromDepths(filledKeys, depths, baseTime, CHAPTER_MAP_WIN_LAYER_DELAY_MS);
}

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
