/**
 * Shared mutable rendering state: tile-size constants and the pixel-scaling
 * helper used by both renderer.ts and sub-modules such as chamberRenderers.ts.
 *
 * Kept in a dedicated file so neither renderer.ts nor chamberRenderers.ts has
 * to import from the other, avoiding a circular dependency.
 */

/** Pipe stroke width in pixels. */
export let LINE_WIDTH = 10;

/** The current tile size in pixels.  64 (default) or 128 (large) depending on the viewport. */
export let TILE_SIZE = 64; // px

/** Base tile size used as the reference for all pixel-value scaling. */
const BASE_TILE_SIZE = 64;

/**
 * Update the active tile size and derived constants.
 * Call this before setting canvas dimensions when loading a level.
 */
export function setTileSize(size: number): void {
  TILE_SIZE = size;
  LINE_WIDTH = Math.round(10 * size / BASE_TILE_SIZE);
}

/**
 * Scale a pixel value that was designed for BASE_TILE_SIZE to the current TILE_SIZE.
 * Use for font sizes, small offsets and decoration dimensions.
 */
export function _s(n: number): number {
  return Math.round(n * TILE_SIZE / BASE_TILE_SIZE);
}
