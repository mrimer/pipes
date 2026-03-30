/**
 * Canvas rendering helpers for the chapter map (both the gameplay screen and
 * the campaign editor preview).  All functions are stateless – they receive
 * explicit data parameters and write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, LevelDef, Rotation, AmbientDecoration, AmbientDecorationType } from '../types';
import { TILE_SIZE, LINE_WIDTH, scalePx as _s, drawAmbientDecoration } from '../renderer';
import { PIPE_SHAPES, NEIGHBOUR_DELTA } from '../board';
import { oppositeDirection } from '../tile';
import {
  SOURCE_COLOR, SOURCE_WATER_COLOR, SINK_COLOR, SINK_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_TRUNK_COLOR,
  CHAMBER_COLOR, CHAMBER_FILL_COLOR,
} from '../colors';
import { renderMinimap } from '../minimap';
import { Tile } from '../tile';

// ─── Butt-end helpers ─────────────────────────────────────────────────────────

/**
 * Return the connection set for a tile definition (without a Board/Tile runtime object).
 * Used to determine neighbor connectivity when computing butt-end directions.
 *
 * @param def  The tile definition to inspect.  Source, Sink, and Chamber tiles without
 *             an explicit `connections` array default to all four directions.  Pipe
 *             shapes derive their connections from their shape and rotation.  All other
 *             shapes (Granite, Tree, Empty, …) return an empty set.
 */
function _getTileConnections(def: TileDef): Set<Direction> {
  if (def.connections) return new Set(def.connections);
  if (def.shape === PipeShape.Source || def.shape === PipeShape.Sink || def.shape === PipeShape.Chamber) {
    return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
  }
  if (PIPE_SHAPES.has(def.shape)) {
    const rot = (def.rotation ?? 0) as Rotation;
    const t = new Tile(def.shape, rot, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
    return t.connections;
  }
  return new Set();
}

/**
 * Compute which arm directions of the tile at (r, c) should use a flat (butt)
 * end cap.  An arm gets a butt end when the adjacent cell is non-empty AND the
 * neighbor has a connection pointing back (so the arms visually join flush at the
 * tile boundary).  Arms pointing into empty cells or at pipe tiles without a
 * reciprocal arm keep their round nubs.
 */
function _computeChapterButtEndDirs(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  r: number,
  c: number,
  tileConns: Set<Direction>,
): Set<Direction> | undefined {
  let buttEndDirs: Set<Direction> | undefined;
  for (const dir of tileConns) {
    const delta = NEIGHBOUR_DELTA[dir];
    const nr = r + delta.row, nc = c + delta.col;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const neighbor = grid[nr]?.[nc];
    if (!neighbor) continue; // null = empty cell → round end
    const neighborConns = _getTileConnections(neighbor);
    const oppDir = oppositeDirection(dir);
    // Pipe neighbor with no reciprocal arm → arms don't overlap, keep round nub
    if (PIPE_SHAPES.has(neighbor.shape) && !neighborConns.has(oppDir)) continue;
    (buttEndDirs ??= new Set<Direction>()).add(dir);
  }
  return buttEndDirs;
}



// ─── Ambient decorations ───────────────────────────────────────────────────────

/**
 * Generate a set of ambient background decorations for a chapter map grid.
 * These are rendered on empty (null) cells to give the map a natural look.
 * Returned as a Map keyed by "row,col" for O(1) lookup.
 */
export function generateChapterMapDecorations(
  rows: number,
  cols: number,
): ReadonlyMap<string, AmbientDecoration> {
  const DECORATION_DENSITY = 0.30;
  const TYPES: AmbientDecorationType[] = ['pebbles', 'flower', 'grass'];
  const map = new Map<string, AmbientDecoration>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() >= DECORATION_DENSITY) continue;
      map.set(`${r},${c}`, {
        row: r,
        col: c,
        type: TYPES[Math.floor(Math.random() * TYPES.length)],
        offsetX: 0.15 + Math.random() * 0.70,
        offsetY: 0.15 + Math.random() * 0.70,
        rotation: Math.random() * 360,
        variant: Math.floor(Math.random() * 3),
      });
    }
  }
  return map;
}

// ─── Shared types ──────────────────────────────────────────────────────────────

/**
 * Per-level progress data used to determine level-chamber visual state
 * (completion, star collection) when rendering the chapter map grid.
 */
export interface LevelProgressMap {
  completedLevels: ReadonlySet<number>;
  levelStars: Readonly<Record<number, number>>;
}

// ─── Level chamber tile ────────────────────────────────────────────────────────

/** Draw a level-chamber tile in the editor/chapter-map canvas at pixel (x, y).
 *
 * Renders:
 *  • Background: red (challenge), gold (all stars obtained), white (completed),
 *    or the default dark-blue.
 *  • "L-N" label at top-left.
 *  • Skull icon 💀 at top-right when the level is a challenge level.
 *  • The level's minimap, centered in the area below the label row.
 *  • A star icon ⭐ (with "×N" when > 1) centered on the minimap when stars
 *    have been collected.
 *  • Connection lines on the edges defined by `connections`.
 */
export function drawLevelChamberTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  levelDef: LevelDef | undefined,
  levelNum: number,
  connections: Set<Direction>,
  isCompleted = false,
  starsCollected = 0,
  totalStars = 0,
  isFilled = false,
): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;

  const isChallenge = levelDef?.challenge ?? false;
  const allStars = totalStars > 0 && starsCollected >= totalStars;

  // Draw chamber-style box (like in-game item chamber)
  const bw = half * 0.7 + 2;
  const bh = half * 0.7 + 2;
  const br = _s(3);

  // Background fill
  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);

  // Inner chamber box – use a vivid water-blue when the tile is water-connected
  const chamberFill  = isFilled ? '#1a3d60' : CHAMBER_FILL_COLOR;
  const chamberColor = isFilled ? '#4a90d9' : CHAMBER_COLOR;
  ctx.beginPath();
  ctx.roundRect(-bw, -bh, bw * 2, bh * 2, br);
  ctx.fillStyle = chamberFill;
  ctx.fill();
  ctx.strokeStyle = chamberColor;
  ctx.lineWidth = _s(3);
  ctx.stroke();

  // Connection stubs from box edge to tile edge (butt cap, like in-game chamber)
  ctx.strokeStyle = chamberColor;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'butt';
  if (connections.has(Direction.North)) {
    ctx.beginPath(); ctx.moveTo(0, -bh); ctx.lineTo(0, -half); ctx.stroke();
  }
  if (connections.has(Direction.South)) {
    ctx.beginPath(); ctx.moveTo(0, bh);  ctx.lineTo(0, half);  ctx.stroke();
  }
  if (connections.has(Direction.West)) {
    ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(-half, 0); ctx.stroke();
  }
  if (connections.has(Direction.East)) {
    ctx.beginPath(); ctx.moveTo(bw, 0);  ctx.lineTo(half, 0);  ctx.stroke();
  }

  ctx.restore();

  // Label row height (for the L-N text inside the chamber box)
  const labelH = _s(16);
  // Chamber box interior top-left in absolute coordinates
  const boxTop = cy - bh;
  const boxLeft = cx - bw;
  const boxRight = cx + bw;
  // Content area below the label row, clipped to the chamber box interior
  const contentY = boxTop + labelH;
  const contentH = bh * 2 - labelH;

  // "L-N" text at top-left of the chamber box interior
  ctx.save();
  ctx.font = `bold ${_s(10)}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = allStars ? '#f0c040' : isCompleted ? '#7ed321' : isChallenge ? '#e74c3c' : '#ddd';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  ctx.fillText(`L-${levelNum}`, boxLeft + _s(3), boxTop + _s(2));
  ctx.restore();

  // Skull icon at top-right of the chamber box interior if challenge
  if (isChallenge) {
    ctx.save();
    ctx.font = `${_s(11)}px Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText('💀', boxRight - _s(2), boxTop + _s(2));
    ctx.restore();
  }

  // Minimap (centered in the content area inside the chamber box)
  if (levelDef) {
    try {
      const minimap = renderMinimap(levelDef);
      const maxW = bw * 2 - _s(6);
      const maxH = contentH - _s(6);
      const scaleX = maxW / minimap.width;
      const scaleY = maxH / minimap.height;
      const scale = Math.min(scaleX, scaleY, 1);
      const mw = Math.round(minimap.width * scale);
      const mh = Math.round(minimap.height * scale);
      const mx = Math.round(cx - mw / 2);
      const my = contentY + Math.round((contentH - mh) / 2);
      ctx.drawImage(minimap, mx, my, mw, mh);

      // Star icon centered on minimap
      if (starsCollected > 0) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 4;
        const starText = starsCollected > 1 ? `⭐×${starsCollected}` : '⭐';
        ctx.font = `bold ${_s(12)}px Arial`;
        ctx.fillStyle = '#f0c040';
        ctx.fillText(starText, cx, my + mh / 2);
        ctx.restore();
      }
    } catch {
      // If minimap rendering fails, show a placeholder
      ctx.save();
      ctx.font = `${_s(9)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#888';
      ctx.fillText('?', cx, contentY + contentH / 2);
      ctx.restore();
    }
  } else {
    // No level def – show placeholder text
    ctx.save();
    ctx.font = `${_s(9)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#888';
    ctx.fillText('LEVEL', cx, contentY + contentH / 2);
    ctx.restore();
  }

}

// ─── Chapter map canvas renderer ──────────────────────────────────────────────

/** Draw Source tile like in-game: colored circle + radiating arms to connected edges. */
function _drawChapterMapSource(ctx: CanvasRenderingContext2D, x: number, y: number, isFilled: boolean, connections: Set<Direction>, capacity?: number, buttEndDirs?: Set<Direction>): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;
  const color = isFilled ? SOURCE_WATER_COLOR : SOURCE_COLOR;

  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  for (const dir of connections) {
    ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (dir === Direction.North) ctx.lineTo(0, -half);
    else if (dir === Direction.South) ctx.lineTo(0, half);
    else if (dir === Direction.East) ctx.lineTo(half, 0);
    else ctx.lineTo(-half, 0);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Show capacity number on source, like in the normal level screen
  if (capacity !== undefined) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(capacity), 0, 0);
  }
  ctx.restore();
}

/** Draw Sink tile like in-game: colored circle + radiating arms. */
function _drawChapterMapSink(ctx: CanvasRenderingContext2D, x: number, y: number, isFilled: boolean, connections: Set<Direction>, buttEndDirs?: Set<Direction>): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;
  const color = isFilled ? SINK_WATER_COLOR : SINK_COLOR;

  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  for (const dir of connections) {
    ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    if (dir === Direction.North) ctx.lineTo(0, -half);
    else if (dir === Direction.South) ctx.lineTo(0, half);
    else if (dir === Direction.East) ctx.lineTo(half, 0);
    else ctx.lineTo(-half, 0);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draw Granite tile like in-game. */
function _drawChapterMapGranite(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;
  const bw = half * 0.7;
  const bh = half * 0.7;

  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = GRANITE_FILL_COLOR;
  ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(3);
  ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath(); ctx.moveTo(-bw + _s(4), -bh + _s(10)); ctx.lineTo(bw - _s(6), -bh + _s(16)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(2), _s(2));         ctx.lineTo(bw - _s(8), _s(8));        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(6), bh - _s(14));   ctx.lineTo(bw - _s(4), bh - _s(8));  ctx.stroke();
  ctx.restore();
}

/** Draw Tree tile like in-game. */
function _drawChapterMapTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;
  const r = half * 0.75;

  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = TREE_LEAF_COLOR;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  const lobeR = r * 0.48;
  const lobeOff = r * 0.52;
  ctx.fillStyle = TREE_LEAF_ALT_COLOR;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath(); ctx.arc(Math.cos(angle) * lobeOff, Math.sin(angle) * lobeOff, lobeR, 0, Math.PI * 2); ctx.fill();
  }
  const dLobeR = lobeR * 0.72;
  const dLobeOff = lobeOff * 0.88;
  ctx.fillStyle = TREE_LEAF_COLOR;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath(); ctx.arc(Math.cos(angle) * dLobeOff, Math.sin(angle) * dLobeOff, dLobeR, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = TREE_TRUNK_COLOR;
  ctx.beginPath(); ctx.arc(0, 0, half * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = TREE_COLOR;
  ctx.lineWidth = _s(2);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * Render the chapter map canvas (used on the chapter map screen).
 *
 * @param ctx                  2D context to draw on.
 * @param grid                 Chapter map grid.
 * @param rows                 Grid row count.
 * @param cols                 Grid column count.
 * @param levelDefs            Level definitions for the chapter.
 * @param filledKeys           Set of "row,col" keys reachable from the source (water-filled).
 * @param progress             Completed levels and star data.
 * @param hoverPos             Currently hovered grid cell (for highlighting).
 * @param accessibleLevelIdxs  Set of level indices that are accessible (water reaches them).
 * @param decorations          Optional ambient decorations for empty cells.
 */
export function renderChapterMapCanvas(
  ctx: CanvasRenderingContext2D,
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  levelDefs: readonly LevelDef[],
  filledKeys: ReadonlySet<string>,
  progress: LevelProgressMap,
  hoverPos?: { row: number; col: number } | null,
  accessibleLevelIdxs?: ReadonlySet<number>,
  decorations?: ReadonlyMap<string, AmbientDecoration>,
): void {
  const CELL = TILE_SIZE;
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);

  // Pass 1: background cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c] ?? null;
      if (def !== null) continue;
      const x = c * CELL;
      const y = r * CELL;
      ctx.fillStyle = '#0d1520';
      ctx.fillRect(x, y, CELL, CELL);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#1a2840';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      ctx.setLineDash([]);
      // Ambient decoration on empty cells
      const dec = decorations?.get(`${r},${c}`);
      if (dec) drawAmbientDecoration(ctx, dec);
    }
  }

  // Pass 2: non-pipe tiles (level chambers, source, sink)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c] ?? null;
      if (def === null || PIPE_SHAPES.has(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;
      const isFilled = filledKeys.has(`${r},${c}`);

      if (def.shape === PipeShape.Chamber && def.chamberContent === 'level') {
        const levelIdx = def.levelIdx ?? 0;
        const levelDef = levelDefs[levelIdx];
        const levelId = levelDef?.id;
        const isCompleted = levelId !== undefined && progress.completedLevels.has(levelId);
        const stars = levelId !== undefined ? (progress.levelStars[levelId] ?? 0) : 0;
        const totalStars = levelDef?.starCount ?? 0;
        const connections = def.connections ? new Set(def.connections) : new Set([
          Direction.North, Direction.East, Direction.South, Direction.West,
        ]);
        drawLevelChamberTile(ctx, x, y, levelDef, levelIdx + 1, connections, isCompleted, stars, totalStars, isFilled);

        // Dim inaccessible level chambers
        if (!isFilled) {
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.restore();
        } else if (accessibleLevelIdxs?.has(levelIdx)) {
          // Accessible: bright gold border pulse (via stroke)
          ctx.save();
          ctx.strokeStyle = '#f0c040';
          ctx.lineWidth = _s(2);
          ctx.setLineDash([]);
          ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.restore();
        }
      } else if (def.shape === PipeShape.Source) {
        const connections = def.connections ? new Set(def.connections) : new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
        const buttEndDirs = _computeChapterButtEndDirs(grid, rows, cols, r, c, connections);
        _drawChapterMapSource(ctx, x, y, isFilled, connections, def.capacity, buttEndDirs);
      } else if (def.shape === PipeShape.Sink) {
        const connections = def.connections ? new Set(def.connections) : new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
        const buttEndDirs = _computeChapterButtEndDirs(grid, rows, cols, r, c, connections);
        _drawChapterMapSink(ctx, x, y, isFilled, connections, buttEndDirs);
      } else if (def.shape === PipeShape.Granite) {
        _drawChapterMapGranite(ctx, x, y);
      } else if (def.shape === PipeShape.Tree) {
        _drawChapterMapTree(ctx, x, y);
      }
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Pass 3: pipe tiles with connection lines drawn like the normal level screen
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c] ?? null;
      if (def === null || !PIPE_SHAPES.has(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;
      const cx = x + CELL / 2;
      const cy = y + CELL / 2;
      const isFilled = filledKeys.has(`${r},${c}`);

      // Background
      ctx.fillStyle = '#1a2840';
      ctx.fillRect(x, y, CELL, CELL);

      // Connection lines from center to open edges – same line weight as normal level
      const rot = (def.rotation ?? 0) as Rotation;
      const t = new Tile(def.shape, rot, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
      const pipeColor = isFilled ? '#4aa0ff' : '#3a506a';
      const buttEndDirs = _computeChapterButtEndDirs(grid, rows, cols, r, c, t.connections);
      ctx.save();
      ctx.strokeStyle = pipeColor;
      ctx.lineWidth = LINE_WIDTH;
      for (const dir of t.connections) {
        ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        if (dir === Direction.North) ctx.lineTo(cx, y);
        else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
        else if (dir === Direction.East) ctx.lineTo(x + CELL, cy);
        else if (dir === Direction.West) ctx.lineTo(x, cy);
        ctx.stroke();
      }
      // Center junction dot fills the seam when butt-end arms meet at center
      ctx.fillStyle = pipeColor;
      ctx.beginPath();
      ctx.arc(cx, cy, _s(5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Grid lines overlay
  ctx.strokeStyle = 'rgba(74,144,217,0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(cols * CELL, r * CELL);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, rows * CELL);
    ctx.stroke();
  }

  // Hover highlight
  if (hoverPos) {
    const { row, col } = hoverPos;
    const x = col * CELL;
    const y = row * CELL;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = _s(2);
    ctx.setLineDash([]);
    ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
    ctx.restore();
  }
}

// ─── Animation overlay helpers ─────────────────────────────────────────────────

/**
 * Find the canvas pixel centres of the source and all sinks in the chapter map grid.
 * Returns null for source if not found.
 */
export function findChapterMapAnimPositions(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  filledKeys: ReadonlySet<string>,
): {
  source: { x: number; y: number; row: number; col: number; isFilled: boolean } | null;
  sinks:  Array<{ x: number; y: number; isFilled: boolean }>;
} {
  const CELL = TILE_SIZE;
  let source: { x: number; y: number; row: number; col: number; isFilled: boolean } | null = null;
  const sinks: Array<{ x: number; y: number; isFilled: boolean }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (!def) continue;
      const isFilled = filledKeys.has(`${r},${c}`);
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      if (def.shape === PipeShape.Source) source = { x: cx, y: cy, row: r, col: c, isFilled };
      else if (def.shape === PipeShape.Sink) sinks.push({ x: cx, y: cy, isFilled });
    }
  }
  return { source, sinks };
}

// ─── Chapter map flow drops ────────────────────────────────────────────────────

/**
 * A water drop flowing along the filled chapter map pipe connections from source
 * toward the sink.  Rendered on top of the chapter map canvas as part of the
 * win-state animation that plays when all non-challenge levels are completed and
 * the pipe network reaches the sink.
 */
export interface ChapterMapFlowDrop {
  /** Grid row of the tile the drop is currently leaving. */
  row: number;
  /** Grid column of the tile the drop is currently leaving. */
  col: number;
  /**
   * Fractional progress of travel from the current tile center to the next
   * (0 = at the current tile center, 1 = arrived at the neighbor center).
   */
  progress: number;
  /** Movement speed in tile-lengths per animation frame (~60 fps). */
  speed: number;
  /** Direction the drop is currently traveling toward. */
  direction: Direction;
  /** Direction this tile was entered from (to prevent back-tracking). */
  fromDir: Direction | null;
  /** Half-length of the ellipse along the travel axis, in pixels. */
  size: number;
}

/** Maximum number of simultaneously live flow drops on the chapter map. */
const CHAPTER_FLOW_MAX_DROPS = 5;

/**
 * Compute the valid outgoing directions from a chapter map cell toward filled
 * neighbor cells that are mutually connected.  Skips the `fromDir` direction
 * to prevent the drop from reversing.
 */
function _chapterFlowForwardDirs(
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  filledKeys: ReadonlySet<string>,
  row: number,
  col: number,
  fromDir: Direction | null,
): Direction[] {
  const def = grid[row]?.[col];
  if (!def) return [];
  const conns = _getTileConnections(def);
  const dirs: Direction[] = [];
  for (const dir of conns) {
    if (fromDir !== null && dir === fromDir) continue; // no back-tracking
    const delta = NEIGHBOUR_DELTA[dir];
    const nr = row + delta.row;
    const nc = col + delta.col;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const key = `${nr},${nc}`;
    if (!filledKeys.has(key)) continue;
    const nDef = grid[nr]?.[nc];
    if (!nDef) continue;
    const nConns = _getTileConnections(nDef);
    const entryDir = oppositeDirection(dir); // direction the neighbor is entered from
    if (!nConns.has(entryDir)) continue; // neighbor must have a reciprocal connection
    dirs.push(dir);
  }
  return dirs;
}

/**
 * Attempt to spawn one new flow drop at the source tile.
 * Does nothing when the pool is full or the source has no filled forward neighbors.
 *
 * @param drops      Mutable array of active flow drops (modified in place).
 * @param grid       Chapter map tile grid.
 * @param rows       Number of grid rows.
 * @param cols       Number of grid columns.
 * @param filledKeys Set of "row,col" keys for water-filled cells.
 * @param sourceRow  Grid row of the source tile.
 * @param sourceCol  Grid column of the source tile.
 */
export function spawnChapterMapFlowDrop(
  drops: ChapterMapFlowDrop[],
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  filledKeys: ReadonlySet<string>,
  sourceRow: number,
  sourceCol: number,
): void {
  if (drops.length >= CHAPTER_FLOW_MAX_DROPS) return;
  const dirs = _chapterFlowForwardDirs(grid, rows, cols, filledKeys, sourceRow, sourceCol, null);
  if (dirs.length === 0) return;
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  drops.push({
    row: sourceRow,
    col: sourceCol,
    progress: 0,
    speed: 0.018 + Math.random() * 0.018,
    direction: dir,
    fromDir: null,
    size: _s(3 + Math.random() * 3),
  });
}

/**
 * Advance and render all chapter map flow drops, removing those that reach the
 * sink or a dead-end.
 *
 * @param ctx        2D rendering context.
 * @param drops      Mutable array of active flow drops (modified in place).
 * @param grid       Chapter map tile grid.
 * @param rows       Number of grid rows.
 * @param cols       Number of grid columns.
 * @param filledKeys Set of "row,col" keys for water-filled cells.
 * @param color      CSS color string for the drop ellipses.
 */
export function renderChapterMapFlowDrops(
  ctx: CanvasRenderingContext2D,
  drops: ChapterMapFlowDrop[],
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  filledKeys: ReadonlySet<string>,
  color: string,
): void {
  const CELL = TILE_SIZE;
  let i = 0;
  while (i < drops.length) {
    const drop = drops[i];
    drop.progress += drop.speed;

    if (drop.progress >= 1) {
      // Move to the next tile
      const delta = NEIGHBOUR_DELTA[drop.direction];
      const nr = drop.row + delta.row;
      const nc = drop.col + delta.col;

      const nDef = grid[nr]?.[nc];
      // Remove if out-of-bounds or reached the sink
      if (!nDef || nDef.shape === PipeShape.Sink) {
        drops.splice(i, 1);
        continue;
      }

      const entryDir = oppositeDirection(drop.direction);
      const nextDirs = _chapterFlowForwardDirs(grid, rows, cols, filledKeys, nr, nc, entryDir);
      if (nextDirs.length === 0) {
        drops.splice(i, 1);
        continue;
      }

      drop.row = nr;
      drop.col = nc;
      drop.progress -= 1;
      drop.fromDir = entryDir;
      drop.direction = nextDirs[Math.floor(Math.random() * nextDirs.length)];
    }

    // Render the drop at its current interpolated position
    const cx = drop.col * CELL + CELL / 2;
    const cy = drop.row * CELL + CELL / 2;
    let dx = 0, dy = 0;
    if      (drop.direction === Direction.North) dy = -1;
    else if (drop.direction === Direction.South) dy =  1;
    else if (drop.direction === Direction.East)  dx =  1;
    else if (drop.direction === Direction.West)  dx = -1;

    const px = cx + dx * (CELL / 2) * drop.progress;
    const py = cy + dy * (CELL / 2) * drop.progress;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, drop.size * 0.5, drop.size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    i++;
  }
}
