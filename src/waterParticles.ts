/**
 * Water particle animations for the pipes game:
 *
 * 1. Source spray – subtle water drops spraying from the Source tile during play.
 * 2. Win flow     – water drops flowing along connected pipes from source to sink
 *                   on level completion.
 * 3. Pipe bubbles – fizzing bubble particles inside connected pipe tiles to
 *                   indicate liquid is flowing through the connected network.
 */

import { Board, NEIGHBOUR_DELTA, PIPE_SHAPES, GOLD_PIPE_SHAPES, SPIN_PIPE_SHAPES } from './board';
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
// Dry-air puffs (source runs dry on level fail)
// ──────────────────────────────────────────────────────────────────────────────

/** A single puff of dry air bursting outward from the source tile on level fail. */
export interface DryPuff {
  /** Direction angle in radians (0 = right, π/2 = down, etc.). */
  angle: number;
  /** Current distance from the tile centre in pixels. */
  distance: number;
  /** Movement speed in pixels per frame at ~60 fps. */
  speed: number;
  /** Radius of the puff circle in pixels. */
  size: number;
}

/** Maximum number of simultaneously live dry-air puffs. */
const DRY_PUFF_MAX = 8;

/**
 * Attempt to add one new dry puff to the pool.
 * Does nothing when the pool is already full.
 */
export function spawnDryPuff(puffs: DryPuff[]): void {
  if (puffs.length >= DRY_PUFF_MAX) return;
  puffs.push({
    angle: Math.random() * Math.PI * 2,
    distance: Math.random() * _s(2),
    speed: _s(0.4 + Math.random() * 0.6),
    size: _s(4 + Math.random() * 4),
  });
}

/**
 * Advance and render all dry-air puffs, then remove expired ones.
 *
 * @param ctx       2D rendering context.
 * @param puffs     Mutable array of active puffs (modified in place).
 * @param sourceCx  Canvas X of the source tile centre.
 * @param sourceCy  Canvas Y of the source tile centre.
 */
export function renderDryPuffs(
  ctx: CanvasRenderingContext2D,
  puffs: DryPuff[],
  sourceCx: number,
  sourceCy: number,
): void {
  let i = 0;
  // Puffs travel a bit further than water drops to feel more expansive.
  const maxDist = _sprayMaxDist() * 1.4;
  while (i < puffs.length) {
    const puff = puffs[i];
    puff.distance += puff.speed;
    if (puff.distance >= maxDist) {
      puffs.splice(i, 1);
      continue;
    }

    const x = sourceCx + Math.cos(puff.angle) * puff.distance;
    const y = sourceCy + Math.sin(puff.angle) * puff.distance;

    // Fade from opaque near the centre to transparent at the edge.
    const progress = puff.distance / maxDist;
    const alpha = 0.55 * (1 - progress);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, puff.size, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
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

/**
 * Spawn a new win-flow drop at the source tile.
 * Does nothing when the pool is full or the source has no connected neighbours.
 *
 * @param drops     Mutable array of active flow drops.
 * @param board     The solved game board.
 * @param goodDirs  Pre-computed good-direction set from {@link computeFlowGoodDirs}.
 * @param maxDrops  Maximum number of simultaneously live drops.
 */
export function spawnFlowDrop(drops: FlowDrop[], board: Board, goodDirs: Map<string, Set<Direction>>, maxDrops: number): void {
  if (drops.length >= maxDrops) return;
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

// ──────────────────────────────────────────────────────────────────────────────
// Pipe Bubbles
// ──────────────────────────────────────────────────────────────────────────────

/** A single fizzing bubble particle rendered inside a connected pipe. */
export interface BubbleParticle {
  /** Canvas pixel X. */
  x: number;
  /** Canvas pixel Y. */
  y: number;
  /** Bubble radius in pixels. */
  radius: number;
  /** Current opacity (0–1). */
  alpha: number;
  /** 0 = appearing (alpha increasing), 1 = disappearing (alpha decreasing). */
  phase: number;
  /** Alpha change per frame (~60 fps). */
  speed: number;
}

/** Maximum number of simultaneously live bubble particles. */
const BUBBLE_MAX = 80;

/**
 * Attempt to spawn one new bubble inside a random connected pipe tile.
 * Does nothing when the pool is full or there are no eligible tiles.
 *
 * @param bubbles         Mutable array of active bubbles.
 * @param board           The current game board.
 * @param filledPositions Pre-computed set of connected tile keys ("row,col").
 */
export function spawnBubble(
  bubbles: BubbleParticle[],
  board: Board,
  filledPositions: Set<string>,
): void {
  if (bubbles.length >= BUBBLE_MAX) return;

  // Collect filled positions that are actual pipe tiles (not source/sink/chamber).
  const candidates: string[] = [];
  for (const key of filledPositions) {
    const [r, c] = key.split(',').map(Number);
    const shape = board.grid[r][c].shape;
    if (PIPE_SHAPES.has(shape) || GOLD_PIPE_SHAPES.has(shape) || SPIN_PIPE_SHAPES.has(shape)) {
      candidates.push(key);
    }
  }
  if (candidates.length === 0) return;

  const key = candidates[Math.floor(Math.random() * candidates.length)];
  const [row, col] = key.split(',').map(Number);

  // Collect the directions that have live mutual connections from this tile.
  const connectedDirs: Direction[] = [];
  for (const dir of Object.values(Direction)) {
    if (board.areMutuallyConnected({ row, col }, dir)) {
      connectedDirs.push(dir);
    }
  }

  const cx = col * TILE_SIZE + TILE_SIZE / 2;
  const cy = row * TILE_SIZE + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;
  // Approximate inner half-width of the pipe tube at the current tile size.
  const tubeHalf = _s(10) / 2;

  let bx: number;
  let by: number;

  // Choose: the centre junction (always valid) or one of the pipe arms.
  const choice = Math.floor(Math.random() * (connectedDirs.length + 1));
  if (choice >= connectedDirs.length || connectedDirs.length === 0) {
    // Centre junction – stay within the tube cross-section.
    bx = cx + (Math.random() - 0.5) * tubeHalf * 1.6;
    by = cy + (Math.random() - 0.5) * tubeHalf * 1.6;
  } else {
    const dir = connectedDirs[choice];
    // Place the bubble somewhere along the pipe arm towards `dir`.
    // The arm runs from the tile centre to the tile edge; the bubble is
    // confined within the tube width.
    switch (dir) {
      case Direction.North:
        bx = cx + (Math.random() - 0.5) * tubeHalf * 1.6;
        by = cy - Math.random() * half;
        break;
      case Direction.South:
        bx = cx + (Math.random() - 0.5) * tubeHalf * 1.6;
        by = cy + Math.random() * half;
        break;
      case Direction.East:
        bx = cx + Math.random() * half;
        by = cy + (Math.random() - 0.5) * tubeHalf * 1.6;
        break;
      default: // West
        bx = cx - Math.random() * half;
        by = cy + (Math.random() - 0.5) * tubeHalf * 1.6;
        break;
    }
  }

  bubbles.push({
    x: bx,
    y: by,
    radius: _s(1.5 + Math.random() * 2.5),
    alpha: 0,
    phase: 0,
    speed: 0.025 + Math.random() * 0.035,
  });
}

/**
 * Advance and render all bubble particles, removing expired ones.
 *
 * @param ctx     2D rendering context.
 * @param bubbles Mutable array of active bubbles (modified in place).
 * @param color   CSS colour string used for the bubble fill.
 */
export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: BubbleParticle[],
  color: string,
): void {
  let i = 0;
  while (i < bubbles.length) {
    const b = bubbles[i];

    if (b.phase === 0) {
      b.alpha += b.speed;
      if (b.alpha >= 1) {
        b.alpha = 1;
        b.phase = 1;
      }
    } else {
      b.alpha -= b.speed;
      if (b.alpha <= 0) {
        bubbles.splice(i, 1);
        continue;
      }
    }

    ctx.save();
    ctx.globalAlpha = b.alpha * 0.65;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    // Thin lighter ring to give a glassy bubble look.
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = _s(0.8);
    ctx.stroke();
    ctx.restore();

    i++;
  }
}
