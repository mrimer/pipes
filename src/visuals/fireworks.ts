/** Fireworks particle system for campaign mastery celebrations. */

import { sfxManager, SfxId } from '../audio/sfxManager';

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  startTime: number;
  duration: number;   // how long the rocket travels before exploding (ms)
  exploded: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  startTime: number;
  duration: number;   // 1000ms
}

const FIREWORK_COLORS = [
  '#ffd700', '#ff4444', '#44aaff', '#44dd77',
  '#ff88ff', '#ff8844', '#88ffff', '#ffffff', '#cc44ff',
];

const ROCKET_TRAVEL_MS = 300;
const SPARK_DURATION_MS = 1000;
const SPARK_COUNT = 40;
const ROCKET_INTERVAL_MS = 250;
const TOTAL_ROCKETS = 12;

let _rockets: Rocket[] = [];
let _sparks: Spark[] = [];
let _animId: number | null = null;
let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;
let _onComplete: (() => void) | null = null;
let _resizeListenerAdded = false;
let _nextRocketIdx = 0;
let _startTime = 0;

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

function _spawnRocket(now: number): void {
  if (!_canvas) return;
  const w = _canvas.width;
  const h = _canvas.height;
  const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  // Speed chosen so rocket travels ~30–50% up the screen in ROCKET_TRAVEL_MS
  const vy = -(h * 0.4) / ROCKET_TRAVEL_MS;
  _rockets.push({
    x:         0.15 * w + Math.random() * 0.7 * w,
    y:         h,
    vx:        (Math.random() - 0.5) * 0.006 * w,
    vy,
    color,
    startTime: now,
    duration:  ROCKET_TRAVEL_MS,
    exploded:  false,
  });
}

function _explode(rocket: Rocket, now: number): void {
  sfxManager.play(SfxId.Firework);
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.3;
    const speed = 2 + Math.random() * 8;
    _sparks.push({
      x:         rocket.x,
      y:         rocket.y,
      vx:        Math.cos(angle) * speed,
      vy:        Math.sin(angle) * speed,
      color:     rocket.color,
      alpha:     1,
      startTime: now,
      duration:  SPARK_DURATION_MS,
    });
  }
}

/** Shoot off fireworks for ~3 seconds on campaign mastery. */
export function spawnFireworks(onComplete?: () => void): void {
  _ensureCanvas();
  _onComplete = onComplete ?? null;
  _rockets = [];
  _sparks = [];
  _nextRocketIdx = 0;
  _startTime = performance.now();
  if (_animId === null) {
    _animId = requestAnimationFrame(_tick);
  }
}

function _tick(now: number): void {
  if (!_canvas || !_ctx) return;
  _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

  // Schedule new rockets
  const elapsed = now - _startTime;
  const expectedRockets = Math.min(TOTAL_ROCKETS, Math.floor(elapsed / ROCKET_INTERVAL_MS) + 1);
  while (_nextRocketIdx < expectedRockets) {
    _spawnRocket(now);
    _nextRocketIdx++;
  }

  // Update and draw rockets
  let i = 0;
  while (i < _rockets.length) {
    const r = _rockets[i];
    const t = now - r.startTime;
    if (t >= r.duration) {
      if (!r.exploded) {
        r.exploded = true;
        _explode(r, now);
      }
      _rockets.splice(i, 1);
      continue;
    }
    r.x += r.vx;
    r.y += r.vy;

    // Draw rocket as a short bright line
    _ctx.beginPath();
    _ctx.moveTo(r.x, r.y);
    _ctx.lineTo(r.x - r.vx * 4, r.y - r.vy * 4);
    _ctx.strokeStyle = r.color;
    _ctx.lineWidth = 2.5;
    _ctx.globalAlpha = 0.9;
    _ctx.stroke();
    _ctx.globalAlpha = 1;
    i++;
  }

  // Update and draw sparks
  i = 0;
  while (i < _sparks.length) {
    const s = _sparks[i];
    const t = now - s.startTime;
    if (t >= s.duration) {
      _sparks.splice(i, 1);
      continue;
    }
    s.alpha = 1 - t / s.duration;
    s.vx *= 0.93;
    s.vy *= 0.93;
    s.vy += 0.08; // slight gravity
    s.x += s.vx;
    s.y += s.vy;

    _ctx.beginPath();
    _ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    _ctx.fillStyle = s.color;
    _ctx.globalAlpha = s.alpha;
    _ctx.fill();
    _ctx.globalAlpha = 1;
    i++;
  }

  const allDone = _nextRocketIdx >= TOTAL_ROCKETS && _rockets.length === 0 && _sparks.length === 0;
  if (!allDone) {
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

/** Stop any running fireworks animation and clear the canvas. */
export function clearFireworks(): void {
  _rockets = [];
  _sparks = [];
  _nextRocketIdx = 0;
  _onComplete = null;
  if (_animId !== null) {
    cancelAnimationFrame(_animId);
    _animId = null;
  }
  if (_canvas && _ctx) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
  }
}
