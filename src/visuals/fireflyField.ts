import { LevelStyle } from '../types';
import { randRange } from './fieldUtils';

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
const MIN_TILE_SIZE = 1;
const MIN_SPAWN_COOLDOWN_MS = 5000;
const MAX_SPAWN_COOLDOWN_MS = 10000;
const MAX_PULSE_OFFSET_MS = 1200;
const PULSE_MIN = 0.8;
const PULSE_AMPLITUDE = 0.2;
const PULSE_PERIOD_MS = 650;
const LIFECYCLE_ALPHA_OSCILLATION_PERIOD_MS = 2000;
const LIFECYCLE_ALPHA_OSCILLATION_AMPLITUDE = 0.2;
const GLOW_RADIUS_MULTIPLIER = 3.5;
const GLOW_SPRITE_DIAMETER_MULTIPLIER = 2;
const GLOW_MID_STOP = 0.45;
const GLOW_MID_ALPHA = 0.45;
const CORE_ALPHA_BOOST = 1.15;

interface Firefly {
  centerX: number;
  centerY: number;
  orbitRadiusPx: number;
  startAngle: number;
  angularSpeed: number;
  radiusPx: number;
  glowRadiusPx: number;
  color: { r: number; g: number; b: number; rgb: string };
  glowSprite: HTMLCanvasElement | null;
  pulseOffsetMs: number;
  startTime: number;
}

export class FireflyField {
  private _enabled = false;
  private _width = 0;
  private _height = 0;
  private _tileSize = 1;
  private _targetCount = 0;
  private _fireflies: Firefly[] = [];
  private _nextSpawnAt = 0;

  resetForLevel(width: number, height: number, tileSize: number, style?: LevelStyle): void {
    this._width = width;
    this._height = height;
    // Guard against transient/invalid layout states during resize.
    this._tileSize = Math.max(MIN_TILE_SIZE, tileSize);
    this._enabled = style === 'Dark' && width > 0 && height > 0;
    this._fireflies = [];
    if (!this._enabled) {
      this._targetCount = 0;
      return;
    }
    this._targetCount = this._computeTargetCount();
    const now = performance.now();
    this._nextSpawnAt = now;
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

    while (this._fireflies.length < this._targetCount && now >= this._nextSpawnAt) {
      this._fireflies.push(this._spawnFirefly(now));
      this._nextSpawnAt = now + randRange(MIN_SPAWN_COOLDOWN_MS, MAX_SPAWN_COOLDOWN_MS);
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
    const glowRadiusPx = radiusPx * GLOW_RADIUS_MULTIPLIER;

    const warm = Math.random();
    const g = Math.round(255 - warm * 32);
    const b = Math.round(255 - warm * 120);
    const color = {
      r: 255,
      g,
      b,
      rgb: `rgb(255,${g},${b})`,
    };

    return {
      centerX,
      centerY,
      orbitRadiusPx,
      startAngle,
      angularSpeed,
      radiusPx,
      glowRadiusPx,
      color,
      glowSprite: this._createGlowSprite(glowRadiusPx, color),
      pulseOffsetMs: Math.random() * MAX_PULSE_OFFSET_MS,
      startTime: now,
    };
  }

  private _createGlowSprite(
    glowRadiusPx: number,
    color: { r: number; g: number; b: number },
  ): HTMLCanvasElement | null {
    if (
      typeof document === 'undefined' ||
      glowRadiusPx <= 0 ||
      !Number.isFinite(glowRadiusPx)
    ) return null;
    const size = Math.max(1, Math.ceil(glowRadiusPx * GLOW_SPRITE_DIAMETER_MULTIPLIER));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    let spriteCtx: CanvasRenderingContext2D | null = null;
    try {
      spriteCtx = canvas.getContext('2d');
    } catch {
      spriteCtx = null;
    }
    if (!spriteCtx) return null;

    const center = size * 0.5;
    const grad = spriteCtx.createRadialGradient(center, center, 0, center, center, glowRadiusPx);
    grad.addColorStop(0, `rgba(${color.r},${color.g},${color.b},1)`);
    grad.addColorStop(GLOW_MID_STOP, `rgba(${color.r},${color.g},${color.b},${GLOW_MID_ALPHA})`);
    grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
    spriteCtx.fillStyle = grad;
    spriteCtx.beginPath();
    spriteCtx.arc(center, center, glowRadiusPx, 0, TAU);
    spriteCtx.fill();
    return canvas;
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
    const pulse = PULSE_MIN + PULSE_AMPLITUDE * ((Math.sin((ageMs + firefly.pulseOffsetMs) / PULSE_PERIOD_MS) + 1) * 0.5);
    const lifecycleOscillation = Math.sin(((ageMs + firefly.pulseOffsetMs) / LIFECYCLE_ALPHA_OSCILLATION_PERIOD_MS) * TAU)
      * LIFECYCLE_ALPHA_OSCILLATION_AMPLITUDE;
    const oscillatedLifecycleAlpha = Math.max(0, Math.min(1, lifeAlpha * (1 + lifecycleOscillation)));
    const alpha = oscillatedLifecycleAlpha * pulse;

    ctx.save();
    if (firefly.glowSprite) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(firefly.glowSprite, x - firefly.glowRadiusPx, y - firefly.glowRadiusPx);
    } else {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, firefly.glowRadiusPx);
      grad.addColorStop(0, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},${alpha.toFixed(3)})`);
      grad.addColorStop(GLOW_MID_STOP, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},${(alpha * GLOW_MID_ALPHA).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${firefly.color.r},${firefly.color.g},${firefly.color.b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, firefly.glowRadiusPx, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, alpha * CORE_ALPHA_BOOST);
    ctx.fillStyle = firefly.color.rgb;
    ctx.beginPath();
    ctx.arc(x, y, firefly.radiusPx, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}
