/**
 * Water particle animations for the pipes game:
 *
 * 1. Source spray – subtle water drops spraying from the Source tile during play.
 * 2. Win flow     – water drops flowing along connected pipes from source to sink
 *                   on level completion.
 */

import { Board, NEIGHBOUR_DELTA } from './board';
import { Direction, GridPos } from './types';
import { TILE_SIZE, scalePx as _s } from './renderer';

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
function _sprayMaxDist(): number { return TILE_SIZE / 2; }

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
    distance: Math.random() * _s(3),
    speed: _s(0.5 + Math.random() * 0.8),
    size: _s(1.5 + Math.random() * 2.0),
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
  const maxDist = _sprayMaxDist();
  while (i < drops.length) {
    const drop = drops[i];
    drop.distance += drop.speed;
    if (drop.distance >= maxDist) {
      drops.splice(i, 1);
      continue;
    }

    const x = sourceCx + Math.cos(drop.angle) * drop.distance;
    const y = sourceCy + Math.sin(drop.angle) * drop.distance;

    // Alpha: near-opaque at the centre, fades to transparent at the tile edge.
    const progress = drop.distance / maxDist;
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
 * Compute the set of "good" outgoing directions at each tile – directions that
 * lead, without backtracking, to the sink.  Used to prevent win-flow drops from
 * wandering into dead-end branches.
 *
 * Algorithm: backward BFS from the sink.  A direction `d` from tile T is "good"
 * if the neighbour N reached by going in direction `d` has at least one good
 * outgoing direction that does not return straight back to T.
 */
export function computeFlowGoodDirs(board: Board): Map<string, Set<Direction>> {
  const goodDirs = new Map<string, Set<Direction>>();

  function getDirs(pos: GridPos): Set<Direction> {
    const key = `${pos.row},${pos.col}`;
    if (!goodDirs.has(key)) goodDirs.set(key, new Set());
    return goodDirs.get(key)!;
  }

  const queue: GridPos[] = [];

  // Seed: for each tile adjacent to the sink that is mutually connected to it,
  // the direction from that tile towards the sink is "good".
  for (const dir of Object.values(Direction)) {
    const delta = NEIGHBOUR_DELTA[dir];
    const neighbor: GridPos = { row: board.sink.row + delta.row, col: board.sink.col + delta.col };
    // Direction from neighbor to sink is the opposite of `dir`
    const dirToSink = _oppositeDir(dir);
    if (board.areMutuallyConnected(neighbor, dirToSink)) {
      const set = getDirs(neighbor);
      if (!set.has(dirToSink)) {
        set.add(dirToSink);
        queue.push(neighbor);
      }
    }
  }

  // BFS backwards: propagate "good" directions through mutual connections.
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDirs = getDirs(current);

    for (const dirToNeighbor of Object.values(Direction)) {
      if (!board.areMutuallyConnected(current, dirToNeighbor)) continue;

      const delta = NEIGHBOUR_DELTA[dirToNeighbor];
      const neighbor: GridPos = { row: current.row + delta.row, col: current.col + delta.col };

      // Skip the sink itself – drops are removed on arrival, no need to track it.
      if (neighbor.row === board.sink.row && neighbor.col === board.sink.col) continue;

      // Direction from neighbor back to current.
      const dirToCurrent = _oppositeDir(dirToNeighbor);

      // Going from `neighbor` towards `current` is only useful if `current` has
      // at least one good direction that does NOT immediately return to `neighbor`
      // (which would be a pointless U-turn ending in `neighbor` again).
      const hasUsefulExit = [...currentDirs].some((d) => d !== dirToNeighbor);
      if (!hasUsefulExit) continue;

      const neighborDirs = getDirs(neighbor);
      if (!neighborDirs.has(dirToCurrent)) {
        neighborDirs.add(dirToCurrent);
        queue.push(neighbor);
      }
    }
  }

  return goodDirs;
}

/**
 * Return all mutually-connected neighbour directions from `pos`, excluding the
 * direction the drop arrived from (to prevent back-tracking), and (when
 * `goodDirs` is provided) restricted to directions that are known to lead
 * towards the sink without hitting a dead end.
 */
function _forwardDirs(
  board: Board,
  pos: GridPos,
  fromDir: Direction | null,
  goodDirs: Map<string, Set<Direction>> | null,
): Direction[] {
  const dirs: Direction[] = [];
  const key = `${pos.row},${pos.col}`;
  const good = goodDirs !== null ? (goodDirs.get(key) ?? null) : null;
  for (const dir of Object.values(Direction)) {
    if (fromDir !== null && dir === _oppositeDir(fromDir)) continue;
    if (!board.areMutuallyConnected(pos, dir)) continue;
    if (good !== null && !good.has(dir)) continue;
    dirs.push(dir);
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
 * @param drops     Mutable array of active flow drops.
 * @param board     The solved game board.
 * @param goodDirs  Pre-computed good-direction set from {@link computeFlowGoodDirs}.
 */
export function spawnFlowDrop(drops: FlowDrop[], board: Board, goodDirs: Map<string, Set<Direction>>): void {
  if (drops.length >= FLOW_MAX_DROPS) return;
  const dirs = _forwardDirs(board, board.source, null, goodDirs);
  if (dirs.length === 0) return;
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  drops.push({
    row: board.source.row,
    col: board.source.col,
    progress: 0,
    speed: 0.035 + Math.random() * 0.025,
    direction: dir,
    fromDir: null,
    size: _s(6) + Math.random() * _s(4),
  });
}

/**
 * Advance and render all win-flow drops, removing those that reach the sink or
 * a dead end.
 *
 * @param ctx       2D rendering context.
 * @param drops     Mutable array of active flow drops (modified in place).
 * @param board     The solved game board (used for connection lookups).
 * @param color     CSS colour string for the drops.
 * @param goodDirs  Pre-computed good-direction set from {@link computeFlowGoodDirs}.
 */
export function renderFlowDrops(
  ctx: CanvasRenderingContext2D,
  drops: FlowDrop[],
  board: Board,
  color: string,
  goodDirs: Map<string, Set<Direction>>,
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
      const nextDirs = _forwardDirs(board, { row: drop.row, col: drop.col }, drop.fromDir, goodDirs);
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
    ctx.lineWidth = _s(2);
    ctx.stroke();
    ctx.restore();

    i++;
  }
}
