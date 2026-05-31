import { LevelStyle } from '../types';

const TAU = Math.PI * 2;
const FIREFLY_FADE_IN_MS = 5000;
const FIREFLY_CRUISE_MS = 10000;
const FIREFLY_FADE_OUT_MS = 5000;
const FIREFLY_LIFETIME_MS = FIREFLY_FADE_IN_MS + FIREFLY_CRUISE_MS + FIREFLY_FADE_OUT_MS;
const TILES_PER_FIREFLY = 10;
const MIN_DIAMETER_TILES = 0.05;
const MAX_DIAMETER_TILES = 0.10;
const MIN_ARC_RADIUS_TILES = 5;
const MAX_ARC_RADIUS_TILES = 10;
const TILE_TRAVERSE_MS = 8000;

interface Firefly {
  centerX: number;
  centerY: number;
  orbitRadiusPx: number;
  startAngle: number;
  angularSpeed: number;
  radiusPx: number;
  color: { r: number; g: number; b: number };
  pulseOffsetMs: number;
  startTime: number;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class FireflyField {
  private _enabled = false;
  private _width = 0;
  private _height = 0;
  private _tileSize = 1;
  private _targetCount = 0;
  private _fireflies: Firefly[] = [];

  resetForLevel(width: number, height: number, tileSize: number, style?: LevelStyle): void {
    this._width = width;
    this._height = height;
    this._tileSize = Math.max(1, tileSize);
    this._enabled = style === 'Dark' && width > 0 && height > 0;
    this._fireflies = [];
    if (!this._enabled) {
      this._targetCount = 0;
      return;
    }
    this._targetCount = this._computeTargetCount();
    const now = performance.now();
    for (let i = 0; i < this._targetCount; i++) {
      this._fireflies.push(this._spawnFirefly(now));
    }
  }

  updateAndRender(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this._enabled) return;

    for (let i = this._fireflies.length - 1; i >= 0; i--) {
      const firefly = this._fireflies[i];
      const ageMs = now - firefly.startTime;
      if (ageMs >= FIREFLY_LIFETIME_MS) {
        this._fireflies.splice(i, 1);
      }
    }

    while (this._fireflies.length < this._targetCount) {
      this._fireflies.push(this._spawnFirefly(now));
    }

    for (const firefly of this._fireflies) {
      this._drawFirefly(ctx, firefly, now);
    }
  }

  private _computeTargetCount(): number {
    const areaTiles = (this._width / this._tileSize) * (this._height / this._tileSize);
    return Math.max(1, Math.round(areaTiles / TILES_PER_FIREFLY));
  }

  private _spawnFirefly(now: number): Firefly {
    const x0 = Math.random() * this._width;
    const y0 = Math.random() * this._height;
    const orbitRadiusPx = randRange(MIN_ARC_RADIUS_TILES, MAX_ARC_RADIUS_TILES) * this._tileSize;
    const startAngle = Math.random() * TAU;
    const centerX = x0 - Math.cos(startAngle) * orbitRadiusPx;
    const centerY = y0 - Math.sin(startAngle) * orbitRadiusPx;

    const speedPxPerMs = this._tileSize / TILE_TRAVERSE_MS;
    const angularSpeedMag = speedPxPerMs / orbitRadiusPx;
    const angularSpeed = angularSpeedMag * (Math.random() < 0.5 ? -1 : 1);

    const diameterPx = randRange(MIN_DIAMETER_TILES, MAX_DIAMETER_TILES) * this._tileSize;
    const radiusPx = diameterPx * 0.5;

    const warm = Math.random();
    const color = {
      r: 255,
      g: Math.round(255 - warm * 32),
      b: Math.round(255 - warm * 120),
    };

    return {
      centerX,
      centerY,
      orbitRadiusPx,
      startAngle,
      angularSpeed,
      radiusPx,
      color,
      pulseOffsetMs: Math.random() * 1200,
      startTime: now,
    };
  }

  private _computeLifecycleAlpha(ageMs: number): number {
    if (ageMs <= 0 || ageMs >= FIREFLY_LIFETIME_MS) return 0;
    if (ageMs < FIREFLY_FADE_IN_MS) return ageMs / FIREFLY_FADE_IN_MS;
    if (ageMs < FIREFLY_FADE_IN_MS + FIREFLY_CRUISE_MS) return 1;
    return (FIREFLY_LIFETIME_MS - ageMs) / FIREFLY_FADE_OUT_MS;
  }

  private _drawFirefly(ctx: CanvasRenderingContext2D, firefly: Firefly, now: number): void {
    const ageMs = now - firefly.startTime;
    const lifeAlpha = this._computeLifecycleAlpha(ageMs);
    if (lifeAlpha <= 0) return;

    const angle = firefly.startAngle + firefly.angularSpeed * ageMs;
    const x = firefly.centerX + Math.cos(angle) * firefly.orbitRadiusPx;
    const y = firefly.centerY + Math.sin(angle) * firefly.orbitRadiusPx;
    const pulse = 0.8 + 0.2 * ((Math.sin((ageMs + firefly.pulseOffsetMs) / 650) + 1) * 0.5);
    const alpha = lifeAlpha * pulse;

    const glowRadius = firefly.radiusPx * 3.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    grad.addColorStop(0, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},${alpha.toFixed(3)})`);
    grad.addColorStop(0.45, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},${(alpha * 0.45).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},0)`);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},${Math.min(1, alpha * 1.15).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, firefly.radiusPx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
