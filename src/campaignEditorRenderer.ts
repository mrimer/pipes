/**
 * Canvas rendering helpers for the Campaign Editor's level editor canvas.
 * All functions are stateless – they receive explicit data parameters and
 * write only to the supplied CanvasRenderingContext2D.
 */

import { PipeShape, TileDef, Direction, Rotation } from './types';
import { TILE_SIZE } from './renderer';
import { Tile } from './tile';
import { EDITOR_COLORS, chamberColor } from './campaignEditorTypes';

// ─── Public entry point ────────────────────────────────────────────────────────

/**
 * Render the full editor canvas.
 *
 * @param ctx    2D context to draw on.
 * @param grid   The current tile grid (null = player-fillable empty cell).
 * @param rows   Number of grid rows.
 * @param cols   Number of grid columns.
 * @param hover  Cell under the mouse cursor, or null when the cursor is outside.
 */
export function renderEditorCanvas(
  ctx: CanvasRenderingContext2D,
  grid: (TileDef | null)[][],
  rows: number,
  cols: number,
  hover: { row: number; col: number } | null,
): void {
  const CELL = TILE_SIZE;
  ctx.clearRect(0, 0, cols * CELL, rows * CELL);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL;
      const y = r * CELL;
      const def = grid[r]?.[c] ?? null;

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

  // Hover highlight
  if (hover) {
    const { row, col } = hover;
    ctx.fillStyle = 'rgba(240,192,64,0.18)';
    ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(col * CELL + 1, row * CELL + 1, CELL - 2, CELL - 2);
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

  // Draw the tile as a Tile object using existing drawPipe infrastructure
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
    ctx.fillText('GOLD', cx, cy);
    ctx.fillText('SPACE', cx, cy + 14);
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
    ctx.fillStyle = chamberColor(cc);
    ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#fff';
    ctx.fillText(cc.toUpperCase(), cx, cy - 6);
    ctx.font = '10px Arial';
    if (cc === 'tank') ctx.fillText(`cap:${tile.capacity}`, cx, cy + 8);
    else if (cc === 'dirt') ctx.fillText(`cost:${tile.cost}`, cx, cy + 8);
    else if (cc === 'heater') ctx.fillText(`+${tile.temperature}°`, cx, cy + 8);
    else if (cc === 'ice') ctx.fillText(`${tile.cost}/Δ thr:${tile.temperature}°`, cx, cy + 8);
    else if (cc === 'item') ctx.fillText(`${tile.itemShape?.slice(0, 3)}×${tile.itemCount}`, cx, cy + 8);
    drawConnectionLines(ctx, x, y, tile);
  } else {
    // Fixed pipe shapes (Straight, Elbow, Tee, Cross, Gold variants)
    const isGold = [PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross].includes(shape);
    ctx.fillStyle = isGold ? '#b8860b' : '#1a2a4e';
    ctx.fillRect(x, y, CELL, CELL);
    // Draw pipe lines
    ctx.strokeStyle = isGold ? '#ffd700' : '#4a90d9';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((tile.rotation * Math.PI) / 180);
    const h = CELL / 2;
    if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
    } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(h, 0); ctx.stroke();
    } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(0, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-h, 0); ctx.lineTo(h, 0); ctx.stroke();
    }
    ctx.restore();
    // Fixed label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 9px Arial';
    ctx.fillText('FIX', cx, cy + 22);
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
