/**
 * Visual effects for pipe rotation and pipe-fill animations.
 *
 * Rotation effect: smoothly rotates a pipe tile from its old orientation to its
 * new orientation over ROTATION_ANIM_DURATION ms.
 *
 * Fill effect: when newly-connected tiles are filled with water, animates the
 * blue water colour filling each tile sequentially in BFS order starting from
 * the tile adjacent to the already-connected network.  Each tile takes
 * FILL_ANIM_DURATION ms to fill, with subsequent tiles starting after the
 * previous tile is complete.  One-way-blocked arms are not filled.
 */

import { Direction } from '../types';
import { Board, NEIGHBOUR_DELTA, posKey } from '../board';
import { oppositeDirection } from '../tile';
import { WATER_COLOR } from '../colors';
import { TILE_SIZE } from '../renderer';

/** Duration of the pipe-rotation animation in milliseconds. */
export const ROTATION_ANIM_DURATION = 250;

/** Duration of the pipe-fill animation per tile in milliseconds. */
export const FILL_ANIM_DURATION = 250;

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
}

// ─── Key helpers ─────────────────────────────────────────────────────────────

/** Return the canonical string key for a rotation animation. */
export function rotationAnimKey(anim: PipeRotationAnim): string {
  return posKey(anim.row, anim.col);
}

/** Return the canonical string key for a fill animation. */
export function fillAnimKey(anim: PipeFillAnim): string {
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
    if (now >= anim.startTime + FILL_ANIM_DURATION) {
      anims.splice(i, 1); // expired – remove
      continue;
    }
    // Not expired yet – add to active set even if not started yet
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
 * entry recording the direction from which water enters that tile and the
 * one-way-blocked arm direction (null if none).
 */
export function computeFillOrder(
  board: Board,
  filledBefore: Set<string>,
): Array<{ row: number; col: number; entryDir: Direction; blockedDir: Direction | null }> {
  const queue: Array<{ row: number; col: number }> = [];

  const result: Array<{ row: number; col: number; entryDir: Direction; blockedDir: Direction | null }> = [];

  // Start BFS from source.  The source itself is always already-filled, so it
  // acts as the frontier entry point.
  const sourceKey = posKey(board.source.row, board.source.col);
  const bfsVisited = new Set<string>();
  bfsVisited.add(sourceKey);
  queue.push({ row: board.source.row, col: board.source.col });

  while (queue.length > 0) {
    const cur = queue.shift()!;

    for (const dir of Object.values(Direction)) {
      if (!board.areMutuallyConnected(cur, dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const next = { row: cur.row + delta.row, col: cur.col + delta.col };
      const nextKey = posKey(next.row, next.col);
      if (bfsVisited.has(nextKey)) continue;
      bfsVisited.add(nextKey);
      queue.push(next);

      // Only record if this tile is NEWLY filled (not already filled before the move).
      if (!filledBefore.has(nextKey)) {
        // entryDir = direction FROM WHICH water enters next tile = opposite of travel dir.
        const entryDir = oppositeDirection(dir);

        // Determine if the tile sits on a one-way cell that blocks an arm.
        let blockedDir: Direction | null = null;
        const owDir = board.oneWayData.get(nextKey);
        if (owDir !== undefined) {
          // The arm pointing OPPOSITE to the one-way direction is blocked.
          blockedDir = oppositeDirection(owDir);
        }

        result.push({ row: next.row, col: next.col, entryDir, blockedDir });
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
    const elapsed = now - anim.startTime;
    if (elapsed < 0) continue; // not started yet
    const progress = Math.min(1, elapsed / FILL_ANIM_DURATION);
    const connections = tileConnectionsMap.get(fillAnimKey(anim));
    if (!connections) continue;
    _drawFillOverlay(ctx, anim, connections, lineWidth, progress);
  }
}

/** Draw water-fill progress for a single tile. */
function _drawFillOverlay(
  ctx: CanvasRenderingContext2D,
  anim: PipeFillAnim,
  connections: Set<Direction>,
  lineWidth: number,
  progress: number,
): void {
  const cx = anim.col * TILE_SIZE + TILE_SIZE / 2;
  const cy = anim.row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  // Phase 1 (0 → 0.5): entry arm fills from its edge toward the tile centre.
  const entryP = Math.min(1, progress * 2);
  // Phase 2 (0.5 → 1): all other arms fill from the centre outward.
  const otherP = Math.max(0, (progress - 0.5) * 2);

  ctx.save();
  ctx.strokeStyle = WATER_COLOR;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';

  // Entry arm: fill from the outer edge inward toward the centre.
  if (connections.has(anim.entryDir) && entryP > 0) {
    const dx = NEIGHBOUR_DELTA[anim.entryDir].col;
    const dy = NEIGHBOUR_DELTA[anim.entryDir].row;
    // At entryP=0: water tip is at the edge (cx + dx*half, cy + dy*half).
    // At entryP=1: water tip reaches the centre (cx, cy).
    const startX = cx + dx * half;
    const startY = cy + dy * half;
    const endX = cx + dx * half * (1 - entryP);
    const endY = cy + dy * half * (1 - entryP);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Other arms: fill from the centre outward (skip entry arm and blocked arm).
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
