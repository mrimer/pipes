/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES } from './board';
import { Tile } from './tile';
import { GridPos, PipeShape } from './types';
import {
  BG_COLOR, TILE_BG, FOCUS_COLOR,
  EMPTY_COLOR, EMPTY_TARGET_COLOR,
  GOLD_SPACE_BASE_COLOR, GOLD_SPACE_SHIMMER_COLOR, GOLD_SPACE_BORDER_COLOR,
  PIPE_COLOR, WATER_COLOR,
  SOURCE_COLOR, SOURCE_WATER_COLOR,
  SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR, TANK_FILL_COLOR, TANK_FILL_WATER_COLOR,
  FIXED_PIPE_COLOR, FIXED_PIPE_WATER_COLOR,
  DIRT_COLOR, DIRT_WATER_COLOR, DIRT_FILL_COLOR, DIRT_FILL_WATER_COLOR, DIRT_COST_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR, CONTAINER_FILL_COLOR, CONTAINER_FILL_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR,
  LABEL_COLOR,
} from './colors';

const LINE_WIDTH = 10; // pipe stroke width in px

export const TILE_SIZE = 64; // px

/** Unambiguous two-character abbreviation for each pipe shape, used inside ItemContainer tiles. */
export const SHAPE_ABBREV: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]:     'St',
  [PipeShape.Elbow]:        'El',
  [PipeShape.Tee]:          'Te',
  [PipeShape.Cross]:        'Cr',
  [PipeShape.GoldStraight]: 'St',
  [PipeShape.GoldElbow]:    'El',
  [PipeShape.GoldTee]:      'Te',
  [PipeShape.GoldCross]:    'Cr',
};

/** Return an inline SVG icon for the given pipe shape. */
export function shapeIcon(shape: PipeShape, color = '#4a90d9'): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // Map gold pipe shapes to their base shape for icon rendering
  let drawShape = shape;
  if (shape === PipeShape.GoldStraight) drawShape = PipeShape.Straight;
  else if (shape === PipeShape.GoldElbow) drawShape = PipeShape.Elbow;
  else if (shape === PipeShape.GoldTee) drawShape = PipeShape.Tee;
  else if (shape === PipeShape.GoldCross) drawShape = PipeShape.Cross;
  switch (drawShape) {
    case PipeShape.Straight:
      return `<svg ${base}>${line(H, 0, H, S)}</svg>`;
    case PipeShape.Elbow:
      return `<svg ${base}><polyline points="${H},0 ${H},${H} ${S},${H}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case PipeShape.Tee:
      return `<svg ${base}>${line(H, 0, H, S)}${line(H, H, S, H)}</svg>`;
    case PipeShape.Cross:
      return `<svg ${base}>${line(H, 0, H, S)}${line(0, H, S, H)}</svg>`;
    default:
      return '';
  }
}

/** Draw a single pipe tile at canvas position (x, y). */
export function drawPipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: Tile,
  isWater: boolean,
  currentWater: number,
): void {
  const { shape, rotation, isFixed, capacity, dirtCost, itemShape } = tile;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  let color: string;
  if (shape === PipeShape.Source) {
    color = isWater ? SOURCE_WATER_COLOR : SOURCE_COLOR;
  } else if (shape === PipeShape.Sink) {
    color = isWater ? SINK_WATER_COLOR : SINK_COLOR;
  } else if (shape === PipeShape.Tank) {
    color = isWater ? TANK_WATER_COLOR : TANK_COLOR;
  } else if (shape === PipeShape.DirtBlock) {
    color = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
  } else if (shape === PipeShape.ItemContainer) {
    color = isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR;
  } else if (shape === PipeShape.Granite) {
    color = GRANITE_COLOR;
  } else if (GOLD_PIPE_SHAPES.has(shape)) {
    color = isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
  } else {
    color = isFixed
      ? (isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR)
      : isWater ? WATER_COLOR : PIPE_COLOR;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';

  if (shape === PipeShape.Empty) {
    // Draw a subtle dot so the tile is visually distinct from fixed tiles
    ctx.fillStyle = EMPTY_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
  } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Source || shape === PipeShape.Sink) {
    // Filled circle + four radiating lines
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * half, Math.sin(angle) * half);
      ctx.stroke();
    }
    // Show capacity number on Source
    if (shape === PipeShape.Source) {
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(currentWater), 0, 0);
    }
  } else if (shape === PipeShape.Tank) {
    // Rectangle body
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const bw = half * 0.7;
    const bh = half * 0.7;
    ctx.fillStyle = isWater ? TANK_FILL_WATER_COLOR : TANK_FILL_COLOR;
    ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
    // Capacity label
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(capacity), 0, 0);
    // Connection stubs (lines from box edges to tile edges)
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
  } else if (shape === PipeShape.DirtBlock) {
    // Dirt block – brown rectangle with a red negative cost label
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const bw = half * 0.7;
    const bh = half * 0.7;
    ctx.fillStyle = isWater ? DIRT_FILL_WATER_COLOR : DIRT_FILL_COLOR;
    ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    ctx.strokeStyle = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
    // Show cost label in red when not washed away; fade when water is flowing through
    ctx.fillStyle = isWater ? DIRT_WATER_COLOR : DIRT_COST_COLOR;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`-${dirtCost}`, 0, 0);
    // Connection stubs (lines from box edges to tile edges)
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
  } else if (shape === PipeShape.ItemContainer) {
    // Item container – amber/gold rectangle with a small pipe-shape label inside
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const bw = half * 0.7;
    const bh = half * 0.7;
    ctx.fillStyle = isWater ? CONTAINER_FILL_WATER_COLOR : CONTAINER_FILL_COLOR;
    ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
    // Show item shape abbreviation label (use lookup map to avoid single-char ambiguities)
    // Prefix gold-type items with 'G' to distinguish them visually
    const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
    const abbrev = (itemShape && SHAPE_ABBREV[itemShape]) ?? '?';
    const label = isGoldItem ? `G${abbrev}` : abbrev;
    ctx.fillStyle = isGoldItem
      ? (isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR)
      : (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR);
    ctx.font = isGoldItem ? 'bold 11px Arial' : 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    // Connection stubs
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
  } else if (shape === PipeShape.Granite) {
    // Granite – solid impassable stone block; no connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const bw = half * 0.7;
    const bh = half * 0.7;
    ctx.fillStyle = GRANITE_FILL_COLOR;
    ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    ctx.strokeStyle = GRANITE_COLOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
    // Stone texture – a few crack-like lines
    ctx.strokeStyle = GRANITE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-bw + 4, -bh + 10); ctx.lineTo(bw - 6, -bh + 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw + 2, 2);         ctx.lineTo(bw - 8, 8);        ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-bw + 6, bh - 14);   ctx.lineTo(bw - 4, bh - 8);  ctx.stroke();
  }

  ctx.restore();
}

/** Render the full game board onto the canvas. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  board: Board,
  focusPos: GridPos,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  mouseCanvasPos: { x: number; y: number } | null,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(Date.now() / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater    = filled.has(`${r},${c}`);
      const isFocused  = focusPos.row === r && focusPos.col === c;
      const isGoldCell = board.goldSpaces.has(`${r},${c}`);

      // A cell is a valid placement target only when the selected shape matches the cell type
      const isTarget = selectedShape !== null &&
        tile.shape === PipeShape.Empty &&
        (isGoldCell === selectedIsGold);

      // Tile background
      if (tile.shape === PipeShape.Empty) {
        if (isGoldCell) {
          // Shimmering gold background
          ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.fillStyle = `${GOLD_SPACE_SHIMMER_COLOR}${shimmerAlpha.toFixed(3)})`;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          // Gold border to make the cell clearly distinct
          ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          // Brighten when it's a valid drop target
          if (isTarget) {
            ctx.fillStyle = 'rgba(255,215,0,0.2)';
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else {
          ctx.fillStyle = isTarget ? EMPTY_TARGET_COLOR : EMPTY_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      } else {
        ctx.fillStyle = TILE_BG;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }

      // Focus highlight
      if (isFocused) {
        ctx.strokeStyle = FOCUS_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      drawPipe(ctx, x, y, tile, isWater, currentWater);
    }
  }

  // Draw semi-transparent hover preview of the pending inventory item
  if (selectedShape !== null && mouseCanvasPos) {
    const hoverCol = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    const hoverRow = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    if (hoverRow >= 0 && hoverRow < board.rows && hoverCol >= 0 && hoverCol < board.cols) {
      const hoverTile = board.grid[hoverRow][hoverCol];
      const isGoldCell = board.goldSpaces.has(`${hoverRow},${hoverCol}`);
      if (hoverTile.shape === PipeShape.Empty && isGoldCell === selectedIsGold) {
        const previewTile = new Tile(selectedShape, pendingRotation as 0 | 90 | 180 | 270);
        const px = hoverCol * TILE_SIZE;
        const py = hoverRow * TILE_SIZE;
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawPipe(ctx, px, py, previewTile, false, currentWater);
        ctx.restore();
      }
    }
  }
}
