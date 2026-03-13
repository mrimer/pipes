/** Confetti particle system for win celebrations. */

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  w: number;
  h: number;
  color: string;
  shape: 0 | 1 | 2; // 0 = rect, 1 = ellipse, 2 = triangle
  alpha: number;
  startTime: number;
  duration: number;
}

const CONFETTI_COLORS = [
  '#ffd700', '#ff4444', '#44aaff', '#44dd77',
  '#ff88ff', '#ff8844', '#88ffff', '#ffffff',
];

let _particles: ConfettiParticle[] = [];
let _animId: number | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
let _onComplete: (() => void) | null = null;

function _resizeCanvas(): void {
  if (!_canvas) return;
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
}

function _ensureCanvas(): void {
  if (_canvas) return;
  _canvas = document.createElement('canvas');
  _canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:9999;';
  document.body.appendChild(_canvas);
  _ctx = _canvas.getContext('2d')!;
  _resizeCanvas();
  window.addEventListener('resize', _resizeCanvas);
}

/** Spawn a burst of falling confetti across the top of the viewport. */
export function spawnConfetti(onComplete?: () => void): void {
  _ensureCanvas();
  _onComplete = onComplete ?? null;
  const w = _canvas!.width;
  const now = performance.now();
  const count = 90;
  for (let i = 0; i < count; i++) {
    _particles.push({
      x:         Math.random() * w,
      y:         -20 - Math.random() * 60,
      vx:        (Math.random() - 0.5) * 4,
      vy:        3 + Math.random() * 4,
      rotation:  Math.random() * Math.PI * 2,
      rotSpeed:  (Math.random() - 0.5) * 0.15,
      w:         7 + Math.random() * 9,
      h:         4 + Math.random() * 5,
      color:     CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      shape:     (Math.floor(Math.random() * 3)) as 0 | 1 | 2,
      alpha:     1,
      startTime: now,
      duration:  900 + Math.random() * 400,
    });
  }
  if (_animId === null) {
    _animId = requestAnimationFrame(_tick);
  }
}

function _tick(): void {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  const now = performance.now();
  let i = 0;
  while (i < _particles.length) {
    const p = _particles[i];
    const elapsed = now - p.startTime;
    if (elapsed >= p.duration) {
      _particles.splice(i, 1);
      continue;
    }
    p.alpha = 1 - elapsed / p.duration;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotSpeed;

    const ctx = _ctx;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;

    if (p.shape === 0) {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    } else if (p.shape === 1) {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const s = p.w;
      ctx.beginPath();
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s / 2, s / 2);
      ctx.lineTo(-s / 2, s / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    i++;
  }

  if (_particles.length > 0) {
    _animId = requestAnimationFrame(_tick);
  } else {
    _animId = null;
    if (_onComplete) {
      const cb = _onComplete;
      _onComplete = null;
      cb();
    }
  }
}

/** Stop any running confetti animation and clear the canvas. */
export function clearConfetti(): void {
  _particles = [];
  _onComplete = null;
  if (_animId !== null) {
    cancelAnimationFrame(_animId);
    _animId = null;
  }
  if (_canvas && _ctx) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }
}
