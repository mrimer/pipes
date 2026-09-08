/**
 * Canvas rendering helpers for the Campaign Editor's level editor canvas.
 * All functions are stateless – they receive explicit data parameters and
 * write only to the supplied CanvasRenderingContext2D.
 */

import type { TileDef, LevelDef, Rotation, LevelStyle, ChamberContent } from '../types';
import { PipeShape, Direction } from '../types';
import type { SeaNeighbors} from '../renderer';
import { TILE_SIZE, LINE_WIDTH, drawSpinArrow, scalePx as _s, drawSea, computeSeaNeighbors, seaFillColor, drawOneWayArrow, drawCementLabel, drawTree, drawTree2, drawTree3, drawTree4 } from '../renderer';
import { Tile, rotateDirection } from '../tile';
import { EDITOR_COLORS, chamberColor } from './types';
import { PIPE_SHAPES, SPIN_PIPE_SHAPES, LEAKY_PIPE_SHAPES, SPIN_CEMENT_SHAPES, isEmptyFloor } from '../board';
import { COOLER_COLOR, VACUUM_COLOR, SOURCE_COLOR, SINK_COLOR, CEMENT_COLOR, CEMENT_FILL_COLOR, ONE_WAY_BG_COLOR,
  WATER_COLOR, PIPE_COLOR, FIXED_PIPE_BODY_COLOR, FIXED_PIPE_WATER_COLOR, GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR, LEAKY_PIPE_COLOR, LEAKY_PIPE_WATER_COLOR } from '../colors';
import type { LevelProgressMap} from '../visuals/chapterMap';
import { drawLevelChamberTile, computeChapterButtEndDirs, type ViewBounds } from '../visuals/chapterMap';
import { tileDefConnections } from '../mapUtils';

export type { LevelProgressMap };

// ─── Overlay types ─────────────────────────────────────────────────────────────

/**
 * An overlay drawn on top of the grid at a specific cell.
 * Used for placement preview (transparent tile at hover) or erase indicator.
 */
export interface HoverOverlay {
  pos: { row: number; col: number };
  /** Tile to draw at pos. null = erase indicator (red overlay). */
  def: TileDef | null;
  /** Drawing opacity 0..1 (e.g. 0.55 for placement preview, 1.0 for erase). */
  alpha: number;
}

/**
 * Visual state for a tile being dragged across the grid.
 * The tile is rendered at toPos and the cell at fromPos is rendered as empty.
 */
export interface DragState {
  fromPos: { row: number; col: number };
  toPos: { row: number; col: number };
  tile: TileDef;
}

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Render the full editor canvas.
 *
 * @param ctx           2D context to draw on.
 * @param grid          The current tile grid (null = player-fillable empty cell).
 * @param rows          Number of grid rows.
 * @param cols          Number of grid columns.
 * @param overlay       Optional tile preview or erase indicator drawn at the hover cell.
 * @param drag          Optional drag state: renders the tile at toPos and hides it at fromPos.
 * @param linkedTilePos Optional position of the tile currently linked for live param editing.
 * @param levelDefs     Optional list of level definitions for rendering level-chamber tiles.
 * @param levelProgress Optional progress data for level-chamber display (completed, stars).
 * @param filledKeys    Optional set of "row,col" keys water-filled from source (for chapter map editor).
 * @param chapterDefs   Optional list of chapter pseudo-LevelDefs for rendering chapter-chamber minimap tiles
 *                      (campaign map editor only; indexed by chapterIdx).
 */
export function renderEditorCanvas(
  ctx: CanvasRenderingContext2D,
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  overlay?: HoverOverlay | null,
  drag?: DragState | null,
  linkedTilePos?: { row: number; col: number } | null,
  levelDefs?: readonly LevelDef[],
  levelProgress?: LevelProgressMap,
  filledKeys?: ReadonlySet<string>,
  style?: LevelStyle,
  chapterDefs?: readonly LevelDef[],
  viewBounds?: ViewBounds,
): void {
  const CELL = TILE_SIZE;
  const rMin = viewBounds?.rMin ?? 0;
  const rMax = viewBounds ? Math.min(rows - 1, viewBounds.rMax) : rows - 1;
  const cMin = viewBounds?.cMin ?? 0;
  const cMax = viewBounds ? Math.min(cols - 1, viewBounds.cMax) : cols - 1;
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);

  // Grid lines drawn first so they appear underneath all tile content
  ctx.strokeStyle = 'rgba(74,144,217,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let r = rMin; r <= rMax + 1; r++) {
    ctx.moveTo(cMin * CELL, r * CELL);
    ctx.lineTo((cMax + 1) * CELL, r * CELL);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let c = cMin; c <= cMax + 1; c++) {
    ctx.moveTo(c * CELL, rMin * CELL);
    ctx.lineTo(c * CELL, (rMax + 1) * CELL);
  }
  ctx.stroke();

  // Pass 1: Draw all open (player-fillable) spaces first so that pipe rounded
  // caps drawn in pass 2 are never covered by a neighboring empty cell's fill.
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  const dragRow = drag?.fromPos.row ?? -1;
  const dragCol = drag?.fromPos.col ?? -1;
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const isDragSource = dragRow === r && dragCol === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      const isEmptyCell = def === null || isEmptyFloor(def.shape);
      if (!isEmptyCell) continue;
      const x = c * CELL;
      const y = r * CELL;
      // Empty (player-fillable) – light grid cell
      ctx.fillStyle = '#1a2840';
      ctx.fillRect(x, y, CELL, CELL);
      // Dashed border
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      if (def === null) {
        // Subtle dot for level editor
        ctx.fillStyle = '#2a3a5e';
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, _s(3), 0, Math.PI * 2);
        ctx.fill();
      } else {
        // EmptyFall, EmptyDark, EmptyWinter, or EmptySpring: show dot + label
        ctx.fillStyle = '#2a3a5e';
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, _s(3), 0, Math.PI * 2);
        ctx.fill();
        const label = def.shape === PipeShape.EmptyFall ? 'Fall'
                    : def.shape === PipeShape.EmptyWinter ? 'Winter'
                    : def.shape === PipeShape.EmptySpring ? 'Spring'
                    : 'Dark';
        ctx.save();
        ctx.font = `bold ${_s(8)}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = def.shape === PipeShape.EmptyFall ? '#c4926a'
                      : def.shape === PipeShape.EmptyWinter ? '#8ab0cc'
                      : def.shape === PipeShape.EmptySpring ? '#7ab060'
                      : '#8888aa';
        ctx.fillText(label, x + _s(3), y + _s(3));
        ctx.restore();
      }
    }
  }
  ctx.setLineDash([]);

  // Pass 2: Draw all non-pipe fixed tiles on top of the empty-space backgrounds.
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const isDragSource = dragRow === r && dragCol === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      if (def === null || PIPE_SHAPES.has(def.shape) || isEmptyFloor(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;

      // Sea tiles: draw in-game style with neighbor-aware borders + "SEA" label
      if (def.shape === PipeShape.Sea) {
        const neighbors = computeSeaNeighbors((dr, dc) => {
          const nr = r + dr, nc = c + dc;
          return nr < 0 || nr >= rows || nc < 0 || nc >= cols || grid[nr]?.[nc]?.shape === PipeShape.Sea;
        });
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;
        ctx.save();
        ctx.translate(cx, cy);
        drawSea(ctx, CELL / 2, neighbors, seaFillColor(style));
        ctx.restore();
        ctx.save();
        ctx.font = `bold ${_s(11)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        strokeFillText(ctx, 'SEA', cx, cy);
        ctx.restore();
      } else {
        const isFilled = filledKeys?.has(`${r},${c}`) ?? false;
        _drawEditorTileWithLevel(ctx, x, y, def, levelDefs, levelProgress, isFilled, filledKeys !== undefined, style, chapterDefs);
      }
      // Solid border for fixed tiles
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Pass 3: Draw all pipe tiles last so their rounded caps appear on top of
  // every other tile type (e.g. a pipe adjacent to a Chamber won't be clipped
  // by the Chamber's background fill).
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const isDragSource = dragRow === r && dragCol === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      if (def === null || !PIPE_SHAPES.has(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;
      if (filledKeys !== undefined) {
        // Chapter map editor context: compute butt-end dirs and draw with per-arm caps
        const tileConns = tileDefConnections(def);
        const buttEndDirs = computeChapterButtEndDirs(grid, rows, cols, r, c, tileConns);
        const isFilled = filledKeys.has(`${r},${c}`);
        _drawChapterEditorPipeTile(ctx, x, y, def, tileConns, buttEndDirs, isFilled);
      } else {
        const tileConns = tileDefConnections(def);
        const buttEndDirs = computeChapterButtEndDirs(grid, rows, cols, r, c, tileConns);
        drawEditorTile(ctx, x, y, def, false, undefined, buttEndDirs);
      }
      // Solid border for fixed tiles
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Drag tile drawn at destination (opaque with a slight glow border)
  if (drag) {
    const { row, col } = drag.toPos;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawEditorTile(ctx, x, y, drag.tile, filledKeys !== undefined);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
      ctx.restore();
    }
  }

  // Placement preview / erase indicator overlay
  if (overlay) {
    const { row, col } = overlay.pos;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.save();
      if (overlay.def === null) {
        // Erase indicator: red overlay with X
        ctx.globalAlpha = overlay.alpha;
        ctx.fillStyle = 'rgba(255,64,64,0.45)';
        ctx.fillRect(x, y, CELL, CELL);
        ctx.strokeStyle = '#ff4040';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
        ctx.strokeStyle = 'rgba(255,64,64,0.8)';
        ctx.lineWidth = _s(3);
        ctx.beginPath();
        ctx.moveTo(x + _s(8), y + _s(8));
        ctx.lineTo(x + CELL - _s(8), y + CELL - _s(8));
        ctx.moveTo(x + CELL - _s(8), y + _s(8));
        ctx.lineTo(x + _s(8), y + CELL - _s(8));
        ctx.stroke();
      } else {
        ctx.globalAlpha = overlay.alpha;
        drawEditorTile(ctx, x, y, overlay.def, filledKeys !== undefined, style);
        ctx.globalAlpha = Math.min(1, overlay.alpha + 0.3);
        ctx.strokeStyle = '#f0c040';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
      }
      ctx.restore();
    }
  }

  // Linked-tile selection highlight (dashed yellow border)
  if (linkedTilePos) {
    const { row, col } = linkedTilePos;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.save();
      ctx.strokeStyle = '#ffe500';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      ctx.restore();
    }
  }
}

// ─── Tile drawing ──────────────────────────────────────────────────────────────

/** Render a single tile at (x,y), using levelDefs for level-chamber tiles. */
function _drawEditorTileWithLevel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: TileDef,
  levelDefs?: readonly LevelDef[],
  levelProgress?: LevelProgressMap,
  isFilled = false,
  isChapterMap = false,
  style?: LevelStyle,
  chapterDefs?: readonly LevelDef[],
): void {
  if (def.shape === PipeShape.Chamber && def.chamberContent === 'level') {
    const levelIdx = def.levelIdx ?? 0;
    const levelDef = levelDefs?.[levelIdx];
    const levelId = levelDef?.id;
    const isCompleted = levelId !== undefined && (levelProgress?.completedLevels.has(levelId) ?? false);
    const starsCollected = levelId !== undefined ? (levelProgress?.levelStars[levelId] ?? 0) : 0;
    const totalStars = levelDef?.starCount ?? 0;
    const connections = def.connections ? new Set(def.connections) : new Set([
      Direction.North, Direction.East, Direction.South, Direction.West,
    ]);
    drawLevelChamberTile(ctx, x, y, levelDef, levelIdx + 1, connections, isCompleted, starsCollected, totalStars, isFilled);
    return;
  }
  // Chapter chambers (campaign map editor): render with a minimap of the chapter's own map grid.
  if (def.shape === PipeShape.Chamber && def.chamberContent === 'chapter') {
    const chapterIdx = def.chapterIdx ?? 0;
    const chapterDef = chapterDefs?.[chapterIdx];
    const connections = def.connections ? new Set(def.connections) : new Set([
      Direction.North, Direction.East, Direction.South, Direction.West,
    ]);
    drawLevelChamberTile(ctx, x, y, chapterDef, chapterIdx + 1, connections, false, 0, 0, isFilled);
    return;
  }
  drawEditorTile(ctx, x, y, def, isChapterMap, style);
}

/** Draw the OneWay editor tile overlay (arrow + label + border) at canvas pixel (x, y). */
function _drawOneWayEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number): void {
  const CELL = TILE_SIZE;
  const rot = rotation as Rotation;
  const dirs = [Direction.North, Direction.East, Direction.South, Direction.West];
  const dir = dirs[rot / 90] ?? Direction.North;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  drawOneWayArrow(ctx, x, y, dir);
  // Label
  ctx.save();
  ctx.font = `bold ${_s(9)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  strokeFillText(ctx, 'ONE-WAY', cx, cy + CELL * 0.325);
  ctx.restore();
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

/**
 * Draw the cement tile in the editor canvas at (x, y).
 * Renders the cement fill, wavy-line texture, 'CEMENT' label, and drying-time counter.
 * @param dryingTime - Current drying time value (T=N label, or T=0 shows '0').
 */
function _drawCementEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, dryingTime: number): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
  ctx.save();
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const sq2 = Math.SQRT1_2;
  const len = CELL * 0.5;
  for (let i = -1; i <= 1; i++) {
    const px = i * _s(8) * sq2;
    const py = i * _s(8) * sq2;
    const lx = cx + px; const ly = cy + py;
    ctx.beginPath();
    ctx.moveTo(lx - len * sq2, ly + len * sq2);
    ctx.quadraticCurveTo(lx + _s(2) * sq2, ly + _s(2) * sq2, lx + len * sq2, ly - len * sq2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.font = `bold ${_s(10)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  strokeFillText(ctx, 'CEMENT', cx, cy - _s(7));
  ctx.font = `${_s(9)}px Arial`;
  strokeFillText(ctx, `T=${dryingTime}`, cx, cy + _s(6));
  ctx.restore();
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

/**
 * Draw the semi-transparent cement wavy-line overlay and drying-time label on top of a
 * spin-cement tile that has already been drawn at (x, y).
 * @param dryingTime - Current drying time value; 0 shows 'X'.
 */
function _drawSpinCementOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, dryingTime: number): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.save();
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.5;
  const sq2 = Math.SQRT1_2;
  const len = CELL * 0.5;
  for (let i = -1; i <= 1; i++) {
    const px = i * _s(8) * sq2;
    const py = i * _s(8) * sq2;
    const lx = cx + px; const ly = cy + py;
    ctx.beginPath();
    ctx.moveTo(lx - len * sq2, ly + len * sq2);
    ctx.quadraticCurveTo(lx + _s(2) * sq2, ly + _s(2) * sq2, lx + len * sq2, ly - len * sq2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawCementLabel(ctx, { x, y, dryingTime, isHardened: dryingTime === 0 });
}

/** Draw a single editor tile (from TileDef) at canvas pixel (x, y). */
export function drawEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, def: TileDef, isChapterMap = false, style?: LevelStyle, buttEndDirs?: ReadonlySet<Direction>): void {
  const CELL = TILE_SIZE;
  const { shape } = def;
  const chamberContent = def.chamberContent ?? 'tank';

  if (_tryDrawChamberTile(ctx, x, y, shape, chamberContent, def)) return;
  if (_tryDrawEmptyFloorLabelTile(ctx, x, y, shape)) return;
  if (_tryDrawPlainEmptyTile(ctx, x, y, shape)) return;

  ctx.fillStyle = _resolveEditorTileBgColor(shape, chamberContent, style);
  ctx.fillRect(x, y, CELL, CELL);

  if (_tryDrawOneWayOrCementTile(ctx, x, y, def, shape)) return;

  // Draw the tile as a Tile object using existing drawTile infrastructure
  // We construct a temporary Tile to render it
  const tile = _buildEditorTileFromDef(shape, def);
  drawTileOnEditor(ctx, x, y, tile, def, isChapterMap, style, buttEndDirs);

  // For spin-cement tiles, draw the cement wavy-line overlay and drying-time label on top.
  if (SPIN_CEMENT_SHAPES.has(shape)) {
    _drawSpinCementOverlay(ctx, x, y, def.dryingTime ?? 0);
  }
}

/**
 * Level chambers and chapter chambers (campaign map editor) render identically –
 * delegates to drawLevelChamberTile, using levelIdx+1 or chapterIdx+1 as the
 * display number. Returns whether the tile was handled.
 */
function _tryDrawChamberTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: PipeShape,
  chamberContent: ChamberContent,
  def: TileDef,
): boolean {
  if (shape !== PipeShape.Chamber) return false;
  if (chamberContent !== 'level' && chamberContent !== 'chapter') return false;
  const connections = def.connections ? new Set(def.connections) : new Set([
    Direction.North, Direction.East, Direction.South, Direction.West,
  ]);
  const displayNum = chamberContent === 'level' ? (def.levelIdx ?? 0) + 1 : (def.chapterIdx ?? 0) + 1;
  drawLevelChamberTile(ctx, x, y, undefined, displayNum, connections);
  return true;
}

function _resolveEmptyFloorLabel(shape: PipeShape): string {
  if (shape === PipeShape.EmptyFall) return 'Fall';
  if (shape === PipeShape.EmptyWinter) return 'Winter';
  if (shape === PipeShape.EmptySpring) return 'Spring';
  return 'Dark';
}

function _resolveEmptyFloorLabelColor(shape: PipeShape): string {
  if (shape === PipeShape.EmptyFall) return '#c4926a';
  if (shape === PipeShape.EmptyWinter) return '#8ab0cc';
  if (shape === PipeShape.EmptySpring) return '#7ab060';
  return '#8888aa';
}

/** EmptyFall/EmptyDark/EmptyWinter/EmptySpring: render as empty cell with a label. Returns whether handled. */
function _tryDrawEmptyFloorLabelTile(ctx: CanvasRenderingContext2D, x: number, y: number, shape: PipeShape): boolean {
  if (!isEmptyFloor(shape) || shape === PipeShape.Empty) return false;
  const CELL = TILE_SIZE;
  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
  ctx.setLineDash([]);
  ctx.fillStyle = '#2a3a5e';
  ctx.beginPath();
  ctx.arc(x + CELL / 2, y + CELL / 2, _s(3), 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.font = `bold ${_s(8)}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = _resolveEmptyFloorLabelColor(shape);
  ctx.fillText(_resolveEmptyFloorLabel(shape), x + _s(3), y + _s(3));
  ctx.restore();
  return true;
}

/** PipeShape.Empty: render as empty cell (no label). Returns whether handled. */
function _tryDrawPlainEmptyTile(ctx: CanvasRenderingContext2D, x: number, y: number, shape: PipeShape): boolean {
  if (shape !== PipeShape.Empty) return false;
  const CELL = TILE_SIZE;
  ctx.fillStyle = '#1a2840';
  ctx.fillRect(x, y, CELL, CELL);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
  ctx.setLineDash([]);
  return true;
}

function _isFlatDarkBgShape(shape: PipeShape): boolean {
  return shape === PipeShape.Tree || shape === PipeShape.Tree2 || shape === PipeShape.Tree3 || shape === PipeShape.Tree4;
}

/** Static (non-dynamic) editor tile background colors, or null if this shape needs a dynamic color. */
function _resolveStaticEditorBgColor(shape: PipeShape): string | null {
  if (shape === PipeShape.GoldSpace) return '#b8860b';
  if (shape === PipeShape.OneWay) return ONE_WAY_BG_COLOR;
  if (shape === PipeShape.Cement || SPIN_CEMENT_SHAPES.has(shape)) return CEMENT_FILL_COLOR;
  if (shape === PipeShape.Granite) return '#4a5568';
  if (_isFlatDarkBgShape(shape)) return '#1a2840';
  return null;
}

function _resolveEditorTileBgColor(shape: PipeShape, chamberContent: ChamberContent, style: LevelStyle | undefined): string {
  if (shape === PipeShape.Chamber) return chamberColor(chamberContent);
  const staticColor = _resolveStaticEditorBgColor(shape);
  if (staticColor !== null) return staticColor;
  if (shape === PipeShape.Sea) return seaFillColor(style);
  return EDITOR_COLORS[shape] ?? '#4a90d9';
}

/** Handles OneWay (dark-red bg + direction arrow) and Cement (no Tile construction needed). Returns whether handled. */
function _tryDrawOneWayOrCementTile(ctx: CanvasRenderingContext2D, x: number, y: number, def: TileDef, shape: PipeShape): boolean {
  if (shape === PipeShape.OneWay) {
    _drawOneWayEditorTile(ctx, x, y, def.rotation ?? 0);
    return true;
  }
  if (shape === PipeShape.Cement) {
    _drawCementEditorTile(ctx, x, y, def.dryingTime ?? 0);
    return true;
  }
  return false;
}

function _resolveEditorTileDefaultsA(def: TileDef): { capacity: number; cost: number; itemShape: PipeShape | null; itemCount: number } {
  return {
    capacity: def.capacity ?? 0,
    cost: def.cost ?? 0,
    itemShape: def.itemShape ?? null,
    itemCount: def.itemCount ?? 1,
  };
}

function _resolveEditorTileDefaultsB(def: TileDef): { chamberContent: ChamberContent | null; temperature: number; pressure: number; hardness: number; shatter: number } {
  return {
    chamberContent: def.chamberContent ?? null,
    temperature: def.temperature ?? 0,
    pressure: def.pressure ?? 0,
    hardness: def.hardness ?? 0,
    shatter: def.shatter ?? 0,
  };
}

function _buildEditorTileFromDef(shape: PipeShape, def: TileDef): Tile {
  const rot = (def.rotation ?? 0);
  const customConns = def.connections ? new Set(def.connections) : null;
  const firstConns = (def.firstConnections && def.firstConnections.length > 0) ? new Set(def.firstConnections) : null;
  const a = _resolveEditorTileDefaultsA(def);
  const b = _resolveEditorTileDefaultsB(def);
  return new Tile(
    shape,
    rot,
    true,
    a.capacity,
    a.cost,
    a.itemShape,
    a.itemCount,
    customConns,
    b.chamberContent,
    b.temperature,
    b.pressure,
    b.hardness,
    b.shatter,
    firstConns,
  );
}

/** Chamber content types whose tile label/detail text is rendered 1pt larger than the default. */
const CHAMBER_TYPES_WITH_LARGER_FONT: ReadonlySet<string> = new Set([
  'tank', 'dirt', 'heater', 'pump', 'snow', 'ice', 'star',
]);

/** Distinct short labels for each pipe shape shown in the container item tile text. */
const ITEM_SHAPE_LABEL: Readonly<Record<PipeShape, string>> = {
  [PipeShape.Empty]:             'EMPT',
  [PipeShape.EmptyFall]:         'EFALL',
  [PipeShape.EmptyDark]:         'EDRK',
  [PipeShape.EmptyWinter]:       'EWNT',
  [PipeShape.EmptySpring]:       'ESPR',
  [PipeShape.Straight]:          'STR',
  [PipeShape.Elbow]:             'ELB',
  [PipeShape.Tee]:               'TEE',
  [PipeShape.Cross]:             'CRO',
  [PipeShape.Source]:            'SRC',
  [PipeShape.Sink]:              'SNK',
  [PipeShape.Chamber]:           'CHM',
  [PipeShape.Granite]:           'GRN',
  [PipeShape.Tree]:              'TRE',
  [PipeShape.Tree2]:             'TRE2',
  [PipeShape.Tree3]:             'TRE3',
  [PipeShape.Tree4]:             'TRE4',
  [PipeShape.Sea]:               'SEA',
  [PipeShape.Cement]:            'CMT',
  [PipeShape.OneWay]:            'OWY',
  [PipeShape.GoldSpace]:         'GSP',
  [PipeShape.GoldStraight]:      'GSTR',
  [PipeShape.GoldElbow]:         'GELB',
  [PipeShape.GoldTee]:           'GTEE',
  [PipeShape.GoldCross]:         'GCRO',
  [PipeShape.SpinStraight]:      'SSTR',
  [PipeShape.SpinElbow]:         'SELB',
  [PipeShape.SpinTee]:           'STEE',
  [PipeShape.SpinStraightCement]: 'SCST',
  [PipeShape.SpinElbowCement]:   'SCEL',
  [PipeShape.SpinTeeCement]:     'SCTE',
  [PipeShape.LeakyStraight]:     'LSTR',
  [PipeShape.LeakyElbow]:        'LELB',
  [PipeShape.LeakyTee]:          'LTEE',
  [PipeShape.LeakyCross]:        'LCRO',
};

/** Draw text with a soft dark shadow for better visibility on the editor grid. */
function strokeFillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Offset (as a unit vector) toward each compass direction, used to place per-arm decorations. */
const DIRECTION_OFFSET: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  [Direction.North]: { dx: 0, dy: -1 },
  [Direction.South]: { dx: 0, dy: 1 },
  [Direction.East]:  { dx: 1, dy: 0 },
  [Direction.West]:  { dx: -1, dy: 0 },
};

/** Shapes whose renderer draws by translating to the tile centre and calling a (ctx, radius, style) drawer. */
const TRANSLATE_SHAPE_RENDERERS: Partial<Record<PipeShape, { draw: (ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle) => void; label: string }>> = {
  [PipeShape.Tree]:  { draw: drawTree, label: 'TREE' },
  [PipeShape.Tree2]: { draw: drawTree2, label: 'TREE2' },
  [PipeShape.Tree3]: { draw: drawTree3, label: 'TREE3' },
  [PipeShape.Tree4]: { draw: drawTree4, label: 'TREE4' },
  [PipeShape.Sea]: {
    draw: (ctx, half, style) => {
      // In editor, we don't have neighbor info in drawTileOnEditor; use default (no neighbors)
      const defaultNeighbors: SeaNeighbors = { north: false, east: false, south: false, west: false, nw: false, ne: false, sw: false, se: false };
      drawSea(ctx, half, defaultNeighbors, seaFillColor(style));
    },
    label: 'SEA',
  },
};

/** Renders shape via TRANSLATE_SHAPE_RENDERERS if it has an entry there. Returns whether handled. */
function _tryDrawTranslatedShape(ctx: CanvasRenderingContext2D, shape: PipeShape, x: number, y: number, style?: LevelStyle): boolean {
  const renderer = TRANSLATE_SHAPE_RENDERERS[shape];
  if (!renderer) return false;
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.save();
  ctx.translate(cx, cy);
  renderer.draw(ctx, CELL / 2, style);
  ctx.restore();
  ctx.fillStyle = '#fff';
  strokeFillText(ctx, renderer.label, cx, cy);
  return true;
}

/** Render granite as a textured block. */
function _drawGraniteEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  ctx.fillStyle = '#636e72';
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = '#4a5568';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if ((i + j) % 2 === 0) {
        ctx.fillRect(x + i * (CELL / 3), y + j * (CELL / 3), CELL / 3, CELL / 3);
      }
    }
  }
  ctx.fillStyle = '#fff';
  strokeFillText(ctx, 'GRANITE', x + CELL / 2, y + CELL / 2);
}

function _drawGoldSpaceEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.fillStyle = '#b8860b';
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = '#ffd700';
  strokeFillText(ctx, 'GOLD', cx, cy - _s(7));
  strokeFillText(ctx, 'SPACE', cx, cy + _s(7));
}

function _drawSourceEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, isChapterMap: boolean): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  // Background fill
  ctx.fillStyle = SOURCE_COLOR;
  ctx.fillRect(x, y, CELL, CELL);
  // Source motif: radial gradient circle + outer aperture ring
  ctx.save();
  ctx.translate(cx, cy);
  const half = CELL / 2;
  const circleR = half * 0.35;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, circleR);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, SOURCE_COLOR);
  grad.addColorStop(1, SOURCE_COLOR);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, circleR, 0, Math.PI * 2);
  ctx.fill();
  // Outer aperture ring: semi-transparent white so it shows against the solid bg
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = _s(1.5);
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Text labels overlaid on top
  ctx.fillStyle = '#fff';
  const lines: string[] = ['SOURCE'];
  if (!isChapterMap) {
    lines.push(`cap:${tile.capacity}`);
    // Show temp/pressure params only when non-zero
    if (tile.temperature !== 0) lines.push(`${tile.temperature}°`);
    if (tile.pressure !== 0) lines.push(`${tile.pressure}P`);
  }
  const lineHeight = _s(12);
  const totalH = (lines.length - 1) * lineHeight;
  let lineY = cy - totalH / 2;
  ctx.font = `bold ${_s(12)}px Arial`;
  for (const line of lines) {
    strokeFillText(ctx, line, cx, lineY);
    ctx.font = `${_s(11)}px Arial`;
    lineY += lineHeight;
  }
  // Draw connection lines
  drawConnectionLines(ctx, x, y, tile);
}

/** Whether the sink's completion count should be shown (chapter map editor only, positive value). */
function _hasVisibleSinkCompletion(isChapterMap: boolean, completionVal: number | undefined): completionVal is number {
  return isChapterMap && completionVal !== undefined && completionVal > 0;
}

function _drawSinkEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, def: TileDef | undefined, isChapterMap: boolean): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  // Background fill
  ctx.fillStyle = SINK_COLOR;
  ctx.fillRect(x, y, CELL, CELL);
  // Sink motif: bullseye / drain – concentric rings with solid innermost dot
  ctx.save();
  ctx.translate(cx, cy);
  const half = CELL / 2;
  // Concentric rings: semi-transparent white so they show against the solid bg
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = _s(1.5);
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Text labels overlaid on top
  ctx.fillStyle = '#fff';
  const completionVal = def?.completion;
  if (_hasVisibleSinkCompletion(isChapterMap, completionVal)) {
    ctx.font = `bold ${_s(12)}px Arial`;
    strokeFillText(ctx, 'SINK', cx, cy - _s(6));
    ctx.font = `${_s(10)}px Arial`;
    strokeFillText(ctx, `comp:${completionVal}`, cx, cy + _s(6));
  } else {
    ctx.font = `bold ${_s(12)}px Arial`;
    strokeFillText(ctx, 'SINK', cx, cy);
  }
  drawConnectionLines(ctx, x, y, tile);
}

function _drawSandstoneChamberDetails(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: Tile): void {
  ctx.font = `${_s(9)}px Arial`;
  strokeFillText(ctx, 'SANDSTONE', cx, cy - _s(10));
  ctx.font = `${_s(10)}px Arial`;
  strokeFillText(ctx, `${tile.temperature}° x ${tile.cost}`, cx, cy + _s(2));
  const shatterActive = tile.shatter > tile.hardness;
  strokeFillText(ctx, shatterActive ? `H:${tile.hardness} S:${tile.shatter}` : `H:${tile.hardness}`, cx, cy + _s(13));
}

/** Show regulator stat, operator, and threshold value. */
function _drawRegulatorChamberDetails(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: Tile, def: TileDef | undefined): void {
  const stat = def?.regulatorStat ?? 'water';
  const op   = def?.regulatorOperator ?? '>';
  ctx.font = `bold ${_s(11)}px Arial`;
  strokeFillText(ctx, 'REGULATOR', cx, cy - _s(10));
  ctx.font = `${_s(10)}px Arial`;
  strokeFillText(ctx, stat, cx, cy + _s(1));
  strokeFillText(ctx, `${op} ${tile.cost}`, cx, cy + _s(12));
}

function _resolveChamberDisplayLabel(cc: ChamberContent, isNegHeater: boolean, isNegPump: boolean): string {
  if (isNegHeater) return 'COOLER';
  if (isNegPump) return 'VACUUM';
  if (cc === 'hot_plate') return 'HOT PLATE';
  return cc.toUpperCase();
}

/** Per-chamber-content secondary stat line, keyed by chamberContent. Absent entries show no stat line. */
const CHAMBER_STAT_LINE_RESOLVERS: Partial<Record<ChamberContent, (tile: Tile) => string>> = {
  tank:      (t) => `cap:${t.capacity}`,
  dirt:      (t) => `cost:${t.cost}`,
  heater:    (t) => `${t.temperature >= 0 ? '+' : ''}${t.temperature}°`,
  ice:       (t) => `${t.temperature}° x ${t.cost}`,
  pump:      (t) => `${t.pressure >= 0 ? '+' : ''}${t.pressure}P`,
  snow:      (t) => `${t.temperature}° x ${t.cost}`,
  hot_plate: (t) => `${t.temperature}° x ${t.cost}`,
  item:      (t) => `${t.itemShape !== null && t.itemShape !== undefined ? ITEM_SHAPE_LABEL[t.itemShape] : '?'}×${t.itemCount}`,
};

function _drawGenericChamberDetails(ctx: CanvasRenderingContext2D, cx: number, cy: number, cc: ChamberContent, tile: Tile, isNegHeater: boolean, isNegPump: boolean): void {
  const displayLabel = _resolveChamberDisplayLabel(cc, isNegHeater, isNegPump);
  const needsBigFont = CHAMBER_TYPES_WITH_LARGER_FONT.has(cc);
  ctx.font = needsBigFont ? `bold ${_s(12)}px Arial` : `bold ${_s(11)}px Arial`;
  strokeFillText(ctx, displayLabel, cx, cy - _s(6));
  ctx.font = needsBigFont ? `${_s(11)}px Arial` : `${_s(10)}px Arial`;
  const statLine = CHAMBER_STAT_LINE_RESOLVERS[cc]?.(tile);
  if (statLine !== undefined) strokeFillText(ctx, statLine, cx, cy + _s(8));
}

/**
 * Valve indicator: draw a small green ring with black outline along each
 * first-connection direction, near the tile edge, to mark valve sides.
 */
function _drawChamberValveIndicators(ctx: CanvasRenderingContext2D, cx: number, cy: number, tile: Tile): void {
  if (!tile.firstConnections || tile.firstConnections.size === 0) return;
  const indicatorDist = TILE_SIZE / 2 - _s(7); // distance from tile center to indicator center
  const indicatorR = _s(5);
  for (const dir of tile.firstConnections) {
    const { dx, dy } = DIRECTION_OFFSET[dir];
    const ix = cx + dx * indicatorDist;
    const iy = cy + dy * indicatorDist;
    // Black outline
    ctx.beginPath();
    ctx.arc(ix, iy, indicatorR + _s(1.5), 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
    // Green ring (hollow circle)
    ctx.beginPath();
    ctx.arc(ix, iy, indicatorR, 0, Math.PI * 2);
    ctx.strokeStyle = '#00cc44';
    ctx.lineWidth = _s(2.5);
    ctx.stroke();
  }
}

function _drawChamberEditorTileBody(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, def: TileDef | undefined): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const cc = tile.chamberContent ?? 'tank';
  const isNegHeater = cc === 'heater' && tile.temperature < 0;
  const isNegPump = cc === 'pump' && tile.pressure < 0;
  ctx.fillStyle = isNegHeater ? COOLER_COLOR : isNegPump ? VACUUM_COLOR : chamberColor(cc);
  ctx.fillRect(x, y, CELL, CELL);
  ctx.fillStyle = '#fff';
  if (cc === 'sandstone') {
    _drawSandstoneChamberDetails(ctx, cx, cy, tile);
  } else if (cc === 'regulator') {
    _drawRegulatorChamberDetails(ctx, cx, cy, tile, def);
  } else {
    _drawGenericChamberDetails(ctx, cx, cy, cc, tile, isNegHeater, isNegPump);
  }
  drawConnectionLines(ctx, x, y, tile);
  _drawChamberValveIndicators(ctx, cx, cy, tile);
}

/** Shape groups sharing an arm-line pattern, used by _drawPipeLinesForShape. */
const STRAIGHT_PIPE_SHAPES: ReadonlySet<PipeShape> = new Set([PipeShape.Straight, PipeShape.GoldStraight, PipeShape.SpinStraight, PipeShape.LeakyStraight, PipeShape.SpinStraightCement]);
const ELBOW_PIPE_SHAPES: ReadonlySet<PipeShape> = new Set([PipeShape.Elbow, PipeShape.GoldElbow, PipeShape.SpinElbow, PipeShape.LeakyElbow, PipeShape.SpinElbowCement]);
const TEE_PIPE_SHAPES: ReadonlySet<PipeShape> = new Set([PipeShape.Tee, PipeShape.GoldTee, PipeShape.SpinTee, PipeShape.LeakyTee, PipeShape.SpinTeeCement]);
const CROSS_PIPE_SHAPES: ReadonlySet<PipeShape> = new Set([PipeShape.Cross, PipeShape.GoldCross, PipeShape.LeakyCross]);

/** Draw the arm lines (in local, un-rotated canvas space) for a fixed pipe shape. */
function _drawPipeLinesForShape(ctx: CanvasRenderingContext2D, shape: PipeShape, h: number): void {
  if (STRAIGHT_PIPE_SHAPES.has(shape)) {
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
  } else if (ELBOW_PIPE_SHAPES.has(shape)) {
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
  } else if (TEE_PIPE_SHAPES.has(shape)) {
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
  } else if (CROSS_PIPE_SHAPES.has(shape)) {
    ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
  }
}

/**
 * The canvas is already rotated by tile.rotation; un-rotate absolute
 * directions CCW to the local canvas frame before delegating to the helper.
 */
function _drawRotatedButtEndPipeArms(ctx: CanvasRenderingContext2D, tile: Tile, buttEndDirs: ReadonlySet<Direction>, h: number): void {
  const rotSteps = ((tile.rotation / 90) % 4 + 4) % 4;
  const ccwSteps = (4 - rotSteps) % 4;
  const toLocal = (dir: Direction): Direction => {
    let ld = dir;
    for (let i = 0; i < ccwSteps; i++) ld = rotateDirection(ld);
    return ld;
  };
  _drawButtEndPipeArms(
    ctx,
    new Set([...tile.connections].map(toLocal)),
    new Set([...buttEndDirs].map(toLocal)),
    h,
  );
}

/**
 * Draw rust spots on leaky pipes (two dots along each arm at 1/3 and 2/3).
 * `tile.connections` returns absolute (post-rotation) directions, but the
 * canvas is already rotated. Un-rotate each direction to local frame first,
 * mirroring the same logic used in renderer.ts _drawLeakyRustSpots.
 */
function _drawLeakyRustSpots(ctx: CanvasRenderingContext2D, tile: Tile, h: number): void {
  ctx.fillStyle = '#7a2c10';
  ctx.globalAlpha = 0.75;
  const spotR = _s(3);
  const rotSteps = tile.rotation / 90;
  for (const dir of tile.connections) {
    let localDir = dir;
    for (let i = 0; i < rotSteps; i++) {
      switch (localDir) {
        case Direction.North: localDir = Direction.West;  break;
        case Direction.West:  localDir = Direction.South; break;
        case Direction.South: localDir = Direction.East;  break;
        case Direction.East:  localDir = Direction.North; break;
      }
    }
    const { dx, dy } = DIRECTION_OFFSET[localDir];
    for (const frac of [0.33, 0.67]) {
      ctx.beginPath();
      ctx.arc(dx * h * frac, dy * h * frac, spotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function _resolveFixedPipeBgColor(isSpinCement: boolean, isSpin: boolean, isGold: boolean, isLeaky: boolean): string {
  if (isSpinCement) return CEMENT_FILL_COLOR;
  if (isSpin) return '#192640';
  if (isGold) return '#b8860b';
  if (isLeaky) return '#1a0c08';
  return '#1a2a4e';
}

function _resolveFixedPipeStrokeColor(isSpin: boolean, isGold: boolean, isLeaky: boolean): string {
  if (isSpin) return '#7090c0';
  if (isGold) return '#ffd700';
  if (isLeaky) return '#8b5c2a';
  return '#4a90d9';
}

/** Fixed pipe shapes (Straight, Elbow, Tee, Cross, Gold variants, Spin variants, Leaky variants). */
function _drawFixedPipeShapeTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, buttEndDirs?: ReadonlySet<Direction>): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const { shape } = tile;
  const isGold = _isGoldPipeShape(shape);
  const isSpinCement = SPIN_CEMENT_SHAPES.has(shape);
  const isSpin = SPIN_PIPE_SHAPES.has(shape);
  const isLeaky = LEAKY_PIPE_SHAPES.has(shape);
  ctx.fillStyle = _resolveFixedPipeBgColor(isSpinCement, isSpin, isGold, isLeaky);
  ctx.fillRect(x, y, CELL, CELL);
  // Draw pipe lines
  ctx.strokeStyle = _resolveFixedPipeStrokeColor(isSpin, isGold, isLeaky);
  ctx.lineWidth = LINE_WIDTH;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tile.rotation * Math.PI) / 180);
  const h = CELL / 2;
  if (buttEndDirs !== undefined) {
    _drawRotatedButtEndPipeArms(ctx, tile, buttEndDirs, h);
  } else {
    ctx.lineCap = 'round';
    _drawPipeLinesForShape(ctx, shape, h);
  }
  if (isLeaky) _drawLeakyRustSpots(ctx, tile, h);
  ctx.restore();

  // CW rotation arrow overlay for spinnable pipes
  if (isSpin) {
    ctx.save();
    ctx.translate(cx, cy);
    drawSpinArrow(ctx);
    ctx.restore();
  }
}

function _drawTileShapeBody(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, def: TileDef | undefined, isChapterMap: boolean, style: LevelStyle | undefined, buttEndDirs: ReadonlySet<Direction> | undefined): void {
  const { shape } = tile;
  if (shape === PipeShape.Empty) return; // Already drawn as empty cell
  if (shape === PipeShape.Granite) { _drawGraniteEditorTile(ctx, x, y); return; }
  if (_tryDrawTranslatedShape(ctx, shape, x, y, style)) return;
  if (shape === PipeShape.GoldSpace) { _drawGoldSpaceEditorTile(ctx, x, y); return; }
  if (shape === PipeShape.Source) { _drawSourceEditorTile(ctx, x, y, tile, isChapterMap); return; }
  if (shape === PipeShape.Sink) { _drawSinkEditorTile(ctx, x, y, tile, def, isChapterMap); return; }
  if (shape === PipeShape.Chamber) { _drawChamberEditorTileBody(ctx, x, y, tile, def); return; }
  _drawFixedPipeShapeTile(ctx, x, y, tile, buttEndDirs);
}

/** Simplified tile drawing for the editor canvas. */
function drawTileOnEditor(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile, def?: TileDef, isChapterMap = false, style?: LevelStyle, buttEndDirs?: ReadonlySet<Direction>): void {
  ctx.save();
  ctx.font = `bold ${_s(11)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  _drawTileShapeBody(ctx, x, y, tile, def, isChapterMap, style, buttEndDirs);
  ctx.restore();
}

function drawConnectionLines(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = _s(3);
  ctx.lineCap = 'round';
  for (const dir of tile.connections) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    if (dir === Direction.North) ctx.lineTo(cx, y);
    else if (dir === Direction.South) ctx.lineTo(cx, y + CELL);
    else if (dir === Direction.East)  ctx.lineTo(x + CELL, cy);
    else if (dir === Direction.West)  ctx.lineTo(x, cy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw per-arm pipe strokes in a canvas context already translated to the
 * tile centre.  All arms use lineCap='round' so their natural semicircular
 * caps merge seamlessly at the centre junction — no explicit cap circle is
 * needed.  Arms listed in localButtEndDirs are clipped to the tile
 * half-boundary so the round cap at the tile edge is trimmed flat there
 * while the centre cap is left unconstrained.
 *
 * @param ctx              2D context (origin = tile centre, no rotation applied).
 * @param localConnections Arm directions in the local (already-unrotated) canvas frame.
 * @param localButtEndDirs Subset of localConnections that abut a reciprocal neighbour.
 * @param h                Half the tile size in canvas pixels (= tile-centre offset).
 */
function _drawButtEndPipeArms(
  ctx: CanvasRenderingContext2D,
  localConnections: ReadonlySet<Direction>,
  localButtEndDirs: ReadonlySet<Direction> | undefined,
  h: number,
): void {
  const LARGE = h * 2;
  ctx.lineCap = 'round';
  for (const dir of localConnections) {
    const isButtEnd = localButtEndDirs?.has(dir) ?? false;
    const { ex, ey } = _directionEndpoint(dir, h);
    if (isButtEnd) {
      // Clip to the tile half-boundary so the round cap at the tile edge is
      // trimmed flat there; the centre cap is left unconstrained.
      ctx.save();
      _clipButtEndRect(ctx, ex, ey, h, LARGE);
    }
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (isButtEnd) ctx.restore();
  }
}

function _directionEndpoint(dir: Direction, h: number): { ex: number; ey: number } {
  if (dir === Direction.North) return { ex: 0, ey: -h };
  if (dir === Direction.East) return { ex: h, ey: 0 };
  if (dir === Direction.South) return { ex: 0, ey: h };
  return { ex: -h, ey: 0 };
}

function _clipButtEndRect(ctx: CanvasRenderingContext2D, ex: number, ey: number, h: number, large: number): void {
  ctx.beginPath();
  if (ex > 0) ctx.rect(-large, -large, large + h, large * 2);
  else if (ex < 0) ctx.rect(-h, -large, large + h, large * 2);
  else if (ey > 0) ctx.rect(-large, -large, large * 2, large + h);
  else ctx.rect(-large, -h, large * 2, large + h);
  ctx.clip();
}

/**
 * Draw a pipe tile on the chapter map editor canvas using per-arm strokes
 * with optional butt-end caps for arms connecting to adjacent non-empty tiles.
 * Uses global (absolute) arm directions so the canvas does not need to be
 * rotated, matching the chapter map gameplay screen rendering approach.
 */
function _drawChapterEditorPipeTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  def: TileDef,
  connections: ReadonlySet<Direction>,
  buttEndDirs: ReadonlySet<Direction> | undefined,
  isFilled = false,
): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const shape = def.shape;

  const isGold = _isGoldPipeShape(shape);
  const isSpin = SPIN_PIPE_SHAPES.has(shape);
  const isLeaky = LEAKY_PIPE_SHAPES.has(shape);
  const isSpinCement = SPIN_CEMENT_SHAPES.has(shape);

  // Background fill
  ctx.fillStyle = _resolveChapterPipeBgColor(isSpinCement, isSpin, isGold, isLeaky);
  ctx.fillRect(x, y, CELL, CELL);

  // Pipe arm color – matches the gameplay chapter map colors (isFilled → water color, else dry color)
  const pipeColor = _resolveChapterPipeArmColor(isSpin, isGold, isLeaky, isFilled);

  // Draw arms: chapter map pipes use absolute directions (no tile rotation), so
  // local canvas frame = absolute frame; pass connections directly to the helper.
  ctx.strokeStyle = pipeColor;
  ctx.lineWidth = LINE_WIDTH;
  ctx.save();
  ctx.translate(cx, cy);
  _drawButtEndPipeArms(ctx, connections, buttEndDirs, CELL / 2);
  ctx.restore();
}

function _isGoldPipeShape(shape: PipeShape): boolean {
  return shape === PipeShape.GoldStraight || shape === PipeShape.GoldElbow ||
    shape === PipeShape.GoldTee || shape === PipeShape.GoldCross;
}

function _resolveChapterPipeBgColor(isSpinCement: boolean, isSpin: boolean, isGold: boolean, isLeaky: boolean): string {
  if (isSpinCement) return CEMENT_FILL_COLOR;
  if (isSpin) return '#192640';
  if (isGold) return '#b8860b';
  if (isLeaky) return '#1a0c08';
  return '#1a2a4e';
}

function _resolveChapterPipeArmColor(isSpin: boolean, isGold: boolean, isLeaky: boolean, isFilled: boolean): string {
  if (isSpin) return isFilled ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_BODY_COLOR;
  if (isGold) return isFilled ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
  if (isLeaky) return isFilled ? LEAKY_PIPE_WATER_COLOR : LEAKY_PIPE_COLOR;
  return isFilled ? WATER_COLOR : PIPE_COLOR;
}
