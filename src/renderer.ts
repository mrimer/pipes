/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, PIPE_SHAPES, SPIN_PIPE_SHAPES, posKey, NEIGHBOUR_DELTA, isEmptyFloor } from './board';
import { Tile, oppositeDirection } from './tile';
import { GridPos, PipeShape, Direction, COLD_CHAMBER_CONTENTS, LevelStyle } from './types';
import { PipeFillAnim, FILL_ANIM_DURATION } from './visuals/pipeEffects';
import { drawChamber, sandstoneColorState } from './renderer/chamberRenderers';
import { drawAmbientDecoration } from './renderer/ambientDecoration';
export { drawAmbientDecoration };
export { LINE_WIDTH, TILE_SIZE, _s, setTileSize, BASE_TILE_SIZE } from './renderer/rendererState';
import { LINE_WIDTH, TILE_SIZE, _s, BASE_TILE_SIZE } from './renderer/rendererState';
import {
  BG_COLOR, TILE_BG,
  EMPTY_COLOR, EMPTY_COLOR_LIGHT, EMPTY_COLOR_DARK,
  EMPTY_DIRT_COLOR, EMPTY_DIRT_COLOR_LIGHT, EMPTY_DIRT_COLOR_DARK,
  EMPTY_DARK_COLOR, EMPTY_DARK_COLOR_LIGHT, EMPTY_DARK_COLOR_DARK,
  EMPTY_WINTER_COLOR, EMPTY_WINTER_COLOR_LIGHT, EMPTY_WINTER_COLOR_DARK,
  GOLD_SPACE_BASE_COLOR, GOLD_SPACE_SHIMMER_COLOR, GOLD_SPACE_BORDER_COLOR,
  PIPE_COLOR, WATER_COLOR,
  SOURCE_COLOR, SOURCE_WATER_COLOR,
  SINK_COLOR, SINK_WATER_COLOR,
  TANK_COLOR, TANK_WATER_COLOR,
  FIXED_PIPE_COLOR, FIXED_PIPE_WATER_COLOR,
  DIRT_WATER_COLOR, DIRT_COLOR,
  CONTAINER_COLOR, CONTAINER_WATER_COLOR,
  CHAMBER_COLOR, CHAMBER_WATER_COLOR,
  GRANITE_COLOR, GRANITE_FILL_COLOR,
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR,
  TREE_DIRT_COLOR, TREE_DIRT_LEAF_COLOR, TREE_DIRT_LEAF_ALT_COLOR,
  TREE_DARK_COLOR, TREE_DARK_LEAF_COLOR, TREE_DARK_LEAF_ALT_COLOR,
  TREE_WINTER_COLOR, TREE_WINTER_LEAF_COLOR, TREE_WINTER_LEAF_ALT_COLOR,
  CEMENT_COLOR, CEMENT_FILL_COLOR,
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
  ONE_WAY_BG_COLOR, ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER,
  LEAKY_PIPE_COLOR, LEAKY_PIPE_WATER_COLOR, LEAKY_RUST_COLOR,
  SEA_COLOR, SEA_BORDER_COLOR,
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
 * Positions of the 3 landing-strip triangles along a Source/Sink connector arm,
 * as fractions of `half` (the half tile size).
 */
export const CONNECTOR_TRI_FRACS = [0.58, 0.72, 0.86] as const;
/** Depth (along-arm extent) of each landing-strip triangle, as a fraction of `half`. */
export const CONNECTOR_TRI_DEPTH = 0.10;
/** Half-width (perpendicular extent) of each landing-strip triangle, as a fraction of `half`. */
export const CONNECTOR_TRI_WING  = 0.09;

/** Number of distinct triangle positions (steps) in one landing-strip cycle. */
export const CONNECTOR_LIGHT_STEPS = CONNECTOR_TRI_FRACS.length;
/** Full landing-strip cycle duration in ms (CONNECTOR_LIGHT_STEPS steps × 300 ms each). */
export const CONNECTOR_LIGHT_CYCLE_MS = CONNECTOR_LIGHT_STEPS * 300;

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
export function computeTileSize(rows: number, cols: number, vOverhead = 0, hOverhead = 0, constrainVertical = true): number {
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

export { SHAPE_ABBREV, shapeIcon, getTileDisplayName } from './renderer/tileDisplayNames';

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
export function drawArmTriangles(ctx: CanvasRenderingContext2D, nx: number, ny: number, half: number, isSource: boolean): void {
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
export function drawConnectorGlow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  connections: Set<Direction>,
  isSource: boolean,
  brightColor: string,
  half: number,
  litIndex: number,
): void {
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
 * @param connections Set of outgoing arm directions for this tile.
 * @param color       Arm and decoration colour (dry or water).
 * @param half        Half the tile size in canvas pixels.
 * @param isSource    true for Source (outward triangles, gradient), false for Sink (bullseye).
 * @param buttEndDirs Optional set of arm directions that should use flat (butt) end caps.
 * @param centerLabel Optional label to draw at the centre. When omitted no label is drawn.
 * @param bgColor     Fill colour for the outer-circle background (defaults to TILE_BG).
 * @param afterOuterCircleFn  Optional callback invoked after the outer circle (fill +
 *                            outline) is drawn and before the connector arms are drawn.
 *                            Use this to render effects (e.g. vortex particles) that
 *                            should appear above the tile circle backdrop but below the
 *                            arms.  Only called for the Sink tile (when isSource=false).
 */
export function drawSourceOrSink(
  ctx: CanvasRenderingContext2D,
  connections: ReadonlySet<Direction>,
  color: string,
  half: number,
  isSource: boolean,
  buttEndDirs?: Set<Direction>,
  centerLabel?: { text: string; color: string },
  bgColor?: string,
  afterOuterCircleFn?: () => void,
): void {
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

  // Pass 1: all arm black outlines.
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
  // Black filled centre cap to cover the junction seam between arm outlines.
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(0, 0, (LINE_WIDTH + _s(3)) / 2, 0, Math.PI * 2);
  ctx.fill();

  // Pass 2: all arm coloured fills, then landing-strip triangles.
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
    drawArmTriangles(ctx, nx, ny, half, isSource);
  }
  // Coloured filled centre cap to fill the junction interior.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, LINE_WIDTH / 2, 0, Math.PI * 2);
  ctx.fill();

  if (isSource) {
    // Central circle with radial gradient – bright glow at centre fading to the tile colour
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
  } else {
    // Sink: bullseye / drain pattern – concentric stroke rings with a solid innermost dot.
    // Drawn after the arms so the rings remain visible on top of the arm fills.
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

  // Optional centre label – drawn last so it appears on top of all decorations.
  if (centerLabel !== undefined) {
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
 * Returns which of the 8 neighbors are granite tiles.  Out-of-bounds positions are
 * treated as non-granite.
 */
export function computeGraniteNeighbors(board: Board, row: number, col: number): GraniteNeighbors {
  const _isGranite = (r: number, c: number): boolean =>
    r >= 0 && r < board.rows && c >= 0 && c < board.cols &&
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
  if (floorType === PipeShape.EmptyDirt) return [EMPTY_DIRT_COLOR_LIGHT, EMPTY_DIRT_COLOR, EMPTY_DIRT_COLOR_DARK];
  if (floorType === PipeShape.EmptyDark) return [EMPTY_DARK_COLOR_LIGHT, EMPTY_DARK_COLOR, EMPTY_DARK_COLOR_DARK];
  if (floorType === PipeShape.EmptyWinter) return [EMPTY_WINTER_COLOR_LIGHT, EMPTY_WINTER_COLOR, EMPTY_WINTER_COLOR_DARK];
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
 * Draw a granite tile centered at the origin.
 *
 * When `neighbors` is provided the shape seams cleanly with adjacent granite
 * tiles: each edge that touches another granite tile is extended to the tile
 * boundary without a border, corner fills are added when all three surrounding
 * granite tiles are present, and an L-shaped inset border marks corners where
 * two edges are adjacent to granite but the diagonal is not.
 */
export function drawGranite(
  ctx: CanvasRenderingContext2D,
  half: number,
  neighbors?: GraniteNeighbors,
): void {
  const n = neighbors ?? { north: false, south: false, east: false, west: false, nw: false, ne: false, sw: false, se: false };
  const bw = half * 0.7;
  const bh = half * 0.7;

  ctx.fillStyle = GRANITE_FILL_COLOR;

  // ── Fill ─────────────────────────────────────────────────────────────────
  // Core inset rectangle (always drawn)
  ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
  // Edge extension strips toward adjacent granite tiles
  if (n.north) ctx.fillRect(-bw, -half, bw * 2, half - bh);
  if (n.south) ctx.fillRect(-bw, bh,   bw * 2, half - bh);
  if (n.west)  ctx.fillRect(-half, -bh, half - bw, bh * 2);
  if (n.east)  ctx.fillRect(bw,   -bh, half - bw, bh * 2);
  // Corner fills: only when both edge neighbors AND the diagonal are granite
  if (n.north && n.west && n.nw) ctx.fillRect(-half, -half, half - bw, half - bh);
  if (n.north && n.east && n.ne) ctx.fillRect(bw,   -half, half - bw, half - bh);
  if (n.south && n.west && n.sw) ctx.fillRect(-half, bh,   half - bw, half - bh);
  if (n.south && n.east && n.se) ctx.fillRect(bw,   bh,   half - bw, half - bh);

  // ── Border ───────────────────────────────────────────────────────────────
  // Draw border only on edges that are NOT adjacent to granite.
  // Each exposed edge is drawn as a line at the inset level (±bw / ±bh),
  // extended to the tile boundary when the perpendicular edges are adjacent to
  // granite so that the border visually closes the filled shape.
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(3);
  ctx.beginPath();

  // Top border (y = -bh): skip when north is granite
  if (!n.north) {
    ctx.moveTo(n.west ? -half : -bw, -bh);
    ctx.lineTo(n.east ? half  :  bw, -bh);
  }
  // Bottom border (y = +bh): skip when south is granite
  if (!n.south) {
    ctx.moveTo(n.west ? -half : -bw, bh);
    ctx.lineTo(n.east ? half  :  bw, bh);
  }
  // Left border (x = -bw): skip when west is granite
  if (!n.west) {
    ctx.moveTo(-bw, n.north ? -half : -bh);
    ctx.lineTo(-bw, n.south ? half  :  bh);
  }
  // Right border (x = +bw): skip when east is granite
  if (!n.east) {
    ctx.moveTo(bw, n.north ? -half : -bh);
    ctx.lineTo(bw, n.south ? half  :  bh);
  }

  // L-shaped inset borders at corners where two edges are granite but the
  // diagonal is not.  These trace the inner boundary of the unfilled corner
  // gap and connect cleanly to the adjacent tiles' inset border lines.
  if (n.north && n.west && !n.nw) { ctx.moveTo(-half, -bh); ctx.lineTo(-bw, -bh); ctx.lineTo(-bw, -half); }
  if (n.north && n.east && !n.ne) { ctx.moveTo(half,  -bh); ctx.lineTo(bw,  -bh); ctx.lineTo(bw,  -half); }
  if (n.south && n.west && !n.sw) { ctx.moveTo(-half,  bh); ctx.lineTo(-bw,  bh); ctx.lineTo(-bw,  half); }
  if (n.south && n.east && !n.se) { ctx.moveTo(half,   bh); ctx.lineTo(bw,   bh); ctx.lineTo(bw,   half); }

  ctx.stroke();

  // ── Stone texture ─────────────────────────────────────────────────────────
  // A few crack-like lines confined to the core inset rectangle.
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath(); ctx.moveTo(-bw + _s(4), -bh + _s(10)); ctx.lineTo(bw - _s(6), -bh + _s(16)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(2), _s(2));         ctx.lineTo(bw - _s(8), _s(8));        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(6), bh - _s(14));   ctx.lineTo(bw - _s(4), bh - _s(8));  ctx.stroke();
}

/** Draw a 2-D top-down tree (fern/palm style) centered at the origin. */
export function drawTree(ctx: CanvasRenderingContext2D, half: number, style?: LevelStyle): void {
  const treeColors: Record<string, [string, string, string]> = {
    Dirt:   [TREE_DIRT_LEAF_COLOR,    TREE_DIRT_LEAF_ALT_COLOR,    TREE_DIRT_COLOR],
    Dark:   [TREE_DARK_LEAF_COLOR,    TREE_DARK_LEAF_ALT_COLOR,    TREE_DARK_COLOR],
    Winter: [TREE_WINTER_LEAF_COLOR,  TREE_WINTER_LEAF_ALT_COLOR,  TREE_WINTER_COLOR],
  };
  const [leafColor, leafAltColor, outlineColor] = (style && treeColors[style]) ?? [TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_COLOR];
  const r = half * 0.75; // outer canopy radius – occupies most of the tile
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

/**
 * Draw a sea tile at the origin (caller must translate ctx to tile center).
 * The water color oscillates gently.  Land borders are drawn on edges where
 * the adjacent tile is in-bounds and not sea.  Outer corners connect adjacent
 * edge borders; corners at grid-boundary edges are suppressed.
 *
 * @param ctx       Canvas 2D context (translated so origin = tile center).
 * @param half      Half tile size in pixels.
 * @param neighbors Which adjacent cells are also sea tiles (or outside the grid).
 */
export function drawSea(
  ctx: CanvasRenderingContext2D,
  half: number,
  neighbors: SeaNeighbors,
): void {
  const now = Date.now();

  // ── Water fill with gentle color oscillation ────────────────────────────
  // Oscillate hue between a medium and slightly lighter blue
  const osc = Math.sin(now / 1200) * 0.5 + 0.5; // 0..1
  const r = Math.round(30 + osc * 18);   // 30..48
  const g = Math.round(110 + osc * 28);  // 110..138
  const b = Math.round(175 + osc * 22);  // 175..197
  const waterColor = `rgb(${r},${g},${b})`;
  ctx.fillStyle = waterColor;
  ctx.fillRect(-half, -half, half * 2, half * 2);

  // ── Land border on non-sea edges ────────────────────────────────────────
  const bw = _s(4);                           // border thickness
  ctx.fillStyle = SEA_BORDER_COLOR;

  // Edge borders
  if (!neighbors.north) ctx.fillRect(-half, -half, half * 2, bw);
  if (!neighbors.south) ctx.fillRect(-half, half - bw, half * 2, bw);
  if (!neighbors.west)  ctx.fillRect(-half, -half, bw, half * 2);
  if (!neighbors.east)  ctx.fillRect(half - bw, -half, bw, half * 2);

  // Outer corners: when two adjacent edges are both sea but their shared
  // diagonal is not, fill the bw×bw corner square that would otherwise be
  // left uncovered.
  if (neighbors.north && neighbors.west && !neighbors.nw) ctx.fillRect(-half, -half, bw, bw);
  if (neighbors.north && neighbors.east && !neighbors.ne) ctx.fillRect(half - bw, -half, bw, bw);
  if (neighbors.south && neighbors.west && !neighbors.sw) ctx.fillRect(-half, half - bw, bw, bw);
  if (neighbors.south && neighbors.east && !neighbors.se) ctx.fillRect(half - bw, half - bw, bw, bw);

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
 */
function _drawCementBackground(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const ts = TILE_SIZE;
  // Light-gray fill
  ctx.fillStyle = CEMENT_FILL_COLOR;
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
    if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) return null;
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
 * @param absDir      Absolute (world-space) direction of the arm.
 * @param tileRotation The tile's rotation in degrees (0 / 90 / 180 / 270).
 * @param half        Half the tile size in pixels.
 * @param color       Stroke color for this arm.
 */
function _drawPipeArmInRotatedFrame(
  ctx: CanvasRenderingContext2D,
  absDir: Direction,
  tileRotation: number,
  half: number,
  color: string,
): void {
  // Convert the absolute direction to the local coordinate-system direction by
  // rotating it CCW by (tileRotation / 90) steps.  The canvas coordinate frame
  // is rotated CW by tileRotation, so we invert to find the local axis.
  let localDir = absDir;
  const steps = tileRotation / 90;
  for (let i = 0; i < steps; i++) {
    switch (localDir) {
      case Direction.North: localDir = Direction.West;  break;
      case Direction.West:  localDir = Direction.South; break;
      case Direction.South: localDir = Direction.East;  break;
      case Direction.East:  localDir = Direction.North; break;
    }
  }

  let ex: number, ey: number;
  switch (localDir) {
    case Direction.North: ex =    0; ey = -half; break;
    case Direction.South: ex =    0; ey =  half; break;
    case Direction.East:  ex =  half; ey =    0; break;
    default:              ex = -half; ey =    0; break; // West
  }

  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ex, ey);
  ctx.stroke();
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
export function drawCementLabel(ctx: CanvasRenderingContext2D, x: number, y: number, dryingTime: number, isHardened: boolean): void {
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
function _buildCrossPath(
  ctx: CanvasRenderingContext2D,
  half: number,
  lw2: number,
  localButt?: ReadonlySet<Direction>,
): void {
  const buttN = localButt?.has(Direction.North) ?? false;
  const buttS = localButt?.has(Direction.South) ?? false;
  const buttE = localButt?.has(Direction.East)  ?? false;
  const buttW = localButt?.has(Direction.West)  ?? false;
  if (buttN) {
    ctx.moveTo(-lw2, -half);
    ctx.lineTo( lw2, -half);
  } else {
    ctx.arc(0, -half, lw2, Math.PI, 0, false);
  }
  ctx.lineTo( lw2, -lw2);   // NE inner corner
  ctx.lineTo(half, -lw2);   // top of E arm
  if (buttE) {
    ctx.lineTo(half,  lw2);
  } else {
    ctx.arc(half, 0, lw2, -Math.PI / 2, Math.PI / 2, false);
  }
  ctx.lineTo( lw2,  lw2);   // SE inner corner
  ctx.lineTo( lw2,  half);  // right of S arm
  if (buttS) {
    ctx.lineTo(-lw2,  half);
  } else {
    ctx.arc(0, half, lw2, 0, Math.PI, false);
  }
  ctx.lineTo(-lw2,  lw2);   // SW inner corner
  ctx.lineTo(-half,  lw2);  // bottom of W arm
  if (buttW) {
    ctx.lineTo(-half, -lw2);
  } else {
    // CW arc: bottom (-half,lw2) → left (-half-lw2,0) → top (-half,-lw2)
    ctx.arc(-half, 0, lw2, Math.PI / 2, -Math.PI / 2, false);
  }
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
 * @param lw2              Half the pipe tube width (= LINE_WIDTH / 2).
 * @param localButtEndDirs Directions in the LOCAL frame whose tile-edge end
 *                         should be flat (butt) rather than rounded.
 */
export function buildPipeBodyPath(
  ctx: CanvasRenderingContext2D,
  shape: PipeShape,
  half: number,
  lw2: number,
  localButtEndDirs?: ReadonlySet<Direction>,
): void {
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
export function drawPipeBody(
  ctx: CanvasRenderingContext2D,
  shape: PipeShape,
  half: number,
  localButtEndDirs: ReadonlySet<Direction> | undefined,
  fillColor: string,
): void {
  const lw2 = LINE_WIDTH / 2;
  // Clip to the tile boundary on each butt-end direction so the black stroke
  // outline never bleeds into adjacent tiles.  Non-butt (nub) directions are
  // left unconstrained so rounded caps can extend freely into empty space.
  const LARGE = half + LINE_WIDTH;
  const clipL = localButtEndDirs?.has(Direction.West)  ? -half : -LARGE;
  const clipR = localButtEndDirs?.has(Direction.East)  ?  half :  LARGE;
  const clipT = localButtEndDirs?.has(Direction.North) ? -half : -LARGE;
  const clipB = localButtEndDirs?.has(Direction.South) ?  half :  LARGE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipL, clipT, clipR - clipL, clipB - clipT);
  ctx.clip();
  // Build the pipe body path AFTER clipping so ctx.beginPath() for the clip
  // rect does not erase the pipe path before stroke/fill.
  buildPipeBodyPath(ctx, shape, half, lw2, localButtEndDirs);
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

    // Un-rotate the absolute direction back to local frame.
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

    // Two spots: one at 1/3 of the arm, one at 2/3.
    for (const frac of [0.33, 0.67]) {
      const sx = dx * half * frac;
      const sy = dy * half * frac;
      ctx.beginPath();
      ctx.arc(sx, sy, spotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Draw a single tile at canvas position (x, y). */
/**
 * Resolve the canvas stroke/fill color for a tile based on its shape, fill
 * state, and current board metrics.
 *
 * Separated from {@link drawTile} so that color logic can be read and tested
 * independently of the drawing commands.
 */
function _resolveTileColor(
  tile: Tile,
  isWater: boolean,
  currentPressure: number,
): string {
  const { shape, isFixed } = tile;
  if (shape === PipeShape.Source) {
    return isWater ? SOURCE_WATER_COLOR : SOURCE_COLOR;
  }
  if (shape === PipeShape.Sink) {
    return isWater ? SINK_WATER_COLOR : SINK_COLOR;
  }
  if (shape === PipeShape.Chamber) {
    const { chamberContent } = tile;
    if (chamberContent === 'tank') {
      return isWater ? TANK_WATER_COLOR : TANK_COLOR;
    }
    if (chamberContent === 'dirt') {
      return isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
    }
    if (chamberContent === 'item') {
      const isGoldItem = tile.itemShape !== null && GOLD_PIPE_SHAPES.has(tile.itemShape);
      return isGoldItem
        ? (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR)
        : (isWater ? WATER_COLOR : PIPE_COLOR);
    }
    if (chamberContent === 'heater') {
      return tile.temperature < 0
        ? (isWater ? COOLER_WATER_COLOR : COOLER_COLOR)
        : (isWater ? HEATER_WATER_COLOR : HEATER_COLOR);
    }
    if (chamberContent === 'ice') {
      return isWater ? ICE_WATER_COLOR : ICE_COLOR;
    }
    if (chamberContent === 'pump') {
      return tile.pressure < 0
        ? (isWater ? VACUUM_WATER_COLOR : VACUUM_COLOR)
        : (isWater ? PUMP_WATER_COLOR : PUMP_COLOR);
    }
    if (chamberContent === 'snow') {
      return isWater ? SNOW_WATER_COLOR : SNOW_COLOR;
    }
    if (chamberContent === 'sandstone') {
      const { isShatterTriggered, isHard } = sandstoneColorState(tile, currentPressure);
      return isShatterTriggered
        ? (isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR)
        : isHard
          ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
          : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    }
    if (chamberContent === 'hot_plate') {
      return isWater ? HOT_PLATE_WATER_COLOR : HOT_PLATE_COLOR;
    }
    return isWater ? CHAMBER_WATER_COLOR : CHAMBER_COLOR;
  }
  if (shape === PipeShape.Granite) return GRANITE_COLOR;
  if (shape === PipeShape.Tree) return TREE_COLOR;
  if (shape === PipeShape.Sea) return SEA_COLOR;
  if (GOLD_PIPE_SHAPES.has(shape)) return isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
  if (LEAKY_PIPE_SHAPES.has(shape)) return isWater ? LEAKY_PIPE_WATER_COLOR : LEAKY_PIPE_COLOR;
  if (SPIN_PIPE_SHAPES.has(shape)) return isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR;
  return isFixed
    ? (isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR)
    : isWater ? WATER_COLOR : PIPE_COLOR;
}

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
  lockedCost: number | null = null,
  lockedGain: number | null = null,
  isHovered = false,
  blockedWaterDir: Direction | null = null,
  rotationDegOverride?: number,
  buttEndDirs?: Set<Direction>,
  seaNeighbors?: SeaNeighbors,
  graniteNeighbors?: GraniteNeighbors,
  afterOuterCircleFn?: () => void,
  levelStyle?: LevelStyle,
): void {
  const { shape, rotation } = tile;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const half = Math.ceil(TILE_SIZE / 2);

  // When a rotation override is active, use it; blocked arms and butt-end dirs are
  // suppressed during rotation animation because the arm directions are mid-transition.
  const effectiveRotation = rotationDegOverride ?? rotation;
  const effectiveBlockedWaterDir = rotationDegOverride !== undefined ? null : blockedWaterDir;
  const effectiveButtEndDirs = rotationDegOverride !== undefined ? undefined : buttEndDirs;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((effectiveRotation * Math.PI) / 180);

  const color = _resolveTileColor(tile, isWater, currentPressure);

  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'round';

  // When a one-way tile's blocked exit direction applies and the tile has water,
  // draw each pipe arm individually so the blocked arm can be shown without water.
  const isPipeShape = PIPE_SHAPES.has(shape);
  const isBlockedPipe = effectiveBlockedWaterDir !== null && isWater && isPipeShape;

  if (isBlockedPipe) {
    // Arm-by-arm drawing for one-way blocked pipes: draw ALL black outlines
    // first, then ALL color fills.  This ordering prevents a later arm's black
    // outline from overwriting an already-painted arm's color at the junction.
    const dryColor = _resolveTileColor(tile, false, currentPressure);
    // Sort blocked arm first so the dominant (water) color is painted last.
    const sortedArms = [...tile.connections].sort(
      (a, b) => (a === effectiveBlockedWaterDir ? -1 : b === effectiveBlockedWaterDir ? 1 : 0),
    );
    // Step 1: all arm black outlines
    ctx.lineWidth = LINE_WIDTH + _s(3);
    ctx.strokeStyle = 'black';
    for (const armDir of tile.connections) {
      ctx.lineCap = effectiveButtEndDirs?.has(armDir) ? 'butt' : 'round';
      _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, 'black');
    }
    // Step 2: black center cap covers the junction seam between arm outlines
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(0, 0, (LINE_WIDTH + _s(3)) / 2, 0, Math.PI * 2);
    ctx.fill();
    // Step 3: all arm color fills (blocked arm first; dominant water color last)
    ctx.lineWidth = LINE_WIDTH;
    for (const armDir of sortedArms) {
      const armColor = armDir === effectiveBlockedWaterDir ? dryColor : color;
      ctx.lineCap = effectiveButtEndDirs?.has(armDir) ? 'butt' : 'round';
      _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, armColor);
    }
    // Step 4: pipe-color center cap fills the junction interior
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, LINE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    if (LEAKY_PIPE_SHAPES.has(shape)) {
      _drawLeakyRustSpots(ctx, tile, half, effectiveBlockedWaterDir);
    }
  } else if (isPipeShape) {
    // Unified shape path: draw the entire pipe body as a single filled shape
    // with a contiguous outer outline.  This eliminates the junction seam
    // artifacts that appear when arms are stroked individually.
    //
    // Use TILE_SIZE / 2 (exact tile boundary) rather than Math.ceil so the path
    // endpoints land precisely on the tile edge at every tile size.
    const pathHalf = TILE_SIZE / 2;
    const localButtEndDirs = effectiveButtEndDirs?.size
      ? new Set([...effectiveButtEndDirs].map(d => toLocalDir(d, effectiveRotation)))
      : undefined;
    drawPipeBody(ctx, shape, pathHalf, localButtEndDirs, color);
    if (LEAKY_PIPE_SHAPES.has(shape)) {
      _drawLeakyRustSpots(ctx, tile, half, null);
    }
  } else if (shape === PipeShape.Source || shape === PipeShape.Sink) {
    // Restore to un-rotated state so we can draw based on actual connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const isSource = shape === PipeShape.Source;
    drawSourceOrSink(ctx, tile.connections, color, half, isSource, effectiveButtEndDirs, isSource ? { text: String(currentWater), color: LABEL_COLOR } : undefined, undefined, afterOuterCircleFn);
  } else if (shape === PipeShape.Chamber) {
    // Chamber – a steel-blue enclosure whose interior display varies by content
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    // Use TILE_SIZE / 2 (exact tile boundary) rather than Math.ceil so the
    // clip and stub endpoints land precisely on the tile edge at every tile size,
    // consistent with the pipe-body path approach above.
    drawChamber(ctx, tile, color, isWater, TILE_SIZE / 2, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, effectiveButtEndDirs);
  } else if (shape === PipeShape.Granite) {
    // Granite – solid impassable stone block; no connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    drawGranite(ctx, half, graniteNeighbors);
  } else if (shape === PipeShape.Tree) {
    // Tree – impassable obstacle rendered as a top-down broad-leafed tree
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    drawTree(ctx, half, levelStyle);
  } else if (shape === PipeShape.Sea) {
    // Sea – impassable water tile with animated ripples and land border
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    const defaultNeighbors: SeaNeighbors = { north: false, east: false, south: false, west: false, nw: false, ne: false, sw: false, se: false };
    drawSea(ctx, half, seaNeighbors ?? defaultNeighbors);
  }

  ctx.restore();

  // Rotation arrow overlay for spinnable pipes.
  // When Shift is held the arrow reflects CCW to indicate the click direction.
  // When the mouse hovers over the tile the arrow rotates continuously in the
  // indicated direction so the player knows the pipe is interactive.
  if (SPIN_PIPE_SHAPES.has(shape)) {
    ctx.save();
    ctx.translate(cx, cy);
    if (isHovered) {
      const animAngle = (Date.now() * SPIN_ANIM_SPEED) % (2 * Math.PI);
      ctx.rotate(shiftHeld ? -animAngle : animAngle);
    }
    drawSpinArrow(ctx, shiftHeld);
    ctx.restore();
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
    !SPIN_PIPE_SHAPES.has(tile.shape) &&
    (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) &&
    (tile.shape !== selectedShape || tile.rotation !== pendingRotation) &&
    (!isGoldCell || selectedIsGold)
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
function _renderPass5FixedPipeBolts(ctx: CanvasRenderingContext2D, board: Board): void {
  const inset = _s(7.5);
  /** Returns true when the cell at (nr, nc) is a fixed pipe tile. */
  const _isFixedPipe = (nr: number, nc: number): boolean => {
    if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) return false;
    const t = board.grid[nr][nc];
    return t.isFixed && PIPE_SHAPES.has(t.shape);
  };
  ctx.save();
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      // Only draw bolts on fixed, non-spin pipe tiles (pre-placed and unmodifiable)
      if (!tile.isFixed || !PIPE_SHAPES.has(tile.shape)) continue;
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      // Skip a corner's bolt when either adjacent tile sharing that corner's two
      // edges is itself a fixed pipe tile.
      if (!_isFixedPipe(r - 1, c) && !_isFixedPipe(r, c - 1))
        _drawHexBoltHead(ctx, x + inset,             y + inset);
      if (!_isFixedPipe(r - 1, c) && !_isFixedPipe(r, c + 1))
        _drawHexBoltHead(ctx, x + TILE_SIZE - inset, y + inset);
      if (!_isFixedPipe(r + 1, c) && !_isFixedPipe(r, c - 1))
        _drawHexBoltHead(ctx, x + inset,             y + TILE_SIZE - inset);
      if (!_isFixedPipe(r + 1, c) && !_isFixedPipe(r, c + 1))
        _drawHexBoltHead(ctx, x + TILE_SIZE - inset, y + TILE_SIZE - inset);
    }
  }
  ctx.restore();
}

/** Render the full game board onto the canvas. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  mouseCanvasPos: { x: number; y: number } | null,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  highlightedPositions: Set<string> = new Set(),
  hoverRotationDelta = 0,
  rotationOverrides?: Map<string, number>,
  fillExclude?: Set<string>,
  winTileOverlayFn?: (ctx: CanvasRenderingContext2D) => void,
  sinkVortexFn?: () => void,
): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  // Tiles currently in a fill animation are rendered as dry so the fill overlay
  // can draw the partial water progress on top.
  const effectiveFilled = fillExclude && fillExclude.size > 0
    ? new Set([...filled].filter(k => !fillExclude.has(k)))
    : filled;
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(Date.now() / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  _renderPass1Backgrounds(ctx, board, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha, highlightedPositions);
  // Win tile glow overlay: rendered above backgrounds but beneath all tile content.
  winTileOverlayFn?.(ctx);
  _renderPass2NonPipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, sinkVortexFn);
  _renderPass3PipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, mouseCanvasPos, rotationOverrides);
  _renderPass4CementLabels(ctx, board);
  _renderPass5FixedPipeBolts(ctx, board);
  _renderHoverPreview(ctx, board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos, hoverRotationDelta, currentWater, effectiveFilled);
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
 * @param ctx          - 2D rendering context.
 * @param board        - The current game board.
 * @param anims        - The live fill animation array (already cleaned up by
 *                       {@link computeActiveFillKeys}).
 * @param currentWater - Current water count (passed to drawTile for Source labels).
 * @param shiftHeld    - Whether the Shift key is held (affects chamber cost display).
 * @param currentTemp  - Current effective temperature.
 * @param currentPressure - Current effective pressure.
 * @param now          - Current {@link performance.now()} timestamp.
 */
export function renderContainerFillAnims(
  ctx: CanvasRenderingContext2D,
  board: Board,
  anims: PipeFillAnim[],
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  now: number,
): void {
  for (const anim of anims) {
    if (!anim.isContainer) continue;
    const elapsed = now - anim.startTime;
    if (elapsed < 0) continue; // not started yet
    const progress = Math.min(1, elapsed / FILL_ANIM_DURATION);
    if (progress <= 0) continue;

    const { row, col, entryDir } = anim;
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    const tile = board.getTile({ row, col });
    if (!tile) continue;

    // Determine the clip rectangle that reveals connected state progressively,
    // starting from the full entry edge and sweeping to the opposite edge.
    let clipX = x, clipY = y, clipW = TILE_SIZE, clipH = TILE_SIZE;
    switch (entryDir) {
      case Direction.North: // entry at top → sweep downward
        clipH = progress * TILE_SIZE;
        break;
      case Direction.South: // entry at bottom → sweep upward
        clipY = y + (1 - progress) * TILE_SIZE;
        clipH = progress * TILE_SIZE;
        break;
      case Direction.East: // entry at right → sweep leftward
        clipX = x + (1 - progress) * TILE_SIZE;
        clipW = progress * TILE_SIZE;
        break;
      case Direction.West: // entry at left → sweep rightward
        clipW = progress * TILE_SIZE;
        break;
    }

    // Compute locked cost/gain for chambers so the revealing tile shows the
    // same values it will display once fully connected.
    let lockedCost: number | null = null;
    let lockedGain: number | null = null;
    if (tile.shape === PipeShape.Chamber) {
      if (tile.chamberContent !== null && COLD_CHAMBER_CONTENTS.has(tile.chamberContent)) {
        const impact = board.getLockedWaterImpact({ row, col });
        if (impact !== null) lockedCost = Math.abs(impact);
      } else if (tile.chamberContent === 'hot_plate') {
        const impact = board.getLockedWaterImpact({ row, col });
        const gain = board.getLockedHotPlateGain({ row, col });
        if (impact !== null && gain !== null) {
          const loss = Math.max(0, gain - impact);
          lockedGain = gain;
          lockedCost = loss;
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipY, clipW, clipH);
    ctx.clip();
    // Draw the tile in its connected (water) state within the clip region.
    drawTile(ctx, x, y, tile, true, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain);
    ctx.restore();
  }
}

/**
 * Pass 1: Draw all tile backgrounds first so that pipe tile content drawn in pass 2
 * is never covered by a neighboring empty tile's background fill.
 */
function _renderPass1Backgrounds(
  ctx: CanvasRenderingContext2D,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  selectedIsGold: boolean,
  shimmerAlpha: number,
  highlightedPositions: Set<string>,
): void {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isGoldCell = board.goldSpaces.has(posKey(r, c));
      const isCementCell = board.cementData.has(posKey(r, c));
      const oneWayDir = board.oneWayData.get(posKey(r, c));
      const isOneWayCell = oneWayDir !== undefined;

      // Tile background
      if (isOneWayCell) {
        // One-way cell: gingham background (inferred floor type) + directional arrow on top
        const floorType = board.floorTypes.get(posKey(r, c)) ?? PipeShape.Empty;
        const paritySum = (r % 2) + (c % 2);
        const [gc_light, gc_mid, gc_dark] = ginghamColorsForFloor(floorType);
        const ginghamColor = paritySum === 0 ? gc_light : paritySum === 2 ? gc_dark : gc_mid;
        ctx.fillStyle = ginghamColor;
        ctx.fillRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        drawOneWayArrow(ctx, x, y, oneWayDir!);
      } else if (isCementCell) {
        // Cement cell: always show cement background regardless of tile on top
        _drawCementBackground(ctx, x, y);
      } else if (isEmptyFloor(tile.shape)) {
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
        } else {
          const paritySum = (r % 2) + (c % 2);
          const [gc_light, gc_mid, gc_dark] = ginghamColorsForFloor(tile.shape);
          const ginghamColor = paritySum === 0 ? gc_light : paritySum === 2 ? gc_dark : gc_mid;
          ctx.fillStyle = ginghamColor;
          ctx.fillRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          // Draw any ambient decoration on this empty non-gold cell
          const dec = board.ambientDecorations.get(posKey(r, c));
          if (dec) drawAmbientDecoration(ctx, dec);
        }
      } else {
        // Non-empty tile: player-placed (removable) pipes get a distinct background
        if (isGoldCell) {
          // Non-empty tile on a gold space: keep the darker gold background so the space is visible
          ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else {
          const isRemovable = !tile.isFixed &&
            (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape));
          ctx.fillStyle = isRemovable ? REMOVABLE_BG_COLOR : TILE_BG;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }

      // Sandstone error highlight (pulsing red overlay)
      if (highlightedPositions.has(posKey(r, c))) {
        const pulse = 0.35 + 0.25 * ((Math.sin(Date.now() / 120) + 1) / 2);
        ctx.fillStyle = `rgba(220,50,50,${pulse.toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.strokeStyle = ERROR_HIGHLIGHT_BORDER;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }
    }
  }
}

/**
 * Pass 2: Draw all non-pipe tile content on top of all backgrounds.
 */
function _renderPass2NonPipeTiles(
  ctx: CanvasRenderingContext2D,
  board: Board,
  filled: Set<string>,
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  sinkVortexFn?: () => void,
): void {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (PIPE_SHAPES.has(tile.shape)) continue;
      const isCementCell = board.cementData.has(posKey(r, c));

      // Skip drawing the empty-tile dot on cement or one-way cells – their
      // background texture/arrow is already clearly visible.
      if (isEmptyFloor(tile.shape) && (isCementCell || board.oneWayData.has(posKey(r, c)))) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater = filled.has(posKey(r, c));

      // For connected ice/snow/sandstone tiles, pass the locked effective cost so
      // the tile can display the single locked-in value instead of the live formula.
      // For connected hot_plate tiles, pass both the locked gain (from frozen) and locked loss.
      let lockedCost: number | null = null;
      let lockedGain: number | null = null;
      if (isWater && tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent !== null && COLD_CHAMBER_CONTENTS.has(tile.chamberContent)) {
          const impact = board.getLockedWaterImpact({ row: r, col: c });
          if (impact !== null) {
            lockedCost = Math.abs(impact);
          }
        } else if (tile.chamberContent === 'hot_plate') {
          const impact = board.getLockedWaterImpact({ row: r, col: c });
          const gain = board.getLockedHotPlateGain({ row: r, col: c });
          if (impact !== null && gain !== null) {
            const loss = Math.max(0, gain - impact);
            lockedGain = gain;
            lockedCost = loss;
          }
        }
      }

      // For Source/Sink/Chamber tiles, compute which arm directions need a butt end cap.
      // For Chamber tiles the result is always a defined Set (possibly empty) so that
      // arms pointing at empty tiles trigger Phase 2 in _drawChamber and get round end
      // caps sticking into the adjacent tile.  An undefined result would fall through to
      // the legacy "all butt caps" path and suppress the round nubs entirely.
      let buttEndDirs: Set<Direction> | undefined;
      if (tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink) {
        buttEndDirs = _computeButtEndDirs(board, r, c);
      } else if (tile.shape === PipeShape.Chamber) {
        buttEndDirs = _computeButtEndDirs(board, r, c) ?? new Set<Direction>();
      }

      // For Sea tiles, compute which neighbors are also sea for border rendering.
      let seaNeighbors: SeaNeighbors | undefined;
      if (tile.shape === PipeShape.Sea) {
        seaNeighbors = computeSeaNeighbors((dr, dc) => {
          const nr = r + dr, nc = c + dc;
          return nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols || board.grid[nr][nc].shape === PipeShape.Sea;
        });
      }

      // For Granite tiles, compute which neighbors are also granite for seaming.
      let graniteNeighbors: GraniteNeighbors | undefined;
      if (tile.shape === PipeShape.Granite) {
        graniteNeighbors = computeGraniteNeighbors(board, r, c);
      }

      // Gingham overlay on non-empty, non-pipe tiles: 100% alpha (i.e. opacity)
      // pattern drawn over the tile background color.
      if (tile.shape === PipeShape.Granite || tile.shape === PipeShape.Tree || tile.shape === PipeShape.Chamber
          || tile.shape === PipeShape.Source || tile.shape === PipeShape.Sink) {
        const floorType = board.floorTypes.get(posKey(r, c)) ?? PipeShape.Empty;
        drawGinghamOverlay(ctx, x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2, r, c, floorType, 1.0); //alpha
      }

      // For the sink tile, build an overlay callback that renders the vortex effect
      // after the outer circle but before the connector arms.  The callback must
      // temporarily undo the translation that drawTile/drawSourceOrSink applies to
      // the context so that renderVortex can use absolute canvas coordinates.
      let afterOuterCircleFn: (() => void) | undefined;
      if (tile.shape === PipeShape.Sink && sinkVortexFn !== undefined) {
        const tileCx = x + TILE_SIZE / 2;
        const tileCy = y + TILE_SIZE / 2;
        afterOuterCircleFn = () => {
          ctx.save();
          ctx.translate(-tileCx, -tileCy);
          sinkVortexFn();
          ctx.restore();
        };
      }

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs, seaNeighbors, graniteNeighbors, afterOuterCircleFn, board.style);
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
function _renderPass3PipeTiles(
  ctx: CanvasRenderingContext2D,
  board: Board,
  filled: Set<string>,
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  mouseCanvasPos: { x: number; y: number } | null,
  rotationOverrides?: Map<string, number>,
): void {
  const hoverRow = mouseCanvasPos ? Math.floor(mouseCanvasPos.y / TILE_SIZE) : -1;
  const hoverCol = mouseCanvasPos ? Math.floor(mouseCanvasPos.x / TILE_SIZE) : -1;

  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (!PIPE_SHAPES.has(tile.shape)) continue;

      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;
      const isWater = filled.has(posKey(r, c));
      const isHovered = r === hoverRow && c === hoverCol && SPIN_PIPE_SHAPES.has(tile.shape);

      // If this pipe sits on a one-way cell, the arm pointing opposite the arrow
      // direction is blocked (dry) unless the neighbor in that direction is both
      // mutually connected AND actually water-filled.  A pipe tile placed adjacent
      // but not carrying water must not make the blocked arm appear wet.
      const owDir = board.oneWayData.get(posKey(r, c));
      let blockedWaterDir: Direction | null = null;
      if (owDir !== undefined) {
        const antiDir = oppositeDirection(owDir);
        const delta = NEIGHBOUR_DELTA[antiDir];
        const neighborPos: GridPos = { row: r + delta.row, col: c + delta.col };
        // The arm carries water only when the neighbor can mutually connect AND
        // is actually water-filled (present in the filled set).
        if (
          !board.areMutuallyConnected(neighborPos, owDir) ||
          !filled.has(posKey(neighborPos.row, neighborPos.col))
        ) {
          blockedWaterDir = antiDir;
        }
      }

      // Apply any active rotation animation override for this tile.
      const rotOverride = rotationOverrides?.get(posKey(r, c));

      // Determine which arm directions need a flat (butt) end cap.
      const buttEndDirs = _computeButtEndDirs(board, r, c);

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, null, null, isHovered, blockedWaterDir, rotOverride, buttEndDirs);
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
      drawCementLabel(ctx, x, y, dryingTime, isHardened);
    }
  }
}

/**
 * Draw a semi-transparent placement/rotation preview overlay at (px, py).
 * Applies a slowly-pulsing alpha and a yellow glow so the preview is visually
 * distinct from a live tile without obscuring what is beneath it.
 */
function _drawPreviewTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  previewTile: Tile,
  currentWater: number,
): void {
  const PULSE_PERIOD_MS = 1200;
  const t = (Date.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  const alpha = 0.35 + 0.2 * ((Math.sin(t * Math.PI * 2) + 1) / 2);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = PREVIEW_SHADOW_COLOR;
  ctx.shadowBlur = PREVIEW_SHADOW_BLUR;
  drawTile(ctx, px, py, previewTile, false, currentWater);
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
function _renderConnectionPreview(
  ctx: CanvasRenderingContext2D,
  board: Board,
  hoverRow: number,
  hoverCol: number,
  previewTile: Tile,
  filledPositions: Set<string>,
): void {
  const PULSE_PERIOD_MS = 1200;
  const t = (Date.now() % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  const alpha = 0.35 + 0.2 * ((Math.sin(t * Math.PI * 2) + 1) / 2);

  const px = hoverCol * TILE_SIZE;
  const py = hoverRow * TILE_SIZE;
  const currentTile = board.grid[hoverRow][hoverCol];
  const hoverKey = posKey(hoverRow, hoverCol);
  const hoverOwDir = board.oneWayData.get(hoverKey);

  for (const [dir] of CARDINAL_DIRS) {
    const delta = NEIGHBOUR_DELTA[dir];
    const nr = hoverRow + delta.row;
    const nc = hoverCol + delta.col;
    if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;

    const neighbor = board.grid[nr][nc];
    if (neighbor.shape === PipeShape.Empty) continue;

    const oppDir = oppositeDirection(dir);
    const neighborKey = posKey(nr, nc);
    const neighborOwDir = board.oneWayData.get(neighborKey);

    // One-way check for the preview→neighbor direction:
    // The preview tile carries no one-way property, but the neighbor may block entry.
    // In areMutuallyConnected the "to" (neighbor) one-way blocks when dir === opposite(toOwDir).
    const previewBlockedByNeighbor = neighborOwDir !== undefined && dir === oppositeDirection(neighborOwDir);
    const wouldConnect =
      previewTile.connections.has(dir) &&
      neighbor.connections.has(oppDir) &&
      !previewBlockedByNeighbor;

    // One-way checks for the current tile in the hovered cell (for disconnection detection).
    const currentBlockedByHover = hoverOwDir !== undefined && dir === oppositeDirection(hoverOwDir);
    const currentBlockedByNeighbor = neighborOwDir !== undefined && dir === oppositeDirection(neighborOwDir);
    const currentlyConnected =
      currentTile.connections.has(dir) &&
      neighbor.connections.has(oppDir) &&
      !currentBlockedByHover &&
      !currentBlockedByNeighbor;

    const wouldDisconnect = currentlyConnected && !wouldConnect;
    if (!wouldConnect && !wouldDisconnect) continue;

    const isNeighborFilled = filledPositions.has(neighborKey);
    const color = wouldDisconnect
      ? DISCONNECTION_PREVIEW_COLOR
      : isNeighborFilled
        ? CONNECTION_PREVIEW_WATER_COLOR
        : CONNECTION_PREVIEW_COLOR;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
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
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw semi-transparent hover previews: the pending inventory item placement
 * preview and the rotation preview for an existing tile.
 */
function _renderHoverPreview(
  ctx: CanvasRenderingContext2D,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  selectedIsGold: boolean,
  mouseCanvasPos: { x: number; y: number } | null,
  hoverRotationDelta: number,
  currentWater: number,
  filledPositions: Set<string>,
): void {
  if (!mouseCanvasPos) return;
  const hoverCol = Math.floor(mouseCanvasPos.x / TILE_SIZE);
  const hoverRow = Math.floor(mouseCanvasPos.y / TILE_SIZE);
  if (hoverRow < 0 || hoverRow >= board.rows || hoverCol < 0 || hoverCol >= board.cols) return;

  const hoverTile = board.grid[hoverRow][hoverCol];
  const isGoldCell = board.goldSpaces.has(posKey(hoverRow, hoverCol));
  const px = hoverCol * TILE_SIZE;
  const py = hoverRow * TILE_SIZE;

  if (selectedShape !== null) {
    // Inventory item placement preview
    const canPlace = isEmptyFloor(hoverTile.shape) && (!isGoldCell || selectedIsGold);
    const canReplace = isReplaceableByShape(hoverTile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);
    if (canPlace || canReplace) {
      const previewTile = new Tile(selectedShape, ((pendingRotation % 360 + 360) % 360) as 0 | 90 | 180 | 270);
      _drawPreviewTile(ctx, px, py, previewTile, currentWater);
      _renderConnectionPreview(ctx, board, hoverRow, hoverCol, previewTile, filledPositions);
    }
  } else if (hoverRotationDelta > 0) {
    // Rotation preview on an existing tile (no inventory item selected, Q/W or scroll)
    if (!hoverTile.isFixed && !isEmptyFloor(hoverTile.shape) && !SPIN_PIPE_SHAPES.has(hoverTile.shape)) {
      const previewRotation = ((hoverTile.rotation + hoverRotationDelta * 90) % 360) as 0 | 90 | 180 | 270;
      const previewTile = new Tile(
        hoverTile.shape, previewRotation, false, hoverTile.capacity, hoverTile.cost,
        hoverTile.itemShape, hoverTile.itemCount, null, hoverTile.chamberContent,
        hoverTile.temperature, hoverTile.pressure, hoverTile.hardness, hoverTile.shatter,
      );
      _drawPreviewTile(ctx, px, py, previewTile, currentWater);
      _renderConnectionPreview(ctx, board, hoverRow, hoverCol, previewTile, filledPositions);
    }
  }
}
