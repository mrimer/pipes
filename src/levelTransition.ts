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
import { GridPos } from './types';

/** Width (px) of the CSS border around the game canvas (#game-canvas). */
const GAME_CANVAS_BORDER_PX = 3;
/** Duration of the zoom transition in milliseconds. */
const TRANSITION_DURATION_MS = 1000;

/** Screen-space rectangle (CSS pixels, relative to the viewport). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ease-in-out quadratic: smooth acceleration then deceleration. */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Linearly interpolate between two values. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Play the level-enter transition animation.
 *
 * @param minimapRect   Screen-space rect of the minimap on the chapter map.
 * @param gameCanvas    The in-game canvas element (already sized for the level).
 * @param board         The Board instance for the new level.
 * @param chapterMapEl  The chapter-map screen overlay element.
 * @param playScreenEl  The play-screen element.
 * @param onComplete    Callback invoked when the animation finishes.
 */
export function playLevelTransition(
  minimapRect: ScreenRect,
  gameCanvas: HTMLCanvasElement,
  board: Board,
  chapterMapEl: HTMLElement,
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
  const defaultFocus: GridPos = { ...board.source };
  renderBoard(offCtx, offscreen, board, defaultFocus, null, 0, null);

  // ── 2. Compute the target rect (where the game canvas content area is) ──

  const canvasRect = gameCanvas.getBoundingClientRect();
  // The game canvas has a CSS border; the content area is inset by that amount.
  const targetRect: ScreenRect = {
    x: canvasRect.left + GAME_CANVAS_BORDER_PX,
    y: canvasRect.top + GAME_CANVAS_BORDER_PX,
    width: canvasRect.width - 2 * GAME_CANVAS_BORDER_PX,
    height: canvasRect.height - 2 * GAME_CANVAS_BORDER_PX,
  };

  // ── 3. Create a fixed-position overlay to host the animating snapshot ────

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;';

  // The snapshot element – starts at minimap size, ends at full game-canvas size.
  // CSS `image-rendering: auto` ensures the browser uses bilinear interpolation.
  const snapshotEl = document.createElement('canvas');
  snapshotEl.width = snapshotW;
  snapshotEl.height = snapshotH;
  snapshotEl.style.cssText =
    'position:absolute;image-rendering:auto;' +
    `left:${minimapRect.x}px;top:${minimapRect.y}px;` +
    `width:${minimapRect.width}px;height:${minimapRect.height}px;`;
  const snapshotCtx = snapshotEl.getContext('2d');
  if (snapshotCtx) {
    snapshotCtx.drawImage(offscreen, 0, 0);
  }
  overlay.appendChild(snapshotEl);
  document.body.appendChild(overlay);

  // ── 4. Prepare screen element styles for the animation ──────────────────

  // Re-show the chapter map element (it was hidden by _enterPlayScreenState)
  // so we can fade it out during the transition.
  chapterMapEl.style.display = 'flex';
  chapterMapEl.style.opacity = '1';

  // Start the play screen invisible so we can fade it in.
  playScreenEl.style.opacity = '0';

  // ── 5. Animate using requestAnimationFrame ──────────────────────────────

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

    // Fade chapter map out (linear)
    chapterMapEl.style.opacity = `${1 - rawT}`;

    // Fade play screen in (linear)
    playScreenEl.style.opacity = `${rawT}`;

    if (rawT < 1) {
      requestAnimationFrame(tick);
    } else {
      // ── 6. Clean up and finalize ────────────────────────────────────────
      overlay.remove();
      chapterMapEl.style.display = 'none';
      chapterMapEl.style.opacity = '1';
      playScreenEl.style.opacity = '1';
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}
