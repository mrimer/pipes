/**
 * Canvas rendering helpers for the chapter map (both the gameplay screen and
 * the campaign editor preview).  All functions are stateless – they receive
 * explicit data parameters and write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, LevelDef, Rotation, AmbientDecoration, AmbientDecorationType } from '../types';
import { TILE_SIZE, LINE_WIDTH, scalePx as _s, drawAmbientDecoration } from '../renderer';
import { PIPE_SHAPES } from '../board';
import {
  SOURCE_COLOR, SOURCE_WATER_COLOR, SINK_COLOR, SINK_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_TRUNK_COLOR,
  CHAMBER_COLOR, CHAMBER_FILL_COLOR,
} from '../colors';
import { renderMinimap } from '../minimap';
import { Tile } from '../tile';

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
  ctx.lineWidth = _s(6);
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
function _drawChapterMapSource(ctx: CanvasRenderingContext2D, x: number, y: number, isFilled: boolean, connections: Set<Direction>, capacity?: number): void {
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
  ctx.lineCap = 'round';
  for (const dir of connections) {
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
function _drawChapterMapSink(ctx: CanvasRenderingContext2D, x: number, y: number, isFilled: boolean, connections: Set<Direction>): void {
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
  ctx.lineCap = 'round';
  for (const dir of connections) {
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
        _drawChapterMapSource(ctx, x, y, isFilled, connections, def.capacity);
      } else if (def.shape === PipeShape.Sink) {
        const connections = def.connections ? new Set(def.connections) : new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
        _drawChapterMapSink(ctx, x, y, isFilled, connections);
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
      ctx.save();
      ctx.strokeStyle = pipeColor;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      for (const dir of t.connections) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        if (dir === Direction.North) ctx.lineTo(cx, y);
        else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
        else if (dir === Direction.East) ctx.lineTo(x + CELL, cy);
        else if (dir === Direction.West) ctx.lineTo(x, cy);
        ctx.stroke();
      }
      // Center junction dot
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
  source: { x: number; y: number; isFilled: boolean } | null;
  sinks:  Array<{ x: number; y: number; isFilled: boolean }>;
} {
  const CELL = TILE_SIZE;
  let source: { x: number; y: number; isFilled: boolean } | null = null;
  const sinks: Array<{ x: number; y: number; isFilled: boolean }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c];
      if (!def) continue;
      const isFilled = filledKeys.has(`${r},${c}`);
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;
      if (def.shape === PipeShape.Source) source = { x: cx, y: cy, isFilled };
      else if (def.shape === PipeShape.Sink) sinks.push({ x: cx, y: cy, isFilled });
    }
  }
  return { source, sinks };
}
