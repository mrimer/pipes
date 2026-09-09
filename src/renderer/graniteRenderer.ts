/**
 * Granite tile drawing — seamed border/fill geometry against adjacent
 * granite tiles. Split out of renderer.ts to shrink its function count.
 */

import type { Board } from '../board';
import { PipeShape } from '../types';
import { _s } from './rendererState';
import { GRANITE_COLOR, GRANITE_FILL_COLOR } from '../colors';

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

/**
 * True when a diagonal corner between two adjacent granite/sea edges is
 * itself also granite/sea — the corner square is fully surrounded and
 * should be filled solid to avoid a sub-pixel seam.
 *
 * Shared with renderer.ts's sea-border drawing, which has the same corner
 * geometry — exported (despite the leading underscore, kept to signal this
 * isn't a public rendering API) rather than duplicated.
 */
export function _isCornerFilled(edgeA: boolean, edgeB: boolean, diagonal: boolean): boolean {
  return edgeA && edgeB && diagonal;
}

/**
 * True when two adjacent edges are granite/sea but the diagonal between
 * them is not — the corner square would otherwise be left as an uncovered
 * (or under-bordered) gap and needs an explicit fill/border segment.
 *
 * Shared with renderer.ts's sea-border drawing — see {@link _isCornerFilled}.
 */
export function _isCornerExposed(edgeA: boolean, edgeB: boolean, diagonal: boolean): boolean {
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
