/**
 * Minimap rendering helpers.
 *
 * Renders a tiny pixel-art preview of a level grid onto an HTMLCanvasElement.
 * Each grid tile is represented by 1 or more colored pixels, and the minimap
 * is surrounded by a 2px white border.
 */

import { Direction, LevelDef, PipeShape, Rotation, TileDef } from './types';
import { getConnections } from './tile';
import {
  EMPTY_COLOR,
  PIPE_COLOR,
  SOURCE_COLOR,
  SINK_COLOR,
  TANK_COLOR,
  DIRT_COLOR,
  HEATER_COLOR,
  ICE_COLOR,
  PUMP_COLOR,
  SNOW_COLOR,
  CHAMBER_COLOR,
  GRANITE_COLOR,
  CEMENT_FILL_COLOR,
  GOLD_SPACE_BASE_COLOR,
  GOLD_PIPE_COLOR,
  CONTAINER_COLOR,
  SPIN_PIPE_COLOR,
  BG_COLOR,
  HOT_PLATE_COLOR,
  SANDSTONE_COLOR,
  STAR_COLOR,
  TREE_COLOR,
  ONE_WAY_BG_COLOR,
  LEAKY_PIPE_COLOR,
  ONE_WAY_ARROW_COLOR,
  SEA_FILL_COLOR,
} from './colors';

/** Width and height of the white border drawn around the minimap (px). */
const BORDER_PX = 2;

/**
 * Target inner dimension (width and height) for the minimap in CSS pixels.
 * The actual size may differ slightly due to integer pixels-per-tile rounding.
 */
const TARGET_SIZE = 60;

/**
 * Compute the total pixel dimensions (width × height) of a minimap canvas
 * for a level grid with the given row and column counts.
 * Includes the surrounding border.
 */
export function minimapDimensions(rows: number, cols: number): { width: number; height: number } {
  const maxDim = Math.max(rows, cols);
  const px = Math.max(1, Math.floor(TARGET_SIZE / maxDim));
  return {
    width: cols * px + 2 * BORDER_PX,
    height: rows * px + 2 * BORDER_PX,
  };
}

/** Returns the fill color to use for a grid tile on the minimap. */
function tileColor(tile: TileDef | null): string {
  if (!tile || tile.shape === PipeShape.Empty) return EMPTY_COLOR;
  switch (tile.shape) {
    case PipeShape.Straight:
    case PipeShape.Elbow:
    case PipeShape.Tee:
    case PipeShape.Cross:
      return PIPE_COLOR;
    case PipeShape.SpinStraight:
    case PipeShape.SpinElbow:
    case PipeShape.SpinTee:
    case PipeShape.SpinStraightCement:
    case PipeShape.SpinElbowCement:
    case PipeShape.SpinTeeCement:
      return SPIN_PIPE_COLOR;
    case PipeShape.LeakyStraight:
    case PipeShape.LeakyElbow:
    case PipeShape.LeakyTee:
    case PipeShape.LeakyCross:
      return LEAKY_PIPE_COLOR;
    case PipeShape.Source:
      return SOURCE_COLOR;
    case PipeShape.Sink:
      return SINK_COLOR;
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':      return TANK_COLOR;
        case 'dirt':      return DIRT_COLOR;
        case 'item':      return CONTAINER_COLOR;
        case 'heater':    return HEATER_COLOR;
        case 'ice':       return ICE_COLOR;
        case 'pump':      return PUMP_COLOR;
        case 'snow':      return SNOW_COLOR;
        case 'hot_plate': return HOT_PLATE_COLOR;
        case 'sandstone': return SANDSTONE_COLOR;
        case 'star':      return STAR_COLOR;
        default:          return CHAMBER_COLOR;
      }
    case PipeShape.Granite:
      return GRANITE_COLOR;
    case PipeShape.Tree:
      return TREE_COLOR;
    case PipeShape.Sea:
      return SEA_FILL_COLOR;
    case PipeShape.Cement:
      return CEMENT_FILL_COLOR;
    case PipeShape.OneWay:
      return ONE_WAY_BG_COLOR;
    case PipeShape.GoldSpace:
      return GOLD_SPACE_BASE_COLOR;
    case PipeShape.GoldStraight:
    case PipeShape.GoldElbow:
    case PipeShape.GoldTee:
    case PipeShape.GoldCross:
      return GOLD_PIPE_COLOR;
    default:
      return BG_COLOR;
  }
}

/** Minimum tile size (px) needed to draw pipe connection lines instead of a flat fill. */
const MIN_PX_FOR_LINES = 3;

/** Pipe shapes that carry directional connections and should be drawn as line art. */
const PIPE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.Straight, PipeShape.Elbow, PipeShape.Tee, PipeShape.Cross,
  PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
  PipeShape.SpinStraight, PipeShape.SpinElbow, PipeShape.SpinTee,
  PipeShape.SpinStraightCement, PipeShape.SpinElbowCement, PipeShape.SpinTeeCement,
  PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross,
]);

/**
 * Draws a tiny wireframe chevron (V-shape) on the minimap to indicate a
 * one-way tile's direction.  The chevron tip points in the one-way direction.
 * Only meaningful when px >= MIN_PX_FOR_LINES.
 */
function drawOneWayChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  rotation: Rotation,
): void {
  const dirs = [Direction.North, Direction.East, Direction.South, Direction.West] as const;
  const dir = dirs[rotation / 90] ?? Direction.North;

  ctx.fillStyle = ONE_WAY_BG_COLOR;
  ctx.fillRect(x, y, px, px);

  const margin = Math.max(1, Math.round(px * 0.15));
  const cx = x + px / 2;
  const cy = y + px / 2;

  // tip = point the chevron aims toward; left/right = the two trailing corners
  let tipX: number, tipY: number, leftX: number, leftY: number, rightX: number, rightY: number;
  switch (dir) {
    case Direction.North:
      tipX = cx;                    tipY = y + margin;
      leftX = x + margin;          leftY = y + px - margin;
      rightX = x + px - margin;    rightY = y + px - margin;
      break;
    case Direction.South:
      tipX = cx;                    tipY = y + px - margin;
      leftX = x + px - margin;     leftY = y + margin;
      rightX = x + margin;         rightY = y + margin;
      break;
    case Direction.East:
      tipX = x + px - margin;      tipY = cy;
      leftX = x + margin;          leftY = y + margin;
      rightX = x + margin;         rightY = y + px - margin;
      break;
    default: // West
      tipX = x + margin;           tipY = cy;
      leftX = x + px - margin;     leftY = y + margin;
      rightX = x + px - margin;    rightY = y + px - margin;
      break;
  }

  ctx.strokeStyle = ONE_WAY_ARROW_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, leftY);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(rightX, rightY);
  ctx.stroke();
}

/**
 * Returns the background fill and line stroke colors for a pipe tile that will
 * be drawn as connection-line art on the minimap.
 */
function pipeLineColors(shape: PipeShape): { bg: string; line: string } {
  if (shape === PipeShape.GoldStraight || shape === PipeShape.GoldElbow ||
      shape === PipeShape.GoldTee || shape === PipeShape.GoldCross) {
    return { bg: GOLD_SPACE_BASE_COLOR, line: GOLD_PIPE_COLOR };
  }
  if (shape === PipeShape.SpinStraight || shape === PipeShape.SpinElbow ||
      shape === PipeShape.SpinTee) {
    return { bg: EMPTY_COLOR, line: SPIN_PIPE_COLOR };
  }
  if (shape === PipeShape.SpinStraightCement || shape === PipeShape.SpinElbowCement ||
      shape === PipeShape.SpinTeeCement) {
    return { bg: CEMENT_FILL_COLOR, line: SPIN_PIPE_COLOR };
  }
  if (shape === PipeShape.LeakyStraight || shape === PipeShape.LeakyElbow ||
      shape === PipeShape.LeakyTee || shape === PipeShape.LeakyCross) {
    return { bg: EMPTY_COLOR, line: LEAKY_PIPE_COLOR };
  }
  return { bg: EMPTY_COLOR, line: PIPE_COLOR };
}

/**
 * Draws a tiny pipe connection-line diagram for one tile.
 * Uses 1-px-wide lines from the tile center to each connected edge.
 * Only meaningful when px >= MIN_PX_FOR_LINES.
 */
function drawPipeLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  shape: PipeShape,
  rotation: Rotation,
): void {
  const { bg, line } = pipeLineColors(shape);
  const halfPx = Math.floor(px / 2); // offset from tile edge to center pixel
  const conns = getConnections(shape, rotation);

  ctx.fillStyle = bg;
  ctx.fillRect(x, y, px, px);

  ctx.fillStyle = line;
  if (conns.has(Direction.North)) {
    ctx.fillRect(x + halfPx, y, 1, halfPx + 1);           // top edge → center
  }
  if (conns.has(Direction.South)) {
    ctx.fillRect(x + halfPx, y + halfPx, 1, px - halfPx); // center → bottom edge
  }
  if (conns.has(Direction.East)) {
    ctx.fillRect(x + halfPx, y + halfPx, px - halfPx, 1); // center → right edge
  }
  if (conns.has(Direction.West)) {
    ctx.fillRect(x, y + halfPx, halfPx + 1, 1);           // left edge → center
  }
}

/**
 * Render a minimap preview for the given level definition.
 *
 * @returns An HTMLCanvasElement containing the minimap image.
 *   The canvas is not appended to the DOM; callers should attach it themselves.
 */
export function renderMinimap(level: LevelDef): HTMLCanvasElement {
  const { width: totalW, height: totalH } = minimapDimensions(level.rows, level.cols);
  const maxDim = Math.max(level.rows, level.cols);
  // At least 1px per tile; larger for smaller grids, capped so the image stays compact.
  const px = Math.max(1, Math.floor(TARGET_SIZE / maxDim));

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('renderMinimap: could not get 2D context from canvas');
    return canvas;
  }

  // White border (fill the entire canvas, then overwrite the interior)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  // Draw each tile as a colored rectangle; pipe tiles get connection-line art when large enough.
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const tile = (level.grid[r]?.[c]) ?? null;
      const tx = BORDER_PX + c * px;
      const ty = BORDER_PX + r * px;
      if (tile && px >= MIN_PX_FOR_LINES && PIPE_SHAPES.has(tile.shape)) {
        drawPipeLines(ctx, tx, ty, px, tile.shape, (tile.rotation ?? 0) as Rotation);
      } else if (tile && px >= MIN_PX_FOR_LINES && tile.shape === PipeShape.OneWay) {
        drawOneWayChevron(ctx, tx, ty, px, (tile.rotation ?? 0) as Rotation);
      } else {
        ctx.fillStyle = tileColor(tile);
        ctx.fillRect(tx, ty, px, px);
      }
    }
  }

  return canvas;
}
