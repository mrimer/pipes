/**
 * Visual effects for pipe rotation and pipe-fill animations.
 *
 * Rotation effect: smoothly rotates a pipe tile from its old orientation to its
 * new orientation over ROTATION_ANIM_DURATION ms.
 *
 * Fill effect: when newly-connected tiles are filled with water, animates the
 * blue water color filling each tile sequentially in BFS order starting from
 * the tile adjacent to the already-connected network.  Each tile takes
 * FILL_ANIM_DURATION ms to fill, with subsequent tiles starting after the
 * previous tile is complete.  One-way-blocked arms are not filled.
 */

import type { Direction} from '../types';
import { DIRECTIONS } from '../types';
import type { Board} from '../board';
import { NEIGHBOUR_DELTA, posKey, parseKey } from '../board';
import type { GridPos } from '../types';
import { oppositeDirection } from '../tile';
import { WATER_COLOR } from '../colors';
import { TILE_SIZE } from '../renderer';

/** Duration of the pipe-rotation animation in milliseconds. */
export const ROTATION_ANIM_DURATION = 300;

/** Duration of the pipe-fill animation per tile in milliseconds. */
export const FILL_ANIM_DURATION = 300;

/** One active pipe-rotation animation. */
export interface PipeRotationAnim {
  row: number;
  col: number;
  /** Old rotation in degrees (0 | 90 | 180 | 270). */
  oldRotation: number;
  /** New (final) rotation in degrees (0 | 90 | 180 | 270). */
  newRotation: number;
  /** `performance.now()` when the animation started. */
  startTime: number;
}

/** One active pipe-fill animation entry for a single tile. */
export interface PipeFillAnim {
  row: number;
  col: number;
  /** The direction from which water enters this tile (used for entry arm). */
  entryDir: Direction;
  /**
   * The one-way-blocked arm direction for this tile, if it sits on a one-way
   * cell (the arm whose water cannot flow through).  null otherwise.
   */
  blockedDir: Direction | null;
  /** `performance.now()` when this tile's fill animation should start. */
  startTime: number;
  /**
   * When true the animation only plays Phase 1 (entry arm fills to tile center)
   * and then persists indefinitely rather than expiring.  Used for the sink tile.
   */
  isSink?: boolean;
  /**
   * CSS color string to use for the animated water stroke.  Defaults to the
   * standard WATER_COLOR when not provided.  Set to the tile's filled-water
   * color so pre-placed (gold / fixed / leaky) pipes animate in their own hue.
   */
  waterColor?: string;
  /**
   * When true this entry is a container tile (Source or Chamber).  The tile is
   * included in the fill-exclude set so its display is held at its pre-connected
   * appearance until the animation reaches it, but no water overlay is drawn on
   * top of it (the container switches directly to its connected appearance once
   * the animation entry expires).
   */
  isContainer?: boolean;
}

/** One active pipe-drain animation entry for a single tile. */
export interface PipeDrainAnim {
  row: number;
  col: number;
  /**
   * The direction toward the disconnection origin — the water overlay shrinks from
   * this arm's edge first (Phase 1), then from center toward other arm tips (Phase 2).
   */
  exitDir: Direction;
  /** `performance.now()` when this tile's drain animation should start. */
  startTime: number;
  /**
   * CSS water color for this tile's overlay strokes.
   * Undefined for container tiles (no overlay drawn; they switch appearance on expiry).
   */
  waterColor?: string;
  /**
   * Directions where the adjacent tile has a reciprocal arm (mutual connection).
   * The drain overlay uses `lineCap='butt'` for these directions so no round-cap nub
   * extends past the tile edge — matching non-animated tile rendering behavior.
   * Directions absent from this set get `lineCap='round'` (dead-end nub stays visible).
   */
  mutualDirs?: Set<Direction>;
  /**
   * When true the tile stays in drainInclude until expiry with no overlay drawn.
   * Used for container tiles (Source, Sink, Chamber) — they switch directly from their
   * connected appearance to their disconnected appearance, mirroring isContainer in fill.
   */
  isContainer?: boolean;
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

/** Return the canonical string key for a rotation animation. */
function rotationAnimKey(anim: PipeRotationAnim): string {
  return posKey(anim.row, anim.col);
}

/** Return the canonical string key for a fill animation. */
function fillAnimKey(anim: PipeFillAnim): string {
  return posKey(anim.row, anim.col);
}

// ─── State queries ────────────────────────────────────────────────────────────

/**
 * Build a map from posKey → interpolated rotation angle (degrees) for all
 * currently active rotation animations.  Expired animations are removed from
 * the array in-place.
 */
export function computeRotationOverrides(
  anims: PipeRotationAnim[],
  now: number,
): Map<string, number> {
  const overrides = new Map<string, number>();
  let i = 0;
  while (i < anims.length) {
    const anim = anims[i];
    const elapsed = now - anim.startTime;
    if (elapsed >= ROTATION_ANIM_DURATION) {
      anims.splice(i, 1); // expired – remove
      continue;
    }
    const t = elapsed / ROTATION_ANIM_DURATION;
    // Ease-in-out cubic (Robert Penner): accelerates until midpoint, decelerates after.
    // f(t) = 4t³            for t < 0.5
    // f(t) = 1 − (−2t+2)³/2 for t ≥ 0.5
    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // Animate along the shortest arc so CCW input (3 steps = 270° CW) rotates CCW
    // rather than sweeping 270° the long way around.
    // Normalize delta to (-180, 180]: positive = CW, negative = CCW.
    let delta = anim.newRotation - anim.oldRotation;
    if (delta > 180) delta -= 360;
    else if (delta < -180) delta += 360;
    const angle = anim.oldRotation + delta * eased;
    overrides.set(rotationAnimKey(anim), angle);
    i++;
  }
  return overrides;
}

/**
 * Return the set of posKeys for tiles that currently have an active (not yet
 * started or still running) fill animation.  Tiles in this set should be
 * rendered as DRY (unfilled) in the base board render so the fill overlay
 * can draw partial water on top.
 *
 * Also removes fully expired fill animations from the array in-place.
 */
export function computeActiveFillKeys(
  anims: PipeFillAnim[],
  now: number,
): Set<string> {
  const keys = new Set<string>();
  let i = 0;
  while (i < anims.length) {
    const anim = anims[i];
    if (!anim.isSink && now >= anim.startTime + FILL_ANIM_DURATION) {
      anims.splice(i, 1); // expired – remove
      continue;
    }
    // Not expired yet (or sink – persists forever) – add to active set
    keys.add(fillAnimKey(anim));
    i++;
  }
  return keys;
}

// ─── BFS fill-order computation ───────────────────────────────────────────────

/**
 * Compute the ordered list of tiles that are newly connected to the water
 * source (i.e. present in the current filled set but absent in `filledBefore`).
 *
 * The returned entries are in BFS order starting from the source, with each
 * entry recording the direction from which water enters that tile, the
 * one-way-blocked arm direction (null if none), and the animation depth.
 *
 * `depth` counts only newly-filled tile hops from the boundary of the
 * already-filled network: tiles directly adjacent to any already-filled tile
 * get depth 0, the tiles they flow into get depth 1, and so on (depth n = n
 * hops from the already-filled boundary).  Tiles at the same depth (e.g. both
 * branches of a tee) animate concurrently.
 */
export function computeFillOrder(
  board: Board,
  filledBefore: Set<string>,
): Array<{ row: number; col: number; entryDir: Direction; blockedDir: Direction | null; depth: number }> {
  // Each queue entry carries animDepth:
  //  -1 = already-filled tile (traversed as a corridor but not animated)
  //   0 = first newly-filled tile adjacent to an already-filled tile
  //   n = n-th newly-filled hop from the already-filled boundary
  const queue: Array<{ row: number; col: number; animDepth: number }> = [];

  const result: Array<{ row: number; col: number; entryDir: Direction; blockedDir: Direction | null; depth: number }> = [];

  // Start BFS from source.  The source itself is always already-filled, so it
  // acts as the frontier entry point (animDepth = -1).
  const sourceKey = posKey(board.source.row, board.source.col);
  const bfsVisited = new Set<string>();
  bfsVisited.add(sourceKey);
  queue.push({ row: board.source.row, col: board.source.col, animDepth: -1 });
  let qi = 0;

  while (qi < queue.length) {
    const cur = queue[qi++];

    for (const dir of DIRECTIONS) {
      if (!board.areMutuallyConnected(cur, dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const next = { row: cur.row + delta.row, col: cur.col + delta.col };
      const nextKey = posKey(next.row, next.col);
      if (bfsVisited.has(nextKey)) continue;

      // Valve check: only enter a Chamber tile via one of its first-connection
      // directions (matches the guard in Board.getFilledPositions).
      // Must be done BEFORE marking visited so a chamber first reached via an
      // invalid direction can still be entered later via a valid direction.
      const nextTile = board.grid[next.row]?.[next.col];
      if (nextTile?.firstConnections && nextTile.firstConnections.size > 0) {
        const arrivalDir = oppositeDirection(dir);
        if (!nextTile.firstConnections.has(arrivalDir)) continue;
      }
      bfsVisited.add(nextKey);

      const nextIsNew = !filledBefore.has(nextKey);
      // animDepth for the next tile:
      //  already-filled tile       → -1 (continues traversal without incrementing)
      //  newly-filled from already → 0  (first animation step)
      //  newly-filled from newly   → cur.animDepth + 1
      const nextAnimDepth = !nextIsNew ? -1 : cur.animDepth < 0 ? 0 : cur.animDepth + 1;

      queue.push({ row: next.row, col: next.col, animDepth: nextAnimDepth });

      // Only record if this tile is NEWLY filled (not already filled before the move).
      if (nextIsNew) {
        // entryDir = direction FROM WHICH water enters next tile = opposite of travel dir.
        const entryDir = oppositeDirection(dir);

        // Determine if the tile sits on a one-way cell that blocks an arm.
        let blockedDir: Direction | null = null;
        const owDir = board.oneWayData.get(nextKey);
        if (owDir !== undefined) {
          // The arm pointing OPPOSITE to the one-way direction is blocked.
          blockedDir = oppositeDirection(owDir);
        }

        result.push({ row: next.row, col: next.col, entryDir, blockedDir, depth: nextAnimDepth });
      }
    }
  }

  return result;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Render fill-animation overlays for all active fill animations onto `ctx`.
 * Each tile draws the water portion of its arms over the already-rendered dry tile.
 *
 * @param ctx    - The 2D rendering context.
 * @param anims  - The live fill animation array.
 * @param tileConnectionsMap - Map from posKey → Set of open connection directions for that tile.
 * @param lineWidth - The pipe stroke width in pixels.
 * @param now    - Current `performance.now()` timestamp.
 */
export function renderFillAnims(
  ctx: CanvasRenderingContext2D,
  anims: PipeFillAnim[],
  tileConnectionsMap: Map<string, Set<Direction>>,
  lineWidth: number,
  now: number,
): void {
  for (const anim of anims) {
    // Container tiles have no water overlay — they switch directly to their
    // connected appearance once the animation entry expires.
    if (anim.isContainer) continue;
    const elapsed = now - anim.startTime;
    if (elapsed < 0) continue; // not started yet
    // Sink tile: only Phase 1 (entry arm fills to center); clamp at 0.5 so it
    // persists at the center indefinitely once Phase 1 completes.
    const rawProgress = elapsed / FILL_ANIM_DURATION;
    const progress = anim.isSink ? Math.min(0.5, rawProgress) : Math.min(1, rawProgress);
    const connections = tileConnectionsMap.get(fillAnimKey(anim));
    if (!connections) continue;
    _drawFillOverlay(ctx, anim, connections, lineWidth, progress, anim.waterColor ?? WATER_COLOR);
  }
}

/** Draw water-fill progress for a single tile. */
function _drawFillOverlay(
  ctx: CanvasRenderingContext2D,
  anim: PipeFillAnim,
  connections: Set<Direction>,
  lineWidth: number,
  progress: number,
  color: string,
): void {
  const cx = anim.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = anim.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  // Phase 1 (0 → 0.5): entry arm fills from its edge toward the tile center.
  const entryP = Math.min(1, progress * 2);
  // Phase 2 (0.5 → 1): all other arms fill from the center outward.
  const otherP = Math.max(0, (progress - 0.5) * 2);

  ctx.save();
  // Clip to this tile's bounds so that the rounded line-cap nubs on Phase 2
  // arms never extend into adjacent tiles and paint over content there.
  ctx.beginPath();
  ctx.rect(anim.col * TILE_SIZE, anim.row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Entry arm: fill from the outer edge inward toward the center.
  if (connections.has(anim.entryDir) && entryP > 0) {
    const dx = NEIGHBOUR_DELTA[anim.entryDir].col;
    const dy = NEIGHBOUR_DELTA[anim.entryDir].row;
    // At entryP=0: water tip is at the edge (cx + dx*half, cy + dy*half).
    // At entryP=1: water tip reaches the center (cx, cy).
    const startX = cx + dx * half;
    const startY = cy + dy * half;
    const endX = cx + dx * half * (1 - entryP);
    const endY = cy + dy * half * (1 - entryP);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Other arms: fill from the center outward (skip entry arm and blocked arm).
  if (otherP > 0) {
    for (const dir of connections) {
      if (dir === anim.entryDir) continue;
      if (anim.blockedDir !== null && dir === anim.blockedDir) continue;
      const dx = NEIGHBOUR_DELTA[dir].col;
      const dy = NEIGHBOUR_DELTA[dir].row;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * half * otherP, cy + dy * half * otherP);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ─── BFS drain-order computation ─────────────────────────────────────────────

/**
 * Compute the ordered list of tiles that just became disconnected from the
 * water source (present in `filledBefore`, absent in the current filled set).
 *
 * BFS starts from disconnected tiles spatially adjacent to `origin` (the tile
 * that was placed, rotated, or reclaimed to cause the disconnection).  Each
 * entry records the `exitDir` — the direction pointing back toward the BFS
 * parent, i.e. the direction water exits the tile toward the disconnection
 * source — and the BFS `depth` used to stagger animation start times.
 */
export function computeDrainOrder(
  board: Board,
  filledBefore: Set<string>,
  origin?: GridPos,
): Array<{ row: number; col: number; exitDir: Direction; depth: number }> {
  const filledAfter = board.getFilledPositions();
  const disconnected = new Set<string>();
  for (const k of filledBefore) {
    if (!filledAfter.has(k)) disconnected.add(k);
  }
  if (disconnected.size === 0) return [];

  const result: Array<{ row: number; col: number; exitDir: Direction; depth: number }> = [];
  const visited = new Set<string>();
  const queue: Array<{ row: number; col: number; exitDir: Direction; depth: number }> = [];

  if (origin) {
    for (const dir of DIRECTIONS) {
      const delta = NEIGHBOUR_DELTA[dir];
      const nr = origin.row + delta.row;
      const nc = origin.col + delta.col;
      const nk = posKey(nr, nc);
      if (disconnected.has(nk) && !visited.has(nk)) {
        visited.add(nk);
        queue.push({ row: nr, col: nc, exitDir: oppositeDirection(dir), depth: 0 });
      }
    }
  }

  // Fallback: if no adjacent disconnected tiles found, start from any disconnected tile.
  if (queue.length === 0) {
    const firstKey = disconnected.values().next().value as string;
    const [fr, fc] = parseKey(firstKey);
    const fallbackTile = board.grid[fr]?.[fc];
    const fallbackExitDir: Direction = (fallbackTile?.connections.values().next().value as Direction | undefined) ?? DIRECTIONS[0];
    visited.add(firstKey);
    queue.push({ row: fr, col: fc, exitDir: fallbackExitDir, depth: 0 });
  }

  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    result.push(cur);
    for (const dir of DIRECTIONS) {
      if (!board.areMutuallyConnected(cur, dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const nr = cur.row + delta.row;
      const nc = cur.col + delta.col;
      const nk = posKey(nr, nc);
      if (!disconnected.has(nk) || visited.has(nk)) continue;
      visited.add(nk);
      queue.push({ row: nr, col: nc, exitDir: oppositeDirection(dir), depth: cur.depth + 1 });
    }
  }

  return result;
}

// ─── Drain rendering ──────────────────────────────────────────────────────────

/**
 * Render drain-animation overlays for all active drain animations onto `ctx`.
 *
 * Waiting tiles (not yet started) remain in `drainInclude` so the base board renders them
 * as water.  When a tile's animation starts it drops from `drainInclude` (base shows dry),
 * and this overlay draws the remaining water as water-colored strokes that shrink until gone.
 * Container tiles have no overlay — they switch appearance directly when removed from
 * drainInclude on expiry.
 *
 * Expired entries are removed from `anims` in-place.
 */
export function renderDrainAnims(
  ctx: CanvasRenderingContext2D,
  anims: PipeDrainAnim[],
  tileConnectionsMap: Map<string, Set<Direction>>,
  lineWidth: number,
  now: number,
): void {
  for (let i = anims.length - 1; i >= 0; i--) {
    const anim = anims[i];
    const elapsed = now - anim.startTime;
    if (elapsed >= FILL_ANIM_DURATION) {
      anims.splice(i, 1);
      continue;
    }
    if (elapsed < 0 || anim.isContainer || !anim.waterColor) continue;
    const progress = elapsed / FILL_ANIM_DURATION;
    const connections = tileConnectionsMap.get(posKey(anim.row, anim.col));
    if (!connections) continue;
    _drawDrainOverlay(ctx, anim, connections, lineWidth, progress, anim.waterColor, anim.mutualDirs);
  }
}

/**
 * Draw the water-shrinking overlay for a single draining tile on top of the dry base.
 *
 * Phase 1 (progress 0→0.5): exit arm remaining water shrinks from exit edge toward center
 *   (exit edge disappears first, center is last).  Other arms are drawn at full length.
 * Phase 2 (progress 0.5→1): exit arm is gone; each other arm shrinks from center toward
 *   its tip (center disappears first, tip is last).
 *
 * At progress=0 the overlay draws the full water fill, providing a seamless handoff from
 * the drainInclude base-board render.
 */
function _drawDrainOverlay(
  ctx: CanvasRenderingContext2D,
  anim: PipeDrainAnim,
  connections: Set<Direction>,
  lineWidth: number,
  progress: number,
  waterColor: string,
  mutualDirs?: Set<Direction>,
): void {
  const cx = anim.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = anim.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  // Phase 1 (0→0.5): fraction of Phase 1 elapsed (0→1).
  const drainP = Math.min(1, progress * 2);
  // Phase 2 (0.5→1): fraction of Phase 2 elapsed (0→1).
  const drainP2 = Math.max(0, (progress - 0.5) * 2);

  ctx.save();
  ctx.strokeStyle = waterColor;
  ctx.lineWidth = lineWidth;

  // Phase 1: exit arm remaining water shrinks — exit edge retreats toward center.
  if (connections.has(anim.exitDir) && drainP < 1) {
    const dx = NEIGHBOUR_DELTA[anim.exitDir].col;
    const dy = NEIGHBOUR_DELTA[anim.exitDir].row;
    // Butt cap when adjacent tile has a reciprocal arm (no nub past tile edge).
    ctx.lineCap = mutualDirs?.has(anim.exitDir) ? 'butt' : 'round';
    ctx.beginPath();
    ctx.moveTo(cx + dx * half * (1 - drainP), cy + dy * half * (1 - drainP));
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }

  if (drainP2 === 0) {
    // Phase 1: other arms still fully water.
    for (const dir of connections) {
      if (dir === anim.exitDir) continue;
      const dx = NEIGHBOUR_DELTA[dir].col;
      const dy = NEIGHBOUR_DELTA[dir].row;
      ctx.lineCap = mutualDirs?.has(dir) ? 'butt' : 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * half, cy + dy * half);
      ctx.stroke();
    }
  } else {
    // Phase 2: each other arm shrinks — center end retreats toward tip, tip is last to drain.
    for (const dir of connections) {
      if (dir === anim.exitDir) continue;
      const dx = NEIGHBOUR_DELTA[dir].col;
      const dy = NEIGHBOUR_DELTA[dir].row;
      ctx.lineCap = mutualDirs?.has(dir) ? 'butt' : 'round';
      ctx.beginPath();
      ctx.moveTo(cx + dx * half * drainP2, cy + dy * half * drainP2);
      ctx.lineTo(cx + dx * half, cy + dy * half);
      ctx.stroke();
    }
  }

  ctx.restore();
}
