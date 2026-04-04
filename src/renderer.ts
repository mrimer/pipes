/**
 * Board rendering helpers – draw the game board canvas and individual pipe tiles.
 */

import { Board, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, PIPE_SHAPES, SPIN_PIPE_SHAPES, posKey, NEIGHBOUR_DELTA } from './board';
import { Tile, oppositeDirection } from './tile';
import { GridPos, PipeShape, Direction, COLD_CHAMBER_CONTENTS } from './types';
import { PipeFillAnim, FILL_ANIM_DURATION } from './visuals/pipeEffects';
import { drawChamber, sandstoneColorState } from './renderer/chamberRenderers';
import { drawAmbientDecoration } from './renderer/ambientDecoration';
export { drawAmbientDecoration };
export { LINE_WIDTH, TILE_SIZE, _s, setTileSize } from './renderer/rendererState';
import { LINE_WIDTH, TILE_SIZE, _s, BASE_TILE_SIZE } from './renderer/rendererState';
import {
  BG_COLOR, TILE_BG, FOCUS_COLOR,
  EMPTY_COLOR, EMPTY_TARGET_COLOR,
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

function _drawSourceOrSink(ctx: CanvasRenderingContext2D, tile: Tile, color: string, half: number, currentWater: number, shape: PipeShape, buttEndDirs?: Set<Direction>): void {
  // Filled circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // Radiating lines – only for connected directions
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH;
  const DIRS: [Direction, number, number][] = [
    [Direction.North, 0, -half],
    [Direction.South, 0,  half],
    [Direction.East,  half, 0],
    [Direction.West, -half, 0],
  ];
  for (const [dir, dx, dy] of DIRS) {
    if (!tile.connections.has(dir)) continue;
    ctx.lineCap = buttEndDirs?.has(dir) ? 'butt' : 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx, dy); ctx.stroke();
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

export function drawGranite(ctx: CanvasRenderingContext2D, half: number): void {
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
export function drawTree(ctx: CanvasRenderingContext2D, half: number): void {
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
  // Small brown trunk circle in the center – omitted as the trunk would not be
  // visible from a top-down aerial perspective; the canopy fully covers it.
  // Dark green outline around the whole canopy
  ctx.strokeStyle = TREE_COLOR;
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
  north: boolean;
  east: boolean;
  south: boolean;
  west: boolean;
  /** Diagonal neighbors for rounded corner detection. */
  nw: boolean;
  ne: boolean;
  sw: boolean;
  se: boolean;
}

/**
 * Draw a sea tile at the origin (caller must translate ctx to tile center).
 * The water color oscillates gently.  Land borders are drawn on edges where
 * the adjacent tile is NOT sea.  Rounded corners connect adjacent edge borders.
 * Two small ripple effects animate on the tile surface.
 *
 * @param ctx       Canvas 2D context (translated so origin = tile center).
 * @param half      Half tile size in pixels.
 * @param neighbors Which adjacent cells are also sea tiles.
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
 * Compute sea-tile neighbor data for the tile at (row, col) on the given board.
 * Returns which of the 8 neighbors are also sea tiles.
 */
export function computeSeaNeighbors(board: Board, row: number, col: number): SeaNeighbors {
  const _isSea = (r: number, c: number): boolean =>
    r >= 0 && r < board.rows && c >= 0 && c < board.cols && board.grid[r][c].shape === PipeShape.Sea;
  return {
    north: _isSea(row - 1, col),
    south: _isSea(row + 1, col),
    west:  _isSea(row, col - 1),
    east:  _isSea(row, col + 1),
    nw:    _isSea(row - 1, col - 1),
    ne:    _isSea(row - 1, col + 1),
    sw:    _isSea(row + 1, col - 1),
    se:    _isSea(row + 1, col + 1),
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
  return board.grid[nr][nc].shape === PipeShape.Empty;
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
  let buttEndDirs: Set<Direction> | undefined;
  for (const dir of tile.connections) {
    const delta = NEIGHBOUR_DELTA[dir];
    const nr = r + delta.row, nc = c + delta.col;
    if (nr < 0 || nr >= board.rows || nc < 0 || nc >= board.cols) continue;
    if (_isOpenFloorCell(board, nr, nc)) continue;
    const neighborTile = board.grid[nr][nc];
    // If the neighbor is a pipe tile without a reciprocal arm, the arms
    // don't overlap – keep a round nub here.
    if (PIPE_SHAPES.has(neighborTile.shape) && !neighborTile.connections.has(oppositeDirection(dir))) continue;
    (buttEndDirs ??= new Set<Direction>()).add(dir);
  }
  return buttEndDirs;
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
  // When any arm points at a non-empty adjacent tile, draw arms individually so
  // each arm end can use lineCap='butt' (flat) instead of round, preventing nubs
  // from sticking out onto adjacent non-empty tiles.
  const hasButtEnd = (effectiveButtEndDirs?.size ?? 0) > 0 && isPipeShape;

  if (isBlockedPipe || hasButtEnd) {
    // Arm-by-arm drawing: blocked arm uses non-water color; arms pointing at
    // non-empty adjacent tiles use lineCap='butt' so the end sits flush with
    // the tile boundary.  Draw blocked arms first so the unblocked (water) arms
    // are painted on top at the tile center.
    const dryColor = _resolveTileColor(tile, false, currentPressure);
    const sortedArms = [...tile.connections].sort((a, b) => (a === effectiveBlockedWaterDir ? -1 : b === effectiveBlockedWaterDir ? 1 : 0));
    for (const armDir of sortedArms) {
      const armColor = (isBlockedPipe && armDir === effectiveBlockedWaterDir) ? dryColor : color;
      ctx.lineCap = effectiveButtEndDirs?.has(armDir) ? 'butt' : 'round';
      _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, armColor);
    }
    // When one or more arms use a butt end cap, the flat cap at the tile centre
    // can leave a visible seam where opposing arms meet.  This happens because
    // each arm is drawn as a separate stroke from (0,0) outward, and when the
    // tile centre lands on a sub-pixel boundary (odd TILE_SIZE), anti-aliasing
    // on the two butt-capped ends does not sum to full opacity.  Draw an
    // explicit round nub at (0,0) to fill any such gap for all pipe shapes.
    // (For elbow pipes the nub also fills the visible corner gap at the curve.)
    if (hasButtEnd) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, LINE_WIDTH / 2, 0, Math.PI * 2);
      ctx.fill();
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
    _drawSourceOrSink(ctx, tile, color, half, currentWater, shape, effectiveButtEndDirs);
  } else if (shape === PipeShape.Chamber) {
    // Chamber – a steel-blue enclosure whose interior display varies by content
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    drawChamber(ctx, tile, color, isWater, half, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, effectiveButtEndDirs);
  } else if (shape === PipeShape.Granite) {
    // Granite – solid impassable stone block; no connections
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    drawGranite(ctx, half);
  } else if (shape === PipeShape.Tree) {
    // Tree – impassable obstacle rendered as a top-down broad-leafed tree
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    drawTree(ctx, half);
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
  _renderPass3PipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, mouseCanvasPos, rotationOverrides);
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
        seaNeighbors = computeSeaNeighbors(board, r, c);
      }

      drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs, seaNeighbors);
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
      const previewTile = new Tile(selectedShape, ((pendingRotation % 360 + 360) % 360) as 0 | 90 | 180 | 270);
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
