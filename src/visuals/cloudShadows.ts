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

type CloudSpawnEdge = 'top' | 'right' | 'bottom' | 'left';

interface CloudSpawnedShadow extends CloudShadow {
  entryEdge: CloudSpawnEdge;
  entryCoordinate: number;
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
  entryEdge?: CloudSpawnEdge;
  entryCoordinate?: number;
  minGapScale?: number;
  allowGroup?: boolean;
}

const TAU = Math.PI * 2;
const MAX_SPAWN_ATTEMPTS = 30;
const MAX_DT_MS = 80;
const PUFF_EDGE_SCALE = 1.08;
const SPAWN_TIMER_RANDOMNESS_FACTOR = 0.6;
const LANE_PADDING_FACTOR = 0.55;
const MIN_PUFF_COUNT = 5;
const BASE_MAX_PUFF_COUNT = 8;
const SIZE_TO_PUFF_COUNT_FACTOR = 4;
const CENTER_PUFF_MIN_SCALE = 0.74;
const CENTER_PUFF_MAX_SCALE = 0.9;
const CENTER_PUFF_ACROSS_RATIO_MIN = 0.74;
const CENTER_PUFF_ACROSS_RATIO_MAX = 0.92;
const EDGE_PUFF_OFFSET_ALONG_MIN_SCALE = 0.22;
const EDGE_PUFF_OFFSET_ALONG_MAX_SCALE = 0.66;
const EDGE_PUFF_OFFSET_ACROSS_MIN_SCALE = 0.05;
const EDGE_PUFF_OFFSET_ACROSS_MAX_SCALE = 0.34;
const EDGE_PUFF_RADIUS_ALONG_MIN_SCALE = 0.34;
const EDGE_PUFF_RADIUS_ALONG_MAX_SCALE = 0.62;
const EDGE_PUFF_ACROSS_RATIO_MIN = 0.64;
const EDGE_PUFF_ACROSS_RATIO_MAX = 0.9;
const GRADIENT_INNER_RADIUS_SCALE = 0.32;
const GRADIENT_CENTER_OPACITY_SCALE = 1;
const GRADIENT_MID_STOP = 0.82;
const GRADIENT_MID_OPACITY_SCALE = 0.72;
const CAMPAIGN_TILES_PER_CLOUD = 10;
const GROUP_SPAWN_CHANCE = 0.35;
const GROUP_MIN_EXTRA_CLOUDS = 1;
const GROUP_MAX_EXTRA_CLOUDS = 2;
const GROUP_ENTRY_COORDINATE_SPREAD_FACTOR = 1.4;
const GROUP_DISTANCE_SPREAD_FACTOR = 0.85;
const GROUP_MIN_GAP_SCALE = 0.2;
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
    for (const [x, y] of corners) {
      const distance = x * this._dirX + y * this._dirY;
      this._distanceMin = Math.min(this._distanceMin, distance);
      this._distanceMax = Math.max(this._distanceMax, distance);
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
      if (this._clouds.length < this._getCloudLimit()) {
        this._spawnCloud({ allowGroup: true });
      }
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
    const targetCount = Math.min(this._getCloudLimit(), this._getInitialCloudCount());
    const seedGapScale = this._preset === 'campaign' ? GROUP_MIN_GAP_SCALE : 1;
    for (let i = 0; i < targetCount; i++) {
      if (!this._spawnCloud({
        distanceMin: seedDistanceMin,
        distanceMax: seedDistanceMax,
        minGapScale: seedGapScale,
        allowGroup: false,
      })) break;
    }
    // Keep the field non-empty even on small/tight layouts where broad seeding
    // ranges cannot satisfy spacing constraints for multiple clouds.
    if (this._clouds.length === 0) this._spawnCloud();
  }

  private _getCloudLimit(): number {
    if (this._preset === 'campaign') {
      return Math.max(this._config.maxClouds, this._getCampaignAreaCloudCount());
    }
    return this._config.maxClouds;
  }

  private _getInitialCloudCount(): number {
    if (this._preset === 'campaign') {
      return this._getCampaignAreaCloudCount();
    }
    return INITIAL_CLOUD_COUNTS[this._preset];
  }

  private _getCampaignAreaCloudCount(): number {
    const areaTiles = (this._width / this._tileSize) * (this._height / this._tileSize);
    return Math.max(1, Math.round(areaTiles / CAMPAIGN_TILES_PER_CLOUD));
  }

  private _spawnCloud(options: CloudSpawnOptions = {}): boolean {
    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS; attempt++) {
      const cloud = this._buildSpawnedCloud(options);
      if (!cloud) return false;
      if (this._isTooCloseToExistingCloud(
        cloud.x,
        cloud.y,
        cloud.radius,
        cloud.distanceAlong,
        options.minGapScale,
      )) {
        continue;
      }

      this._clouds.push(cloud);
      if (options.allowGroup) this._spawnGroupedClouds(cloud);
      return true;
    }
    return false;
  }

  private _buildSpawnedCloud(options: CloudSpawnOptions): CloudSpawnedShadow | null {
    const radius = randRange(
      this._config.minRadiusTiles * this._tileSize,
      this._config.maxRadiusTiles * this._tileSize,
    );
    const entryEdge = options.entryEdge ?? this._pickIncomingEdge();
    const entryCoordinate = this._sampleEntryCoordinate(entryEdge, radius, options.entryCoordinate);
    if (entryCoordinate === null) return null;

    const anchor = this._getEntryAnchor(entryEdge, entryCoordinate);
    const offsetFromEdge = radius + this._config.entryMarginTiles * this._tileSize;
    const baseX = anchor.x - this._dirX * offsetFromEdge;
    const baseY = anchor.y - this._dirY * offsetFromEdge;
    const baseDistance = this._projectAlongMovement(baseX, baseY);
    const entryDistance = this._distanceMin - radius - this._config.entryMarginTiles * this._tileSize;
    const defaultDistanceMin = entryDistance - (
      this._config.minSpawnDistanceTiles * this._tileSize
      + radius * SPAWN_DISTANCE_RADIUS_CLEARANCE_MULTIPLIER
    );
    const requestedDistanceMin = options.distanceMin ?? defaultDistanceMin;
    const requestedDistanceMax = options.distanceMax ?? entryDistance;
    const distanceMin = Math.min(requestedDistanceMin, requestedDistanceMax);
    const distanceMax = Math.max(requestedDistanceMin, requestedDistanceMax);
    const distanceAlong = randRange(distanceMin, distanceMax);
    const distanceOffset = distanceAlong - baseDistance;

    return {
      x: baseX + this._dirX * distanceOffset,
      y: baseY + this._dirY * distanceOffset,
      radius,
      distanceAlong,
      puffs: this._buildPuffs(radius),
      opacity: randRange(this._config.minOpacity, this._config.maxOpacity),
      entryEdge,
      entryCoordinate,
    };
  }

  private _spawnGroupedClouds(anchorCloud: CloudSpawnedShadow): void {
    if (this._clouds.length >= this._getCloudLimit() || Math.random() >= GROUP_SPAWN_CHANCE) return;
    const extraCount = Math.floor(randRange(GROUP_MIN_EXTRA_CLOUDS, GROUP_MAX_EXTRA_CLOUDS + 1));
    const coordinateSpread = anchorCloud.radius * GROUP_ENTRY_COORDINATE_SPREAD_FACTOR;
    const distanceSpread = anchorCloud.radius * GROUP_DISTANCE_SPREAD_FACTOR;

    for (let i = 0; i < extraCount && this._clouds.length < this._getCloudLimit(); i++) {
      this._spawnCloud({
        entryEdge: anchorCloud.entryEdge,
        entryCoordinate: randRange(
          anchorCloud.entryCoordinate - coordinateSpread,
          anchorCloud.entryCoordinate + coordinateSpread,
        ),
        distanceMin: anchorCloud.distanceAlong - distanceSpread,
        distanceMax: anchorCloud.distanceAlong + distanceSpread,
        minGapScale: GROUP_MIN_GAP_SCALE,
        allowGroup: false,
      });
    }
  }

  private _isTooCloseToExistingCloud(
    x: number,
    y: number,
    radius: number,
    distance: number,
    minGapScale = 1,
  ): boolean {
    const minGapPx = this._config.minCloudGapTiles * this._tileSize * minGapScale;
    const minSpawnDistancePx = this._config.minSpawnDistanceTiles * this._tileSize * minGapScale;
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

  private _pickIncomingEdge(): CloudSpawnEdge {
    const incomingEdges: CloudSpawnEdge[] = [];
    incomingEdges.push(this._dirX >= 0 ? 'left' : 'right');
    incomingEdges.push(this._dirY >= 0 ? 'top' : 'bottom');
    return incomingEdges[Math.floor(Math.random() * incomingEdges.length)] ?? incomingEdges[0];
  }

  private _sampleEntryCoordinate(
    edge: CloudSpawnEdge,
    radius: number,
    preferredCoordinate?: number,
  ): number | null {
    const isHorizontalEdge = edge === 'top' || edge === 'bottom';
    const limit = isHorizontalEdge ? this._width : this._height;
    const padding = radius * LANE_PADDING_FACTOR;
    const start = padding;
    const end = limit - padding;
    if (end <= start) return null;
    if (preferredCoordinate === undefined) return randRange(start, end);
    return clamp(preferredCoordinate, start, end);
  }

  private _getEntryAnchor(edge: CloudSpawnEdge, coordinate: number): { x: number; y: number } {
    switch (edge) {
      case 'top':
        return { x: coordinate, y: 0 };
      case 'right':
        return { x: this._width, y: coordinate };
      case 'bottom':
        return { x: coordinate, y: this._height };
      case 'left':
      default:
        return { x: 0, y: coordinate };
    }
  }

  private _projectAlongMovement(x: number, y: number): number {
    return x * this._dirX + y * this._dirY;
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
