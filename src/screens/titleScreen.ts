import { drawPipeBody } from '../renderer';
import { BG_COLOR, LABEL_COLOR, PIPE_COLOR, TILE_BG, WATER_COLOR } from '../colors';
import type { Rotation } from '../types';
import { Direction, PipeShape } from '../types';
import { oppositeDirection } from '../tile';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { getActiveSlotIndex } from '../profile/activeProfile';
import { loadSlotMeta } from '../profile/playerProfileSlots';
import { loadSfxVolume } from '../persistence';
import { t } from '../i18n';

type TitleLetter = 'C' | 'O' | 'L' | 'P' | 'I' | 'E' | 'S';

interface GlyphCell {
  readonly row: number;
  readonly col: number;
  readonly letterIndex: number;
  readonly directions: ReadonlySet<Direction>;
  readonly shape: PipeShape;
  readonly rotation: Rotation;
}

interface GlyphLayout {
  readonly cells: readonly GlyphCell[];
  readonly rows: number;
  readonly cols: number;
  readonly letterCount: number;
}

const TITLE_TEXT = 'COOL PIPES';
const COOL_LETTER_COUNT = Math.max(0, TITLE_TEXT.indexOf(' '));
const WORD_GAP_COLUMNS = 2;
const LETTER_GAP_COLUMNS = 1;
const TILE_PADDING_RATIO = 0.08;
const MIN_TILE_SIZE = 16;
/** Generous upper bound; the width-driven sizing will normally cap tiles below this. */
const MAX_TILE_SIZE = 56;
const LETTER_FILL_STEP_MS = 100;
const LETTER_GAP_MS = 150;
const PROMPT_FADE_MS = 900;
const OVERLAY_ALPHA = 0.96;
/** Pixel height of each glyph bitmap (rows in every GLYPHS entry). */
const GLYPH_ROWS = 7;
const PRESS_PROMPT_COLOR = '#d6e8ff';
const PRESS_PROMPT_FONT_WEIGHT = 600;
const PRESS_PROMPT_FONT_FAMILY = 'Arial, sans-serif';
const PRESS_PROMPT_FONT_SIZE_RATIO = 0.95;
const ICICLE_MIN_PER_LETTER = 2;
const ICICLE_MAX_PER_LETTER = 4;
const ICICLE_GROWTH_START_JITTER_MS = 420;
const ICICLE_MIN_GROWTH_MS = 1400;
const ICICLE_MAX_GROWTH_MS = 3000;
const ICICLE_MIN_LENGTH_RATIO = 0.75;
const ICICLE_MAX_LENGTH_RATIO = 2.25;
const ICICLE_MIN_HALF_WIDTH_RATIO = 0.08;
const ICICLE_MAX_HALF_WIDTH_RATIO = 0.24;
const ICICLE_DROP_DELAY_MAX_MS = 520;
const ICICLE_DROP_MIN_INTERVAL_MS = 380;
const ICICLE_DROP_MAX_INTERVAL_MS = 820;
const ICICLE_DETACH_MAX_JITTER_MS = 299;
const ICICLE_FALL_ACCEL_PX = 1700;
const ICICLE_MIN_FALL_SPEED_RATIO = 2.6;
const ICICLE_MAX_FALL_SPEED_RATIO = 4.2;
const ICICLE_MAX_DRIFT_SPEED_RATIO = 0.22;
const DROPLET_FALL_ACCEL_PX = 1600;
const DROPLET_MIN_SPEED_RATIO = 1.2;
const DROPLET_MAX_SPEED_RATIO = 2.0;
const DROPLET_MIN_RADIUS_RATIO = 0.045;
const DROPLET_MAX_RADIUS_RATIO = 0.085;
const DROPLET_MAX_JITTER_X_RATIO = 0.18;
const DROPLET_OFFSCREEN_MARGIN = 16;
const ICICLE_OFFSCREEN_MARGIN = 24;

interface IntroIcicleSeed {
  readonly letterIndex: number;
  readonly row: number;
  readonly col: number;
  readonly anchorOffsetRatio: number;
  readonly growthStartMs: number;
  readonly growthDurationMs: number;
  readonly maxLengthRatio: number;
  readonly maxHalfWidthRatio: number;
  readonly dropIntervalMs: number;
  readonly dropDelayMs: number;
  readonly detachDelayMs: number;
  readonly fallSpeedRatio: number;
  readonly driftSpeedRatio: number;
}

interface IntroDroplet {
  x: number;
  y: number;
  vy: number;
  radius: number;
}

interface IntroIcicleState extends IntroIcicleSeed {
  nextDropMs: number;
  detached: boolean;
  detachedAtMs: number;
  detachedX: number;
  detachedY: number;
  detachedLength: number;
  detachedHalfWidth: number;
  fallenOffscreen: boolean;
}

const GLYPHS: Record<TitleLetter, readonly string[]> = {
  C: [
    '01110',
    '11011',
    '11000',
    '11000',
    '11000',
    '11011',
    '01110',
  ],
  O: [
    '01110',
    '11011',
    '11011',
    '11011',
    '11011',
    '11011',
    '01110',
  ],
  L: [
    '11000',
    '11000',
    '11000',
    '11000',
    '11000',
    '11000',
    '11111',
  ],
  P: [
    '11110',
    '11011',
    '11011',
    '11110',
    '11000',
    '11000',
    '11000',
  ],
  I: [
    '11111',
    '00110',
    '00110',
    '00110',
    '00110',
    '00110',
    '11111',
  ],
  E: [
    '11111',
    '11000',
    '11000',
    '11110',
    '11000',
    '11000',
    '11111',
  ],
  S: [
    '01111',
    '11000',
    '11000',
    '01110',
    '00011',
    '00011',
    '11110',
  ],
};

const DIRECTION_DELTAS: ReadonlyArray<readonly [Direction, number, number]> = [
  [Direction.North, -1, 0],
  [Direction.East, 0, 1],
  [Direction.South, 1, 0],
  [Direction.West, 0, -1],
];
const DIRECTION_TO_DELTA = new Map<Direction, readonly [number, number]>(
  DIRECTION_DELTAS.map(([direction, dr, dc]) => [direction, [dr, dc] as const]),
);

function key(row: number, col: number): string {
  return `${row},${col}`;
}

function decodeKey(encoded: string): { row: number; col: number } {
  const [rowText, colText] = encoded.split(',');
  return { row: Number(rowText), col: Number(colText) };
}

function deltaForDirection(direction: Direction): readonly [number, number] {
  return DIRECTION_TO_DELTA.get(direction) ?? [0, 0];
}

/** degree === 3: exactly one of N/E/S/W is missing. */
function _pipeShapeForDegree3(hasN: boolean, hasE: boolean, hasW: boolean): { shape: PipeShape; rotation: Rotation } {
  if (!hasW) return { shape: PipeShape.Tee, rotation: 0 };
  if (!hasN) return { shape: PipeShape.Tee, rotation: 90 };
  if (!hasE) return { shape: PipeShape.Tee, rotation: 180 };
  return { shape: PipeShape.Tee, rotation: 270 };
}

/** degree === 2: true for a straight-through pair (N+S or E+W), false for an elbow pair. */
function _isStraightPairDegree2(hasN: boolean, hasS: boolean, hasE: boolean, hasW: boolean): boolean {
  return (hasN && hasS) || (hasE && hasW);
}

/** degree === 2, elbow case: the rotation for whichever adjacent pair of directions is present. */
function _elbowRotationForDegree2(hasN: boolean, hasE: boolean, hasS: boolean, hasW: boolean): Rotation {
  if (hasN && hasE) return 0;
  if (hasE && hasS) return 90;
  if (hasS && hasW) return 180;
  return 270;
}

/** degree === 2: either a straight-through pair (N+S or E+W) or an elbow pair. */
function _pipeShapeForDegree2(hasN: boolean, hasE: boolean, hasS: boolean, hasW: boolean): { shape: PipeShape; rotation: Rotation } {
  if (_isStraightPairDegree2(hasN, hasS, hasE, hasW)) {
    return { shape: PipeShape.Straight, rotation: hasN ? 0 : 90 };
  }
  return { shape: PipeShape.Elbow, rotation: _elbowRotationForDegree2(hasN, hasE, hasS, hasW) };
}

/** degree <= 1: a single stub (or none), oriented horizontally or vertically. */
function _pipeShapeForDegree1(hasE: boolean, hasW: boolean): { shape: PipeShape; rotation: Rotation } {
  if (hasE || hasW) {
    return { shape: PipeShape.Straight, rotation: 90 };
  }
  return { shape: PipeShape.Straight, rotation: 0 };
}

function pipeShapeFromDirections(directions: ReadonlySet<Direction>): { shape: PipeShape; rotation: Rotation } {
  const hasN = directions.has(Direction.North);
  const hasE = directions.has(Direction.East);
  const hasS = directions.has(Direction.South);
  const hasW = directions.has(Direction.West);
  const degree = directions.size;

  if (degree >= 4) return { shape: PipeShape.Cross, rotation: 0 };
  if (degree === 3) return _pipeShapeForDegree3(hasN, hasE, hasW);
  if (degree === 2) return _pipeShapeForDegree2(hasN, hasE, hasS, hasW);
  return _pipeShapeForDegree1(hasE, hasW);
}

/** The set of occupied glyph-bitmap cells for one letter, keyed by `key(row, col)` (col offset by `colOffset`). */
function _buildOccupiedSetForGlyph(glyph: readonly string[], colOffset: number): Set<string> {
  const occupied = new Set<string>();
  for (let row = 0; row < glyph.length; row++) {
    const rowText = glyph[row];
    for (let col = 0; col < rowText.length; col++) {
      if (rowText[col] === '1') {
        occupied.add(key(row, colOffset + col));
      }
    }
  }
  return occupied;
}

/** Which cardinal directions have an occupied neighbor cell. */
function _computeCellDirections(occupied: ReadonlySet<string>, row: number, col: number): Set<Direction> {
  const directions = new Set<Direction>();
  for (const [direction, dr, dc] of DIRECTION_DELTAS) {
    if (occupied.has(key(row + dr, col + dc))) {
      directions.add(direction);
    }
  }
  return directions;
}

/** Build all GlyphCells for one letter's occupied bitmap. */
function _buildGlyphCellsForLetter(glyph: readonly string[], colOffset: number, letterIndex: number): GlyphCell[] {
  const occupied = _buildOccupiedSetForGlyph(glyph, colOffset);
  const cells: GlyphCell[] = [];
  for (const posKey of occupied) {
    const { row, col } = decodeKey(posKey);
    const directions = _computeCellDirections(occupied, row, col);
    const { shape, rotation } = pipeShapeFromDirections(directions);
    cells.push({ row, col, letterIndex, directions, shape, rotation });
  }
  return cells;
}

export function buildTitleGlyphLayout(text = TITLE_TEXT): GlyphLayout {
  const cells: GlyphCell[] = [];
  let letterIndex = 0;
  let colOffset = 0;
  let seenLetter = false;

  for (const rawChar of text) {
    const glyph = GLYPHS[rawChar as TitleLetter];
    if (!glyph) {
      // Unrecognised character (space) → word gap.
      if (seenLetter) {
        colOffset += WORD_GAP_COLUMNS;
      }
      continue;
    }

    if (seenLetter) {
      colOffset += LETTER_GAP_COLUMNS;
    }
    seenLetter = true;

    cells.push(..._buildGlyphCellsForLetter(glyph, colOffset, letterIndex));

    letterIndex++;
    colOffset += glyph[0]?.length ?? 0;
  }

  return {
    cells,
    rows: GLYPH_ROWS,
    cols: colOffset,
    letterCount: letterIndex,
  };
}

/** Append `value` to the array stored at `key` in `map`, creating it if absent. */
function _pushToBucket<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

/** True when `neighbor` is reachable from `current` by traversing `direction` (same letter, connections match up). */
function _isTraversableNeighbor(current: GlyphCell, neighbor: GlyphCell | undefined, direction: Direction): boolean {
  return (
    !!neighbor &&
    neighbor.letterIndex === current.letterIndex &&
    neighbor.directions.has(oppositeDirection(direction))
  );
}

/**
 * BFS outward from one letter's top-left-most cell along its pipe connections,
 * recording each reached cell's depth. Used to stagger the fill animation.
 */
function _computeLetterCellDepths(
  letterCells: readonly GlyphCell[],
  cellLookup: ReadonlyMap<string, GlyphCell>,
): { depths: Map<string, number>; maxDepth: number } {
  const depths = new Map<string, number>();
  if (letterCells.length === 0) return { depths, maxDepth: 0 };

  const sorted = [...letterCells].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const start = sorted[0];
  const startKey = key(start.row, start.col);
  const queue: Array<{ encoded: string; depth: number }> = [{ encoded: startKey, depth: 0 }];
  const seen = new Set<string>([startKey]);
  let maxDepth = 0;

  for (let qi = 0; qi < queue.length; qi++) {
    const { encoded, depth } = queue[qi];
    depths.set(encoded, depth);
    if (depth > maxDepth) maxDepth = depth;
    const current = cellLookup.get(encoded);
    if (!current) continue;
    for (const direction of current.directions) {
      const [dr, dc] = deltaForDirection(direction);
      const nextKey = key(current.row + dr, current.col + dc);
      if (seen.has(nextKey)) continue;
      const neighbor = cellLookup.get(nextKey);
      if (!_isTraversableNeighbor(current, neighbor, direction)) continue;
      seen.add(nextKey);
      queue.push({ encoded: nextKey, depth: depth + 1 });
    }
  }

  return { depths, maxDepth };
}

function buildLetterDepthMap(layout: GlyphLayout): {
  readonly depths: Map<string, number>;
  readonly letterStarts: readonly number[];
  readonly allLettersDoneAt: number;
} {
  const byLetter = new Map<number, GlyphCell[]>();
  for (const cell of layout.cells) {
    _pushToBucket(byLetter, cell.letterIndex, cell);
  }

  const cellLookup = new Map<string, GlyphCell>();
  for (const cell of layout.cells) {
    cellLookup.set(key(cell.row, cell.col), cell);
  }

  const depths = new Map<string, number>();
  const letterStarts: number[] = [];
  let currentStart = 0;
  for (let i = 0; i < layout.letterCount; i++) {
    letterStarts.push(currentStart);
    const letterCells = byLetter.get(i) ?? [];
    const { depths: letterDepths, maxDepth } = _computeLetterCellDepths(letterCells, cellLookup);
    for (const [encoded, depth] of letterDepths) depths.set(encoded, depth);
    if (letterCells.length > 0) {
      currentStart += (maxDepth + 1) * LETTER_FILL_STEP_MS + LETTER_GAP_MS;
    }
  }

  return { depths, letterStarts, allLettersDoneAt: currentStart };
}

export function buildLetterFillDoneTimes(layout: GlyphLayout, letterStarts: readonly number[], allLettersDoneAt: number): readonly number[] {
  const doneTimes: number[] = [];
  for (let i = 0; i < layout.letterCount; i++) {
    const nextStart = letterStarts[i + 1] ?? allLettersDoneAt;
    doneTimes.push(Math.max(letterStarts[i] ?? 0, nextStart - LETTER_GAP_MS));
  }
  return doneTimes;
}

function randomIntInclusive(min: number, max: number, random: () => number): number {
  const low = Math.ceil(Math.min(min, max));
  const high = Math.floor(Math.max(min, max));
  return Math.floor(random() * (high - low + 1)) + low;
}

function randomRange(min: number, max: number, random: () => number): number {
  return min + (max - min) * random();
}

function pickRandomUnique<T>(items: readonly T[], count: number, random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIntInclusive(0, i, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.max(0, Math.min(count, copy.length)));
}

function collectLetterBottomCells(layout: GlyphLayout): Map<number, GlyphCell[]> {
  const byLetter = new Map<number, GlyphCell[]>();
  const cellLookup = new Set(layout.cells.map((cell) => key(cell.row, cell.col)));
  for (const cell of layout.cells) {
    const below = key(cell.row + 1, cell.col);
    if (cellLookup.has(below)) {
      continue;
    }
    _pushToBucket(byLetter, cell.letterIndex, cell);
  }
  return byLetter;
}

export function buildIntroIcicleSeeds(
  layout: GlyphLayout,
  flow: { readonly letterStarts: readonly number[]; readonly allLettersDoneAt: number },
  random: () => number = Math.random,
): readonly IntroIcicleSeed[] {
  const bottomCells = collectLetterBottomCells(layout);
  const fillDoneTimes = buildLetterFillDoneTimes(layout, flow.letterStarts, flow.allLettersDoneAt);
  const seeds: IntroIcicleSeed[] = [];
  for (let letterIndex = 0; letterIndex < Math.min(COOL_LETTER_COUNT, layout.letterCount); letterIndex++) {
    const anchors = bottomCells.get(letterIndex) ?? [];
    if (anchors.length === 0) continue;
    const count = randomIntInclusive(ICICLE_MIN_PER_LETTER, ICICLE_MAX_PER_LETTER, random);
    const selected = pickRandomUnique(anchors, count, random);
    const letterFillDoneAt = fillDoneTimes[letterIndex] ?? 0;
    for (const anchor of selected) {
      const growthDurationMs = randomRange(ICICLE_MIN_GROWTH_MS, ICICLE_MAX_GROWTH_MS, random);
      seeds.push({
        letterIndex,
        row: anchor.row,
        col: anchor.col,
        anchorOffsetRatio: randomRange(-0.5, 0.5, random),
        growthStartMs: letterFillDoneAt + randomRange(0, ICICLE_GROWTH_START_JITTER_MS, random),
        growthDurationMs,
        maxLengthRatio: randomRange(ICICLE_MIN_LENGTH_RATIO, ICICLE_MAX_LENGTH_RATIO, random),
        maxHalfWidthRatio: randomRange(ICICLE_MIN_HALF_WIDTH_RATIO, ICICLE_MAX_HALF_WIDTH_RATIO, random),
        dropIntervalMs: randomRange(ICICLE_DROP_MIN_INTERVAL_MS, ICICLE_DROP_MAX_INTERVAL_MS, random),
        dropDelayMs: randomRange(0, ICICLE_DROP_DELAY_MAX_MS, random),
        detachDelayMs: randomIntInclusive(0, ICICLE_DETACH_MAX_JITTER_MS, random),
        fallSpeedRatio: randomRange(ICICLE_MIN_FALL_SPEED_RATIO, ICICLE_MAX_FALL_SPEED_RATIO, random),
        driftSpeedRatio: randomRange(-ICICLE_MAX_DRIFT_SPEED_RATIO, ICICLE_MAX_DRIFT_SPEED_RATIO, random),
      });
    }
  }
  return seeds;
}

function clamp01(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function anyGamepadButtonPressed(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return false;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (!pad) continue;
    if (pad.buttons.some((button) => button.pressed)) {
      return true;
    }
  }
  return false;
}

function applyIntroSfxVolume(): void {
  const activeSlotIndex = getActiveSlotIndex();
  const activeProfileMeta = activeSlotIndex !== null ? loadSlotMeta(activeSlotIndex) : null;
  if (!activeProfileMeta) {
    sfxManager.setVolume(100);
    return;
  }
  // loadSfxVolume() reads from the currently active slot namespace.
  sfxManager.setVolume(loadSfxVolume());
}

export function showIntroTitleScreen(): Promise<void> {
  return new Promise((resolve) => {
    applyIntroSfxVolume();
    const random = Math.random;

    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:2000',
      'user-select:none',
      `background:rgba(26,26,46,${OVERLAY_ALPHA})`,
    ].join(';');

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      overlay.remove();
      resolve();
      return;
    }

    const layout = buildTitleGlyphLayout();
    const flow = buildLetterDepthMap(layout);
    const icicles: IntroIcicleState[] = buildIntroIcicleSeeds(layout, flow).map((seed) => ({
      ...seed,
      nextDropMs: seed.growthStartMs + seed.growthDurationMs + seed.dropDelayMs,
      detached: false,
      detachedAtMs: 0,
      detachedX: 0,
      detachedY: 0,
      detachedLength: 0,
      detachedHalfWidth: 0,
      fallenOffscreen: false,
    }));
    const droplets: IntroDroplet[] = [];
    const startMs = performance.now();
    let lastFrameMs = startMs;
    let rafId: number | null = null;
    let cleaned = false;

    const cleanup = (stopSfx = true) => {
      if (cleaned) return;
      cleaned = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (stopSfx) {
        sfxManager.stopAll();
      }
      window.removeEventListener('resize', renderFrame);
      window.removeEventListener('keydown', onExitInput, true);
      window.removeEventListener('pointerdown', onExitInput, true);
      window.removeEventListener('mousedown', onExitInput, true);
      window.removeEventListener('touchstart', onExitInput, true);
      overlay.remove();
    };

    const finish = (stopSfx = true) => {
      cleanup(stopSfx);
      resolve();
    };

    let exiting = false;
    let exitElapsedMs = 0;
    const onExitInput = () => {
      if (cleaned) return;
      if (exiting) return;
      exiting = true;
      exitElapsedMs = performance.now() - startMs;
      sfxManager.stopAll();
      if (icicles.length === 0) {
        sfxManager.playWithDoneCallback(SfxId.UIConfirm, () => {
          finish(false);
        });
        return;
      }
      sfxManager.play(SfxId.UIConfirm);
    };

    /** Resize the backing canvas to the current viewport/DPR if needed; returns the CSS-pixel viewport size. */
    const resizeCanvasIfNeeded = (): { width: number; height: number } => {
      const rawDpr = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
      const dpr = Math.max(1, Math.floor(rawDpr));
      const width = Math.max(1, Math.floor(window.innerWidth));
      const height = Math.max(1, Math.floor(window.innerHeight));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width, height };
    };

    /**
     * Logo is a single wide row – give it most of the viewport width and
     * up to ~55% of the height so tiles can be generously sized on landscape.
     */
    const computeLayoutGeometry = (width: number, height: number) => {
      const availableWidth = Math.max(1, width * 0.96);
      const availableHeight = Math.max(1, height * 0.55);
      const tileSize = Math.max(
        MIN_TILE_SIZE,
        Math.min(
          MAX_TILE_SIZE,
          Math.floor(
            Math.min(
              availableWidth / Math.max(1, layout.cols),
              availableHeight / Math.max(1, layout.rows),
            ),
          ),
        ),
      );
      const titleWidth = layout.cols * tileSize;
      const titleHeight = layout.rows * tileSize;
      const originX = Math.floor((width - titleWidth) / 2);
      const originY = Math.floor(height * 0.16);
      const half = tileSize / 2;
      const pad = Math.max(1, Math.floor(tileSize * TILE_PADDING_RATIO));
      return { tileSize, titleWidth, titleHeight, originX, originY, half, pad };
    };
    type FrameGeometry = ReturnType<typeof computeLayoutGeometry>;

    const drawGlyphCells = (geom: FrameGeometry, elapsed: number): void => {
      for (const cell of layout.cells) {
        const cellKey = key(cell.row, cell.col);
        const depth = flow.depths.get(cellKey) ?? 0;
        const letterStart = flow.letterStarts[cell.letterIndex] ?? 0;
        const isFilled = elapsed >= letterStart + depth * LETTER_FILL_STEP_MS;
        const x = geom.originX + cell.col * geom.tileSize;
        const y = geom.originY + cell.row * geom.tileSize;
        ctx.fillStyle = TILE_BG;
        ctx.fillRect(x + geom.pad, y + geom.pad, geom.tileSize - geom.pad * 2, geom.tileSize - geom.pad * 2);

        ctx.save();
        ctx.translate(x + geom.half, y + geom.half);
        ctx.rotate((cell.rotation * Math.PI) / 180);
        const fillColor = isFilled
          ? (cell.letterIndex < COOL_LETTER_COUNT ? LABEL_COLOR : WATER_COLOR)
          : PIPE_COLOR;
        drawPipeBody(ctx, { shape: cell.shape, half: geom.half - geom.pad, localButtEndDirs: undefined, fillColor });
        ctx.restore();
      }
    };

    /** Advance droplet physics and drop any that have fallen past the bottom of the viewport. */
    const updateDroplets = (height: number, dt: number): void => {
      for (let i = droplets.length - 1; i >= 0; i--) {
        const droplet = droplets[i];
        droplet.vy += DROPLET_FALL_ACCEL_PX * dt;
        droplet.y += droplet.vy * dt;
        if (droplet.y - droplet.radius > height + DROPLET_OFFSCREEN_MARGIN) {
          droplets.splice(i, 1);
        }
      }
    };

    const drawDroplets = (): void => {
      if (droplets.length === 0) return;
      ctx.fillStyle = WATER_COLOR;
      for (const droplet of droplets) {
        ctx.beginPath();
        ctx.arc(droplet.x, droplet.y, droplet.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    /** Transition an icicle from growing to detached-and-falling once the exit sequence reaches it. */
    const maybeDetachIcicle = (
      icicle: IntroIcicleState,
      anchorX: number,
      anchorY: number,
      currentLength: number,
      currentHalfWidth: number,
      elapsed: number,
    ): void => {
      if (!exiting) return;
      if (icicle.detached) return;
      if (elapsed < exitElapsedMs + icicle.detachDelayMs) return;
      icicle.detached = true;
      icicle.detachedAtMs = elapsed;
      icicle.detachedX = anchorX;
      icicle.detachedY = anchorY;
      icicle.detachedLength = currentLength;
      icicle.detachedHalfWidth = currentHalfWidth;
    };

    const drawGrowingIcicle = (anchorX: number, anchorY: number, currentLength: number, currentHalfWidth: number): void => {
      if (currentLength <= 0.5 || currentHalfWidth <= 0.5) return;
      ctx.fillStyle = LABEL_COLOR;
      ctx.beginPath();
      ctx.moveTo(anchorX - currentHalfWidth, anchorY);
      ctx.lineTo(anchorX + currentHalfWidth, anchorY);
      ctx.lineTo(anchorX, anchorY + currentLength);
      ctx.closePath();
      ctx.fill();
    };

    const spawnDropletsFromIcicle = (
      icicle: IntroIcicleState,
      anchorX: number,
      anchorY: number,
      currentLength: number,
      tileSize: number,
      growth: number,
      elapsed: number,
    ): void => {
      if (exiting) return;
      if (growth < 1) return;
      while (elapsed >= icicle.nextDropMs) {
        droplets.push({
          x: anchorX + randomRange(-DROPLET_MAX_JITTER_X_RATIO, DROPLET_MAX_JITTER_X_RATIO, random) * tileSize,
          y: anchorY + currentLength,
          vy: randomRange(DROPLET_MIN_SPEED_RATIO, DROPLET_MAX_SPEED_RATIO, random) * tileSize,
          radius: randomRange(DROPLET_MIN_RADIUS_RATIO, DROPLET_MAX_RADIUS_RATIO, random) * tileSize,
        });
        icicle.nextDropMs += icicle.dropIntervalMs;
      }
    };

    const drawFallingIcicle = (icicle: IntroIcicleState, height: number, tileSize: number, elapsed: number): void => {
      const fallSeconds = Math.max(0, (elapsed - icicle.detachedAtMs) / 1000);
      const detachedX = icicle.detachedX + icicle.driftSpeedRatio * tileSize * fallSeconds;
      const detachedY = icicle.detachedY
        + (icicle.fallSpeedRatio * tileSize) * fallSeconds
        + 0.5 * ICICLE_FALL_ACCEL_PX * fallSeconds * fallSeconds;
      const detachedLength = Math.max(1, icicle.detachedLength);
      const detachedHalfWidth = Math.max(1, icicle.detachedHalfWidth);
      if (detachedY - detachedHalfWidth > height + detachedLength + ICICLE_OFFSCREEN_MARGIN) {
        icicle.fallenOffscreen = true;
        return;
      }
      ctx.fillStyle = LABEL_COLOR;
      ctx.beginPath();
      ctx.moveTo(detachedX - detachedHalfWidth, detachedY);
      ctx.lineTo(detachedX + detachedHalfWidth, detachedY);
      ctx.lineTo(detachedX, detachedY + detachedLength);
      ctx.closePath();
      ctx.fill();
    };

    const updateAndDrawIcicle = (icicle: IntroIcicleState, geom: FrameGeometry, height: number, elapsed: number): void => {
      if (icicle.fallenOffscreen) return;

      const growth = clamp01((elapsed - icicle.growthStartMs) / Math.max(1, icicle.growthDurationMs));
      const currentLength = Math.max(0, geom.tileSize * icicle.maxLengthRatio * growth);
      const currentHalfWidth = Math.max(0, geom.tileSize * icicle.maxHalfWidthRatio * growth);
      const anchorX = geom.originX + (icicle.col + 0.5 + icicle.anchorOffsetRatio * 0.34) * geom.tileSize;
      const anchorY = geom.originY + (icicle.row + 1) * geom.tileSize - geom.pad * 0.2;

      maybeDetachIcicle(icicle, anchorX, anchorY, currentLength, currentHalfWidth, elapsed);

      if (!icicle.detached) {
        drawGrowingIcicle(anchorX, anchorY, currentLength, currentHalfWidth);
        spawnDropletsFromIcicle(icicle, anchorX, anchorY, currentLength, geom.tileSize, growth, elapsed);
        return;
      }

      drawFallingIcicle(icicle, height, geom.tileSize, elapsed);
    };

    const updateAndDrawIcicles = (geom: FrameGeometry, height: number, elapsed: number): void => {
      for (const icicle of icicles) {
        updateAndDrawIcicle(icicle, geom, height, elapsed);
      }
    };

    const drawPressPrompt = (geom: FrameGeometry, elapsed: number, width: number): void => {
      const pressFade = clamp01((elapsed - flow.allLettersDoneAt) / PROMPT_FADE_MS);
      if (pressFade <= 0 || exiting) return;
      ctx.save();
      ctx.globalAlpha = pressFade;
      ctx.fillStyle = PRESS_PROMPT_COLOR;
      const fontSize = Math.max(20, Math.floor(geom.tileSize * PRESS_PROMPT_FONT_SIZE_RATIO));
      ctx.font = `${PRESS_PROMPT_FONT_WEIGHT} ${fontSize}px ${PRESS_PROMPT_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(t('title.pressAnyKey'), Math.floor(width / 2), geom.originY + geom.titleHeight + Math.floor(geom.tileSize * 1.6));
      ctx.restore();
    };

    const draw = (now: number) => {
      if (cleaned) return;
      const dt = Math.max(0, Math.min(0.05, (now - lastFrameMs) / 1000));
      lastFrameMs = now;
      const elapsed = now - startMs;

      const { width, height } = resizeCanvasIfNeeded();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = BG_COLOR;
      ctx.fillRect(0, 0, width, height);

      const geom = computeLayoutGeometry(width, height);

      drawGlyphCells(geom, elapsed);
      updateDroplets(height, dt);
      updateAndDrawIcicles(geom, height, elapsed);
      drawDroplets();
      drawPressPrompt(geom, elapsed, width);

      if (!exiting && anyGamepadButtonPressed()) {
        onExitInput();
      }
      if (exiting && icicles.length > 0 && icicles.every((icicle) => icicle.fallenOffscreen)) {
        finish(false);
        return;
      }
      rafId = requestAnimationFrame(draw);
    };

    const renderFrame = () => {
      if (cleaned) return;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', renderFrame);
    window.addEventListener('keydown', onExitInput, true);
    window.addEventListener('pointerdown', onExitInput, true);
    window.addEventListener('mousedown', onExitInput, true);
    window.addEventListener('touchstart', onExitInput, true);

    sfxManager.play(SfxId.TitleBubbles);
    rafId = requestAnimationFrame(draw);
  });
}
