/**
 * Minimap rendering helpers.
 *
 * Renders a tiny pixel-art preview of a level grid onto an HTMLCanvasElement.
 * Each grid tile is represented by 1 or more colored pixels, and the minimap
 * is surrounded by a 2px white border.
 */

import { LevelDef, PipeShape, TileDef } from './types';
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
  GRANITE_FILL_COLOR,
  GOLD_SPACE_BASE_COLOR,
  GOLD_PIPE_COLOR,
  CONTAINER_COLOR,
  SPIN_PIPE_COLOR,
  BG_COLOR,
  HOT_PLATE_COLOR,
} from './colors';

/** Width and height of the white border drawn around the minimap (px). */
const BORDER_PX = 2;

/**
 * Target inner dimension (width and height) for the minimap in CSS pixels.
 * The actual size may differ slightly due to integer pixels-per-tile rounding.
 */
const TARGET_SIZE = 60;

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
      return SPIN_PIPE_COLOR;
    case PipeShape.Source:
      return SOURCE_COLOR;
    case PipeShape.Sink:
      return SINK_COLOR;
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':     return TANK_COLOR;
        case 'dirt':     return DIRT_COLOR;
        case 'item':     return CONTAINER_COLOR;
        case 'heater':   return HEATER_COLOR;
        case 'ice':      return ICE_COLOR;
        case 'pump':     return PUMP_COLOR;
        case 'snow':     return SNOW_COLOR;
        case 'hot_plate': return HOT_PLATE_COLOR;
        default:         return CHAMBER_COLOR;
      }
    case PipeShape.Granite:
      return GRANITE_FILL_COLOR;
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

/**
 * Render a minimap preview for the given level definition.
 *
 * @returns An HTMLCanvasElement containing the minimap image.
 *   The canvas is not appended to the DOM; callers should attach it themselves.
 */
export function renderMinimap(level: LevelDef): HTMLCanvasElement {
  const maxDim = Math.max(level.rows, level.cols);
  // At least 1px per tile; larger for smaller grids, capped so the image stays compact.
  const px = Math.max(1, Math.floor(TARGET_SIZE / maxDim));

  const innerW = level.cols * px;
  const innerH = level.rows * px;
  const totalW = innerW + 2 * BORDER_PX;
  const totalH = innerH + 2 * BORDER_PX;

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

  // Draw each tile as a colored rectangle
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const tile = (level.grid[r]?.[c]) ?? null;
      ctx.fillStyle = tileColor(tile);
      ctx.fillRect(BORDER_PX + c * px, BORDER_PX + r * px, px, px);
    }
  }

  return canvas;
}
