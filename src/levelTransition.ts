/**
 * Level transition animation – zooms a snapshot of the level grid from the
 * minimap position on the chapter map up to its full in-game size, while
 * simultaneously fading the chapter map out and the play screen in.
 *
 * The snapshot is rendered onto an offscreen canvas using {@link renderBoard},
 * then displayed inside a fixed-position overlay that animates over ~1 second.
 */

import { Board } from './board';
import { TILE_SIZE, renderBoard } from './renderer';
import { CHAPTER_MAP_BG } from './colors';
import { RADIUS_SM } from './uiConstants';


/** Width (px) of the CSS border around the game canvas (#game-canvas). */
const GAME_CANVAS_BORDER_PX = 3;
/** Color of the CSS border around the game canvas (#game-canvas). */
const GAME_CANVAS_BORDER_COLOR = '#4a90d9';
/** Duration of the zoom transition in milliseconds. */
const TRANSITION_DURATION_MS = 1000;
/** Duration of each swirl phase in milliseconds. */
const SWIRL_PHASE_DURATION_MS = 500;
/** Fallback frame delay (ms) when requestAnimationFrame callbacks are unavailable. */
const SWIRL_FRAME_FALLBACK_MS = 16;
const SWIRL_ROTATION_FORWARD_DEG = 360;
const SWIRL_ROTATION_REVERSE_DEG = 320;
const SWIRL_MAX_SKEW_DEG = 30;
const SWIRL_STRETCH_X_FACTOR = 0.7;
const SWIRL_STRETCH_Y_FACTOR = 0.45;
const SWIRL_TRANSLATE_Y_PX = -18;
const SWIRL_MASK_GAP_BASE_DEG = 8;
const SWIRL_MASK_GAP_RANGE_DEG = 32;
const SWIRL_MASK_FILL_MIN_DEG = 5;
const SWIRL_MASK_FILL_BASE_DEG = 28;
const SWIRL_MASK_FILL_RANGE_DEG = 14;
const SWIRL_MASK_ROTATION_DEG = 420;
const SWIRL_MASK_SCALE_X_RANGE = 260;
const SWIRL_MASK_SCALE_Y_RANGE = 80;
const SWIRL_BLUR_MAX_PX = 1.4;
const SWIRL_SATURATION_REDUCTION = 0.7;
const SWIRL_CONTRAST_INCREASE = 0.45;
const SWIRL_WILL_CHANGE_PROPS =
  'transform,opacity,filter,mask-image,mask-size,-webkit-mask-image,-webkit-mask-size';

/** Screen-space rectangle (CSS pixels, relative to the viewport). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A pre-captured snapshot of the chapter map canvas used for the fade-out
 * overlay during the level transition.  Captured before {@link startLevel}
 * changes the global tile size or hides the chapter map, ensuring the
 * fade-out lines up precisely with what the player was looking at.
 */
export interface ChapterMapSnapshot {
  /** Canvas element containing a pixel copy of the chapter map grid, expanded
   *  by the CSS border width on each side so the full framing border is
   *  included without clipping. */
  canvas: HTMLCanvasElement;
  /** Viewport-relative CSS border-box rect of the original chapter map canvas
   *  (content + border).  Position the snapshot element at this rect so it
   *  overlays the original canvas exactly at the same pixel scale. */
  cssRect: { left: number; top: number; width: number; height: number };
}

/** Ease-in-out quadratic: smooth acceleration then deceleration. */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Linearly interpolate between two values. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface TransitionStyleSnapshot {
  transform: string;
  transformOrigin: string;
  opacity: string;
  filter: string;
  willChange: string;
  maskImage: string;
  maskSize: string;
  webkitMaskImage: string;
  webkitMaskSize: string;
}

function captureTransitionStyles(el: HTMLElement): TransitionStyleSnapshot {
  return {
    transform: el.style.transform,
    transformOrigin: el.style.transformOrigin,
    opacity: el.style.opacity,
    filter: el.style.filter,
    willChange: el.style.willChange,
    maskImage: el.style.maskImage,
    maskSize: el.style.maskSize,
    webkitMaskImage: el.style.webkitMaskImage,
    webkitMaskSize: el.style.webkitMaskSize,
  };
}

function restoreTransitionStyles(el: HTMLElement, snapshot: TransitionStyleSnapshot): void {
  el.style.transform = snapshot.transform;
  el.style.transformOrigin = snapshot.transformOrigin;
  el.style.opacity = snapshot.opacity;
  el.style.filter = snapshot.filter;
  el.style.willChange = snapshot.willChange;
  el.style.maskImage = snapshot.maskImage;
  el.style.maskSize = snapshot.maskSize;
  el.style.webkitMaskImage = snapshot.webkitMaskImage;
  el.style.webkitMaskSize = snapshot.webkitMaskSize;
}

function applySwirlFrame(el: HTMLElement, rawT: number, reverse: boolean): void {
  const t = easeInOutQuad(rawT);
  const collapse = reverse ? 1 - t : t;
  const scale = Math.max(0.002, 1 - 0.985 * collapse);
  const rotateDeg = reverse
    ? SWIRL_ROTATION_REVERSE_DEG * collapse
    : SWIRL_ROTATION_FORWARD_DEG * collapse;
  const skewDeg = SWIRL_MAX_SKEW_DEG * collapse;
  const stretchX = 1 + SWIRL_STRETCH_X_FACTOR * collapse;
  const stretchY = 1 - SWIRL_STRETCH_Y_FACTOR * collapse;
  const translateY = SWIRL_TRANSLATE_Y_PX * collapse;
  const opacity = reverse ? t : 1 - t;

  const sliceGapDeg = SWIRL_MASK_GAP_BASE_DEG + SWIRL_MASK_GAP_RANGE_DEG * collapse;
  const sliceFillDeg = Math.max(SWIRL_MASK_FILL_MIN_DEG, SWIRL_MASK_FILL_BASE_DEG - SWIRL_MASK_FILL_RANGE_DEG * collapse);
  const maskRotationDeg = SWIRL_MASK_ROTATION_DEG * collapse;
  const maskScaleX = 100 + SWIRL_MASK_SCALE_X_RANGE * collapse;
  const maskScaleY = 100 + SWIRL_MASK_SCALE_Y_RANGE * collapse;
  const swirlMask = `repeating-conic-gradient(from ${maskRotationDeg}deg at 50% 50%,` +
    ` rgba(0,0,0,1) 0deg ${sliceFillDeg}deg, rgba(0,0,0,1) ${sliceFillDeg}deg ${sliceFillDeg + sliceGapDeg}deg)`;

  el.style.transformOrigin = '50% 50%';
  el.style.transform =
    `translate3d(0, ${translateY}px, 0) rotate(${rotateDeg}deg) ` +
    `skew(${skewDeg}deg, ${-skewDeg * 0.5}deg) scale(${scale * stretchX}, ${scale * stretchY})`;
  el.style.opacity = `${opacity}`;
  el.style.filter =
    `blur(${SWIRL_BLUR_MAX_PX * collapse}px) ` +
    `saturate(${1 - SWIRL_SATURATION_REDUCTION * collapse}) ` +
    `contrast(${1 + SWIRL_CONTRAST_INCREASE * collapse})`;
  el.style.maskImage = swirlMask;
  el.style.webkitMaskImage = swirlMask;
  el.style.maskSize = `${maskScaleX}% ${maskScaleY}%`;
  el.style.webkitMaskSize = `${maskScaleX}% ${maskScaleY}%`;
}

function runSwirlPhase(
  el: HTMLElement,
  reverse: boolean,
  onComplete: () => void,
): void {
  const startTime = performance.now();
  const scheduleFrame = (cb: () => void): void => {
    let fired = false;
    const timeoutId = setTimeout(() => {
      if (fired) return;
      fired = true;
      cb();
    }, SWIRL_FRAME_FALLBACK_MS);
    requestAnimationFrame(() => {
      if (fired) return;
      fired = true;
      clearTimeout(timeoutId);
      cb();
    });
  };
  const tick = (): void => {
    const elapsed = performance.now() - startTime;
    const rawT = Math.min(elapsed / SWIRL_PHASE_DURATION_MS, 1);
    applySwirlFrame(el, rawT, reverse);
    if (rawT < 1) scheduleFrame(tick);
    else onComplete();
  };
  scheduleFrame(tick);
}

/**
 * Play the level-enter transition animation.
 *
 * @param minimapRect        Screen-space rect of the minimap on the chapter map.
 * @param gameCanvas         The in-game canvas element (already sized for the level).
 * @param board              The Board instance for the new level.
 * @param chapterMapSnapshot Pre-captured snapshot of the chapter map canvas, or
 *                           null if there is no chapter map to fade out.
 * @param playScreenEl       The play-screen element.
 * @param onComplete         Callback invoked when the animation finishes.
 */
export function playMapTransition(
  minimapRect: ScreenRect,
  gameCanvas: HTMLCanvasElement,
  board: Board,
  chapterMapSnapshot: ChapterMapSnapshot | null,
  playScreenEl: HTMLElement,
  onComplete: () => void,
): void {
  // ── 1. Render a snapshot of the level grid onto an offscreen canvas ──────

  const cols = board.cols;
  const rows = board.rows;
  const snapshotW = cols * TILE_SIZE;
  const snapshotH = rows * TILE_SIZE;

  const offscreen = document.createElement('canvas');
  offscreen.width = snapshotW;
  offscreen.height = snapshotH;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) {
    // Cannot render – skip transition and call completion immediately.
    onComplete();
    return;
  }

  // Render a clean board snapshot (no hover, no selection, no highlights).
  renderBoard(offCtx, offscreen, board, null, 0, null);

  // ── 2. Compute the target rect (where the game canvas content area is) ──

  const canvasRect = gameCanvas.getBoundingClientRect();
  // The game canvas has a CSS border; the content area is inset by that amount.
  const targetRect: ScreenRect = {
    x: canvasRect.left + GAME_CANVAS_BORDER_PX,
    y: canvasRect.top + GAME_CANVAS_BORDER_PX,
    width: canvasRect.width - 2 * GAME_CANVAS_BORDER_PX,
    height: canvasRect.height - 2 * GAME_CANVAS_BORDER_PX,
  };

  // ── 3. Create a fixed-position chapter-map fade overlay ──────────────────
  //
  // Instead of re-showing the live chapter map element (which risks misalignment
  // due to TILE_SIZE changes and animation-loop re-renders), we use a pre-captured
  // pixel snapshot positioned at exactly the same screen coordinates.

  let chapterMapFadeEl: HTMLElement | null = null;
  if (chapterMapSnapshot) {
    const { canvas: snapSrc, cssRect } = chapterMapSnapshot;

    // Full-screen background matching the chapter map background color.
    const fadeOverlay = document.createElement('div');
    fadeOverlay.style.cssText =
      `position:fixed;inset:0;z-index:12;pointer-events:none;background:${CHAPTER_MAP_BG};`;

    // Canvas snapshot element, positioned to match the original canvas exactly.
    const snapEl = document.createElement('canvas');
    snapEl.width  = snapSrc.width;
    snapEl.height = snapSrc.height;
    const snapCtx = snapEl.getContext('2d');
    if (snapCtx) snapCtx.drawImage(snapSrc, 0, 0);
    snapEl.style.cssText =
      `position:absolute;left:${cssRect.left}px;top:${cssRect.top}px;` +
      `width:${cssRect.width}px;height:${cssRect.height}px;`;

    fadeOverlay.appendChild(snapEl);
    document.body.appendChild(fadeOverlay);
    chapterMapFadeEl = fadeOverlay;
  }

  // ── 4. Create a fixed-position overlay to host the animating snapshot ────

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';

  // The snapshot element – starts at minimap size, ends at full game-canvas size.
  // CSS `image-rendering: auto` ensures the browser uses bilinear interpolation.
  // An outline matching the game canvas border grows with the snapshot so the
  // border appears naturally as the image scales up to full size.
  const snapshotEl = document.createElement('canvas');
  snapshotEl.width = snapshotW;
  snapshotEl.height = snapshotH;
  snapshotEl.style.cssText =
    'position:absolute;image-rendering:auto;' +
    `outline:${GAME_CANVAS_BORDER_PX}px solid ${GAME_CANVAS_BORDER_COLOR};border-radius:${RADIUS_SM};` +
    `left:${minimapRect.x}px;top:${minimapRect.y}px;` +
    `width:${minimapRect.width}px;height:${minimapRect.height}px;`;
  const snapshotCtx = snapshotEl.getContext('2d');
  if (snapshotCtx) {
    snapshotCtx.drawImage(offscreen, 0, 0);
  }
  overlay.appendChild(snapshotEl);
  document.body.appendChild(overlay);

  // ── 5. Prepare screen element styles for the animation ──────────────────

  // Hide the game canvas during the transition – it is represented by the
  // zooming snapshot, so it should not also fade in at full size.
  gameCanvas.style.visibility = 'hidden';

  // Start the play screen invisible so we can fade it in.
  playScreenEl.style.opacity = '0';

  // ── 6. Animate using requestAnimationFrame ──────────────────────────────

  const startTime = performance.now();

  function tick(): void {
    const elapsed = performance.now() - startTime;
    const rawT = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
    const t = easeInOutQuad(rawT);

    // Interpolate snapshot position & size
    const x = lerp(minimapRect.x, targetRect.x, t);
    const y = lerp(minimapRect.y, targetRect.y, t);
    const w = lerp(minimapRect.width, targetRect.width, t);
    const h = lerp(minimapRect.height, targetRect.height, t);
    snapshotEl.style.left = `${x}px`;
    snapshotEl.style.top = `${y}px`;
    snapshotEl.style.width = `${w}px`;
    snapshotEl.style.height = `${h}px`;

    // Fade chapter map snapshot out (linear)
    if (chapterMapFadeEl) chapterMapFadeEl.style.opacity = `${1 - rawT}`;

    // Fade play screen in (linear), but keep the game canvas hidden
    // until the very end so it doesn't also appear at full size during the zoom.
    playScreenEl.style.opacity = `${rawT}`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      // ── 7. Clean up and finalize ────────────────────────────────────────
      overlay.remove();
      if (chapterMapFadeEl) chapterMapFadeEl.remove();
      playScreenEl.style.opacity = '1';
      // Reveal the game canvas now that the zoomed snapshot overlay is gone.
      gameCanvas.style.visibility = '';
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Play the level-exit transition animation (reverse of {@link playLevelTransition}).
 *
 * Zooms a snapshot of the level grid from its full in-game size back down to the
 * minimap position on the chapter map, while fading the play screen out and the
 * chapter map in.
 *
 * The caller is responsible for pre-rendering the board snapshot at the game
 * TILE_SIZE **before** changing TILE_SIZE (e.g., before reshowing the chapter map).
 *
 * @param minimapRect        Screen-space rect of the minimap on the chapter map.
 * @param chapterMapScreenEl The chapter-map screen element (already shown but transparent).
 * @param gameCanvas         The in-game canvas element.
 * @param boardSnapshot      Pre-rendered offscreen canvas containing a pixel snapshot
 *                           of the level grid (rendered at the game TILE_SIZE).
 * @param playScreenEl       The play-screen element to fade out.
 * @param onComplete         Callback invoked when the animation finishes.
 */
export function playMapExitTransition(
  minimapRect: ScreenRect,
  chapterMapScreenEl: HTMLElement,
  gameCanvas: HTMLCanvasElement,
  boardSnapshot: HTMLCanvasElement,
  playScreenEl: HTMLElement,
  onComplete: () => void,
): void {
  // ── 1. Compute the start rect (game canvas content area at full size) ─────

  const canvasRect = gameCanvas.getBoundingClientRect();
  const startRect: ScreenRect = {
    x: canvasRect.left + GAME_CANVAS_BORDER_PX,
    y: canvasRect.top + GAME_CANVAS_BORDER_PX,
    width: canvasRect.width - 2 * GAME_CANVAS_BORDER_PX,
    height: canvasRect.height - 2 * GAME_CANVAS_BORDER_PX,
  };

  // ── 2. Create a fixed-position overlay hosting the animating snapshot ─────

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';

  // The snapshot starts at full game-canvas size and shrinks to minimap size.
  const snapshotEl = document.createElement('canvas');
  snapshotEl.width = boardSnapshot.width;
  snapshotEl.height = boardSnapshot.height;
  snapshotEl.style.cssText =
    'position:absolute;image-rendering:auto;' +
    `outline:${GAME_CANVAS_BORDER_PX}px solid ${GAME_CANVAS_BORDER_COLOR};border-radius:${RADIUS_SM};` +
    `left:${startRect.x}px;top:${startRect.y}px;` +
    `width:${startRect.width}px;height:${startRect.height}px;`;
  const snapshotCtx = snapshotEl.getContext('2d');
  if (snapshotCtx) snapshotCtx.drawImage(boardSnapshot, 0, 0);
  overlay.appendChild(snapshotEl);
  document.body.appendChild(overlay);

  // ── 3. Prepare screen element styles for the animation ──────────────────

  // Hide the game canvas – the zooming snapshot represents it.
  gameCanvas.style.visibility = 'hidden';

  // Play screen starts fully visible and fades out.
  playScreenEl.style.opacity = '1';

  // Chapter map starts transparent and fades in.
  chapterMapScreenEl.style.opacity = '0';

  // ── 4. Animate using requestAnimationFrame ──────────────────────────────

  const startTime = performance.now();

  function tick(): void {
    const elapsed = performance.now() - startTime;
    const rawT = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
    const t = easeInOutQuad(rawT);

    // Interpolate snapshot from game-canvas size → minimap size
    const x = lerp(startRect.x, minimapRect.x, t);
    const y = lerp(startRect.y, minimapRect.y, t);
    const w = lerp(startRect.width, minimapRect.width, t);
    const h = lerp(startRect.height, minimapRect.height, t);
    snapshotEl.style.left = `${x}px`;
    snapshotEl.style.top = `${y}px`;
    snapshotEl.style.width = `${w}px`;
    snapshotEl.style.height = `${h}px`;

    // Fade play screen out (linear)
    playScreenEl.style.opacity = `${1 - rawT}`;

    // Fade chapter map in (linear)
    chapterMapScreenEl.style.opacity = `${rawT}`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      // ── 5. Clean up and finalize ────────────────────────────────────────
      overlay.remove();
      playScreenEl.style.opacity = '';
      chapterMapScreenEl.style.opacity = '';
      gameCanvas.style.visibility = '';
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Play a generic map-to-map zoom-out transition using a pre-captured canvas snapshot.
 *
 * Zooms `fromSnapshot` from its captured CSS rect down to `targetRect` while
 * fading `fromScreenEl` out and `toScreenEl` in.
 */
export function playMapScreenExitTransition(
  targetRect: ScreenRect,
  fromSnapshot: ChapterMapSnapshot,
  fromScreenEl: HTMLElement,
  toScreenEl: HTMLElement,
  onComplete: () => void,
): void {
  const startRect: ScreenRect = {
    x: fromSnapshot.cssRect.left,
    y: fromSnapshot.cssRect.top,
    width: fromSnapshot.cssRect.width,
    height: fromSnapshot.cssRect.height,
  };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';

  const snapshotEl = document.createElement('canvas');
  snapshotEl.width = fromSnapshot.canvas.width;
  snapshotEl.height = fromSnapshot.canvas.height;
  snapshotEl.style.cssText =
    'position:absolute;image-rendering:auto;' +
    `left:${startRect.x}px;top:${startRect.y}px;` +
    `width:${startRect.width}px;height:${startRect.height}px;`;
  const snapshotCtx = snapshotEl.getContext('2d');
  if (snapshotCtx) snapshotCtx.drawImage(fromSnapshot.canvas, 0, 0);
  overlay.appendChild(snapshotEl);
  document.body.appendChild(overlay);

  const originalFromScreenVisibility = fromScreenEl.style.visibility;
  const originalToScreenVisibility = toScreenEl.style.visibility;
  fromScreenEl.style.opacity = '1';
  fromScreenEl.style.visibility = 'hidden';
  toScreenEl.style.opacity = '0';
  // Keep the live destination map hidden during the zoom so any concurrent
  // TILE_SIZE recalculation (e.g. resize/repopulate) cannot appear mid-animation.
  toScreenEl.style.visibility = 'hidden';

  const startTime = performance.now();

  function tick(): void {
    const elapsed = performance.now() - startTime;
    const rawT = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
    const t = easeInOutQuad(rawT);

    const x = lerp(startRect.x, targetRect.x, t);
    const y = lerp(startRect.y, targetRect.y, t);
    const w = lerp(startRect.width, targetRect.width, t);
    const h = lerp(startRect.height, targetRect.height, t);
    snapshotEl.style.left = `${x}px`;
    snapshotEl.style.top = `${y}px`;
    snapshotEl.style.width = `${w}px`;
    snapshotEl.style.height = `${h}px`;

    fromScreenEl.style.opacity = `${1 - rawT}`;
    toScreenEl.style.opacity = `${rawT}`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      overlay.remove();
      fromScreenEl.style.opacity = '';
      fromScreenEl.style.visibility = originalFromScreenVisibility;
      toScreenEl.style.visibility = originalToScreenVisibility;
      toScreenEl.style.opacity = '';
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Play a generic map-to-map zoom-in transition using a pre-captured destination map snapshot.
 *
 * Zooms the destination snapshot from `startRect` up to its captured CSS rect while
 * fading `fromScreenEl` out and `toScreenEl` in.
 */
export function playMapScreenEnterTransition(
  startRect: ScreenRect,
  toSnapshot: ChapterMapSnapshot,
  fromScreenEl: HTMLElement,
  toScreenEl: HTMLElement,
  onComplete: () => void,
): void {
  const targetRect: ScreenRect = {
    x: toSnapshot.cssRect.left,
    y: toSnapshot.cssRect.top,
    width: toSnapshot.cssRect.width,
    height: toSnapshot.cssRect.height,
  };

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';

  const snapshotEl = document.createElement('canvas');
  snapshotEl.width = toSnapshot.canvas.width;
  snapshotEl.height = toSnapshot.canvas.height;
  snapshotEl.style.cssText =
    'position:absolute;image-rendering:auto;' +
    `left:${startRect.x}px;top:${startRect.y}px;` +
    `width:${startRect.width}px;height:${startRect.height}px;`;
  const snapshotCtx = snapshotEl.getContext('2d');
  if (snapshotCtx) snapshotCtx.drawImage(toSnapshot.canvas, 0, 0);
  overlay.appendChild(snapshotEl);
  document.body.appendChild(overlay);

  fromScreenEl.style.opacity = '1';
  toScreenEl.style.opacity = '0';

  const startTime = performance.now();

  function tick(): void {
    const elapsed = performance.now() - startTime;
    const rawT = Math.min(elapsed / TRANSITION_DURATION_MS, 1);
    const t = easeInOutQuad(rawT);

    const x = lerp(startRect.x, targetRect.x, t);
    const y = lerp(startRect.y, targetRect.y, t);
    const w = lerp(startRect.width, targetRect.width, t);
    const h = lerp(startRect.height, targetRect.height, t);
    snapshotEl.style.left = `${x}px`;
    snapshotEl.style.top = `${y}px`;
    snapshotEl.style.width = `${w}px`;
    snapshotEl.style.height = `${h}px`;

    fromScreenEl.style.opacity = `${1 - rawT}`;
    toScreenEl.style.opacity = `${rawT}`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      overlay.remove();
      fromScreenEl.style.opacity = '';
      toScreenEl.style.opacity = '';
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

/**
 * Play a full-screen swirl-to-black transition, then reverse it into the destination screen.
 * During the transition, a full-screen blocker prevents all UI interaction.
 */
export function playSwirlScreenTransition(
  fromScreenEl: HTMLElement,
  showDestination: () => HTMLElement | null,
  onComplete: () => void,
): void {
  const blocker = document.createElement('div');
  blocker.dataset.transitionBlocker = 'true';
  blocker.style.cssText = 'position:fixed;inset:0;z-index:400;background:transparent;pointer-events:auto;';
  document.body.appendChild(blocker);

  const fromSnapshot = captureTransitionStyles(fromScreenEl);
  fromScreenEl.style.willChange = SWIRL_WILL_CHANGE_PROPS;

  runSwirlPhase(fromScreenEl, false, () => {
    restoreTransitionStyles(fromScreenEl, fromSnapshot);

    const toScreenEl = showDestination();
    if (!toScreenEl) {
      blocker.remove();
      onComplete();
      return;
    }

    const toSnapshot = captureTransitionStyles(toScreenEl);
    toScreenEl.style.visibility = 'hidden';
    toScreenEl.style.willChange = SWIRL_WILL_CHANGE_PROPS;
    applySwirlFrame(toScreenEl, 0, true);

    requestAnimationFrame(() => {
      toScreenEl.style.visibility = '';
      runSwirlPhase(toScreenEl, true, () => {
        restoreTransitionStyles(toScreenEl, toSnapshot);
        blocker.remove();
        onComplete();
      });
    });
  });
}

// Backward-compatible aliases.
export const playLevelTransition = playMapTransition;
export const playLevelExitTransition = playMapExitTransition;
