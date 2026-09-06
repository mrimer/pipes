/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import type { Board} from './board';
import { GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, PIPE_SHAPES, SPIN_PIPE_SHAPES, posKey, parseKey, NEIGHBOUR_DELTA, isEmptyFloor } from './board';
import { Tile, oppositeDirection } from './tile';
import type { GridPos, LevelStyle, ChamberContent} from './types';
import { PipeShape, Direction, COLD_CHAMBER_CONTENTS, floorShapeToStyle } from './types';
import type { PipeFillAnim, PipeDrainAnim } from './visuals/pipeEffects';
import { FILL_ANIM_DURATION } from './visuals/pipeEffects';
import { drawChamber, sandstoneColorState, drawChamberValveIcons } from './renderer/chamberRenderers';
import { drawAmbientDecoration } from './renderer/ambientDecoration';
export { drawAmbientDecoration };
export { LINE_WIDTH, TILE_SIZE, _s, setTileSize, BASE_TILE_SIZE } from './renderer/rendererState';
import { LINE_WIDTH, TILE_SIZE, _s, BASE_TILE_SIZE } from './renderer/rendererState';
import {
  BG_COLOR, TILE_BG,
  EMPTY_COLOR, EMPTY_COLOR_LIGHT, EMPTY_COLOR_DARK,
  EMPTY_FALL_COLOR, EMPTY_FALL_COLOR_LIGHT, EMPTY_FALL_COLOR_DARK,
  EMPTY_DARK_COLOR, EMPTY_DARK_COLOR_LIGHT, EMPTY_DARK_COLOR_DARK,
  EMPTY_WINTER_COLOR, EMPTY_WINTER_COLOR_LIGHT, EMPTY_WINTER_COLOR_DARK,
  EMPTY_SPRING_COLOR, EMPTY_SPRING_COLOR_LIGHT, EMPTY_SPRING_COLOR_DARK,
  GOLD_SPACE_BASE_COLOR, GOLD_SPACE_SHIMMER_COLOR, GOLD_SPACE_BORDER_COLOR,
  PIPE_COLOR, WATER_COLOR,
  SOURCE_COLOR, SOURCE_WATER_COLOR,
  SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR,
  FIXED_PIPE_BODY_COLOR,
  DIRT_WATER_COLOR, DIRT_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR,
  CHAMBER_COLOR, CHAMBER_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR,
  TREE_FALL_COLOR, TREE_FALL_LEAF_COLOR, TREE_FALL_LEAF_ALT_COLOR,
  TREE_DARK_COLOR, TREE_DARK_LEAF_COLOR, TREE_DARK_LEAF_ALT_COLOR,
  TREE_WINTER_COLOR, TREE_WINTER_LEAF_COLOR, TREE_WINTER_LEAF_ALT_COLOR,
  TREE_SPRING_COLOR, TREE_SPRING_LEAF_COLOR, TREE_SPRING_LEAF_ALT_COLOR,
  TREE_SHADOW_COLOR,
  TREE2_COLOR, TREE2_LEAF_COLOR, TREE2_LEAF_ALT_COLOR,
  TREE2_FALL_COLOR, TREE2_FALL_LEAF_COLOR, TREE2_FALL_LEAF_ALT_COLOR,
  TREE2_DARK_COLOR, TREE2_DARK_LEAF_COLOR, TREE2_DARK_LEAF_ALT_COLOR,
  TREE2_WINTER_COLOR, TREE2_WINTER_LEAF_COLOR, TREE2_WINTER_LEAF_ALT_COLOR,
  TREE2_SPRING_COLOR, TREE2_SPRING_LEAF_COLOR, TREE2_SPRING_LEAF_ALT_COLOR,
  TREE3_COLOR, TREE3_LEAF_COLOR, TREE3_LEAF_ALT_COLOR,
  TREE3_FALL_COLOR, TREE3_FALL_LEAF_COLOR, TREE3_FALL_LEAF_ALT_COLOR,
  TREE3_DARK_COLOR, TREE3_DARK_LEAF_COLOR, TREE3_DARK_LEAF_ALT_COLOR,
  TREE3_WINTER_COLOR, TREE3_WINTER_LEAF_COLOR, TREE3_WINTER_LEAF_ALT_COLOR,
  TREE3_SPRING_COLOR, TREE3_SPRING_LEAF_COLOR, TREE3_SPRING_LEAF_ALT_COLOR,
  TREE4_COLOR, TREE4_LEAF_COLOR, TREE4_LEAF_ALT_COLOR,
  TREE4_FALL_COLOR, TREE4_FALL_LEAF_COLOR, TREE4_FALL_LEAF_ALT_COLOR,
  TREE4_DARK_COLOR, TREE4_DARK_LEAF_COLOR, TREE4_DARK_LEAF_ALT_COLOR,
  TREE4_WINTER_COLOR, TREE4_WINTER_LEAF_COLOR, TREE4_WINTER_LEAF_ALT_COLOR,
  TREE4_SPRING_COLOR, TREE4_SPRING_LEAF_COLOR, TREE4_SPRING_LEAF_ALT_COLOR,
  CEMENT_COLOR, CEMENT_FILL_COLOR, CEMENT_FILL_HARDENED_COLOR,
  GOLD_PIPE_COLOR, GOLD_PIPE_WATER_COLOR,
  LABEL_COLOR,
  REMOVABLE_BG_COLOR,
  HEATER_COLOR, HEATER_WATER_COLOR,
  COOLER_COLOR, COOLER_WATER_COLOR,
  ICE_COLOR, ICE_WATER_COLOR,
  PUMP_COLOR, PUMP_WATER_COLOR,
  VACUUM_COLOR, VACUUM_WATER_COLOR,
  SNOW_COLOR, SNOW_WATER_COLOR,
  SANDSTONE_COLOR, SANDSTONE_WATER_COLOR,
  SANDSTONE_HARD_COLOR, SANDSTONE_HARD_WATER_COLOR,
  SANDSTONE_SHATTER_COLOR, SANDSTONE_SHATTER_WATER_COLOR,
  HOT_PLATE_COLOR, HOT_PLATE_WATER_COLOR,
  GEL_COLOR, GEL_WATER_COLOR,
  SIPHON_COLOR, SIPHON_WATER_COLOR,
  REGULATOR_COLOR, REGULATOR_WATER_COLOR,
  ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER,
  LEAKY_PIPE_COLOR, LEAKY_PIPE_WATER_COLOR, LEAKY_RUST_COLOR,
  SEA_COLOR, SEA_BORDER_COLOR,
  SEA_FILL_COLOR, SEA_FILL_COLOR_WINTER, SEA_FILL_COLOR_FALL, SEA_FILL_COLOR_DARK, SEA_FILL_COLOR_SPRING,
} from './colors';

/** Unit-vector table for the four cardinal directions: [Direction, x-unit, y-unit]. */
const CARDINAL_DIRS: [Direction, number, number][] = [
  [Direction.North, 0, -1],
  [Direction.South, 0,  1],
  [Direction.East,  1,  0],
  [Direction.West, -1,  0],
];

/** Border color used for error-highlighted sandstone tiles. */
const ERROR_HIGHLIGHT_BORDER = '#ff2020';

/** Fill color for the hover-preview tile glow shadow. */
const PREVIEW_SHADOW_COLOR = '#ffff00';

/** Blur radius (px) for the hover-preview tile glow shadow. */
const PREVIEW_SHADOW_BLUR = 14;

/** Edge highlight color for neighbors that would form a new connection (dry). */
const CONNECTION_PREVIEW_COLOR = '#4caf50';

/** Edge highlight color for neighbors that would form a new connection (water-filled). */
const CONNECTION_PREVIEW_WATER_COLOR = '#56c8e8';

/** Edge highlight color for neighbors that would lose an existing connection. */
const DISCONNECTION_PREVIEW_COLOR = '#e57373';

/** Rotation speed for the spin-arrow hover animation, in radians per millisecond (one full turn per 1.5 s). */
const SPIN_ANIM_SPEED = (2 * Math.PI) / 1500;

/** Fill color for the hex bolt head drawn at the corners of pre-placed fixed pipe tiles. */
const BOLT_FILL_COLOR = 'rgba(128,128,134,0.82)';
/** Border color for the hex bolt head. */
const BOLT_BORDER_COLOR = 'rgba(72,72,78,0.90)';

/**
 * Reused scratch set for converting absolute butt-end directions to local tile
 * directions in drawTile's hot path without allocating a new Set per tile.
 */
const LOCAL_BUTT_END_DIRS_BUFFER = new Set<Direction>();

/**
 * Positions of the 3 landing-strip triangles along a Source/Sink connector arm,
 * as fractions of `half` (the half tile size).
 */
const CONNECTOR_TRI_FRACS = [0.58, 0.72, 0.86] as const;
/** Depth (along-arm extent) of each landing-strip triangle, as a fraction of `half`. */
const CONNECTOR_TRI_DEPTH = 0.10;
/** Half-width (perpendicular extent) of each landing-strip triangle, as a fraction of `half`. */
const CONNECTOR_TRI_WING  = 0.09;

/** Number of distinct triangle positions (steps) in one landing-strip cycle. */
const CONNECTOR_LIGHT_STEPS = CONNECTOR_TRI_FRACS.length;
/** Full landing-strip cycle duration in ms (CONNECTOR_LIGHT_STEPS steps × 300 ms each). */
const CONNECTOR_LIGHT_CYCLE_MS = CONNECTOR_LIGHT_STEPS * 300;

/**
 * Compute which triangle index (0 … CONNECTOR_LIGHT_STEPS−1) should be lit
 * at the given timestamp.
 */
export function connectorLitIndex(now: number): number {
  return Math.floor((now % CONNECTOR_LIGHT_CYCLE_MS) / (CONNECTOR_LIGHT_CYCLE_MS / CONNECTOR_LIGHT_STEPS));
}

/**
 * Exported alias for `_s`.  Allows other modules (e.g. campaignEditor/renderer)
 * to scale pixel constants using the same factor.
 */
export function scalePx(n: number): number {
  return _s(n);
}

/**
 * Compute the largest tile size between 64 and 128 px (inclusive) such that
 * the full grid fits within the current window's inner dimensions.
 * Returns BASE_TILE_SIZE (64) when no window is available or the grid already
 * overflows at the base size.
 *
 * @param vOverhead         Vertical pixels already consumed by UI elements
 *                          outside the grid (e.g. title, header buttons,
 *                          panels below the grid).  Subtracted from the
 *                          available height before the tile size is computed
 *                          so that those elements can all fit on screen at
 *                          once.  Ignored when {@link constrainVertical} is
 *                          `false`.
 * @param hOverhead         Horizontal pixels already consumed by UI elements
 *                          beside the grid (e.g. canvas CSS border left +
 *                          right).  Subtracted from the available width so
 *                          the grid's full border-box stays within the
 *                          viewport and does not trigger a horizontal
 *                          scrollbar.
 * @param constrainVertical When `true` (the default) the tile size is also
 *                          constrained so the grid fits vertically in the
 *                          viewport (intended for the chapter map screen).
 *                          Pass `false` to size purely by available width,
 *                          e.g. on the level editor screen where the board
 *                          can scroll vertically.
 */
export interface TileSizeOptions {
  vOverhead?: number;
  hOverhead?: number;
  constrainVertical?: boolean;
}

export function computeTileSize(rows: number, cols: number, opts: TileSizeOptions = {}): number {
  const { vOverhead = 0, hOverhead = 0, constrainVertical = true } = opts;
  if (typeof window === 'undefined') return BASE_TILE_SIZE;
  const avW = window.innerWidth - hOverhead;
  const maxFitW = Math.floor(avW / cols);
  if (!constrainVertical) {
    return Math.max(BASE_TILE_SIZE, Math.min(128, maxFitW));
  }
  const avH = window.innerHeight - vOverhead;
  const maxFit = Math.floor(Math.min(avW / cols, avH / rows));
  return Math.max(BASE_TILE_SIZE, Math.min(128, maxFit));
}

export { SHAPE_ABBREV, buildShapeIcon, getTileDisplayName, getInventoryItemDisplayName } from './renderer/tileDisplayNames';

/**
 * Draw a curved rotation arrow with a black outline, centered at the canvas
 * origin.  When `ccw` is false (default) the arrow points clockwise; when true
 * it points counter-clockwise.  Used to indicate the direction a spinnable
 * pipe will be rotated on click.
 * The caller is responsible for translating the context to the desired center.
 */
export function drawSpinArrow(ctx: CanvasRenderingContext2D, ccw = false): void {
  const r = _s(11);
  // CW: arc spans ~270° clockwise: start at 150°, end at 60°.
  // CCW: mirror by negating angles – start at 30° (=–150°), end at –60° (= 300°).
  const startAngle = ccw ? (30 * Math.PI) / 180 : (150 * Math.PI) / 180;
  const sweep     = (270 * Math.PI) / 180;
  const endAngle  = ccw ? startAngle - sweep : startAngle + sweep;
  // Tip of the arrowhead: the point on the circle at endAngle (normalized to 0–2π).
  const tipAngle = ((endAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const tipX = r * Math.cos(tipAngle);
  const tipY = r * Math.sin(tipAngle);
  // Tangent direction at tipAngle.  For CW (increasing angle) the tangent is
  // (-sin, cos); for CCW (decreasing angle) it is reversed: (sin, -cos).
  const tdx = ccw ?  Math.sin(tipAngle) : -Math.sin(tipAngle);
  const tdy = ccw ? -Math.cos(tipAngle) :  Math.cos(tipAngle);
  // Arrowhead dimensions.
  const headLen = _s(5);
  const headHalf = _s(3);
  const baseX = tipX - tdx * headLen;
  const baseY = tipY - tdy * headLen;
  const p1x = baseX + tdy * headHalf;
  const p1y = baseY - tdx * headHalf;
  const p2x = baseX - tdy * headHalf;
  const p2y = baseY + tdx * headHalf;

  // Draw black outline layer.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = _s(3);
  ctx.strokeStyle = 'black';
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle, ccw);
  ctx.stroke();
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.fill();

  // Draw white arrow on top.
  ctx.lineWidth = _s(1.5);
  ctx.strokeStyle = 'white';
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, endAngle, ccw);
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw 3 small dark filled triangles along one connector arm.
 * The triangles act as the unlit base of the landing-strip light markers.
 *
 * @param ctx       Canvas rendering context (translation already applied so origin = tile center).
 * @param nx        X component of the arm unit vector (±1 or 0).
 * @param ny        Y component of the arm unit vector (±1 or 0).
 * @param half      Half the tile size in canvas pixels.
 * @param isSource  When true triangles point outward (away from centre);
 *                  when false they point inward (toward centre).
 */
function drawArmTriangles(
  ctx: CanvasRenderingContext2D, nx: number, ny: number, opts: Pick<DrawSourceOrSinkOptions, 'half' | 'isSource'>,
): void {
  const { half, isSource } = opts;
  const depth = half * CONNECTOR_TRI_DEPTH;
  const wing  = half * CONNECTOR_TRI_WING;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const frac of CONNECTOR_TRI_FRACS) {
    const d = half * frac;
    ctx.beginPath();
    if (isSource) {
      // Tip points away from centre
      ctx.moveTo(nx * (d + depth / 2), ny * (d + depth / 2));
      ctx.lineTo(nx * (d - depth / 2) - ny * wing, ny * (d - depth / 2) + nx * wing);
      ctx.lineTo(nx * (d - depth / 2) + ny * wing, ny * (d - depth / 2) - nx * wing);
    } else {
      // Tip points toward centre
      ctx.moveTo(nx * (d - depth / 2), ny * (d - depth / 2));
      ctx.lineTo(nx * (d + depth / 2) - ny * wing, ny * (d + depth / 2) + nx * wing);
      ctx.lineTo(nx * (d + depth / 2) + ny * wing, ny * (d + depth / 2) - nx * wing);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Draw the animated landing-strip light glow for one frame on a Source or Sink tile.
 * Call once per animation frame BEFORE particle effects so the glow renders below droplets.
 *
 * @param ctx         Canvas rendering context.
 * @param cx          Canvas x-coordinate of the tile center.
 * @param cy          Canvas y-coordinate of the tile center.
 * @param connections Set of directions this tile connects to.
 * @param isSource    true for source (outward triangles), false for sink (inward triangles).
 * @param brightColor Lit color (brighter than the tile's main hue).
 * @param half        Half the tile size in canvas pixels.
 * @param litIndex    Which step of the sequence is lit (0, 1, or 2).
 */
export interface ConnectorGlowOptions {
  connections: Set<Direction>;
  isSource: boolean;
  brightColor: string;
  half: number;
  litIndex: number;
}

export function drawConnectorGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  opts: ConnectorGlowOptions,
): void {
  const { connections, isSource, brightColor, half, litIndex } = opts;
  const depth = half * CONNECTOR_TRI_DEPTH;
  const wing  = half * CONNECTOR_TRI_WING;
  // Source: sequence moves outward (0→1→2 maps to nearest→farthest).
  // Sink:   sequence moves inward  (0→1→2 maps to farthest→nearest).
  const posIndex = isSource ? litIndex : (2 - litIndex);
  const d = half * CONNECTOR_TRI_FRACS[posIndex];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = brightColor;
  ctx.shadowColor = brightColor;
  ctx.shadowBlur = _s(6);

  for (const [dir, nx, ny] of CARDINAL_DIRS) {
    if (!connections.has(dir)) continue;
    ctx.beginPath();
    if (isSource) {
      ctx.moveTo(nx * (d + depth / 2), ny * (d + depth / 2));
      ctx.lineTo(nx * (d - depth / 2) - ny * wing, ny * (d - depth / 2) + nx * wing);
      ctx.lineTo(nx * (d - depth / 2) + ny * wing, ny * (d - depth / 2) - nx * wing);
    } else {
      ctx.moveTo(nx * (d - depth / 2), ny * (d - depth / 2));
      ctx.lineTo(nx * (d + depth / 2) - ny * wing, ny * (d + depth / 2) + nx * wing);
      ctx.lineTo(nx * (d + depth / 2) + ny * wing, ny * (d + depth / 2) - nx * wing);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draw a Source or Sink tile: outer circle, radiating arms with landing-strip
 * triangle markers, and a shape-specific centre motif.
 *
 * Call with the canvas already translated to the tile centre.
 *
 * @param ctx         Canvas rendering context (origin = tile centre).
 * @param opts - Rendering options.
 * @param opts.connections Set of outgoing arm directions for this tile.
 * @param opts.color       Arm and decoration colour (dry or water).
 * @param opts.half        Half the tile size in canvas pixels.
 * @param opts.isSource    true for Source (outward triangles, gradient), false for Sink (bullseye).
 * @param opts.buttEndDirs Optional set of arm directions that should use flat (butt) end caps.
 * @param opts.centerLabel Optional label to draw at the centre. When omitted no label is drawn.
 * @param opts.bgColor     Fill colour for the outer-circle background (defaults to TILE_BG).
 * @param opts.afterOuterCircleFn  Optional callback invoked after the outer circle (fill +
 *                                 outline) is drawn and before the connector arms are drawn.
 *                                 Use this to render effects (e.g. vortex particles) that
 *                                 should appear above the tile circle backdrop but below the
 *                                 arms.  Only called for the Sink tile (when isSource=false).
 */
export interface DrawSourceOrSinkOptions {
  connections: ReadonlySet<Direction>;
  color: string;
  half: number;
  isSource: boolean;
  buttEndDirs?: Set<Direction>;
  centerLabel?: { text: string; color: string };
  bgColor?: string;
  afterOuterCircleFn?: () => void;
}

/** Pass 1: all arm black outlines, then the black filled centre cap covering the junction seam. */
function _drawSourceOrSinkArmOutlines(
  ctx: CanvasRenderingContext2D, connections: ReadonlySet<Direction>, buttEndDirs: Set<Direction> | undefined, half: number,
): void {
  ctx.lineWidth = LINE_WIDTH + _s(3);
  ctx.strokeStyle = 'black';
  for (const [dir, nx, ny] of CARDINAL_DIRS) {
    if (!connections.has(dir)) continue;
    ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(nx * half, ny * half);
    ctx.stroke();
  }
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(0, 0, (LINE_WIDTH + _s(3)) / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Pass 2: all arm coloured fills + landing-strip triangles, then the coloured filled centre cap. */
function _drawSourceOrSinkArmFills(ctx: CanvasRenderingContext2D, opts: DrawSourceOrSinkOptions): void {
  const { connections, buttEndDirs, half, color } = opts;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = color;
  for (const [dir, nx, ny] of CARDINAL_DIRS) {
    if (!connections.has(dir)) continue;
    ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(nx * half, ny * half);
    ctx.stroke();
    // 3 small dark triangles along the arm (landing-strip base markers)
    drawArmTriangles(ctx, nx, ny, opts);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, LINE_WIDTH / 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Central circle with radial gradient – bright glow at centre fading to the tile colour – plus the outer aperture ring. */
function _drawSourceCenterDecoration(ctx: CanvasRenderingContext2D, half: number, color: string): void {
  const circleR = half * 0.35;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, circleR);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, circleR, 0, Math.PI * 2);
  ctx.fill();
  // Outer aperture ring – suggests a nozzle opening
  ctx.strokeStyle = color;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Bullseye / drain pattern – concentric stroke rings with a solid innermost dot.
 * Drawn after the arms so the rings remain visible on top of the arm fills.
 */
function _drawSinkCenterDecoration(ctx: CanvasRenderingContext2D, half: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

/** Optional centre label – drawn last so it appears on top of all decorations. */
function _drawSourceOrSinkCenterLabel(ctx: CanvasRenderingContext2D, centerLabel: { text: string; color: string } | undefined): void {
  if (centerLabel === undefined) return;
  ctx.save();
  ctx.fillStyle = centerLabel.color;
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = _s(2);
  ctx.fillText(centerLabel.text, 0, 0);
  ctx.restore();
}

export function drawSourceOrSink(ctx: CanvasRenderingContext2D, opts: DrawSourceOrSinkOptions): void {
  const { connections, color, half, isSource, buttEndDirs, centerLabel, bgColor, afterOuterCircleFn } = opts;
  // Outer circle radius: aperture ring (source) or outermost bullseye ring (sink).
  const outerR = isSource ? half * 0.5 : half * 0.45;

  // Fill the outer circle with the tile background color so it sits as a solid
  // area above any background pattern (gingham etc.) but below the arms and
  // centre decorations.
  ctx.fillStyle = bgColor ?? TILE_BG;
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Thin black outline on the outer circle edge (drawn before arms so arms sit on top).
  ctx.strokeStyle = 'black';
  ctx.lineWidth = _s(4.5);
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.stroke();

  // For the sink, invoke the optional overlay callback (e.g. vortex particles) now
  // so it appears above the outer-circle backdrop but below the connector arms.
  if (!isSource) afterOuterCircleFn?.();

  // Radiating lines – drawn as two passes (all black outlines first, then all
  // coloured fills) so that no arm's black outline overwrites an already-painted
  // arm's colour at the centre junction, which would leave visible black artefacts.
  _drawSourceOrSinkArmOutlines(ctx, connections, buttEndDirs, half);
  _drawSourceOrSinkArmFills(ctx, opts);

  if (isSource) {
    _drawSourceCenterDecoration(ctx, half, color);
  } else {
    _drawSinkCenterDecoration(ctx, half, color);
  }

  _drawSourceOrSinkCenterLabel(ctx, centerLabel);
}

/**
 * Adjacency descriptor for granite tiles.  Each field indicates whether the
 * neighbor in that direction is also a granite tile.
 */
export interface GraniteNeighbors {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
  nw: boolean;
  ne: boolean;
  sw: boolean;
  se: boolean;
}

/**
 * Compute granite-tile neighbor data for the tile at (row, col) on the given board.
 * Returns which of the 8 neighbors are granite tiles. Out-of-bounds positions are
 * treated as granite so border tiles seam closed against level boundaries.
 */
export function computeGraniteNeighbors(board: Board, row: number, col: number): GraniteNeighbors {
  const _isGranite = (r: number, c: number): boolean =>
    r < 0 || r >= board.rows || c < 0 || c >= board.cols ||
    board.grid[r][c].shape === PipeShape.Granite;
  return {
    north: _isGranite(row - 1, col),
    south: _isGranite(row + 1, col),
    west:  _isGranite(row, col - 1),
    east:  _isGranite(row, col + 1),
    nw:    _isGranite(row - 1, col - 1),
    ne:    _isGranite(row - 1, col + 1),
    sw:    _isGranite(row + 1, col - 1),
    se:    _isGranite(row + 1, col + 1),
  };
}

/** Return [light, mid, dark] gingham colors for the given empty floor type. */
export function ginghamColorsForFloor(floorType: PipeShape): [string, string, string] {
  if (floorType === PipeShape.EmptyFall) return [EMPTY_FALL_COLOR_LIGHT, EMPTY_FALL_COLOR, EMPTY_FALL_COLOR_DARK];
  if (floorType === PipeShape.EmptyDark) return [EMPTY_DARK_COLOR_LIGHT, EMPTY_DARK_COLOR, EMPTY_DARK_COLOR_DARK];
  if (floorType === PipeShape.EmptyWinter) return [EMPTY_WINTER_COLOR_LIGHT, EMPTY_WINTER_COLOR, EMPTY_WINTER_COLOR_DARK];
  if (floorType === PipeShape.EmptySpring) return [EMPTY_SPRING_COLOR_LIGHT, EMPTY_SPRING_COLOR, EMPTY_SPRING_COLOR_DARK];
  return [EMPTY_COLOR_LIGHT, EMPTY_COLOR, EMPTY_COLOR_DARK];
}

/**
 * Draw a 50% transparent gingham overlay in the given rectangle.
 * Tile parity (r, c) determines which gingham shade to use.
 * floorType controls the gingham color palette (default: grass green).
 */
export function drawGinghamOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  r: number, c: number,
  floorType: PipeShape = PipeShape.Empty,
  alpha: number = 0.5,
): void {
  const [colorLight, colorMid, colorDark] = ginghamColorsForFloor(floorType);
  const paritySum = (r % 2) + (c % 2);
  const ginghamBase = paritySum === 0 ? colorLight
    : paritySum === 2 ? colorDark
    : colorMid;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = ginghamBase;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * True when a diagonal corner between two adjacent granite/sea edges is
 * itself also granite/sea — the corner square is fully surrounded and
 * should be filled solid to avoid a sub-pixel seam.
 */
function _isCornerFilled(edgeA: boolean, edgeB: boolean, diagonal: boolean): boolean {
  return edgeA && edgeB && diagonal;
}

/**
 * True when two adjacent edges are granite/sea but the diagonal between
 * them is not — the corner square would otherwise be left as an uncovered
 * (or under-bordered) gap and needs an explicit fill/border segment.
 */
function _isCornerExposed(edgeA: boolean, edgeB: boolean, diagonal: boolean): boolean {
  return edgeA && edgeB && !diagonal;
}

/**
 * Draw a granite tile centered at the origin.
 *
 * When `neighbors` is provided the shape seams cleanly with adjacent granite
 * tiles: each edge that touches another granite tile is extended to the tile
 * boundary without a border, corner fills are added when all three surrounding
 * granite tiles are present, and an L-shaped inset border marks corners where
 * two edges are adjacent to granite but the diagonal is not.
 */
interface GraniteGeometry {
  bw: number;
  bh: number;
  outerHalf: number;
  OVERLAP: number;
}

/**
 * Round inner boundary to integer pixels so fillRect calls share exact
 * coordinates.  Ceiling of half is used as the outer boundary: for even
 * tile sizes outerHalf === half (integer), for odd tile sizes (where
 * half = TILE_SIZE/2 is fractional) it rounds up by ½px so the strips
 * extend just past the tile boundary.  This guarantees that adjacent tiles'
 * strips overlap rather than merely abut, eliminating sub-pixel seams under
 * any CSS zoom level.  All resulting size expressions are then pure integers.
 */
function _computeGraniteGeometry(half: number): GraniteGeometry {
  return {
    bw: Math.round(half * 0.7),
    bh: Math.round(half * 0.7),
    outerHalf: Math.ceil(half),
    OVERLAP: 1, // 1-pixel overlap margin: strips extend this many pixels into the core.
  };
}

/**
 * Edge extension strips toward adjacent granite tiles.
 * Each strip overlaps the core by OVERLAP px to eliminate sub-pixel seams,
 * and each edge strip is extended 1px INTO the core rectangle so that the
 * shared boundary pixel is fully covered, preventing a sub-pixel seam that
 * appears when the tile center (cx/cy) lands on a half-integer canvas
 * coordinate (i.e. when TILE_SIZE is odd).
 */
function _fillGraniteEdgeStrips(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  const { bw, bh, outerHalf, OVERLAP } = g;
  if (n.north) ctx.fillRect(-bw, -outerHalf,      bw * 2,          outerHalf - bh + OVERLAP);
  if (n.south) ctx.fillRect(-bw, bh - OVERLAP,    bw * 2,          outerHalf - bh + OVERLAP);
  if (n.west)  ctx.fillRect(-outerHalf, -bh,       outerHalf - bw + OVERLAP,  bh * 2);
  if (n.east)  ctx.fillRect(bw - OVERLAP, -bh,     outerHalf - bw + OVERLAP,  bh * 2);
}

/**
 * Corner fills: only when both edge neighbors AND the diagonal are granite.
 * Extended by OVERLAP in both dimensions to cover the boundary pixel shared
 * with the adjacent strips.
 */
function _fillGraniteCorners(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  const { bw, bh, outerHalf, OVERLAP } = g;
  if (_isCornerFilled(n.north, n.west, n.nw)) ctx.fillRect(-outerHalf, -outerHalf, outerHalf - bw + OVERLAP, outerHalf - bh + OVERLAP);
  if (_isCornerFilled(n.north, n.east, n.ne)) ctx.fillRect(bw - OVERLAP, -outerHalf, outerHalf - bw + OVERLAP, outerHalf - bh + OVERLAP);
  if (_isCornerFilled(n.south, n.west, n.sw)) ctx.fillRect(-outerHalf, bh - OVERLAP, outerHalf - bw + OVERLAP, outerHalf - bh + OVERLAP);
  if (_isCornerFilled(n.south, n.east, n.se)) ctx.fillRect(bw - OVERLAP, bh - OVERLAP, outerHalf - bw + OVERLAP, outerHalf - bh + OVERLAP);
}

// Top border (y = -bh): skip when north is granite
function _traceGraniteTopBorder(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  if (n.north) return;
  const { bw, bh, outerHalf } = g;
  ctx.moveTo(n.west ? -outerHalf : -bw, -bh);
  ctx.lineTo(n.east ?  outerHalf :  bw, -bh);
}

// Bottom border (y = +bh): skip when south is granite
function _traceGraniteBottomBorder(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  if (n.south) return;
  const { bw, bh, outerHalf } = g;
  ctx.moveTo(n.west ? -outerHalf : -bw, bh);
  ctx.lineTo(n.east ?  outerHalf :  bw, bh);
}

// Left border (x = -bw): skip when west is granite
function _traceGraniteLeftBorder(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  if (n.west) return;
  const { bw, bh, outerHalf } = g;
  ctx.moveTo(-bw, n.north ? -outerHalf : -bh);
  ctx.lineTo(-bw, n.south ?  outerHalf :  bh);
}

// Right border (x = +bw): skip when east is granite
function _traceGraniteRightBorder(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  if (n.east) return;
  const { bw, bh, outerHalf } = g;
  ctx.moveTo(bw, n.north ? -outerHalf : -bh);
  ctx.lineTo(bw, n.south ?  outerHalf :  bh);
}

/**
 * Draw border only on edges that are NOT adjacent to granite.
 * Each exposed edge is drawn as a line at the inset level (±bw / ±bh),
 * extended to the tile boundary when the perpendicular edges are adjacent to
 * granite so that the border visually closes the filled shape.
 */
function _traceGraniteBorderEdges(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  _traceGraniteTopBorder(ctx, n, g);
  _traceGraniteBottomBorder(ctx, n, g);
  _traceGraniteLeftBorder(ctx, n, g);
  _traceGraniteRightBorder(ctx, n, g);
}

/**
 * L-shaped inset borders at corners where two edges are granite but the
 * diagonal is not.  These trace the inner boundary of the unfilled corner
 * gap and connect cleanly to the adjacent tiles' inset border lines.
 */
function _traceGraniteBorderCorners(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  const { bw, bh, outerHalf } = g;
  if (_isCornerExposed(n.north, n.west, n.nw)) { ctx.moveTo(-outerHalf, -bh); ctx.lineTo(-bw, -bh); ctx.lineTo(-bw, -outerHalf); }
  if (_isCornerExposed(n.north, n.east, n.ne)) { ctx.moveTo( outerHalf, -bh); ctx.lineTo( bw, -bh); ctx.lineTo( bw, -outerHalf); }
  if (_isCornerExposed(n.south, n.west, n.sw)) { ctx.moveTo(-outerHalf,  bh); ctx.lineTo(-bw,  bh); ctx.lineTo(-bw,  outerHalf); }
  if (_isCornerExposed(n.south, n.east, n.se)) { ctx.moveTo( outerHalf,  bh); ctx.lineTo( bw,  bh); ctx.lineTo( bw,  outerHalf); }
}

function _strokeGraniteBorder(ctx: CanvasRenderingContext2D, n: GraniteNeighbors, g: GraniteGeometry): void {
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(3);
  ctx.beginPath();
  _traceGraniteBorderEdges(ctx, n, g);
  _traceGraniteBorderCorners(ctx, n, g);
  ctx.stroke();
}

/** A few crack-like lines confined to the core inset rectangle, for stone texture. */
function _drawGraniteTexture(ctx: CanvasRenderingContext2D, bw: number, bh: number): void {
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath(); ctx.moveTo(-bw + _s(4), -bh + _s(10)); ctx.lineTo(bw - _s(6), -bh + _s(16)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(2), _s(2));         ctx.lineTo(bw - _s(8), _s(8));        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(6), bh - _s(14));   ctx.lineTo(bw - _s(4), bh - _s(8));  ctx.stroke();
}

export function drawGranite(
  ctx: CanvasRenderingContext2D,
  half: number,
  neighbors?: GraniteNeighbors,
): void {
  const n = neighbors ?? { north: false, south: false, east: false, west: false, nw: false, ne: false, sw: false, se: false };
  const g = _computeGraniteGeometry(half);

  ctx.fillStyle = GRANITE_FILL_COLOR;
  // Core inset rectangle (always drawn)
  ctx.fillRect(-g.bw, -g.bh, g.bw * 2, g.bh * 2);
  _fillGraniteEdgeStrips(ctx, n, g);
  _fillGraniteCorners(ctx, n, g);

  _strokeGraniteBorder(ctx, n, g);

  _drawGraniteTexture(ctx, g.bw, g.bh);
}

/** Draw a 2-D top-down tree (fern/palm style) centered at the origin. */
export function drawTree(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const treeColors: Record<string, [string, string, string]> = {
    Fall:   [TREE_FALL_LEAF_COLOR,    TREE_FALL_LEAF_ALT_COLOR,    TREE_FALL_COLOR],
    Dark:   [TREE_DARK_LEAF_COLOR,    TREE_DARK_LEAF_ALT_COLOR,    TREE_DARK_COLOR],
    Winter: [TREE_WINTER_LEAF_COLOR,  TREE_WINTER_LEAF_ALT_COLOR,  TREE_WINTER_COLOR],
    Spring: [TREE_SPRING_LEAF_COLOR,  TREE_SPRING_LEAF_ALT_COLOR,  TREE_SPRING_COLOR],
  };
  const [leafColor, leafAltColor, outlineColor] = (style && treeColors[style]) ?? [TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_COLOR];
  const r = half * 0.75; // outer canopy radius – occupies most of the tile
  _drawTreeCircleShadow(ctx, half, r, style);
  // Main canopy – large dark-green filled circle
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Leaf clusters – four overlapping lighter-green lobes around the edge
  const lobeR = r * 0.48;
  const lobeOff = r * 0.52;
  ctx.fillStyle = leafAltColor;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * lobeOff, Math.sin(angle) * lobeOff, lobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Diagonal leaf clusters (45°) – smaller, medium green
  const dLobeR = lobeR * 0.72;
  const dLobeOff = lobeOff * 0.88;
  ctx.fillStyle = leafColor;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dLobeOff, Math.sin(angle) * dLobeOff, dLobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small brown trunk circle in the center – omitted as the trunk would not be
  // visible from a top-down aerial perspective; the canopy fully covers it.
  // Dark green outline around the whole canopy
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = _s(2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Draw a clipped circular shadow for a tree canopy.
 * Skipped for Dark style (no strong light source).
 */
/** Shared clip/fill setup for a tree's ground shadow; drawShape draws the actual arc/ellipse path. */
function _drawTreeShadow(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  style: LevelStyle | undefined,
  drawShape: (ctx: CanvasRenderingContext2D, shadowOff: number, r: number) => void,
): void {
  if (style === 'Dark') return;
  const shadowOff = half * 0.18;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.clip();
  ctx.fillStyle = TREE_SHADOW_COLOR;
  ctx.beginPath();
  drawShape(ctx, shadowOff, r);
  ctx.fill();
  ctx.restore();
}

function _drawTreeCircleShadow(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  style: LevelStyle | undefined,
): void {
  _drawTreeShadow(ctx, half, r, style, (c, off, radius) => c.arc(off, off, radius, 0, Math.PI * 2));
}

/**
 * Resolve color triple [leafColor, leafAltColor, outlineColor] for a tree variant
 * given its per-style color table and the optional level style.
 */
function _treeColorTriple(
  styleTable: Record<string, [string, string, string]>,
  defaultTriple: [string, string, string],
  style?: LevelStyle,
): [string, string, string] {
  return (style && styleTable[style]) ?? defaultTriple;
}

/**
 * Draw a clipped elliptical shadow for a tree canopy.
 * Skipped for Dark style (no strong light source).
 */
function _drawTreeEllipseShadow(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  style: LevelStyle | undefined,
): void {
  _drawTreeShadow(ctx, half, r, style, (c, off, radius) => c.ellipse(off, off, radius * 1.05, radius * 0.95, 0, 0, Math.PI * 2));
}

/**
 * Draw a ring of `count` evenly-spaced lobes (small circles) around the
 * origin: stroke every lobe's outline first, then fill every lobe on top.
 * This two-pass order is what makes only the outer perimeter arc of each
 * circle visible as an outline once the fill paints over the interior.
 */
function _strokeAndFillLobeRing(
  ctx: CanvasRenderingContext2D,
  opts: { count: number; offset: number; radius: number; strokeColor: string; fillColor: string },
): void {
  const { count, offset, radius, strokeColor, fillColor } = opts;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = _s(2);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = fillColor;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Fill a ring of `count` evenly-spaced lobes (small circles) around the
 * origin with a single color — no outline pass. `phaseOffset` (radians)
 * rotates the ring's starting angle, used for inner rings drawn at a
 * different phase than the outer ring.
 */
function _fillLobeRing(
  ctx: CanvasRenderingContext2D,
  opts: { count: number; offset: number; radius: number; fillColor: string; phaseOffset?: number },
): void {
  const { count, offset, radius, fillColor, phaseOffset = 0 } = opts;
  ctx.fillStyle = fillColor;
  for (let i = 0; i < count; i++) {
    const angle = phaseOffset + (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * offset, Math.sin(angle) * offset, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Full color set for a tree canopy: default plus per-LevelStyle overrides. */
interface TreeColorSet {
  default: [string, string, string];
  Fall: [string, string, string];
  Dark: [string, string, string];
  Winter: [string, string, string];
  Spring: [string, string, string];
}

/**
 * Shared canopy setup for top-down trees: resolves style-specific colors,
 * computes the canopy radius, draws the ground shadow, then fills the main
 * canopy circle. Returns the resolved radius and colors so callers can draw
 * their lobe rings on top.
 */
function _drawTreeCanopyBase(
  ctx: CanvasRenderingContext2D,
  half: number,
  radiusFactor: number,
  colors: TreeColorSet,
  style: LevelStyle | undefined,
  drawShadow: (ctx: CanvasRenderingContext2D, half: number, r: number, style: LevelStyle | undefined) => void,
): { r: number; leafColor: string; leafAltColor: string; outlineColor: string } {
  const styleTable: Record<string, [string, string, string]> = {
    Fall: colors.Fall,
    Dark: colors.Dark,
    Winter: colors.Winter,
    Spring: colors.Spring,
  };
  const [leafColor, leafAltColor, outlineColor] = _treeColorTriple(styleTable, colors.default, style);

  const r = half * radiusFactor;
  drawShadow(ctx, half, r, style);

  // Main canopy – large filled circle
  ctx.fillStyle = leafColor;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  return { r, leafColor, leafAltColor, outlineColor };
}

/**
 * Draw Tree 2 – a top-down tree with a bumpy rounded outline formed by 6 outer lobes
 * and a concentric inner ring pattern, giving it a layered canopy look.
 */
export function drawTree2(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const { r, leafColor, leafAltColor, outlineColor } = _drawTreeCanopyBase(
    ctx, half, 0.72,
    {
      default: [TREE2_LEAF_COLOR, TREE2_LEAF_ALT_COLOR, TREE2_COLOR],
      Fall:   [TREE2_FALL_LEAF_COLOR,   TREE2_FALL_LEAF_ALT_COLOR,   TREE2_FALL_COLOR],
      Dark:   [TREE2_DARK_LEAF_COLOR,   TREE2_DARK_LEAF_ALT_COLOR,   TREE2_DARK_COLOR],
      Winter: [TREE2_WINTER_LEAF_COLOR, TREE2_WINTER_LEAF_ALT_COLOR, TREE2_WINTER_COLOR],
      Spring: [TREE2_SPRING_LEAF_COLOR, TREE2_SPRING_LEAF_ALT_COLOR, TREE2_SPRING_COLOR],
    },
    style, _drawTreeEllipseShadow,
  );

  // Six outer bumps evenly spaced to create the bumpy outline
  _strokeAndFillLobeRing(ctx, { count: 6, offset: r * 0.64, radius: r * 0.42, strokeColor: outlineColor, fillColor: leafAltColor });

  // Inner concentric ring of smaller lobes (layered look)
  _fillLobeRing(ctx, { count: 6, offset: r * 0.32, radius: r * 0.30, fillColor: leafColor, phaseOffset: Math.PI / 6 });
}

/**
 * Draw Tree 3 – a top-down tree with a bumpy rounded outline formed by 5 outer lobes
 * and a concentric inner ring pattern, giving it a layered canopy look.
 */
export function drawTree3(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const { r, leafColor, leafAltColor, outlineColor } = _drawTreeCanopyBase(
    ctx, half, 0.72,
    {
      default: [TREE3_LEAF_COLOR, TREE3_LEAF_ALT_COLOR, TREE3_COLOR],
      Fall:   [TREE3_FALL_LEAF_COLOR,   TREE3_FALL_LEAF_ALT_COLOR,   TREE3_FALL_COLOR],
      Dark:   [TREE3_DARK_LEAF_COLOR,   TREE3_DARK_LEAF_ALT_COLOR,   TREE3_DARK_COLOR],
      Winter: [TREE3_WINTER_LEAF_COLOR, TREE3_WINTER_LEAF_ALT_COLOR, TREE3_WINTER_COLOR],
      Spring: [TREE3_SPRING_LEAF_COLOR, TREE3_SPRING_LEAF_ALT_COLOR, TREE3_SPRING_COLOR],
    },
    style, _drawTreeEllipseShadow,
  );

  // Five outer lobes evenly spaced to create the outer five-leaf shape
  _strokeAndFillLobeRing(ctx, { count: 5, offset: r * 0.62, radius: r * 0.44, strokeColor: outlineColor, fillColor: leafAltColor });

  // Inner concentric ring of smaller lobes (layered look)
  _fillLobeRing(ctx, { count: 5, offset: r * 0.32, radius: r * 0.30, fillColor: leafColor, phaseOffset: Math.PI / 5 });
}

/**
 * Draw Tree 4 – a compact, dense top-down tree formed by many small tightly-packed
 * lobes arranged in concentric rings, giving a rosette / dense-foliage appearance.
 */
export function drawTree4(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const { r, leafColor, leafAltColor, outlineColor } = _drawTreeCanopyBase(
    ctx, half, 0.70,
    {
      default: [TREE4_LEAF_COLOR, TREE4_LEAF_ALT_COLOR, TREE4_COLOR],
      Fall:   [TREE4_FALL_LEAF_COLOR,   TREE4_FALL_LEAF_ALT_COLOR,   TREE4_FALL_COLOR],
      Dark:   [TREE4_DARK_LEAF_COLOR,   TREE4_DARK_LEAF_ALT_COLOR,   TREE4_DARK_COLOR],
      Winter: [TREE4_WINTER_LEAF_COLOR, TREE4_WINTER_LEAF_ALT_COLOR, TREE4_WINTER_COLOR],
      Spring: [TREE4_SPRING_LEAF_COLOR, TREE4_SPRING_LEAF_ALT_COLOR, TREE4_SPRING_COLOR],
    },
    style, _drawTreeCircleShadow,
  );

  _strokeAndFillLobeRing(ctx, { count: 8, offset: r * 0.65, radius: r * 0.35, strokeColor: outlineColor, fillColor: leafAltColor });

  // Middle ring: 6 slightly smaller lobes at offset phase
  _fillLobeRing(ctx, { count: 6, offset: r * 0.38, radius: r * 0.28, fillColor: leafColor, phaseOffset: Math.PI / 6 });

  // Center dot (alt color)
  ctx.fillStyle = leafAltColor;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.20, 0, Math.PI * 2);
  ctx.fill();
}

// ── Sea tile rendering helpers ────────────────────────────────────────────────

/**
 * Adjacency descriptor for sea tiles.  Each field indicates whether the neighbor
 * in that direction is also a sea tile.
 */
export interface SeaNeighbors {
  /** True when the neighbor in that direction is sea OR is outside the grid. */
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  /** Diagonal neighbors for outer-corner detection. True when sea or outside grid. */
  nw: boolean;
  ne: boolean;
  sw: boolean;
  se: boolean;
}

/** Returns the style-dependent fill color for Sea (water) tiles. */
export function seaFillColor(style?: LevelStyle): string {
  if (style === 'Winter') return SEA_FILL_COLOR_WINTER;
  if (style === 'Fall')   return SEA_FILL_COLOR_FALL;
  if (style === 'Dark')   return SEA_FILL_COLOR_DARK;
  if (style === 'Spring') return SEA_FILL_COLOR_SPRING;
  return SEA_FILL_COLOR;
}

/**
 * Parse a '#rrggbb' hex color string into [r, g, b] components.
 * Used to compute style-specific oscillation centers for sea tile animation.
 */
function _seaParseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Draw a sea tile at the origin (caller must translate ctx to tile center).
 * The water color oscillates gently.  Land borders are drawn on edges where
 * the adjacent tile is in-bounds and not sea.  Outer corners connect adjacent
 * edge borders; corners at grid-boundary edges are suppressed.
 *
 * @param ctx       Canvas 2D context (translated so origin = tile center).
 * @param half      Half tile size in pixels.
 * @param neighbors Which adjacent cells are also sea tiles (or outside the grid).
 * @param fillColor Optional base fill color (hex '#rrggbb') for the style-specific water tint.
 *                  When provided the oscillation is centered on this color; when absent the
 *                  default Summer-style blue is used.
 */
/** Oscillate hue ±9/±14/±11 channels around the style-specific fill color (or a default Summer-style blue). */
function _computeSeaWaterColor(fillColor: string | undefined, now: number): string {
  const osc = Math.sin(now / 1200) * 0.5 + 0.5; // 0..1
  let wr: number, wg: number, wb: number;
  if (fillColor) {
    const [fr, fg, fb] = _seaParseHex(fillColor);
    wr = Math.round(Math.max(0, Math.min(255, fr - 9  + osc * 18)));
    wg = Math.round(Math.max(0, Math.min(255, fg - 14 + osc * 28)));
    wb = Math.round(Math.max(0, Math.min(255, fb - 11 + osc * 22)));
  } else {
    wr = Math.round(30 + osc * 18);   // 30..48
    wg = Math.round(110 + osc * 28);  // 110..138
    wb = Math.round(175 + osc * 22);  // 175..197
  }
  return `rgb(${wr},${wg},${wb})`;
}

function _fillSeaEdgeBorders(ctx: CanvasRenderingContext2D, half: number, bw: number, neighbors: SeaNeighbors): void {
  if (!neighbors.north) ctx.fillRect(-half, -half, half * 2, bw);
  if (!neighbors.south) ctx.fillRect(-half, half - bw, half * 2, bw);
  if (!neighbors.west)  ctx.fillRect(-half, -half, bw, half * 2);
  if (!neighbors.east)  ctx.fillRect(half - bw, -half, bw, half * 2);
}

/**
 * Outer corners: when two adjacent edges are both sea but their shared
 * diagonal is not, fill the bw×bw corner square that would otherwise be
 * left uncovered.
 */
function _fillSeaCornerBorders(ctx: CanvasRenderingContext2D, half: number, bw: number, neighbors: SeaNeighbors): void {
  if (_isCornerExposed(neighbors.north, neighbors.west, neighbors.nw)) ctx.fillRect(-half, -half, bw, bw);
  if (_isCornerExposed(neighbors.north, neighbors.east, neighbors.ne)) ctx.fillRect(half - bw, -half, bw, bw);
  if (_isCornerExposed(neighbors.south, neighbors.west, neighbors.sw)) ctx.fillRect(-half, half - bw, bw, bw);
  if (_isCornerExposed(neighbors.south, neighbors.east, neighbors.se)) ctx.fillRect(half - bw, half - bw, bw, bw);
}

/** Land border on non-sea edges. */
function _drawSeaLandBorder(ctx: CanvasRenderingContext2D, half: number, neighbors: SeaNeighbors): void {
  const bw = _s(4); // border thickness
  ctx.fillStyle = SEA_BORDER_COLOR;
  _fillSeaEdgeBorders(ctx, half, bw, neighbors);
  _fillSeaCornerBorders(ctx, half, bw, neighbors);
}

export function drawSea(
  ctx: CanvasRenderingContext2D,
  half: number,
  neighbors: SeaNeighbors,
  fillColor?: string,
): void {
  const now = Date.now();

  ctx.fillStyle = _computeSeaWaterColor(fillColor, now);
  ctx.fillRect(-half, -half, half * 2, half * 2);

  _drawSeaLandBorder(ctx, half, neighbors);

  // ── Ripple effects ──────────────────────────────────────────────────────
  _drawSeaRipple(ctx, half, -half * 0.3, -half * 0.25, now, 0);
  _drawSeaRipple(ctx, half, half * 0.2, half * 0.3, now, 800);
}

/**
 * Draw a small animated ripple on the sea tile surface.
 * The ripple oscillates between a flat line and rising pointy waves,
 * creating a gentle in-place ambient water motion effect.
 */
function _drawSeaRipple(
  ctx: CanvasRenderingContext2D,
  half: number,
  ox: number,
  oy: number,
  now: number,
  phaseOffset: number,
): void {
  const rw = half * 0.5;                       // ripple width
  const maxH = _s(2.5);                        // max wave peak height
  // Oscillate between flat (0) and peaked (1)
  const t = (Math.sin((now + phaseOffset) / 700) + 1) / 2; // 0..1

  ctx.save();
  ctx.translate(ox, oy);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = _s(1.2);
  ctx.lineCap = 'round';

  ctx.beginPath();
  // Wave layout: two full inner arches flanked by concave half-arches at each end.
  //
  // The outer half-arches are genuine half-waves: they rise from baseline to
  // the peak (left) or descend from the peak to baseline (right).  Their
  // outer endpoints stay fixed at y = 0 throughout the animation so the
  // ripple appears to emerge smoothly from flat water.  Control points are
  // placed at baseline level to give a concave (inward-cupping) shape.
  //
  // Inner arches connect peak-to-peak, dipping down to baseline at their
  // midpoints (the quadratic control point is placed at y = −peakH so
  // the curve touches y = 0 at t = 0.5).
  //
  // peakH < 0 so that peaks extend upward (negative y = up on canvas).
  //
  // Widths: inner arch = 2*rw/3, half-arch = rw/3.  Total span = 2*rw.
  // X boundaries (left→right): -rw, -2rw/3, 0, 2rw/3, rw.
  const peakH = -maxH * t;    // negative = upward on canvas (canvas Y increases downward)
  const hw = rw / 3;          // half-arch width
  const iw = (2 * rw) / 3;   // inner arch width
  ctx.moveTo(-rw, 0);
  // Left half-arch: baseline → peak.  CP at (-rw+hw, 0) places the control
  // point at baseline level horizontally aligned with the peak, giving a
  // concave curve that cups inward toward the wave centre.
  ctx.quadraticCurveTo(-rw + hw, 0,                      -rw + hw, peakH);
  // Inner arch 1: peak → baseline → peak.  CP y = -peakH makes the curve
  // touch baseline exactly at its horizontal midpoint.
  ctx.quadraticCurveTo(-rw + hw + iw / 2, -peakH,       -rw + hw + iw, peakH);
  // Inner arch 2: peak → baseline → peak (same shape).
  ctx.quadraticCurveTo(-rw + hw + iw + iw / 2, -peakH,  rw - hw, peakH);
  // Right half-arch: peak → baseline.  CP at (rw-hw, 0) mirrors the left
  // half-arch control, producing a matching concave termination.
  ctx.quadraticCurveTo(rw - hw, 0,                       rw, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * Compute sea-tile neighbor data given an `isSea` predicate.
 * Returns which of the 8 neighbors are sea tiles.
 *
 * @param isSea  Returns true when the cell at (row + dr, col + dc) is sea
 *               (or out-of-bounds, so no land border is drawn at the grid edge).
 */
export function computeSeaNeighbors(isSea: (dr: number, dc: number) => boolean): SeaNeighbors {
  return {
    north: isSea(-1,  0),
    south: isSea( 1,  0),
    west:  isSea( 0, -1),
    east:  isSea( 0,  1),
    nw:    isSea(-1, -1),
    ne:    isSea(-1,  1),
    sw:    isSea( 1, -1),
    se:    isSea( 1,  1),
  };
}

/**
 * Draw the cement background for a grid cell.
 * Call once during renderBoard pass 1, using full tile-space coordinates (x, y top-left).
 * When `isHardened` is true the fill is rendered darker to signal that the cement
 * has set and pipes on this cell can no longer be adjusted.
 */
function _drawCementBackground(ctx: CanvasRenderingContext2D, x: number, y: number, isHardened: boolean): void {
  const ts = TILE_SIZE;
  // Fill color is darker for hardened cells to signal immobility
  ctx.fillStyle = isHardened ? CEMENT_FILL_HARDENED_COLOR : CEMENT_FILL_COLOR;
  ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
  // Slightly darker border
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, ts - 4, ts - 4);
  // Three diagonal wavy lines (SW→NE direction), clipped to tile interior
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, ts - 4, ts - 4);
  ctx.clip();
  ctx.strokeStyle = CEMENT_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const cx = x + ts / 2;
  const cy = y + ts / 2;
  const len = ts * 0.52; // half-length of each line (will be clipped)
  const spacing = _s(10); // spacing between parallel lines
  const sq2 = Math.SQRT1_2;
  for (let i = -1; i <= 1; i++) {
    // Offset along perpendicular direction (1,1)/√2
    const px = i * spacing * sq2;
    const py = i * spacing * sq2;
    const lx = cx + px;
    const ly = cy + py;
    // Line endpoints along direction (1,−1)/√2
    const sx = lx - len * sq2;
    const sy = ly + len * sq2;
    const ex = lx + len * sq2;
    const ey = ly - len * sq2;
    // Wavy: control point offset slightly along (1,1)/√2 from the line midpoint
    const wave = _s(3);
    const cpx = lx + wave * sq2;
    const cpy = ly + wave * sq2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, ex, ey);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the one-way floor arrow/chevron pointing in `dir` on top of the current
 * background.  The tile edge at pixel (x, y) is used as the top-left origin.
 */
export function drawOneWayArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Direction): void {
  const half = TILE_SIZE / 2;
  const cx = x + half;
  const cy = y + half;

  // Rotation angle: 0 = North (up), 90° CW = East, etc.
  const angle = dir === Direction.East  ?  Math.PI / 2
    : dir === Direction.South ?  Math.PI
    : dir === Direction.West  ? -Math.PI / 2
    : 0;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Arrow shape pointing "up" (North) in the local frame.
  const tipY     = -half * 0.72;
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
}

/**
 * Draw the gold-space restriction glyph: a keyhole rendered in pipe tubing.
 *
 * Fuses two cues into one mark — the keyhole silhouette (bow ring + shaft) reads
 * "restricted slot," and rendering it as rounded gold tubing reads "a gold pipe
 * is the key that fits here."  Drawn only on empty gold cells, so it disappears
 * once a tile is placed.  Alpha rides the shared shimmer phase so it pulses with
 * the cell background.
 */
export function drawGoldKeyholeGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shimmerAlpha: number,
): void {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const bowR = TILE_SIZE * 0.16;        // keyhole bow (ring) radius
  const bowCy = cy - TILE_SIZE * 0.04;  // bow sits slightly above center
  const shaftBottom = cy + TILE_SIZE * 0.30;
  const tubeW = TILE_SIZE * 0.085;      // pipe tubing thickness

  ctx.save();
  ctx.globalAlpha = Math.min(1, 0.4 + shimmerAlpha);
  ctx.strokeStyle = GOLD_PIPE_COLOR;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Key shaft: rounded vertical tube from the bow down to the keyhole tip.
  ctx.lineWidth = tubeW;
  ctx.beginPath();
  ctx.moveTo(cx, bowCy);
  ctx.lineTo(cx, shaftBottom);
  ctx.stroke();

  // Bow: thick gold ring whose hollow center is the keyhole "hole".
  ctx.lineWidth = tubeW;
  ctx.beginPath();
  ctx.arc(cx, bowCy, bowR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Return true when the neighbor cell at (nr, nc) is an open buildable floor —
 * a cell where a player can place a pipe but none is currently present.
 * Pipe arms pointing at open floor cells use round end caps (nubs); arms
 * pointing at any other tile use flat (butt) ends so they sit flush at the
 * tile boundary.
 *
 * The following background cell types are all stored as PipeShape.Empty in the
 * runtime grid, so the single shape check below covers all of them:
 *  - Normal empty cells
 *  - Gold spaces               (tracked separately in board.goldSpaces)
 *  - Cement cells without a pipe or spin pipe (tracked in board.cementData)
 *  - One-way cells             (tracked separately in board.oneWayData)
 */
/** True when (r, c) falls outside the board's grid bounds. */
function _isOutOfBoundsCell(board: Board, r: number, c: number): boolean {
  return r < 0 || r >= board.rows || c < 0 || c >= board.cols;
}

function _isOpenFloorCell(board: Board, nr: number, nc: number): boolean {
  return isEmptyFloor(board.grid[nr][nc].shape);
}

/**
 * Shared helper: compute which arm directions of a tile need a flat (butt) end
 * cap given a neighbor-lookup callback.
 *
 * An arm gets a butt end when the neighbor returned by `getNeighbor` is non-null
 * AND either is not a pipe shape or has a reciprocal arm pointing back.  Arms
 * pointing at null neighbors (open floor / empty cells / out-of-bounds) keep
 * their round nubs.
 *
 * @param connections  The set of outgoing arm directions for this tile.
 * @param getNeighbor  Returns the neighbor in the given direction, or null when
 *                     the cell is empty/out-of-bounds (→ round nub).
 */
export function computeButtEndDirs(
  connections: ReadonlySet<Direction>,
  getNeighbor: (dir: Direction) => { shape: PipeShape; connections: ReadonlySet<Direction> } | null,
): Set<Direction> | undefined {
  let buttEndDirs: Set<Direction> | undefined;
  for (const dir of connections) {
    const neighbor = getNeighbor(dir);
    if (!neighbor) continue; // empty/out-of-bounds → round end
    // Pipe neighbor with no reciprocal arm → arms don't overlap, keep round nub
    if (PIPE_SHAPES.has(neighbor.shape) && !neighbor.connections.has(oppositeDirection(dir))) continue;
    (buttEndDirs ??= new Set<Direction>()).add(dir);
  }
  return buttEndDirs;
}

/**
 * Compute which arm directions of the tile at (r, c) need a flat (butt) end
 * cap.  Arms pointing at open floor cells (empty) keep round ends; all other
 * neighbor types use butt ends.  Exception: when an arm points at a pipe tile
 * that has no arm pointing back, the arms don't overlap, so a round nub is
 * kept instead.
 */
function _computeButtEndDirs(board: Board, r: number, c: number): Set<Direction> | undefined {
  const tile = board.grid[r][c];
  return computeButtEndDirs(tile.connections, (dir) => {
    const delta = NEIGHBOUR_DELTA[dir];
    const nr = r + delta.row, nc = c + delta.col;
    if (_isOutOfBoundsCell(board, nr, nc)) return null;
    if (_isOpenFloorCell(board, nr, nc)) return null;
    const t = board.grid[nr][nc];
    return { shape: t.shape, connections: t.connections };
  });
}

/**
 * Draw a single pipe arm from the tile center to the tile edge in the given
 * *absolute* direction, accounting for the tile's rotation so the line is
 * placed correctly in the already-rotated canvas coordinate frame.
 *
 * Call this while the canvas is already translated to the tile center and
 * rotated by `tileRotation`.
 *
 * @param opts - Rendering options.
 * @param opts.absDir       Absolute (world-space) direction of the arm.
 * @param opts.tileRotation The tile's rotation in degrees (0 / 90 / 180 / 270).
 * @param opts.half         Half the tile size in pixels.
 * @param opts.color        Stroke color for this arm.
 * @param opts.buttEnd      When true, the tile-edge end is rendered flat by clipping
 *                          at the tile boundary.  The center end always uses a natural
 *                          round linecap — no explicit center cap circle is needed.
 */
interface DrawPipeArmOptions {
  absDir: Direction;
  tileRotation: number;
  half: number;
  color: string;
  buttEnd?: boolean;
}

/** Rotate `dir` counter-clockwise by `steps` 90-degree increments. */
function _rotateDirectionCCW(dir: Direction, steps: number): Direction {
  let result = dir;
  for (let i = 0; i < steps; i++) {
    switch (result) {
      case Direction.North: result = Direction.West;  break;
      case Direction.West:  result = Direction.South; break;
      case Direction.South: result = Direction.East;  break;
      case Direction.East:  result = Direction.North; break;
    }
  }
  return result;
}

function _localDirToArmEndpoint(localDir: Direction, half: number): { ex: number; ey: number } {
  switch (localDir) {
    case Direction.North: return { ex: 0, ey: -half };
    case Direction.South: return { ex: 0, ey: half };
    case Direction.East:  return { ex: half, ey: 0 };
    default:              return { ex: -half, ey: 0 }; // West
  }
}

/**
 * For a butt end at the tile edge, clip to the tile half-boundary in the arm's
 * direction so the natural round linecap is trimmed flat there.
 */
function _clipPipeArmButtEnd(ctx: CanvasRenderingContext2D, ex: number, ey: number, half: number): void {
  // LARGE is a value safely outside the tile in any direction.
  const LARGE = half * 2;
  ctx.beginPath();
  if      (ex > 0) ctx.rect(-LARGE, -LARGE, LARGE + half, LARGE * 2);
  else if (ex < 0) ctx.rect(-half,  -LARGE, LARGE + half, LARGE * 2);
  else if (ey > 0) ctx.rect(-LARGE, -LARGE, LARGE * 2,    LARGE + half);
  else             ctx.rect(-LARGE, -half,  LARGE * 2,    LARGE + half);
  ctx.clip();
}

function _drawPipeArmInRotatedFrame(ctx: CanvasRenderingContext2D, opts: DrawPipeArmOptions): void {
  const { absDir, tileRotation, half, color, buttEnd = false } = opts;
  // Convert the absolute direction to the local coordinate-system direction by
  // rotating it CCW by (tileRotation / 90) steps.  The canvas coordinate frame
  // is rotated CW by tileRotation, so we invert to find the local axis.
  const localDir = _rotateDirectionCCW(absDir, tileRotation / 90);
  const { ex, ey } = _localDirToArmEndpoint(localDir, half);

  // The center end is left unconstrained so its round cap lands naturally — no
  // explicit center cap circle is required.
  if (buttEnd) {
    ctx.save();
    _clipPipeArmButtEnd(ctx, ex, ey, half);
  }

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  if (buttEnd) ctx.restore();
}

/**
 * Draw the drying time label in the top-left corner of a cement cell.
 * Replaces the dark shadow overlay: displays the numeric T value (or "X" when
 * hardened) with a black edge on a dark-gray fill for maximum readability over
 * any tile background.
 * Call after all tile content is drawn, using full tile-space coordinates (x, y top-left).
 *
 * @param isHardened - true when dryingTime is 0 AND a pipe has been placed on
 *   the tile.  Only hardened tiles display the "X"; otherwise the numeric value
 *   (including "0") is shown.
 */
export interface CementLabelOptions {
  x: number;
  y: number;
  dryingTime: number;
  isHardened: boolean;
}

export function drawCementLabel(ctx: CanvasRenderingContext2D, opts: CementLabelOptions): void {
  const { x, y, dryingTime, isHardened } = opts;
  const label = isHardened ? 'X' : String(dryingTime);
  const fontSize = _s(18);
  ctx.save();
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lx = x + _s(4);
  const ly = y + _s(3);
  // Black stroke for edge contrast over any background
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = _s(1.5);
  ctx.lineJoin = 'round';
  ctx.strokeText(label, lx, ly);
  // Dark gray fill – readable but not as harsh as pure black
  ctx.fillStyle = '#505050';
  ctx.fillText(label, lx, ly);
  ctx.restore();
}

// ─── Unified pipe-shape path helpers ─────────────────────────────────────────

/**
 * Convert an absolute (world-space) direction to the local (pre-rotation)
 * canvas coordinate direction.  When the canvas is already rotated CW by
 * `tileRotation` degrees, this inverts that rotation (CCW by the same amount)
 * so that directions can be used in the local coordinate frame.
 *
 * Each CCW 90° step maps: N→W, W→S, S→E, E→N.
 *
 * This is exported so the chapter-map renderer can reuse it when adding a
 * canvas rotation to match the level-screen rendering.
 */
export function toLocalDir(absDir: Direction, tileRotation: number): Direction {
  let localDir = absDir;
  const steps = ((tileRotation / 90) % 4 + 4) % 4;
  for (let i = 0; i < steps; i++) {
    switch (localDir) {
      case Direction.North: localDir = Direction.West;  break;
      case Direction.West:  localDir = Direction.South; break;
      case Direction.South: localDir = Direction.East;  break;
      case Direction.East:  localDir = Direction.North; break;
    }
  }
  return localDir;
}

/**
 * Return the structural pipe type (straight / elbow / tee / cross), ignoring
 * Gold, Spin, and Leaky variants which share the same geometry.
 * Returns null for non-pipe shapes.
 */
function _pipeStructuralType(shape: PipeShape): 'straight' | 'elbow' | 'tee' | 'cross' | null {
  switch (shape) {
    case PipeShape.Straight:
    case PipeShape.GoldStraight:
    case PipeShape.SpinStraight:
    case PipeShape.SpinStraightCement:
    case PipeShape.LeakyStraight:
      return 'straight';
    case PipeShape.Elbow:
    case PipeShape.GoldElbow:
    case PipeShape.SpinElbow:
    case PipeShape.SpinElbowCement:
    case PipeShape.LeakyElbow:
      return 'elbow';
    case PipeShape.Tee:
    case PipeShape.GoldTee:
    case PipeShape.SpinTee:
    case PipeShape.SpinTeeCement:
    case PipeShape.LeakyTee:
      return 'tee';
    case PipeShape.Cross:
    case PipeShape.GoldCross:
    case PipeShape.LeakyCross:
      return 'cross';
    default:
      return null;
  }
}

// ── Individual path builders (local canvas frame, CW winding) ────────────────

/**
 * Straight pipe (N→S).
 * Boundary goes clockwise: N-end cap → right side → S-end cap → left side → close.
 */
function _buildStraightPath(
  ctx: CanvasRenderingContext2D,
  half: number,
  lw2: number,
  localButt?: ReadonlySet<Direction>,
): void {
  const buttN = localButt?.has(Direction.North) ?? false;
  const buttS = localButt?.has(Direction.South) ?? false;
  if (buttN) {
    ctx.moveTo(-lw2, -half);
    ctx.lineTo( lw2, -half);
  } else {
    // CW arc: left (-lw2,-half) → top (0,-half-lw2) → right (lw2,-half)
    ctx.arc(0, -half, lw2, Math.PI, 0, false);
  }
  ctx.lineTo(lw2, half);
  if (buttS) {
    ctx.lineTo(-lw2, half);
  } else {
    // CW arc: right (lw2,half) → bottom (0,half+lw2) → left (-lw2,half)
    ctx.arc(0, half, lw2, 0, Math.PI, false);
  }
  ctx.closePath();
}

/**
 * Elbow pipe (N→E, canonical local frame).
 * Boundary goes clockwise:
 *   N-end cap → right of N arm → outer convex quarter-circle at bend →
 *   top of E arm → E-end cap → bottom of E arm →
 *   inner concave quarter-circle at bend → left of N arm → close.
 */
function _buildElbowPath(
  ctx: CanvasRenderingContext2D,
  half: number,
  lw2: number,
  localButt?: ReadonlySet<Direction>,
): void {
  const buttN = localButt?.has(Direction.North) ?? false;
  const buttE = localButt?.has(Direction.East)  ?? false;
  if (buttN) {
    ctx.moveTo(-lw2, -half);
    ctx.lineTo( lw2, -half);
  } else {
    ctx.arc(0, -half, lw2, Math.PI, 0, false);
  }
  // Right edge of N arm → bend
  ctx.lineTo(lw2, 0);
  // Outer convex corner: CCW quarter-circle at origin from (lw2,0) to (0,-lw2).
  // In canvas coordinates y increases downward, so (0,-lw2) is visually above
  // the origin – the outer (top-right) side of the N→E bend.
  ctx.arc(0, 0, lw2, 0, -Math.PI / 2, true);
  // Top edge of E arm
  ctx.lineTo(half, -lw2);
  if (buttE) {
    ctx.lineTo(half, lw2);
  } else {
    // CW arc: top (half,-lw2) → right (half+lw2,0) → bottom (half,lw2)
    ctx.arc(half, 0, lw2, -Math.PI / 2, Math.PI / 2, false);
  }
  // Bottom edge of E arm back toward bend
  ctx.lineTo(0, lw2);
  // Inner concave corner: CW quarter-circle at origin from (0,lw2) to (-lw2,0).
  // In canvas coordinates (0,lw2) is visually below the origin and (-lw2,0) is
  // to the left, so this arc curves through the bottom-left – the concave inner
  // side of the N→E bend.
  ctx.arc(0, 0, lw2, Math.PI / 2, Math.PI, false);
  // Left edge of N arm going up
  ctx.lineTo(-lw2, -half);
  ctx.closePath();
}

/**
 * Tee pipe (N-S-E, canonical local frame).
 * Boundary goes clockwise:
 *   N-end → right of N arm → top of E arm → E-end → bottom of E arm →
 *   right of S arm → S-end → left side → close.
 * Sharp 90° inner corners at the E-arm junctions are correct for a T-junction.
 */
function _buildTeePath(
  ctx: CanvasRenderingContext2D,
  half: number,
  lw2: number,
  localButt?: ReadonlySet<Direction>,
): void {
  const buttN = localButt?.has(Direction.North) ?? false;
  const buttS = localButt?.has(Direction.South) ?? false;
  const buttE = localButt?.has(Direction.East)  ?? false;
  if (buttN) {
    ctx.moveTo(-lw2, -half);
    ctx.lineTo( lw2, -half);
  } else {
    ctx.arc(0, -half, lw2, Math.PI, 0, false);
  }
  ctx.lineTo(lw2, -lw2);    // upper inner corner
  ctx.lineTo(half, -lw2);   // top edge of E arm
  if (buttE) {
    ctx.lineTo(half, lw2);
  } else {
    ctx.arc(half, 0, lw2, -Math.PI / 2, Math.PI / 2, false);
  }
  ctx.lineTo(lw2,  lw2);    // lower inner corner
  ctx.lineTo(lw2,  half);   // right side of S arm
  if (buttS) {
    ctx.lineTo(-lw2, half);
  } else {
    ctx.arc(0, half, lw2, 0, Math.PI, false);
  }
  ctx.closePath();
}

/**
 * Cross pipe (N-S-E-W, canonical local frame).
 * Boundary goes clockwise, tracing the perimeter of the +-shape.
 */
interface CrossPathButtFlags { buttN: boolean; buttS: boolean; buttE: boolean; buttW: boolean; }

function _resolveCrossPathButtFlags(localButt: ReadonlySet<Direction> | undefined): CrossPathButtFlags {
  return {
    buttN: localButt?.has(Direction.North) ?? false,
    buttS: localButt?.has(Direction.South) ?? false,
    buttE: localButt?.has(Direction.East)  ?? false,
    buttW: localButt?.has(Direction.West)  ?? false,
  };
}

function _drawCrossNorthCap(ctx: CanvasRenderingContext2D, half: number, lw2: number, buttN: boolean): void {
  if (buttN) {
    ctx.moveTo(-lw2, -half);
    ctx.lineTo( lw2, -half);
  } else {
    ctx.arc(0, -half, lw2, Math.PI, 0, false);
  }
}

function _drawCrossEastCap(ctx: CanvasRenderingContext2D, half: number, lw2: number, buttE: boolean): void {
  if (buttE) {
    ctx.lineTo(half, lw2);
  } else {
    ctx.arc(half, 0, lw2, -Math.PI / 2, Math.PI / 2, false);
  }
}

function _drawCrossSouthCap(ctx: CanvasRenderingContext2D, half: number, lw2: number, buttS: boolean): void {
  if (buttS) {
    ctx.lineTo(-lw2, half);
  } else {
    ctx.arc(0, half, lw2, 0, Math.PI, false);
  }
}

function _drawCrossWestCap(ctx: CanvasRenderingContext2D, half: number, lw2: number, buttW: boolean): void {
  if (buttW) {
    ctx.lineTo(-half, -lw2);
  } else {
    // CW arc: bottom (-half,lw2) → left (-half-lw2,0) → top (-half,-lw2)
    ctx.arc(-half, 0, lw2, Math.PI / 2, -Math.PI / 2, false);
  }
}

function _buildCrossPath(
  ctx: CanvasRenderingContext2D,
  half: number,
  lw2: number,
  localButt?: ReadonlySet<Direction>,
): void {
  const { buttN, buttS, buttE, buttW } = _resolveCrossPathButtFlags(localButt);
  _drawCrossNorthCap(ctx, half, lw2, buttN);
  ctx.lineTo( lw2, -lw2);   // NE inner corner
  ctx.lineTo(half, -lw2);   // top of E arm
  _drawCrossEastCap(ctx, half, lw2, buttE);
  ctx.lineTo( lw2,  lw2);   // SE inner corner
  ctx.lineTo( lw2,  half);  // right of S arm
  _drawCrossSouthCap(ctx, half, lw2, buttS);
  ctx.lineTo(-lw2,  lw2);   // SW inner corner
  ctx.lineTo(-half,  lw2);  // bottom of W arm
  _drawCrossWestCap(ctx, half, lw2, buttW);
  ctx.lineTo(-lw2, -lw2);  // NW inner corner
  ctx.lineTo(-lw2, -half); // left of N arm
  ctx.closePath();
}

/**
 * Build the outer boundary path of a pipe tile's body in the LOCAL canvas
 * frame (canvas already translated to tile centre and rotated by tile rotation).
 *
 * The resulting path describes the filled interior of the pipe shape (the union
 * of all arm rectangles plus end caps / bends).  After calling this the caller
 * should:
 *   1. Stroke with `lineWidth = _s(3)` and `strokeStyle = 'black'` to draw the
 *      1.5 px outer border (the stroke straddles the path, half inside, half
 *      outside; step 2 covers the inner half).
 *   2. Fill with the desired pipe colour (covers the interior, including the
 *      inner half of the stroke, so only the outer border remains visible).
 *
 * This is exported for low-level use; see also {@link drawPipeBody} which wraps
 * the full clip + stroke + fill sequence.
 *
 * @param ctx              Canvas 2D context (translated + rotated to tile centre).
 * @param shape            Any PipeShape value in PIPE_SHAPES.
 * @param half             Distance from tile centre to tile edge in pixels.
 * @param localButtEndDirs Directions in the LOCAL frame whose tile-edge end
 *                         should be flat (butt) rather than rounded.
 */
function buildPipeBodyPath(
  ctx: CanvasRenderingContext2D,
  shape: PipeShape,
  half: number,
  localButtEndDirs?: ReadonlySet<Direction>,
): void {
  const lw2 = LINE_WIDTH / 2;
  ctx.beginPath();
  switch (_pipeStructuralType(shape)) {
    case 'straight': _buildStraightPath(ctx, half, lw2, localButtEndDirs); break;
    case 'elbow':    _buildElbowPath   (ctx, half, lw2, localButtEndDirs); break;
    case 'tee':      _buildTeePath     (ctx, half, lw2, localButtEndDirs); break;
    case 'cross':    _buildCrossPath   (ctx, half, lw2, localButtEndDirs); break;
    // null / unknown: empty path (no-op)
  }
}

// ─── End of unified pipe-shape path helpers ───────────────────────────────────

/**
 * Draw a pipe body shape with butt-end boundary clipping.
 *
 * The context must already be translated to the tile centre (0, 0) and rotated
 * into the tile's local frame.  This function manages its own inner save/restore
 * so the caller's clip or transform state is unaffected.
 *
 * Used by both the level board renderer ({@link drawTile}) and the chapter map
 * renderer so that the clip + path + stroke + fill logic is not duplicated.
 *
 * @param ctx              2D rendering context (origin at tile centre, rotated).
 * @param shape            Pipe shape to draw.
 * @param half             Half the tile size — distance from centre to each tile edge.
 * @param localButtEndDirs Arm directions (in the tile's local frame) that need flat
 *                         butt ends.  Undefined means all arms get round nub caps.
 * @param fillColor        CSS color string used to fill the pipe body.
 */
interface PipeBodyClipRect { l: number; r: number; t: number; b: number; }

function _resolvePipeBodyClipBound(
  localButtEndDirs: ReadonlySet<Direction> | undefined, dir: Direction, near: number, far: number,
): number {
  return localButtEndDirs?.has(dir) ? near : far;
}

/**
 * Clip to the tile boundary on each butt-end direction so the black stroke
 * outline never bleeds into adjacent tiles.  Non-butt (nub) directions are
 * left unconstrained so rounded caps can extend freely into empty space.
 */
function _computePipeBodyClipRect(
  half: number, localButtEndDirs: ReadonlySet<Direction> | undefined, large: number,
): PipeBodyClipRect {
  return {
    l: _resolvePipeBodyClipBound(localButtEndDirs, Direction.West, -half, -large),
    r: _resolvePipeBodyClipBound(localButtEndDirs, Direction.East, half, large),
    t: _resolvePipeBodyClipBound(localButtEndDirs, Direction.North, -half, -large),
    b: _resolvePipeBodyClipBound(localButtEndDirs, Direction.South, half, large),
  };
}

export interface PipeBodyOptions {
  shape: PipeShape;
  half: number;
  localButtEndDirs: ReadonlySet<Direction> | undefined;
  fillColor: string;
}

export function drawPipeBody(ctx: CanvasRenderingContext2D, opts: PipeBodyOptions): void {
  const { shape, half, localButtEndDirs, fillColor } = opts;
  // When a shadow (e.g. the ghost-placement glow) is active, expand the free
  // edges by the blur radius so the glow is not clipped.
  const shadowClipExpansion = ctx.shadowBlur;
  const LARGE = half + LINE_WIDTH + shadowClipExpansion;
  const clip = _computePipeBodyClipRect(half, localButtEndDirs, LARGE);
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.l, clip.t, clip.r - clip.l, clip.b - clip.t);
  ctx.clip();
  // Build the pipe body path AFTER clipping so ctx.beginPath() for the clip
  // rect does not erase the pipe path before stroke/fill.
  buildPipeBodyPath(ctx, shape, half, localButtEndDirs);
  // Stroke outline first; fill covers the inner half of the stroke so only
  // the outer border remains visible.
  ctx.lineWidth = _s(3);
  ctx.strokeStyle = 'black';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.restore();
}

/**
 * Draw rust-colored blotches along each non-blocked arm of a leaky pipe.
 * The blotches are drawn in the rotated tile context (origin = tile center).
 *
 * @param ctx          2D rendering context (already translated + rotated to tile frame).
 * @param tile         The leaky pipe tile being drawn.
 * @param half         Half of the tile size in pixels (= tile center offset).
 * @param blockedDir   The direction whose arm is blocked by a one-way tile (no rust there),
 *                     or null when all arms carry water.
 */
function _localDirToUnitDelta(localDir: Direction): { dx: number; dy: number } {
  switch (localDir) {
    case Direction.North: return { dx: 0, dy: -1 };
    case Direction.South: return { dx: 0, dy: 1 };
    case Direction.East:  return { dx: 1, dy: 0 };
    default:              return { dx: -1, dy: 0 }; // West
  }
}

/** Two rust spots along one arm: one at 1/3 of the arm, one at 2/3. */
function _drawRustSpotsAlongArm(ctx: CanvasRenderingContext2D, dx: number, dy: number, half: number, spotR: number): void {
  for (const frac of [0.33, 0.67]) {
    const sx = dx * half * frac;
    const sy = dy * half * frac;
    ctx.beginPath();
    ctx.arc(sx, sy, spotR, 0, Math.PI * 2);
    ctx.fill();
  }
}

function _drawLeakyRustSpots(
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  half: number,
  blockedDir: Direction | null,
): void {
  ctx.save();
  ctx.fillStyle = LEAKY_RUST_COLOR;
  ctx.globalAlpha = 0.75;
  const spotR = _s(4);

  // `tile.connections` returns directions in absolute (post-rotation) space, but the
  // canvas is already rotated by `tile.rotation`.  We must convert each absolute
  // direction to the local (pre-rotation) frame before using it as a drawing offset,
  // mirroring the same un-rotation logic used by _drawPipeArmInRotatedFrame.
  const rotSteps = tile.rotation / 90;
  for (const dir of tile.connections) {
    if (dir === blockedDir) continue;
    const localDir = _rotateDirectionCCW(dir, rotSteps);
    const { dx, dy } = _localDirToUnitDelta(localDir);
    _drawRustSpotsAlongArm(ctx, dx, dy, half, spotR);
  }
  ctx.restore();
}

/** Chamber content types whose color is a fixed (color, waterColor) pair with no other conditional logic. */
const SIMPLE_CHAMBER_COLOR: Partial<Record<ChamberContent, { color: string; waterColor: string }>> = {
  tank: { color: TANK_COLOR, waterColor: TANK_WATER_COLOR },
  dirt: { color: DIRT_COLOR, waterColor: DIRT_WATER_COLOR },
  ice: { color: ICE_COLOR, waterColor: ICE_WATER_COLOR },
  snow: { color: SNOW_COLOR, waterColor: SNOW_WATER_COLOR },
  hot_plate: { color: HOT_PLATE_COLOR, waterColor: HOT_PLATE_WATER_COLOR },
  gel: { color: GEL_COLOR, waterColor: GEL_WATER_COLOR },
  siphon: { color: SIPHON_COLOR, waterColor: SIPHON_WATER_COLOR },
  regulator: { color: REGULATOR_COLOR, waterColor: REGULATOR_WATER_COLOR },
};

/** Non-chamber shapes whose color is a single fixed value, the same for water and non-water tiles. */
const SIMPLE_SHAPE_COLOR: Partial<Record<PipeShape, string>> = {
  [PipeShape.Granite]: GRANITE_COLOR,
  [PipeShape.Tree]: TREE_COLOR,
  [PipeShape.Tree2]: TREE2_COLOR,
  [PipeShape.Tree3]: TREE3_COLOR,
  [PipeShape.Tree4]: TREE4_COLOR,
  [PipeShape.Sea]: SEA_COLOR,
};

/** Color for a chamber's 'item' content: gold when its itemShape is a gold pipe shape, otherwise a plain pipe. */
function _itemChamberColor(tile: Tile, isWater: boolean): string {
  const isGoldItem = tile.itemShape !== null && GOLD_PIPE_SHAPES.has(tile.itemShape);
  if (isGoldItem) return isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR;
  return isWater ? WATER_COLOR : PIPE_COLOR;
}

/** Color for a chamber's 'heater' content: Cooler when its temperature is negative, otherwise Heater. */
function _heaterChamberColor(tile: Tile, isWater: boolean): string {
  if (tile.temperature < 0) return isWater ? COOLER_WATER_COLOR : COOLER_COLOR;
  return isWater ? HEATER_WATER_COLOR : HEATER_COLOR;
}

/** Color for a chamber's 'pump' content: Vacuum when its pressure is negative, otherwise Pump. */
function _pumpChamberColor(tile: Tile, isWater: boolean): string {
  if (tile.pressure < 0) return isWater ? VACUUM_WATER_COLOR : VACUUM_COLOR;
  return isWater ? PUMP_WATER_COLOR : PUMP_COLOR;
}

/** Color for a chamber's 'sandstone' content: shatter/hard/normal tier, from {@link sandstoneColorState}. */
function _sandstoneChamberColor(tile: Tile, isWater: boolean, currentPressure: number): string {
  const { isShatterTriggered, isHard } = sandstoneColorState(tile, currentPressure);
  if (isShatterTriggered) return isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR;
  if (isHard) return isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR;
  return isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR;
}

/** Color for a chamber with no special-cased content (including `null`, `'star'`, `'level'`, and `'chapter'`). */
function _plainChamberColor(isWater: boolean): string {
  return isWater ? CHAMBER_WATER_COLOR : CHAMBER_COLOR;
}

/**
 * Return the color for a Chamber tile, dispatching on its chamberContent.
 * Chamber content types with no special-cased handling here fall through
 * to {@link _plainChamberColor}.
 */
function _chamberTileColor(tile: Tile, isWater: boolean, currentPressure: number): string {
  const { chamberContent } = tile;
  if (chamberContent !== null) {
    const simple = SIMPLE_CHAMBER_COLOR[chamberContent];
    if (simple !== undefined) return isWater ? simple.waterColor : simple.color;
  }
  if (chamberContent === 'item') return _itemChamberColor(tile, isWater);
  if (chamberContent === 'heater') return _heaterChamberColor(tile, isWater);
  if (chamberContent === 'pump') return _pumpChamberColor(tile, isWater);
  if (chamberContent === 'sandstone') return _sandstoneChamberColor(tile, isWater, currentPressure);
  return _plainChamberColor(isWater);
}

/** Color for a Source or Sink tile, or null if `shape` is neither. */
function _sourceOrSinkColor(shape: PipeShape, isWater: boolean): string | null {
  if (shape === PipeShape.Source) return isWater ? SOURCE_WATER_COLOR : SOURCE_COLOR;
  if (shape === PipeShape.Sink) return isWater ? SINK_WATER_COLOR : SINK_COLOR;
  return null;
}

/** Color for a gold/leaky/spin pipe shape, or null if `shape` is in none of those sets. */
function _specialPipeSetColor(shape: PipeShape, isWater: boolean): string | null {
  if (GOLD_PIPE_SHAPES.has(shape)) return isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
  if (LEAKY_PIPE_SHAPES.has(shape)) return isWater ? LEAKY_PIPE_WATER_COLOR : LEAKY_PIPE_COLOR;
  if (SPIN_PIPE_SHAPES.has(shape)) return isWater ? WATER_COLOR : FIXED_PIPE_BODY_COLOR;
  return null;
}

/** Color for any pipe shape not covered by a more specific branch. */
function _defaultPipeColor(isFixed: boolean, isWater: boolean): string {
  if (isFixed) return isWater ? WATER_COLOR : FIXED_PIPE_BODY_COLOR;
  return isWater ? WATER_COLOR : PIPE_COLOR;
}

/** Draw a single tile at canvas position (x, y). */
/**
 * Resolve the canvas stroke/fill color for a tile based on its shape, fill
 * state, and current board metrics.
 *
 * Separated from {@link drawTile} so that color logic can be read and tested
 * independently of the drawing commands.
 */
export function resolveTileColor(
  tile: Tile,
  isWater: boolean,
  currentPressure: number,
): string {
  const { shape, isFixed } = tile;

  const sourceOrSink = _sourceOrSinkColor(shape, isWater);
  if (sourceOrSink !== null) return sourceOrSink;

  if (shape === PipeShape.Chamber) return _chamberTileColor(tile, isWater, currentPressure);

  const simpleShape = SIMPLE_SHAPE_COLOR[shape];
  if (simpleShape !== undefined) return simpleShape;

  const special = _specialPipeSetColor(shape, isWater);
  if (special !== null) return special;

  return _defaultPipeColor(isFixed, isWater);
}

export interface DrawTileOptions {
  x: number;
  y: number;
  tile: Tile;
  isWater: boolean;
  currentWater: number;
  shiftHeld?: boolean;
  currentTemp?: number;
  currentPressure?: number;
  lockedCost?: number | null;
  lockedGain?: number | null;
  isHovered?: boolean;
  blockedWaterDir?: Direction | null;
  rotationDegOverride?: number;
  buttEndDirs?: Set<Direction>;
  seaNeighbors?: SeaNeighbors;
  graniteNeighbors?: GraniteNeighbors;
  afterOuterCircleFn?: () => void;
  levelStyle?: LevelStyle;
  nowMs?: number;
}

interface NonPipeShapeDrawContext {
  shape: PipeShape;
  tile: Tile;
  color: string;
  half: number;
  isWater: boolean;
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  lockedCost: number | null;
  lockedGain: number | null;
  effectiveButtEndDirs: Set<Direction> | undefined;
  seaNeighbors: SeaNeighbors | undefined;
  graniteNeighbors: GraniteNeighbors | undefined;
  afterOuterCircleFn: (() => void) | undefined;
  levelStyle: LevelStyle | undefined;
}

const NON_PIPE_DRAWN_SHAPES = new Set<PipeShape>([
  PipeShape.Source, PipeShape.Sink, PipeShape.Chamber, PipeShape.Granite,
  PipeShape.Tree, PipeShape.Tree2, PipeShape.Tree3, PipeShape.Tree4, PipeShape.Sea,
]);

/** True for the shapes drawn in the un-rotated dispatch below (Empty/other shapes draw nothing here). */
function _isNonPipeDrawnShape(shape: PipeShape): boolean {
  return NON_PIPE_DRAWN_SHAPES.has(shape);
}

function _dispatchNonPipeShapeDraw(ctx: CanvasRenderingContext2D, c: NonPipeShapeDrawContext): void {
  if (c.shape === PipeShape.Source || c.shape === PipeShape.Sink) {
    _drawSourceOrSinkTile(ctx, c);
    return;
  }
  if (c.shape === PipeShape.Chamber) {
    _drawChamberTile(ctx, c);
    return;
  }
  _drawStaticObstacleTile(ctx, c);
}

function _drawSourceOrSinkTile(ctx: CanvasRenderingContext2D, c: NonPipeShapeDrawContext): void {
  const isSource = c.shape === PipeShape.Source;
  drawSourceOrSink(ctx, {
    connections: c.tile.connections, color: c.color, half: c.half, isSource, buttEndDirs: c.effectiveButtEndDirs,
    centerLabel: isSource ? { text: String(c.currentWater), color: LABEL_COLOR } : undefined,
    afterOuterCircleFn: c.afterOuterCircleFn,
  });
}

function _drawChamberTile(ctx: CanvasRenderingContext2D, c: NonPipeShapeDrawContext): void {
  // Use TILE_SIZE / 2 (exact tile boundary) rather than Math.ceil so the
  // clip and stub endpoints land precisely on the tile edge at every tile size,
  // consistent with the pipe-body path approach in _drawUnifiedPipeBody.
  drawChamber(
    ctx, c.tile, c.color, c.isWater, TILE_SIZE / 2, c.shiftHeld, c.currentTemp, c.currentPressure,
    c.lockedCost, c.lockedGain, c.effectiveButtEndDirs,
  );
  // Valve icons: draw over the chamber when it has first-connection constraints.
  if (c.tile.firstConnections && c.tile.firstConnections.size > 0) {
    drawChamberValveIcons(ctx, c.tile.firstConnections, c.tile.connections, c.isWater, TILE_SIZE / 2);
  }
}

function _drawStaticObstacleTile(ctx: CanvasRenderingContext2D, c: NonPipeShapeDrawContext): void {
  // Granite – solid impassable stone block; no connections.
  if (c.shape === PipeShape.Granite) { drawGranite(ctx, c.half, c.graniteNeighbors); return; }
  // Tree variants – impassable obstacles rendered as top-down broad-leafed trees.
  if (c.shape === PipeShape.Tree) { drawTree(ctx, c.half, c.levelStyle); return; }
  if (c.shape === PipeShape.Tree2) { drawTree2(ctx, c.half, c.levelStyle); return; }
  if (c.shape === PipeShape.Tree3) { drawTree3(ctx, c.half, c.levelStyle); return; }
  if (c.shape === PipeShape.Tree4) { drawTree4(ctx, c.half, c.levelStyle); return; }
  // Sea – impassable water tile with animated ripples and land border.
  const defaultNeighbors: SeaNeighbors = { north: false, east: false, south: false, west: false, nw: false, ne: false, sw: false, se: false };
  drawSea(ctx, c.half, c.seaNeighbors ?? defaultNeighbors, seaFillColor(c.levelStyle));
}

interface BlockedPipeTileContext {
  tile: Tile;
  shape: PipeShape;
  rotation: number;
  half: number;
  color: string;
  currentPressure: number;
  effectiveBlockedWaterDir: Direction | null;
  effectiveButtEndDirs: Set<Direction> | undefined;
}

/**
 * Arm-by-arm drawing for one-way blocked pipes: draw ALL black outlines
 * first, then ALL color fills.  This ordering prevents a later arm's black
 * outline from overwriting an already-painted arm's color at the junction.
 */
function _drawBlockedPipeTile(ctx: CanvasRenderingContext2D, c: BlockedPipeTileContext): void {
  const dryColor = resolveTileColor(c.tile, false, c.currentPressure);
  // Sort blocked arm first so the dominant (water) color is painted last.
  const sortedArms = _sortArmsBlockedFirst(c.tile.connections, c.effectiveBlockedWaterDir);
  _drawPipeArmOutlines(ctx, c.tile.connections, c);
  _drawPipeArmFills(ctx, sortedArms, dryColor, c);
  if (LEAKY_PIPE_SHAPES.has(c.shape)) {
    _drawLeakyRustSpots(ctx, c.tile, c.half, c.effectiveBlockedWaterDir);
  }
}

function _sortArmsBlockedFirst(connections: ReadonlySet<Direction>, blockedDir: Direction | null): Direction[] {
  return [...connections].sort((a, b) => (a === blockedDir ? -1 : b === blockedDir ? 1 : 0));
}

/**
 * All arm black outlines.  Each arm uses lineCap='round' at the centre end
 * (natural semicircle cap) and a clip-based flat end at the tile edge when
 * buttEnd is true.  The natural round caps from all arms together cover the
 * centre junction without visible seaming.
 */
function _drawPipeArmOutlines(ctx: CanvasRenderingContext2D, connections: ReadonlySet<Direction>, c: BlockedPipeTileContext): void {
  ctx.lineWidth = LINE_WIDTH + _s(3);
  for (const armDir of connections) {
    _drawPipeArmInRotatedFrame(ctx, {
      absDir: armDir, tileRotation: c.rotation, half: c.half, color: 'black',
      buttEnd: c.effectiveButtEndDirs?.has(armDir) ?? false,
    });
  }
}

/** All arm color fills (blocked arm first; dominant water color last). */
function _drawPipeArmFills(ctx: CanvasRenderingContext2D, sortedArms: Direction[], dryColor: string, c: BlockedPipeTileContext): void {
  ctx.lineWidth = LINE_WIDTH;
  for (const armDir of sortedArms) {
    const armColor = armDir === c.effectiveBlockedWaterDir ? dryColor : c.color;
    _drawPipeArmInRotatedFrame(ctx, {
      absDir: armDir, tileRotation: c.rotation, half: c.half, color: armColor,
      buttEnd: c.effectiveButtEndDirs?.has(armDir) ?? false,
    });
  }
}

/**
 * Unified shape path: draw the entire pipe body as a single filled shape
 * with a contiguous outer outline.  This eliminates the junction seam
 * artifacts that appear when arms are stroked individually.
 */
function _drawUnifiedPipeBody(ctx: CanvasRenderingContext2D, c: {
  tile: Tile; shape: PipeShape; half: number; color: string;
  effectiveRotation: number; effectiveButtEndDirs: Set<Direction> | undefined;
}): void {
  // Use TILE_SIZE / 2 (exact tile boundary) rather than Math.ceil so the path
  // endpoints land precisely on the tile edge at every tile size.
  const pathHalf = TILE_SIZE / 2;
  const localButtEndDirs = _resolveLocalButtEndDirs(c.effectiveButtEndDirs, c.effectiveRotation);
  drawPipeBody(ctx, { shape: c.shape, half: pathHalf, localButtEndDirs, fillColor: c.color });
  if (LEAKY_PIPE_SHAPES.has(c.shape)) {
    _drawLeakyRustSpots(ctx, c.tile, c.half, null);
  }
}

function _resolveLocalButtEndDirs(
  effectiveButtEndDirs: Set<Direction> | undefined, effectiveRotation: number,
): ReadonlySet<Direction> | undefined {
  if (!effectiveButtEndDirs?.size) return undefined;
  LOCAL_BUTT_END_DIRS_BUFFER.clear();
  for (const dir of effectiveButtEndDirs) {
    LOCAL_BUTT_END_DIRS_BUFFER.add(toLocalDir(dir, effectiveRotation));
  }
  return LOCAL_BUTT_END_DIRS_BUFFER;
}

/**
 * Rotation arrow overlay for spinnable pipes.
 * When Shift is held the arrow reflects CCW to indicate the click direction.
 * When the mouse hovers over the tile the arrow rotates continuously in the
 * indicated direction so the player knows the pipe is interactive.
 */
function _drawSpinArrowOverlay(ctx: CanvasRenderingContext2D, opts: {
  cx: number; cy: number; isHovered: boolean; shiftHeld: boolean; nowMs: number;
}): void {
  const { cx, cy, isHovered, shiftHeld, nowMs } = opts;
  ctx.save();
  ctx.translate(cx, cy);
  if (isHovered) {
    const animAngle = (nowMs * SPIN_ANIM_SPEED) % (2 * Math.PI);
    ctx.rotate(shiftHeld ? -animAngle : animAngle);
  }
  drawSpinArrow(ctx, shiftHeld);
  ctx.restore();
}

/**
 * When a rotation override is active, use it; blocked arms and butt-end dirs are
 * suppressed during rotation animation because the arm directions are mid-transition.
 */
function _computeEffectiveRotationState(
  rotation: number, rotationDegOverride: number | undefined,
  blockedWaterDir: Direction | null, buttEndDirs: Set<Direction> | undefined,
): { effectiveRotation: number; effectiveBlockedWaterDir: Direction | null; effectiveButtEndDirs: Set<Direction> | undefined } {
  if (rotationDegOverride === undefined) {
    return { effectiveRotation: rotation, effectiveBlockedWaterDir: blockedWaterDir, effectiveButtEndDirs: buttEndDirs };
  }
  return { effectiveRotation: rotationDegOverride, effectiveBlockedWaterDir: null, effectiveButtEndDirs: undefined };
}

export function drawTile(ctx: CanvasRenderingContext2D, opts: DrawTileOptions): void {
  const {
    x, y, tile, isWater, currentWater,
    shiftHeld = false, currentTemp = 0, currentPressure = 1,
    lockedCost = null, lockedGain = null, isHovered = false, blockedWaterDir = null,
    rotationDegOverride, buttEndDirs, seaNeighbors, graniteNeighbors,
    afterOuterCircleFn, levelStyle, nowMs = Date.now(),
  } = opts;
  const { shape, rotation } = tile;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const half = Math.ceil(TILE_SIZE / 2);

  const { effectiveRotation, effectiveBlockedWaterDir, effectiveButtEndDirs } =
    _computeEffectiveRotationState(rotation, rotationDegOverride, blockedWaterDir, buttEndDirs);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((effectiveRotation * Math.PI) / 180);

  const color = resolveTileColor(tile, isWater, currentPressure);

  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';

  // When a one-way tile's blocked exit direction applies and the tile has water,
  // draw each pipe arm individually so the blocked arm can be shown without water.
  const isPipeShape = PIPE_SHAPES.has(shape);
  const isBlockedPipe = effectiveBlockedWaterDir !== null && isWater && isPipeShape;

  if (isBlockedPipe) {
    _drawBlockedPipeTile(ctx, {
      tile, shape, rotation, half, color, currentPressure, effectiveBlockedWaterDir, effectiveButtEndDirs,
    });
  } else if (isPipeShape) {
    _drawUnifiedPipeBody(ctx, { tile, shape, half, color, effectiveRotation, effectiveButtEndDirs });
  } else if (_isNonPipeDrawnShape(shape)) {
    // Restore to un-rotated state so we can draw based on actual connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _dispatchNonPipeShapeDraw(ctx, {
      shape, tile, color, half, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
      lockedCost, lockedGain, effectiveButtEndDirs, seaNeighbors, graniteNeighbors, afterOuterCircleFn, levelStyle,
    });
  }

  ctx.restore();

  if (SPIN_PIPE_SHAPES.has(shape)) {
    _drawSpinArrowOverlay(ctx, { cx, cy, isHovered, shiftHeld, nowMs });
  }
}

/**
 * Returns true when a tile can be replaced by the given selected shape and
 * rotation.  A tile is replaceable when it is a non-fixed regular or gold pipe,
 * the gold-space constraint is satisfied, and the result would actually differ
 * from the current tile (different shape or different rotation).
 */
function isReplaceableByShape(tile: Tile, sel: PlacementSelection): boolean {
  return (
    !tile.isFixed &&
    !SPIN_PIPE_SHAPES.has(tile.shape) &&
    (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) &&
    (tile.shape !== sel.selectedShape || tile.rotation !== sel.pendingRotation) &&
    (!sel.isGoldCell || sel.selectedIsGold)
  );
}

/**
 * Draw a small top-down hex bolt head centered at canvas position (bx, by).
 * Used to mark the four corners of pre-placed fixed pipe tiles.
 */
function _drawHexBoltHead(ctx: CanvasRenderingContext2D, bx: number, by: number): void {
  const r = _s(3.5);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    // Flat-top orientation: first vertex at 30° (π/6)
    const angle = (i * Math.PI) / 3 + Math.PI / 6;
    const vx = bx + r * Math.cos(angle);
    const vy = by + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
  ctx.fillStyle = BOLT_FILL_COLOR;
  ctx.fill();
  ctx.strokeStyle = BOLT_BORDER_COLOR;
  ctx.lineWidth = Math.max(1, _s(0.75));
  ctx.stroke();
}

/**
 * Pass 5: Draw small hex bolt head decorations at the four corners of every
 * pre-placed fixed pipe tile (non-spinnable, cannot be modified by the player).
 * Not drawn on spin pipes (which show a rotation arrow instead) or on
 * special tiles like Source, Sink, Chamber, or obstacle tiles.
 */
/** True when the cell at (nr, nc) is a fixed pipe tile. */
function _isFixedPipeTile(board: Board, nr: number, nc: number): boolean {
  if (_isOutOfBoundsCell(board, nr, nc)) return false;
  const t = board.grid[nr][nc];
  return t.isFixed && PIPE_SHAPES.has(t.shape);
}

interface BoltCorner {
  rowOffset: -1 | 1;
  colOffset: -1 | 1;
}

const BOLT_CORNERS: readonly BoltCorner[] = [
  { rowOffset: -1, colOffset: -1 }, // top-left
  { rowOffset: -1, colOffset: 1 },  // top-right
  { rowOffset: 1, colOffset: -1 },  // bottom-left
  { rowOffset: 1, colOffset: 1 },   // bottom-right
];

interface BoltTileContext {
  ctx: CanvasRenderingContext2D;
  board: Board;
  r: number;
  c: number;
  x: number;
  y: number;
  inset: number;
}

/**
 * Draw one corner's bolt, unless either adjacent tile sharing that corner's
 * two edges is itself a fixed pipe tile.
 */
function _drawFixedPipeBoltForCorner(tile: BoltTileContext, corner: BoltCorner): void {
  const { ctx, board, r, c, x, y, inset } = tile;
  if (_isFixedPipeTile(board, r + corner.rowOffset, c) || _isFixedPipeTile(board, r, c + corner.colOffset)) return;
  const bx = corner.colOffset < 0 ? x + inset : x + TILE_SIZE - inset;
  const by = corner.rowOffset < 0 ? y + inset : y + TILE_SIZE - inset;
  _drawHexBoltHead(ctx, bx, by);
}

function _renderPass5FixedPipeBolts(ctx: CanvasRenderingContext2D, board: Board): void {
  const inset = _s(7.5);
  ctx.save();
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      // Only draw bolts on fixed, non-spin pipe tiles (pre-placed and unmodifiable)
      if (!tile.isFixed || !PIPE_SHAPES.has(tile.shape)) continue;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const boltTile: BoltTileContext = { ctx, board, r, c, x, y, inset };
      for (const corner of BOLT_CORNERS) {
        _drawFixedPipeBoltForCorner(boltTile, corner);
      }
    }
  }
  ctx.restore();
}

/**
 * Pass 6: Draw error-highlight overlays on top of all tile content.
 *
 * The pulsing red rectangle is drawn last so it appears above pipes, chambers,
 * and all other tile visuals, making it clearly visible during an invalid move.
 */
function _renderPass6ErrorHighlights(
  ctx: CanvasRenderingContext2D,
  board: Board,
  highlightedPositions: Set<string>,
  now: number,
): void {
  if (highlightedPositions.size === 0) return;
  const pulse = 0.35 + 0.25 * ((Math.sin(now / 120) + 1) / 2);
  ctx.fillStyle = `rgba(220,50,50,${pulse.toFixed(3)})`;
  ctx.strokeStyle = ERROR_HIGHLIGHT_BORDER;
  ctx.lineWidth = 3;
  for (const key of highlightedPositions) {
    const [r, c] = parseKey(key);
    if (_isOutOfBoundsCell(board, r, c)) continue;
    const x = c * TILE_SIZE;
    const y = r * TILE_SIZE;
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  }
}

/** Render the full game board onto the canvas. */
export interface RenderBoardOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  mouseCanvasPos: { x: number; y: number } | null;
  shiftHeld?: boolean;
  currentTemp?: number;
  currentPressure?: number;
  highlightedPositions?: Set<string>;
  hoverRotationDelta?: number;
  rotationOverrides?: Map<string, number>;
  scaleOverrides?: Map<string, number>;
  shakeOffsets?: Map<string, number>;
  fillExclude?: Set<string>;
  drainInclude?: Set<string>;
  winTileOverlayFn?: (ctx: CanvasRenderingContext2D) => void;
  sinkVortexFn?: () => void;
  cementCrackFn?: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * Tiles in fillExclude are rendered dry so the fill overlay can paint water on top.
 * Tiles in drainInclude are rendered as filled (water) so the drain overlay can paint dry on top.
 */
function _needsEffectiveFilledOverride(fillExclude: Set<string> | undefined, drainInclude: Set<string> | undefined): boolean {
  return (fillExclude !== undefined && fillExclude.size > 0) || (drainInclude !== undefined && drainInclude.size > 0);
}

/** Remove every key in `keys` (if given) from `target`, in place. */
function _removeKeysFromSet(target: Set<string>, keys: Set<string> | undefined): void {
  if (!keys) return;
  for (const k of keys) target.delete(k);
}

/** Add every key in `keys` (if given) to `target`, in place. */
function _addKeysToSet(target: Set<string>, keys: Set<string> | undefined): void {
  if (!keys) return;
  for (const k of keys) target.add(k);
}

function _computeEffectiveFilledPositions(
  filled: Set<string>, fillExclude: Set<string> | undefined, drainInclude: Set<string> | undefined,
): Set<string> {
  if (!_needsEffectiveFilledOverride(fillExclude, drainInclude)) return filled;
  const effectiveFilled = new Set<string>(filled);
  _removeKeysFromSet(effectiveFilled, fillExclude);
  _addKeysToSet(effectiveFilled, drainInclude);
  return effectiveFilled;
}

export function renderBoard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, opts: RenderBoardOptions): void {
  const {
    board, selectedShape, pendingRotation, mouseCanvasPos,
    shiftHeld = false, currentTemp = 0, currentPressure = 1,
    highlightedPositions = new Set<string>(), hoverRotationDelta = 0,
    rotationOverrides, scaleOverrides, shakeOffsets, fillExclude, drainInclude,
    winTileOverlayFn, sinkVortexFn, cementCrackFn,
  } = opts;

  const now = Date.now();
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  const effectiveFilled = _computeEffectiveFilledPositions(filled, fillExclude, drainInclude);
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(now / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  _renderPass1Backgrounds(ctx, { board, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha });
  _renderPass2NonPipeTiles(ctx, {
    board, filled: effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure,
    sinkVortexFn, shakeOffsets,
  });
  // Win tile glow overlay: rendered above Source/Sink/Chamber content but beneath
  // pipe strokes, so it is visible on all connected tile types.
  winTileOverlayFn?.(ctx);
  // Cement crack lines: rendered above floor/obstacle tiles but beneath pipe strokes.
  cementCrackFn?.(ctx);
  _renderPass3PipeTiles(ctx, {
    board, filled: effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure,
    mouseCanvasPos, now, rotationOverrides, scaleOverrides, shakeOffsets,
  });
  _renderPass4CementLabels(ctx, board);
  _renderPass5FixedPipeBolts(ctx, board);
  // Error highlights are drawn last so they appear above all tile content.
  _renderPass6ErrorHighlights(ctx, board, highlightedPositions, now);
  _renderHoverPreview(ctx, {
    board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos,
    hoverRotationDelta, currentWater, filledPositions: effectiveFilled, now,
  });
}

/**
 * Render container-fill reveal animations for all active container (Chamber/Sink)
 * fill animation entries.  For each active entry the tile is redrawn in its
 * connected (water) state inside a clip region that sweeps from the entry edge to
 * the opposite edge, creating a smooth wipe transition from the dry appearance.
 *
 * Call this after {@link renderBoard} so the reveal is painted on top of the dry
 * base tile.
 *
 * @param ctx  - 2D rendering context.
 * @param opts - Rendering options.
 * @param opts.board        - The current game board.
 * @param opts.anims        - The live fill animation array (already cleaned up by
 *                            {@link computeActiveFillKeys}).
 * @param opts.currentWater - Current water count (passed to drawTile for Source labels).
 * @param opts.shiftHeld    - Whether the Shift key is held (affects chamber cost display).
 * @param opts.currentTemp  - Current effective temperature.
 * @param opts.currentPressure - Current effective pressure.
 * @param opts.now          - Current {@link performance.now()} timestamp.
 */
export interface ContainerFillAnimsOptions {
  board: Board;
  anims: PipeFillAnim[];
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  now: number;
}

/**
 * Determine the clip rectangle that reveals connected state progressively,
 * starting from the full entry edge and sweeping to the opposite edge.
 */
function _computeFillAnimClipRect(
  entryDir: Direction, x: number, y: number, progress: number,
): { x: number; y: number; w: number; h: number } {
  switch (entryDir) {
    case Direction.North: // entry at top → sweep downward
      return { x, y, w: TILE_SIZE, h: progress * TILE_SIZE };
    case Direction.South: // entry at bottom → sweep upward
      return { x, y: y + (1 - progress) * TILE_SIZE, w: TILE_SIZE, h: progress * TILE_SIZE };
    case Direction.East: // entry at right → sweep leftward
      return { x: x + (1 - progress) * TILE_SIZE, y, w: progress * TILE_SIZE, h: TILE_SIZE };
    case Direction.West: // entry at left → sweep rightward
      return { x, y, w: progress * TILE_SIZE, h: TILE_SIZE };
    default:
      return { x, y, w: TILE_SIZE, h: TILE_SIZE };
  }
}

function _renderOneContainerFillAnim(
  ctx: CanvasRenderingContext2D, board: Board, anim: PipeFillAnim, now: number,
  drawOpts: { currentWater: number; shiftHeld: boolean; currentTemp: number; currentPressure: number },
): void {
  if (!anim.isContainer) return;
  const elapsed = now - anim.startTime;
  if (elapsed < 0) return; // not started yet
  const progress = Math.min(1, elapsed / FILL_ANIM_DURATION);
  if (progress <= 0) return;

  const { row, col, entryDir } = anim;
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  const tile = board.getTile({ row, col });
  if (!tile) return;

  const clip = _computeFillAnimClipRect(entryDir, x, y, progress);
  // Locked cost/gain for chambers so the revealing tile shows the same values
  // it will display once fully connected — this animation always renders the
  // tile as if fully connected, so isWater is hardcoded true here.
  const { lockedCost, lockedGain } = _computeChamberLockedValues(board, tile, { row, col }, true);
  // Butt-end cap directions the same way the static board render does, so
  // disconnected chamber connector nubs look identical during the animation and after.
  const buttEndDirs = _computeButtEndDirsForTile(board, tile, row, col);

  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  // Draw the tile in its connected (water) state within the clip region.
  drawTile(ctx, {
    x, y, tile, isWater: true, currentWater: drawOpts.currentWater, shiftHeld: drawOpts.shiftHeld,
    currentTemp: drawOpts.currentTemp, currentPressure: drawOpts.currentPressure,
    lockedCost, lockedGain, buttEndDirs,
  });
  ctx.restore();
}

export function renderContainerFillAnims(ctx: CanvasRenderingContext2D, opts: ContainerFillAnimsOptions): void {
  const { board, anims, currentWater, shiftHeld, currentTemp, currentPressure, now } = opts;
  for (const anim of anims) {
    _renderOneContainerFillAnim(ctx, board, anim, now, { currentWater, shiftHeld, currentTemp, currentPressure });
  }
}

/**
 * Draw the drain animation for container tiles (Chamber, Source, Sink).
 *
 * The tile is drawn in its connected (water) state, clipped to the remaining-water
 * region that shrinks as the animation progresses.  The drain sweeps in the same
 * direction as fill (exit edge drains first, opposite side last), so the clip
 * shrinks from the exit edge toward the opposite side.
 */
export interface ContainerDrainAnimsOptions {
  board: Board;
  anims: PipeDrainAnim[];
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  now: number;
}

/**
 * Clip to the remaining-water region.  Drain sweeps from the exit edge toward
 * the opposite side, so remaining water is on the side opposite to exitDir.
 * Expand by LINE_WIDTH/2 in all directions so that round-cap nubs extending
 * past the tile boundary are included and drain smoothly instead of clipping immediately.
 */
function _computeDrainAnimClipRect(
  exitDir: Direction, x: number, y: number, progress: number,
): { x: number; y: number; w: number; h: number } {
  const nub = LINE_WIDTH / 2;
  switch (exitDir) {
    case Direction.North: // exit at top → remaining water shrinks upward from bottom
      return { x: x - nub, y: y + progress * TILE_SIZE - nub, w: TILE_SIZE + LINE_WIDTH, h: (1 - progress) * TILE_SIZE + LINE_WIDTH };
    case Direction.South: // exit at bottom → remaining water shrinks downward from top
      return { x: x - nub, y: y - nub, w: TILE_SIZE + LINE_WIDTH, h: (1 - progress) * TILE_SIZE + LINE_WIDTH };
    case Direction.East: // exit at right → remaining water shrinks rightward from left
      return { x: x - nub, y: y - nub, w: (1 - progress) * TILE_SIZE + LINE_WIDTH, h: TILE_SIZE + LINE_WIDTH };
    case Direction.West: // exit at left → remaining water shrinks leftward from right
      return { x: x + progress * TILE_SIZE - nub, y: y - nub, w: (1 - progress) * TILE_SIZE + LINE_WIDTH, h: TILE_SIZE + LINE_WIDTH };
    default:
      return { x, y, w: TILE_SIZE, h: TILE_SIZE };
  }
}

function _renderOneContainerDrainAnim(
  ctx: CanvasRenderingContext2D, board: Board, anim: PipeDrainAnim, now: number,
  drawOpts: { currentWater: number; shiftHeld: boolean; currentTemp: number; currentPressure: number },
): void {
  if (!anim.isContainer) return;
  const elapsed = now - anim.startTime;
  if (elapsed < 0 || elapsed >= FILL_ANIM_DURATION) return;
  const progress = elapsed / FILL_ANIM_DURATION;

  const { row, col, exitDir } = anim;
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  const tile = board.getTile({ row, col });
  if (!tile) return;

  const clip = _computeDrainAnimClipRect(exitDir, x, y, progress);
  // This animation always renders the tile as if fully connected (isWater hardcoded
  // true), same as _renderOneContainerFillAnim above.
  const { lockedCost, lockedGain } = _computeChamberLockedValues(board, tile, { row, col }, true);
  const buttEndDirs = _computeButtEndDirsForTile(board, tile, row, col);

  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  drawTile(ctx, {
    x, y, tile, isWater: true, currentWater: drawOpts.currentWater, shiftHeld: drawOpts.shiftHeld,
    currentTemp: drawOpts.currentTemp, currentPressure: drawOpts.currentPressure,
    lockedCost, lockedGain, buttEndDirs,
  });
  ctx.restore();
}

export function renderContainerDrainAnims(ctx: CanvasRenderingContext2D, opts: ContainerDrainAnimsOptions): void {
  const { board, anims, currentWater, shiftHeld, currentTemp, currentPressure, now } = opts;
  for (const anim of anims) {
    _renderOneContainerDrainAnim(ctx, board, anim, now, { currentWater, shiftHeld, currentTemp, currentPressure });
  }
}

/**
 * Pass 1: Draw all tile backgrounds first so that pipe tile content drawn in pass 2
 * is never covered by a neighboring empty tile's background fill.
 */
interface RenderPass1BackgroundsOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  selectedIsGold: boolean;
  shimmerAlpha: number;
}

/** Shared gingham-checkerboard color pick, by tile parity, for a given inferred floor shape. */
function _resolveGinghamColor(floorShape: PipeShape, r: number, c: number): string {
  const paritySum = (r % 2) + (c % 2);
  const [gcLight, gcMid, gcDark] = ginghamColorsForFloor(floorShape);
  if (paritySum === 0) return gcLight;
  if (paritySum === 2) return gcDark;
  return gcMid;
}

/** Per-cell context shared by every Pass-1 background drawer, built once per grid cell. */
interface BackgroundCellContext {
  ctx: CanvasRenderingContext2D;
  board: Board;
  tile: Tile;
  r: number;
  c: number;
  x: number;
  y: number;
  isGoldCell: boolean;
  shimmerAlpha: number;
}

/** One-way cell: gingham background (inferred floor type) + directional arrow on top. */
function _drawOneWayCellBackground(cell: BackgroundCellContext, oneWayDir: Direction): void {
  const { ctx, board, r, c, x, y } = cell;
  const floorType = board.floorTypes.get(posKey(r, c)) ?? PipeShape.Empty;
  ctx.fillStyle = _resolveGinghamColor(floorType, r, c);
  ctx.fillRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  drawOneWayArrow(ctx, x, y, oneWayDir);
}

/** Cement cell: always show cement background regardless of tile on top. */
function _drawCementCellBackground(cell: BackgroundCellContext): void {
  const { ctx, board, r, c, x, y } = cell;
  const dryingTime = board.cementData.get(posKey(r, c)) as number;
  _drawCementBackground(ctx, x, y, dryingTime === 0);
}

/** Shimmering gold background for an empty gold-space cell. */
function _drawGoldEmptyCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number, shimmerAlpha: number): void {
  ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.fillStyle = `${GOLD_SPACE_SHIMMER_COLOR}${shimmerAlpha.toFixed(3)})`;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  // Gold border to make the cell clearly distinct
  ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  // Pipe-keyhole glyph: signals "gold pipes only" on the empty cell.
  drawGoldKeyholeGlyph(ctx, x, y, shimmerAlpha);
}

/** Gingham background plus any ambient decoration for a plain (non-gold) empty cell. */
function _drawPlainEmptyCellBackground(cell: BackgroundCellContext): void {
  const { ctx, board, tile, r, c, x, y } = cell;
  ctx.fillStyle = _resolveGinghamColor(tile.shape, r, c);
  ctx.fillRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
  const dec = board.ambientDecorations.get(posKey(r, c));
  if (dec) drawAmbientDecoration(ctx, dec);
}

function _drawEmptyFloorBackground(cell: BackgroundCellContext): void {
  if (cell.isGoldCell) {
    _drawGoldEmptyCellBackground(cell.ctx, cell.x, cell.y, cell.shimmerAlpha);
  } else {
    _drawPlainEmptyCellBackground(cell);
  }
}

/** Non-empty tile on a gold space: keep the darker gold background so the space is visible. */
function _drawGoldNonEmptyCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
}

function _isRemovablePipeTile(tile: Tile): boolean {
  return !tile.isFixed && (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape));
}

/** Player-placed (removable) pipes get a distinct background from fixed ones. */
function _drawPlainNonEmptyCellBackground(ctx: CanvasRenderingContext2D, tile: Tile, x: number, y: number): void {
  ctx.fillStyle = _isRemovablePipeTile(tile) ? REMOVABLE_BG_COLOR : TILE_BG;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
}

function _drawNonEmptyTileBackground(cell: BackgroundCellContext): void {
  if (cell.isGoldCell) {
    _drawGoldNonEmptyCellBackground(cell.ctx, cell.x, cell.y);
  } else {
    _drawPlainNonEmptyCellBackground(cell.ctx, cell.tile, cell.x, cell.y);
  }
}

function _renderPass1Backgrounds(ctx: CanvasRenderingContext2D, opts: RenderPass1BackgroundsOptions): void {
  // selectedShape/pendingRotation/selectedIsGold are accepted for interface consistency
  // with the other render passes but are not read by this pass (pre-existing: they were
  // unused parameters before this refactor too).
  const { board, shimmerAlpha } = opts;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isGoldCell = board.goldSpaces.has(posKey(r, c));
      const isCementCell = board.cementData.has(posKey(r, c));
      const oneWayDir = board.oneWayData.get(posKey(r, c));
      const cell: BackgroundCellContext = { ctx, board, tile, r, c, x, y, isGoldCell, shimmerAlpha };

      // Tile background
      if (oneWayDir !== undefined) {
        _drawOneWayCellBackground(cell, oneWayDir);
      } else if (isCementCell) {
        _drawCementCellBackground(cell);
      } else if (isEmptyFloor(tile.shape)) {
        _drawEmptyFloorBackground(cell);
      } else {
        _drawNonEmptyTileBackground(cell);
      }
    }
  }
}

/**
 * Pass 2: Draw all non-pipe tile content on top of all backgrounds.
 */
interface RenderPass2NonPipeTilesOptions {
  board: Board;
  filled: Set<string>;
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  sinkVortexFn?: () => void;
  shakeOffsets?: Map<string, number>;
}

/** True when a non-pipe tile should be skipped entirely: it's a pipe tile, or an empty-floor dot that a cement/one-way overlay already covers. */
function _shouldSkipNonPipeTile(board: Board, tile: Tile, r: number, c: number): boolean {
  if (PIPE_SHAPES.has(tile.shape)) return true;
  const isCementCell = board.cementData.has(posKey(r, c));
  // Skip drawing the empty-tile dot on cement or one-way cells – their
  // background texture/arrow is already clearly visible.
  return isEmptyFloor(tile.shape) && (isCementCell || board.oneWayData.has(posKey(r, c)));
}

/**
 * For connected ice/snow/sandstone tiles, the locked effective cost so
 * the tile can display the single locked-in value instead of the live formula.
 * For connected hot_plate tiles, both the locked gain (from frozen) and locked loss.
 * For siphon tiles, the frozen gain regardless of connection state (displayed always).
 */
function _computeChamberLockedValues(
  board: Board, tile: Tile, pos: { row: number; col: number }, isWater: boolean,
): { lockedCost: number | null; lockedGain: number | null } {
  const none = { lockedCost: null, lockedGain: null };
  if (tile.shape !== PipeShape.Chamber) return none;
  if (isWater && _isColdOrGelChamberContent(tile.chamberContent)) {
    return { lockedCost: _computeColdChamberLockedCost(board, pos), lockedGain: null };
  }
  if (tile.chamberContent === 'siphon') {
    return { lockedCost: null, lockedGain: board.getSiphonLockedGain(pos) };
  }
  if (isWater && tile.chamberContent === 'hot_plate') {
    return _computeHotPlateLockedValues(board, pos);
  }
  return none;
}

function _isColdOrGelChamberContent(content: Tile['chamberContent']): boolean {
  return content !== null && (COLD_CHAMBER_CONTENTS.has(content) || content === 'gel');
}

function _computeColdChamberLockedCost(board: Board, pos: { row: number; col: number }): number | null {
  const impact = board.getLockedWaterImpact(pos);
  return impact !== null ? Math.abs(impact) : null;
}

function _computeHotPlateLockedValues(
  board: Board, pos: { row: number; col: number },
): { lockedCost: number | null; lockedGain: number | null } {
  const impact = board.getLockedWaterImpact(pos);
  const gain = board.getLockedHotPlateGain(pos);
  if (impact === null || gain === null) return { lockedCost: null, lockedGain: null };
  return { lockedCost: Math.max(0, gain - impact), lockedGain: gain };
}

/**
 * For Source/Sink/Chamber tiles, which arm directions need a butt end cap.
 * For Chamber tiles the result is always a defined Set (possibly empty) so that
 * arms pointing at empty tiles trigger Phase 2 in _drawChamber and get round end
 * caps sticking into the adjacent tile.  An undefined result would fall through to
 * the legacy "all butt caps" path and suppress the round nubs entirely.
 */
function _computeButtEndDirsForTile(board: Board, tile: Tile, r: number, c: number): Set<Direction> | undefined {
  if (tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink) {
    return _computeButtEndDirs(board, r, c);
  }
  if (tile.shape === PipeShape.Chamber) {
    return _computeButtEndDirs(board, r, c) ?? new Set<Direction>();
  }
  return undefined;
}

/** For Sea tiles, which neighbors are also sea (for border rendering). */
function _computeSeaNeighborsForTile(board: Board, tile: Tile, r: number, c: number): SeaNeighbors | undefined {
  if (tile.shape !== PipeShape.Sea) return undefined;
  return computeSeaNeighbors((dr, dc) => {
    const nr = r + dr, nc = c + dc;
    return _isOutOfBoundsCell(board, nr, nc) || board.grid[nr][nc].shape === PipeShape.Sea;
  });
}

/** For Granite tiles, which neighbors are also granite (for seaming). */
function _computeGraniteNeighborsForTile(board: Board, tile: Tile, r: number, c: number): GraniteNeighbors | undefined {
  if (tile.shape !== PipeShape.Granite) return undefined;
  return computeGraniteNeighbors(board, r, c);
}

/**
 * Draw the gingham overlay on non-empty, non-pipe tiles (100% alpha pattern over the
 * tile background color) and return the per-tile inferred floor shape for style-dependent
 * rendering (e.g. Tree tile colors should match the local floor style, not the overall
 * board style). Returns undefined for tiles that don't get an overlay.
 */
function _tileGetsGinghamOverlay(shape: PipeShape): boolean {
  return shape === PipeShape.Granite || shape === PipeShape.Tree || shape === PipeShape.Tree2
    || shape === PipeShape.Tree3 || shape === PipeShape.Tree4 || shape === PipeShape.Chamber
    || shape === PipeShape.Source || shape === PipeShape.Sink;
}

function _drawGinghamOverlayIfNeeded(
  ctx: CanvasRenderingContext2D, board: Board, tile: Tile,
  geom: { row: number; col: number; x: number; y: number },
): PipeShape | undefined {
  if (!_tileGetsGinghamOverlay(tile.shape)) return undefined;
  const inferredFloorShape = board.floorTypes.get(posKey(geom.row, geom.col)) ?? PipeShape.Empty;
  drawGinghamOverlay(ctx, geom.x + 1, geom.y + 1, TILE_SIZE - 2, TILE_SIZE - 2, geom.row, geom.col, inferredFloorShape, 1.0); //alpha
  return inferredFloorShape;
}

/**
 * For the sink tile, an overlay callback that renders the vortex effect after the
 * outer circle but before the connector arms.  The callback must temporarily undo
 * the translation that drawTile/drawSourceOrSink applies to the context so that
 * renderVortex can use absolute canvas coordinates.
 */
function _buildSinkVortexOverlayFn(
  ctx: CanvasRenderingContext2D, tile: Tile, sinkVortexFn: (() => void) | undefined, x: number, y: number,
): (() => void) | undefined {
  if (tile.shape !== PipeShape.Sink || sinkVortexFn === undefined) return undefined;
  const tileCx = x + TILE_SIZE / 2;
  const tileCy = y + TILE_SIZE / 2;
  return () => {
    ctx.save();
    ctx.translate(-tileCx, -tileCy);
    sinkVortexFn();
    ctx.restore();
  };
}

/** Draw a tile, temporarily translating the context when a shake offset is active. */
function _drawNonPipeTile(ctx: CanvasRenderingContext2D, drawOpts: DrawTileOptions, shakeOffset: number | undefined): void {
  if (shakeOffset === undefined) {
    drawTile(ctx, drawOpts);
    return;
  }
  ctx.save();
  ctx.translate(shakeOffset, 0);
  drawTile(ctx, drawOpts);
  ctx.restore();
}

function _renderPass2NonPipeTiles(ctx: CanvasRenderingContext2D, opts: RenderPass2NonPipeTilesOptions): void {
  const { board, filled, currentWater, shiftHeld, currentTemp, currentPressure, sinkVortexFn, shakeOffsets } = opts;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (_shouldSkipNonPipeTile(board, tile, r, c)) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater = filled.has(posKey(r, c));

      const { lockedCost, lockedGain } = _computeChamberLockedValues(board, tile, { row: r, col: c }, isWater);
      const buttEndDirs = _computeButtEndDirsForTile(board, tile, r, c);
      const seaNeighbors = _computeSeaNeighborsForTile(board, tile, r, c);
      const graniteNeighbors = _computeGraniteNeighborsForTile(board, tile, r, c);
      const inferredFloorShape = _drawGinghamOverlayIfNeeded(ctx, board, tile, { row: r, col: c, x, y });

      // Derive the per-tile level style from the inferred floor shape for tiles that
      // render style-dependent visuals (e.g. Tree leaf colors).  Falls back to the
      // overall board style when the inferred floor shape is the default (Empty/Summer).
      const tileStyle = (inferredFloorShape !== undefined ? floorShapeToStyle(inferredFloorShape) : undefined) ?? board.style;

      const afterOuterCircleFn = _buildSinkVortexOverlayFn(ctx, tile, sinkVortexFn, x, y);

      const shakeOffset = shakeOffsets?.get(posKey(r, c));
      _drawNonPipeTile(ctx, {
        x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
        lockedCost, lockedGain, buttEndDirs, seaNeighbors, graniteNeighbors,
        afterOuterCircleFn, levelStyle: tileStyle,
      }, shakeOffset);
    }
  }
}

/**
 * Pass 3: Draw all pipe tile content on top of all non-pipe tile content so that
 * pipe rounded caps (lineCap='round') on arms pointing at empty tiles are never
 * overwritten by a neighboring empty tile's background fill drawn in pass 1/2.
 * Arms pointing at non-empty adjacent tiles use lineCap='butt' (flat ends) so
 * they sit flush with the tile boundary and do not bleed into adjacent tiles.
 */
interface RenderPass3PipeTilesOptions {
  board: Board;
  filled: Set<string>;
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  mouseCanvasPos: { x: number; y: number } | null;
  now: number;
  rotationOverrides?: Map<string, number>;
  scaleOverrides?: Map<string, number>;
  shakeOffsets?: Map<string, number>;
}

/**
 * If this pipe sits on a one-way cell, the arm pointing opposite the arrow
 * direction is blocked (dry) unless the neighbor in that direction is both
 * mutually connected AND actually water-filled.  A pipe tile placed adjacent
 * but not carrying water must not make the blocked arm appear wet.
 */
function _computeBlockedWaterDir(board: Board, filled: Set<string>, r: number, c: number): Direction | null {
  const owDir = board.oneWayData.get(posKey(r, c));
  if (owDir === undefined) return null;
  const antiDir = oppositeDirection(owDir);
  const delta = NEIGHBOUR_DELTA[antiDir];
  const neighborPos: GridPos = { row: r + delta.row, col: c + delta.col };
  // The arm carries water only when the neighbor can mutually connect AND
  // is actually water-filled (present in the filled set).
  const neighborCarriesWater = board.areMutuallyConnected(neighborPos, owDir)
    && filled.has(posKey(neighborPos.row, neighborPos.col));
  return neighborCarriesWater ? null : antiDir;
}

/** Draw a tile, applying an active shake and/or scale-pop transform when present. */
function _drawPipeTileWithOverrides(
  ctx: CanvasRenderingContext2D, drawOpts: DrawTileOptions,
  scaleOverride: number | undefined, shakeOffset: number | undefined,
): void {
  if (scaleOverride === undefined && shakeOffset === undefined) {
    drawTile(ctx, drawOpts);
    return;
  }
  const cx = drawOpts.x + TILE_SIZE / 2;
  const cy = drawOpts.y + TILE_SIZE / 2;
  ctx.save();
  if (shakeOffset !== undefined) ctx.translate(shakeOffset, 0);
  if (scaleOverride !== undefined) {
    ctx.translate(cx, cy);
    ctx.scale(scaleOverride, scaleOverride);
    ctx.translate(-cx, -cy);
  }
  drawTile(ctx, drawOpts);
  ctx.restore();
}

interface HoverGridPos {
  hoverRow: number;
  hoverCol: number;
}

function _computeHoverGridPos(mouseCanvasPos: { x: number; y: number } | null): HoverGridPos {
  if (!mouseCanvasPos) return { hoverRow: -1, hoverCol: -1 };
  return { hoverRow: Math.floor(mouseCanvasPos.y / TILE_SIZE), hoverCol: Math.floor(mouseCanvasPos.x / TILE_SIZE) };
}

function _isHoveredSpinnableTile(r: number, c: number, hoverPos: HoverGridPos, shape: PipeShape): boolean {
  return r === hoverPos.hoverRow && c === hoverPos.hoverCol && SPIN_PIPE_SHAPES.has(shape);
}

function _renderPass3PipeTiles(ctx: CanvasRenderingContext2D, opts: RenderPass3PipeTilesOptions): void {
  const {
    board, filled, currentWater, shiftHeld, currentTemp, currentPressure,
    mouseCanvasPos, now, rotationOverrides, scaleOverrides, shakeOffsets,
  } = opts;
  const hoverPos = _computeHoverGridPos(mouseCanvasPos);

  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (!PIPE_SHAPES.has(tile.shape)) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater = filled.has(posKey(r, c));
      const isHovered = _isHoveredSpinnableTile(r, c, hoverPos, tile.shape);
      const blockedWaterDir = _computeBlockedWaterDir(board, filled, r, c);

      // Apply any active rotation animation override for this tile.
      const rotOverride = rotationOverrides?.get(posKey(r, c));
      const scaleOverride = scaleOverrides?.get(posKey(r, c));
      const shakeOffset = shakeOffsets?.get(posKey(r, c));

      // Determine which arm directions need a flat (butt) end cap.
      const buttEndDirs = _computeButtEndDirs(board, r, c);

      _drawPipeTileWithOverrides(ctx, {
        x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
        isHovered, blockedWaterDir, rotationDegOverride: rotOverride, buttEndDirs, nowMs: now,
      }, scaleOverride, shakeOffset);
    }
  }
}

/**
 * Pass 4: Draw cement drying-time labels in the top-left corner of every cement cell.
 * Drawn after all tile content so the label always appears on top of any pipe graphic.
 */
function _renderPass4CementLabels(ctx: CanvasRenderingContext2D, board: Board): void {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (!board.cementData.has(posKey(r, c))) continue;
      const dryingTime = board.cementData.get(posKey(r, c)) as number;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      // A tile is "hardened" (shows 'X') whenever dryingTime is 0.
      const isHardened = dryingTime === 0;
      drawCementLabel(ctx, { x, y, dryingTime, isHardened });
    }
  }
}

const PREVIEW_PULSE_PERIOD_MS = 1200;

/** Slowly-pulsing alpha shared by the placement/rotation preview tile and its connection-preview edges. */
function _computePreviewPulseAlpha(now: number): number {
  const t = (now % PREVIEW_PULSE_PERIOD_MS) / PREVIEW_PULSE_PERIOD_MS;
  return 0.35 + 0.2 * ((Math.sin(t * Math.PI * 2) + 1) / 2);
}

/**
 * Draw a semi-transparent placement/rotation preview overlay at (px, py).
 * Applies a slowly-pulsing alpha and a yellow glow so the preview is visually
 * distinct from a live tile without obscuring what is beneath it.
 */
function _drawPreviewTile(ctx: CanvasRenderingContext2D, geom: HoverPreviewGeom, previewTile: Tile): void {
  const { px, py, currentWater, now } = geom;
  ctx.save();
  ctx.globalAlpha = _computePreviewPulseAlpha(now);
  ctx.shadowColor = PREVIEW_SHADOW_COLOR;
  ctx.shadowBlur = PREVIEW_SHADOW_BLUR;
  drawTile(ctx, { x: px, y: py, tile: previewTile, isWater: false, currentWater });
  ctx.restore();
}

/**
 * Draw edge highlights on neighboring tiles that would form a new mutual
 * connection with the hovered preview tile, or lose an existing one.
 *
 * Green highlight  → neighbor would connect to the preview tile (dry neighbor: bright green;
 *                    water-filled neighbor: water-blue).
 * Red highlight    → neighbor is currently connected to the hovered cell's tile, but the
 *                    preview tile would break that connection (replacement / rotation case).
 *
 * @param ctx          - Canvas 2D context.
 * @param board        - The current game board.
 * @param hoverRow     - Row index of the hovered cell.
 * @param hoverCol     - Column index of the hovered cell.
 * @param previewTile  - The tile that would be placed / result from rotation.
 * @param filledPositions - Set of posKey strings for water-filled cells.
 */
/** True when a one-way tile at `owDir` blocks entry from `dir` (entry is blocked from its opposite side). */
function _oneWayBlocksDir(owDir: Direction | undefined, dir: Direction): boolean {
  return owDir !== undefined && dir === oppositeDirection(owDir);
}

interface NeighborEdge {
  neighbor: Tile;
  dir: Direction;
  oppDir: Direction;
  neighborOwDir: Direction | undefined;
}

function _wouldConnectToNeighbor(previewTile: Tile, edge: NeighborEdge): boolean {
  // The preview tile carries no one-way property, but the neighbor may block entry.
  // In areMutuallyConnected the "to" (neighbor) one-way blocks when dir === opposite(toOwDir).
  return previewTile.connections.has(edge.dir) && edge.neighbor.connections.has(edge.oppDir)
    && !_oneWayBlocksDir(edge.neighborOwDir, edge.dir);
}

function _isCurrentlyConnectedToNeighbor(currentTile: Tile, edge: NeighborEdge, hoverOwDir: Direction | undefined): boolean {
  return currentTile.connections.has(edge.dir) && edge.neighbor.connections.has(edge.oppDir)
    && !_oneWayBlocksDir(hoverOwDir, edge.dir) && !_oneWayBlocksDir(edge.neighborOwDir, edge.dir);
}

function _resolveConnectionPreviewColor(wouldDisconnect: boolean, isNeighborFilled: boolean): string {
  if (wouldDisconnect) return DISCONNECTION_PREVIEW_COLOR;
  return isNeighborFilled ? CONNECTION_PREVIEW_WATER_COLOR : CONNECTION_PREVIEW_COLOR;
}

function _computeNeighborGridPos(
  hoverRow: number, hoverCol: number, dir: Direction, board: Board,
): { nr: number; nc: number } | null {
  const delta = NEIGHBOUR_DELTA[dir];
  const nr = hoverRow + delta.row;
  const nc = hoverCol + delta.col;
  if (_isOutOfBoundsCell(board, nr, nc)) return null;
  return { nr, nc };
}

interface ConnectionPreviewNeighborContext {
  board: Board;
  hoverRow: number;
  hoverCol: number;
  previewTile: Tile;
  currentTile: Tile;
  hoverOwDir: Direction | undefined;
  filledPositions: Set<string>;
}

/**
 * Resolve the connection-preview highlight color for one cardinal direction from the
 * hovered cell, or null when nothing should be highlighted (out of bounds, empty
 * neighbor, or no connection change).
 *
 * Green highlight  → neighbor would connect to the preview tile (dry neighbor: bright green;
 *                    water-filled neighbor: water-blue).
 * Red highlight    → neighbor is currently connected to the hovered cell's tile, but the
 *                    preview tile would break that connection (replacement / rotation case).
 */
function _resolveConnectionPreviewColorForDir(dir: Direction, c: ConnectionPreviewNeighborContext): string | null {
  const pos = _computeNeighborGridPos(c.hoverRow, c.hoverCol, dir, c.board);
  if (!pos) return null;

  const neighbor = c.board.grid[pos.nr][pos.nc];
  if (neighbor.shape === PipeShape.Empty) return null;

  const oppDir = oppositeDirection(dir);
  const neighborKey = posKey(pos.nr, pos.nc);
  const neighborOwDir = c.board.oneWayData.get(neighborKey);

  const edge: NeighborEdge = { neighbor, dir, oppDir, neighborOwDir };
  const wouldConnect = _wouldConnectToNeighbor(c.previewTile, edge);
  const currentlyConnected = _isCurrentlyConnectedToNeighbor(c.currentTile, edge, c.hoverOwDir);
  const wouldDisconnect = currentlyConnected && !wouldConnect;
  if (!wouldConnect && !wouldDisconnect) return null;

  return _resolveConnectionPreviewColor(wouldDisconnect, c.filledPositions.has(neighborKey));
}

function _traceConnectionPreviewEdgePath(ctx: CanvasRenderingContext2D, dir: Direction, px: number, py: number): void {
  switch (dir) {
    case Direction.North:
      ctx.moveTo(px,             py);
      ctx.lineTo(px + TILE_SIZE, py);
      break;
    case Direction.South:
      ctx.moveTo(px,             py + TILE_SIZE);
      ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
      break;
    case Direction.East:
      ctx.moveTo(px + TILE_SIZE, py);
      ctx.lineTo(px + TILE_SIZE, py + TILE_SIZE);
      break;
    case Direction.West:
      ctx.moveTo(px,             py);
      ctx.lineTo(px,             py + TILE_SIZE);
      break;
  }
}

interface ConnectionPreviewEdgeGeom {
  px: number;
  py: number;
  alpha: number;
}

function _strokeConnectionPreviewEdge(
  ctx: CanvasRenderingContext2D, dir: Direction, color: string, geom: ConnectionPreviewEdgeGeom,
): void {
  const { px, py, alpha } = geom;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  _traceConnectionPreviewEdgePath(ctx, dir, px, py);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw edge highlights on neighboring tiles that would form a new mutual
 * connection with the hovered preview tile, or lose an existing one.
 *
 * @param ctx          - Canvas 2D context.
 * @param board        - The current game board.
 * @param hoverRow     - Row index of the hovered cell.
 * @param hoverCol     - Column index of the hovered cell.
 * @param previewTile  - The tile that would be placed / result from rotation.
 * @param filledPositions - Set of posKey strings for water-filled cells.
 */
function _renderConnectionPreview(ctx: CanvasRenderingContext2D, geom: HoverPreviewGeom, previewTile: Tile): void {
  const { board, hoverRow, hoverCol, px, py, filledPositions, now } = geom;
  const alpha = _computePreviewPulseAlpha(now);
  const currentTile = board.grid[hoverRow][hoverCol];
  const hoverOwDir = board.oneWayData.get(posKey(hoverRow, hoverCol));
  const neighborCtx: ConnectionPreviewNeighborContext = {
    board, hoverRow, hoverCol, previewTile, currentTile, hoverOwDir, filledPositions,
  };

  const edgeGeom: ConnectionPreviewEdgeGeom = { px, py, alpha };
  for (const [dir] of CARDINAL_DIRS) {
    const color = _resolveConnectionPreviewColorForDir(dir, neighborCtx);
    if (color === null) continue;
    _strokeConnectionPreviewEdge(ctx, dir, color, edgeGeom);
  }
}

/**
 * Draw semi-transparent hover previews: the pending inventory item placement
 * preview and the rotation preview for an existing tile.
 */
interface RenderHoverPreviewOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  selectedIsGold: boolean;
  mouseCanvasPos: { x: number; y: number } | null;
  hoverRotationDelta: number;
  currentWater: number;
  filledPositions: Set<string>;
  now: number;
}

function _computeHoverGridPosInBounds(
  mouseCanvasPos: { x: number; y: number }, board: Board,
): { row: number; col: number } | null {
  const col = Math.floor(mouseCanvasPos.x / TILE_SIZE);
  const row = Math.floor(mouseCanvasPos.y / TILE_SIZE);
  if (_isOutOfBoundsCell(board, row, col)) return null;
  return { row, col };
}

interface HoverPreviewGeom {
  board: Board;
  hoverRow: number;
  hoverCol: number;
  hoverTile: Tile;
  px: number;
  py: number;
  currentWater: number;
  filledPositions: Set<string>;
  now: number;
}

interface PlacementSelection {
  selectedShape: PipeShape;
  pendingRotation: number;
  selectedIsGold: boolean;
  isGoldCell: boolean;
}

function _canPlaceOrReplaceHoverPreview(hoverTile: Tile, sel: PlacementSelection): boolean {
  const canPlace = isEmptyFloor(hoverTile.shape) && (!sel.isGoldCell || sel.selectedIsGold);
  const canReplace = isReplaceableByShape(hoverTile, sel);
  return canPlace || canReplace;
}

/** Inventory item placement preview: the tile that would result from placing/replacing at the hovered cell. */
function _renderPlacementHoverPreview(ctx: CanvasRenderingContext2D, geom: HoverPreviewGeom, sel: PlacementSelection): void {
  if (!_canPlaceOrReplaceHoverPreview(geom.hoverTile, sel)) return;
  const previewTile = new Tile(sel.selectedShape, ((sel.pendingRotation % 360 + 360) % 360) as 0 | 90 | 180 | 270);
  _drawPreviewTile(ctx, geom, previewTile);
  _renderConnectionPreview(ctx, geom, previewTile);
}

function _canShowRotationHoverPreview(hoverTile: Tile): boolean {
  return !hoverTile.isFixed && !isEmptyFloor(hoverTile.shape) && !SPIN_PIPE_SHAPES.has(hoverTile.shape);
}

function _buildRotationPreviewTile(hoverTile: Tile, hoverRotationDelta: number): Tile {
  const previewRotation = ((hoverTile.rotation + hoverRotationDelta * 90) % 360) as 0 | 90 | 180 | 270;
  return new Tile(
    hoverTile.shape, previewRotation, false, hoverTile.capacity, hoverTile.cost,
    hoverTile.itemShape, hoverTile.itemCount, null, hoverTile.chamberContent,
    hoverTile.temperature, hoverTile.pressure, hoverTile.hardness, hoverTile.shatter,
  );
}

/** Rotation preview on an existing tile (no inventory item selected, Q/W or scroll). */
function _renderRotationHoverPreview(ctx: CanvasRenderingContext2D, geom: HoverPreviewGeom, hoverRotationDelta: number): void {
  if (!_canShowRotationHoverPreview(geom.hoverTile)) return;
  const previewTile = _buildRotationPreviewTile(geom.hoverTile, hoverRotationDelta);
  _drawPreviewTile(ctx, geom, previewTile);
  _renderConnectionPreview(ctx, geom, previewTile);
}

function _renderHoverPreview(ctx: CanvasRenderingContext2D, opts: RenderHoverPreviewOptions): void {
  const {
    board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos,
    hoverRotationDelta, currentWater, filledPositions, now,
  } = opts;
  if (!mouseCanvasPos) return;
  const hoverPos = _computeHoverGridPosInBounds(mouseCanvasPos, board);
  if (!hoverPos) return;
  const { row: hoverRow, col: hoverCol } = hoverPos;

  const hoverTile = board.grid[hoverRow][hoverCol];
  const isGoldCell = board.goldSpaces.has(posKey(hoverRow, hoverCol));
  const geom: HoverPreviewGeom = {
    board, hoverRow, hoverCol, hoverTile,
    px: hoverCol * TILE_SIZE, py: hoverRow * TILE_SIZE,
    currentWater, filledPositions, now,
  };

  if (selectedShape !== null) {
    _renderPlacementHoverPreview(ctx, geom, { selectedShape, pendingRotation, selectedIsGold, isGoldCell });
  } else if (hoverRotationDelta > 0) {
    _renderRotationHoverPreview(ctx, geom, hoverRotationDelta);
  }
}
