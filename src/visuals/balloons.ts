/** Balloon particle system for campaign completion celebrations. */

interface BalloonParticle {
  x: number;
  y: number;
  vy: number;          // upward velocity (negative = up)
  swayAmp: number;     // horizontal sway amplitude
  swayFreq: number;    // horizontal sway frequency
  swayPhase: number;   // per-balloon phase offset
  spawnTime: number;   // absolute time when balloon becomes visible
  color: string;
  w: number;
  h: number;
}

const BALLOON_COLORS = [
  '#ff4444', '#ffd700', '#44aaff', '#44dd77',
  '#ff88ff', '#ff8844', '#88ffff', '#cc44ff',
];

let _particles: BalloonParticle[] = [];
let _animId: number | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
let _onComplete: (() => void) | null = null;
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- always non-null on a freshly created HTMLCanvasElement
  _ctx = _canvas.getContext('2d')!;
  _resizeCanvas();
  if (!_resizeListenerAdded) {
    window.addEventListener('resize', _resizeCanvas);
    _resizeListenerAdded = true;
  }
}

/** Spawn balloons that rise up from the bottom of the viewport. */
export function spawnBalloons(onComplete?: () => void): void {
  _ensureCanvas();
  _onComplete = onComplete ?? null;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- _ensureCanvas() always initializes _canvas
  const canvas = _canvas!;
  const w = canvas.width;
  const h = canvas.height;
  const now = performance.now();
  const count = 30;
  for (let i = 0; i < count; i++) {
    const bw = 20 + Math.random() * 14;
    _particles.push({
      x:          Math.random() * w,
      y:          h + 40 + Math.random() * 60,
      vy:         -(2.5 + Math.random() * 1.5),
      swayAmp:    8 + Math.random() * 14,
      swayFreq:   0.0008 + Math.random() * 0.0006,
      swayPhase:  Math.random() * Math.PI * 2,
      spawnTime:  now + Math.random() * 1500,
      color:      BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
      w:          bw,
      h:          bw * 1.35,
    });
  }
  if (_animId === null) {
    _animId = requestAnimationFrame(_tick);
  }
}

function _drawBalloon(ctx: CanvasRenderingContext2D, p: BalloonParticle): void {
  const { x, y, w, h, color } = p;

  // Balloon body
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.ellipse(x - w * 0.15, y - h * 0.18, w * 0.12, h * 0.12, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();

  // Knot
  const knotY = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(x - 3, knotY);
  ctx.lineTo(x + 3, knotY);
  ctx.lineTo(x, knotY + 5);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // String
  ctx.beginPath();
  ctx.moveTo(x, knotY + 5);
  ctx.lineTo(x + Math.sin((y * 0.05)) * 6, knotY + 30);
  ctx.strokeStyle = 'rgba(200,200,200,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function _tick(now: number): void {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  let i = 0;
  while (i < _particles.length) {
    const p = _particles[i];
    if (now < p.spawnTime) { i++; continue; }

    p.y += p.vy;
    p.x += Math.sin(now * p.swayFreq + p.swayPhase) * 0.4;

    if (p.y < -p.h - 40) {
      _particles.splice(i, 1);
      continue;
    }

    _drawBalloon(_ctx, p);
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

/** Stop any running balloon animation and clear the canvas. */
export function clearBalloons(): void {
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
