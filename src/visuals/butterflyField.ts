import { GridPos, LevelStyle, PipeShape } from '../types';

const TAU = Math.PI * 2;
const MIN_TILE_SIZE = 1;
const TILES_PER_BUTTERFLY = 25;
const MIN_SCALE_TILES = 0.10;
const MAX_SCALE_TILES = 0.20;
const OFFGRID_MARGIN_TILES = 1.5;
const BASE_FLAP_PERIOD_MS = 250;
const LANDED_FLAP_PERIOD_MS = 2000;
const TILE_TRAVERSE_MS = 3000;
const MIN_SPAWN_COOLDOWN_MS = 5000;
const MAX_SPAWN_COOLDOWN_MS = 10000;
const MIN_LAND_MS = 10_000;
const MAX_LAND_MS = 15_000;
const MAX_TURN_PER_FLAP_RAD = Math.PI / 12;
const SPAWN_HEADING_JITTER_RAD = Math.PI / 5;
const BODY_LENGTH_SCALE = 1.1;
const BODY_LINE_WIDTH_SCALE = 0.075;
const WING_STROKE_WIDTH_SCALE = 0.06;
const BODY_INSIDE_TILE_BUFFER_SCALE = 0.12;
const MIN_WING_OPENNESS = 0.35;
const WING_ALPHA = 0.8;
const HEAD_RATIO = 0.54;

interface ButterflyBoard {
  getTile(pos: GridPos): { shape: PipeShape } | null;
}

interface Butterfly {
  x: number;
  y: number;
  heading: number;
  sizePx: number;
  color: string;
  hasLanded: boolean;
  isLanded: boolean;
  landStartTime: number;
  landEndTime: number;
  segmentStartX: number;
  segmentStartY: number;
  segmentStartTime: number;
  segmentDistancePx: number;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class ButterflyField {
  private _enabled = false;
  private _width = 0;
  private _height = 0;
  private _tileSize = 1;
  private _targetCount = 0;
  private _board: ButterflyBoard | null = null;
  private _butterflies: Butterfly[] = [];
  private _nextSpawnAt = 0;

  resetForLevel(
    width: number,
    height: number,
    tileSize: number,
    style: LevelStyle | undefined,
    board: ButterflyBoard | null,
  ): void {
    this._width = width;
    this._height = height;
    this._tileSize = Math.max(MIN_TILE_SIZE, tileSize);
    this._board = board;
    this._enabled = style === 'Grass' && width > 0 && height > 0;
    this._butterflies = [];
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

    for (let i = this._butterflies.length - 1; i >= 0; i--) {
      const butterfly = this._butterflies[i];
      this._updateButterflyState(butterfly, now);
      if (this._isFullyOutOfBounds(butterfly)) {
        this._butterflies.splice(i, 1);
      }
    }

    while (this._butterflies.length < this._targetCount && now >= this._nextSpawnAt) {
      this._butterflies.push(this._spawnButterfly(now));
      this._nextSpawnAt = now + randRange(MIN_SPAWN_COOLDOWN_MS, MAX_SPAWN_COOLDOWN_MS);
    }

    for (const butterfly of this._butterflies) {
      this._drawButterfly(ctx, butterfly, now);
    }
  }

  private _computeTargetCount(): number {
    const areaTiles = (this._width / this._tileSize) * (this._height / this._tileSize);
    return Math.max(1, Math.round(areaTiles / TILES_PER_BUTTERFLY));
  }

  private _spawnButterfly(now: number): Butterfly {
    const sizePx = randRange(MIN_SCALE_TILES, MAX_SCALE_TILES) * this._tileSize;
    const margin = this._tileSize * OFFGRID_MARGIN_TILES + sizePx * 2;
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    let inwardHeading = 0;
    if (edge === 0) {
      x = Math.random() * this._width;
      y = -margin;
      inwardHeading = Math.PI / 2;
    } else if (edge === 1) {
      x = this._width + margin;
      y = Math.random() * this._height;
      inwardHeading = Math.PI;
    } else if (edge === 2) {
      x = Math.random() * this._width;
      y = this._height + margin;
      inwardHeading = -Math.PI / 2;
    } else {
      x = -margin;
      y = Math.random() * this._height;
      inwardHeading = 0;
    }

    const heading = inwardHeading + randRange(-SPAWN_HEADING_JITTER_RAD, SPAWN_HEADING_JITTER_RAD);
    const hue = Math.floor(Math.random() * 360);
    const color = `hsl(${hue}, 95%, 56%)`;

    return {
      x,
      y,
      heading,
      sizePx,
      color,
      hasLanded: false,
      isLanded: false,
      landStartTime: 0,
      landEndTime: 0,
      segmentStartX: x,
      segmentStartY: y,
      segmentStartTime: now,
      segmentDistancePx: this._distancePerFlapPx(),
    };
  }

  private _distancePerFlapPx(): number {
    const avgDistance = this._tileSize * (BASE_FLAP_PERIOD_MS / TILE_TRAVERSE_MS);
    return avgDistance * randRange(0.85, 1.15);
  }

  private _updateButterflyState(butterfly: Butterfly, now: number): void {
    if (butterfly.isLanded) {
      if (now >= butterfly.landEndTime) {
        butterfly.isLanded = false;
        butterfly.heading = Math.random() * TAU;
        butterfly.segmentStartX = butterfly.x;
        butterfly.segmentStartY = butterfly.y;
        butterfly.segmentStartTime = now;
        butterfly.segmentDistancePx = this._distancePerFlapPx();
      }
      return;
    }

    while (now - butterfly.segmentStartTime >= BASE_FLAP_PERIOD_MS) {
      butterfly.x = butterfly.segmentStartX + Math.cos(butterfly.heading) * butterfly.segmentDistancePx;
      butterfly.y = butterfly.segmentStartY + Math.sin(butterfly.heading) * butterfly.segmentDistancePx;
      butterfly.segmentStartX = butterfly.x;
      butterfly.segmentStartY = butterfly.y;
      butterfly.segmentStartTime += BASE_FLAP_PERIOD_MS;
      butterfly.heading += randRange(-MAX_TURN_PER_FLAP_RAD, MAX_TURN_PER_FLAP_RAD);
      butterfly.segmentDistancePx = this._distancePerFlapPx();
    }

    const flapProgress = clamp((now - butterfly.segmentStartTime) / BASE_FLAP_PERIOD_MS, 0, 1);
    butterfly.x = butterfly.segmentStartX + Math.cos(butterfly.heading) * butterfly.segmentDistancePx * flapProgress;
    butterfly.y = butterfly.segmentStartY + Math.sin(butterfly.heading) * butterfly.segmentDistancePx * flapProgress;

    if (!butterfly.hasLanded && this._canLandOnGranite(butterfly)) {
      butterfly.hasLanded = true;
      butterfly.isLanded = true;
      butterfly.landStartTime = now;
      butterfly.landEndTime = now + randRange(MIN_LAND_MS, MAX_LAND_MS);
    }
  }

  private _canLandOnGranite(butterfly: Butterfly): boolean {
    if (!this._board) return false;
    if (
      butterfly.x < 0 ||
      butterfly.y < 0 ||
      butterfly.x >= this._width ||
      butterfly.y >= this._height
    ) return false;
    const col = Math.floor(butterfly.x / this._tileSize);
    const row = Math.floor(butterfly.y / this._tileSize);
    const tile = this._board.getTile({ row, col });
    if (!tile || tile.shape !== PipeShape.Granite) return false;

    const bodyHalfLength = butterfly.sizePx * BODY_LENGTH_SCALE * 0.5;
    const dirX = Math.cos(butterfly.heading);
    const dirY = Math.sin(butterfly.heading);
    const headX = butterfly.x + dirX * bodyHalfLength;
    const headY = butterfly.y + dirY * bodyHalfLength;
    const tailX = butterfly.x - dirX * bodyHalfLength;
    const tailY = butterfly.y - dirY * bodyHalfLength;

    const buffer = this._tileSize * BODY_INSIDE_TILE_BUFFER_SCALE;
    const left = col * this._tileSize + buffer;
    const right = (col + 1) * this._tileSize - buffer;
    const top = row * this._tileSize + buffer;
    const bottom = (row + 1) * this._tileSize - buffer;

    const inside = (x: number, y: number): boolean => x >= left && x <= right && y >= top && y <= bottom;
    return inside(headX, headY) && inside(tailX, tailY) && inside(butterfly.x, butterfly.y);
  }

  private _isFullyOutOfBounds(butterfly: Butterfly): boolean {
    const extent = Math.max(
      butterfly.sizePx * 3,
      this._tileSize * OFFGRID_MARGIN_TILES + butterfly.sizePx * 2,
    );
    return (
      butterfly.x < -extent ||
      butterfly.y < -extent ||
      butterfly.x > this._width + extent ||
      butterfly.y > this._height + extent
    );
  }

  private _wingOpenness(butterfly: Butterfly, now: number): number {
    if (butterfly.isLanded) {
      const cycleProgress = ((now - butterfly.landStartTime) % LANDED_FLAP_PERIOD_MS) / LANDED_FLAP_PERIOD_MS;
      return MIN_WING_OPENNESS + (1 - MIN_WING_OPENNESS)
        * ((Math.sin(cycleProgress * TAU - Math.PI / 2) + 1) * 0.5);
    }
    const flapProgress = clamp((now - butterfly.segmentStartTime) / BASE_FLAP_PERIOD_MS, 0, 1);
    return MIN_WING_OPENNESS + (1 - MIN_WING_OPENNESS) * flapProgress;
  }

  private _drawButterfly(ctx: CanvasRenderingContext2D, butterfly: Butterfly, now: number): void {
    const bodyLength = butterfly.sizePx * BODY_LENGTH_SCALE;
    const bodyHalfLength = bodyLength * 0.5;
    const bodyLineWidth = Math.max(1, butterfly.sizePx * BODY_LINE_WIDTH_SCALE);
    const wingStrokeWidth = Math.max(1, butterfly.sizePx * WING_STROKE_WIDTH_SCALE);
    const openness = this._wingOpenness(butterfly, now);
    const wingYScale = openness;
    const headX = bodyHalfLength * HEAD_RATIO;

    ctx.save();
    ctx.translate(butterfly.x, butterfly.y);
    ctx.rotate(butterfly.heading);
    ctx.strokeStyle = 'black';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineWidth = bodyLineWidth;
    ctx.beginPath();
    ctx.moveTo(-bodyHalfLength, 0);
    ctx.lineTo(bodyHalfLength, 0);
    ctx.stroke();

    const antennaLength = butterfly.sizePx * 0.8;
    const antennaOutX = headX + antennaLength * 0.55;
    const antennaOutY = antennaLength * 0.35;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.quadraticCurveTo(headX + antennaLength * 0.25, -antennaLength * 0.15, antennaOutX, -antennaOutY);
    ctx.moveTo(headX, 0);
    ctx.quadraticCurveTo(headX + antennaLength * 0.25, antennaLength * 0.15, antennaOutX, antennaOutY);
    ctx.stroke();

    ctx.fillStyle = butterfly.color;
    ctx.globalAlpha = WING_ALPHA;
    for (const side of [-1, 1] as const) {
      const wingSign = side * wingYScale;

      ctx.beginPath();
      ctx.moveTo(headX * 0.1, 0);
      ctx.quadraticCurveTo(
        bodyHalfLength * 0.55,
        wingSign * butterfly.sizePx * 1.3,
        bodyHalfLength * 0.9,
        wingSign * butterfly.sizePx * 0.35,
      );
      ctx.quadraticCurveTo(
        bodyHalfLength * 0.4,
        wingSign * butterfly.sizePx * 0.2,
        headX * 0.1,
        0,
      );
      ctx.fill();
      ctx.lineWidth = wingStrokeWidth;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-bodyHalfLength * 0.1, 0);
      ctx.quadraticCurveTo(
        -bodyHalfLength * 0.45,
        wingSign * butterfly.sizePx * 0.95,
        -bodyHalfLength * 0.75,
        wingSign * butterfly.sizePx * 0.2,
      );
      ctx.quadraticCurveTo(
        -bodyHalfLength * 0.35,
        wingSign * butterfly.sizePx * 0.12,
        -bodyHalfLength * 0.1,
        0,
      );
      ctx.fill();
      ctx.lineWidth = wingStrokeWidth;
      ctx.stroke();
    }
    ctx.restore();
  }
}
