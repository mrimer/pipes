/**
 * Sea tile drawing — animated water fill, ripples, and seamed land border
 * against adjacent sea tiles. Split out of renderer.ts to shrink its
 * function count (see graniteRenderer.ts for the analogous granite split).
 */

import type { LevelStyle } from '../types';
import { _s } from './rendererState';
import { _isCornerExposed } from './graniteRenderer';
import {
  SEA_BORDER_COLOR,
  SEA_FILL_COLOR, SEA_FILL_COLOR_WINTER, SEA_FILL_COLOR_FALL, SEA_FILL_COLOR_DARK, SEA_FILL_COLOR_SPRING,
} from '../colors';

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
  _drawSeaRipple(ctx, { half, ox: -half * 0.3, oy: -half * 0.25, now, phaseOffset: 0 });
  _drawSeaRipple(ctx, { half, ox: half * 0.2, oy: half * 0.3, now, phaseOffset: 800 });
}

interface SeaRippleOptions {
  half: number;
  ox: number;
  oy: number;
  now: number;
  phaseOffset: number;
}

/**
 * Draw a small animated ripple on the sea tile surface.
 * The ripple oscillates between a flat line and rising pointy waves,
 * creating a gentle in-place ambient water motion effect.
 */
function _drawSeaRipple(ctx: CanvasRenderingContext2D, opts: SeaRippleOptions): void {
  const { half, ox, oy, now, phaseOffset } = opts;
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
