/**
 * Canvas rendering helpers for the chapter map (both the gameplay screen and
 * the campaign editor preview).  All functions are stateless – they receive
 * explicit data parameters and write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, LevelDef, AmbientDecoration, AmbientDecorationType } from '../types';
import { TILE_SIZE, LINE_WIDTH, scalePx as _s, drawAmbientDecoration, drawGranite, drawTree } from '../renderer';
import { PIPE_SHAPES, NEIGHBOUR_DELTA } from '../board';
import { oppositeDirection } from '../tile';
import {
  SOURCE_COLOR, SOURCE_WATER_COLOR, SINK_COLOR, SINK_WATER_COLOR,
  CHAMBER_FILL_COLOR,
  WATER_COLOR, PIPE_COLOR, FOCUS_COLOR, LOW_WATER_COLOR,
  CHAPTER_MAP_TILE_BG, CHAPTER_MAP_EMPTY_BG,
  CHAPTER_MAP_FILLED_CHAMBER_BG,
} from '../colors';
import { tileDefConnections } from '../chapterMapUtils';
import { renderMinimap } from '../minimap';
import { FlowDrop, drawFlowDrop } from './waterParticles';

// ─── Butt-end helpers ─────────────────────────────────────────────────────────

/**
 * Compute which arm directions of the tile at (r, c) should use a flat (butt)
 * end cap.  An arm gets a butt end when the adjacent cell is non-empty AND the
 * neighbor has a connection pointing back (so the arms visually join flush at the
 * tile boundary).  Arms pointing into empty cells or at pipe tiles without a
 * reciprocal arm keep their round nubs.
 */
export function computeChapterButtEndDirs(
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
    const neighborConns = tileDefConnections(neighbor);
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
 * (completion, star collection, water scored) when rendering the chapter map grid.
 */
export interface LevelProgressMap {
  completedLevels: ReadonlySet<number>;
  levelStars: Readonly<Record<number, number>>;
  /** Maximum water scored per level id (from persistence). Optional. */
  levelWater?: Readonly<Record<number, number>>;
}

// ─── Level chamber tile ────────────────────────────────────────────────────────

/** Draw a level-chamber tile in the editor/chapter-map canvas at pixel (x, y).
 *
 * Renders:
 *  • Background: red (challenge), gold (all stars obtained), white (completed),
 *    or the default dark-blue.
 *  • Level number at top-left (white, or gold when all stars collected), followed
 *    by a star icon (⭐/⭐×N for collected stars, ☆ when stars remain uncollected).
 *  • Skull icon 💀 at top-right when the level is a challenge level.
 *  • The level's minimap, centered in the area below the label row.
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
  waterScored?: number,
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
  ctx.fillStyle = CHAPTER_MAP_TILE_BG;
  ctx.fillRect(x, y, CELL, CELL);

  ctx.save();
  ctx.translate(cx, cy);

  // Inner chamber box – use a vivid water-blue when the tile is water-connected;
  // use white when connected but not yet completed, to visually differentiate
  // from a fully completed chamber tile.
  const chamberFill  = isFilled ? CHAPTER_MAP_FILLED_CHAMBER_BG    : CHAMBER_FILL_COLOR;
  const chamberColor = isFilled ? (isCompleted ? WATER_COLOR : '#ffffff') : PIPE_COLOR;
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

  // Label row height (for the level number text inside the chamber box)
  const labelH = _s(16);
  // Chamber box interior top-left in absolute coordinates
  const boxTop = cy - bh;
  const boxLeft = cx - bw;
  const boxRight = cx + bw;
  // Content area below the label row, clipped to the chamber box interior
  const contentY = boxTop + labelH;
  const contentH = bh * 2 - labelH;

  // Level number, optional star icon, optional water score, and optional skull icon in the label row.
  const showWater = isCompleted && waterScored !== undefined && waterScored > 0;
  const labelColor = allStars ? FOCUS_COLOR : isChallenge ? LOW_WATER_COLOR : '#ddd';

  // Star display: empty star takes priority; only show filled star when empty star is not shown.
  const showHollowStar = isCompleted && totalStars > 0 && starsCollected < totalStars;
  const showFilledStar = starsCollected > 0 && !showHollowStar;

  // Level number text (no "L-" prefix)
  const numText = `${levelNum}`;

  // Determine label and water font sizes.
  // Start with the larger default sizes and reduce only when necessary to fit all elements in the box.
  let labelFontSize = _s(10);
  let waterFontSize = _s(8);
  if (showWater || isChallenge) {
    ctx.font = `bold ${labelFontSize}px Arial`;
    const numW = ctx.measureText(numText).width;
    let leftW = numW;
    if (showFilledStar || showHollowStar) {
      ctx.font = `bold ${_s(9)}px Arial`;
      const starText = showHollowStar ? '☆' : (starsCollected > 1 ? `⭐×${starsCollected}` : '⭐');
      leftW += _s(1) + ctx.measureText(starText).width;
    }
    let fits = true;
    if (isChallenge && showWater) {
      ctx.font = `${waterFontSize}px Arial`;
      const halfWaterW = ctx.measureText(`💧${waterScored}`).width / 2;
      ctx.font = `${labelFontSize}px Arial`;
      const skullW = ctx.measureText('💀').width;
      fits = leftW <= bw - _s(2) - halfWaterW && halfWaterW + skullW <= bw - _s(2);
    } else if (isChallenge) {
      ctx.font = `${labelFontSize}px Arial`;
      const skullW = ctx.measureText('💀').width;
      fits = leftW + skullW <= bw * 2 - _s(6);
    } else if (showWater) {
      ctx.font = `${waterFontSize}px Arial`;
      const waterW = ctx.measureText(`💧${waterScored}`).width;
      fits = leftW + waterW <= bw * 2 - _s(6);
    }
    if (!fits) {
      labelFontSize = _s(8);
      waterFontSize = _s(7);
    }
  }

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;

  // Level number at top-left
  ctx.font = `bold ${labelFontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.fillStyle = labelColor;
  ctx.fillText(numText, boxLeft + _s(2), boxTop + _s(2));

  // Star icon inline after the level number
  if (showFilledStar || showHollowStar) {
    const numWidth = ctx.measureText(numText).width;
    ctx.font = `bold ${_s(9)}px Arial`;
    if (showHollowStar) {
      ctx.fillStyle = '#ddd';
      ctx.fillText('☆', boxLeft + _s(2) + numWidth + _s(1), boxTop + _s(2));
    } else {
      ctx.fillStyle = FOCUS_COLOR;
      const starText = starsCollected > 1 ? `⭐×${starsCollected}` : '⭐';
      ctx.fillText(starText, boxLeft + _s(2) + numWidth + _s(1), boxTop + _s(2));
    }
  }

  // Water score "💧N" – center when skull present, right-aligned otherwise
  if (showWater) {
    ctx.font = `${waterFontSize}px Arial`;
    ctx.fillStyle = '#7ec8e3';
    if (isChallenge) {
      ctx.textAlign = 'center';
      ctx.fillText(`💧${waterScored}`, cx, boxTop + _s(2));
    } else {
      ctx.textAlign = 'right';
      ctx.fillText(`💧${waterScored}`, boxRight - _s(2), boxTop + _s(2));
    }
  }

  // Skull icon at top-right for challenge levels
  if (isChallenge) {
    ctx.font = `${labelFontSize}px Arial`;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText('💀', boxRight - _s(2), boxTop + _s(2));
  }

  ctx.restore();

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

/** Draw a Source or Sink tile: colored circle + radiating arms to connected edges. */
function _drawChapterMapEndpoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  connections: Set<Direction>,
  centerText?: string,
  centerTextColor?: string,
  buttEndDirs?: Set<Direction>,
): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;

  ctx.fillStyle = CHAPTER_MAP_TILE_BG;
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
  if (centerText !== undefined) {
    ctx.fillStyle = centerTextColor ?? '#fff';
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerText, 0, 0);
  }
  ctx.restore();
}

/** Draw Source tile: shows the number of completed chapter levels in the center. */
function _drawChapterMapSource(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFilled: boolean,
  connections: Set<Direction>,
  completedLevelCount: number,
  buttEndDirs?: Set<Direction>,
): void {
  _drawChapterMapEndpoint(
    ctx, x, y,
    isFilled ? SOURCE_WATER_COLOR : SOURCE_COLOR,
    connections,
    String(completedLevelCount),
    undefined,
    buttEndDirs,
  );
}

/** Draw Sink tile: shows remaining completion value, or a star when complete and connected. */
function _drawChapterMapSink(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isFilled: boolean,
  connections: Set<Direction>,
  remaining: number,
  buttEndDirs?: Set<Direction>,
): void {
  const color = isFilled ? SINK_WATER_COLOR : SINK_COLOR;
  if (remaining === 0 && isFilled) {
    // Star icon indicates the chapter can be completed by clicking the sink
    _drawChapterMapEndpoint(ctx, x, y, color, connections, '★', '#f0c040', buttEndDirs);
  } else if (remaining === 0) {
    // Not yet connected but requirement already met: show "0"
    _drawChapterMapEndpoint(ctx, x, y, color, connections, '0', undefined, buttEndDirs);
  } else {
    _drawChapterMapEndpoint(ctx, x, y, color, connections, String(remaining), undefined, buttEndDirs);
  }
}

/** Draw Granite tile like in-game. */
function _drawChapterMapGranite(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  ctx.fillStyle = CHAPTER_MAP_EMPTY_BG;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  drawGranite(ctx, CELL / 2);
  ctx.restore();
}

/** Draw Tree tile like in-game. */
function _drawChapterMapTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  ctx.fillStyle = CHAPTER_MAP_EMPTY_BG;
  ctx.fillRect(x, y, CELL, CELL);
  ctx.save();
  ctx.translate(x + CELL / 2, y + CELL / 2);
  drawTree(ctx, CELL / 2);
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
  jitterCell?: { row: number; col: number; dx: number; dy: number },
): void {
  const CELL = TILE_SIZE;
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);

  // Count how many of this chapter's levels the player has completed
  const completedLevelCount = levelDefs.filter(l => progress.completedLevels.has(l.id)).length;

  // Grid lines – drawn first so they are beneath all tile objects
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

  // Pass 1: background cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const def = grid[r]?.[c] ?? null;
      if (def !== null) continue;
      const x = c * CELL;
      const y = r * CELL;
      ctx.fillStyle = CHAPTER_MAP_EMPTY_BG;
      ctx.fillRect(x, y, CELL, CELL);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = CHAPTER_MAP_TILE_BG;
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
        const waterScored = levelId !== undefined ? (progress.levelWater?.[levelId] ?? 0) : 0;
        const connections = tileDefConnections(def);
        const isJittered = jitterCell?.row === r && jitterCell?.col === c;
        if (isJittered) {
          ctx.save();
          ctx.translate(jitterCell!.dx, jitterCell!.dy);
        }
        drawLevelChamberTile(ctx, x, y, levelDef, levelIdx + 1, connections, isCompleted, stars, totalStars, isFilled, waterScored || undefined);
        if (isJittered) ctx.restore();
      } else if (def.shape === PipeShape.Source) {
        const connections = tileDefConnections(def);
        const buttEndDirs = computeChapterButtEndDirs(grid, rows, cols, r, c, connections);
        _drawChapterMapSource(ctx, x, y, isFilled, connections, completedLevelCount, buttEndDirs);
      } else if (def.shape === PipeShape.Sink) {
        const connections = tileDefConnections(def);
        const buttEndDirs = computeChapterButtEndDirs(grid, rows, cols, r, c, connections);
        const remaining = Math.max(0, (def.completion ?? 0) - completedLevelCount);
        _drawChapterMapSink(ctx, x, y, isFilled, connections, remaining, buttEndDirs);
      } else if (def.shape === PipeShape.Granite) {
        _drawChapterMapGranite(ctx, x, y);
      } else if (def.shape === PipeShape.Tree) {
        _drawChapterMapTree(ctx, x, y);
      }
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
      ctx.fillStyle = CHAPTER_MAP_TILE_BG;
      ctx.fillRect(x, y, CELL, CELL);

      // Connection lines from center to open edges – same colors as the level screen
      const tileConns = tileDefConnections(def);
      const pipeColor = isFilled ? WATER_COLOR : PIPE_COLOR;
      const buttEndDirs = computeChapterButtEndDirs(grid, rows, cols, r, c, tileConns);
      ctx.save();
      ctx.strokeStyle = pipeColor;
      ctx.lineWidth = LINE_WIDTH;
      for (const dir of tileConns) {
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
    }
  }

  // Hover highlight – only on level chamber tiles
  if (hoverPos) {
    const { row, col } = hoverPos;
    const hoverDef = grid[row]?.[col] ?? null;
    if (hoverDef?.shape === PipeShape.Chamber && hoverDef.chamberContent === 'level') {
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
}

// ─── Edge completion flowers ───────────────────────────────────────────────────

/** Bright petal colors for edge flowers shown on chapter completion. */
const EDGE_FLOWER_PETAL_COLORS = [
  'rgba(220,140,190,1)',   // bright rose
  'rgba(210,190,100,1)',   // bright gold
  'rgba(170,140,240,1)',   // bright lavender
  'rgba(255,255,255,1)',   // white
  'rgba(100,170,255,1)',   // cornflower blue
  'rgba(255,140,60,1)',    // orange
  'rgba(255,100,120,1)',   // coral red
  'rgba(120,220,160,1)',   // mint green
] as const;

/** Bright center color for edge completion flowers. */
const EDGE_FLOWER_CENTER_COLOR = 'rgba(255,230,120,1)';

/**
 * Draw a completion-edge flower centered at canvas coordinates (x, y).
 * These are twice as large and brighter than the empty-tile decor flowers.
 *
 * @param ctx         Canvas 2D context (no prior transforms expected).
 * @param x           Horizontal center in canvas pixels.
 * @param y           Vertical center in canvas pixels.
 * @param variant     Color variant 0–7.
 * @param scale       Scale factor 0–1 (grow-in animation).
 * @param alpha       Opacity 0–1 (fade-out animation).
 * @param swayAngle   Current sway rotation offset in radians (shared across all flowers).
 * @param baseRotation Static per-flower rotation offset in radians.
 */
export function drawEdgeFlower(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  variant: number,
  scale: number,
  alpha: number,
  swayAngle: number,
  baseRotation: number,
): void {
  if (alpha <= 0 || scale <= 0) return;
  const petalColor = EDGE_FLOWER_PETAL_COLORS[variant % EDGE_FLOWER_PETAL_COLORS.length];
  const petals = 5;
  const petalDist = _s(9);    // 2× the decor flower (4.5)
  const petalR    = _s(5.6);  // 2× the decor flower (2.8)
  const centerR   = _s(4.4);  // 2× the decor flower (2.2)
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(baseRotation + swayAngle);
  ctx.scale(scale, scale);
  ctx.fillStyle = petalColor;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * petalDist, Math.sin(angle) * petalDist, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, centerR, 0, Math.PI * 2);
  ctx.fillStyle = EDGE_FLOWER_CENTER_COLOR;
  ctx.fill();
  ctx.restore();
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
 * toward the sink.  Same shape as {@link FlowDrop} – re-exported under this
 * name for callers that deal only with the chapter map.
 */
export type ChapterMapFlowDrop = FlowDrop;

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
  const conns = tileDefConnections(def);
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
    const nConns = tileDefConnections(nDef);
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
  maxDrops: number,
): void {
  if (drops.length >= maxDrops) return;
  const dirs = _chapterFlowForwardDirs(grid, rows, cols, filledKeys, sourceRow, sourceCol, null);
  if (dirs.length === 0) return;
  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  drops.push({
    row: sourceRow,
    col: sourceCol,
    progress: 0,
    speed: 0.035 + Math.random() * 0.025,
    direction: dir,
    fromDir: null,
    size: _s(6) + Math.random() * _s(4),
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

    // Render the drop at its current interpolated position using the shared helper
    drawFlowDrop(ctx, drop, color);

    i++;
  }
}
