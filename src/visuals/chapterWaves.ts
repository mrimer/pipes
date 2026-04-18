import { UI_BG } from '../uiConstants';
/**
 * Water-wave ripple animation for chapter-box headers on the level-select screen.
 *
 * When the mouse hovers over a chapter header, an animated top-down water-tank
 * view is rendered behind the header text.  Multiple plane waves propagate at
 * different angles and interfere with each other, creating the appearance of
 * waves sloshing around and reflecting off the walls of the box.
 *
 * Blue palette  → normal / in-progress chapters.
 * Gold palette  → fully-completed chapters rendered in gold.
 */

/** A single propagating plane wave. */
interface Wave {
  /** Propagation direction in radians (0 = rightward, π/2 = downward). */
  angle: number;
  /** Spatial frequency in radians per pixel. */
  freq: number;
  /** Temporal speed in radians per millisecond. */
  speed: number;
  /** Static phase offset in radians. */
  offset: number;
}

/**
 * The wave field is sampled on a grid WAVE_SCALE times coarser than the canvas
 * and then scaled up with smoothing.  This keeps CPU cost very low while
 * producing a soft, blurry water look.
 */
const WAVE_SCALE = 8;

/**
 * Build four plane waves at varied angles and frequencies.  The four angles are
 * chosen to be roughly 45 ° apart, so the interference pattern has both
 * horizontal-band and diagonal-band components — resembling waves reflecting
 * off the four walls of a rectangular tank.
 *
 * Using fixed values (no Math.random) keeps behavior deterministic and avoids
 * re-spawning different waves each time the level list is rebuilt.
 */
function _buildWaves(): Wave[] {
  return [
    // ~30° – mostly rightward, slight downward drift.
    { angle: 0.52,  freq: 0.038, speed: 0.0013, offset: 0.00 },
    // ~120° – travels upper-left, creating right-side reflection feel.
    { angle: 2.09,  freq: 0.032, speed: 0.0010, offset: 1.57 },
    // ~60° – diagonal lower-right.
    { angle: 1.05,  freq: 0.028, speed: 0.0016, offset: 3.14 },
    // ~180° – nearly horizontal left, creates left-wall reflection feel.
    { angle: 3.14,  freq: 0.044, speed: 0.0008, offset: 4.71 },
  ];
}

/** Linearly interpolate two RGB color tuples by factor `t` ∈ [0, 1]. */
function _lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Map a normalized wave-height value in [−1, +1] to an RGB color triple.
 *
 * Blue palette  (isGold = false):  dark navy → ocean blue → bright sky-blue.
 * Gold palette  (isGold = true):   dark amber → warm gold → bright sunlit gold.
 *
 * The three-stop gradient gives the appearance of deep-water shadows, a midwater
 * surface, and sunlit crests.
 */
export function _heightToRgb(h: number, isGold: boolean): [number, number, number] {
  const t = (h + 1) * 0.5; // remap [−1,+1] → [0,1]
  if (isGold) {
    const lo: readonly [number, number, number] = [ 45,  25,   0];
    const mi: readonly [number, number, number] = [145,  95,  12];
    const hi: readonly [number, number, number] = [250, 215,  80];
    return t < 0.5 ? _lerpRgb(lo, mi, t * 2) : _lerpRgb(mi, hi, (t - 0.5) * 2);
  }
  const lo: readonly [number, number, number] = [  8,  32,  95];
  const mi: readonly [number, number, number] = [ 22,  90, 175];
  const hi: readonly [number, number, number] = [ 75, 190, 248];
  return t < 0.5 ? _lerpRgb(lo, mi, t * 2) : _lerpRgb(mi, hi, (t - 0.5) * 2);
}

/**
 * Mutable holder for the low-resolution offscreen canvas reused across frames.
 * Passed by reference so {@link _renderWaveFrame} can (re-)create it when the
 * element size changes.
 */
interface OffscreenState {
  el:  HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

/**
 * Render one wave animation frame onto `canvas`.
 *
 * This is the shared pixel-computation kernel used by both
 * {@link attachChapterWaveAnimation} and {@link attachInventoryWaveAnimation}.
 *
 * @param ts     `requestAnimationFrame` timestamp in milliseconds.
 * @param canvas The display canvas to draw into.
 * @param el     The element whose offsetWidth/offsetHeight give the target size.
 * @param waves  The array of plane waves to superimpose.
 * @param isGold `true` → gold color palette; `false` → blue palette.
 * @param off    Mutable offscreen-canvas state (updated in-place when resized).
 * @returns `'stop'` – canvas detached, caller should cancel the loop.
 *          `'skip'` – element is zero-sized or no 2-D context; reschedule only.
 *          `'ok'`   – frame painted successfully; reschedule.
 */
function _renderWaveFrame(
  ts: number,
  canvas: HTMLCanvasElement,
  el: HTMLElement,
  waves: Wave[],
  isGold: boolean,
  off: OffscreenState,
): 'stop' | 'skip' | 'ok' {
  if (!document.contains(canvas)) return 'stop';

  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (w === 0 || h === 0) return 'skip';

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }

  // Dimensions of the low-resolution sampling grid.
  const sw = Math.max(1, Math.ceil(w / WAVE_SCALE));
  const sh = Math.max(1, Math.ceil(h / WAVE_SCALE));

  // (Re-)create the offscreen canvas only when the grid size changes.
  if (!off.el || off.el.width !== sw || off.el.height !== sh) {
    off.el = document.createElement('canvas');
    off.el.width  = sw;
    off.el.height = sh;
    off.ctx = off.el.getContext('2d');
  }
  if (!off.ctx) return 'skip';

  // ── Pixel computation ─────────────────────────────────────────────────────
  const imgData = off.ctx.createImageData(sw, sh);
  const pixels  = imgData.data;
  const n       = waves.length;

  // Pre-compute per-wave direction cosines and current phase.
  const cosA = new Float32Array(n);
  const sinA = new Float32Array(n);
  const phi  = new Float32Array(n);
  for (let wi = 0; wi < n; wi++) {
    cosA[wi] = Math.cos(waves[wi].angle);
    sinA[wi] = Math.sin(waves[wi].angle);
    phi[wi]  = waves[wi].offset + waves[wi].speed * ts;
  }

  for (let py = 0; py < sh; py++) {
    // Sample at the center of each low-res cell.
    const y = (py + 0.5) * WAVE_SCALE;
    for (let px = 0; px < sw; px++) {
      const x = (px + 0.5) * WAVE_SCALE;

      // Accumulate contributions from all plane waves.
      let hVal = 0;
      for (let wi = 0; wi < n; wi++) {
        hVal += Math.sin(
          (x * cosA[wi] + y * sinA[wi]) * waves[wi].freq + phi[wi],
        );
      }
      hVal /= n; // normalize to [−1, +1]

      const [r, g, b] = _heightToRgb(hVal, isGold);
      const i = (py * sw + px) << 2; // × 4
      pixels[i]     = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255; // fully opaque
    }
  }

  off.ctx.putImageData(imgData, 0, 0);

  // Scale the low-res image up to fill the display canvas with bilinear smoothing.
  const ctx = canvas.getContext('2d');
  if (!ctx) return 'skip';
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off.el, 0, 0, w, h);

  return 'ok';
}

/**
 * Attach a water-wave background animation to a chapter header element.
 *
 * A `<canvas>` is appended as the last child of `headerEl` and positioned
 * absolutely to fill it (inset:0, z-index:-1).  The header is given
 * `z-index:0` to form a local stacking context, ensuring the canvas paints
 * behind the text content (which has z-index:auto) but above the parent's
 * background.  The header's own background is removed so the canvas is the
 * sole provider of the background color.
 *
 * The animation loop starts on `mouseenter` and stops on `mouseleave`.  While
 * idle, the canvas displays the static background color so the header looks
 * identical to its original appearance.
 *
 * @param headerEl  The element that receives the animated canvas as a child.
 * @param isGold    `true` when the chapter is fully completed (gold color scheme).
 * @param triggerEl Optional element whose hover events start/stop the animation.
 *                  Defaults to `headerEl` when omitted.
 */
export function attachChapterWaveAnimation(headerEl: HTMLElement, isGold: boolean, triggerEl?: HTMLElement): void {
  const hoverEl = triggerEl ?? headerEl;
  // The background color shown while the animation is not running.
  const staticBg = isGold ? '#1e1800' : UI_BG;
  const idleAlpha = 0.5;
  const hoverAlpha = 0.7;

  // ── Canvas setup ────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;' +
    `pointer-events:none;border-radius:inherit;z-index:-1;opacity:${idleAlpha};` +
    'transition:opacity 120ms ease-out;';

  // position:relative + z-index:0 creates a stacking context so that the
  // canvas's z-index:-1 places it behind the header's inline content (tier 7
  // of the stacking context painting order) while staying visible above the
  // parent element's background.
  headerEl.style.position = 'relative';
  headerEl.style.zIndex = '0';
  // Remove the static background so the canvas provides it instead.
  headerEl.style.background = 'transparent';

  // Append as the LAST child so existing children (e.g. the title <span>)
  // retain their :first-child relationship and are unaffected by the canvas.
  headerEl.appendChild(canvas);

  const waves = _buildWaves();
  let animId: number | null = null;

  // Low-resolution offscreen canvas reused across frames when the size is stable.
  const off: OffscreenState = { el: null, ctx: null };

  // ── Static background helper ────────────────────────────────────────────────
  /** Paint the idle background color onto the canvas (used before and after animation). */
  function _drawStatic(): void {
    const w = headerEl.offsetWidth;
    const h = headerEl.offsetHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = staticBg;
    ctx.fillRect(0, 0, w, h);
  }

  // Paint the static background after the first layout pass.
  requestAnimationFrame(_drawStatic);

  // ── Animation frame ─────────────────────────────────────────────────────────
  function _frame(ts: number): void {
    const result = _renderWaveFrame(ts, canvas, headerEl, waves, isGold, off);
    if (result === 'stop') { animId = null; return; }
    animId = requestAnimationFrame(_frame);
  }

  // ── Hover handlers ──────────────────────────────────────────────────────────
  hoverEl.addEventListener('mouseenter', () => {
    canvas.style.opacity = String(hoverAlpha);
    if (animId === null) {
      animId = requestAnimationFrame(_frame);
    }
  });

  hoverEl.addEventListener('mouseleave', () => {
    canvas.style.opacity = String(idleAlpha);
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    // Restore the static background so the header looks the same as before hover.
    _drawStatic();
  });
}

/**
 * Attach a persistent water-wave background animation to the in-game inventory
 * box.
 *
 * A `<canvas>` is appended as the last child of `el` and positioned absolutely
 * to fill it (inset:0, z-index:-1, opacity:0.4).  The element is given
 * `position:relative; z-index:0` to form a local stacking context, ensuring the
 * canvas paints behind the box's text content while staying above the element's
 * own CSS background.  The existing CSS background is preserved so the faint
 * wave overlay blends with it.
 *
 * The animation runs continuously (no hover trigger).
 *
 * @param el  The element that receives the animated canvas as a child.
 */
export function attachInventoryWaveAnimation(el: HTMLElement): void {
  // ── Canvas setup ────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;' +
    'pointer-events:none;border-radius:inherit;z-index:-1;opacity:0.4;';

  el.style.position = 'relative';
  el.style.zIndex = '0';

  el.appendChild(canvas);

  const waves = _buildWaves();
  const off: OffscreenState = { el: null, ctx: null };

  // ── Animation frame ─────────────────────────────────────────────────────────
  function _frame(ts: number): void {
    const result = _renderWaveFrame(ts, canvas, el, waves, false, off);
    if (result === 'stop') { return; }
    requestAnimationFrame(_frame);
  }

  // Start the animation immediately.
  requestAnimationFrame(_frame);
}
