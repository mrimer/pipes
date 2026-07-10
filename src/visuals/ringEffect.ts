/**
 * Shrinking concentric ring visual effect.
 *
 * A single colored ring starts with a radius just large enough to be entirely
 * outside the board grid display, then rapidly contracts to zero.  The effect
 * is rendered on a fixed-position full-viewport overlay canvas so it can
 * extend beyond the boundaries of the board canvas.
 */

import { TILE_SIZE, LINE_WIDTH } from '../renderer';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single shrinking-ring animation instance. */
interface RingAnim {
  /** Viewport pixel X of the ring center. */
  cx: number;
  /** Viewport pixel Y of the ring center. */
  cy: number;
  /** CSS color string for the ring stroke. */
  color: string;
  /** Starting outer radius in viewport pixels. */
  startRadius: number;
  /** Stroke width of the ring in viewport pixels (≈ half a pipe width). */
  ringWidth: number;
  /** `performance.now()` timestamp when this animation started. */
  startTime: number;
  /** Total duration in milliseconds. */
  duration: number;
  /** Called once when the animation completes. */
  onComplete?: () => void;
}

/** A single outward echo-ring + particle burst spawned when an inward ring arrives. */
interface EchoAnim {
  cx: number;
  cy: number;
  /** Ring stroke color (matches the inward ring). */
  ringColor: string;
  startTime: number;
}

// ── Module state ──────────────────────────────────────────────────────────────

let _rings: RingAnim[] = [];
let _echos: EchoAnim[] = [];
let _animId: number | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
let _resizeListenerAdded = false;

/** Total ring animation duration in milliseconds. */
const RING_DURATION = 700;
/** Duration of the outward echo ring + particle burst (ms). */
const ECHO_DURATION = 520;
/** Max radius the echo ring expands to (canvas pixels). */
const ECHO_MAX_RADIUS = TILE_SIZE * 1.4;
/** Particle travel distance from tile center (canvas pixels). */
const ECHO_PARTICLE_REACH = TILE_SIZE * 1.2;
const ECHO_PARTICLE_COUNT = 12;
const ECHO_PARTICLE_COLOR = '#5ab4e8';

// ── Canvas management ─────────────────────────────────────────────────────────

function _resizeCanvas(): void {
  if (!_canvas) return;
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
}

function _ensureCanvas(): void {
  if (_canvas) return;
  _canvas = document.createElement('canvas');
  _canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9997;';
  document.body.appendChild(_canvas);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always non-null on a freshly created HTMLCanvasElement in a browser context
  _ctx = _canvas.getContext('2d')!;
  _resizeCanvas();
  if (!_resizeListenerAdded) {
    window.addEventListener('resize', _resizeCanvas);
    _resizeListenerAdded = true;
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────

function _tick(): void {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  const now = performance.now();
  let i = 0;
  while (i < _rings.length) {
    const ring = _rings[i];
    const elapsed = now - ring.startTime;
    if (elapsed >= ring.duration) {
      _rings.splice(i, 1);
      ring.onComplete?.();
      continue;
    }
    const progress = elapsed / ring.duration;
    // Ring radius shrinks linearly from startRadius to 0.
    const radius = ring.startRadius * (1 - progress);
    // Fade out smoothly in the last 30% of the animation.
    const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;

    _ctx.save();
    _ctx.globalAlpha = alpha;
    _ctx.strokeStyle = ring.color;
    _ctx.lineWidth = ring.ringWidth;
    _ctx.beginPath();
    _ctx.arc(ring.cx, ring.cy, Math.max(0, radius), 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.restore();

    i++;
  }

  // Draw echo rings and impact particles.
  let j = 0;
  while (j < _echos.length) {
    const echo = _echos[j];
    const elapsed = now - echo.startTime;
    if (elapsed >= ECHO_DURATION) {
      _echos.splice(j, 1);
      continue;
    }
    const t = elapsed / ECHO_DURATION;
    // Echo expands quickly and fades — ease-out so it reads as a "snap."
    const eased = 1 - (1 - t) * (1 - t);
    const radius = ECHO_MAX_RADIUS * eased;
    // Hold at full opacity for the first 30%, then fade out.
    const alpha = t < 0.3 ? 0.92 : 0.92 * (1 - (t - 0.3) / 0.7);

    _ctx.save();
    _ctx.globalAlpha = alpha;

    // Expanding ring stroke (full pipe width for visibility).
    _ctx.strokeStyle = echo.ringColor;
    _ctx.lineWidth = LINE_WIDTH;
    _ctx.beginPath();
    _ctx.arc(echo.cx, echo.cy, Math.max(0.5, radius), 0, Math.PI * 2);
    _ctx.stroke();

    // Radial particle dots.
    _ctx.fillStyle = ECHO_PARTICLE_COLOR;
    const particleR = Math.max(0.5, 4.5 * (1 - t * 0.55));
    for (let p = 0; p < ECHO_PARTICLE_COUNT; p++) {
      const angle = (p / ECHO_PARTICLE_COUNT) * Math.PI * 2;
      const dist = ECHO_PARTICLE_REACH * eased;
      _ctx.beginPath();
      _ctx.arc(echo.cx + dist * Math.cos(angle), echo.cy + dist * Math.sin(angle), particleR, 0, Math.PI * 2);
      _ctx.fill();
    }

    _ctx.restore();
    j++;
  }

  if (_rings.length > 0 || _echos.length > 0) {
    _animId = requestAnimationFrame(_tick);
  } else {
    _animId = null;
    if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Spawn a shrinking ring effect centered on the given grid tile.
 *
 * The ring starts just outside the visible board area and contracts to zero.
 *
 * @param boardCanvas  The game board canvas element (used to convert grid
 *                     coordinates to viewport pixel coordinates).
 * @param col          Column index of the center tile (0-based).
 * @param row          Row index of the center tile (0-based).
 * @param gridCols     Total number of columns in the grid.
 * @param gridRows     Total number of rows in the grid.
 * @param color        CSS color string for the ring stroke.
 * @param onComplete   Optional callback invoked when the animation finishes.
 */
export function spawnRingEffect(
  boardCanvas: HTMLCanvasElement,
  col: number,
  row: number,
  gridCols: number,
  gridRows: number,
  color: string,
  onComplete?: () => void,
): void {
  _ensureCanvas();

  const rect = boardCanvas.getBoundingClientRect();
  // Tile center in viewport coordinates.
  const cx = rect.left + (col + 0.5) * TILE_SIZE;
  const cy = rect.top  + (row + 0.5) * TILE_SIZE;

  // Compute the farthest distance from the tile center to any corner of the
  // grid, so the ring starts completely outside the visible board area.
  const gridRight  = rect.left + gridCols * TILE_SIZE;
  const gridBottom = rect.top  + gridRows * TILE_SIZE;
  const corners: [number, number][] = [
    [rect.left,  rect.top],
    [gridRight,  rect.top],
    [rect.left,  gridBottom],
    [gridRight,  gridBottom],
  ];
  const ringWidth = LINE_WIDTH / 2;
  const maxDist = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  // Add half the ring width so the outer edge of the ring is outside the grid.
  const startRadius = maxDist + ringWidth / 2;

  const anim: RingAnim = {
    cx, cy, color,
    startRadius,
    ringWidth,
    startTime: performance.now(),
    duration: RING_DURATION,
    onComplete,
  };
  _rings.push(anim);

  if (_animId === null) {
    _animId = requestAnimationFrame(_tick);
  }
}

/**
 * Spawn an outward echo ring + radial particle burst centered on the given
 * grid tile.  Call this from the `onComplete` of a shrinking ring to create
 * a satisfying "arrival impact" at the moment the inward ring collapses.
 */
export function spawnEchoEffect(
  boardCanvas: HTMLCanvasElement,
  col: number,
  row: number,
  ringColor: string,
): void {
  _ensureCanvas();
  const rect = boardCanvas.getBoundingClientRect();
  const cx = rect.left + (col + 0.5) * TILE_SIZE;
  const cy = rect.top  + (row + 0.5) * TILE_SIZE;
  _echos.push({ cx, cy, ringColor, startTime: performance.now() });
  if (_animId === null) {
    _animId = requestAnimationFrame(_tick);
  }
}

/** Stop all ring and echo animations and clear the overlay canvas. */
export function clearRingEffects(): void {
  _rings = [];
  _echos = [];
  if (_animId !== null) {
    cancelAnimationFrame(_animId);
    _animId = null;
  }
  if (_canvas && _ctx) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }
}
