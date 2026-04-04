/** Golden sparkle particle effect for star tile connections and win modal. */

interface StarSparkleParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half-size of the 4-point star shape in pixels. */
  size: number;
  /**
   * When set, the particle is a stationary twinkle: `size` is animated from 0
   * up to `maxSize` and back to 0 over the particle's lifetime (a pulse).
   * When undefined, the particle is a flying sparkle that fades out.
   */
  maxSize?: number;
  alpha: number;
  startTime: number;
  duration: number;
  rotation: number;
  rotSpeed: number;
  color: string;
}

const SPARKLE_COLORS = [
  '#ffd700', '#ffe866', '#ffec8b', '#ffc200', '#fff0a0', '#f0c040',
];

let _particles: StarSparkleParticle[] = [];
let _animId: number | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
/** Timestamp (from `requestAnimationFrame`) of the previous tick, used for frame-rate-independent motion. */
let _lastTickTime: number | null = null;
let _resizeListenerAdded = false;

function _resizeCanvas(): void {
  if (!_canvas) return;
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
}

function _ensureCanvas(): void {
  if (_canvas) return;
  _canvas = document.createElement('canvas');
  _canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9998;';
  document.body.appendChild(_canvas);
  _ctx = _canvas.getContext('2d')!;
  _resizeCanvas();
  if (!_resizeListenerAdded) {
    window.addEventListener('resize', _resizeCanvas);
    _resizeListenerAdded = true;
  }
}

/**
 * Draw a 4-point star (diamond cross) centered at the origin.
 * `size` is the distance from center to the tip of each point.
 */
function _drawStarShape(ctx: CanvasRenderingContext2D, size: number): void {
  const inner = size * 0.25;
  ctx.beginPath();
  // Top
  ctx.moveTo(0, -size);
  ctx.lineTo(inner, -inner);
  // Right
  ctx.lineTo(size, 0);
  ctx.lineTo(inner, inner);
  // Bottom
  ctx.lineTo(0, size);
  ctx.lineTo(-inner, inner);
  // Left
  ctx.lineTo(-size, 0);
  ctx.lineTo(-inner, -inner);
  ctx.closePath();
  ctx.fill();
}

/**
 * Spawn a burst of sparkle particles centered at the given viewport-pixel coordinates.
 *
 * @param x      Viewport X (e.g. from `getBoundingClientRect().left + cx`).
 * @param y      Viewport Y.
 * @param count  Number of particles to emit (default 24).
 * @param colors Optional array of CSS color strings to use instead of the default gold palette.
 */
export function spawnStarSparkles(x: number, y: number, count = 24, colors?: readonly string[]): void {
  _ensureCanvas();
  const palette = colors ?? SPARKLE_COLORS;
  const now = performance.now();
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 40 + Math.random() * 80;
    _particles.push({
      x,
      y,
      vx:        Math.cos(angle) * speed,
      vy:        Math.sin(angle) * speed,
      size:      3 + Math.random() * 5,
      alpha:     1,
      startTime: now,
      duration:  500 + Math.random() * 500,
      rotation:  Math.random() * Math.PI * 2,
      rotSpeed:  (Math.random() - 0.5) * 0.3,
      color:     palette[Math.floor(Math.random() * palette.length)],
    });
  }
  if (_animId === null) {
    _lastTickTime = null;
    _animId = requestAnimationFrame(_tick);
  }
}

function _tick(timestamp: number): void {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  // Compute frame-rate-independent delta time, capped at 100ms to avoid
  // large jumps after the tab is hidden and then shown again.
  const dt = Math.min((_lastTickTime !== null ? timestamp - _lastTickTime : 16), 100) / 1000;
  _lastTickTime = timestamp;

  const now = performance.now();
  let i = 0;
  while (i < _particles.length) {
    const p = _particles[i];
    const elapsed = now - p.startTime;
    if (elapsed >= p.duration) {
      _particles.splice(i, 1);
      continue;
    }
    const progress = elapsed / p.duration;
    if (p.maxSize !== undefined) {
      // Twinkle mode: stationary, scale up then back down (sine pulse).
      p.size = p.maxSize * Math.sin(progress * Math.PI);
      p.alpha = 1;
    } else {
      // Sparkle mode: flying particle that fades out.
      p.alpha = 1 - progress;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Slight upward drift for a magical float
      p.vy -= 30 * dt;
    }
    p.rotation += p.rotSpeed;

    const ctx = _ctx;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    _drawStarShape(ctx, p.size);
    ctx.restore();
    i++;
  }

  if (_particles.length > 0) {
    _animId = requestAnimationFrame(_tick);
  } else {
    _animId = null;
    _lastTickTime = null;
  }
}

/**
 * Spawn a single stationary twinkle star at the given viewport-pixel coordinates.
 *
 * The star scales up from nothing to full size and back to nothing over its
 * brief lifetime (a pulse), optionally rotating.  Unlike {@link spawnStarSparkles},
 * the particle does not move.
 *
 * @param x      Viewport X.
 * @param y      Viewport Y.
 * @param colors Optional array of CSS color strings to use instead of the default gold palette.
 */
export function spawnStarTwinkle(x: number, y: number, colors?: readonly string[]): void {
  _ensureCanvas();
  const palette = colors ?? SPARKLE_COLORS;
  const now = performance.now();
  const maxSize = 6 + Math.random() * 6;
  const shouldRotate = Math.random() < 0.5;
  _particles.push({
    x,
    y,
    vx:        0,
    vy:        0,
    size:      0,
    maxSize,
    alpha:     1,
    startTime: now,
    duration:  400 + Math.random() * 300,
    rotation:  Math.random() * Math.PI * 2,
    rotSpeed:  shouldRotate ? (Math.random() - 0.5) * 0.15 : 0,
    color:     palette[Math.floor(Math.random() * palette.length)],
  });
  if (_animId === null) {
    _lastTickTime = null;
    _animId = requestAnimationFrame(_tick);
  }
}

/** Stop any running sparkle animation and clear the canvas. */
export function clearStarSparkles(): void {
  _particles = [];
  if (_animId !== null) {
    cancelAnimationFrame(_animId);
    _animId = null;
  }
  _lastTickTime = null;
  if (_canvas && _ctx) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }
}
