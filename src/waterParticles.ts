/**
 * Water particle animations for the pipes game:
 *
 * 1. Source spray – subtle water drops spraying from the Source tile during play.
 * 2. Win flow     – water drops flowing along connected pipes from source to sink
 *                   on level completion.
 */

import { Board, NEIGHBOUR_DELTA } from './board';
import { Direction, GridPos } from './types';
import { TILE_SIZE } from './renderer';

// ──────────────────────────────────────────────────────────────────────────────
// Source Spray
// ──────────────────────────────────────────────────────────────────────────────

/** A single water drop spraying outward from the source tile. */
export interface SourceSprayDrop {
  /** Direction angle in radians (0 = right, π/2 = down, etc.). */
  angle: number;
  /** Current distance from the tile centre in pixels. */
  distance: number;
  /** Movement speed in pixels per frame at ~60 fps. */
  speed: number;
  /** Half-length (along the travel axis) of the drop ellipse, in pixels. */
  size: number;
}

/** Distance at which a spray drop is fully transparent and removed. */
const SPRAY_MAX_DIST = TILE_SIZE / 2;

/** Maximum number of simultaneously live source spray drops. */
const SPRAY_MAX_DROPS = 10;

/**
 * Attempt to add one new spray drop to the pool.
 * Does nothing when the pool is already full.
 */
export function spawnSourceSprayDrop(drops: SourceSprayDrop[]): void {
  if (drops.length >= SPRAY_MAX_DROPS) return;
  drops.push({
    angle: Math.random() * Math.PI * 2,
    distance: Math.random() * 3,
    speed: 0.5 + Math.random() * 0.8,
    size: 1.5 + Math.random() * 2.0,
  });
}

/**
 * Advance and render all source spray drops, then remove expired ones.
 *
 * @param ctx       2D rendering context.
 * @param drops     Mutable array of active spray drops (modified in place).
 * @param sourceCx  Canvas X of the source tile centre.
 * @param sourceCy  Canvas Y of the source tile centre.
 * @param color     CSS colour string for the drops.
 */
export function renderSourceSpray(
  ctx: CanvasRenderingContext2D,
  drops: SourceSprayDrop[],
  sourceCx: number,
  sourceCy: number,
  color: string,
): void {
  let i = 0;
  while (i < drops.length) {
    const drop = drops[i];
    drop.distance += drop.speed;
    if (drop.distance >= SPRAY_MAX_DIST) {
      drops.splice(i, 1);
      continue;
    }

    const x = sourceCx + Math.cos(drop.angle) * drop.distance;
    const y = sourceCy + Math.sin(drop.angle) * drop.distance;

    // Alpha: near-opaque at the centre, fades to transparent at the tile edge.
    const progress = drop.distance / SPRAY_MAX_DIST;
    const alpha = 0.6 * (1 - progress);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // Rotate so the long axis of the ellipse points in the direction of travel.
    ctx.rotate(drop.angle + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    // Teardrop-like ellipse: narrow width, longer in the travel direction.
    ctx.ellipse(0, 0, drop.size * 0.5, drop.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    i++;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Win Flow
// ──────────────────────────────────────────────────────────────────────────────

/** Return the direction opposite to the given one. */
function _oppositeDir(dir: Direction): Direction {
  switch (dir) {
    case Direction.North: return Direction.South;
    case Direction.South: return Direction.North;
    case Direction.East:  return Direction.West;
    case Direction.West:  return Direction.East;
  }
}

/**
 * Return all mutually-connected neighbour directions from `pos`, excluding the
 * direction the drop arrived from (to prevent back-tracking).
 */
function _forwardDirs(board: Board, pos: GridPos, fromDir: Direction | null): Direction[] {
  const dirs: Direction[] = [];
  for (const dir of Object.values(Direction)) {
    if (fromDir !== null && dir === _oppositeDir(fromDir)) continue;
    if (board.areMutuallyConnected(pos, dir)) dirs.push(dir);
  }
  return dirs;
}

/** A water drop flowing along connected pipes from the source towards the sink. */
export interface FlowDrop {
  /** Grid row of the tile the drop is currently leaving. */
  row: number;
  /** Grid column of the tile the drop is currently leaving. */
  col: number;
  /**
   * Fractional progress of travel from the current tile centre to the next
   * (0 = at current centre, 1 = arrived at the next tile).
   */
  progress: number;
  /** Movement speed in tile-lengths per frame at ~60 fps. */
  speed: number;
  /** Direction the drop is currently travelling towards. */
  direction: Direction;
  /** Direction the drop arrived from (prevents back-tracking). */
  fromDir: Direction | null;
  /** Half-length of the travel-axis ellipse, in pixels. */
  size: number;
}

/** Maximum number of simultaneously live win-flow drops. */
const FLOW_MAX_DROPS = 25;

/**
 * Spawn a new win-flow drop at the source tile.
 * Does nothing when the pool is full or the source has no connected neighbours.
 *
 * @param drops  Mutable array of active flow drops.
 * @param board  The solved game board.
 */
export function spawnFlowDrop(drops: FlowDrop[], board: Board): void {
  if (drops.length >= FLOW_MAX_DROPS) return;
  const dirs = _forwardDirs(board, board.source, null);
  if (dirs.length === 0) return;
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  drops.push({
    row: board.source.row,
    col: board.source.col,
    progress: 0,
    speed: 0.035 + Math.random() * 0.025,
    direction: dir,
    fromDir: null,
    size: 6 + Math.random() * 4,
  });
}

/**
 * Advance and render all win-flow drops, removing those that reach the sink or
 * a dead end.
 *
 * @param ctx    2D rendering context.
 * @param drops  Mutable array of active flow drops (modified in place).
 * @param board  The solved game board (used for connection lookups).
 * @param color  CSS colour string for the drops.
 */
export function renderFlowDrops(
  ctx: CanvasRenderingContext2D,
  drops: FlowDrop[],
  board: Board,
  color: string,
): void {
  let i = 0;
  while (i < drops.length) {
    const drop = drops[i];
    drop.progress += drop.speed;

    // ── Tile-arrival check ──────────────────────────────────────────────────
    if (drop.progress >= 1) {
      const delta = NEIGHBOUR_DELTA[drop.direction];
      drop.row += delta.row;
      drop.col += delta.col;
      drop.fromDir = drop.direction;
      drop.progress -= 1;

      // Reached the sink – remove.
      if (drop.row === board.sink.row && drop.col === board.sink.col) {
        drops.splice(i, 1);
        continue;
      }

      // Pick the next direction.
      const nextDirs = _forwardDirs(board, { row: drop.row, col: drop.col }, drop.fromDir);
      if (nextDirs.length === 0) {
        drops.splice(i, 1);
        continue;
      }
      drop.direction = nextDirs[Math.floor(Math.random() * nextDirs.length)];
    }

    // ── Canvas-position interpolation ───────────────────────────────────────
    const curCx = drop.col * TILE_SIZE + TILE_SIZE / 2;
    const curCy = drop.row * TILE_SIZE + TILE_SIZE / 2;
    const delta  = NEIGHBOUR_DELTA[drop.direction];
    const nxtCx  = curCx + delta.col * TILE_SIZE;
    const nxtCy  = curCy + delta.row * TILE_SIZE;
    const px     = curCx + (nxtCx - curCx) * drop.progress;
    const py     = curCy + (nxtCy - curCy) * drop.progress;

    // Angle of travel (used to orient the teardrop ellipse).
    const angle = Math.atan2(nxtCy - curCy, nxtCx - curCx);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(px, py);
    // Rotate so the long axis of the ellipse points in the direction of travel.
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, drop.size * 0.55, drop.size, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    i++;
  }
}
