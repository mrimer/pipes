/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES, PIPE_SHAPES } from './board';
import { Tile } from './tile';
import { GridPos, PipeShape, Direction } from './types';
import {
  BG_COLOR, TILE_BG, FOCUS_COLOR,
  EMPTY_COLOR, EMPTY_TARGET_COLOR,
  GOLD_SPACE_BASE_COLOR, GOLD_SPACE_SHIMMER_COLOR, GOLD_SPACE_BORDER_COLOR,
  PIPE_COLOR, WATER_COLOR,
  SOURCE_COLOR, SOURCE_WATER_COLOR,
  SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR,
  FIXED_PIPE_COLOR, FIXED_PIPE_WATER_COLOR,
  DIRT_WATER_COLOR, DIRT_COST_COLOR, DIRT_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR,
  CHAMBER_COLOR, CHAMBER_WATER_COLOR, CHAMBER_FILL_COLOR, CHAMBER_FILL_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR,
  LABEL_COLOR,
  REMOVABLE_BG_COLOR,
  HEATER_COLOR, HEATER_WATER_COLOR,
  ICE_COLOR, ICE_WATER_COLOR,
  PUMP_COLOR, PUMP_WATER_COLOR,
  WEAK_ICE_COLOR, WEAK_ICE_WATER_COLOR,
  SANDSTONE_COLOR, SANDSTONE_WATER_COLOR,
  SANDSTONE_HARD_COLOR, SANDSTONE_HARD_WATER_COLOR,
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

/** Draw a single tile at canvas position (x, y). */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: Tile,
  isWater: boolean,
  currentWater: number,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
): void {
  const { shape, rotation, isFixed, capacity, cost, itemShape, itemCount } = tile;
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
  } else if (shape === PipeShape.Chamber) {
    const { chamberContent } = tile;
    if (chamberContent === 'tank') {
      color = isWater ? TANK_WATER_COLOR : TANK_COLOR;
    } else if (chamberContent === 'dirt') {
      color = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
    } else if (chamberContent === 'item') {
      color = isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
    } else if (chamberContent === 'heater') {
      color = isWater ? HEATER_WATER_COLOR : HEATER_COLOR;
    } else if (chamberContent === 'ice') {
      color = isWater ? ICE_WATER_COLOR : ICE_COLOR;
    } else if (chamberContent === 'pump') {
      color = isWater ? PUMP_WATER_COLOR : PUMP_COLOR;
    } else if (chamberContent === 'weak_ice') {
      color = isWater ? WEAK_ICE_WATER_COLOR : WEAK_ICE_COLOR;
    } else if (chamberContent === 'sandstone') {
      const isHard = tile.hardness >= currentPressure;
      color = isHard
        ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
        : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    } else {
      color = isWater ? CHAMBER_WATER_COLOR : CHAMBER_COLOR;
    }
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
    // Restore to un-rotated state so we can draw based on actual connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    // Filled circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
    ctx.fill();
    // Radiating lines – only for connected directions
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    if (tile.connections.has(Direction.North)) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -half); ctx.stroke();
    }
    if (tile.connections.has(Direction.South)) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, half); ctx.stroke();
    }
    if (tile.connections.has(Direction.East)) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(half, 0); ctx.stroke();
    }
    if (tile.connections.has(Direction.West)) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-half, 0); ctx.stroke();
    }
    // Show capacity number on Source (drawn last so it appears on top)
    if (shape === PipeShape.Source) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(currentWater), 0, 0);
    }
  } else if (shape === PipeShape.Chamber) {
    // Chamber – a steel-blue enclosure whose interior display varies by content
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const bw = half * 0.7;
    const bh = half * 0.7;
    ctx.fillStyle = isWater ? CHAMBER_FILL_WATER_COLOR : CHAMBER_FILL_COLOR;
    ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
    // Draw inner content based on chamberContent
    const { chamberContent } = tile;
    if (chamberContent === 'tank') {
      // Show capacity number in tank-like color
      ctx.fillStyle = isWater ? TANK_WATER_COLOR : TANK_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(capacity), 0, 0);
    } else if (chamberContent === 'dirt') {
      // Show negative cost label in dirt-like color
      ctx.fillStyle = isWater ? DIRT_WATER_COLOR : DIRT_COST_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`-${cost}`, 0, 0);
    } else if (chamberContent === 'item') {
      // Draw a mini version of the item pipe shape scaled to fit snugly inside the chamber box
      const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
      const itemColor = isGoldItem
        ? (isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR)
        : (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR);
      if (itemShape !== null) {
        let drawShape = itemShape;
        if (itemShape === PipeShape.GoldStraight) drawShape = PipeShape.Straight;
        else if (itemShape === PipeShape.GoldElbow) drawShape = PipeShape.Elbow;
        else if (itemShape === PipeShape.GoldTee) drawShape = PipeShape.Tee;
        else if (itemShape === PipeShape.GoldCross) drawShape = PipeShape.Cross;
        ctx.save();
        // Clip to the inner box so the pipe image never bleeds onto the connection stubs
        ctx.beginPath();
        ctx.rect(-bw, -bh, bw * 2, bh * 2);
        ctx.clip();
        // 2px buffer between item shape and chamber walls
        const scale = (bw - 2) / half;
        ctx.scale(scale, scale);
        ctx.strokeStyle = itemColor;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = 'round';
        if (drawShape === PipeShape.Straight) {
          ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
        } else if (drawShape === PipeShape.Elbow) {
          ctx.beginPath();
          ctx.moveTo(0, -half); ctx.lineTo(0, 0); ctx.lineTo(half, 0);
          ctx.stroke();
        } else if (drawShape === PipeShape.Tee) {
          ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(half, 0); ctx.stroke();
        } else if (drawShape === PipeShape.Cross) {
          ctx.beginPath(); ctx.moveTo(0, -half); ctx.lineTo(0, half); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke();
        }
        ctx.restore();
      }
      // Draw quantity number centered, white with a 1px black outline
      if (itemCount > 1) {
        const countLabel = String(itemCount);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 30px Arial';
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeText(countLabel, 0, 0);
        ctx.fillStyle = 'white';
        ctx.fillText(countLabel, 0, 0);
      }
    } else if (chamberContent === 'heater') {
      // Show positive temperature bonus in heater color
      ctx.fillStyle = isWater ? HEATER_WATER_COLOR : HEATER_COLOR;
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${tile.temperature}°`, 0, 0);
    } else if (chamberContent === 'ice') {
      // Show three lines: negative cost, "x", and the temperature threshold (deltaTemp reference)
      // By default, adjust the threshold display by current temperature (capped at 0).
      // When shift is held, show the raw (unadjusted) threshold value.
      const iceThreshold = shiftHeld
        ? tile.temperature
        : Math.max(0, tile.temperature - currentTemp);
      ctx.fillStyle = isWater ? ICE_WATER_COLOR : ICE_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`-${iceThreshold}°`, 0, -9);
      ctx.font = 'bold 9px Arial';
      ctx.fillText('x', 0, 0);
      ctx.font = 'bold 14px Arial';
      ctx.fillText(String(cost), 0, 9);
    } else if (chamberContent === 'pump') {
      // Show the pressure bonus amount
      ctx.fillStyle = isWater ? PUMP_WATER_COLOR : PUMP_COLOR;
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${tile.pressure}P`, 0, 0);
    } else if (chamberContent === 'weak_ice') {
      // Show three lines: negative adjusted cost, "x", and the temperature threshold.
      // By default, show values adjusted by current Pressure and Temperature.
      // When shift is held, show the raw (unadjusted) values.
      const weakIceThreshold = shiftHeld
        ? tile.temperature
        : Math.max(0, tile.temperature - currentTemp);
      const weakIceCost = shiftHeld
        ? cost
        : Math.max(1, currentPressure >= 1 ? Math.ceil(cost / currentPressure) : cost);
      ctx.fillStyle = isWater ? WEAK_ICE_WATER_COLOR : WEAK_ICE_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(`-${weakIceThreshold}°`, 0, -9);
      ctx.font = 'bold 9px Arial';
      ctx.fillText('x', 0, 0);
      ctx.font = 'bold 14px Arial';
      ctx.fillText(String(weakIceCost), 0, 9);
    } else if (chamberContent === 'sandstone') {
      // Show three lines: negative adjusted cost, "x", and the temperature threshold.
      // deltaDamage = Pressure − Hardness is used as the cost divisor.
      // When shift is held, show the raw (unadjusted) values.
      // When hardness > pressure, use darker color and show the hardness value with "H".
      const isHard = tile.hardness >= currentPressure;
      const sandstoneColor = isHard
        ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
        : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
      ctx.fillStyle = sandstoneColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (isHard) {
        // Alternative display: show hardness value and "H" to indicate hardness exceeds pressure
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${tile.hardness}H`, 0, 0);
      } else {
        const sandstoneThreshold = shiftHeld
          ? tile.temperature
          : Math.max(0, tile.temperature - currentTemp);
        const deltaDamage = currentPressure - tile.hardness;
        const sandstoneCost = shiftHeld
          ? cost
          : Math.max(1, deltaDamage >= 1 ? Math.ceil(cost / deltaDamage) : cost);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`-${sandstoneThreshold}°`, 0, -9);
        ctx.font = 'bold 9px Arial';
        ctx.fillText('x', 0, 0);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(String(sandstoneCost), 0, 9);
      }
    }
    // Connection stubs
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    if (tile.connections.has(Direction.North)) {
      ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
    }
    if (tile.connections.has(Direction.South)) {
      ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
    }
    if (tile.connections.has(Direction.West)) {
      ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
    }
    if (tile.connections.has(Direction.East)) {
      ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
    }
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

/** Return a human-readable name for an inventory item shape (used inside item-container tooltips). */
function _itemShapeDisplayName(shape: PipeShape | null): string {
  switch (shape) {
    case PipeShape.Straight:     return 'Straight';
    case PipeShape.Elbow:        return 'Elbow';
    case PipeShape.Tee:          return 'Tee';
    case PipeShape.Cross:        return 'Cross';
    case PipeShape.GoldStraight: return 'Gold Straight';
    case PipeShape.GoldElbow:    return 'Gold Elbow';
    case PipeShape.GoldTee:      return 'Gold Tee';
    case PipeShape.GoldCross:    return 'Gold Cross';
    default:                     return 'Item';
  }
}

/**
 * Returns a human-readable display name for a tile derived from its shape and
 * chamber content.  Returns an empty string for tiles with no meaningful label
 * (Empty, GoldSpace).
 */
export function getTileDisplayName(tile: Tile): string {
  switch (tile.shape) {
    case PipeShape.Straight:
    case PipeShape.GoldStraight: return 'Straight';
    case PipeShape.Elbow:
    case PipeShape.GoldElbow:    return 'Elbow';
    case PipeShape.Tee:
    case PipeShape.GoldTee:      return 'Tee';
    case PipeShape.Cross:
    case PipeShape.GoldCross:    return 'Cross';
    case PipeShape.Source:       return 'Source';
    case PipeShape.Sink:         return 'Sink';
    case PipeShape.Granite:      return 'Granite';
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':   return tile.capacity > 0 ? `Tank +${tile.capacity}` : 'Tank';
        case 'dirt':   return 'Dirt block';
        case 'item': {
          const itemName = _itemShapeDisplayName(tile.itemShape);
          return tile.itemCount > 1 ? `${tile.itemCount}× ${itemName}` : itemName;
        }
        case 'heater': return tile.temperature > 0 ? `Heater +${tile.temperature}°` : 'Heater';
        case 'ice':    return 'Ice';
        case 'pump':   return `Pump +${tile.pressure}P`;
        case 'weak_ice': return 'Weak Ice';
        case 'sandstone': return 'Sandstone';
        default:       return 'Chamber';
      }
    default: return '';
  }
}

/**
 * Returns true when a tile can be replaced by the given selected shape and
 * rotation.  A tile is replaceable when it is a non-fixed regular or gold pipe,
 * the gold-space constraint is satisfied, and the result would actually differ
 * from the current tile (different shape or different rotation).
 */
function isReplaceableByShape(
  tile: Tile,
  selectedShape: PipeShape,
  pendingRotation: number,
  selectedIsGold: boolean,
  isGoldCell: boolean,
): boolean {
  return (
    !tile.isFixed &&
    (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) &&
    (tile.shape !== selectedShape || tile.rotation !== pendingRotation) &&
    (!isGoldCell || selectedIsGold)
  );
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
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  highlightedPositions: Set<string> = new Set(),
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

      // A cell is a valid placement target when it's empty and either:
      // it's not a gold space (any pipe fits), or it IS a gold space (gold pipe required)
      const isTarget = selectedShape !== null &&
        tile.shape === PipeShape.Empty &&
        (!isGoldCell || selectedIsGold);

      // A non-empty cell is a valid replacement target when the selected shape can replace it:
      // the tile must be a player-placed (non-fixed) regular or gold pipe, and satisfy
      // the gold-space constraint.
      const isReplaceTarget = selectedShape !== null &&
        isReplaceableByShape(tile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);

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
        // Non-empty, non-gold tile: player-placed (removable) pipes get a distinct background
        const isRemovable = !tile.isFixed &&
          (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape));
        ctx.fillStyle = isRemovable ? REMOVABLE_BG_COLOR : TILE_BG;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        // Overlay a target highlight when this tile is a valid replacement target
        if (isReplaceTarget) {
          ctx.fillStyle = EMPTY_TARGET_COLOR;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.globalAlpha = 1;
        }
      }

      // Focus highlight
      if (isFocused) {
        ctx.strokeStyle = FOCUS_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      // Sandstone error highlight (pulsing red overlay)
      if (highlightedPositions.has(`${r},${c}`)) {
        const pulse = 0.35 + 0.25 * ((Math.sin(Date.now() / 120) + 1) / 2);
        ctx.fillStyle = `rgba(220,50,50,${pulse.toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = '#ff2020';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure);
    }
  }

  // Draw semi-transparent hover preview of the pending inventory item
  if (selectedShape !== null && mouseCanvasPos) {
    const hoverCol = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    const hoverRow = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    if (hoverRow >= 0 && hoverRow < board.rows && hoverCol >= 0 && hoverCol < board.cols) {
      const hoverTile = board.grid[hoverRow][hoverCol];
      const isGoldCell = board.goldSpaces.has(`${hoverRow},${hoverCol}`);
      const canPlace = hoverTile.shape === PipeShape.Empty && (!isGoldCell || selectedIsGold);
      const canReplace = isReplaceableByShape(hoverTile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);
      if (canPlace || canReplace) {
        const previewTile = new Tile(selectedShape, pendingRotation as 0 | 90 | 180 | 270);
        const px = hoverCol * TILE_SIZE;
        const py = hoverRow * TILE_SIZE;
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawTile(ctx, px, py, previewTile, false, currentWater);
        ctx.restore();
      }
    }
  }
}
