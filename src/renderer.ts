/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, PIPE_SHAPES, SPIN_PIPE_SHAPES, posKey, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors, NEIGHBOUR_DELTA } from './board';
import { Tile, oppositeDirection } from './tile';
import { AmbientDecoration, GridPos, PipeShape, Direction, COLD_CHAMBER_CONTENTS } from './types';
import { PipeFillAnim, FILL_ANIM_DURATION } from './visuals/pipeEffects';
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
  TREE_COLOR, TREE_LEAF_COLOR, TREE_LEAF_ALT_COLOR, TREE_TRUNK_COLOR,
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
  STAR_COLOR, STAR_WATER_COLOR,
  HOT_PLATE_COLOR, HOT_PLATE_WATER_COLOR,
  ANIM_POSITIVE_COLOR, ANIM_NEGATIVE_COLOR,
  ONE_WAY_BG_COLOR, ONE_WAY_ARROW_COLOR, ONE_WAY_ARROW_BORDER,
  LEAKY_PIPE_COLOR, LEAKY_PIPE_WATER_COLOR, LEAKY_RUST_COLOR,
} from './colors';

export let LINE_WIDTH = 10; // pipe stroke width in px

/** The current tile size in pixels.  64 (default) or 128 (large) depending on the viewport. */
export let TILE_SIZE = 64; // px

/** Base tile size used as the reference for all pixel-value scaling. */
const BASE_TILE_SIZE = 64;

/** Translucent blue-gray overlay drawn over empty cement cells that are valid placement targets. */
const CEMENT_TARGET_OVERLAY = 'rgba(140,160,200,0.22)';

/** Translucent gold overlay drawn over empty gold-space cells that are valid placement targets. */
const GOLD_TARGET_OVERLAY = 'rgba(255,215,0,0.2)';

/** Translucent red overlay drawn over empty one-way cells that are valid placement targets. */
const ONE_WAY_TARGET_OVERLAY = 'rgba(220,60,60,0.22)';

/** Border color used for error-highlighted sandstone tiles. */
const ERROR_HIGHLIGHT_BORDER = '#ff2020';

/** Fill color for the hover-preview tile glow shadow. */
const PREVIEW_SHADOW_COLOR = '#ffff00';

/** Blur radius (px) for the hover-preview tile glow shadow. */
const PREVIEW_SHADOW_BLUR = 14;

/** Rotation speed for the spin-arrow hover animation, in radians per millisecond (one full turn per 1.5 s). */
const SPIN_ANIM_SPEED = (2 * Math.PI) / 1500;

/**
 * Scale a pixel value that was designed for BASE_TILE_SIZE to the current TILE_SIZE.
 * Use for font sizes, small offsets and decoration dimensions.
 */
function _s(n: number): number {
  return Math.round(n * TILE_SIZE / BASE_TILE_SIZE);
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
 * @param vOverhead  Vertical pixels already consumed by UI elements outside
 *                   the grid (e.g. title, header buttons, panels below the
 *                   grid).  Subtracted from the available height before the
 *                   tile size is computed so that those elements can all fit
 *                   on screen at once.
 */
export function computeTileSize(rows: number, cols: number, vOverhead = 0): number {
  if (typeof window === 'undefined') return BASE_TILE_SIZE;
  const avW = window.innerWidth;
  const avH = window.innerHeight - vOverhead;
  const maxFit = Math.floor(Math.min(avW / cols, avH / rows));
  return Math.max(BASE_TILE_SIZE, Math.min(128, maxFit));
}

/**
 * Update the active tile size and derived constants.
 * Call this before setting canvas dimensions when loading a level.
 */
export function setTileSize(size: number): void {
  TILE_SIZE = size;
  LINE_WIDTH = Math.round(10 * size / BASE_TILE_SIZE);
}

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
  [PipeShape.LeakyStraight]: 'St',
  [PipeShape.LeakyElbow]:    'El',
  [PipeShape.LeakyTee]:      'Te',
  [PipeShape.LeakyCross]:    'Cr',
};

/** Return an inline SVG icon for the given pipe shape. */
export function shapeIcon(shape: PipeShape, color = '#4a90d9'): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // Normalize gold, spin, and leaky variants to their base shape for icon rendering
  const SHAPE_ICON_BASE: Partial<Record<PipeShape, PipeShape>> = {
    [PipeShape.GoldStraight]:  PipeShape.Straight,
    [PipeShape.GoldElbow]:     PipeShape.Elbow,
    [PipeShape.GoldTee]:       PipeShape.Tee,
    [PipeShape.GoldCross]:     PipeShape.Cross,
    [PipeShape.SpinStraight]:  PipeShape.Straight,
    [PipeShape.SpinElbow]:     PipeShape.Elbow,
    [PipeShape.SpinTee]:       PipeShape.Tee,
    [PipeShape.SpinStraightCement]: PipeShape.Straight,
    [PipeShape.SpinElbowCement]:    PipeShape.Elbow,
    [PipeShape.SpinTeeCement]:      PipeShape.Tee,
    [PipeShape.LeakyStraight]: PipeShape.Straight,
    [PipeShape.LeakyElbow]:    PipeShape.Elbow,
    [PipeShape.LeakyTee]:      PipeShape.Tee,
    [PipeShape.LeakyCross]:    PipeShape.Cross,
  };
  const drawShape = SHAPE_ICON_BASE[shape] ?? shape;
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

function _drawSourceOrSink(ctx: CanvasRenderingContext2D, tile: Tile, color: string, half: number, currentWater: number, shape: PipeShape): void {
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
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(currentWater), 0, 0);
  }
}

function _drawGranite(ctx: CanvasRenderingContext2D, half: number): void {
  const bw = half * 0.7;
  const bh = half * 0.7;
  ctx.fillStyle = GRANITE_FILL_COLOR;
  ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(3);
  ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
  // Stone texture – a few crack-like lines
  ctx.strokeStyle = GRANITE_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.beginPath(); ctx.moveTo(-bw + _s(4), -bh + _s(10)); ctx.lineTo(bw - _s(6), -bh + _s(16)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(2), _s(2));         ctx.lineTo(bw - _s(8), _s(8));        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(6), bh - _s(14));   ctx.lineTo(bw - _s(4), bh - _s(8));  ctx.stroke();
}

/** Draw a 2-D top-down tree (fern/palm style) centered at the origin. */
function _drawTree(ctx: CanvasRenderingContext2D, half: number): void {
  const r = half * 0.75; // outer canopy radius – occupies most of the tile
  // Main canopy – large dark-green filled circle
  ctx.fillStyle = TREE_LEAF_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Leaf clusters – four overlapping lighter-green lobes around the edge
  const lobeR = r * 0.48;
  const lobeOff = r * 0.52;
  ctx.fillStyle = TREE_LEAF_ALT_COLOR;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * lobeOff, Math.sin(angle) * lobeOff, lobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Diagonal leaf clusters (45°) – smaller, medium green
  const dLobeR = lobeR * 0.72;
  const dLobeOff = lobeOff * 0.88;
  ctx.fillStyle = TREE_LEAF_COLOR;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dLobeOff, Math.sin(angle) * dLobeOff, dLobeR, 0, Math.PI * 2);
    ctx.fill();
  }
  // Small brown trunk circle in the center
  ctx.fillStyle = TREE_TRUNK_COLOR;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // Dark green outline around the whole canopy
  ctx.strokeStyle = TREE_COLOR;
  ctx.lineWidth = _s(2);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
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
 * Draw the one-way floor tile background: a dark-red cell with a large red
 * directional arrow/chevron pointing in `dir`.
 * The tile edge at pixel (x, y) is used as the top-left origin.
 */
function _drawOneWayBackground(ctx: CanvasRenderingContext2D, x: number, y: number, dir: Direction): void {
  const half = TILE_SIZE / 2;
  const cx = x + half;
  const cy = y + half;

  // Dark-red background
  ctx.fillStyle = ONE_WAY_BG_COLOR;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

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
function _drawCementLabel(ctx: CanvasRenderingContext2D, x: number, y: number, dryingTime: number, isHardened: boolean): void {
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

/**
 * Draw the three-line "ΔTemp° × cost" formula label used by ice, snow, and
 * hot-plate chamber tiles when they are unconnected.
 *
 * The canvas context must already have `textAlign = 'center'` and
 * `textBaseline = 'middle'` set; `fillStyle` must be the desired text color.
 * The three lines are drawn centered on `(0, 0)` in the current coordinate system.
 *
 * @param tempLine - First line text, e.g. `'-3°'` or `'5°'`.
 * @param costLine - Third line text, e.g. `'4'` (the cost/mass value).
 */
function _drawDeltaTempCostFormula(ctx: CanvasRenderingContext2D, tempLine: string, costLine: string): void {
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.fillText(tempLine, 0, -_s(9));
  ctx.font = `bold ${_s(9)}px Arial`;
  ctx.fillText('x', 0, 0);
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.fillText(costLine, 0, _s(11));
}

function _drawChamberTankContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Draw water line with wave ripples near top of the box
  const tankDecorColor = isWater ? TANK_WATER_COLOR : TANK_COLOR;
  ctx.strokeStyle = tankDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const wy = -bh + _s(7);
  const wLeft = -bw + _s(4);
  const wRight = bw - _s(4);
  const waveWidth = wRight - wLeft;
  if (isWater) {
    // Animated scrolling wave when connected: scrolls horizontally and wraps around,
    // giving the impression of water moving smoothly inside the tank.
    const WAVE_PERIOD_MS = 2000; // one full scroll cycle in milliseconds
    const offset = (Date.now() % WAVE_PERIOD_MS) / WAVE_PERIOD_MS * waveWidth;
    ctx.save();
    // Clip to the wave strip so the wrapping seam is hidden
    ctx.beginPath();
    ctx.rect(wLeft, wy - _s(5), waveWidth, _s(10));
    ctx.clip();
    // Draw enough wave periods starting at (wLeft - offset) so the visible
    // strip [wLeft, wRight] is always fully covered regardless of scroll position.
    // Two shifted copies suffice; one extra is included as a safety margin.
    const WAVE_COPIES = 3;
    const startX = wLeft - offset;
    ctx.beginPath();
    for (let i = 0; i < WAVE_COPIES; i++) {
      const x0 = startX + i * waveWidth;
      const xMid = x0 + waveWidth / 2;
      const xEnd = x0 + waveWidth;
      const wQuart = waveWidth / 4;
      if (i === 0) ctx.moveTo(x0, wy);
      ctx.quadraticCurveTo(x0 + wQuart, wy - _s(3), xMid, wy);
      ctx.quadraticCurveTo(xMid + wQuart, wy + _s(3), xEnd, wy);
    }
    ctx.stroke();
    ctx.restore();
  } else {
    // Static wave when not connected
    const wMid = 0;
    const wQuart = waveWidth / 4;
    ctx.beginPath();
    ctx.moveTo(wLeft, wy);
    ctx.quadraticCurveTo(wLeft + wQuart, wy - _s(3), wMid, wy);
    ctx.quadraticCurveTo(wMid + wQuart, wy + _s(3), wRight, wy);
    ctx.stroke();
  }
  // Show capacity number in tank-like color
  ctx.fillStyle = tankDecorColor;
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(tile.capacity), 0, 0);
}

function _drawChamberDirtContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Draw short diagonal dirt lines near top-right and bottom-left corners
  const dirtDecorColor = isWater ? DIRT_WATER_COLOR : DIRT_COST_COLOR;
  ctx.strokeStyle = dirtDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bw - _s(9), -bh + _s(3)); ctx.lineTo(bw - _s(3), -bh + _s(9)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bw - _s(13), -bh + _s(3)); ctx.lineTo(bw - _s(3), -bh + _s(13)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), bh - _s(9)); ctx.lineTo(-bw + _s(9), bh - _s(3)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), bh - _s(13)); ctx.lineTo(-bw + _s(13), bh - _s(3)); ctx.stroke();
  // Show negative cost label in dirt-like color
  ctx.fillStyle = dirtDecorColor;
  ctx.font = `bold ${_s(14)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`-${tile.cost}`, 0, 0);
}

function _drawChamberItemContent(ctx: CanvasRenderingContext2D, itemShape: PipeShape | null, itemCount: number, bw: number, bh: number, isWater: boolean, half: number): void {
  // Draw a mini version of the item pipe shape scaled to fit snugly inside the chamber box
  const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
  const itemColor = isGoldItem
    ? (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR)
    : (isWater ? WATER_COLOR : PIPE_COLOR);
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
    // Scale item to 75% of box size so it doesn't touch the chamber box edge
    const scale = (bw * 0.75) / half;
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
  // Draw quantity number in the inner top-left corner, white with a 1px black outline
  if (itemCount > 1) {
    const countLabel = String(itemCount);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${_s(20)}px Arial`;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = _s(1);
    ctx.strokeText(countLabel, -bw + _s(3), -bh + _s(2));
    ctx.fillStyle = 'white';
    ctx.fillText(countLabel, -bw + _s(3), -bh + _s(2));
  }
}

function _drawChamberHeaterContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Show temperature bonus (no plus sign for negative values)
  const isCooler = tile.temperature < 0;
  const heaterBaseColor = isCooler
    ? (isWater ? COOLER_WATER_COLOR : COOLER_COLOR)
    : (isWater ? HEATER_WATER_COLOR : HEATER_COLOR);
  // Draw decorative lines near the top of the box
  ctx.strokeStyle = heaterBaseColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const lineLeft = -bw + _s(4);
  const lineRight = bw - _s(4);
  const lineSpan = lineRight - lineLeft;
  const numLines = 3;
  const lineSpacing = _s(3.5);
  const topY = -bh + _s(4);
  if (isCooler) {
    if (isWater) {
      // Animated: wind lines scroll downward, shrinking in width as they descend.
      // A new line at full width appears at the top each time one exits the bottom.
      const COOLER_SCROLL_MS = 2000;
      const widthDelta = _s(5);
      const offset = (Date.now() % COOLER_SCROLL_MS) / COOLER_SCROLL_MS * lineSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lineLeft, topY - _s(1), lineSpan, (numLines - 1) * lineSpacing + _s(2));
      ctx.clip();
      // Draw numLines+1 lines: k=0 enters from above, k=numLines exits below.
      for (let k = 0; k <= numLines; k++) {
        const lineY = topY + (k - 1) * lineSpacing + offset;
        const slotFrac = (lineY - topY) / lineSpacing;
        const hw = (lineSpan - slotFrac * widthDelta) / 2;
        if (hw <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(-hw, lineY);
        ctx.lineTo(hw, lineY);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static: thin horizontal wind lines near top
      for (let i = 0; i < numLines; i++) {
        const lineY = topY + i * lineSpacing;
        const hw = (lineSpan - i * _s(5)) / 2;
        ctx.beginPath();
        ctx.moveTo(-hw, lineY);
        ctx.lineTo(hw, lineY);
        ctx.stroke();
      }
    }
  } else {
    const xMid = 0;
    const xQuart = lineSpan / 4;
    if (isWater) {
      // Animated: wavy heat lines scroll upwards and wrap vertically within the region.
      const HEATER_SCROLL_MS = 1500;
      const offset = (Date.now() % HEATER_SCROLL_MS) / HEATER_SCROLL_MS * lineSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lineLeft, topY - _s(3), lineSpan, (numLines - 1) * lineSpacing + _s(6));
      ctx.clip();
      // Draw numLines+1 lines so the region stays filled as lines exit the top.
      for (let k = 0; k <= numLines; k++) {
        const lineY = topY + k * lineSpacing - offset;
        ctx.beginPath();
        ctx.moveTo(lineLeft, lineY);
        ctx.quadraticCurveTo(lineLeft + xQuart, lineY - _s(2.5), xMid, lineY);
        ctx.quadraticCurveTo(xMid + xQuart, lineY + _s(2.5), lineRight, lineY);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static: 3 short, thin wavy heat lines near the top
      for (let i = 0; i < numLines; i++) {
        const lineY = topY + i * lineSpacing;
        ctx.beginPath();
        ctx.moveTo(lineLeft, lineY);
        ctx.quadraticCurveTo(lineLeft + xQuart, lineY - _s(2.5), xMid, lineY);
        ctx.quadraticCurveTo(xMid + xQuart, lineY + _s(2.5), lineRight, lineY);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = heaterBaseColor;
  ctx.font = `bold ${_s(13)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tempStr = tile.temperature >= 0 ? `+${tile.temperature}°` : `${tile.temperature}°`;
  ctx.fillText(tempStr, 0, 0);
}

function _drawChamberIceContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, lockedCost: number | null): void {
  // Draw short diagonal ice lines in top-left and bottom-right corners
  const iceDecorColor = isWater ? ICE_WATER_COLOR : ICE_COLOR;
  ctx.strokeStyle = iceDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), -bh + _s(9)); ctx.lineTo(-bw + _s(9), -bh + _s(3)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bw + _s(3), -bh + _s(13)); ctx.lineTo(-bw + _s(13), -bh + _s(3)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bw - _s(9), bh - _s(3)); ctx.lineTo(bw - _s(3), bh - _s(9)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bw - _s(13), bh - _s(3)); ctx.lineTo(bw - _s(3), bh - _s(13)); ctx.stroke();
  ctx.fillStyle = iceDecorColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedCost !== null) {
    // Connected: show the single locked effective (negative) cost value
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, 0);
  } else {
    // Unconnected: show three lines: negative cost, "x", and the temperature threshold.
    // By default, adjust the threshold display by current temperature (capped at 0).
    // When shift is held, show the raw (unadjusted) threshold value.
    const iceThreshold = shiftHeld
      ? tile.temperature
      : computeDeltaTemp(tile.temperature, currentTemp);
    _drawDeltaTempCostFormula(ctx, `-${iceThreshold}°`, String(tile.cost));
  }
}

function _drawChamberPumpContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean): void {
  // Show pressure bonus (no plus sign for negative values)
  const isVacuum = tile.pressure < 0;
  const pumpBaseColor = isVacuum
    ? (isWater ? VACUUM_WATER_COLOR : VACUUM_COLOR)
    : (isWater ? PUMP_WATER_COLOR : PUMP_COLOR);
  // Draw decorative graphics near the top of the box
  ctx.strokeStyle = pumpBaseColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  if (isVacuum) {
    // Vacuum: simple vortex swirl near the top
    const swirlY = -bh + _s(9);
    if (isWater) {
      // Animated: swirl arcs rotate slowly in place
      const SWIRL_PERIOD_MS = 3000;
      const rotAngle = (Date.now() % SWIRL_PERIOD_MS) / SWIRL_PERIOD_MS * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(7), rotAngle, rotAngle + Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(3.5), rotAngle + Math.PI * 0.5, rotAngle + Math.PI * 2);
      ctx.stroke();
    } else {
      // Static swirl
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(7), 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, swirlY, _s(3.5), Math.PI * 0.5, Math.PI * 2);
      ctx.stroke();
    }
  } else {
    // Pump: series of thin chevrons in a horizontal line near the top
    const chevY = -bh + _s(7);
    const chevH = _s(4);
    const chevSpacing = _s(7);
    const numChev = 4;
    if (isWater) {
      // Animated: chevrons scroll slowly to the right and wrap horizontally within the tile
      const PUMP_SCROLL_MS = 1500;
      const offset = (Date.now() % PUMP_SCROLL_MS) / PUMP_SCROLL_MS * chevSpacing;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-bw + _s(2), chevY - chevH - _s(2), bw * 2 - _s(4), chevH * 2 + _s(4));
      ctx.clip();
      const visibleWidth = bw * 2 - _s(4);
      const numDraw = Math.ceil(visibleWidth / chevSpacing) + 2;
      const startX = -bw + _s(2) - chevSpacing + offset;
      for (let i = 0; i < numDraw; i++) {
        const chx = startX + i * chevSpacing;
        ctx.beginPath();
        ctx.moveTo(chx - _s(2.5), chevY - chevH);
        ctx.lineTo(chx + _s(2.5), chevY);
        ctx.lineTo(chx - _s(2.5), chevY + chevH);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Static chevrons
      const chevStartX = -(numChev - 1) * chevSpacing / 2;
      for (let i = 0; i < numChev; i++) {
        const chx = chevStartX + i * chevSpacing;
        ctx.beginPath();
        ctx.moveTo(chx - _s(2.5), chevY - chevH);
        ctx.lineTo(chx + _s(2.5), chevY);
        ctx.lineTo(chx - _s(2.5), chevY + chevH);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = pumpBaseColor;
  ctx.font = `bold ${_s(13)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pressStr = tile.pressure >= 0 ? `+${tile.pressure}P` : `${tile.pressure}P`;
  ctx.fillText(pressStr, 0, 0);
}

function _drawChamberSnowContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null): void {
  // Draw a small snowflake in the top-right inside corner
  const snowDecorColor = isWater ? SNOW_WATER_COLOR : SNOW_COLOR;
  ctx.strokeStyle = snowDecorColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const sfx = bw - _s(8);
  const sfy = -bh + _s(8);
  const sfR = _s(5);
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    ctx.beginPath();
    ctx.moveTo(sfx, sfy);
    ctx.lineTo(sfx + sfR * Math.cos(angle), sfy + sfR * Math.sin(angle));
    ctx.stroke();
  }
  ctx.fillStyle = snowDecorColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedCost !== null) {
    // Connected: show the single locked effective (negative) cost value
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, 0);
  } else {
    // Unconnected: show three lines: negative adjusted cost, "x", and the temperature threshold.
    // By default, show values adjusted by current Pressure and Temperature.
    // When shift is held, show the raw (unadjusted) values.
    const deltaTemp = shiftHeld
      ? tile.temperature
      : computeDeltaTemp(tile.temperature, currentTemp);
    const snowCost = shiftHeld
      ? tile.cost
      : Math.max(1, snowCostPerDeltaTemp(tile.cost, currentPressure));
    _drawDeltaTempCostFormula(ctx, `-${deltaTemp}°`, String(snowCost));
  }
}

/**
 * Compute the sandstone visual state from the tile's hardness/shatter config
 * and the current board pressure.  Used by both {@link _drawChamber} and
 * {@link _resolveTileColor} to derive the appropriate color without duplicating
 * the threshold logic.
 */
function _sandstoneColorState(
  tile: Tile,
  currentPressure: number,
): { isShatterTriggered: boolean; isHard: boolean } {
  const shatterActive = tile.shatter > tile.hardness;
  return {
    isShatterTriggered: shatterActive && currentPressure >= tile.shatter,
    isHard: tile.hardness >= currentPressure,
  };
}

function _drawChamberSandstoneContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, sandstoneColor: string, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null): void {
  // When hardness >= pressure, use darker color and show hardness.
  // When shatter is active and pressure reaches the shatter threshold, use lighter color.
  // When connected, show the locked effective cost value.
  // Otherwise show cost display lines.
  const { shatterOverride, deltaDamage, costPerDeltaTemp } =
    sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
  const shatterActive = tile.shatter > tile.hardness;
  const isHard = tile.hardness >= currentPressure;
  // Draw 2 wavy lines near the bottom inside the box (sandstone layers)
  ctx.strokeStyle = sandstoneColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  const sLineLeft = -bw + _s(4);
  const sLineRight = bw - _s(4);
  const sLineSpan = sLineRight - sLineLeft;
  const sLineMid = 0;
  const sLineQuart = sLineSpan / 4;
  for (let i = 0; i < 2; i++) {
    const sLineY = bh - _s(5) - i * _s(4);
    ctx.beginPath();
    ctx.moveTo(sLineLeft, sLineY);
    ctx.quadraticCurveTo(sLineLeft + sLineQuart, sLineY - _s(2.5), sLineMid, sLineY);
    ctx.quadraticCurveTo(sLineMid + sLineQuart, sLineY + _s(2.5), sLineRight, sLineY);
    ctx.stroke();
  }
  // Vertically center text between the rect top (−bh) and the top of the wavy lines.
  const wavesTop = bh - _s(11.5);
  const textCenterY = (-bh + wavesTop) / 2;
  // Use the lighter standard sandstone color for text when isHard so it is readable
  // against the dark tile background.
  ctx.fillStyle = isHard ? (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR) : sandstoneColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // When pressure > hardness, or when connected (locked cost), show the hardness number
  // in the top-left corner for reference
  if (!isHard || lockedCost !== null) {
    ctx.save();
    ctx.fillStyle = isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `bold ${_s(9)}px Arial`;
    ctx.fillText(`${tile.hardness}H`, -bw + _s(2), -bh + _s(2));
    ctx.restore();
  }
  if (lockedCost !== null) {
    // Connected: locked effective cost takes precedence regardless of hardness
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(String(-lockedCost), 0, textCenterY);
  } else if (isHard) {
    // Unconnected and pressure <= hardness: show hardness/H and "temperature x cost"
    ctx.font = `bold ${_s(14)}px Arial`;
    ctx.fillText(`${tile.hardness}H`, 0, textCenterY - _s(4));
    ctx.font = (tile.temperature < 10 && tile.cost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
    ctx.fillText(`${tile.temperature}° x ${tile.cost}`, 0, textCenterY + _s(10));
  } else {
    // Unconnected: show cost display.
    // deltaDamage = Pressure − Hardness is used as the cost divisor.
    // When shift is held, show the raw (unadjusted) values.
    const sandstoneThreshold = shiftHeld
      ? tile.temperature
      : computeDeltaTemp(tile.temperature, currentTemp);
    const sandstoneCost = shiftHeld
      ? tile.cost
      : Math.max(1, deltaDamage >= 1 ? costPerDeltaTemp : tile.cost);
    if (shatterActive) {
      const displayCost = shatterOverride ? 0 : sandstoneCost;
      ctx.font = tile.shatter < 10 ? `bold ${_s(12)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(shatterOverride ? 'WEAK' : `S @ ${tile.shatter}P`, 0, textCenterY - _s(7));
      ctx.font = (sandstoneThreshold < 10 && displayCost < 10) ? `bold ${_s(11)}px Arial` : `bold ${_s(9)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}° x ${displayCost}`, 0, textCenterY + _s(7));
    } else {
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(`-${sandstoneThreshold}°`, 0, textCenterY - _s(5));
      ctx.font = `bold ${_s(9)}px Arial`;
      ctx.fillText('x', 0, textCenterY + _s(4));
      ctx.font = `bold ${_s(14)}px Arial`;
      ctx.fillText(String(sandstoneCost), 0, textCenterY + _s(14));
    }
  }
}

/** Draw a 5-pointed star inside the chamber inner box. */
function _drawChamberStarContent(ctx: CanvasRenderingContext2D, isWater: boolean, half: number): void {
  ctx.fillStyle = isWater ? STAR_WATER_COLOR : STAR_COLOR;
  const outerR = half * 0.45;
  const innerR = outerR * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.fill();
}

function _drawChamberHotPlateContent(ctx: CanvasRenderingContext2D, tile: Tile, bw: number, bh: number, isWater: boolean, shiftHeld: boolean, currentTemp: number, lockedCost: number | null, lockedGain: number | null): void {
  // Draw a small flame icon in the top-right inside corner
  const hotColor = isWater ? HOT_PLATE_WATER_COLOR : HOT_PLATE_COLOR;
  ctx.strokeStyle = hotColor;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  // Flame: a simple upward-pointing flame shape
  const fx = bw - _s(8);
  const fy = -bh + _s(9);
  const fr = _s(5);
  ctx.beginPath();
  ctx.moveTo(fx, fy + fr);
  ctx.bezierCurveTo(fx - fr, fy, fx - fr * 0.5, fy - fr * 1.2, fx, fy - fr);
  ctx.bezierCurveTo(fx + fr * 0.5, fy - fr * 1.2, fx + fr, fy, fx, fy + fr);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lockedGain !== null || lockedCost !== null) {
    // Connected: show gain in green and/or loss in red
    const gain = lockedGain ?? 0;
    const loss = lockedCost ?? 0;
    ctx.font = `bold ${_s(12)}px Arial`;
    if (gain > 0 && loss > 0) {
      // Both gain and loss: show each in its own color, offset vertically
      ctx.fillStyle = ANIM_POSITIVE_COLOR;
      ctx.fillText(`+${gain}`, 0, -_s(6));
      ctx.fillStyle = ANIM_NEGATIVE_COLOR;
      ctx.fillText(`-${loss}`, 0, _s(6));
    } else if (gain > 0) {
      ctx.fillStyle = ANIM_POSITIVE_COLOR;
      ctx.fillText(`+${gain}`, 0, 0);
    } else if (loss > 0) {
      ctx.fillStyle = ANIM_NEGATIVE_COLOR;
      ctx.fillText(`-${loss}`, 0, 0);
    } else {
      ctx.fillStyle = hotColor;
      ctx.fillText('0', 0, 0);
    }
  } else {
    // Unconnected: show boiling temp and mass.
    // When shift is held, show the raw temp parameter; otherwise show tile.temperature + currentTemp.
    const deltaTemp = shiftHeld
      ? tile.temperature
      : tile.temperature + currentTemp;
    ctx.fillStyle = hotColor;
    _drawDeltaTempCostFormula(ctx, `${deltaTemp}°`, String(tile.cost));
  }
}

function _drawChamber(ctx: CanvasRenderingContext2D, tile: Tile, color: string, isWater: boolean, half: number, shiftHeld: boolean, currentTemp: number, currentPressure: number, lockedCost: number | null, lockedGain: number | null): void {
  // Clip to tile bounds so that connection stubs end exactly at the tile edge.
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.clip();
  const bw = half * 0.7 + 2;
  const bh = half * 0.7 + 2;
  const br = _s(3); // slight corner radius for the inner box
  ctx.beginPath();
  ctx.roundRect(-bw, -bh, bw * 2, bh * 2, br);
  ctx.fillStyle = isWater ? CHAMBER_FILL_WATER_COLOR : CHAMBER_FILL_COLOR;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = _s(3);
  ctx.stroke();
  // Draw inner content based on chamberContent
  const { chamberContent } = tile;
  if (chamberContent === 'tank') {
    _drawChamberTankContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'dirt') {
    _drawChamberDirtContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'item') {
    _drawChamberItemContent(ctx, tile.itemShape, tile.itemCount, bw, bh, isWater, half);
  } else if (chamberContent === 'heater') {
    _drawChamberHeaterContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'ice') {
    _drawChamberIceContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, lockedCost);
  } else if (chamberContent === 'pump') {
    _drawChamberPumpContent(ctx, tile, bw, bh, isWater);
  } else if (chamberContent === 'snow') {
    _drawChamberSnowContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, currentPressure, lockedCost);
  } else if (chamberContent === 'sandstone') {
    const { isShatterTriggered, isHard } = _sandstoneColorState(tile, currentPressure);
    const sandstoneColor = isShatterTriggered
      ? (isWater ? SANDSTONE_SHATTER_WATER_COLOR : SANDSTONE_SHATTER_COLOR)
      : isHard
        ? (isWater ? SANDSTONE_HARD_WATER_COLOR : SANDSTONE_HARD_COLOR)
        : (isWater ? SANDSTONE_WATER_COLOR : SANDSTONE_COLOR);
    _drawChamberSandstoneContent(ctx, tile, bw, bh, isWater, sandstoneColor, shiftHeld, currentTemp, currentPressure, lockedCost);
  } else if (chamberContent === 'star') {
    _drawChamberStarContent(ctx, isWater, half);
  } else if (chamberContent === 'hot_plate') {
    _drawChamberHotPlateContent(ctx, tile, bw, bh, isWater, shiftHeld, currentTemp, lockedCost, lockedGain);
  }
  // Connection stubs drawn with flat (butt) caps, starting exactly at the box edge
  // so each stub connects flush with the outside edge of the inner rectangle.
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = 'butt';
  if (tile.connections.has(Direction.North)) {
    ctx.beginPath(); ctx.moveTo(0, -bh); ctx.lineTo(0, -half); ctx.stroke();
  }
  if (tile.connections.has(Direction.South)) {
    ctx.beginPath(); ctx.moveTo(0, bh);  ctx.lineTo(0, half);  ctx.stroke();
  }
  if (tile.connections.has(Direction.West)) {
    ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(-half, 0); ctx.stroke();
  }
  if (tile.connections.has(Direction.East)) {
    ctx.beginPath(); ctx.moveTo(bw, 0);  ctx.lineTo(half, 0);  ctx.stroke();
  }
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
      const { isShatterTriggered, isHard } = _sandstoneColorState(tile, currentPressure);
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
  clipNubDirs?: Set<Direction>,
): void {
  const { shape, rotation } = tile;
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const half = TILE_SIZE / 2;

  // When a rotation override is active, use it; blocked arms and nub-clip dirs are
  // suppressed during rotation animation because the arm directions are mid-transition.
  const effectiveRotation = rotationDegOverride ?? rotation;
  const effectiveBlockedWaterDir = rotationDegOverride !== undefined ? null : blockedWaterDir;
  const effectiveClipNubDirs = rotationDegOverride !== undefined ? undefined : clipNubDirs;

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
  // When any arm needs its nub clipped to the tile boundary (e.g. adjacent to a
  // source/sink/chamber), draw arms individually so clipping can be applied per arm.
  const hasNubClip = (effectiveClipNubDirs?.size ?? 0) > 0 && isPipeShape;

  if (shape === PipeShape.Empty) {
    // Draw a subtle dot so the tile is visually distinct from fixed tiles
    ctx.fillStyle = EMPTY_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, _s(4), 0, Math.PI * 2);
    ctx.fill();
  } else if (isBlockedPipe || hasNubClip) {
    // Arm-by-arm drawing: blocked arm uses non-water color; clipped arms use a tile-boundary
    // clip region to prevent round-cap nubs from extending into adjacent tiles.
    // Draw blocked arms first so the unblocked (water) arms are painted on top at the
    // tile center, giving the correct visual appearance at the junction point.
    const dryColor = _resolveTileColor(tile, false, currentPressure);
    const sortedArms = [...tile.connections].sort((a, b) => (a === effectiveBlockedWaterDir ? -1 : b === effectiveBlockedWaterDir ? 1 : 0));
    ctx.lineCap = 'round';
    for (const armDir of sortedArms) {
      const armColor = (isBlockedPipe && armDir === effectiveBlockedWaterDir) ? dryColor : color;
      if (effectiveClipNubDirs?.has(armDir)) {
        // Clip this arm to the tile boundary so the round cap doesn't bleed into
        // the adjacent source/sink/chamber tile.
        ctx.save();
        ctx.beginPath();
        ctx.rect(-half, -half, half * 2, half * 2);
        ctx.clip();
        _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, armColor);
        ctx.restore();
      } else {
        _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, armColor);
      }
    }
    if (LEAKY_PIPE_SHAPES.has(shape)) {
      _drawLeakyRustSpots(ctx, tile, half, effectiveBlockedWaterDir);
    }
  } else if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight || shape === PipeShape.SpinStraight || shape === PipeShape.SpinStraightCement) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
  } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow || shape === PipeShape.SpinElbow || shape === PipeShape.SpinElbowCement) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
  } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee || shape === PipeShape.SpinTee || shape === PipeShape.SpinTeeCement) {
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
  } else if (shape === PipeShape.LeakyStraight) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    _drawLeakyRustSpots(ctx, tile, half, null);
  } else if (shape === PipeShape.LeakyElbow) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    _drawLeakyRustSpots(ctx, tile, half, null);
  } else if (shape === PipeShape.LeakyTee) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    _drawLeakyRustSpots(ctx, tile, half, null);
  } else if (shape === PipeShape.LeakyCross) {
    ctx.beginPath();
    ctx.moveTo(0, -half);
    ctx.lineTo(0, half);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    _drawLeakyRustSpots(ctx, tile, half, null);
  } else if (shape === PipeShape.Source || shape === PipeShape.Sink) {
    // Restore to un-rotated state so we can draw based on actual connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawSourceOrSink(ctx, tile, color, half, currentWater, shape);
  } else if (shape === PipeShape.Chamber) {
    // Chamber – a steel-blue enclosure whose interior display varies by content
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawChamber(ctx, tile, color, isWater, half, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain);
  } else if (shape === PipeShape.Granite) {
    // Granite – solid impassable stone block; no connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawGranite(ctx, half);
  } else if (shape === PipeShape.Tree) {
    // Tree – impassable obstacle rendered as a top-down broad-leafed tree
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    _drawTree(ctx, half);
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

/** Return a human-readable name for an inventory item shape (used inside item-container tooltips). */
function _itemShapeDisplayName(shape: PipeShape | null): string {
  switch (shape) {
    case PipeShape.Straight:      return 'Straight';
    case PipeShape.Elbow:         return 'Elbow';
    case PipeShape.Tee:           return 'Tee';
    case PipeShape.Cross:         return 'Cross';
    case PipeShape.GoldStraight:  return 'Gold Straight';
    case PipeShape.GoldElbow:     return 'Gold Elbow';
    case PipeShape.GoldTee:       return 'Gold Tee';
    case PipeShape.GoldCross:     return 'Gold Cross';
    case PipeShape.LeakyStraight: return 'Leaky Straight';
    case PipeShape.LeakyElbow:    return 'Leaky Elbow';
    case PipeShape.LeakyTee:      return 'Leaky Tee';
    case PipeShape.LeakyCross:    return 'Leaky Cross';
    default:                      return 'Item';
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
    case PipeShape.SpinStraight: return 'Spin Straight';
    case PipeShape.SpinElbow:    return 'Spin Elbow';
    case PipeShape.SpinTee:      return 'Spin Tee';
    case PipeShape.SpinStraightCement: return 'Spin Straight (Cement)';
    case PipeShape.SpinElbowCement:    return 'Spin Elbow (Cement)';
    case PipeShape.SpinTeeCement:      return 'Spin Tee (Cement)';
    case PipeShape.LeakyStraight: return 'Leaky Straight';
    case PipeShape.LeakyElbow:    return 'Leaky Elbow';
    case PipeShape.LeakyTee:      return 'Leaky Tee';
    case PipeShape.LeakyCross:    return 'Leaky Cross';
    case PipeShape.Source:       return 'Source';
    case PipeShape.Sink:         return 'Sink';
    case PipeShape.Granite:      return 'Granite';
    case PipeShape.Tree:         return 'Tree';
    case PipeShape.Cement:       return 'Cement';
    case PipeShape.Chamber:
      switch (tile.chamberContent) {
        case 'tank':   return tile.capacity > 0 ? `Tank +${tile.capacity}` : 'Tank';
        case 'dirt':   return `Dirt -${tile.cost}`;
        case 'item': {
          const itemName = _itemShapeDisplayName(tile.itemShape);
          return tile.itemCount > 1 ? `${tile.itemCount}× ${itemName}` : itemName;
        }
        case 'heater':
          if (tile.temperature < 0) return `Cooler ${tile.temperature}°`;
          return tile.temperature > 0 ? `Heater +${tile.temperature}°` : 'Heater';
        case 'ice':    return `Ice -${tile.temperature}° x ${tile.cost}`;
        case 'pump':
          if (tile.pressure < 0) return `Vacuum ${tile.pressure}P`;
          return `Pump +${tile.pressure}P`;
        case 'snow':    return `Snow -${tile.temperature}° x ${tile.cost}`;
        case 'sandstone': {
          const shatterActive = tile.shatter > tile.hardness;
          return shatterActive
            ? `Sandstone -${tile.temperature}° x ${tile.cost} (H=${tile.hardness}, S=${tile.shatter})`
            : `Sandstone -${tile.temperature}° x ${tile.cost} (H=${tile.hardness})`;
        }
        case 'hot_plate': return `Hot Plate ${tile.temperature}° x ${tile.cost}`;
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
    !SPIN_PIPE_SHAPES.has(tile.shape) &&
    (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) &&
    (tile.shape !== selectedShape || tile.rotation !== pendingRotation) &&
    (!isGoldCell || selectedIsGold)
  );
}

// ─── Ambient decoration colors (local constants, not exported) ──────────────

/** Pebble fill colors: slightly lighter, more neutral than the tile background. */
const PEBBLE_COLORS = [
  'rgba(68,65,96,0.78)',
  'rgba(80,76,112,0.72)',
  'rgba(58,56,84,0.82)',
] as const;

/** Flower petal colors: muted warm/cool tones that sit against the dark bg. */
const FLOWER_PETAL_COLORS = [
  'rgba(100,65,88,0.72)',   // muted rose
  'rgba(95,85,48,0.72)',    // muted gold
  'rgba(78,65,112,0.72)',   // muted lavender
] as const;

/** Flower center dot color. */
const FLOWER_CENTER_COLOR = 'rgba(120,104,56,0.82)';

/** Grass blade color. */
const GRASS_COLOR = 'rgba(72,115,58,0.90)';

// ─── Ambient decoration drawing helpers ──────────────────────────────────────

/** Draw a small cluster of pebbles centered at the current canvas origin. */
function _drawPebbles(ctx: CanvasRenderingContext2D, variant: number): void {
  const color = PEBBLE_COLORS[variant % PEBBLE_COLORS.length];
  const stones: Array<[number, number, number, number]> = [
    [0, 0, _s(5.25), _s(3.75)],
    [_s(7.5), -_s(3.75), _s(4.2), _s(3.0)],
  ];
  if (variant < 2) stones.push([-_s(6), _s(4.5), _s(3.3), _s(2.4)]);
  ctx.fillStyle = color;
  for (const [dx, dy, rx, ry] of stones) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw a small top-down flower centered at the current canvas origin. */
function _drawFlower(ctx: CanvasRenderingContext2D, variant: number): void {
  const petalColor = FLOWER_PETAL_COLORS[variant % FLOWER_PETAL_COLORS.length];
  const petals = 5;
  const petalDist = _s(4.5);
  const petalR = _s(2.8);
  ctx.fillStyle = petalColor;
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * petalDist, Math.sin(angle) * petalDist, petalR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, _s(2.2), 0, Math.PI * 2);
  ctx.fillStyle = FLOWER_CENTER_COLOR;
  ctx.fill();
}

/** Draw a small tuft of grass blades centered at the current canvas origin. */
function _drawGrass(ctx: CanvasRenderingContext2D, variant: number): void {
  const blades = variant + 3; // 3–5 blades
  ctx.strokeStyle = GRASS_COLOR;
  ctx.lineWidth = _s(1.5);
  ctx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    // Fan the blades symmetrically; vary length slightly for a natural look
    const spread = (blades > 1) ? ((i / (blades - 1)) - 0.5) * (Math.PI * 0.55) : 0;
    const len = _s(8.25 + (i % 2) * 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(spread) * len, -Math.cos(spread) * len);
    ctx.stroke();
  }
}

/**
 * Draw a single ambient decoration onto the canvas.
 * The canvas context should NOT have any prior transforms applied;
 * this function handles its own save/restore cycle.
 */
export function drawAmbientDecoration(
  ctx: CanvasRenderingContext2D,
  dec: AmbientDecoration,
): void {
  const cx = dec.col * TILE_SIZE + dec.offsetX * TILE_SIZE;
  const cy = dec.row * TILE_SIZE + dec.offsetY * TILE_SIZE;
  ctx.save();
  ctx.translate(cx, cy);
  if (dec.type !== 'grass') {
    ctx.rotate((dec.rotation * Math.PI) / 180);
  }
  switch (dec.type) {
    case 'pebbles': _drawPebbles(ctx, dec.variant); break;
    case 'flower':  _drawFlower(ctx, dec.variant);  break;
    case 'grass':   _drawGrass(ctx, dec.variant);   break;
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
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  highlightedPositions: Set<string> = new Set(),
  hoverRotationDelta = 0,
  rotationOverrides?: Map<string, number>,
  fillExclude?: Set<string>,
  fillEntryDirs?: Map<string, Direction>,
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

  _renderPass1Backgrounds(ctx, board, focusPos, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha, highlightedPositions);
  _renderPass2NonPipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure);
  _renderPass3PipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, mouseCanvasPos, rotationOverrides, fillEntryDirs);
  _renderPass4CementLabels(ctx, board);
  _renderHoverPreview(ctx, board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos, hoverRotationDelta, currentWater);
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
 * Draw a semi-transparent placement-target overlay over a tile cell.
 * Used to shade cells that are valid replacement targets, or cement cells
 * with an identical piece where replacement is disallowed.
 */
function _drawCellTargetOverlay(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = EMPTY_TARGET_COLOR;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.globalAlpha = 1;
}

/**
 * Pass 1: Draw all tile backgrounds first so that pipe tile content drawn in pass 2
 * is never covered by a neighboring empty tile's background fill.
 */
function _renderPass1Backgrounds(
  ctx: CanvasRenderingContext2D,
  board: Board,
  focusPos: GridPos,
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
      const isFocused  = focusPos.row === r && focusPos.col === c;
      const isGoldCell = board.goldSpaces.has(posKey(r, c));
      const isCementCell = board.cementData.has(posKey(r, c));
      const oneWayDir = board.oneWayData.get(posKey(r, c));
      const isOneWayCell = oneWayDir !== undefined;

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
      if (isOneWayCell) {
        // One-way cell: always show arrow background regardless of tile on top
        _drawOneWayBackground(ctx, x, y, oneWayDir!);
        if (isTarget) {
          ctx.fillStyle = ONE_WAY_TARGET_OVERLAY;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
        if (isReplaceTarget) {
          _drawCellTargetOverlay(ctx, x, y);
        } else if (
          selectedShape !== null &&
          tile.shape !== PipeShape.Empty &&
          tile.shape === selectedShape &&
          tile.rotation === pendingRotation
        ) {
          _drawCellTargetOverlay(ctx, x, y);
        }
      } else if (isCementCell) {
        // Cement cell: always show cement background regardless of tile on top
        _drawCementBackground(ctx, x, y);
        if (isTarget) {
          ctx.fillStyle = CEMENT_TARGET_OVERLAY;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
        if (isReplaceTarget) {
          _drawCellTargetOverlay(ctx, x, y);
        } else if (
          selectedShape !== null &&
          tile.shape !== PipeShape.Empty &&
          tile.shape === selectedShape &&
          tile.rotation === pendingRotation
        ) {
          // Darken cement cells that have the same piece and orientation as the
          // selected shape: replacing with an identical tile is not a valid move,
          // so shade the cell to indicate it is not a placement target.
          _drawCellTargetOverlay(ctx, x, y);
        }
      } else if (tile.shape === PipeShape.Empty) {
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
            ctx.fillStyle = GOLD_TARGET_OVERLAY;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else {
          ctx.fillStyle = isTarget ? EMPTY_TARGET_COLOR : EMPTY_COLOR;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          // Draw any ambient decoration on this empty non-gold cell
          const dec = board.ambientDecorationMap.get(posKey(r, c));
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
        // Overlay a target highlight when this tile is a valid replacement target
        if (isReplaceTarget) {
          _drawCellTargetOverlay(ctx, x, y);
        }
      }

      // Focus highlight
      if (isFocused) {
        ctx.strokeStyle = FOCUS_COLOR;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
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
): void {
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const tile = board.grid[r][c];
      if (PIPE_SHAPES.has(tile.shape)) continue;
      const isCementCell = board.cementData.has(posKey(r, c));

      // Skip drawing the empty-tile dot on cement or one-way cells – their
      // background texture/arrow is already clearly visible.
      if (tile.shape === PipeShape.Empty && (isCementCell || board.oneWayData.has(posKey(r, c)))) continue;

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

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain);
    }
  }
}

/**
 * Pass 3: Draw all pipe tile content on top of all non-pipe tile content so that
 * pipe rounded caps (from lineCap='round') are never overwritten by a neighboring
 * non-pipe tile's fill (e.g. a Chamber or Source adjacent to a pipe).
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
  fillEntryDirs?: Map<string, Direction>,
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

      // Determine which arm directions need their nub clipped at the tile boundary:
      //   - Arms pointing at a Source or Sink always get clipped (any fill state).
      //   - Arms pointing at a Chamber get clipped only when the pipe itself is dry,
      //     to prevent the dry-colour nub from bleeding into the chamber tile.
      //   - The entry arm of a fill-animated (dry) tile is clipped so the dry
      //     round-cap nub does not bleed into the adjacent already-filled tile.
      let clipNubDirs: Set<Direction> | undefined;
      for (const dir of tile.connections) {
        const delta = NEIGHBOUR_DELTA[dir];
        const nr = r + delta.row, nc = c + delta.col;
        if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;
        const neighbor = board.grid[nr][nc];
        if (
          neighbor.shape === PipeShape.Source ||
          neighbor.shape === PipeShape.Sink ||
          (neighbor.shape === PipeShape.Chamber && !isWater)
        ) {
          (clipNubDirs ??= new Set<Direction>()).add(dir);
        }
      }
      if (!isWater) {
        const fillEntryDir = fillEntryDirs?.get(posKey(r, c));
        if (fillEntryDir !== undefined) {
          (clipNubDirs ??= new Set<Direction>()).add(fillEntryDir);
        }
      }

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, null, null, isHovered, blockedWaterDir, rotOverride, clipNubDirs);
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
      _drawCementLabel(ctx, x, y, dryingTime, isHardened);
    }
  }
}

/**
 * Draw a semi-transparent placement/rotation preview overlay at (px, py).
 * Applies 50% alpha and a yellow glow so the preview is visually distinct from
 * a live tile without obscuring what is beneath it.
 */
function _drawPreviewTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  previewTile: Tile,
  currentWater: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.shadowColor = PREVIEW_SHADOW_COLOR;
  ctx.shadowBlur = PREVIEW_SHADOW_BLUR;
  drawTile(ctx, px, py, previewTile, false, currentWater);
  ctx.restore();
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
    const canPlace = hoverTile.shape === PipeShape.Empty && (!isGoldCell || selectedIsGold);
    const canReplace = isReplaceableByShape(hoverTile, selectedShape, pendingRotation, selectedIsGold, isGoldCell);
    if (canPlace || canReplace) {
      const previewTile = new Tile(selectedShape, pendingRotation as 0 | 90 | 180 | 270);
      _drawPreviewTile(ctx, px, py, previewTile, currentWater);
    }
  } else if (hoverRotationDelta > 0) {
    // Rotation preview on an existing tile (no inventory item selected, Q/W or scroll)
    if (!hoverTile.isFixed && hoverTile.shape !== PipeShape.Empty && !SPIN_PIPE_SHAPES.has(hoverTile.shape)) {
      const previewRotation = ((hoverTile.rotation + hoverRotationDelta * 90) % 360) as 0 | 90 | 180 | 270;
      const previewTile = new Tile(
        hoverTile.shape, previewRotation, false, hoverTile.capacity, hoverTile.cost,
        hoverTile.itemShape, hoverTile.itemCount, null, hoverTile.chamberContent,
        hoverTile.temperature, hoverTile.pressure, hoverTile.hardness, hoverTile.shatter,
      );
      _drawPreviewTile(ctx, px, py, previewTile, currentWater);
    }
  }
}
