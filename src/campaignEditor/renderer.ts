/**
 * Canvas rendering helpers for the Campaign Editor's level editor canvas.
 * All functions are stateless – they receive explicit data parameters and
 * write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, Rotation } from '../types';
import { TILE_SIZE, drawSpinArrow, scalePx as _s } from '../renderer';
import { Tile } from '../tile';
import { EDITOR_COLORS, chamberColor } from './types';
import { PIPE_SHAPES, SPIN_PIPE_SHAPES, LEAKY_PIPE_SHAPES, SPIN_CEMENT_SHAPES } from '../board';
import { COOLER_COLOR, VACUUM_COLOR, SOURCE_COLOR, SINK_COLOR, CEMENT_COLOR, CEMENT_FILL_COLOR, ONE_WAY_BG_COLOR, ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER } from '../colors';

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
 */
export function renderEditorCanvas(
  ctx: CanvasRenderingContext2D,
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  overlay?: HoverOverlay | null,
  drag?: DragState | null,
  linkedTilePos?: { row: number; col: number } | null,
): void {
  const CELL = TILE_SIZE;
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);

  // Pass 1: Draw all open (player-fillable) spaces first so that pipe rounded
  // caps drawn in pass 2 are never covered by a neighbouring empty cell's fill.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDragSource = drag && drag.fromPos.row === r && drag.fromPos.col === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      if (def !== null) continue;
      const x = c * CELL;
      const y = r * CELL;
      // Empty (player-fillable) – light grid cell
      ctx.fillStyle = '#1a2840';
      ctx.fillRect(x, y, CELL, CELL);
      // Dashed border
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      ctx.setLineDash([]);
      // Subtle dot
      ctx.fillStyle = '#2a3a5e';
      ctx.beginPath();
      ctx.arc(x + CELL / 2, y + CELL / 2, _s(3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pass 2: Draw all non-pipe fixed tiles on top of the empty-space backgrounds.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDragSource = drag && drag.fromPos.row === r && drag.fromPos.col === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      if (def === null || PIPE_SHAPES.has(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;
      drawEditorTile(ctx, x, y, def);
      // Solid border for fixed tiles
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Pass 3: Draw all pipe tiles last so their rounded caps appear on top of
  // every other tile type (e.g. a pipe adjacent to a Chamber won't be clipped
  // by the Chamber's background fill).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isDragSource = drag && drag.fromPos.row === r && drag.fromPos.col === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);
      if (def === null || !PIPE_SHAPES.has(def.shape)) continue;
      const x = c * CELL;
      const y = r * CELL;
      drawEditorTile(ctx, x, y, def);
      // Solid border for fixed tiles
      ctx.strokeStyle = '#2a3a5e';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
    }
  }

  // Grid lines overlay
  ctx.strokeStyle = 'rgba(74,144,217,0.15)';
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

  // Drag tile drawn at destination (opaque with a slight glow border)
  if (drag) {
    const { row, col } = drag.toPos;
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const x = col * CELL;
      const y = row * CELL;
      ctx.save();
      ctx.globalAlpha = 0.9;
      drawEditorTile(ctx, x, y, drag.tile);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
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
        ctx.setLineDash([]);
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
        drawEditorTile(ctx, x, y, overlay.def);
        ctx.globalAlpha = Math.min(1, overlay.alpha + 0.3);
        ctx.strokeStyle = '#f0c040';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
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
      ctx.setLineDash([]);
      ctx.restore();
    }
  }
}

// ─── Tile drawing ──────────────────────────────────────────────────────────────

/** Draw the OneWay editor tile overlay (arrow + label + border) at canvas pixel (x, y). */
function _drawOneWayEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number): void {
  const CELL = TILE_SIZE;
  const rot = rotation as Rotation;
  const dirs = [Direction.North, Direction.East, Direction.South, Direction.West];
  const dir = dirs[rot / 90] ?? Direction.North;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  const half = CELL / 2;
  const angle = dir === Direction.East  ?  Math.PI / 2
    : dir === Direction.South ?  Math.PI
    : dir === Direction.West  ? -Math.PI / 2
    : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const tipY      = -half * 0.72;
  const headBaseY = -half * 0.28;
  const botY      =  half * 0.30;
  const headHalf  =  half * 0.62;
  const shaftHalf =  half * 0.22;
  ctx.beginPath();
  ctx.moveTo(0, tipY);
  ctx.lineTo( headHalf,  headBaseY);
  ctx.lineTo( shaftHalf, headBaseY);
  ctx.lineTo( shaftHalf, botY);
  ctx.lineTo(-shaftHalf, botY);
  ctx.lineTo(-shaftHalf, headBaseY);
  ctx.lineTo(-headHalf,  headBaseY);
  ctx.closePath();
  ctx.fillStyle = ONE_WAY_ARROW_COLOR;
  ctx.fill();
  ctx.strokeStyle = ONE_WAY_ARROW_BORDER;
  ctx.lineWidth = _s(1.5);
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  // Label
  ctx.save();
  ctx.font = `bold ${_s(9)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  strokeFillText(ctx, 'ONE-WAY', cx, cy + half * 0.65);
  ctx.restore();
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
}

/** Draw a single editor tile (from TileDef) at canvas pixel (x, y). */
export function drawEditorTile(ctx: CanvasRenderingContext2D, x: number, y: number, def: TileDef): void {
  const CELL = TILE_SIZE;
  const { shape } = def;
  const chamberContent = def.chamberContent ?? 'tank';

  // Background color
  let bgColor: string;
  if (shape === PipeShape.Chamber) {
    bgColor = chamberColor(chamberContent);
  } else if (shape === PipeShape.GoldSpace) {
    bgColor = '#b8860b';
  } else if (shape === PipeShape.OneWay) {
    bgColor = ONE_WAY_BG_COLOR;
  } else if (shape === PipeShape.Cement) {
    bgColor = CEMENT_FILL_COLOR;
  } else if (SPIN_CEMENT_SHAPES.has(shape)) {
    bgColor = CEMENT_FILL_COLOR;
  } else if (shape === PipeShape.Granite) {
    bgColor = '#4a5568';
  } else if (shape === PipeShape.Tree) {
    bgColor = '#1a4a0e';
  } else {
    bgColor = EDITOR_COLORS[shape] ?? '#4a90d9';
  }

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, CELL, CELL);

  // Handle OneWay: dark-red background with a direction arrow
  if (shape === PipeShape.OneWay) {
    _drawOneWayEditorTile(ctx, x, y, def.rotation ?? 0);
    return;
  }

  // Handle Cement directly (no Tile construction needed)
  if (shape === PipeShape.Cement) {
    const dryingTime = def.dryingTime ?? 0;
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
    return;
  }

  // Draw the tile as a Tile object using existing drawTile infrastructure
  // We construct a temporary Tile to render it
  const rot = (def.rotation ?? 0) as Rotation;
  const customConns = def.connections ? new Set(def.connections) : null;
  const tile = new Tile(
    shape,
    rot,
    true,
    def.capacity ?? 0,
    def.cost ?? 0,
    def.itemShape ?? null,
    def.itemCount ?? 1,
    customConns,
    def.chamberContent ?? null,
    def.temperature ?? 0,
    def.pressure ?? 0,
    def.hardness ?? 0,
    def.shatter ?? 0,
  );

  drawTileOnEditor(ctx, x, y, tile);

  // For spin-cement tiles, draw the cement wavy-line overlay and drying-time label on top.
  if (SPIN_CEMENT_SHAPES.has(shape)) {
    const dryingTime = def.dryingTime ?? 0;
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
    ctx.save();
    ctx.font = `bold ${_s(8)}px Arial`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#505050';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = _s(1.5);
    ctx.lineJoin = 'round';
    const label = dryingTime === 0 ? 'X' : `T=${dryingTime}`;
    ctx.strokeText(label, x + _s(2), y + _s(2));
    ctx.fillText(label, x + _s(2), y + _s(2));
    ctx.restore();
  }
}

/** Chamber content types whose tile label/detail text is rendered 1pt larger than the default. */
const CHAMBER_TYPES_WITH_LARGER_FONT: ReadonlySet<string> = new Set([
  'tank', 'dirt', 'heater', 'pump', 'snow', 'ice', 'star',
]);

/** Draw text with a soft dark shadow for better visibility on the editor grid. */
function strokeFillText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 3;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Simplified tile drawing for the editor canvas. */
function drawTileOnEditor(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  ctx.save();
  ctx.font = `bold ${_s(11)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const shape = tile.shape;

  if (shape === PipeShape.Empty) {
    // Already drawn as empty cell
  } else if (shape === PipeShape.Granite) {
    // Render granite as a textured block
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
    strokeFillText(ctx, 'GRANITE', cx, cy);
  } else if (shape === PipeShape.Tree) {
    // Render tree as a green canopy with leaf lobes (top-down view)
    ctx.fillStyle = '#1a4a0e';
    ctx.fillRect(x, y, CELL, CELL);
    const r = CELL * 0.38;
    ctx.fillStyle = '#3a8c24';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#56b03a';
    const lobeR = r * 0.48;
    const lobeOff = r * 0.52;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * lobeOff, cy + Math.sin(a) * lobeOff, lobeR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6b3a2a';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d6e1a';
    ctx.lineWidth = _s(1.5);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    strokeFillText(ctx, 'TREE', cx, cy);
  } else if (shape === PipeShape.GoldSpace) {
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#ffd700';
    strokeFillText(ctx, 'GOLD', cx, cy - _s(7));
    strokeFillText(ctx, 'SPACE', cx, cy + _s(7));
  } else if (shape === PipeShape.Source) {
    ctx.fillStyle = SOURCE_COLOR;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    // Count how many lines we need to center them vertically
    const lines: string[] = ['SOURCE', `cap:${tile.capacity}`];
    // Show temp/pressure params only when non-zero
    if (tile.temperature !== 0) lines.push(`${tile.temperature}°`);
    if (tile.pressure !== 0) lines.push(`${tile.pressure}P`);
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
  } else if (shape === PipeShape.Sink) {
    ctx.fillStyle = SINK_COLOR;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${_s(12)}px Arial`;
    strokeFillText(ctx, 'SINK', cx, cy);
    drawConnectionLines(ctx, x, y, tile);
  } else if (shape === PipeShape.Chamber) {
    const cc = tile.chamberContent ?? 'tank';
    const isNegHeater = cc === 'heater' && tile.temperature < 0;
    const isNegPump = cc === 'pump' && tile.pressure < 0;
    ctx.fillStyle = isNegHeater ? COOLER_COLOR : isNegPump ? VACUUM_COLOR : chamberColor(cc);
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    if (cc === 'sandstone') {
      ctx.font = `${_s(9)}px Arial`;
      strokeFillText(ctx, 'SANDSTONE', cx, cy - _s(10));
      ctx.font = `${_s(10)}px Arial`;
      strokeFillText(ctx, `${tile.temperature}° x ${tile.cost}`, cx, cy + _s(2));
      const shatterActive = tile.shatter > tile.hardness;
      strokeFillText(ctx, shatterActive ? `H:${tile.hardness} S:${tile.shatter}` : `H:${tile.hardness}`, cx, cy + _s(13));
    } else {
      let displayLabel: string;
      if (isNegHeater) displayLabel = 'COOLER';
      else if (isNegPump) displayLabel = 'VACUUM';
      else if (cc === 'hot_plate') displayLabel = 'HOT PLATE';
      else displayLabel = cc.toUpperCase();
      const needsBigFont = CHAMBER_TYPES_WITH_LARGER_FONT.has(cc);
      ctx.font = needsBigFont ? `bold ${_s(12)}px Arial` : `bold ${_s(11)}px Arial`;
      strokeFillText(ctx, displayLabel, cx, cy - _s(6));
      ctx.font = needsBigFont ? `${_s(11)}px Arial` : `${_s(10)}px Arial`;
      if (cc === 'tank') strokeFillText(ctx, `cap:${tile.capacity}`, cx, cy + _s(8));
      else if (cc === 'dirt') strokeFillText(ctx, `cost:${tile.cost}`, cx, cy + _s(8));
      else if (cc === 'heater') strokeFillText(ctx, `${tile.temperature >= 0 ? '+' : ''}${tile.temperature}°`, cx, cy + _s(8));
      else if (cc === 'ice') strokeFillText(ctx, `${tile.temperature}° x ${tile.cost}`, cx, cy + _s(8));
      else if (cc === 'pump') strokeFillText(ctx, `${tile.pressure >= 0 ? '+' : ''}${tile.pressure}P`, cx, cy + _s(8));
      else if (cc === 'snow') strokeFillText(ctx, `${tile.temperature}° x ${tile.cost}`, cx, cy + _s(8));
      else if (cc === 'hot_plate') strokeFillText(ctx, `${tile.temperature}° x ${tile.cost}`, cx, cy + _s(8));
      else if (cc === 'item') strokeFillText(ctx, `${tile.itemShape?.slice(0, 3)}×${tile.itemCount}`, cx, cy + _s(8));
    }
    drawConnectionLines(ctx, x, y, tile);
  } else {
    // Fixed pipe shapes (Straight, Elbow, Tee, Cross, Gold variants, Spin variants, Leaky variants)
    const isGold = [PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross].includes(shape);
    const isSpinCement = SPIN_CEMENT_SHAPES.has(shape);
    const isSpin = SPIN_PIPE_SHAPES.has(shape);
    const isLeaky = LEAKY_PIPE_SHAPES.has(shape);
    ctx.fillStyle = isSpinCement ? CEMENT_FILL_COLOR : isSpin ? '#192640' : isGold ? '#b8860b' : isLeaky ? '#1a0c08' : '#1a2a4e';
    ctx.fillRect(x, y, CELL, CELL);
    // Draw pipe lines
    ctx.strokeStyle = isSpin ? '#7090c0' : isGold ? '#ffd700' : isLeaky ? '#8b5c2a' : '#4a90d9';
    ctx.lineWidth = _s(8);
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    const h = CELL / 2;
    if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight || shape === PipeShape.SpinStraight || shape === PipeShape.LeakyStraight || shape === PipeShape.SpinStraightCement) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
    } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow || shape === PipeShape.SpinElbow || shape === PipeShape.LeakyElbow || shape === PipeShape.SpinElbowCement) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee || shape === PipeShape.SpinTee || shape === PipeShape.LeakyTee || shape === PipeShape.SpinTeeCement) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross || shape === PipeShape.LeakyCross) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
    }
    // Draw rust spots on leaky pipes (two dots along each arm at 1/3 and 2/3)
    if (isLeaky) {
      ctx.fillStyle = '#7a2c10';
      ctx.globalAlpha = 0.75;
      const spotR = _s(3);
      // `tile.connections` returns absolute (post-rotation) directions, but the
      // canvas is already rotated. Un-rotate each direction to local frame first,
      // mirroring the same logic used in renderer.ts _drawLeakyRustSpots.
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
        let dx = 0, dy = 0;
        switch (localDir) {
          case Direction.North: dx =  0; dy = -1; break;
          case Direction.South: dx =  0; dy =  1; break;
          case Direction.East:  dx =  1; dy =  0; break;
          case Direction.West:  dx = -1; dy =  0; break;
        }
        for (const frac of [0.33, 0.67]) {
          ctx.beginPath();
          ctx.arc(dx * h * frac, dy * h * frac, spotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // CW rotation arrow overlay for spinnable pipes
    if (isSpin) {
      ctx.save();
      ctx.translate(cx, cy);
      drawSpinArrow(ctx);
      ctx.restore();
    }
  }

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
