/**
 * Idle water-pulse animation.
 *
 * After a period of player inactivity the connected pipe network pulses with a
 * bright localized glow that sweeps from the source outward in BFS order.
 *
 * On each tile, rather than the whole tile shape pulsing at once, a localized
 * glow head moves along the pipe geometry:
 *   - Phase 1 (first half of tile duration): glow travels inward from the
 *     entry arm edge toward the tile center.
 *   - Phase 2 (second half): glow travels outward from the center along each
 *     exit (non-entry) arm simultaneously.
 *
 * For the source tile there is no entry arm; the glow starts at the center and
 * spreads outward along all connected arms over the full tile duration.
 */

import { Direction, DIRECTIONS } from '../types';
import type { Board} from '../board';
import { NEIGHBOUR_DELTA, posKey } from '../board';
import { oppositeDirection } from '../tile';
import { GOLD_PIPE_WATER_COLOR, WATER_COLOR } from '../colors';
import { GOLD_PIPE_SHAPES } from '../board';
import { TILE_SIZE, LINE_WIDTH } from '../renderer';

/** ms delay between consecutive BFS-depth layers in the pulse sweep. */
const PULSE_SPEED_PER_DEPTH = 150;

/** ms for the pulse glow to traverse a single tile (entry arm → center → exit arms). */
const PULSE_TILE_DURATION = 300;

/** Peak alpha for the glow core (inner radial gradient center). */
const PULSE_ALPHA = 0.8;

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
  /** BFS depth of this tile (0 = directly adjacent to source; -1 = source itself). */
  depth: number;
  /** Open connection directions for this tile at the time of pulse creation. */
  connections: Set<Direction>;
  /** Whether this tile is a gold pipe (uses gold overlay color). */
  isGold: boolean;
  /**
   * True for the source tile.  The source has no entry arm; the glow starts at
   * the tile center and spreads outward along all connected arms.
   */
  isSource?: boolean;
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
 * The source tile itself is included at depth -1 with {@link IdlePulseLayer.isSource}
 * set to `true`.  Directly adjacent connected tiles get depth 0, their neighbours
 * depth 1, and so on.
 */
export function computePulseLayers(board: Board): IdlePulseLayer[] {
  const result: IdlePulseLayer[] = [];

  // Collect the source tile's mutually-connected directions.
  const sourceConnections = new Set<Direction>();
  for (const dir of DIRECTIONS) {
    if (board.areMutuallyConnected(board.source, dir)) sourceConnections.add(dir);
  }

  if (sourceConnections.size > 0) {
    const sourceTile = board.getTile(board.source);
    const sourceIsGold = sourceTile !== null && GOLD_PIPE_SHAPES.has(sourceTile.shape);
    // entryDir is unused for isSource layers; Direction.North is a placeholder.
    result.push({
      row: board.source.row,
      col: board.source.col,
      entryDir: Direction.North,
      depth: -1,
      connections: sourceConnections,
      isGold: sourceIsGold,
      isSource: true,
    });
  }

  const sourceKey = posKey(board.source.row, board.source.col);
  const bfsVisited = new Set<string>();
  bfsVisited.add(sourceKey);

  // Queue entries: { row, col, depth } — depth -1 for the source itself.
  const queue: Array<{ row: number; col: number; depth: number }> = [];
  queue.push({ row: board.source.row, col: board.source.col, depth: -1 });
  let qi = 0;

  while (qi < queue.length) {
    const cur = queue[qi++];

    for (const dir of DIRECTIONS) {
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
      const rawConnections = tile ? new Set(tile.connections) : new Set<Direction>();

      // Respect the one-way floor constraint at this tile.  If the cell sits on a
      // one-way floor, water cannot exit in the direction opposite the arrow; remove
      // that direction from the connections so the phase-2 glow doesn't animate
      // outward against the arrow.  entryDir is always kept so that phase-1 can
      // still draw the inward arm (entering via entryDir is what the BFS confirmed
      // is valid, and the one-way only restricts exit, not this entry itself).
      const nextOwDir = board.getOneWayDirection(next);
      const blockedExit = nextOwDir !== null ? oppositeDirection(nextOwDir) : null;
      const connections = new Set<Direction>();
      for (const c of rawConnections) {
        if (c === blockedExit && c !== entryDir) continue;
        connections.add(c);
      }

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
 * reached yet or are still animating), `false` once the last tile has fully
 * faded out.
 *
 * Timing: the source tile (depth -1) starts at elapsed = 0.  Each subsequent
 * BFS depth starts PULSE_SPEED_PER_DEPTH ms later:
 *   tileStart = (depth + 1) * PULSE_SPEED_PER_DEPTH
 */
export function renderIdlePulse(
  ctx: CanvasRenderingContext2D,
  pulse: IdlePulse,
  now: number,
): boolean {
  const elapsed = now - pulse.startTime;
  // The pulse finishes when its leading edge has cleared the deepest tile.
  // Deepest tile (maxDepth) starts at (maxDepth + 1) * PULSE_SPEED_PER_DEPTH.
  const totalDuration = (pulse.maxDepth + 1) * PULSE_SPEED_PER_DEPTH + PULSE_TILE_DURATION;
  if (elapsed > totalDuration) return false;

  for (const layer of pulse.layers) {
    // Time within this tile's own animation window.
    // Source (depth -1): tileStart = 0.  Depth n: tileStart = (n+1) * PULSE_SPEED_PER_DEPTH.
    const tileStart = (layer.depth + 1) * PULSE_SPEED_PER_DEPTH;
    const tileElapsed = elapsed - tileStart;
    const tileProgress = tileElapsed / PULSE_TILE_DURATION;
    if (tileProgress <= 0 || tileProgress >= 1) continue; // not yet reached or already done

    // Alpha envelope: rises and falls across the tile duration so the glow
    // appears smoothly rather than popping on/off.
    const alpha = Math.sin(tileProgress * Math.PI) * PULSE_ALPHA;
    if (alpha <= 0) continue;

    // Phase 1 (entry arm, inward): covers tileProgress 0 → 0.5.
    const phase1P = Math.min(1, tileProgress * 2);
    // Phase 2 (exit arms, outward): covers tileProgress 0.5 → 1.
    const phase2P = Math.max(0, (tileProgress - 0.5) * 2);

    _drawLocalizedPulse(ctx, layer, alpha, phase1P, phase2P);
  }

  return true;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Per-context radial-gradient cache for `_drawGlowAt`.
 *
 * Gradients are keyed by "r,g,b" color string inside a per-context entry that
 * also records the LINE_WIDTH at which they were built.  When LINE_WIDTH changes
 * (i.e. on window resize) the entire entry is replaced so the radii stay
 * accurate; color-keyed gradients are then repopulated on demand.  Using the
 * context object as the outer key keeps gradient objects bound to the correct
 * rendering surface even if multiple canvases are in use.
 */
const _glowCacheByCtx = new Map<
  CanvasRenderingContext2D,
  { lineWidth: number; gradients: Map<string, { outer: CanvasGradient; inner: CanvasGradient }> }
>();

/**
 * Parse a `#rrggbb` hex string and return the blended-toward-white RGB
 * components as an `[r, g, b]` tuple (integers 0–255).
 */
function _brightRGB(baseHex: string): [number, number, number] {
  const hex = baseHex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return [
    Math.round(r + (255 - r) * 0.375),
    Math.round(g + (255 - g) * 0.375),
    Math.round(b + (255 - b) * 0.375),
  ];
}

/**
 * Draw the idle-pulse radial glow at canvas position `(x, y)`.
 *
 * Used to render win-level and chapter-complete flow pulses with the same
 * radial-glow visual as the in-game idle pulse.
 *
 * @param ctx          2D rendering context.
 * @param x            Canvas X coordinate of the glow centre.
 * @param y            Canvas Y coordinate of the glow centre.
 * @param baseColorHex Base pipe color as a `#rrggbb` hex string.
 *                     The color is brightened toward white before rendering.
 * @param alpha        Overall opacity in the range [0, 1].
 */
export function drawIdlePulseGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseColorHex: string,
  alpha: number,
): void {
  const [r, g, b] = _brightRGB(baseColorHex);
  _drawGlowAt(ctx, x, y, r, g, b, alpha);
}

/**
 * Draw a radial glow centered at `(hx, hy)`.
 *
 * Two concentric gradients are drawn: a bright, more opaque inner core and a
 * softer, larger outer halo.  Both fade to transparent at the edge, so the
 * glow blends naturally over any underlying pipe artwork.
 *
 * Gradients are cached per (context, color, LINE_WIDTH) to avoid recreating
 * them every frame.  They are built at the canvas origin and repositioned via
 * `ctx.translate` so the same objects can be reused regardless of position.
 * `ctx.globalAlpha` drives the per-call opacity, keeping the color-stop alphas
 * constant (outer halo center = 0.625, inner core center = 1.0) and avoiding
 * any per-frame string allocation.
 */
function _drawGlowAt(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
): void {
  const innerRadius = LINE_WIDTH * 0.625;
  const outerRadius = LINE_WIDTH * 1.0;

  // Retrieve or create the per-context cache entry, invalidating it whenever
  // LINE_WIDTH changes (i.e. on window resize) so radii stay accurate.
  let entry = _glowCacheByCtx.get(ctx);
  if (!entry || entry.lineWidth !== LINE_WIDTH) {
    entry = { lineWidth: LINE_WIDTH, gradients: new Map() };
    _glowCacheByCtx.set(ctx, entry);
  }

  // Retrieve or build gradients for this (r, g, b) color.  Gradients are
  // anchored at (0, 0) and moved to (hx, hy) via ctx.translate below.
  const colorKey = `${r},${g},${b}`;
  let grads = entry.gradients.get(colorKey);
  if (!grads) {
    const outer = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
    // Alpha in the stop is fixed at 0.625 (halo) / 1.0 (core); overall
    // brightness is controlled by ctx.globalAlpha at draw time.
    outer.addColorStop(0, `rgba(${r},${g},${b},0.625)`);
    outer.addColorStop(1, `rgba(${r},${g},${b},0)`);
    const inner = ctx.createRadialGradient(0, 0, 0, 0, 0, innerRadius);
    inner.addColorStop(0, `rgba(${r},${g},${b},1)`);
    inner.addColorStop(1, `rgba(${r},${g},${b},0)`);
    grads = { outer, inner };
    entry.gradients.set(colorKey, grads);
  }

  // Translate to the glow centre so the origin-anchored gradients appear at
  // (hx, hy).  ctx.globalAlpha drives per-call alpha without touching stops.
  ctx.save();
  ctx.translate(hx, hy);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = grads.outer;
  ctx.beginPath();
  ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = grads.inner;
  ctx.beginPath();
  ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw the localized moving glow for a single tile.
 *
 * For a normal tile, `phase1P` drives the glow head from the entry-arm edge
 * toward the center, and `phase2P` drives it from the center outward along
 * each exit arm.  For the source tile (`isSource === true`) only the phase-2
 * outward spread is used, covering the full tile duration.
 *
 * @param phase1P - Phase-1 progress (0 → 1, entry arm inward).
 * @param phase2P - Phase-2 progress (0 → 1, exit arms outward).
 */
function _drawLocalizedPulse(
  ctx: CanvasRenderingContext2D,
  layer: IdlePulseLayer,
  alpha: number,
  phase1P: number,
  phase2P: number,
): void {
  const cx = layer.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = layer.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  const baseColor = layer.isGold ? GOLD_PIPE_WATER_COLOR : WATER_COLOR;
  const [r, g, b] = _brightRGB(baseColor);

  ctx.save();
  // Clip to this tile so the glow doesn't bleed into neighbouring tiles.
  ctx.beginPath();
  ctx.rect(layer.col * TILE_SIZE, layer.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  ctx.clip();

  if (layer.isSource) {
    // Source tile: no entry arm, so the glow spreads from center outward along
    // every connected arm.  Both phases drive one continuous 0→1 sweep: phase 1
    // covers the inner half (0→0.5) and phase 2 the outer half (0.5→1.0).  The
    // two meet at 0.5 at the handoff, so the travel is seamless (no stutter).
    for (const dir of layer.connections) {
      const dx = NEIGHBOUR_DELTA[dir].col;
      const dy = NEIGHBOUR_DELTA[dir].row;
      const p = phase1P < 1 ? phase1P * 0.5 : 0.5 + phase2P * 0.5;
      _drawGlowAt(ctx, cx + dx * half * p, cy + dy * half * p, r, g, b, alpha);
    }
  } else {
    // Phase 1: glow head moves from entry-arm edge inward toward center.
    if (phase1P > 0 && layer.connections.has(layer.entryDir)) {
      const dx = NEIGHBOUR_DELTA[layer.entryDir].col;
      const dy = NEIGHBOUR_DELTA[layer.entryDir].row;
      // At phase1P=0 head is at the arm edge; at phase1P=1 it is at the center.
      const hx = cx + dx * half * (1 - phase1P);
      const hy = cy + dy * half * (1 - phase1P);
      _drawGlowAt(ctx, hx, hy, r, g, b, alpha);
    }

    // Phase 2: glow heads move from center outward along each exit arm.
    if (phase2P > 0) {
      for (const dir of layer.connections) {
        if (dir === layer.entryDir) continue;
        const dx = NEIGHBOUR_DELTA[dir].col;
        const dy = NEIGHBOUR_DELTA[dir].row;
        _drawGlowAt(ctx, cx + dx * half * phase2P, cy + dy * half * phase2P, r, g, b, alpha);
      }
    }
  }

  ctx.restore();
}
