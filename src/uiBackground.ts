/**
 * Shared UI background helpers for menu-style full-screen overlays.
 */

/** Side length (px) of each pipe tile in the generated SVG pattern. */
const PIPE_TILE_SIZE_PX = 128;
/** Number of tiles per row/column in the generated SVG pattern block. */
const PIPE_TILE_GRID_SIZE = 3;
/** Full pattern size (px) for one repeating 3×3 block. */
const PIPE_PATTERN_SIZE_PX = PIPE_TILE_SIZE_PX * PIPE_TILE_GRID_SIZE;

/** Stroke width (px) for the outer pipe stroke. */
const PIPE_STROKE_OUTER_PX = 30;
/** Stroke width (px) for the inner pipe highlight stroke. */
const PIPE_STROKE_INNER_PX = 14;
/** Center joint radius (px) for pipe hubs. */
const PIPE_JOINT_RADIUS_PX = 16;
/** Radius ratio for the inner joint highlight circle to keep the hub ring visible. */
const INNER_JOINT_RADIUS_RATIO = 0.56;
/** One-half tile size (px). */
const HALF_TILE_PX = PIPE_TILE_SIZE_PX / 2;

const DEFAULT_OVERLAY_ALPHA = 0.74;
const DEFAULT_ANIMATION_DURATION_SEC = 60;
const DEFAULT_BASE_COLOR = '#0d1520';
const OVERLAY_RGB = '5,10,18';

const DIR_NORTH = 1;
const DIR_EAST = 2;
const DIR_SOUTH = 4;
const DIR_WEST = 8;

/** 3×3 toroidal pipe masks (N/E/S/W bits) that tile seamlessly on all edges. */
const PIPE_MASK_GRID: ReadonlyArray<ReadonlyArray<number>> = [
  [DIR_EAST | DIR_SOUTH | DIR_WEST, DIR_NORTH | DIR_WEST, DIR_NORTH | DIR_EAST | DIR_SOUTH],
  [DIR_NORTH | DIR_EAST | DIR_SOUTH | DIR_WEST, DIR_EAST | DIR_WEST, DIR_NORTH | DIR_EAST | DIR_WEST],
  [DIR_NORTH | DIR_EAST, DIR_EAST | DIR_SOUTH | DIR_WEST, DIR_SOUTH | DIR_WEST],
];

let cachedPipePatternDataUrl: string | null = null;
const synchronizedBackgroundDurationsSec = new Map<HTMLElement, number>();
let synchronizedBackgroundAnimationFrameId: number | null = null;

export interface ScrollingPipeBackgroundOptions {
  /** Solid fallback/background color below the pattern. */
  baseColor?: string;
  /** Dimming alpha applied over the pattern. */
  overlayAlpha?: number;
  /** Animation duration in seconds. */
  animationDurationSec?: number;
}

function buildPipePatternSvg(): string {
  const pipes: string[] = [];
  const joints: string[] = [];
  const tiles: string[] = [];
  for (let row = 0; row < PIPE_TILE_GRID_SIZE; row++) {
    for (let col = 0; col < PIPE_TILE_GRID_SIZE; col++) {
      const x = col * PIPE_TILE_SIZE_PX;
      const y = row * PIPE_TILE_SIZE_PX;
      const centerX = x + HALF_TILE_PX;
      const centerY = y + HALF_TILE_PX;
      const mask = PIPE_MASK_GRID[row][col];

      tiles.push(
        `<rect x="${x}" y="${y}" width="${PIPE_TILE_SIZE_PX}" height="${PIPE_TILE_SIZE_PX}" fill="#0f1c2e"/>`,
        `<rect x="${x + 1}" y="${y + 1}" width="${PIPE_TILE_SIZE_PX - 2}" height="${PIPE_TILE_SIZE_PX - 2}" fill="none" stroke="#1f3048" stroke-width="2"/>`,
      );

      if ((mask & DIR_NORTH) !== 0) pipes.push(`<line x1="${centerX}" y1="${centerY}" x2="${centerX}" y2="${y}" />`);
      if ((mask & DIR_EAST) !== 0) pipes.push(`<line x1="${centerX}" y1="${centerY}" x2="${x + PIPE_TILE_SIZE_PX}" y2="${centerY}" />`);
      if ((mask & DIR_SOUTH) !== 0) pipes.push(`<line x1="${centerX}" y1="${centerY}" x2="${centerX}" y2="${y + PIPE_TILE_SIZE_PX}" />`);
      if ((mask & DIR_WEST) !== 0) pipes.push(`<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${centerY}" />`);
      joints.push(`<circle cx="${centerX}" cy="${centerY}" r="${PIPE_JOINT_RADIUS_PX}" />`);
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIPE_PATTERN_SIZE_PX}" height="${PIPE_PATTERN_SIZE_PX}" viewBox="0 0 ${PIPE_PATTERN_SIZE_PX} ${PIPE_PATTERN_SIZE_PX}">`,
    ...tiles,
    `<g fill="none" stroke="#2f567d" stroke-width="${PIPE_STROKE_OUTER_PX}" stroke-linecap="round">`,
    ...pipes,
    '</g>',
    `<g fill="none" stroke="#4b7fb5" stroke-width="${PIPE_STROKE_INNER_PX}" stroke-linecap="round">`,
    ...pipes,
    '</g>',
    `<g fill="#2f567d">`,
    ...joints,
    '</g>',
    `<g fill="#4b7fb5">`,
    ...joints.map((joint) => joint.replace(`r="${PIPE_JOINT_RADIUS_PX}"`, `r="${PIPE_JOINT_RADIUS_PX * INNER_JOINT_RADIUS_RATIO}"`)),
    '</g>',
    '</svg>',
  ].join('');
}

function getPipePatternDataUrl(): string {
  if (cachedPipePatternDataUrl !== null) return cachedPipePatternDataUrl;
  cachedPipePatternDataUrl = `url("data:image/svg+xml,${encodeURIComponent(buildPipePatternSvg())}")`;
  return cachedPipePatternDataUrl;
}

function getSynchronizedBackgroundOffsetPx(nowMs: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  const elapsedSecInCycle = (nowMs / 1000) % durationSec;
  return (elapsedSecInCycle / durationSec) * PIPE_PATTERN_SIZE_PX;
}

function setSynchronizedBackgroundPosition(target: HTMLElement, durationSec: number, nowMs: number): void {
  const offsetPx = getSynchronizedBackgroundOffsetPx(nowMs, durationSec);
  target.style.backgroundPosition = `0 0, ${offsetPx}px ${offsetPx}px`;
}

function tickSynchronizedBackgrounds(nowMs: number): void {
  synchronizedBackgroundAnimationFrameId = null;
  synchronizedBackgroundDurationsSec.forEach((durationSec, target) => {
    setSynchronizedBackgroundPosition(target, durationSec, nowMs);
  });
  if (synchronizedBackgroundDurationsSec.size === 0) return;
  synchronizedBackgroundAnimationFrameId = window.requestAnimationFrame(tickSynchronizedBackgrounds);
}

function ensureSynchronizedBackgroundAnimationRunning(): void {
  if (synchronizedBackgroundAnimationFrameId !== null || synchronizedBackgroundDurationsSec.size === 0) return;
  synchronizedBackgroundAnimationFrameId = window.requestAnimationFrame(tickSynchronizedBackgrounds);
}

/**
 * Apply the dim scrolling 3×3 pipe-pattern background to a full-screen UI layer.
 */
export function applyScrollingPipeBackground(
  target: HTMLElement,
  options: ScrollingPipeBackgroundOptions = {},
): void {
  const overlayAlpha = options.overlayAlpha ?? DEFAULT_OVERLAY_ALPHA;
  const durationSec = options.animationDurationSec ?? DEFAULT_ANIMATION_DURATION_SEC;
  const patternDataUrl = getPipePatternDataUrl();
  target.style.backgroundColor = options.baseColor ?? DEFAULT_BASE_COLOR;
  target.style.backgroundImage =
    `linear-gradient(rgba(${OVERLAY_RGB},${overlayAlpha}),rgba(${OVERLAY_RGB},${overlayAlpha})),${patternDataUrl}`;
  target.style.backgroundRepeat = 'repeat, repeat';
  target.style.backgroundSize = `auto, ${PIPE_PATTERN_SIZE_PX}px ${PIPE_PATTERN_SIZE_PX}px`;
  target.style.backgroundOrigin = 'border-box, border-box';
  target.style.animation = '';
  target.style.animationDelay = '';
  synchronizedBackgroundDurationsSec.set(target, durationSec);
  setSynchronizedBackgroundPosition(target, durationSec, performance.now());
  ensureSynchronizedBackgroundAnimationRunning();
}
