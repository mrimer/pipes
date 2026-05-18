import type { LevelStyle } from '../types';

export type CloudShadowPreset = 'level' | 'chapter' | 'campaign';

interface CloudPuff {
  offsetAlong: number;
  offsetAcross: number;
  radiusAlong: number;
  radiusAcross: number;
}

interface CloudShadow {
  x: number;
  y: number;
  radius: number;
  distanceAlong: number;
  puffs: CloudPuff[];
  opacity: number;
}

interface CloudShadowPresetConfig {
  minRadiusTiles: number;
  maxRadiusTiles: number;
  minOpacity: number;
  maxOpacity: number;
  speedTilesPerSecond: number;
  spawnIntervalMs: number;
  maxClouds: number;
  minCloudGapTiles: number;
  minSpawnDistanceTiles: number;
  entryMarginTiles: number;
  exitMarginTiles: number;
}

interface CloudSpawnOptions {
  distanceMin?: number;
  distanceMax?: number;
}

const TAU = Math.PI * 2;
const MAX_SPAWN_ATTEMPTS = 30;
const MAX_DT_MS = 80;
const PUFF_EDGE_SCALE = 1.16;
const SPAWN_TIMER_RANDOMNESS_FACTOR = 0.6;
const LANE_PADDING_FACTOR = 0.55;
const MIN_PUFF_COUNT = 5;
const BASE_MAX_PUFF_COUNT = 8;
const SIZE_TO_PUFF_COUNT_FACTOR = 4;
const CENTER_PUFF_MIN_SCALE = 0.58;
const CENTER_PUFF_MAX_SCALE = 0.74;
const CENTER_PUFF_ACROSS_RATIO_MIN = 0.62;
const CENTER_PUFF_ACROSS_RATIO_MAX = 0.84;
const EDGE_PUFF_OFFSET_ALONG_MIN_SCALE = 0.22;
const EDGE_PUFF_OFFSET_ALONG_MAX_SCALE = 0.78;
const EDGE_PUFF_OFFSET_ACROSS_MIN_SCALE = 0.05;
const EDGE_PUFF_OFFSET_ACROSS_MAX_SCALE = 0.42;
const EDGE_PUFF_RADIUS_ALONG_MIN_SCALE = 0.28;
const EDGE_PUFF_RADIUS_ALONG_MAX_SCALE = 0.58;
const EDGE_PUFF_ACROSS_RATIO_MIN = 0.58;
const EDGE_PUFF_ACROSS_RATIO_MAX = 0.84;
const GRADIENT_INNER_RADIUS_SCALE = 0.15;
const GRADIENT_CENTER_OPACITY_SCALE = 0.95;
const GRADIENT_MID_STOP = 0.65;
const GRADIENT_MID_OPACITY_SCALE = 0.45;
// Include two radii of extra spacing so newly queued entry clouds do not overlap
// existing clouds that are still close to the spawn edge.
const SPAWN_DISTANCE_RADIUS_CLEARANCE_MULTIPLIER = 2;
const INITIAL_CLOUD_COUNTS: Record<CloudShadowPreset, number> = {
  level: 2,
  chapter: 6,
  campaign: 10,
};
const CLOUD_PRESETS: Record<CloudShadowPreset, CloudShadowPresetConfig> = {
  level: {
    minRadiusTiles: 1.15,
    maxRadiusTiles: 2.5, // ≈ 5x5 max footprint
    minOpacity: 0.09,
    maxOpacity: 0.16,
    speedTilesPerSecond: 0.12,
    spawnIntervalMs: 14_000,
    maxClouds: 3,
    minCloudGapTiles: 3.2,
    minSpawnDistanceTiles: 5.5,
    entryMarginTiles: 1.1,
    exitMarginTiles: 1.1,
  },
  chapter: {
    minRadiusTiles: 0.25,
    maxRadiusTiles: 0.52, // ≈ 1x1 max footprint
    minOpacity: 0.08,
    maxOpacity: 0.14,
    speedTilesPerSecond: 0.075,
    spawnIntervalMs: 4_500,
    maxClouds: 8,
    minCloudGapTiles: 1.0,
    minSpawnDistanceTiles: 1.4,
    entryMarginTiles: 0.8,
    exitMarginTiles: 0.8,
  },
  campaign: {
    minRadiusTiles: 0.12,
    maxRadiusTiles: 0.26, // ≈ 0.5x0.5 max footprint
    minOpacity: 0.08,
    maxOpacity: 0.13,
    speedTilesPerSecond: 0.045,
    spawnIntervalMs: 3_200,
    maxClouds: 10,
    minCloudGapTiles: 0.45,
    minSpawnDistanceTiles: 0.8,
    entryMarginTiles: 0.6,
    exitMarginTiles: 0.6,
  },
};

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Procedural, screen-scoped cloud-shadow field.
 * Clouds are generated as soft overlapping puffs and drift together at one speed.
 */
export class CloudShadowField {
  private _clouds: CloudShadow[] = [];
  private _width = 0;
  private _height = 0;
  private _tileSize = 1;
  private _config: CloudShadowPresetConfig = CLOUD_PRESETS.level;
  private _preset: CloudShadowPreset = 'level';
  private _enabled = false;
  private _lastNow: number | null = null;
  private _spawnTimerMs = 0;

  private _dirX = 1;
  private _dirY = 0;
  private _dirAngle = 0;
  private _perpX = 0;
  private _perpY = 1;
  private _distanceMin = 0;
  private _distanceMax = 0;
  private _laneMin = 0;
  private _laneMax = 0;

  resetForScreen(
    width: number,
    height: number,
    tileSize: number,
    preset: CloudShadowPreset,
    style?: LevelStyle,
  ): void {
    this._width = width;
    this._height = height;
    this._tileSize = Math.max(1, tileSize);
    this._config = CLOUD_PRESETS[preset];
    this._preset = preset;
    this._clouds = [];
    this._lastNow = null;
    this._spawnTimerMs = randRange(0, this._config.spawnIntervalMs * SPAWN_TIMER_RANDOMNESS_FACTOR);

    this._enabled = style !== 'Dark' && width > 0 && height > 0;
    if (!this._enabled) return;

    const angle = Math.random() * TAU;
    this._dirAngle = angle;
    this._dirX = Math.cos(angle);
    this._dirY = Math.sin(angle);
    this._perpX = -this._dirY;
    this._perpY = this._dirX;

    const corners: Array<[number, number]> = [
      [0, 0],
      [this._width, 0],
      [0, this._height],
      [this._width, this._height],
    ];

    this._distanceMin = Number.POSITIVE_INFINITY;
    this._distanceMax = Number.NEGATIVE_INFINITY;
    this._laneMin = Number.POSITIVE_INFINITY;
    this._laneMax = Number.NEGATIVE_INFINITY;

    for (const [x, y] of corners) {
      const distance = x * this._dirX + y * this._dirY;
      const lane = x * this._perpX + y * this._perpY;
      this._distanceMin = Math.min(this._distanceMin, distance);
      this._distanceMax = Math.max(this._distanceMax, distance);
      this._laneMin = Math.min(this._laneMin, lane);
      this._laneMax = Math.max(this._laneMax, lane);
    }

    this._seedInitialClouds();
  }

  updateAndRender(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this._enabled) return;

    if (this._lastNow === null) {
      this._lastNow = now;
    }
    const dt = clamp(now - this._lastNow, 0, MAX_DT_MS);
    this._lastNow = now;

    this._advanceClouds(dt);
    this._spawnTimerMs += dt;

    while (this._spawnTimerMs >= this._config.spawnIntervalMs) {
      this._spawnTimerMs -= this._config.spawnIntervalMs;
      if (this._clouds.length < this._config.maxClouds) this._spawnCloud();
    }

    for (const cloud of this._clouds) {
      this._drawCloudShadow(ctx, cloud);
    }
  }

  private _advanceClouds(dt: number): void {
    if (dt <= 0) return;
    const speedPxPerMs = this._config.speedTilesPerSecond * this._tileSize / 1000;
    const dx = this._dirX * speedPxPerMs * dt;
    const dy = this._dirY * speedPxPerMs * dt;
    const dd = speedPxPerMs * dt;
    const removeDistance = this._distanceMax + this._config.exitMarginTiles * this._tileSize;

    for (const cloud of this._clouds) {
      cloud.x += dx;
      cloud.y += dy;
      cloud.distanceAlong += dd;
    }
    this._clouds = this._clouds.filter((cloud) => cloud.distanceAlong - cloud.radius <= removeDistance);
  }

  private _seedInitialClouds(): void {
    const maxRadiusPx = this._config.maxRadiusTiles * this._tileSize;
    const seedDistanceMin =
      this._distanceMin - this._config.entryMarginTiles * this._tileSize - maxRadiusPx;
    const seedDistanceMax =
      this._distanceMax + this._config.exitMarginTiles * this._tileSize + maxRadiusPx;
    const targetCount = Math.min(
      this._config.maxClouds,
      INITIAL_CLOUD_COUNTS[this._preset],
    );
    for (let i = 0; i < targetCount; i++) {
      if (!this._spawnCloud({ distanceMin: seedDistanceMin, distanceMax: seedDistanceMax })) break;
    }
    // Keep the field non-empty even on small/tight layouts where broad seeding
    // ranges cannot satisfy spacing constraints for multiple clouds.
    if (this._clouds.length === 0) this._spawnCloud();
  }

  private _spawnCloud(options: CloudSpawnOptions = {}): boolean {
    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const radius = randRange(
        this._config.minRadiusTiles * this._tileSize,
        this._config.maxRadiusTiles * this._tileSize,
      );
      const lanePadding = radius * LANE_PADDING_FACTOR;
      const laneStart = this._laneMin + lanePadding;
      const laneEnd = this._laneMax - lanePadding;
      if (laneEnd <= laneStart) return false;

      const lane = randRange(laneStart, laneEnd);
      const entryDistance = this._distanceMin - radius - this._config.entryMarginTiles * this._tileSize;
      const defaultDistanceMin = entryDistance - (
        this._config.minSpawnDistanceTiles * this._tileSize
        + radius * SPAWN_DISTANCE_RADIUS_CLEARANCE_MULTIPLIER
      );
      const requestedDistanceMin = options.distanceMin ?? defaultDistanceMin;
      const requestedDistanceMax = options.distanceMax ?? entryDistance;
      // Normalize caller-provided ranges (or computed defaults) so accidental
      // min/max inversion still yields a valid random sampling interval.
      const distanceMin = Math.min(requestedDistanceMin, requestedDistanceMax);
      const distanceMax = Math.max(requestedDistanceMin, requestedDistanceMax);
      const distance = randRange(distanceMin, distanceMax);
      const x = this._dirX * distance + this._perpX * lane;
      const y = this._dirY * distance + this._perpY * lane;

      if (this._isTooCloseToExistingCloud(x, y, radius, distance)) continue;

      this._clouds.push({
        x,
        y,
        radius,
        distanceAlong: distance,
        puffs: this._buildPuffs(radius),
        opacity: randRange(this._config.minOpacity, this._config.maxOpacity),
      });
      return true;
    }
    return false;
  }

  private _isTooCloseToExistingCloud(
    x: number,
    y: number,
    radius: number,
    distance: number,
  ): boolean {
    const minGapPx = this._config.minCloudGapTiles * this._tileSize;
    const minSpawnDistancePx = this._config.minSpawnDistanceTiles * this._tileSize;
    for (const cloud of this._clouds) {
      const dx = cloud.x - x;
      const dy = cloud.y - y;
      const centerDistance = Math.hypot(dx, dy);
      if (centerDistance < cloud.radius + radius + minGapPx) return true;

      if (Math.abs(cloud.distanceAlong - distance) < cloud.radius + radius + minSpawnDistancePx) {
        return true;
      }
    }
    return false;
  }

  private _buildPuffs(radius: number): CloudPuff[] {
    const sizeNorm = clamp(
      (radius - this._config.minRadiusTiles * this._tileSize)
        / ((this._config.maxRadiusTiles - this._config.minRadiusTiles) * this._tileSize),
      0,
      1,
    );
    const puffCount = Math.round(randRange(MIN_PUFF_COUNT, BASE_MAX_PUFF_COUNT + sizeNorm * SIZE_TO_PUFF_COUNT_FACTOR));
    const centerRadiusAlong = radius * randRange(CENTER_PUFF_MIN_SCALE, CENTER_PUFF_MAX_SCALE);
    const puffs: CloudPuff[] = [{
      offsetAlong: 0,
      offsetAcross: 0,
      radiusAlong: centerRadiusAlong,
      radiusAcross: centerRadiusAlong * randRange(CENTER_PUFF_ACROSS_RATIO_MIN, CENTER_PUFF_ACROSS_RATIO_MAX),
    }];

    for (let i = 1; i < puffCount; i++) {
      const alongSign = Math.random() < 0.5 ? -1 : 1;
      const acrossSign = Math.random() < 0.5 ? -1 : 1;
      const edgeRadiusAlong = radius * randRange(EDGE_PUFF_RADIUS_ALONG_MIN_SCALE, EDGE_PUFF_RADIUS_ALONG_MAX_SCALE);
      puffs.push({
        offsetAlong: alongSign * randRange(EDGE_PUFF_OFFSET_ALONG_MIN_SCALE, EDGE_PUFF_OFFSET_ALONG_MAX_SCALE) * radius,
        offsetAcross: acrossSign * randRange(EDGE_PUFF_OFFSET_ACROSS_MIN_SCALE, EDGE_PUFF_OFFSET_ACROSS_MAX_SCALE) * radius,
        radiusAlong: edgeRadiusAlong,
        radiusAcross: edgeRadiusAlong * randRange(EDGE_PUFF_ACROSS_RATIO_MIN, EDGE_PUFF_ACROSS_RATIO_MAX),
      });
    }
    return puffs;
  }

  private _drawCloudShadow(ctx: CanvasRenderingContext2D, cloud: CloudShadow): void {
    for (const puff of cloud.puffs) {
      const px = cloud.x + this._dirX * puff.offsetAlong + this._perpX * puff.offsetAcross;
      const py = cloud.y + this._dirY * puff.offsetAlong + this._perpY * puff.offsetAcross;
      const radiusAlong = puff.radiusAlong * PUFF_EDGE_SCALE;
      const radiusAcross = puff.radiusAcross * PUFF_EDGE_SCALE;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(this._dirAngle);
      ctx.scale(radiusAlong, radiusAcross);
      const gradient = ctx.createRadialGradient(0, 0, GRADIENT_INNER_RADIUS_SCALE, 0, 0, 1);
      gradient.addColorStop(0, `rgba(0,0,0,${(cloud.opacity * GRADIENT_CENTER_OPACITY_SCALE).toFixed(3)})`);
      gradient.addColorStop(GRADIENT_MID_STOP, `rgba(0,0,0,${(cloud.opacity * GRADIENT_MID_OPACITY_SCALE).toFixed(3)})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}
