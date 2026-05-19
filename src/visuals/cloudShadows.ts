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
  bodyTone: number;
  bodyOpacity: number;
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
  defaultMaxClouds: number;
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
const CAMPAIGN_CLOUD_BODY_OFFSET_X_TILES = 0.08;
const CAMPAIGN_CLOUD_BODY_OFFSET_Y_TILES = 0.08;
const CAMPAIGN_CLOUD_INNER_ALPHA = 0.96;
const CAMPAIGN_CLOUD_MID_ALPHA = 0.88;
const CAMPAIGN_CLOUD_OUTER_ALPHA = 0.76;
const CAMPAIGN_CLOUD_BODY_GRAY_MIN = 228;
const CAMPAIGN_CLOUD_BODY_GRAY_MAX = 250;
const CAMPAIGN_TILES_PER_CLOUD = 10;
const GROUP_SPAWN_CHANCE = 0.35;
const GROUP_MIN_EXTRA_CLOUDS = 1;
const GROUP_MAX_EXTRA_CLOUDS = 2;
const GROUP_ENTRY_COORDINATE_SPREAD_FACTOR = 1.4;
const GROUP_DISTANCE_SPREAD_FACTOR = 0.85;
const GROUP_MIN_GAP_SCALE = 0.2;
const DEFAULT_SEED_GAP_SCALE = 1;
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
    maxOpacity: 0.15,
    speedTilesPerSecond: 0.14,
    spawnIntervalMs: 14_000,
    defaultMaxClouds: 3,
    minCloudGapTiles: 3.2,
    minSpawnDistanceTiles: 5.5,
    entryMarginTiles: 1.1,
    exitMarginTiles: 1.1,
  },
  chapter: {
    minRadiusTiles: 0.25,
    maxRadiusTiles: 1.0, // ≈ 2x2 max footprint
    minOpacity: 0.08,
    maxOpacity: 0.14,
    speedTilesPerSecond: 0.08,
    spawnIntervalMs: 4_500,
    defaultMaxClouds: 8,
    minCloudGapTiles: 1.1,
    minSpawnDistanceTiles: 1.4,
    entryMarginTiles: 0.8,
    exitMarginTiles: 0.8,
  },
  campaign: {
    minRadiusTiles: 0.12,
    maxRadiusTiles: 0.5, // ≈ 1x1 max footprint
    minOpacity: 0.07,
    maxOpacity: 0.13,
    speedTilesPerSecond: 0.05,
    spawnIntervalMs: 3_200,
    defaultMaxClouds: 10,
    minCloudGapTiles: 0.5,
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

function randIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
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
      if (this._preset === 'campaign') this._drawCampaignCloudBody(ctx, cloud);
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
    for (let i = this._clouds.length - 1; i >= 0; i--) {
      if (this._clouds[i].distanceAlong - this._clouds[i].radius > removeDistance) {
        this._clouds.splice(i, 1);
      }
    }
  }

  private _seedInitialClouds(): void {
    const maxRadiusPx = this._config.maxRadiusTiles * this._tileSize;
    const seedDistanceMin =
      this._distanceMin - this._config.entryMarginTiles * this._tileSize - maxRadiusPx;
    const seedDistanceMax =
      this._distanceMax + this._config.exitMarginTiles * this._tileSize + maxRadiusPx;
    const targetCount = Math.min(this._getCloudLimit(), this._getInitialCloudCount());
    const seedGapScale = this._preset === 'campaign' ? GROUP_MIN_GAP_SCALE : DEFAULT_SEED_GAP_SCALE;
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
      return Math.max(this._config.defaultMaxClouds, this._getCampaignAreaCloudCount());
    }
    return this._config.defaultMaxClouds;
  }

  private _getInitialCloudCount(): number {
    if (this._preset === 'campaign') {
      return this._getCampaignAreaCloudCount();
    }
    return INITIAL_CLOUD_COUNTS[this._preset];
  }

  private _getCampaignAreaCloudCount(): number {
    const totalTileCount = (this._width / this._tileSize) * (this._height / this._tileSize);
    return Math.max(1, Math.round(totalTileCount / CAMPAIGN_TILES_PER_CLOUD));
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
      bodyTone: randRange(0, 1),
      bodyOpacity: randRange(0.82, 0.95),
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
    return incomingEdges[Math.floor(Math.random() * incomingEdges.length)];
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
    const gradient = ctx.createRadialGradient(0, 0, GRADIENT_INNER_RADIUS_SCALE, 0, 0, 1);
    gradient.addColorStop(0, `rgba(0,0,0,${(cloud.opacity * GRADIENT_CENTER_OPACITY_SCALE).toFixed(3)})`);
    gradient.addColorStop(GRADIENT_MID_STOP, `rgba(0,0,0,${(cloud.opacity * GRADIENT_MID_OPACITY_SCALE).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    for (const puff of cloud.puffs) {
      const px = cloud.x + this._dirX * puff.offsetAlong + this._perpX * puff.offsetAcross;
      const py = cloud.y + this._dirY * puff.offsetAlong + this._perpY * puff.offsetAcross;
      const radiusAlong = puff.radiusAlong * PUFF_EDGE_SCALE;
      const radiusAcross = puff.radiusAcross * PUFF_EDGE_SCALE;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(this._dirAngle);
      ctx.scale(radiusAlong, radiusAcross);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  private _drawCampaignCloudBody(ctx: CanvasRenderingContext2D, cloud: CloudShadow): void {
    const bodyOffsetX = -CAMPAIGN_CLOUD_BODY_OFFSET_X_TILES * this._tileSize;
    const bodyOffsetY = -CAMPAIGN_CLOUD_BODY_OFFSET_Y_TILES * this._tileSize;
    const baseGray = Math.round(
      CAMPAIGN_CLOUD_BODY_GRAY_MIN
      + cloud.bodyTone * (CAMPAIGN_CLOUD_BODY_GRAY_MAX - CAMPAIGN_CLOUD_BODY_GRAY_MIN),
    );
    const innerGray = Math.min(255, baseGray + 4);
    const midGray = baseGray;
    const outerGray = Math.max(220, baseGray - 10);

    const gradient = ctx.createRadialGradient(0, 0, GRADIENT_INNER_RADIUS_SCALE, 0, 0, 1);
    gradient.addColorStop(
      0,
      `rgba(${innerGray},${innerGray},${innerGray},${(cloud.bodyOpacity * CAMPAIGN_CLOUD_INNER_ALPHA).toFixed(3)})`,
    );
    gradient.addColorStop(
      GRADIENT_MID_STOP,
      `rgba(${midGray},${midGray},${midGray},${(cloud.bodyOpacity * CAMPAIGN_CLOUD_MID_ALPHA).toFixed(3)})`,
    );
    gradient.addColorStop(
      1,
      `rgba(${outerGray},${outerGray},${outerGray},${(cloud.bodyOpacity * CAMPAIGN_CLOUD_OUTER_ALPHA).toFixed(3)})`,
    );

    for (const puff of cloud.puffs) {
      const px = cloud.x + this._dirX * puff.offsetAlong + this._perpX * puff.offsetAcross + bodyOffsetX;
      const py = cloud.y + this._dirY * puff.offsetAlong + this._perpY * puff.offsetAcross + bodyOffsetY;
      const radiusAlong = puff.radiusAlong;
      const radiusAcross = puff.radiusAcross;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(this._dirAngle);
      ctx.scale(radiusAlong, radiusAcross);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
}

interface FlockBird {
  offsetAlong: number;
  offsetAcross: number;
  size: number;
  strokeWidth: number;
}

interface BirdFlock {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  angle: number;
  speedPxPerMs: number;
  birds: FlockBird[];
  boundingRadius: number;
  hasEntered: boolean;
  flapCooldownMs: number;
  flapDurationMs: number;
  flapElapsedMs: number;
  flapBeats: number;
}

const BIRD_MIN_SPEED_TILES_PER_SECOND = 0.85;
const BIRD_MAX_SPEED_TILES_PER_SECOND = 1.2;
const BIRD_HEADING_VARIANCE_RAD = Math.PI / 6;
const BIRD_RESPAWN_MARGIN_TILES = 1.4;
const BIRD_FORMATION_MARGIN_TILES = 1.2;
const BIRD_MIN_ARM_DEPTH = 2;
const BIRD_MAX_ARM_DEPTH = 4;
const BIRD_MIN_SPACING_ALONG_TILES = 0.42;
const BIRD_MAX_SPACING_ALONG_TILES = 0.62;
const BIRD_MIN_SPACING_ACROSS_TILES = 0.28;
const BIRD_MAX_SPACING_ACROSS_TILES = 0.46;
const BIRD_MIN_SIZE_TILES = 0.08;
const BIRD_MAX_SIZE_TILES = 0.12;
const BIRD_MIN_COOLDOWN_MS = 2_200;
const BIRD_MAX_COOLDOWN_MS = 6_000;
const BIRD_MIN_FLAP_DURATION_MS = 520;
const BIRD_MAX_FLAP_DURATION_MS = 920;
const BIRD_MIN_FLAP_BEATS = 3;
const BIRD_MAX_FLAP_BEATS = 5;
const BIRD_WING_SPREAD_BASE = 0.36;
const BIRD_WING_SPREAD_FLAP_BOOST = 0.8;
const BIRD_STROKE_MIN = 1;
const BIRD_STROKE_MAX = 2.2;
const BIRD_COLOR = '#1c2533';

/**
 * Campaign-only ambient bird flock rendered over the campaign map board.
 * A flock enters from a random edge, glides across the board, occasionally
 * flaps wings in synchrony, then respawns after fully exiting.
 */
export class CampaignBirdFlockField {
  private _width = 0;
  private _height = 0;
  private _tileSize = 1;
  private _enabled = false;
  private _lastNow: number | null = null;
  private _flock: BirdFlock | null = null;

  resetForScreen(width: number, height: number, tileSize: number, style?: LevelStyle): void {
    this._width = width;
    this._height = height;
    this._tileSize = Math.max(1, tileSize);
    this._enabled = style !== 'Dark' && width > 0 && height > 0;
    this._lastNow = null;
    this._flock = this._enabled ? this._spawnFlock() : null;
  }

  updateAndRender(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this._enabled) return;
    if (this._lastNow === null) this._lastNow = now;
    const dt = clamp(now - this._lastNow, 0, MAX_DT_MS);
    this._lastNow = now;

    if (!this._flock) {
      this._flock = this._spawnFlock();
      if (!this._flock) return;
    }

    this._advanceFlock(dt);
    const flock = this._flock;
    if (!flock) return;

    this._tickFlapState(flock, dt);
    this._drawFlock(ctx, flock);
  }

  private _advanceFlock(dt: number): void {
    const flock = this._flock;
    if (!flock || dt <= 0) return;
    flock.x += flock.dirX * flock.speedPxPerMs * dt;
    flock.y += flock.dirY * flock.speedPxPerMs * dt;

    const visibleMinX = -flock.boundingRadius;
    const visibleMaxX = this._width + flock.boundingRadius;
    const visibleMinY = -flock.boundingRadius;
    const visibleMaxY = this._height + flock.boundingRadius;
    if (
      flock.x >= visibleMinX
      && flock.x <= visibleMaxX
      && flock.y >= visibleMinY
      && flock.y <= visibleMaxY
    ) {
      flock.hasEntered = true;
    }

    if (flock.hasEntered) {
      const margin = BIRD_RESPAWN_MARGIN_TILES * this._tileSize;
      const outOfBounds =
        flock.x < -flock.boundingRadius - margin
        || flock.x > this._width + flock.boundingRadius + margin
        || flock.y < -flock.boundingRadius - margin
        || flock.y > this._height + flock.boundingRadius + margin;
      if (outOfBounds) {
        this._flock = this._spawnFlock();
      }
    }
  }

  private _tickFlapState(flock: BirdFlock, dt: number): void {
    if (flock.flapDurationMs > 0) {
      flock.flapElapsedMs = Math.min(flock.flapDurationMs, flock.flapElapsedMs + dt);
      if (flock.flapElapsedMs >= flock.flapDurationMs) {
        flock.flapDurationMs = 0;
        flock.flapElapsedMs = 0;
        flock.flapCooldownMs = randRange(BIRD_MIN_COOLDOWN_MS, BIRD_MAX_COOLDOWN_MS);
      }
      return;
    }

    flock.flapCooldownMs -= dt;
    if (flock.flapCooldownMs <= 0) {
      flock.flapDurationMs = randRange(BIRD_MIN_FLAP_DURATION_MS, BIRD_MAX_FLAP_DURATION_MS);
      flock.flapElapsedMs = 0;
      flock.flapBeats = randIntInclusive(BIRD_MIN_FLAP_BEATS, BIRD_MAX_FLAP_BEATS);
    }
  }

  private _drawFlock(ctx: CanvasRenderingContext2D, flock: BirdFlock): void {
    const flapProgress = flock.flapDurationMs > 0
      ? clamp(flock.flapElapsedMs / flock.flapDurationMs, 0, 1)
      : 0;
    const flapWave = flock.flapDurationMs > 0
      ? Math.abs(Math.sin(flapProgress * flock.flapBeats * TAU))
      : 0;
    const wingSpread = BIRD_WING_SPREAD_BASE + flapWave * BIRD_WING_SPREAD_FLAP_BOOST;

    ctx.save();
    ctx.translate(flock.x, flock.y);
    ctx.rotate(flock.angle);
    ctx.strokeStyle = BIRD_COLOR;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const bird of flock.birds) {
      const wingDepth = bird.size * wingSpread;
      ctx.save();
      ctx.translate(bird.offsetAlong, bird.offsetAcross);
      ctx.lineWidth = bird.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(-bird.size, -wingDepth);
      ctx.lineTo(0, 0);
      ctx.lineTo(-bird.size, wingDepth);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private _spawnFlock(): BirdFlock | null {
    const birds = this._buildVFormation();
    if (birds.length === 0) return null;

    const edge = this._pickSpawnEdge();
    const inwardAngle = this._getInwardAngle(edge);
    const angle = inwardAngle + randRange(-BIRD_HEADING_VARIANCE_RAD, BIRD_HEADING_VARIANCE_RAD);
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const spawnMargin = BIRD_FORMATION_MARGIN_TILES * this._tileSize;
    const spawnPos = this._buildSpawnPoint(edge, spawnMargin);
    const speedPxPerMs = randRange(BIRD_MIN_SPEED_TILES_PER_SECOND, BIRD_MAX_SPEED_TILES_PER_SECOND) * this._tileSize / 1000;

    let boundingRadius = 0;
    for (const bird of birds) {
      boundingRadius = Math.max(
        boundingRadius,
        Math.hypot(bird.offsetAlong, bird.offsetAcross) + bird.size * 1.2,
      );
    }

    return {
      x: spawnPos.x,
      y: spawnPos.y,
      dirX,
      dirY,
      angle,
      speedPxPerMs,
      birds,
      boundingRadius,
      hasEntered: false,
      flapCooldownMs: randRange(BIRD_MIN_COOLDOWN_MS, BIRD_MAX_COOLDOWN_MS),
      flapDurationMs: 0,
      flapElapsedMs: 0,
      flapBeats: BIRD_MIN_FLAP_BEATS,
    };
  }

  private _buildVFormation(): FlockBird[] {
    const armDepth = randIntInclusive(BIRD_MIN_ARM_DEPTH, BIRD_MAX_ARM_DEPTH);
    const spacingAlong = randRange(BIRD_MIN_SPACING_ALONG_TILES, BIRD_MAX_SPACING_ALONG_TILES) * this._tileSize;
    const spacingAcross = randRange(BIRD_MIN_SPACING_ACROSS_TILES, BIRD_MAX_SPACING_ACROSS_TILES) * this._tileSize;
    const baseSize = randRange(BIRD_MIN_SIZE_TILES, BIRD_MAX_SIZE_TILES) * this._tileSize;
    const birds: FlockBird[] = [{
      offsetAlong: 0,
      offsetAcross: 0,
      size: baseSize * 1.04,
      strokeWidth: clamp(baseSize * 0.24, BIRD_STROKE_MIN, BIRD_STROKE_MAX),
    }];

    for (let rank = 1; rank <= armDepth; rank++) {
      const offsetAlong = -rank * spacingAlong;
      const offsetAcross = rank * spacingAcross;
      const size = baseSize * randRange(0.9, 1.08);
      const strokeWidth = clamp(size * 0.24, BIRD_STROKE_MIN, BIRD_STROKE_MAX);
      birds.push(
        { offsetAlong, offsetAcross, size, strokeWidth },
        { offsetAlong, offsetAcross: -offsetAcross, size, strokeWidth },
      );
    }

    return birds;
  }

  private _pickSpawnEdge(): CloudSpawnEdge {
    const edges: CloudSpawnEdge[] = ['top', 'right', 'bottom', 'left'];
    return edges[Math.floor(Math.random() * edges.length)];
  }

  private _getInwardAngle(edge: CloudSpawnEdge): number {
    switch (edge) {
      case 'top':
        return Math.PI / 2;
      case 'right':
        return Math.PI;
      case 'bottom':
        return -Math.PI / 2;
      case 'left':
      default:
        return 0;
    }
  }

  private _buildSpawnPoint(edge: CloudSpawnEdge, margin: number): { x: number; y: number } {
    switch (edge) {
      case 'top':
        return { x: randRange(0, this._width), y: -margin };
      case 'right':
        return { x: this._width + margin, y: randRange(0, this._height) };
      case 'bottom':
        return { x: randRange(0, this._width), y: this._height + margin };
      case 'left':
      default:
        return { x: -margin, y: randRange(0, this._height) };
    }
  }
}
