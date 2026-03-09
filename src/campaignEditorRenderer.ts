/**
 * Canvas rendering helpers for the Campaign Editor's level editor canvas.
 * All functions are stateless – they receive explicit data parameters and
 * write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, Rotation } from './types';
import { TILE_SIZE, drawSpinArrow } from './renderer';
import { Tile } from './tile';
import { EDITOR_COLORS, chamberColor } from './campaignEditorTypes';
import { SPIN_PIPE_SHAPES } from './board';
import { COOLER_COLOR, VACUUM_COLOR } from './colors';

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

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL;
      const y = r * CELL;
      // During a drag, render the source cell as empty
      const isDragSource = drag && drag.fromPos.row === r && drag.fromPos.col === c;
      const def = isDragSource ? null : (grid[r]?.[c] ?? null);

      // Cell background
      if (def === null) {
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
        ctx.arc(x + CELL / 2, y + CELL / 2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawEditorTile(ctx, x, y, def);
        // Solid border for fixed tiles
        ctx.strokeStyle = '#2a3a5e';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
      }
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
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 8);
        ctx.lineTo(x + CELL - 8, y + CELL - 8);
        ctx.moveTo(x + CELL - 8, y + 8);
        ctx.lineTo(x + 8, y + CELL - 8);
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
  } else if (shape === PipeShape.Granite) {
    bgColor = '#4a5568';
  } else {
    bgColor = EDITOR_COLORS[shape] ?? '#4a90d9';
  }

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, CELL, CELL);

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
    def.pressure ?? 1,
    def.hardness ?? 0,
  );

  drawTileOnEditor(ctx, x, y, tile);
}

/** Simplified tile drawing for the editor canvas. */
function drawTileOnEditor(ctx: CanvasRenderingContext2D, x: number, y: number, tile: Tile): void {
  const CELL = TILE_SIZE;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  ctx.save();
  ctx.font = 'bold 11px Arial';
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
    ctx.fillText('GRA', cx, cy);
  } else if (shape === PipeShape.GoldSpace) {
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#ffd700';
    ctx.fillText('GOLD', cx, cy - 7);
    ctx.fillText('SPACE', cx, cy + 7);
  } else if (shape === PipeShape.Source) {
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    ctx.fillText('SRC', cx, cy - 8);
    ctx.font = '10px Arial';
    ctx.fillText(`cap:${tile.capacity}`, cx, cy + 8);
    if (tile.temperature > 0) ctx.fillText(`${tile.temperature}°`, cx, cy + 20);
    // Draw connection lines
    drawConnectionLines(ctx, x, y, tile);
  } else if (shape === PipeShape.Sink) {
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    ctx.fillText('SINK', cx, cy);
    drawConnectionLines(ctx, x, y, tile);
  } else if (shape === PipeShape.Chamber) {
    const cc = tile.chamberContent ?? 'tank';
    const isNegHeater = cc === 'heater' && tile.temperature < 0;
    const isNegPump = cc === 'pump' && tile.pressure < 0;
    ctx.fillStyle = isNegHeater ? COOLER_COLOR : isNegPump ? VACUUM_COLOR : chamberColor(cc);
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    if (cc === 'sandstone') {
      ctx.font = '9px Arial';
      ctx.fillText('SANDSTONE', cx, cy - 10);
      ctx.font = '10px Arial';
      ctx.fillText(`${tile.cost}/° x ${tile.temperature}°`, cx, cy + 2);
      ctx.fillText(`H:${tile.hardness}`, cx, cy + 13);
    } else {
      const displayLabel = isNegHeater ? 'COOLER' : isNegPump ? 'VACUUM' : cc.toUpperCase();
      ctx.fillText(displayLabel, cx, cy - 6);
      ctx.font = '10px Arial';
      if (cc === 'tank') ctx.fillText(`cap:${tile.capacity}`, cx, cy + 8);
      else if (cc === 'dirt') ctx.fillText(`cost:${tile.cost}`, cx, cy + 8);
      else if (cc === 'heater') ctx.fillText(`${tile.temperature >= 0 ? '+' : ''}${tile.temperature}°`, cx, cy + 8);
      else if (cc === 'ice') ctx.fillText(`${tile.cost}/° x ${tile.temperature}°`, cx, cy + 8);
      else if (cc === 'pump') ctx.fillText(`${tile.pressure >= 0 ? '+' : ''}${tile.pressure}P`, cx, cy + 8);
      else if (cc === 'snow') ctx.fillText(`${tile.cost}/° x ${tile.temperature}°`, cx, cy + 8);
      else if (cc === 'item') ctx.fillText(`${tile.itemShape?.slice(0, 3)}×${tile.itemCount}`, cx, cy + 8);
    }
    drawConnectionLines(ctx, x, y, tile);
  } else {
    // Fixed pipe shapes (Straight, Elbow, Tee, Cross, Gold variants, Spin variants)
    const isGold = [PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross].includes(shape);
    const isSpin = SPIN_PIPE_SHAPES.has(shape);
    ctx.fillStyle = isSpin ? '#192640' : (isGold ? '#b8860b' : '#1a2a4e');
    ctx.fillRect(x, y, CELL, CELL);
    // Draw pipe lines
    ctx.strokeStyle = isSpin ? '#7090c0' : (isGold ? '#ffd700' : '#4a90d9');
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    const h = CELL / 2;
    if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight || shape === PipeShape.SpinStraight) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
    } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow || shape === PipeShape.SpinElbow) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee || shape === PipeShape.SpinTee) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
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
  ctx.lineWidth = 3;
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
