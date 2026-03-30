/**
 * Canvas rendering helpers for the chapter map (both the gameplay screen and
 * the campaign editor preview).  All functions are stateless – they receive
 * explicit data parameters and write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, LevelDef, Rotation } from '../types';
import { TILE_SIZE, scalePx as _s } from '../renderer';
import { PIPE_SHAPES } from '../board';
import { SOURCE_COLOR, SINK_COLOR } from '../colors';
import { renderMinimap } from '../minimap';
import { Tile } from '../tile';

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
): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;

  // Compute background color
  const isChallenge = levelDef?.challenge ?? false;
  const allStars = totalStars > 0 && starsCollected >= totalStars;
  let bgColor: string;
  if (allStars) bgColor = '#7a6000';         // gold
  else if (isCompleted) bgColor = '#2a4a3a'; // white-ish green tint
  else if (isChallenge) bgColor = '#5a1010'; // red tint
  else bgColor = '#1e2a4e';                  // default dark blue

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, CELL, CELL);

  // Border: colored based on state
  ctx.strokeStyle = allStars ? '#f0c040' : isCompleted ? '#7ed321' : isChallenge ? '#e74c3c' : '#4a90d9';
  ctx.lineWidth = allStars || isCompleted || isChallenge ? _s(2) : 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);

  // Label row height (top section for L-N text)
  const labelH = _s(16);
  const contentY = y + labelH;
  const contentH = CELL - labelH;

  // "L-N" text at top-left
  ctx.save();
  ctx.font = `bold ${_s(10)}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  ctx.fillText(`L-${levelNum}`, x + _s(3), y + _s(2));
  ctx.restore();

  // Skull icon at top-right if challenge
  if (isChallenge) {
    ctx.save();
    ctx.font = `${_s(11)}px Arial`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    ctx.fillText('💀', x + CELL - _s(2), y + _s(2));
    ctx.restore();
  }

  // Connection lines on tile edges (drawn before minimap so minimap covers the center)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = _s(3);
  ctx.lineCap = 'round';
  const cy2 = y + CELL / 2;
  for (const dir of connections) {
    ctx.beginPath();
    ctx.moveTo(cx, cy2);
    if (dir === Direction.North) ctx.lineTo(cx, y);
    else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
    else if (dir === Direction.East) ctx.lineTo(x + CELL, cy2);
    else if (dir === Direction.West) ctx.lineTo(x, cy2);
    ctx.stroke();
  }
  ctx.restore();

  // Minimap (centered in the area below the label)
  if (levelDef) {
    try {
      const minimap = renderMinimap(levelDef);
      const maxW = CELL - _s(6);
      const maxH = contentH - _s(6);
      const scaleX = maxW / minimap.width;
      const scaleY = maxH / minimap.height;
      const scale = Math.min(scaleX, scaleY, 1);
      const mw = Math.round(minimap.width * scale);
      const mh = Math.round(minimap.height * scale);
      const mx = x + Math.round((CELL - mw) / 2);
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

/** Draw source or sink tile at (x, y) with connection lines for the chapter map display. */
function _drawChapterMapSourceSink(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: TileDef,
): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const isSource = def.shape === PipeShape.Source;

  ctx.fillStyle = isSource ? SOURCE_COLOR : SINK_COLOR;
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${_s(10)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isSource ? 'SRC' : 'SNK', cx, cy);
  ctx.restore();

  // Connection lines
  const conns = def.connections
    ? new Set(def.connections)
    : new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = _s(3);
  ctx.lineCap = 'round';
  for (const dir of conns) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (dir === Direction.North) ctx.lineTo(cx, y);
    else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
    else if (dir === Direction.East) ctx.lineTo(x + CELL, cy);
    else if (dir === Direction.West) ctx.lineTo(x, cy);
    ctx.stroke();
  }
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
        drawLevelChamberTile(ctx, x, y, levelDef, levelIdx + 1, connections, isCompleted, stars, totalStars);

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
      } else {
        // Source / Sink or other non-pipe tile
        _drawChapterMapSourceSink(ctx, x, y, def);
        // Water-fill overlay
        if (isFilled && def.shape !== PipeShape.Source) {
          ctx.save();
          ctx.fillStyle = 'rgba(74,160,255,0.18)';
          ctx.fillRect(x, y, CELL, CELL);
          ctx.restore();
        }
      }
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Pass 3: pipe tiles with connection lines and water fill overlay
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

      // Connection lines from center to open edges
      const rot = (def.rotation ?? 0) as Rotation;
      const t = new Tile(def.shape, rot, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
      const pipeColor = isFilled ? '#4aa0ff' : '#3a506a';
      ctx.save();
      ctx.strokeStyle = pipeColor;
      ctx.lineWidth = _s(4);
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
      ctx.arc(cx, cy, _s(3), 0, Math.PI * 2);
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
