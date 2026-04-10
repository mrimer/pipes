/**
 * Idle water-pulse animation.
 *
 * After a period of player inactivity the connected pipe network pulses with a
 * bright overlay that sweeps from the source outward in BFS order.  The pulse
 * uses the same two-phase geometry as the fill animations in pipeEffects.ts
 * but draws a white (or gold) overlay whose alpha ramps up then back down as
 * the wavefront passes through each tile.
 */

import { Direction } from '../types';
import { Board, NEIGHBOUR_DELTA, posKey } from '../board';
import { oppositeDirection } from '../tile';
import { GOLD_PIPE_WATER_COLOR, WATER_COLOR } from '../colors';
import { GOLD_PIPE_SHAPES } from '../board';
import { TILE_SIZE, LINE_WIDTH } from '../renderer';

/** ms delay between consecutive BFS-depth layers in the pulse sweep. */
const PULSE_SPEED_PER_DEPTH = 150;

/** ms for the pulse overlay to traverse a single tile (fade-in + fade-out). */
const PULSE_TILE_DURATION = 200;

/** Alpha peak for the white overlay on regular (non-gold) pipe tiles. */
const PULSE_ALPHA = 0.3;

/**
 * One tile entry in the idle-pulse sweep, analogous to {@link PipeFillAnim}
 * but carrying all the data needed for the pulse overlay rather than the fill
 * animation.
 */
export interface IdlePulseLayer {
  row: number;
  col: number;
  /** The direction from which the pulse enters this tile. */
  entryDir: Direction;
  /** BFS depth of this tile (0 = directly adjacent to source). */
  depth: number;
  /** Open connection directions for this tile at the time of pulse creation. */
  connections: Set<Direction>;
  /** Whether this tile is a gold pipe (uses gold overlay color). */
  isGold: boolean;
}

/**
 * A single active idle-pulse sweep through the connected network.
 */
export interface IdlePulse {
  layers: IdlePulseLayer[];
  maxDepth: number;
  /** `performance.now()` when the pulse was started. */
  startTime: number;
}

// ─── BFS layer computation ────────────────────────────────────────────────────

/**
 * Run a BFS from the source tile across the currently-connected network and
 * return the ordered list of pulse layers.
 *
 * Only tiles that are connected to the source (i.e. reachable via
 * {@link Board.areMutuallyConnected}) are included.  The source tile itself is
 * the BFS root (depth -1 internally) and is not included in the output;
 * directly adjacent connected tiles get depth 0.
 */
export function computePulseLayers(board: Board): IdlePulseLayer[] {
  const result: IdlePulseLayer[] = [];

  const sourceKey = posKey(board.source.row, board.source.col);
  const bfsVisited = new Set<string>();
  bfsVisited.add(sourceKey);

  // Queue entries: { row, col, depth } — depth -1 for the source itself.
  const queue: Array<{ row: number; col: number; depth: number }> = [];
  queue.push({ row: board.source.row, col: board.source.col, depth: -1 });

  while (queue.length > 0) {
    const cur = queue.shift()!;

    for (const dir of Object.values(Direction)) {
      if (!board.areMutuallyConnected(cur, dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const next = { row: cur.row + delta.row, col: cur.col + delta.col };
      const nextKey = posKey(next.row, next.col);
      if (bfsVisited.has(nextKey)) continue;
      bfsVisited.add(nextKey);

      const nextDepth = cur.depth < 0 ? 0 : cur.depth + 1;
      queue.push({ row: next.row, col: next.col, depth: nextDepth });

      // entryDir = direction FROM which the pulse enters the next tile.
      const entryDir = oppositeDirection(dir);
      const tile = board.getTile(next);
      const connections = tile ? new Set(tile.connections) : new Set<Direction>();
      const isGold = tile !== null && GOLD_PIPE_SHAPES.has(tile.shape);

      result.push({ row: next.row, col: next.col, entryDir, depth: nextDepth, connections, isGold });
    }
  }

  return result;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

/**
 * Render a single frame of the idle-pulse sweep onto `ctx`.
 *
 * Returns `true` while the pulse is still active (some tiles haven't been
 * reached yet or are still fading), `false` once the last tile has fully
 * faded out.
 */
export function renderIdlePulse(
  ctx: CanvasRenderingContext2D,
  pulse: IdlePulse,
  now: number,
): boolean {
  const elapsed = now - pulse.startTime;
  // The pulse finishes when its leading edge has cleared the deepest tile.
  const totalDuration = pulse.maxDepth * PULSE_SPEED_PER_DEPTH + PULSE_TILE_DURATION;
  if (elapsed > totalDuration) return false;

  for (const layer of pulse.layers) {
    // Time within this tile's own fade window.
    const tileElapsed = elapsed - layer.depth * PULSE_SPEED_PER_DEPTH;
    const tileProgress = tileElapsed / PULSE_TILE_DURATION;
    if (tileProgress <= 0 || tileProgress >= 1) continue; // not yet reached or already faded

    // Alpha follows a half-sine curve: 0 → peak → 0 over the tile duration.
    const alpha = Math.sin(tileProgress * Math.PI) * PULSE_ALPHA;
    if (alpha <= 0) continue;

    // Derive the overlay color from the base water color for this tile type.
    const baseColor = layer.isGold ? GOLD_PIPE_WATER_COLOR : WATER_COLOR;
    const overlayColor = _pulseColor(baseColor, alpha);

    _drawPulseOverlay(ctx, layer, overlayColor);
  }

  return true;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Convert a hex or `#rrggbb` color string into an rgba string with the given
 * alpha, making the pulse brighter than the base water color by blending
 * toward white.
 */
function _pulseColor(baseHex: string, alpha: number): string {
  // Parse the hex color.
  const hex = baseHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Blend each channel toward 255 (white) proportionally to the alpha so the
  // overlay appears brighter/lighter than the underlying pipe color.
  const br = Math.round(r + (255 - r) * 0.6);
  const bg = Math.round(g + (255 - g) * 0.6);
  const bb = Math.round(b + (255 - b) * 0.6);
  return `rgba(${br},${bg},${bb},${alpha.toFixed(3)})`;
}

/**
 * Draw the full pipe-arm geometry of a single tile at the given overlay color.
 * All connected arms are drawn fully extended (not animated to grow/shrink);
 * the alpha on the color itself drives the fade effect.
 */
function _drawPulseOverlay(
  ctx: CanvasRenderingContext2D,
  layer: IdlePulseLayer,
  color: string,
): void {
  const cx = layer.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = layer.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layer.col * TILE_SIZE, layer.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';

  for (const dir of layer.connections) {
    const dx = NEIGHBOUR_DELTA[dir].col;
    const dy = NEIGHBOUR_DELTA[dir].row;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * half, cy + dy * half);
    ctx.stroke();
  }

  ctx.restore();
}
