/**
 * Minimap rendering helpers.
 *
 * Renders a tiny pixel-art preview of a level grid onto an HTMLCanvasElement.
 * Each grid tile is represented by 1 or more colored pixels.  The white border
 * that frames the minimap on the chapter map is drawn separately after the image
 * has been scaled, so it remains crisp at any display size.
 */

import type { LevelDef, LevelStyle, Rotation, TileDef} from '../types';
import { Direction, PipeShape, styleToFloorShape } from '../types';
import { getConnections } from '../tile';
import { GOLD_PIPE_SHAPES, isEmptyFloor, computeFloorTypesFromGrid, posKey } from '../board';
import { ginghamColorsForFloor } from '../renderer';
import {
  EMPTY_COLOR,
  PIPE_COLOR,
  FIXED_PIPE_BODY_COLOR,
  SOURCE_COLOR,
  SINK_COLOR,
  TANK_COLOR,
  DIRT_COLOR,
  HEATER_COLOR,
  ICE_COLOR,
  PUMP_COLOR,
  SNOW_COLOR,
  CHAMBER_COLOR,
  CHAMBER_FILL_COLOR,
  GRANITE_FILL_COLOR,
  CEMENT_FILL_COLOR,
  GOLD_SPACE_BASE_COLOR,
  GOLD_PIPE_COLOR,
  CONTAINER_COLOR,
  SPINNER_PIPE_BODY_COLOR,
  BG_COLOR,
  TILE_BG,
  HOT_PLATE_COLOR,
  SANDSTONE_COLOR,
  STAR_COLOR,
  TREE_COLOR,
  TREE_FALL_COLOR,
  TREE_DARK_COLOR,
  TREE_WINTER_COLOR,
  TREE_SPRING_COLOR,
  TREE2_COLOR,
  TREE2_FALL_COLOR,
  TREE2_DARK_COLOR,
  TREE2_WINTER_COLOR,
  TREE2_SPRING_COLOR,
  TREE3_COLOR,
  TREE3_FALL_COLOR,
  TREE3_DARK_COLOR,
  TREE3_WINTER_COLOR,
  TREE3_SPRING_COLOR,
  TREE4_COLOR,
  TREE4_FALL_COLOR,
  TREE4_DARK_COLOR,
  TREE4_WINTER_COLOR,
  TREE4_SPRING_COLOR,
  LEAKY_PIPE_COLOR,
  ONE_WAY_ARROW_COLOR,
  SEA_FILL_COLOR,
  SEA_FILL_COLOR_WINTER,
  SEA_FILL_COLOR_FALL,
  SEA_FILL_COLOR_DARK,
  SEA_FILL_COLOR_SPRING,
} from '../colors';


/**
 * Target inner dimension (width and height) for the minimap canvas in CSS pixels.
 * Sized to be larger than the maximum renderable chamber area (≈82 px at TILE_SIZE 128)
 * so the minimap only ever needs to be scaled down, never up, when fitting it into
 * the level-chamber tile.  The actual rendered size may differ slightly due to
 * integer pixels-per-tile rounding.
 */
const TARGET_SIZE = 100;

/**
 * Compute the total pixel dimensions (width × height) of a minimap canvas
 * for a level grid with the given row and column counts.
 * Does not include the surrounding border (border is drawn separately after scaling).
 */
export function minimapDimensions(rows: number, cols: number): { width: number; height: number } {
  const maxDim = Math.max(rows, cols);
  const px = Math.max(1, Math.floor(TARGET_SIZE / maxDim));
  return {
    width: cols * px,
    height: rows * px,
  };
}

/** Returns the parity-based gingham shade for a tile at grid position (r, c). */
function ginghamShadeForCell(r: number, c: number, floorType: PipeShape): string {
  const [colorLight, colorMid, colorDark] = ginghamColorsForFloor(floorType);
  const paritySum = (r % 2) + (c % 2);
  return paritySum === 0 ? colorLight : paritySum === 2 ? colorDark : colorMid;
}

/** Returns the darker tree color for the given level style. */
function treeColor(style: LevelStyle | undefined): string {
  if (style === 'Fall') return TREE_FALL_COLOR;
  if (style === 'Dark') return TREE_DARK_COLOR;
  if (style === 'Winter') return TREE_WINTER_COLOR;
  if (style === 'Spring') return TREE_SPRING_COLOR;
  return TREE_COLOR;
}

/** Returns the style-dependent main color for Tree 2. */
function tree2Color(style: LevelStyle | undefined): string {
  if (style === 'Fall') return TREE2_FALL_COLOR;
  if (style === 'Dark') return TREE2_DARK_COLOR;
  if (style === 'Winter') return TREE2_WINTER_COLOR;
  if (style === 'Spring') return TREE2_SPRING_COLOR;
  return TREE2_COLOR;
}

/** Returns the style-dependent main color for Tree 3. */
function tree3Color(style: LevelStyle | undefined): string {
  if (style === 'Fall') return TREE3_FALL_COLOR;
  if (style === 'Dark') return TREE3_DARK_COLOR;
  if (style === 'Winter') return TREE3_WINTER_COLOR;
  if (style === 'Spring') return TREE3_SPRING_COLOR;
  return TREE3_COLOR;
}

/** Returns the style-dependent main color for Tree 4. */
function tree4Color(style: LevelStyle | undefined): string {
  if (style === 'Fall') return TREE4_FALL_COLOR;
  if (style === 'Dark') return TREE4_DARK_COLOR;
  if (style === 'Winter') return TREE4_WINTER_COLOR;
  if (style === 'Spring') return TREE4_SPRING_COLOR;
  return TREE4_COLOR;
}

/**
 * Returns the style-dependent main color for a Tree 2/3/4 tile.
 * Dispatches to the appropriate per-variant color function.
 */
function treeVariantColor(shape: PipeShape, style: LevelStyle | undefined): string {
  if (shape === PipeShape.Tree3) return tree3Color(style);
  if (shape === PipeShape.Tree4) return tree4Color(style);
  return tree2Color(style);
}

/** Returns the fill color for Sea (water) tiles, derived from the cell's floor type. */
function seaColor(floorType: PipeShape): string {
  if (floorType === PipeShape.EmptyWinter) return SEA_FILL_COLOR_WINTER;
  if (floorType === PipeShape.EmptyFall) return SEA_FILL_COLOR_FALL;
  if (floorType === PipeShape.EmptyDark) return SEA_FILL_COLOR_DARK;
  if (floorType === PipeShape.EmptySpring) return SEA_FILL_COLOR_SPRING;
  return SEA_FILL_COLOR;
}

/** Returns the stroke color used to draw a Chamber-item (container) tile on the minimap. */
function containerColor(tile: TileDef): string {
  return tile.itemShape !== null && tile.itemShape !== undefined && GOLD_PIPE_SHAPES.has(tile.itemShape)
    ? CONTAINER_COLOR : PIPE_COLOR;
}

/** Chamber outline colors keyed by chamberContent, for the contents with a fixed (non-computed) color. */
const CHAMBER_OUTLINE_COLOR_BY_CONTENT: Partial<Record<string, string>> = {
  tank: TANK_COLOR,
  dirt: DIRT_COLOR,
  heater: HEATER_COLOR,
  ice: ICE_COLOR,
  pump: PUMP_COLOR,
  snow: SNOW_COLOR,
  hot_plate: HOT_PLATE_COLOR,
  sandstone: SANDSTONE_COLOR,
  star: STAR_COLOR,
};

/** Returns the stroke outline color used to draw any Chamber tile on the minimap.
 *  Matches the color used for the chamber type rectangle on the level screen.
 */
function chamberOutlineColor(tile: TileDef): string {
  if (tile.chamberContent === 'item') return containerColor(tile);
  return CHAMBER_OUTLINE_COLOR_BY_CONTENT[tile.chamberContent ?? ''] ?? CHAMBER_COLOR;
}

/** Fixed per-shape fill colors for shapes that don't need floor/chamber-content context. */
const TILE_COLOR_BY_SHAPE: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]: FIXED_PIPE_BODY_COLOR,
  [PipeShape.Elbow]: FIXED_PIPE_BODY_COLOR,
  [PipeShape.Tee]: FIXED_PIPE_BODY_COLOR,
  [PipeShape.Cross]: FIXED_PIPE_BODY_COLOR,
  [PipeShape.SpinStraight]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.SpinElbow]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.SpinTee]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.SpinStraightCement]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.SpinElbowCement]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.SpinTeeCement]: SPINNER_PIPE_BODY_COLOR,
  [PipeShape.LeakyStraight]: LEAKY_PIPE_COLOR,
  [PipeShape.LeakyElbow]: LEAKY_PIPE_COLOR,
  [PipeShape.LeakyTee]: LEAKY_PIPE_COLOR,
  [PipeShape.LeakyCross]: LEAKY_PIPE_COLOR,
  [PipeShape.Source]: SOURCE_COLOR,
  [PipeShape.Sink]: SINK_COLOR,
  [PipeShape.Granite]: GRANITE_FILL_COLOR,
  [PipeShape.Cement]: CEMENT_FILL_COLOR,
  [PipeShape.GoldSpace]: GOLD_SPACE_BASE_COLOR,
  [PipeShape.GoldStraight]: GOLD_PIPE_COLOR,
  [PipeShape.GoldElbow]: GOLD_PIPE_COLOR,
  [PipeShape.GoldTee]: GOLD_PIPE_COLOR,
  [PipeShape.GoldCross]: GOLD_PIPE_COLOR,
};

/** Returns the fill color to use for a grid tile on the minimap.
 * Used for drawing a uniform pixel when tile size < MIN_PX_FOR_LINES.
 */
function tileColor(tile: TileDef | null, r: number, c: number, floorType: PipeShape): string {
  // Empty cells, empty-floor shapes, and OneWay (drawn via its own chevron helper
  // when large enough, gingham background otherwise) all fall back to gingham.
  if (!tile || isEmptyFloor(tile.shape) || tile.shape === PipeShape.OneWay) {
    return ginghamShadeForCell(r, c, floorType);
  }
  if (tile.shape === PipeShape.Chamber) return chamberOutlineColor(tile);
  if (tile.shape === PipeShape.Sea) return seaColor(floorType);
  return TILE_COLOR_BY_SHAPE[tile.shape] ?? BG_COLOR;
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
const CARDINAL_ROTATION_DIRS = [Direction.North, Direction.East, Direction.South, Direction.West] as const;

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
  ginghamBg: string,
): void {
  const dir = CARDINAL_ROTATION_DIRS[rotation / 90] ?? Direction.North;

  ctx.fillStyle = ginghamBg;
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

const GOLD_LINE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.GoldStraight, PipeShape.GoldElbow, PipeShape.GoldTee, PipeShape.GoldCross,
]);
const SPIN_LINE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.SpinStraight, PipeShape.SpinElbow, PipeShape.SpinTee,
]);
const SPIN_CEMENT_LINE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.SpinStraightCement, PipeShape.SpinElbowCement, PipeShape.SpinTeeCement,
]);
const LEAKY_LINE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.LeakyStraight, PipeShape.LeakyElbow, PipeShape.LeakyTee, PipeShape.LeakyCross,
]);

/**
 * Returns the background fill and line stroke colors for a pipe tile that will
 * be drawn as connection-line art on the minimap.
 */
function pipeLineColors(shape: PipeShape): { bg: string; line: string } {
  if (GOLD_LINE_SHAPES.has(shape)) return { bg: GOLD_SPACE_BASE_COLOR, line: GOLD_PIPE_COLOR };
  if (SPIN_LINE_SHAPES.has(shape)) return { bg: EMPTY_COLOR, line: SPINNER_PIPE_BODY_COLOR };
  if (SPIN_CEMENT_LINE_SHAPES.has(shape)) return { bg: CEMENT_FILL_COLOR, line: SPINNER_PIPE_BODY_COLOR };
  if (LEAKY_LINE_SHAPES.has(shape)) return { bg: EMPTY_COLOR, line: LEAKY_PIPE_COLOR };
  return { bg: TILE_BG, line: PIPE_COLOR };
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
 * Draws a tree tile as a tiny filled circle on the minimap.
 * The circle is centered in the tile cell and sized to fill most of it.
 */
function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  color: string,
): void {
  const cx = x + px / 2;
  const cy = y + px / 2;
  const radius = Math.max(0.5, (px - 1) / 2);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Draws a thin hollow rounded rectangle for a container (Chamber-item) tile.
 * The background is filled with the chamber interior color (matching the level screen),
 * then a 1px stroke with a very slight corner radius is drawn.
 */
function drawContainer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  color: string,
): void {
  ctx.fillStyle = CHAMBER_FILL_COLOR;
  ctx.fillRect(x, y, px, px);
  const radius = Math.max(0.5, Math.min(1.5, px * 0.15));
  const inset = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, px - 2 * inset, px - 2 * inset, radius);
  ctx.stroke();
}

const TREE_SHAPES: ReadonlySet<PipeShape> = new Set([
  PipeShape.Tree, PipeShape.Tree2, PipeShape.Tree3, PipeShape.Tree4,
]);

/** The style-dependent main color for a Tree/Tree2/Tree3/Tree4 tile. */
function resolveTreeDrawColor(shape: PipeShape, style: LevelStyle | undefined): string {
  if (shape === PipeShape.Tree) return treeColor(style);
  return treeVariantColor(shape, style);
}

function _isPipeLineTile(tile: TileDef, px: number): boolean {
  return px >= MIN_PX_FOR_LINES && PIPE_SHAPES.has(tile.shape);
}

function _isOneWayLineTile(tile: TileDef, px: number): boolean {
  return px >= MIN_PX_FOR_LINES && tile.shape === PipeShape.OneWay;
}

function _isContainerLineTile(tile: TileDef, px: number): boolean {
  return px >= MIN_PX_FOR_LINES && tile.shape === PipeShape.Chamber;
}

/**
 * Draws `tile` using one of the special-cased renderers (pipe connection-line
 * art, one-way chevron, tree circle, container outline) when it qualifies for
 * one. Returns whether it was handled; the caller falls back to a uniform
 * pixel (`tileColor`) when this returns false.
 */
function _drawSpecialMinimapTile(ctx: CanvasRenderingContext2D, tile: TileDef, tx: number, ty: number, px: number, r: number, c: number, floorType: PipeShape, style: LevelStyle | undefined): boolean {
  if (_isPipeLineTile(tile, px)) {
    drawPipeLines(ctx, tx, ty, px, tile.shape, tile.rotation ?? 0);
    return true;
  }
  if (_isOneWayLineTile(tile, px)) {
    drawOneWayChevron(ctx, tx, ty, px, tile.rotation ?? 0, ginghamShadeForCell(r, c, floorType));
    return true;
  }
  if (TREE_SHAPES.has(tile.shape)) {
    // Fill the cell with the gingham background color first, then draw a circle on top.
    ctx.fillStyle = ginghamShadeForCell(r, c, floorType);
    ctx.fillRect(tx, ty, px, px);
    drawTree(ctx, tx, ty, px, resolveTreeDrawColor(tile.shape, style));
    return true;
  }
  if (_isContainerLineTile(tile, px)) {
    drawContainer(ctx, tx, ty, px, chamberOutlineColor(tile));
    return true;
  }
  return false;
}

/** Draws one grid cell of the minimap: a special-cased renderer if the tile qualifies, else a uniform pixel. */
function drawMinimapTile(ctx: CanvasRenderingContext2D, tile: TileDef | null, tx: number, ty: number, px: number, r: number, c: number, floorType: PipeShape, style: LevelStyle | undefined): void {
  if (tile !== null && _drawSpecialMinimapTile(ctx, tile, tx, ty, px, r, c, floorType, style)) return;
  // Draw the tile as a uniform pixel.
  ctx.fillStyle = tileColor(tile, r, c, floorType);
  ctx.fillRect(tx, ty, px, px);
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

  const style = level.style;
  const defaultFloor = styleToFloorShape(style);

  // Pre-compute the BFS-inferred floor type for every cell so that gingham
  // colors (and the sea-tile palette) match what the main game renderer shows.
  const floorTypes = computeFloorTypesFromGrid(
    level.rows, level.cols,
    (r, c) => {
      const cell = level.grid[r]?.[c] ?? null;
      if (cell === null) return defaultFloor;        // null cell = default empty floor
      return isEmptyFloor(cell.shape) ? cell.shape : null; // non-empty cells: BFS infers
    },
    defaultFloor,
  );

  // Draw each tile as a colored rectangle; pipe tiles get connection-line art when large enough.
  for (let r = 0; r < level.rows; r++) {
    for (let c = 0; c < level.cols; c++) {
      const tile = (level.grid[r]?.[c]) ?? null;
      const tx = c * px;
      const ty = r * px;
      const floorType = floorTypes.get(posKey(r, c)) ?? defaultFloor;
      drawMinimapTile(ctx, tile, tx, ty, px, r, c, floorType, style);
    }
  }

  return canvas;
}
