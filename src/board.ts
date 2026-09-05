import { Tile, oppositeDirection } from './tile';
import type { AmbientDecoration, AmbientDecorationType, GridPos, InventoryItem, LevelDef, LevelStyle, RegulatorOperator, RegulatorStat, Rotation, TileDef } from './types';
import { Direction, DIRECTIONS, PipeShape, TEMP_RELEVANT_CONTENTS, PRESSURE_RELEVANT_CONTENTS, styleToFloorShape } from './types';
import { ThermoSimulator, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './systems/thermoSimulator';
import { CementSystem } from './systems/cementSystem';
import { ConstraintValidator } from './systems/constraintValidator';
import type { TurnStateSnapshot } from './turnStateManager';
import { TurnStateManager } from './turnStateManager';
import type { TranslationParams } from './i18nTypes';
import { t } from './i18n';

// Re-export cost helpers so existing consumers (game.ts, renderer.ts) need no import changes.
export { computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './systems/thermoSimulator';
export { ERR_SANDSTONE_TOO_HARD } from './systems/constraintValidator';

/**
 * Encode a grid row/col pair into the canonical string key used by all internal
 * board maps (e.g. `_lockedWaterImpact`, `goldSpaces`, `cementData`).
 */
export function posKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Decode a string key produced by {@link posKey} back into [row, col] integers.
 */
export function parseKey(key: string): [number, number] {
  const comma = key.indexOf(',');
  return [parseInt(key, 10), parseInt(key.slice(comma + 1), 10)];
}

/** Neighbor offsets keyed by direction. */
export const NEIGHBOUR_DELTA: Record<Direction, GridPos> = {
  [Direction.North]: { row: -1, col:  0 },
  [Direction.East]:  { row:  0, col:  1 },
  [Direction.South]: { row:  1, col:  0 },
  [Direction.West]:  { row:  0, col: -1 },
};

/** Shapes that consume one water unit when filled (not source/sink/tank). */
export const PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.Straight,
  PipeShape.Elbow,
  PipeShape.Tee,
  PipeShape.Cross,
  PipeShape.GoldStraight,
  PipeShape.GoldElbow,
  PipeShape.GoldTee,
  PipeShape.GoldCross,
  PipeShape.SpinStraight,
  PipeShape.SpinElbow,
  PipeShape.SpinTee,
  PipeShape.SpinStraightCement,
  PipeShape.SpinElbowCement,
  PipeShape.SpinTeeCement,
  PipeShape.LeakyStraight,
  PipeShape.LeakyElbow,
  PipeShape.LeakyTee,
  PipeShape.LeakyCross,
]);

/** Gold pipe shapes – may only be placed on gold spaces. */
export const GOLD_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.GoldStraight,
  PipeShape.GoldElbow,
  PipeShape.GoldTee,
  PipeShape.GoldCross,
]);

/** Spinnable pipe shapes – pre-placed by the editor; player can rotate but not remove them. */
export const SPIN_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.SpinStraight,
  PipeShape.SpinElbow,
  PipeShape.SpinTee,
  PipeShape.SpinStraightCement,
  PipeShape.SpinElbowCement,
  PipeShape.SpinTeeCement,
]);

/** Spinnable-pipe-on-cement shapes – spin pipes that also track a cement drying time. */
export const SPIN_CEMENT_SHAPES = new Set<PipeShape>([
  PipeShape.SpinStraightCement,
  PipeShape.SpinElbowCement,
  PipeShape.SpinTeeCement,
]);

/** Leaky pipe shapes – cost 1 extra water on every turn they remain connected after the first. */
export const LEAKY_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.LeakyStraight,
  PipeShape.LeakyElbow,
  PipeShape.LeakyTee,
  PipeShape.LeakyCross,
]);

/**
 * Cross pipe shapes – symmetric in all four directions and therefore not
 * rotatable.  Attempting to rotate one is a no-op (returns false silently).
 */
export const CROSS_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.Cross,
  PipeShape.GoldCross,
  PipeShape.LeakyCross,
]);

/**
 * Returns true for impassable obstacle tiles (Granite, Tree, Sea).
 * Obstacle tiles have no connections, cannot be moved, and water cannot flow through them.
 */
function isObstacleTile(shape: PipeShape): boolean {
  return shape === PipeShape.Granite || shape === PipeShape.Tree || shape === PipeShape.Tree2
    || shape === PipeShape.Tree3 || shape === PipeShape.Tree4 || shape === PipeShape.Sea;
}

/** All empty-floor shapes that a player may fill with a pipe from inventory. */
export const EMPTY_FLOOR_SHAPES: readonly PipeShape[] = [
  PipeShape.Empty, PipeShape.EmptyFall, PipeShape.EmptyDark, PipeShape.EmptyWinter, PipeShape.EmptySpring,
];

/** Empty-floor shapes with their own distinct rendering (i.e. everything but plain Empty). */
const NAMED_EMPTY_FLOOR_SHAPES = new Set<PipeShape>([
  PipeShape.EmptyFall, PipeShape.EmptyDark, PipeShape.EmptyWinter, PipeShape.EmptySpring,
]);

/** `v ?? fallback`, promoted to a named function so its branch doesn't count against the caller. */
function _orDefault<T>(v: T | null | undefined, fallback: T): T {
  return v ?? fallback;
}

/** True for a Chamber tile with tank content — used by {@link Board.validateGrid}. */
function _isTankLikeTile(t: Tile): boolean {
  return t.shape === PipeShape.Chamber && t.chamberContent === 'tank';
}

/**
 * Returns true when shape is any empty floor type (Summer, Fall, Dark, Winter, or Spring).
 * Use this instead of `=== PipeShape.Empty` for all game-rule checks so that
 * future empty floor types require no additional code changes.
 */
export function isEmptyFloor(shape: PipeShape): boolean {
  return shape === PipeShape.Empty || shape === PipeShape.EmptyFall || shape === PipeShape.EmptyDark || shape === PipeShape.EmptyWinter || shape === PipeShape.EmptySpring;
}

/**
 * Compute the display floor type (Empty / EmptyFall / EmptyDark / EmptyWinter / EmptySpring) for every cell
 * in a grid, using a two-pass algorithm:
 *
 * 1. Cells for which `getCellFloorType` returns a non-null value are resolved
 *    immediately with that value (these are the empty-floor cells).
 * 2. All remaining cells are resolved via a BFS that expands from any unresolved
 *    cell neighbouring an already-resolved cell.  Each cell's floor type is the
 *    majority vote of its cardinal neighbours that have already been resolved;
 *    ties are broken by the order in {@link EMPTY_FLOOR_SHAPES}.
 *
 * This single shared algorithm is used by both the in-game {@link Board} and the
 * chapter-map screen ({@link computeChapterFloorTypes}) so that the two contexts
 * stay in sync as the set of empty-floor types grows.
 *
 * @param rows             Number of rows in the grid.
 * @param cols             Number of columns in the grid.
 * @param getCellFloorType Returns the intrinsic floor type when (r, c) is an
 *                         empty-floor cell, or `null` for all other tile types.
 */
/** Cardinal-neighbour offsets, shared by every helper below. */
const CARDINAL_OFFSETS: readonly [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Invoke `cb` for every in-bounds cardinal neighbour of (r, c). */
function _forEachInBoundsNeighbor(
  r: number, c: number, rows: number, cols: number,
  cb: (nr: number, nc: number) => void,
): void {
  for (const [dr, dc] of CARDINAL_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) cb(nr, nc);
  }
}

/** True when (r, c) has at least one cardinal neighbour already resolved in `map`. */
function _hasResolvedNeighbor(
  r: number, c: number, rows: number, cols: number, map: ReadonlyMap<string, PipeShape>,
): boolean {
  for (const [dr, dc] of CARDINAL_OFFSETS) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && map.has(posKey(nr, nc))) return true;
  }
  return false;
}

/** Majority vote over cardinal neighbours already resolved in `map`. */
function _majorityFloorFromNeighbors(
  r: number, c: number, rows: number, cols: number,
  map: ReadonlyMap<string, PipeShape>,
  getCellFloorType: (r: number, c: number) => PipeShape | null,
): PipeShape {
  const counts = new Map<PipeShape, number>([[PipeShape.Empty, 0], [PipeShape.EmptyFall, 0], [PipeShape.EmptyDark, 0], [PipeShape.EmptyWinter, 0], [PipeShape.EmptySpring, 0]]);
  _forEachInBoundsNeighbor(r, c, rows, cols, (nr, nc) => {
    const ft = map.get(posKey(nr, nc)) ?? getCellFloorType(nr, nc);
    if (ft !== null) counts.set(ft, (counts.get(ft) ?? 0) + 1);
  });
  let best: PipeShape = PipeShape.Empty;
  let bestCount = -1;
  for (const shape of EMPTY_FLOOR_SHAPES) {
    const cnt = counts.get(shape) ?? 0;
    if (cnt > bestCount) { bestCount = cnt; best = shape; }
  }
  return best;
}

/** Pass 1: seed `map` directly from every empty-floor cell. */
function _seedResolvedFloorCells(
  rows: number, cols: number,
  getCellFloorType: (r: number, c: number) => PipeShape | null,
  map: Map<string, PipeShape>,
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ft = getCellFloorType(r, c);
      if (ft !== null) map.set(posKey(r, c), ft);
    }
  }
}

/** Seed the BFS queue with every unresolved cell adjacent to an already-resolved one. */
function _buildInitialFloorBfsQueue(
  rows: number, cols: number, map: ReadonlyMap<string, PipeShape>,
): [number, number][] {
  const queue: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map.has(posKey(r, c))) continue;
      if (_hasResolvedNeighbor(r, c, rows, cols, map)) queue.push([r, c]);
    }
  }
  return queue;
}

/** Push any still-unresolved neighbour of (r, c) onto `queue` for later BFS expansion. */
function _enqueueUnresolvedNeighbors(
  r: number, c: number, rows: number, cols: number,
  map: ReadonlyMap<string, PipeShape>, queue: [number, number][],
): void {
  _forEachInBoundsNeighbor(r, c, rows, cols, (nr, nc) => {
    if (!map.has(posKey(nr, nc))) queue.push([nr, nc]);
  });
}

/** Pass 2: BFS outward from resolved cells, resolving each by neighbour majority vote. */
function _expandFloorTypesByBfs(
  queue: [number, number][], rows: number, cols: number,
  map: Map<string, PipeShape>,
  getCellFloorType: (r: number, c: number) => PipeShape | null,
): void {
  let qi = 0;
  while (qi < queue.length) {
    const [r, c] = queue[qi++];
    const key = posKey(r, c);
    if (map.has(key)) continue;
    map.set(key, _majorityFloorFromNeighbors(r, c, rows, cols, map, getCellFloorType));
    _enqueueUnresolvedNeighbors(r, c, rows, cols, map, queue);
  }
}

/** Pass 3: fill any cells still unresolved (e.g. a board with no empty-floor tiles at all). */
function _fillRemainingWithDefaultFloor(
  rows: number, cols: number, map: Map<string, PipeShape>, defaultFloor: PipeShape,
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = posKey(r, c);
      if (!map.has(key)) map.set(key, defaultFloor);
    }
  }
}

export function computeFloorTypesFromGrid(
  rows: number,
  cols: number,
  getCellFloorType: (r: number, c: number) => PipeShape | null,
  defaultFloor: PipeShape = PipeShape.Empty,
): ReadonlyMap<string, PipeShape> {
  const map = new Map<string, PipeShape>();

  _seedResolvedFloorCells(rows, cols, getCellFloorType, map);

  const queue = _buildInitialFloorBfsQueue(rows, cols, map);
  _expandFloorTypesByBfs(queue, rows, cols, map, getCellFloorType);

  if (defaultFloor !== PipeShape.Empty) {
    _fillRemainingWithDefaultFloor(rows, cols, map, defaultFloor);
  }

  return map;
}

// ── Error message constants ────────────────────────────────────────────────
// Centralised here so changes propagate automatically and tests can reference
// the same strings without hard-coding them again.

/** Error shown when a non-gold pipe is placed on a gold space. */
export const ERR_GOLD_SPACE = 'error.board.goldSpace';

/** Error shown when removing a tile would disconnect a container and reduce an inventory count below zero. */
const ERR_CONTAINER_REMOVE =
  'error.board.containerRemove';

/** Error shown when a replacement would disconnect the container that grants the new shape. */
const ERR_CONTAINER_DISCONNECT =
  'error.board.containerDisconnect';

/** Error shown when replacing a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_REPLACE =
  'error.board.containerReplace';

/** Error shown when rotating a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_ROTATE =
  'error.board.containerRotate';

/**
 * Error shown when a move would connect to a non-valve side of a chamber
 * before its valve side has been satisfied.
 */
export const ERR_VALVE =
  'error.board.valve';

/**
 * Error key emitted when a Regulator tile's stat check fails at connection
 * time. Exported so callers can identify this specific error type by equality.
 */
export const ERR_REGULATOR_CHECK = 'error.board.regulatorCheck';

/** Snapshot of the board state (grid + inventory) used for undo/redo. */
type Snapshot = {
  grid: Tile[][];
  inventory: InventoryItem[];
  turnState: TurnStateSnapshot;
  cementData: Map<string, number>;
  /**
   * The encoded move string that produced this snapshot from the previous one.
   * `undefined` for the initial snapshot at the start of a level (or after a
   * restart), which serves as the boundary marker for {@link getMoveSequence}.
   */
  move?: string;
};

/**
 * The result of a mutating board operation (place, reclaim, replace, rotate).
 *
 * Replaces the mutable `lastError` / `lastErrorTilePositions` / `lastCementDecrement`
 * pattern with a proper return value so display-driven state no longer leaks into
 * the game model.
 */
export type MoveResult = {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Error i18n key when `success` is false, if applicable. */
  error?: string;
  /** Optional interpolation params for the error i18n key. */
  errorParams?: TranslationParams;
  /** Grid positions of the tiles that caused the error, if any. */
  errorTilePositions?: GridPos[];
  /**
   * Position of the cement cell whose setting time was decremented by this
   * operation.  Present only when a successful operation decremented a cell.
   */
  cementDecrement?: GridPos;
};

// ─── Ambient decoration generation ───────────────────────────────────────────

const DECORATION_DENSITY = 0.30;

/**
 * Return the decoration types appropriate for the given empty floor type.
 *
 * - **Summer** (Empty):    flowers, grass tufts, mushrooms — organic surface.
 * - **Fall** (EmptyFall):  grass tufts, pebbles, dandelions, sunflowers, leaves — warm autumn surface.
 * - **Dark** (EmptyDark):  pebbles only — stone-like surface.
 * - **Winter** (EmptyWinter): pebbles and crystals — icy, snow-covered surface.
 * - **Spring** (EmptySpring): flowers and grass only — bright spring surface.
 *
 * This is the single authoritative source for floor-type ↔ decoration mapping,
 * used by {@link generateAmbientDecorations} so the logic is not duplicated
 * across the game board and chapter-map contexts.
 */
function decorationTypesForFloor(floorType: PipeShape): AmbientDecorationType[] {
  switch (floorType) {
    case PipeShape.EmptyFall:   return ['grass', 'pebbles', 'dandelion', 'sunflower', 'leaves'];
    case PipeShape.EmptyDark:   return ['mushroom', 'crystal', 'pebbles'];
    case PipeShape.EmptyWinter: return ['pebbles', 'crystal'];
    case PipeShape.EmptySpring: return ['flower', 'grass'];
    default:                  return ['flower', 'grass', 'mushroom'];  // Empty / Summer
  }
}

/**
 * Generate a map of ambient background decorations spread across a `rows × cols`
 * grid.  Each cell has an independent ~30 % chance of receiving one decoration.
 * Returned as a Map keyed by "row,col" for O(1) lookup.
 * This is a shared helper used by both the game board and the chapter-map renderer.
 *
 * @param getFloorType - Optional callback that returns the floor type for a cell.
 *   When provided, only decoration types appropriate for that floor type are
 *   generated (see {@link decorationTypesForFloor}).  Defaults to Summer (Empty)
 *   for every cell when omitted.
 */
/** Golden angle in degrees – gives the best uniform distribution of rotations. */
const DECORATION_GOLDEN_ANGLE = 137.50776405003785;

/** Pick one decoration type at random from those valid for `floorType`. */
function _pickDecorationType(floorType: PipeShape): AmbientDecorationType {
  const types = decorationTypesForFloor(floorType);
  return types[Math.floor(Math.random() * types.length)];
}

/**
 * Mushrooms scale 0.7–1.5 (up to 50% larger); crystals scale 0.75–1.25 (±25%);
 * dandelions and sunflowers scale 0.65–1.35 (random factor as per design);
 * leaves scale 0.70–1.20 (±25%). All other types have no scale variance.
 */
function _pickDecorationScale(type: AmbientDecorationType): number | undefined {
  switch (type) {
    case 'mushroom': return 0.7 + Math.random() * 0.8;
    case 'crystal': return 0.75 + Math.random() * 0.5;
    case 'dandelion': return 0.65 + Math.random() * 0.7;
    case 'sunflower': return 0.65 + Math.random() * 0.7;
    case 'leaves': return 0.70 + Math.random() * 0.5;
    default: return undefined;
  }
}

/** Crystals randomly show either one or two shards; leaves show 2–5 leaves. */
function _pickDecorationCount(type: AmbientDecorationType): number | undefined {
  switch (type) {
    case 'crystal': return Math.random() < 0.5 ? 1 : 2;
    case 'leaves': return 2 + Math.floor(Math.random() * 4);
    default: return undefined;
  }
}

/**
 * Pebbles and crystals distribute rotations using the golden angle so that each
 * instance of the same type has a visually distinct orientation; `idx` is that
 * type's running count so far. A random base angle is chosen so board instances
 * show different orientations. Every other type just uses the base angle.
 */
function _computeDecorationRotation(type: AmbientDecorationType, idx: number, baseAngle: number): number {
  if (type === 'pebbles' || type === 'crystal') return (baseAngle + idx * DECORATION_GOLDEN_ANGLE) % 360;
  return baseAngle;
}

/**
 * Sunflowers and dandelions are positioned lower so their tops don't draw up onto
 * the tile above. Dandelions extend ~20–26 px above their origin (stalk + puff,
 * accounting for max scale 1.35), so offsetY >= 0.45 keeps them within the tile
 * at TILE_SIZE = 64 px. Every other type centers in the tile's middle 15–85%.
 */
function _computeDecorationOffsetY(type: AmbientDecorationType): number {
  if (type === 'sunflower' || type === 'dandelion') return 0.45 + Math.random() * 0.45;
  return 0.15 + Math.random() * 0.70;
}

/** Build one fully-randomized ambient decoration for cell (r, c). */
function _buildAmbientDecoration(
  r: number, c: number, floorType: PipeShape, type: AmbientDecorationType, idx: number,
): AmbientDecoration {
  // Spring flowers are rendered brighter and fully opaque.
  const bright = (floorType === PipeShape.EmptySpring && type === 'flower') ? true : undefined;
  const baseAngle = Math.random() * 360;
  return {
    row: r,
    col: c,
    type,
    // Keep decorations away from cell edges for a natural look
    offsetX: 0.15 + Math.random() * 0.70,
    offsetY: _computeDecorationOffsetY(type),
    rotation: _computeDecorationRotation(type, idx, baseAngle),
    variant: Math.floor(Math.random() * 3),
    scale: _pickDecorationScale(type),
    count: _pickDecorationCount(type),
    bright,
  };
}

export function generateAmbientDecorations(
  rows: number,
  cols: number,
  getFloorType?: (r: number, c: number) => PipeShape,
): ReadonlyMap<string, AmbientDecoration> {
  const map = new Map<string, AmbientDecoration>();
  // Counters per type for golden-angle rotation distribution (pebbles & crystals).
  const typeCount: Partial<Record<AmbientDecorationType, number>> = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() >= DECORATION_DENSITY) continue;
      const floorType = getFloorType ? getFloorType(r, c) : PipeShape.Empty;
      const type = _pickDecorationType(floorType);
      const idx = typeCount[type] ?? 0;
      typeCount[type] = idx + 1;
      map.set(`${r},${c}`, _buildAmbientDecoration(r, c, floorType, type, idx));
    }
  }
  return map;
}

/**
 * The game board – a 2-D grid of {@link Tile} objects.
 * Contains all game logic for path-finding, water tracking and win detection.
 */
export class Board {
  readonly rows: number;
  readonly cols: number;
  readonly grid: Tile[][];
  source: GridPos;
  sink: GridPos;

  /** Initial water capacity of the source tile. */
  sourceCapacity: number;

  /** Mutable inventory of pipe pieces the player can place. */
  inventory: InventoryItem[];

  /**
   * Set of "row,col" keys that are one-way floor cells, mapped to the
   * indicated flow direction.  Populated from the level definition.
   * Never changes during play (pipe tiles placed on one-way cells do not
   * alter the one-way direction).
   */
  oneWayData: Map<string, Direction>;

  /**
   * Set of "row,col" keys that are gold space cells.
   * Populated from the level definition; never changes during play.
   */
  goldSpaces: Set<string>;

  /**
   * Cement setting-time values keyed by "row,col".
   * Populated from the level definition (where Cement tiles appear).
   * Exposed as a getter backed by {@link _cement}.
   */
  get cementData(): Map<string, number> {
    return this._cement.data;
  }

  /**
   * Ambient background decorations (pebbles, flowers, grass tufts) generated
   * once each time a level is activated.  Rendered under all tile elements so
   * they are visible only on empty (unoccupied) cells.
   * Keyed by "row,col" for O(1) lookup.
   */
  readonly ambientDecorations: ReadonlyMap<string, AmbientDecoration>;

  /**
   * Pre-computed "background floor type" for every cell, used for rendering.
   * Empty cells: their own PipeShape (Empty / EmptyFall / EmptyDark / EmptyWinter / EmptySpring).
   * Source, Sink, Tree: majority of adjacent empty-floor tiles' shapes.
   * Granite: BFS flood-fill from edges touching empty tiles.
   * Other tiles: PipeShape.Empty fallback.
   * Computed once in _initFromLevel and never changes during play.
   */
  floorTypes: ReadonlyMap<string, PipeShape> = new Map();

  /**
   * Visual style for this level, controlling the default empty floor tile type
   * and tree rendering colors.  Matches the source {@link LevelDef.style}.
   */
  readonly style: LevelStyle | undefined;

  /**
   * Total water units that have been frozen by ice blocks during play.
   * Not used in game logic; intended for display purposes.
   * Backed by {@link _turnState}.
   */
  get frozen(): number {
    return this._turnState.frozen;
  }

  /**
   * Total water permanently lost to leaky pipe per-turn penalties.
   * Each turn a leaky pipe remains connected (after its first turn), one additional
   * water unit is consumed and added here.  Unlike the initial connection cost,
   * this loss is permanent: disconnecting the leaky pipe does NOT recover it.
   * Backed by {@link _turnState}.
   */
  get leakyPermanentLoss(): number {
    return this._turnState.leakyPermanentLoss;
  }

  /**
   * The current turn number (increments with each {@link applyTurnDelta} call).
   * Turn 0 is the initial state before any moves have been made.
   * Backed by {@link _turnState}.
   */
  get turnNumber(): number {
    return this._turnState.turnNumber;
  }

  /** @private Sub-modules for extracted concerns. */
  private readonly _thermo: ThermoSimulator;
  private readonly _cement: CementSystem;
  private readonly _validator: ConstraintValidator;
  private readonly _turnState: TurnStateManager;

  /** Full move history for undo/redo support. history[0] is the initial state. */
  private _history: Snapshot[] = [];
  /** Index of the current state in _history (-1 if history is uninitialized). */
  private _historyIndex: number = -1;
  /**
   * Set to true by {@link discardLastMoveFromHistory} and reset by {@link initHistory}
   * and {@link restoreFromCurrentSnapshot}.
   * Allows {@link canRestoreAfterGameOver} to return true even when canUndo() is false,
   * i.e. when the very first move was discarded and _historyIndex is back at 0.
   */
  private _hadDiscardedMove: boolean = false;

  /** Cached result of {@link getFilledPositions}. Null when invalidated. */
  private _filledPositionsCache: Set<string> | null = null;

  /**
   * @param rows - Number of rows.
   * @param cols - Number of columns.
   * @param level - Optional level definition.  If omitted a random grid is built.
   * @param existingDecorations - Optional pre-built decorations to reuse instead of
   *   generating new ones.  Pass the previous board's {@link ambientDecorations} when
   *   restarting a level to keep the same decor visible.
   */
  constructor(rows: number, cols: number, level?: LevelDef, existingDecorations?: ReadonlyMap<string, AmbientDecoration>) {
    this.rows = rows;
    this.cols = cols;
    this.source = { row: 0, col: 0 };
    this.sink = { row: rows - 1, col: cols - 1 };
    this.sourceCapacity = 0;
    this.inventory = [];
    this.oneWayData = new Map();
    this.goldSpaces = new Set();
    this.style = level?.style;

    // Initialise sub-modules (cement must be created before _initFromLevel populates it).
    this._cement = new CementSystem(new Map());
    if (level) {
      this.grid = this._emptyGrid();
      this._initFromLevel(level);
      // Compute floor types first so decoration generation can select the correct
      // decoration types for each cell (e.g. pebbles on dirt/dark, no crystals on grass).
      this.floorTypes = this._computeFloorTypes();
      this.ambientDecorations = existingDecorations ?? generateAmbientDecorations(
        this.rows,
        this.cols,
        (r, c) => this.floorTypes.get(posKey(r, c)) ?? PipeShape.Empty,
      );
    } else {
      this.grid = this._buildGrid();
      this.ambientDecorations = new Map();
    }
    // Create remaining sub-modules after the grid and source are fully set up.
    this._thermo = new ThermoSimulator(this.grid, () => this.source);
    this._validator = new ConstraintValidator(this.grid, this._thermo);
    this._turnState = new TurnStateManager(this.grid, this._thermo, () => this.sourceCapacity);
  }

  // ─── Level initialisation ──────────────────────────────────────────────────

  /** Initialize the board from a level definition. */
  private _initFromLevel(level: LevelDef): void {
    this.inventory = level.inventory.map((item) => ({ ...item }));
    const defaultFloor = styleToFloorShape(level.style);

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this._initCellFromDef(r, c, level.grid[r]?.[c] ?? null, defaultFloor);
      }
    }

    this.sourceCapacity = this.grid[this.source.row][this.source.col].capacity;
  }

  /** Populate `this.grid[r][c]` (and any side-tracked data) from one level cell definition. */
  private _initCellFromDef(r: number, c: number, def: TileDef | null, defaultFloor: PipeShape): void {
    if (def === null) {
      this.grid[r][c] = new Tile(defaultFloor, 0);
      return;
    }
    if (NAMED_EMPTY_FLOOR_SHAPES.has(def.shape)) {
      // Fall, Dark, Winter, and Spring empty floor tiles are stored with their shape for rendering
      this.grid[r][c] = new Tile(def.shape, 0);
      return;
    }
    if (def.shape === PipeShape.GoldSpace) {
      // Gold spaces are tracked separately; the cell behaves like Empty
      this.goldSpaces.add(posKey(r, c));
      this.grid[r][c] = new Tile(defaultFloor, 0);
      return;
    }
    if (def.shape === PipeShape.OneWay) {
      // One-way tiles are tracked separately; the cell behaves like Empty
      const rot = _orDefault(def.rotation, 0);
      const owDir = ([Direction.North, Direction.East, Direction.South, Direction.West] as Direction[])[rot / 90];
      this.oneWayData.set(posKey(r, c), owDir);
      this.grid[r][c] = new Tile(defaultFloor, 0);
      return;
    }
    if (def.shape === PipeShape.Cement) {
      // Cement tiles are tracked separately; the cell behaves like Empty
      this._cement.data.set(posKey(r, c), _orDefault(def.dryingTime, 0));
      this.grid[r][c] = new Tile(defaultFloor, 0);
      return;
    }
    this._initPipeTileCell(r, c, def);
  }

  /** Populate `this.grid[r][c]` for any def whose shape is a real pipe/source/sink tile. */
  private _initPipeTileCell(r: number, c: number, def: TileDef): void {
    const customConnections = def.connections ? new Set(def.connections) : null;
    const firstConns = (def.firstConnections && def.firstConnections.length > 0)
      ? new Set(def.firstConnections)
      : null;
    // Spinnable pipes are not fixed so the player can rotate them, but they
    // cannot be removed (that is enforced by reclaimTile / replaceInventoryTile).
    const isFixed = !SPIN_PIPE_SHAPES.has(def.shape);
    this.grid[r][c] = new Tile(
      def.shape, _orDefault(def.rotation, 0), isFixed, _orDefault(def.capacity, 0), _orDefault(def.cost, 0),
      _orDefault(def.itemShape, null), _orDefault(def.itemCount, 1), customConnections, _orDefault(def.chamberContent, null),
      _orDefault(def.temperature, 0), _orDefault(def.pressure, 0), _orDefault(def.hardness, 0), _orDefault(def.shatter, 0),
      firstConns, _orDefault(def.regulatorStat, null), _orDefault(def.regulatorOperator, null),
    );
    // Spin-cement tiles also track cement drying time.
    if (SPIN_CEMENT_SHAPES.has(def.shape)) {
      this._cement.data.set(posKey(r, c), _orDefault(def.dryingTime, 0));
    }
    if (def.shape === PipeShape.Source) {
      this.source = { row: r, col: c };
    } else if (def.shape === PipeShape.Sink) {
      this.sink = { row: r, col: c };
    }
  }

  /** Pre-compute the floor type (Empty/EmptyFall/EmptyDark/EmptyWinter/EmptySpring) for every cell. */
  private _computeFloorTypes(): ReadonlyMap<string, PipeShape> {
    return computeFloorTypesFromGrid(this.rows, this.cols, (r, c) => {
      const key = posKey(r, c);
      // Gold spaces, one-way tiles, and cement tiles are stored as PipeShape.Empty
      // at runtime, but their floor type should be inferred from their region
      // (Empty / EmptyFall / EmptyDark / EmptyWinter / EmptySpring) via BFS propagation from neighbours.
      // Fixed pipe tile types (Source, Sink, Straight, etc.) also return null
      // here so that BFS propagates the correct floor type to them.
      if (this.goldSpaces.has(key) || this.oneWayData.has(key) || this.cementData.has(key)) {
        return null;
      }
      const shape = this.grid[r][c].shape;
      return isEmptyFloor(shape) ? shape : null;
    }, styleToFloorShape(this.style));
  }

  // ─── Undo / redo support ───────────────────────────────────────────────────

  /**
   * Initialize the move history with the current board state as the starting point.
   * Must be called once after a level is fully set up (e.g. at the start of play).
   * Calling this resets any existing history and locks the initial water impact
   * for all tiles that are already connected at game start.
   */
  initHistory(): void {
    this._turnState.reset();
    this.applyTurnDelta();
    this._history = [this._captureSnapshot()];
    this._historyIndex = 0;
    this._hadDiscardedMove = false;
  }

  /**
   * Record the current board state as the next move in the history.
   * Call this AFTER each successful player action (place, rotate, delete).
   *
   * @param move - The encoded move string that produced this state.  Stored
   *   inside the snapshot so {@link getMoveSequence} can reconstruct the
   *   sequence without any parallel data structure.
   *
   *   Defaults to `''` (empty string) rather than `undefined` so that callers
   *   that do not need move tracking (e.g. tests and the replay engine) do not
   *   accidentally create restart-boundary markers — `undefined` is reserved
   *   exclusively for the initial snapshot created by {@link initHistory}.
   *   Empty-string entries are silently omitted from the {@link getMoveSequence}
   *   output.
   *
   * If the player is currently at a position earlier than the end of the history
   * (i.e. some moves were undone), the behavior is:
   * - If the new state matches the next state in the existing history, advance
   *   the index without modifying the history (the redo chain is preserved).
   * - Otherwise, truncate all future states and append the new state.
   */
  recordMove(move = ''): void {
    if (this._historyIndex < this._history.length - 1) {
      // There are "future" (undone) states.
      // Compare the live board to the next entry WITHOUT allocating a new snapshot first.
      if (this._liveBoardMatchesSnapshot(this._history[this._historyIndex + 1])) {
        // Exact same result as the next history state – advance the pointer, preserve the redo chain.
        // Update the stored move string so the redo entry reflects the latest action that produced it.
        this._history[this._historyIndex + 1].move = move;
        this._historyIndex++;
        return;
      }
      // Different – discard the future branch before appending the new state.
      this._history = this._history.slice(0, this._historyIndex + 1);
    }

    this._history.push(this._captureSnapshot(move));
    this._historyIndex++;
  }

  /**
   * Remove the most recently recorded snapshot from the history.
   * Used when a move is found to have caused a losing state and should not be
   * preserved in the undo chain.
   */
  discardLastMoveFromHistory(): void {
    if (this._historyIndex <= 0) return;
    this._historyIndex--;
    this._history = this._history.slice(0, this._historyIndex + 1);
    this._hadDiscardedMove = true;
  }

  /**
   * Restore the board to the snapshot at the current history index, without
   * moving the history pointer.
   *
   * Called when the player presses Undo from the game-over modal: the failing
   * move has already been removed from history by {@link discardLastMoveFromHistory},
   * so `_historyIndex` already points to the pre-fail snapshot and we just need
   * to apply it to the live board.
   */
  restoreFromCurrentSnapshot(): void {
    if (this._historyIndex < 0 || this._historyIndex >= this._history.length) return;
    this._restoreSnapshot(this._history[this._historyIndex]);
    this._hadDiscardedMove = false;
  }

  /** Returns true if there is a previous state to undo to. */
  canUndo(): boolean {
    return this._historyIndex > 0;
  }

  /**
   * Read-only view of the current history index.
   * Equals the number of moves recorded since the last `initHistory` call.
   */
  get historyIndex(): number {
    return this._historyIndex;
  }

  /**
   * Return the move sequence for the current play session as an array of
   * encoded move strings.
   *
   * Walks backwards through the snapshot history from the current position
   * until it reaches the most recent restart boundary (a snapshot whose
   * `move` is `undefined`), then returns all the non-empty moves from that
   * boundary to the current position in forward order.
   *
   * Snapshots with `move === undefined` mark the start of each play session
   * (from `initHistory`).  Snapshots with `move === ''` (the default when
   * `recordMove` is called without an argument, e.g. in tests or the replay
   * engine) are silently ignored in the assembled sequence.
   *
   * This correctly handles any number of restarts and undo-past-restart actions:
   * after `graftPreRestartHistory`, pre-restart snapshots are prepended to the
   * history, and each restart boundary snapshot has `move = undefined`, so the
   * scan naturally stops at the most recent session's origin.
   */
  getMoveSequence(): string[] {
    let startIdx = 0;
    for (let i = this._historyIndex; i >= 0; i--) {
      if (this._history[i].move === undefined) {
        startIdx = i + 1;
        break;
      }
    }
    const moves: string[] = [];
    for (let i = startIdx; i <= this._historyIndex; i++) {
      const m = this._history[i].move;
      if (m) moves.push(m); // skip empty-string placeholders
    }
    return moves;
  }

  /**
   * Returns true when the game-over undo can restore the board, i.e. when
   * either a normal undo is available or the failing move was the very first
   * move (discardLastMoveFromHistory was called and _historyIndex is back at 0).
   */
  canRestoreAfterGameOver(): boolean {
    return this.canUndo() || this._hadDiscardedMove;
  }

  /**
   * Restore the board to the previous state in the history.
   * @returns true if the undo was applied; false if there was no previous state.
   */
  undoMove(): boolean {
    if (!this.canUndo()) return false;
    this._historyIndex--;
    this._restoreSnapshot(this._history[this._historyIndex]);
    return true;
  }

  /** Returns true if there is a future state to redo to. */
  canRedo(): boolean {
    return this._historyIndex >= 0 && this._historyIndex < this._history.length - 1;
  }

  /**
   * Import the pre-restart history from a previous board instance so that
   * pressing Undo after a restart can recover the state the player was in
   * before the restart.
   *
   * Prepends the played portion of `prevBoard`'s history (snapshots 0 through
   * `prevBoard._historyIndex`) before this board's own initial snapshot and
   * advances `_historyIndex` accordingly.  Does nothing when `prevBoard` has
   * no undo-able states (i.e. `prevBoard.canUndo()` is false).
   *
   * @param prevBoard - The board that was active before the restart.
   */
  graftPreRestartHistory(prevBoard: Board): void {
    if (!prevBoard.canUndo()) return;
    const prevSlice = prevBoard._history.slice(0, prevBoard._historyIndex + 1);
    this._history = [...prevSlice, ...this._history];
    this._historyIndex += prevSlice.length;
  }

  /**
   * Re-apply the next state in the history (i.e. redo the last undone move).
   * @returns true if redo was applied; false if there was no future state.
   */
  redoMove(): boolean {
    if (!this.canRedo()) return false;
    this._historyIndex++;
    this._restoreSnapshot(this._history[this._historyIndex]);
    return true;
  }

  // ─── Snapshot helpers ──────────────────────────────────────────────────────

  /** Capture a deep copy of the current grid and inventory, with an optional move string. */
  private _captureSnapshot(move?: string): Snapshot {
    return {
      grid: this.grid.map((row) => row.map((tile) => tile.clone())),
      inventory: this.inventory.map((item) => ({ ...item })),
      turnState: this._turnState.captureSnapshot(),
      cementData: this._cement.captureSnapshot(),
      move,
    };
  }

  /** Restore the board grid and inventory from a snapshot. */
  private _restoreSnapshot(snap: Snapshot): void {
    this._invalidateFilledCache();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        // Deep-copy each Tile so that subsequent in-place mutations (e.g. rotate())
        // on the live grid cannot corrupt the stored snapshot.
        this.grid[r][c] = snap.grid[r][c].clone();
      }
    }
    this.inventory = snap.inventory.map((item) => ({ ...item }));
    this._turnState.restoreSnapshot(snap.turnState);
    this._cement.restoreSnapshot(snap.cementData);
  }

  /**
   * Compare the LIVE board state against a snapshot without allocating a new Snapshot object.
   * Used by {@link recordMove} to check whether a redo entry can be reused.
   *
   * INVARIANT (why comparing only shape + rotation + inventory is sufficient):
   * every other field of a Snapshot is a deterministic function of the grid
   * layout (shapes + rotations) and inventory, given an identical base state:
   *   • A tile's `connections` derive from shape + rotation; `customConnections`
   *     are set once at level init and never mutated during play.
   *   • Per-tile `temperature`/`pressure`/`hardness`/`shatter` are authored level
   *     data, read but never reassigned during a turn.
   *   • `turnState`/`cement` are pure functions of the (pinned) layout sequence,
   *     and turn resolution contains no RNG.
   * So matching shape+rotation+inventory implies the full resolved state matches.
   * If that invariant is ever broken — turn-resolution randomness, per-tile sim
   * fields mutated during play, or a player-rotatable tile whose connections are
   * NOT derived from shape+rotation — this comparison will wrongly reuse a stale
   * redo entry and silently corrupt the redo chain. Extend the comparison then.
   */
  private _liveBoardMatchesSnapshot(snap: Snapshot): boolean {
    if (this.inventory.length !== snap.inventory.length) return false;
    for (let i = 0; i < this.inventory.length; i++) {
      if (this.inventory[i].shape !== snap.inventory[i].shape) return false;
      if (this.inventory[i].count !== snap.inventory[i].count) return false;
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].shape    !== snap.grid[r][c].shape)    return false;
        if (this.grid[r][c].rotation !== snap.grid[r][c].rotation) return false;
      }
    }
    return true;
  }

  /**
   * Return a player-placed pipe tile back to the inventory.
   * Only non-fixed, non-special tiles (Straight, Elbow, Tee, Cross and their gold
   * and leaky variants) can be reclaimed.
   * Returns a failing {@link MoveResult} if reclaiming would reduce an
   * inventory value below zero due to lost ItemContainer grants.
   */
  reclaimTile(pos: GridPos): MoveResult {
    const tile = this.getTile(pos);
    if (!this._isReplaceableTile(tile)) return { success: false };

    // ── Cement constraint check ───────────────────────────────────────────────
    const cementCheck = this._cement.isHardened(pos);
    if (cementCheck.blocked) {
      return { success: false, error: cementCheck.error, errorParams: cementCheck.params, errorTilePositions: cementCheck.positions };
    }

    const containerResult = this._checkReclaimContainerConstraint(pos, tile.shape);
    if (containerResult) return containerResult;

    const sandstoneResult = this._checkReclaimSandstoneConstraint(pos);
    if (sandstoneResult) return sandstoneResult;

    this._reclaimInventory(tile.shape);
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = new Tile(this.floorTypes.get(posKey(pos.row, pos.col)) ?? PipeShape.Empty, 0);
    return { success: true };
  }

  /** Temporarily empty the cell at `pos`, run `compute`, then restore its original tile. */
  private _withTileTemporarilyRemoved<T>(pos: GridPos, compute: () => T): T {
    const savedTile = this.grid[pos.row][pos.col];
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
    const result = compute();
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = savedTile;
    return result;
  }

  /** The reclaimed shape's inventory, with one more copy than currently held. */
  private _projectInventoryWithReclaimedShape(shape: PipeShape): InventoryItem[] {
    const projectedInventory = this.inventory.map((item) => ({ ...item }));
    const projectedIndex = projectedInventory.findIndex((item) => item.shape === shape);
    if (projectedIndex !== -1) {
      projectedInventory[projectedIndex].count++;
    } else {
      projectedInventory.push({ shape, count: 1 });
    }
    return projectedInventory;
  }

  /**
   * Container-grant constraint check: simulate removing the tile at `pos` and
   * verify no inventory count would go below zero.
   */
  private _checkReclaimContainerConstraint(pos: GridPos, shape: PipeShape): MoveResult | null {
    const filledBefore = this.getFilledPositions();
    const currentBonuses = this.getContainerBonuses(filledBefore);
    const projectedInventory = this._projectInventoryWithReclaimedShape(shape);

    const { filledAfter, newBonuses } = this._withTileTemporarilyRemoved(pos, () => ({
      filledAfter: this.getFilledPositions(),
      newBonuses: this.getContainerBonuses(),
    }));

    const disconnectedPositions = this._getBlockedNegativeContainerDropPositions(
      this.inventory,
      projectedInventory,
      filledBefore,
      currentBonuses,
      filledAfter,
      newBonuses,
      'disconnectionsOnly',
    );
    if (!disconnectedPositions) return null;
    return { success: false, error: ERR_CONTAINER_REMOVE, errorTilePositions: disconnectedPositions };
  }

  /**
   * Sandstone constraint check: simulate removing the tile at `pos` and verify no
   * connected sandstone tile would have deltaDamage <= 0 (can happen when removing
   * a pipe that carried the only path to a pump chamber).
   */
  private _checkReclaimSandstoneConstraint(pos: GridPos): MoveResult | null {
    const filledBefore = this.getFilledPositions();
    const { filledAfter, error, params, positions } = this._withTileTemporarilyRemoved(pos, () => {
      const filledAfter = this.getFilledPositions();
      const { error, params, positions } = this._validateConstraints(filledAfter);
      return { filledAfter, error, params, positions };
    });
    if (!error) return null;
    // Highlight only tiles that are both disconnected by the removal AND
    // in the constraint-violating positions set.  This ensures only the
    // relevant constraint tiles are shown.  Falls back to positions when
    // the intersection is empty (common case: constraint tile stays connected).
    const errorTilePositions = this._computeReclaimDisconnectedConstraintPositions(pos, filledBefore, filledAfter, positions);
    return { success: false, error, errorParams: params ?? undefined, errorTilePositions };
  }

  /** Reclaim-specific variant of the disconnected-constraint-position scan: excludes the reclaimed cell itself. */
  private _computeReclaimDisconnectedConstraintPositions(
    pos: GridPos, filledBefore: Set<string>, filledAfter: Set<string>, positions: GridPos[] | null,
  ): GridPos[] | undefined {
    const reclaimedKey = posKey(pos.row, pos.col);
    const positionKeys = positions ? new Set(positions.map(p => posKey(p.row, p.col))) : null;
    const disconnected: GridPos[] = [];
    for (const k of filledBefore) {
      if (k !== reclaimedKey && !filledAfter.has(k) && positionKeys?.has(k)) {
        const [r, c] = parseKey(k);
        disconnected.push({ row: r, col: c });
      }
    }
    return disconnected.length ? disconnected : positions ?? undefined;
  }

  /**
   * Returns a failure MoveResult when a non-gold pipe is being placed on a gold space,
   * or `null` when the constraint is satisfied.
   */
  private _checkGoldSpacePipe(pos: GridPos, shape: PipeShape): MoveResult | null {
    const isGoldSpace = this.goldSpaces.has(posKey(pos.row, pos.col));
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(shape);
    if (isGoldSpace && !isGoldPipe) {
      return { success: false, error: ERR_GOLD_SPACE };
    }
    return null;
  }

  /**
   * Wraps the regulator pre-check with the standard set of current stats derived
   * from `filledBefore`, avoiding repeated 6-argument call sites.
   */
  private _runRegulatorPreCheck(
    filledBefore: Set<string>,
    filled: Set<string>,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    return this._checkRegulators(
      filledBefore,
      filled,
      this.getCurrentWater(),
      this.getCurrentTemperature(filledBefore),
      this.getCurrentPressure(filledBefore),
      this._turnState.frozen,
    );
  }

  /**
   * Run the three-phase final constraint check used after placing or replacing a tile:
   * regulator pre-check, general constraint validation, regulator post-turn check.
   * Calls `rollback()` and returns a failure MoveResult on the first violation.
   * Returns `null` if all checks pass (caller should then return success).
   *
   * @param filledBefore - Fill set captured before the tile was placed/replaced.
   * @param finalFilled - Fill set after the tile is on the grid.
   * @param rollback - Zero-arg function that reverts the board state.
   * @param constraintErrorPositions - Optional transform applied to constraint error
   *   positions before including them in the returned MoveResult. Used by
   *   replaceInventoryTile to compute the disconnected-constraint intersection.
   */
  private _runFinalConstraintChecks(
    filledBefore: Set<string>,
    finalFilled: Set<string>,
    rollback: () => void,
    constraintErrorPositions?: (raw: GridPos[] | undefined) => GridPos[] | undefined,
  ): MoveResult | null {
    const { error: regError, params: regParams, positions: regPositions } = this._runRegulatorPreCheck(filledBefore, finalFilled);
    if (regError) {
      rollback();
      return { success: false, error: regError, errorParams: regParams ?? undefined, errorTilePositions: regPositions ?? undefined };
    }

    const { error: constraintError, params: constraintParams, positions: constraintPositions } = this._validateConstraints(finalFilled);
    if (constraintError) {
      rollback();
      const errorTilePositions = constraintErrorPositions
        ? constraintErrorPositions(constraintPositions ?? undefined)
        : (constraintPositions ?? undefined);
      return { success: false, error: constraintError, errorParams: constraintParams ?? undefined, errorTilePositions };
    }

    const { error: postRegError, params: postRegParams, positions: postRegPositions } = this._checkRegulatorsPostTurn(filledBefore, finalFilled);
    if (postRegError) {
      rollback();
      return { success: false, error: postRegError, errorParams: postRegParams ?? undefined, errorTilePositions: postRegPositions ?? undefined };
    }

    return null;
  }

  /**
   * Check that no inventory item's effective container-bonus count went negative
   * as a result of replacing the tile at `pos`.
   *
   * Exception 1: if the original effective count was already negative and the
   *   replacement did not make it more negative, the drop is allowed.
   * Exception 2: if the effective count dropped only because the replacement
   *   connected new negative-count containers (no previously-connected positive
   *   container was disconnected), the drop is allowed.
   *
   * Returns a failure MoveResult (after calling `rollback`) if a violation is
   * found, or `null` if all items pass.
   *
   * @param pos - Grid position of the replacement.
   * @param tile - The original tile that was replaced (used to restore the grid
   *   temporarily when lazy-computing `originalBonuses`).
   * @param newTileRef - The new tile currently in `grid[pos.row][pos.col]`.
   * @param savedInventory - Snapshot of inventory taken before the replacement.
   * @param finalFilled - Fill set with the new tile in place.
   * @param finalBonuses - Container bonuses with the new tile in place.
   * @param rollback - Zero-arg function that reverts the board to its pre-replacement state.
   */
  private _checkInventoryContainerDrops(
    pos: GridPos,
    tile: Tile,
    newTileRef: Tile,
    savedInventory: Array<{ shape: PipeShape; count: number }>,
    finalFilled: Set<string>,
    finalBonuses: Map<PipeShape, number>,
    rollback: () => void,
  ): MoveResult | null {
    const hasNegativeEffectiveCount = this.inventory.some((item) => item.count + (finalBonuses.get(item.shape) ?? 0) < 0);
    if (!hasNegativeEffectiveCount) return null;

    // Temporarily restore the old tile to compute the fill and bonuses as
    // they were before this replacement, then put the new tile back.
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = tile;
    const originalFilled = this.getFilledPositions();
    const originalBonuses = this.getContainerBonuses(originalFilled);
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = newTileRef;

    const disconnectedPositions = this._getBlockedNegativeContainerDropPositions(
      savedInventory,
      this.inventory,
      originalFilled,
      originalBonuses,
      finalFilled,
      finalBonuses,
    );
    if (disconnectedPositions) {
      rollback();
      return {
        success: false,
        error: ERR_CONTAINER_REPLACE,
        errorTilePositions: disconnectedPositions,
      };
    }
    return null;
  }

  /**
   * Returns the disconnected positive-count item chambers for the first shape
   * whose effective inventory count drops below zero in a blocked way.
   *
   * `phase = 'disconnectionsOnly'` validates only the intermediate state after
   * applying disconnected item chambers. `phase = 'twoPhase'` falls through to
   * the full final-state reconciliation when that intermediate state is still
   * negative.
   */
  private _getBlockedNegativeContainerDropPositions(
    originalInventory: Array<{ shape: PipeShape; count: number }>,
    finalInventory: Array<{ shape: PipeShape; count: number }>,
    originalFilled: Set<string>,
    originalBonuses: Map<PipeShape, number>,
    finalFilled: Set<string>,
    finalBonuses: Map<PipeShape, number>,
    phase: 'disconnectionsOnly' | 'twoPhase' = 'twoPhase',
  ): GridPos[] | null {
    const disconnectedBonuses = this._getDisconnectedItemChamberBonuses(originalFilled, finalFilled);
    const shapes = new Set<PipeShape>([
      ...originalInventory.map((item) => item.shape),
      ...finalInventory.map((item) => item.shape),
      ...originalBonuses.keys(),
      ...finalBonuses.keys(),
    ]);

    for (const shape of shapes) {
      const disconnectedPositions = this._getDisconnectedPositiveItemChamberPositions(
        shape,
        originalFilled,
        finalFilled,
      );
      const remainingBonusAfterDisconnections =
        (originalBonuses.get(shape) ?? 0) - (disconnectedBonuses.get(shape) ?? 0);
      const finalCount = finalInventory.find((item) => item.shape === shape)?.count ?? 0;
      const disconnectionOnlyEffective = finalCount + remainingBonusAfterDisconnections;
      if (disconnectionOnlyEffective >= 0) continue;
      if (phase === 'disconnectionsOnly') {
        if (disconnectedPositions.length > 0) return disconnectedPositions;
        continue;
      }

      const finalEffective = finalCount + (finalBonuses.get(shape) ?? 0);
      const originalCount = originalInventory.find((item) => item.shape === shape)?.count ?? 0;
      const originalEffective = originalCount + (originalBonuses.get(shape) ?? 0);
      if (this._isBlockedNegativeContainerDrop(originalEffective, finalEffective, disconnectedPositions)) {
        return disconnectedPositions;
      }
    }

    return null;
  }

  /**
   * Returns connected positive item-chamber tiles for `shape` that were present
   * in `beforeFilled` but are absent in `afterFilled`.
   */
  private _getDisconnectedPositiveItemChamberPositions(
    shape: PipeShape,
    beforeFilled: Set<string>,
    afterFilled: Set<string>,
  ): GridPos[] {
    const disconnectedPositions: GridPos[] = [];
    for (const key of beforeFilled) {
      if (afterFilled.has(key)) continue;
      const [r, c] = parseKey(key);
      const t = this.grid[r]?.[c];
      if (
        t?.shape === PipeShape.Chamber &&
        t.chamberContent === 'item' &&
        t.itemShape === shape &&
        t.itemCount > 0
      ) {
        disconnectedPositions.push({ row: r, col: c });
      }
    }
    return disconnectedPositions;
  }

  /**
   * Returns the per-shape item bonuses contributed by item chambers that were in
   * `beforeFilled` but are absent from `afterFilled`.
   */
  private _getDisconnectedItemChamberBonuses(
    beforeFilled: Set<string>,
    afterFilled: Set<string>,
  ): Map<PipeShape, number> {
    const bonuses = new Map<PipeShape, number>();
    for (const key of beforeFilled) {
      if (afterFilled.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' && tile.itemShape !== null) {
        bonuses.set(tile.itemShape, (bonuses.get(tile.itemShape) ?? 0) + tile.itemCount);
      }
    }
    return bonuses;
  }

  /**
   * Returns true when a negative effective-count drop must be blocked.
   * A drop is allowed if it was already negative and did not become worse, or
   * if no positive-count item chamber for that shape was disconnected.
   */
  private _isBlockedNegativeContainerDrop(
    originalEffective: number,
    finalEffective: number,
    disconnectedPositivePositions: GridPos[],
  ): boolean {
    if (finalEffective >= 0) return false;
    if (originalEffective < 0 && finalEffective >= originalEffective) return false;
    return disconnectedPositivePositions.length > 0;
  }

  /**
   * Computes the subset of `constraintPositions` whose keys were present in
   * `prevFilled` but are absent from `newFilled` (i.e. tiles disconnected by the
   * move that are also flagged by the constraint validator).  Falls back to the
   * full `constraintPositions` array when the intersection is empty.
   */
  private _computeDisconnectedConstraintPositions(
    prevFilled: Set<string>,
    newFilled: Set<string>,
    constraintPositions: GridPos[] | null | undefined,
  ): GridPos[] {
    const positionKeys = constraintPositions ? new Set(constraintPositions.map(p => posKey(p.row, p.col))) : null;
    const disconnected: GridPos[] = [];
    for (const k of prevFilled) {
      if (!newFilled.has(k) && positionKeys?.has(k)) {
        const [r, c] = parseKey(k);
        disconnected.push({ row: r, col: c });
      }
    }
    return disconnected.length ? disconnected : constraintPositions ?? [];
  }

  /**
   * Place a pipe from the inventory onto an empty cell.
   * The effective inventory count (base + ItemContainer grants) must be positive.
   * Gold spaces only accept gold pipes; gold pipes may be placed on any empty cell.
   * @param rotation - Initial rotation to apply to the placed tile (default 0).
   */
  placeInventoryTile(pos: GridPos, shape: PipeShape, rotation: Rotation = 0): MoveResult {
    const tile = this.getTile(pos);
    if (!tile || !isEmptyFloor(tile.shape)) return { success: false };

    const goldViolation = this._checkGoldSpacePipe(pos, shape);
    if (goldViolation) return goldViolation;

    const existing = this.inventory.find((it) => it.shape === shape);
    const baseCount = existing?.count ?? 0;

    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(shape) ?? 0);
    if (effectiveCount <= 0) return { success: false };

    this._spendInventory(shape);
    // Compute the pre-placement fill set for valve-gate checking.
    const filledBefore = this.getFilledPositions();
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = new Tile(shape, rotation);

    // Rolls back both the grid cell and the inventory spend on failure.
    const rollback = () => {
      this._invalidateFilledCache();
      this.grid[pos.row][pos.col] = new Tile(this.floorTypes.get(posKey(pos.row, pos.col)) ?? PipeShape.Empty, 0);
      this._unspendInventory(shape);
    };

    // Valve gate: reject if this placement connects to a non-valve side
    // of an unsatisfied valve chamber.
    const valveViolation = this._checkValveViolation(pos, filledBefore);
    if (valveViolation) {
      rollback();
      return valveViolation;
    }

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const filled = this.getFilledPositions();
    const constraintFailure = this._runFinalConstraintChecks(filledBefore, filled, rollback);
    if (constraintFailure) return constraintFailure;

    // Decrement cement setting time after successful placement.
    const cementDecrement = this._cement.applyDecrement(pos);

    return { success: true, cementDecrement };
  }

  /**
   * Atomically replace the tile at the given position with a new pipe from the
   * inventory.  The existing tile is reclaimed (returned to inventory) and the
   * new tile is placed in a single operation – without the intermediate
   * container-grant constraint check that {@link reclaimTile} applies.
   * The constraint is validated once against the fully-replaced board state; if
   * it fails the entire operation is rolled back.
   *
   * Prerequisites:
   *  - The tile at `pos` must satisfy the same "replaceable" rules as reclaimTile
   *    (non-fixed, not Empty, not Source / Sink / Chamber / Granite).
   *  - The new shape must have a positive effective inventory count after the old
   *    tile has been returned.
   *  - Gold spaces only accept gold pipes (same constraint as fresh placement);
   *    gold pipes may replace regular pipes on non-gold spaces and vice versa.
   */
  replaceInventoryTile(pos: GridPos, newShape: PipeShape, rotation: Rotation = 0): MoveResult {
    const tile = this.getTile(pos);

    // Must be a replaceable tile (same guard as reclaimTile)
    if (!this._isReplaceableTile(tile)) return { success: false };

    // ── Cement constraint check ───────────────────────────────────────────────
    const cementCheck = this._cement.isHardened(pos);
    if (cementCheck.blocked) {
      return { success: false, error: cementCheck.error, errorParams: cementCheck.params, errorTilePositions: cementCheck.positions };
    }

    // Gold-space / gold-pipe constraint for the incoming shape
    const goldViolation = this._checkGoldSpacePipe(pos, newShape);
    if (goldViolation) return goldViolation;

    // Save inventory snapshot so we can roll back cleanly on failure
    const savedInventory = this.inventory.map((item) => ({ ...item }));
    const oldShape = tile.shape;

    // Rolls back both the inventory snapshot and the grid cell on failure.
    const rollback = () => {
      this.inventory = savedInventory;
      this._invalidateFilledCache();
      this.grid[pos.row][pos.col] = tile;
    };

    // ── Step 1: Reclaim old tile into inventory (no constraint check yet) ──────
    this._reclaimInventory(oldShape);

    // ── Step 2: Place new tile from inventory ──────────────────────────────────
    // Evaluate container bonuses with the new tile already in place so that a
    // container bridged by this position remains connected in the affordability
    // check.  (Computing bonuses with an Empty cell here would temporarily
    // disconnect such a container and produce a false "not available" result.)
    const newExisting = this.inventory.find((it) => it.shape === newShape);
    const baseCount = newExisting?.count ?? 0;
    // Capture the pre-replacement fill for valve-gate checking (old tile still in grid).
    const filledBeforeReplace = this.getFilledPositions();
    this._invalidateFilledCache();
    this.grid[pos.row][pos.col] = new Tile(newShape, rotation);
    const filledWithNewTile = this.getFilledPositions();
    const bonuses = this.getContainerBonuses(filledWithNewTile);
    const effectiveCount = baseCount + (bonuses.get(newShape) ?? 0);

    if (effectiveCount <= 0) {
      // Check whether the new shape was available before the replacement (with the old tile
      // in place). If it was, block only when the replacement disconnected positive grants
      // for that shape; connecting new negative grants is allowed.
      const originalBonuses = this.getContainerBonuses(filledBeforeReplace);
      const originalEffective = baseCount + (originalBonuses.get(newShape) ?? 0);
      if (originalEffective <= 0) {
        this.inventory = savedInventory;
        this._invalidateFilledCache();
        this.grid[pos.row][pos.col] = tile;
        return { success: false };
      }
      const disconnectedPositions = this._getDisconnectedPositiveItemChamberPositions(
        newShape,
        filledBeforeReplace,
        filledWithNewTile,
      );
      if (disconnectedPositions.length > 0) {
        this.inventory = savedInventory;
        this._invalidateFilledCache();
        this.grid[pos.row][pos.col] = tile;
        return { success: false, error: ERR_CONTAINER_DISCONNECT, errorTilePositions: disconnectedPositions };
      }
    }

    this._spendInventory(newShape);
    // grid[pos.row][pos.col] is already set to new Tile(newShape, rotation) above

    // Valve gate: reject if this replacement connects to a non-valve side
    // of an unsatisfied valve chamber.
    const valveViolation = this._checkValveViolation(pos, filledBeforeReplace);
    if (valveViolation) {
      rollback();
      return valveViolation;
    }

    // ── Step 3: Post-replacement state validation ──────────────────────────────
    // Check that no inventory item's effective count has gone below zero as a
    // result of reduced container-grant bonuses after the replacement.
    // Exception 1: if the original effective count was already negative, the
    //   replacement is allowed as long as the effective count did not become more
    //   negative (i.e. the magnitude did not increase).
    // Exception 2: if the effective count went negative (or more negative) but
    //   only because the replacement connected new container tiles with negative
    //   counts — not because any previously-connected positive container was
    //   disconnected — the replacement is also allowed.
    const finalFilled = this.getFilledPositions();
    const finalBonuses = this.getContainerBonuses(finalFilled);
    const newTileRef = this.grid[pos.row][pos.col];
    const containerDropFailure = this._checkInventoryContainerDrops(
      pos, tile, newTileRef, savedInventory, finalFilled, finalBonuses, rollback,
    );
    if (containerDropFailure) return containerDropFailure;

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const constraintFailure = this._runFinalConstraintChecks(
      filledBeforeReplace,
      finalFilled,
      rollback,
      (raw) => {
        const filledWithOldTile = this.getFilledPositions();
        return this._computeDisconnectedConstraintPositions(filledWithOldTile, finalFilled, raw);
      },
    );
    if (constraintFailure) return constraintFailure;

    // Decrement cement setting time after successful replace.
    const cementDecrement = this._cement.applyDecrement(pos);

    return { success: true, cementDecrement };
  }

  // ─── Water tracking ────────────────────────────────────────────────────────

  /**
   * Compute the map of inventory item bonuses granted by Chamber-item tiles
   * that are currently in the water fill path.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   * @returns A map of PipeShape → bonus count from connected chambers.
   */
  getContainerBonuses(filled?: Set<string>): Map<PipeShape, number> {
    const filledSet = filled ?? this.getFilledPositions();
    const bonuses = new Map<PipeShape, number>();
    for (const key of filledSet) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' && tile.itemShape !== null) {
        bonuses.set(tile.itemShape, (bonuses.get(tile.itemShape) ?? 0) + tile.itemCount);
      }
    }
    return bonuses;
  }

  /**
   * Count how many star chamber tiles are currently in the water fill path.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   * @returns The number of connected star chambers.
   */
  getStarsCollected(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    let count = 0;
    for (const key of filledSet) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'star') {
        count++;
      }
    }
    return count;
  }

  /**
   * Returns true when any tile in the grid is a Chamber whose content belongs
   * to the given set.  Used by {@link hasTempRelevantTiles} and
   * {@link hasPressureRelevantTiles} to avoid duplicating the grid scan.
   * @param contents - The set of chamber content types to search for.
   */
  private _hasAnyTileWithContents(contents: ReadonlySet<string>): boolean {
    for (const row of this.grid) {
      for (const tile of row) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- chamberContent is always set when shape === Chamber
        if (tile.shape === PipeShape.Chamber && contents.has(tile.chamberContent!)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true when the level has any temperature-relevant tiles: a heater
   * chamber, an ice chamber, a snow chamber, a sandstone chamber, a hot-plate
   * chamber, or a source with a non-zero base temperature.
   * Used to decide whether to display the Temp stat in the UI.
   */
  hasTempRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    return sourceTile.temperature !== 0 || this._hasAnyTileWithContents(TEMP_RELEVANT_CONTENTS);
  }

  /**
   * Returns true when the level has any pressure-relevant tiles: a source tile
   * with non-zero base pressure, a pump chamber, a snow chamber, or a
   * sandstone chamber.  Used to decide whether to display the Pressure stat in the UI.
   */
  hasPressureRelevantTiles(): boolean {
    const sourceTile = this.grid[this.source.row][this.source.col];
    return sourceTile.pressure > 0 || this._hasAnyTileWithContents(PRESSURE_RELEVANT_CONTENTS);
  }

  /**
   * Compute the effective source temperature based on the live fill state.
   * This is the source tile's base temperature plus any connected Heater bonuses.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   */
  getCurrentTemperature(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    return this._thermo.computeTemperature(filledSet, this._turnState.connectionTurn);
  }

  /**
   * Compute the effective game Pressure based on the live fill state.
   * The base value is the source tile's pressure; each connected Pump chamber adds its bonus.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   */
  getCurrentPressure(filled?: Set<string>): number {
    const filledSet = filled ?? this.getFilledPositions();
    return this._thermo.computePressure(filledSet, this._turnState.connectionTurn);
  }

  /**
   * Compute current water remaining in the source tank based on the live fill state.
   *
   * When incremental turn tracking is active (i.e. {@link applyTurnDelta} has been
   * called at least once, typically via {@link initHistory}), each tile's water
   * impact is read from the locked-impact map so that ice-tile costs are frozen at
   * the temperature that was in effect when the tile was first connected.
   *
   * When no turn tracking has been applied yet (e.g. in unit tests that build a
   * board directly without going through the game loop), a fully dynamic
   * computation is performed using the current temperature — identical to the
   * pre-incremental behavior — so that existing tests remain valid.
   */
  getCurrentWater(): number {
    const filled = this.getFilledPositions();
    // lockedWaterImpact is non-empty once applyTurnDelta() has been called
    // (at minimum the source tile is always present).
    if (this._turnState.lockedWaterImpact.size > 0) {
      return this._computeIncrementalWater(filled);
    }
    return this._computeDynamicWater(filled);
  }

  /** Incremental path (normal gameplay): sum each filled tile's locked-in water impact. */
  private _computeIncrementalWater(filled: Set<string>): number {
    const lockedWaterImpact = this._turnState.lockedWaterImpact;
    let total = this.sourceCapacity;
    for (const key of filled) {
      total += lockedWaterImpact.get(key) ?? 0;
    }
    return total - this._turnState.leakyPermanentLoss;
  }

  /**
   * Dynamic fallback (test/legacy path): recompute every filled tile's water
   * cost/gain from the current temperature and pressure, identical to the
   * pre-incremental behavior so existing tests remain valid.
   */
  private _computeDynamicWater(filled: Set<string>): number {
    const connectionTurn = this._turnState.connectionTurn;
    const currentTemp = this._thermo.computeTemperature(filled, connectionTurn);
    const currentPressure = this._thermo.computePressure(filled, connectionTurn);
    let pipeCost = 0;
    let tankGain = 0;

    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      const delta = this._computeTileWaterDelta(tile, currentTemp, currentPressure);
      pipeCost += delta.pipeCost;
      tankGain += delta.tankGain;
    }
    return this.sourceCapacity - pipeCost + tankGain - this._turnState.leakyPermanentLoss;
  }

  /** Dispatch a single filled tile to its water cost/gain (pipes vs. chamber contents). */
  private _computeTileWaterDelta(tile: Tile, currentTemp: number, currentPressure: number): { pipeCost: number; tankGain: number } {
    if (PIPE_SHAPES.has(tile.shape)) return { pipeCost: 1, tankGain: 0 };
    if (tile.shape !== PipeShape.Chamber) return { pipeCost: 0, tankGain: 0 };
    return this._computeChamberWaterDelta(tile, currentTemp, currentPressure);
  }

  /** Water cost/gain for one Chamber tile, keyed by its content type. */
  private _computeChamberWaterDelta(tile: Tile, currentTemp: number, currentPressure: number): { pipeCost: number; tankGain: number } {
    switch (tile.chamberContent) {
      case 'tank':
        return { pipeCost: 0, tankGain: tile.capacity };
      case 'dirt':
        return { pipeCost: tile.cost, tankGain: 0 };
      case 'ice':
        return { pipeCost: tile.cost * computeDeltaTemp(tile.temperature, currentTemp), tankGain: 0 };
      case 'snow':
        return {
          pipeCost: snowCostPerDeltaTemp(tile.cost, currentPressure) * computeDeltaTemp(tile.temperature, currentTemp),
          tankGain: 0,
        };
      case 'sandstone':
        return { pipeCost: this._computeSandstoneWaterCost(tile, currentTemp, currentPressure), tankGain: 0 };
      case 'hot_plate':
        return { pipeCost: this._computeHotPlateWaterCost(tile, currentTemp), tankGain: 0 };
      default:
        return { pipeCost: 0, tankGain: 0 };
    }
  }

  /** Sandstone's water cost: full drain on an invalid shatter state, otherwise cost-per-delta-temp. */
  private _computeSandstoneWaterCost(tile: Tile, currentTemp: number, currentPressure: number): number {
    const { shatterOverride, deltaDamage, costPerDeltaTemp } =
      sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
    if (shatterOverride) return 0;
    const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
    // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
    return deltaDamage >= 1 ? costPerDeltaTemp * deltaTemp : this.sourceCapacity + 1;
  }

  /** Hot-plate's net water effect: gain from frozen minus direct water loss. */
  private _computeHotPlateWaterCost(tile: Tile, currentTemp: number): number {
    const effectiveCost = tile.cost * (tile.temperature + currentTemp);
    const waterGain = Math.min(this._turnState.frozen, effectiveCost);
    const waterLoss = Math.max(0, effectiveCost - waterGain);
    return waterLoss - waterGain;
  }

  /**
   * Evaluate and lock the water impact of each newly-connected tile based on
   * the current board state.  Must be called after every player action that may
   * change the fill path (place, rotate, reclaim).
   *
   * Delegates to {@link TurnStateManager.applyTurnDelta} which owns the
   * ordering invariant (detect → cleanup → increment → re-evaluate → lock → leaky).
   *
   * @returns The list of locked-cost changes for UI animation.
   */
  applyTurnDelta(): Array<{ row: number; col: number; delta: number }> {
    const filled = this.getFilledPositions();
    return this._turnState.applyTurnDelta(filled);
  }

  /**
   * Return the frozen gain stored for the siphon tile at the given position,
   * or `null` if that siphon has never connected.  The value is set on first
   * connection and survives disconnection; used by the UI to display the frozen
   * gain on the tile regardless of connected state.
   */
  getSiphonLockedGain(pos: GridPos): number | null {
    return this._turnState.getSiphonLockedGain(pos);
  }

  /**
   * Return the locked water impact for the tile at the given position, or
   * `null` if that tile has not yet been evaluated by {@link applyTurnDelta}.
   * A negative return value represents a water cost; positive represents a gain.
   * Used by the UI to display the actual locked cost of an ice tile in the tooltip.
   */
  getLockedWaterImpact(pos: GridPos): number | null {
    return this._turnState.getLockedWaterImpact(pos);
  }

  /** Capture a copy of all currently locked water impacts. */
  captureLockedWaterImpacts(): Map<string, number> {
    // Map values are numbers, so a shallow Map copy is sufficient.
    return new Map(this._turnState.lockedWaterImpact);
  }

  /** Capture a copy of all hot-plate water gains (frozen water consumed), for use before applyTurnDelta clears disconnected entries. */
  captureLockedHotPlateGains(): Map<string, number> {
    return this._turnState.captureLockedHotPlateGains();
  }

  /**
   * Return the locked frozen water consumed (waterGain) for a hot_plate tile at the given
   * position, or `null` if that tile is not a connected hot_plate.
   * Used by the UI to display the gain/loss breakdown for hot_plate tiles.
   */
  getLockedHotPlateGain(pos: GridPos): number | null {
    return this._turnState.getLockedHotPlateGain(pos);
  }

  /**
   * Return the board temperature that was recorded when the tile at the given position
   * first connected, or `null` if that tile has not yet been evaluated.
   * Used by the UI to reconstruct the locked calculation text in tile tooltips.
   */
  getLockedConnectTemp(pos: GridPos): number | null {
    return this._turnState.getLockedConnectTemp(pos);
  }

  /**
   * Return the board pressure that was recorded when the tile at the given position
   * first connected, or `null` if that tile has not yet been evaluated.
   * Used by the UI to reconstruct the locked calculation text in tile tooltips.
   */
  getLockedConnectPressure(pos: GridPos): number | null {
    return this._turnState.getLockedConnectPressure(pos);
  }

  /**
   * Return the cement setting time for the given position, or `null` if the position
   * is not a cement cell.  Used by the UI to display the cement status in tooltips
   * and to render the appropriate background / shadow effect.
   */
  getCementDryingTime(pos: GridPos): number | null {
    return this._cement.getDryingTime(pos);
  }

  /**
   * Run all three constraint checks (sandstone → heater → pump) in order,
   * stopping at the first failure.  Convenience wrapper used by
   * {@link placeInventoryTile}, {@link replaceInventoryTile},
   * {@link reclaimTile}, {@link rotateTile}, and {@link rotateTileBy}
   * to avoid duplicating the short-circuit chain.
   * @param filled - Current fill set (after the board mutation).
   * @returns The first error message found, or `null` if all constraints pass.
   */
  private _validateConstraints(filled: Set<string>): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    return this._validator.validate(
      filled,
      this._turnState.lockedWaterImpact,
      this._turnState.connectionTurn,
      this._turnState.turnNumber,
    );
  }

  /**
   * Scan `newFilled` for newly-connected Regulator tiles (i.e. not present in
   * `preFilled`) and test each one against the provided stat snapshot.
   *
   * Using `preFilled` as the "already connected" guard rather than the locked-
   * impact map means the check works correctly both before *and* after
   * {@link applyTurnDelta} has been called (after which the locked map would
   * include the newly-connected tiles and incorrectly skip them).
   *
   * All failing regulators are checked in iteration order; the first failure
   * is returned immediately.
   *
   * @param preFilled - Fill set before the current board mutation (tiles to skip).
   * @param newFilled - Fill set after the current board mutation (tiles to scan).
   * @param water - Water stat value to test against the threshold.
   * @param temperature - Temperature stat value to test against the threshold.
   * @param pressure - Pressure stat value to test against the threshold.
   * @param frozen - Frozen stat value to test against the threshold.
   */
  private _checkRegulators(
    preFilled: Set<string>,
    newFilled: Set<string>,
    water: number,
    temperature: number,
    pressure: number,
    frozen: number,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    for (const key of newFilled) {
      if (preFilled.has(key)) continue; // skip previously-connected tiles
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile || tile.shape !== PipeShape.Chamber || tile.chamberContent !== 'regulator') continue;

      const result = this._checkRegulatorTile(tile, r, c, water, temperature, pressure, frozen);
      if (result) return result;
    }
    return { error: null, params: null, positions: null };
  }

  /** Resolve which live stat value a regulator's `stat` field refers to. */
  private _resolveRegulatorStatValue(
    stat: RegulatorStat, water: number, temperature: number, pressure: number, frozen: number,
  ): number {
    switch (stat) {
      case 'water':       return water;
      case 'frozen':      return frozen;
      case 'temperature': return temperature;
      case 'pressure':    return pressure;
      // Exhaustive over RegulatorStat today; guard against a future member
      // being added without a case (would otherwise leave statValue unset).
      default: throw new Error(`Unhandled regulator stat: ${stat as string}`);
    }
  }

  /** Evaluate a regulator's comparison operator against its stat value and threshold. */
  private _evaluateRegulatorOperator(op: RegulatorOperator, statValue: number, threshold: number): boolean {
    switch (op) {
      case '<': return statValue <  threshold;
      case '>': return statValue >  threshold;
      case '=': return statValue === threshold;
      // Exhaustive over RegulatorOperator today; guard against a future
      // operator being added without a case (would leave passes unset).
      default: throw new Error(`Unhandled regulator operator: ${op as string}`);
    }
  }

  /** Check one newly-connected regulator tile; returns the rejection result, or `null` if it passes. */
  private _checkRegulatorTile(
    tile: Tile, r: number, c: number, water: number, temperature: number, pressure: number, frozen: number,
  ): { error: string; params: TranslationParams; positions: GridPos[] } | null {
    const stat = _orDefault(tile.regulatorStat, 'water' as RegulatorStat);
    const op = _orDefault(tile.regulatorOperator, '>' as RegulatorOperator);
    const threshold = tile.cost;
    const statValue = this._resolveRegulatorStatValue(stat, water, temperature, pressure, frozen);
    const passes = this._evaluateRegulatorOperator(op, statValue, threshold);
    if (passes) return null;
    return {
      error: ERR_REGULATOR_CHECK,
      params: { stat: t(`stat.${stat}`), op, threshold },
      positions: [{ row: r, col: c }],
    };
  }

  /**
   * Temporarily apply the turn delta to compute post-turn stats, run the
   * post-turn regulator check on the **newly-connected** regulators
   * (`newFilled − preFilled`), then restore the turn state.
   *
   * Must be called after the board mutation has already been applied so that
   * `applyTurnDelta()` sees the final fill path — including any newly-connected
   * heaters, pumps, ice, gel, and siphon tiles — when locking water impacts.
   *
   * ### Why `applyTurnDelta()` is unavoidable here
   * The regulator check compares post-turn water, temperature, pressure, and
   * frozen values.  All four are derived from turn-state that only exists after
   * `applyTurnDelta()` has run:
   *  - `getCurrentWater()` reads `lockedWaterImpact`, which is populated by
   *    `applyTurnDelta()`.
   *  - `getCurrentTemperature()` / `getCurrentPressure()` use `connectionTurn`,
   *    which is incremented by `applyTurnDelta()`.
   *  - `frozen` is updated during `applyTurnDelta()`.
   *
   * There is therefore no cheaper way to obtain the stats needed by
   * `_checkRegulators`.  On the rejection path the `applyTurnDelta()` work is
   * discarded, but `restoreSnapshot` guarantees that the turn state is identical
   * to what it was before the call, so correctness is preserved in both cases.
   *
   * @param preFilled - Fill set before the board mutation (used to identify new tiles).
   * @param newFilled - Fill set after the board mutation.
   */
  private _checkRegulatorsPostTurn(
    preFilled: Set<string>,
    newFilled: Set<string>,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    const savedTurnState = this._turnState.captureSnapshot();
    this.applyTurnDelta();
    const result = this._checkRegulators(
      preFilled,
      newFilled,
      this.getCurrentWater(),
      this.getCurrentTemperature(newFilled),
      this.getCurrentPressure(newFilled),
      this._turnState.frozen,
    );
    this._turnState.restoreSnapshot(savedTurnState);
    return result;
  }

  /**
   * Returns `true` when the tile at the given position can be reclaimed or
   * replaced by the player.  A tile passes this check when it is non-fixed,
   * non-empty, and is not a Source, Sink, Chamber, obstacle, or spinner pipe.
   */
  private _isReplaceableTile(tile: Tile | null | undefined): tile is Tile {
    if (!tile || tile.isFixed || isEmptyFloor(tile.shape)) return false;
    return (
      tile.shape !== PipeShape.Source &&
      tile.shape !== PipeShape.Sink &&
      tile.shape !== PipeShape.Chamber &&
      !isObstacleTile(tile.shape) &&
      !SPIN_PIPE_SHAPES.has(tile.shape)
    );
  }

  /**
   * Adjust the inventory count for `shape` by `delta`.
   * Adds a new entry if the shape is not already present.
   * Used by {@link _reclaimInventory} and {@link _spendInventory}.
   */
  private _adjustInventory(shape: PipeShape, delta: number): void {
    const idx = this.inventory.findIndex((it) => it.shape === shape);
    if (idx !== -1) {
      this.inventory[idx].count += delta;
    } else {
      this.inventory.push({ shape, count: delta });
    }
  }

  /**
   * Increment the inventory count for `shape` by 1 (reclaim one tile from the board).
   * Adds a new entry with count=1 if the shape is not already present.
   */
  private _reclaimInventory(shape: PipeShape): void {
    this._adjustInventory(shape, +1);
  }

  /**
   * Decrement the inventory count for `shape` by 1 (spend one tile from the inventory).
   * When the shape has no base count (comes purely from container bonuses), pushes a
   * new entry with count=-1 to track the over-draw.
   */
  private _spendInventory(shape: PipeShape): void {
    this._adjustInventory(shape, -1);
  }

  /**
   * Undo a previous {@link _spendInventory} call for `shape`.
   * If the shape has an existing inventory entry, increments its count.
   * Otherwise, removes the sentinel over-draw entry (count === -1) that was
   * pushed by `_spendInventory` when the shape had no base inventory entry.
   */
  private _unspendInventory(shape: PipeShape): void {
    const idx = this.inventory.findIndex((it) => it.shape === shape);
    if (idx !== -1) {
      if (this.inventory[idx].count === -1) {
        // Remove the sentinel over-draw entry pushed by _spendInventory when the
        // shape had no base inventory entry; restoring the pre-spend no-entry state.
        this.inventory.splice(idx, 1);
      } else {
        this.inventory[idx].count++;
      }
    }
  }

  /**
   * Check for invalid temperature or pressure state caused by pre-connected
   * Heater/Pump tiles with negative values at level start.
   * Call this after {@link initHistory} to detect design-time errors.
   * @returns `{ error, positions }` where `error` is null if the state is valid.
   */
  checkInitialStateErrors(): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    const filled = this.getFilledPositions();
    return this._validator.validate(
      filled,
      this._turnState.lockedWaterImpact,
      this._turnState.connectionTurn,
      this._turnState.turnNumber,
    );
  }

  // ─── Grid validation ───────────────────────────────────────────────────────

  /**
   * Validate that no tank-like tile (Tank or Chamber with tank content) on the border of
   * the grid has a connection pointing outside the grid, and that adjacent such
   * tiles have symmetric (mutually matching) connections.
   * @returns Array of human-readable error messages (empty = valid).
   */
  validateGrid(): string[] {
    const errors: string[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.grid[r][c];
        if (!_isTankLikeTile(tile)) continue;
        errors.push(...this._collectTankEdgeErrors(r, c, tile));
        errors.push(...this._collectTankAdjacencySymmetryErrors(r, c, tile));
      }
    }
    return errors;
  }

  /** Errors for any access point on a border tank-like tile that leads off-grid. */
  private _collectTankEdgeErrors(r: number, c: number, tile: Tile): string[] {
    const errors: string[] = [];
    const label = 'Chamber(tank)';
    for (const dir of DIRECTIONS) {
      if (!tile.connections.has(dir)) continue;
      const delta = NEIGHBOUR_DELTA[dir];
      const nr = r + delta.row;
      const nc = c + delta.col;
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) {
        errors.push(
          `${label} at (${r},${c}) has an access point facing ${dir} which leads off the grid.`,
        );
      }
    }
    return errors;
  }

  /** Errors for any adjacent tank-like tile pair with mismatched connections on their shared edge. */
  private _collectTankAdjacencySymmetryErrors(r: number, c: number, tile: Tile): string[] {
    const errors: string[] = [];
    for (const dir of DIRECTIONS) {
      const delta = NEIGHBOUR_DELTA[dir];
      const neighborPos: GridPos = { row: r + delta.row, col: c + delta.col };
      const neighbor = this.getTile(neighborPos);
      if (!neighbor || !_isTankLikeTile(neighbor)) continue;

      const thisConnects = tile.connections.has(dir);
      const neighborConnects = neighbor.connections.has(oppositeDirection(dir));

      if (thisConnects !== neighborConnects) {
        errors.push(
          `Adjacent tanks at (${r},${c}) and (${neighborPos.row},${neighborPos.col}) ` +
          `have mismatched connections on the ${dir} edge.`,
        );
      }
    }
    return errors;
  }

  // ─── Existing helpers ──────────────────────────────────────────────────────

  /** Build a randomised grid for a new puzzle (legacy random mode). */
  private _buildGrid(): Tile[][] {
    const grid = this._emptyGrid();
    const shapes: PipeShape[] = [
      PipeShape.Straight,
      PipeShape.Elbow,
      PipeShape.Tee,
      PipeShape.Cross,
    ];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const pos: GridPos = { row: r, col: c };
        if (this._posEqual(pos, this.source)) {
          grid[r][c] = new Tile(PipeShape.Source, 0, true);
        } else if (this._posEqual(pos, this.sink)) {
          grid[r][c] = new Tile(PipeShape.Sink, 0, true);
        } else {
          const shape = shapes[Math.floor(Math.random() * shapes.length)];
          const rot = ([0, 90, 180, 270] as Rotation[])[Math.floor(Math.random() * 4)];
          grid[r][c] = new Tile(shape, rot);
        }
      }
    }
    return grid;
  }

  private _emptyGrid(): Tile[][] {
    const grid: Tile[][] = [];
    for (let r = 0; r < this.rows; r++) {
      grid[r] = [];
      for (let c = 0; c < this.cols; c++) {
        grid[r][c] = new Tile(PipeShape.Empty, 0);
      }
    }
    return grid;
  }

  private _posEqual(a: GridPos, b: GridPos): boolean {
    return a.row === b.row && a.col === b.col;
  }

  /**
   * Returns the tile at the given position, or null if out of bounds.
   * @param pos - Grid coordinate.
   */
  getTile(pos: GridPos): Tile | null {
    if (pos.row < 0 || pos.row >= this.rows) return null;
    if (pos.col < 0 || pos.col >= this.cols) return null;
    return this.grid[pos.row][pos.col];
  }

  /**
   * Rotate the tile at the given position 90° clockwise.
   * Convenience wrapper around {@link rotateTileBy} with `steps = 1`.
   */
  rotateTile(pos: GridPos): MoveResult {
    return this.rotateTileBy(pos, 1);
  }

  /**
   * Rotate the tile at the given position 90° clockwise.
   * Alias for {@link rotateTile} used during move replay.
   */
  rotateTileCW(pos: GridPos): MoveResult {
    return this.rotateTileBy(pos, 1);
  }

  /**
   * Rotate the tile at the given position 90° counter-clockwise.
   * Equivalent to {@link rotateTileBy} with `steps = 3`.
   */
  rotateTileCCW(pos: GridPos): MoveResult {
    return this.rotateTileBy(pos, 3);
  }

  /**
   * Place or replace a tile at `pos` as part of move replay.
   * Behaves like {@link placeInventoryTile} when the cell is empty,
   * or {@link replaceInventoryTile} when it already holds a pipe.
   * Used by the replay engine where the move log dictates the exact action.
   */
  placeOrReplaceForReplay(row: number, col: number, shape: PipeShape, rotation: Rotation): MoveResult {
    const pos: GridPos = { row, col };
    const tile = this.getTile(pos);
    if (!tile) return { success: false };
    if (isEmptyFloor(tile.shape)) {
      return this.placeInventoryTile(pos, shape, rotation);
    }
    return this.replaceInventoryTile(pos, shape, rotation);
  }

  /**
   * Rotates the tile at `pos` clockwise by `steps × 90°` as a single game operation.
   * The sandstone constraint is validated only against the final rotation, so the
   * entire multi-step rotation either succeeds or is fully reverted.
   */
  rotateTileBy(pos: GridPos, steps: number): MoveResult {
    const tile = this.getTile(pos);
    if (!tile) return { success: false };
    // Normalize to 0–3, handling both positive and negative values (e.g. -1 → 3).
    const normalizedSteps = ((steps % 4) + 4) % 4;
    const precheck = this._rotationPrecheckResult(pos, tile, normalizedSteps);
    if (precheck) return precheck;
    return this._performRotation(pos, tile, normalizedSteps);
  }

  /**
   * Guard clauses shared by every rotation: spinner/fixed/empty-floor tiles, cross
   * pipes (silently rejected), the cement constraint, and the steps===0 no-op.
   * Returns a `MoveResult` when rotation should not proceed, `null` to continue.
   */
  private _rotationPrecheckResult(pos: GridPos, tile: Tile, normalizedSteps: number): MoveResult | null {
    // Spinner pipes are pre-placed fixed tiles that the player is allowed to rotate.
    if ((tile.isFixed && !SPIN_PIPE_SHAPES.has(tile.shape)) || isEmptyFloor(tile.shape)) {
      return { success: false };
    }
    // Cross pipes face all four directions and rotating them is not a valid move.
    // Fail silently (no error message) because there is nothing wrong with the board state.
    if (CROSS_PIPE_SHAPES.has(tile.shape)) return { success: false };

    // ── Cement constraint check (for player-placed pipe tiles only) ───────────
    const cementCheck = this._cement.isHardened(pos, tile);
    if (cementCheck.blocked) {
      return { success: false, error: cementCheck.error, errorParams: cementCheck.params, errorTilePositions: cementCheck.positions };
    }
    if (normalizedSteps === 0) return { success: true };
    return null;
  }

  /** Rotate `tile` back to its pre-rotation orientation and drop the fill cache. */
  private _revertRotation(tile: Tile, normalizedSteps: number): void {
    for (let i = 0; i < 4 - normalizedSteps; i++) {
      tile.rotate();
    }
    this._invalidateFilledCache();
  }

  /** Revert an in-progress rotation and return the failing result that triggered it. */
  private _abortRotation(tile: Tile, normalizedSteps: number, result: MoveResult): MoveResult {
    this._revertRotation(tile, normalizedSteps);
    return result;
  }

  /** Regulator pre-check packaged as a `MoveResult`, or `null` when it passes. */
  private _buildRegulatorPreCheckResult(filledBefore: Set<string>, filled: Set<string>): MoveResult | null {
    const { error, params, positions } = this._runRegulatorPreCheck(filledBefore, filled);
    if (!error) return null;
    return { success: false, error, errorParams: params ?? undefined, errorTilePositions: positions ?? undefined };
  }

  /** Final-state constraint check packaged as a `MoveResult`, or `null` when it passes. */
  private _buildConstraintCheckResult(filledBefore: Set<string>, filled: Set<string>): MoveResult | null {
    const { error, params, positions } = this._validateConstraints(filled);
    if (!error) return null;
    // Highlight only tiles that are both disconnected by the rotation AND
    // in the constraint-violating positions set.  Falls back to positions
    // when the intersection is empty.
    return {
      success: false,
      error,
      errorParams: params ?? undefined,
      errorTilePositions: this._computeDisconnectedConstraintPositions(filledBefore, filled, positions),
    };
  }

  /**
   * Container-grant constraint packaged as a `MoveResult`, or `null` when it passes.
   * Blocks only if the rotation reduced the positive container grant for a shape by
   * disconnecting positive grants (not simply connecting negative grants).
   */
  private _buildContainerCheckResult(
    filledBefore: Set<string>, bonusesBefore: Map<PipeShape, number>,
    filled: Set<string>, newBonuses: Map<PipeShape, number>,
  ): MoveResult | null {
    const disconnectedPositions = this._getBlockedNegativeContainerDropPositions(
      this.inventory, this.inventory, filledBefore, bonusesBefore, filled, newBonuses,
    );
    if (!disconnectedPositions) return null;
    return { success: false, error: ERR_CONTAINER_ROTATE, errorTilePositions: disconnectedPositions };
  }

  /** Regulator post-turn check packaged as a `MoveResult`, or `null` when it passes. */
  private _buildRegulatorPostCheckResult(filledBefore: Set<string>, filled: Set<string>): MoveResult | null {
    const { error, params, positions } = this._checkRegulatorsPostTurn(filledBefore, filled);
    if (!error) return null;
    return { success: false, error, errorParams: params ?? undefined, errorTilePositions: positions ?? undefined };
  }

  /**
   * Rotates `tile` forward `normalizedSteps` and validates the result (valve gate,
   * regulators, constraints, container grants), reverting the rotation and
   * returning the failure on the first check that rejects it.
   */
  private _performRotation(pos: GridPos, tile: Tile, normalizedSteps: number): MoveResult {
    // Capture the pre-rotation fill and container grant bonuses
    // for disconnection-highlight computation and valve-gate check.
    const filledBefore = this.getFilledPositions();
    const bonusesBefore = this.getContainerBonuses(filledBefore);
    for (let i = 0; i < normalizedSteps; i++) {
      tile.rotate();
    }
    this._invalidateFilledCache();

    // Valve gate: reject if this rotation connects to a non-valve side
    // of an unsatisfied valve chamber.
    const valveViolation = this._checkValveViolation(pos, filledBefore);
    if (valveViolation) return this._abortRotation(tile, normalizedSteps, valveViolation);

    // Validate the final state.
    const filled = this.getFilledPositions();
    const regPreResult = this._buildRegulatorPreCheckResult(filledBefore, filled);
    if (regPreResult) return this._abortRotation(tile, normalizedSteps, regPreResult);

    const constraintResult = this._buildConstraintCheckResult(filledBefore, filled);
    if (constraintResult) return this._abortRotation(tile, normalizedSteps, constraintResult);

    const newBonuses = this.getContainerBonuses(filled);
    const containerResult = this._buildContainerCheckResult(filledBefore, bonusesBefore, filled, newBonuses);
    if (containerResult) return this._abortRotation(tile, normalizedSteps, containerResult);

    const regPostResult = this._buildRegulatorPostCheckResult(filledBefore, filled);
    if (regPostResult) return this._abortRotation(tile, normalizedSteps, regPostResult);

    // Decrement cement setting time after successful rotation.
    const cementDecrement = this._cement.applyDecrement(pos, tile);
    return { success: true, cementDecrement };
  }

  /**
   * Check whether two adjacent tiles are mutually connected along the shared edge.
   * Returns false if a one-way tile at either position blocks flow in the travel direction.
   * @param fromPos - The position of the first tile.
   * @param dir - The direction from the first tile toward the second.
   */
  areMutuallyConnected(fromPos: GridPos, dir: Direction): boolean {
    const from = this.getTile(fromPos);
    if (!from || !from.connections.has(dir)) return false;

    const delta = NEIGHBOUR_DELTA[dir];
    const toPos: GridPos = { row: fromPos.row + delta.row, col: fromPos.col + delta.col };
    const to = this.getTile(toPos);
    if (!to) return false;

    if (!to.connections.has(oppositeDirection(dir))) return false;

    // One-way tile at fromPos: water cannot exit in the direction opposite the arrow.
    const fromKey = posKey(fromPos.row, fromPos.col);
    const fromOwDir = this.oneWayData.get(fromKey);
    if (fromOwDir !== undefined && dir === oppositeDirection(fromOwDir)) return false;

    // One-way tile at toPos: water cannot enter traveling in the direction opposite the arrow.
    const toKey = posKey(toPos.row, toPos.col);
    const toOwDir = this.oneWayData.get(toKey);
    if (toOwDir !== undefined && dir === oppositeDirection(toOwDir)) return false;

    return true;
  }

  /**
   * Return the one-way direction of the cell at `pos`, or null if it is not a one-way tile.
   */
  getOneWayDirection(pos: GridPos): Direction | null {
    return this.oneWayData.get(posKey(pos.row, pos.col)) ?? null;
  }

  /**
   * Flood-fill from the source tile and return all reachable positions.
   *
   * Valve rule: a Chamber tile with `firstConnections` is only entered
   * (and therefore counted as source-connected) when the BFS path arrives via
   * one of its valve ("first") directions.  Non-valve arrivals are
   * silently skipped; if a valve arrival is found later, the chamber and
   * everything downstream of it become reachable at that point.
   *
   * @returns Set of stringified "row,col" keys that are water-filled.
   */
  getFilledPositions(): Set<string> {
    if (this._filledPositionsCache !== null) return this._filledPositionsCache;

    const reached = new Map<string, GridPos>();
    const sourceKey = posKey(this.source.row, this.source.col);
    reached.set(sourceKey, this.source);

    const queue: GridPos[] = [this.source];
    let qi = 0;
    while (qi < queue.length) {
      const pos = queue[qi++];
      for (const dir of DIRECTIONS) {
        if (!this.areMutuallyConnected(pos, dir)) continue;
        const delta = NEIGHBOUR_DELTA[dir];
        const nextPos: GridPos = { row: pos.row + delta.row, col: pos.col + delta.col };
        const nextKey = posKey(nextPos.row, nextPos.col);
        if (reached.has(nextKey)) continue;
        const nextTile = this.grid[nextPos.row]?.[nextPos.col];
        if (!nextTile) continue;
        // Valve check: only enter a chamber via a first-connection direction.
        if (nextTile.firstConnections && nextTile.firstConnections.size > 0) {
          const arrivalDir = oppositeDirection(dir);
          if (!nextTile.firstConnections.has(arrivalDir)) continue;
        }
        reached.set(nextKey, nextPos);
        queue.push(nextPos);
      }
    }

    this._filledPositionsCache = new Set(reached.keys());
    return this._filledPositionsCache;
  }

  /** Invalidate the {@link getFilledPositions} cache after any grid mutation. */
  private _invalidateFilledCache(): void {
    this._filledPositionsCache = null;
  }

  /**
   * Returns true when the water has reached the sink tile.
   */
  isSolved(): boolean {
    const filled = this.getFilledPositions();
    return filled.has(posKey(this.sink.row, this.sink.col));
  }

  /**
   * Check whether a tile placement or rotation at `pos` would illegally connect
   * to a valve chamber's non-valve side before the chamber has been
   * satisfied via its valve.
   *
   * Must be called **after** the mutation is applied to the grid, using the
   * **pre-mutation** fill set as `filledBefore`.
   *
   * @returns A failing `MoveResult` when a violation is found, otherwise `null`.
   */
  private _checkValveViolation(pos: GridPos, filledBefore: Set<string>): { success: false; error: string; errorTilePositions?: GridPos[] } | null {
    const tile = this.getTile(pos);
    if (!tile) return null;

    for (const dir of tile.connections) {
      const delta = NEIGHBOUR_DELTA[dir];
      const neighborPos: GridPos = { row: pos.row + delta.row, col: pos.col + delta.col };
      const neighborKey = posKey(neighborPos.row, neighborPos.col);
      const neighborTile = this.getTile(neighborPos);
      if (!neighborTile || !neighborTile.firstConnections || neighborTile.firstConnections.size === 0) continue;

      // Check mutual connection
      if (!neighborTile.connections.has(oppositeDirection(dir))) continue;

      // `dir` is the direction from `pos` toward `neighbor`.
      // From the neighbor's perspective, the arrival direction is `opposite(dir)`.
      const arrivalDir = oppositeDirection(dir);

      // Only block when arriving via a non-valve side.
      if (neighborTile.firstConnections.has(arrivalDir)) continue;

      // Block if the neighbor chamber was not already source-connected before this move.
      if (!filledBefore.has(neighborKey)) {
        return { success: false, error: ERR_VALVE, errorTilePositions: [neighborPos] };
      }
    }
    return null;
  }
}
