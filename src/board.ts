import { Tile, oppositeDirection } from './tile';
import { AmbientDecoration, AmbientDecorationType, Direction, GridPos, InventoryItem, LevelDef, PipeShape, Rotation, TEMP_RELEVANT_CONTENTS, PRESSURE_RELEVANT_CONTENTS } from './types';
import { ThermoSimulator, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './thermoSimulator';
import { CementSystem } from './cementSystem';
import { ConstraintValidator } from './constraintValidator';
import { TurnStateManager, TurnStateSnapshot } from './turnStateManager';

// Re-export cost helpers so existing consumers (game.ts, renderer.ts) need no import changes.
export { computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './thermoSimulator';
export { ERR_SANDSTONE_TOO_HARD_PREFIX } from './constraintValidator';

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
 * Elbow pipe shapes – two-connection pipes that form a 90° corner.  When drawn
 * arm-by-arm (e.g. because one or both arms uses a butt end cap), the corner
 * at the tile centre needs an explicit round nub to avoid a visual gap.
 */
export const ELBOW_PIPE_SHAPES = new Set<PipeShape>([
  PipeShape.Elbow,
  PipeShape.GoldElbow,
  PipeShape.SpinElbow,
  PipeShape.SpinElbowCement,
  PipeShape.LeakyElbow,
]);

/**
 * Returns true for impassable obstacle tiles (Granite, Tree, Sea).
 * Obstacle tiles have no connections, cannot be moved, and water cannot flow through them.
 */
export function isObstacleTile(shape: PipeShape): boolean {
  return shape === PipeShape.Granite || shape === PipeShape.Tree || shape === PipeShape.Sea;
}

/** All empty-floor shapes that a player may fill with a pipe from inventory. */
export const EMPTY_FLOOR_SHAPES: readonly PipeShape[] = [
  PipeShape.Empty, PipeShape.EmptyDirt, PipeShape.EmptyDark,
];

/**
 * Returns true when shape is any empty floor type (Grass, Dirt, or Dark).
 * Use this instead of `=== PipeShape.Empty` for all game-rule checks so that
 * future empty floor types require no additional code changes.
 */
export function isEmptyFloor(shape: PipeShape): boolean {
  return shape === PipeShape.Empty || shape === PipeShape.EmptyDirt || shape === PipeShape.EmptyDark;
}

/**
 * Compute the display floor type (Empty / EmptyDirt / EmptyDark) for every cell
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
export function computeFloorTypesFromGrid(
  rows: number,
  cols: number,
  getCellFloorType: (r: number, c: number) => PipeShape | null,
): ReadonlyMap<string, PipeShape> {
  const map = new Map<string, PipeShape>();

  // Majority vote over cardinal neighbours already resolved in `map`.
  const majorityFromNeighbors = (r: number, c: number): PipeShape => {
    const counts = new Map<PipeShape, number>([[PipeShape.Empty, 0], [PipeShape.EmptyDirt, 0], [PipeShape.EmptyDark, 0]]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const ft = map.get(posKey(nr, nc)) ?? getCellFloorType(nr, nc);
      if (ft !== null) counts.set(ft, (counts.get(ft) ?? 0) + 1);
    }
    let best: PipeShape = PipeShape.Empty;
    let bestCount = -1;
    for (const shape of EMPTY_FLOOR_SHAPES) {
      const cnt = counts.get(shape) ?? 0;
      if (cnt > bestCount) { bestCount = cnt; best = shape; }
    }
    return best;
  };

  // Pass 1: seed from empty-floor cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ft = getCellFloorType(r, c);
      if (ft !== null) map.set(posKey(r, c), ft);
    }
  }

  // Pass 2: BFS outward from resolved cells to cover all remaining tile types.
  const queue: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (map.has(posKey(r, c))) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && map.has(posKey(nr, nc))) {
          queue.push([r, c]);
          break;
        }
      }
    }
  }
  let qi = 0;
  while (qi < queue.length) {
    const [r, c] = queue[qi++];
    const key = posKey(r, c);
    if (map.has(key)) continue;
    map.set(key, majorityFromNeighbors(r, c));
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !map.has(posKey(nr, nc))) {
        queue.push([nr, nc]);
      }
    }
  }

  return map;
}

/**
 * Returns true for tile shapes that have connector arms: ordinary pipe shapes
 * as well as Source and Sink tiles.  These are the shapes that use a black
 * stroke outline on their arms and therefore need connection-bridge patches at
 * shared tile boundaries to hide the stroke overflow.
 */
export function isConnectorShape(shape: PipeShape): boolean {
  return PIPE_SHAPES.has(shape) || shape === PipeShape.Source || shape === PipeShape.Sink;
}

// ── Error message constants ────────────────────────────────────────────────
// Centralised here so changes propagate automatically and tests can reference
// the same strings without hard-coding them again.

/** Error shown when a non-gold pipe is placed on a gold space. */
export const ERR_GOLD_SPACE = 'Only gold pipes may be placed on a gold space.';

/** Error shown when removing a tile would disconnect a container and reduce an inventory count below zero. */
const ERR_CONTAINER_REMOVE =
  'Cannot remove: disconnecting an item container would reduce an inventory count below 0. ' +
  'Reconfigure the path first.';

/** Error shown when a replacement would disconnect the container that grants the new shape. */
const ERR_CONTAINER_DISCONNECT =
  'Cannot replace: placing this pipe would disconnect a container that grants it. ' +
  'Reconfigure the path first.';

/** Error shown when replacing a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_REPLACE =
  'Cannot replace: you have used items granted by a connected container. ' +
  'Reconfigure the path first.';

/** Error shown when rotating a tile would leave placed tiles without covering container grants. */
const ERR_CONTAINER_ROTATE =
  'Cannot rotate: you have used items granted by a connected container. ' +
  'Reconfigure the path first.';

/** Snapshot of the board state (grid + inventory) used for undo/redo. */
type Snapshot = {
  grid: Tile[][];
  inventory: InventoryItem[];
  turnState: TurnStateSnapshot;
  cementData: Map<string, number>;
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
  /** Human-readable error message when `success` is false, if applicable. */
  error?: string;
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
 * - **Grass** (Empty):     flowers, grass tufts, mushrooms — organic surface.
 * - **Dirt** (EmptyDirt):  grass tufts, crystals, pebbles — no flowers/mushrooms.
 * - **Dark** (EmptyDark):  pebbles only — stone-like surface.
 *
 * This is the single authoritative source for floor-type ↔ decoration mapping,
 * used by {@link generateAmbientDecorations} so the logic is not duplicated
 * across the game board and chapter-map contexts.
 */
export function decorationTypesForFloor(floorType: PipeShape): AmbientDecorationType[] {
  switch (floorType) {
    case PipeShape.EmptyDirt: return ['grass', 'crystal', 'pebbles'];
    case PipeShape.EmptyDark: return ['mushroom', 'crystal', 'pebbles'];
    default:                  return ['flower', 'grass', 'mushroom'];  // Empty / grass
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
 *   generated (see {@link decorationTypesForFloor}).  Defaults to grass (Empty)
 *   for every cell when omitted.
 */
export function generateAmbientDecorations(
  rows: number,
  cols: number,
  getFloorType?: (r: number, c: number) => PipeShape,
): ReadonlyMap<string, AmbientDecoration> {
  const map = new Map<string, AmbientDecoration>();
  // Counters per type for golden-angle rotation distribution (pebbles & crystals).
  const typeCount: Partial<Record<AmbientDecorationType, number>> = {};
  // Golden angle in degrees – gives the best uniform distribution of rotations.
  const GOLDEN_ANGLE = 137.50776405003785;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (Math.random() >= DECORATION_DENSITY) continue;
      const floorType = getFloorType ? getFloorType(r, c) : PipeShape.Empty;
      const types = decorationTypesForFloor(floorType);
      const type = types[Math.floor(Math.random() * types.length)];
      // Mushrooms scale 0.7–1.5 (up to 50 % larger); crystals scale 0.75–1.25 (±25 %).
      const scale = type === 'mushroom' ? 0.7 + Math.random() * 0.8
                  : type === 'crystal'  ? 0.75 + Math.random() * 0.5
                  : undefined;
      // Crystals randomly show either one or two shards.
      const count = type === 'crystal' ? (Math.random() < 0.5 ? 1 : 2) : undefined;
      // Pebbles and crystals: distribute rotations using the golden angle so that
      // each instance of the same type has a visually distinct orientation.
      // A random base angle is chosen per type on first encounter so that different
      // board instances do not show the same starting orientations.
      const idx = typeCount[type] ?? 0;
      typeCount[type] = idx + 1;
      const baseAngle = Math.random() * 360;
      const rotation = (type === 'pebbles' || type === 'crystal')
        ? (baseAngle + idx * GOLDEN_ANGLE) % 360
        : baseAngle;
      map.set(`${r},${c}`, {
        row: r,
        col: c,
        type,
        // Keep decorations away from cell edges for a natural look
        offsetX: 0.15 + Math.random() * 0.70,
        offsetY: 0.15 + Math.random() * 0.70,
        rotation,
        variant: Math.floor(Math.random() * 3),
        scale,
        count,
      });
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
   * Empty cells: their own PipeShape (Empty / EmptyDirt / EmptyDark).
   * Source, Sink, Tree: majority of adjacent empty-floor tiles' shapes.
   * Granite: BFS flood-fill from edges touching empty tiles.
   * Other tiles: PipeShape.Empty fallback.
   * Computed once in _initFromLevel and never changes during play.
   */
  floorTypes: ReadonlyMap<string, PipeShape> = new Map();

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

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const def = level.grid[r]?.[c] ?? null;
        if (def === null) {
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else if (def.shape === PipeShape.EmptyDirt || def.shape === PipeShape.EmptyDark) {
          // Dirt and Dark empty floor tiles are stored with their shape for rendering
          this.grid[r][c] = new Tile(def.shape, 0);
        } else if (def.shape === PipeShape.GoldSpace) {
          // Gold spaces are tracked separately; the cell behaves like Empty
          this.goldSpaces.add(posKey(r, c));
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else if (def.shape === PipeShape.OneWay) {
          // One-way tiles are tracked separately; the cell behaves like Empty
          const rot = (def.rotation ?? 0) as Rotation;
          const owDir = ([Direction.North, Direction.East, Direction.South, Direction.West] as Direction[])[rot / 90];
          this.oneWayData.set(posKey(r, c), owDir);
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else if (def.shape === PipeShape.Cement) {
          // Cement tiles are tracked separately; the cell behaves like Empty
          this._cement.data.set(posKey(r, c), def.dryingTime ?? 0);
          this.grid[r][c] = new Tile(PipeShape.Empty, 0);
        } else {
          const rot = (def.rotation ?? 0) as Rotation;
          const itemShape = def.itemShape ?? null;
          const itemCount = def.itemCount ?? 1;
          const customConnections = def.connections ? new Set(def.connections) : null;
          const chamberContent = def.chamberContent ?? null;
          // Spinnable pipes are not fixed so the player can rotate them, but they
          // cannot be removed (that is enforced by reclaimTile / replaceInventoryTile).
          const isFixed = !SPIN_PIPE_SHAPES.has(def.shape);
          this.grid[r][c] = new Tile(def.shape, rot, isFixed, def.capacity ?? 0, def.cost ?? 0, itemShape, itemCount, customConnections, chamberContent, def.temperature ?? 0, def.pressure ?? 0, def.hardness ?? 0, def.shatter ?? 0);
          // Spin-cement tiles also track cement drying time.
          if (SPIN_CEMENT_SHAPES.has(def.shape)) {
            this._cement.data.set(posKey(r, c), def.dryingTime ?? 0);
          }
          if (def.shape === PipeShape.Source) {
            this.source = { row: r, col: c };
          } else if (def.shape === PipeShape.Sink) {
            this.sink = { row: r, col: c };
          }
        }
      }
    }

    this.sourceCapacity = this.grid[this.source.row][this.source.col].capacity;
  }

  /** Pre-compute the floor type (Empty/EmptyDirt/EmptyDark) for every cell. */
  private _computeFloorTypes(): ReadonlyMap<string, PipeShape> {
    return computeFloorTypesFromGrid(this.rows, this.cols, (r, c) => {
      const key = posKey(r, c);
      // Gold spaces, one-way tiles, and cement tiles are stored as PipeShape.Empty
      // at runtime, but their floor type should be inferred from their region
      // (Empty / EmptyDirt / EmptyDark) via BFS propagation from neighbours.
      // Fixed pipe tile types (Source, Sink, Straight, etc.) also return null
      // here so that BFS propagates the correct floor type to them.
      if (this.goldSpaces.has(key) || this.oneWayData.has(key) || this.cementData.has(key)) {
        return null;
      }
      const shape = this.grid[r][c].shape;
      return isEmptyFloor(shape) ? shape : null;
    });
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
   * Call this AFTER each successful player action (place, rotate).
   *
   * If the player is currently at a position earlier than the end of the history
   * (i.e. some moves were undone), the behavior is:
   * - If the new state matches the next state in the existing history, advance
   *   the index without modifying the history (the redo chain is preserved).
   * - Otherwise, truncate all future states and append the new state.
   */
  recordMove(): void {
    if (this._historyIndex < this._history.length - 1) {
      // There are "future" (undone) states.
      // Compare the live board to the next entry WITHOUT allocating a new snapshot first.
      if (this._liveBoardMatchesSnapshot(this._history[this._historyIndex + 1])) {
        // Exact same result as the next history state – advance the pointer, preserve the redo chain.
        this._historyIndex++;
        return;
      }
      // Different – discard the future branch before appending the new state.
      this._history = this._history.slice(0, this._historyIndex + 1);
    }

    this._history.push(this._captureSnapshot());
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

  /** Capture a deep copy of the current grid and inventory. */
  private _captureSnapshot(): Snapshot {
    return {
      grid: this.grid.map((row) => row.map((tile) => tile.clone())),
      inventory: this.inventory.map((item) => ({ ...item })),
      turnState: this._turnState.captureSnapshot(),
      cementData: this._cement.captureSnapshot(),
    };
  }

  /** Restore the board grid and inventory from a snapshot. */
  private _restoreSnapshot(snap: Snapshot): void {
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
      return { success: false, error: cementCheck.error, errorTilePositions: cementCheck.positions };
    }

    // ── Container-grant constraint check ─────────────────────────────────────
    // Simulate tile removal and verify no inventory count would go below zero.
    const currentBonuses = this.getContainerBonuses();
    const savedTile = this.grid[pos.row][pos.col];
    this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
    const newBonuses = this.getContainerBonuses();
    this.grid[pos.row][pos.col] = savedTile; // restore

    for (const [shape, currentBonus] of currentBonuses) {
      const newBonus = newBonuses.get(shape) ?? 0;
      if (newBonus < currentBonus) {
        // `baseCount` may be negative when the player has used more items than were in the
        // base inventory (drawing on container grants).  After this removal the new effective
        // count would be `baseCount + newBonus`; block if that would go below zero.
        const baseCount = this.inventory.find((it) => it.shape === shape)?.count ?? 0;
        if (baseCount + newBonus < 0) {
          const itemPositions = this._getConnectedItemChamberPositions(shape);
          return { success: false, error: ERR_CONTAINER_REMOVE, errorTilePositions: itemPositions.length ? itemPositions : undefined };
        }
      }
    }

    // ── Sandstone constraint check ───────────────────────────────────────────
    // Simulate tile removal and verify no connected sandstone tile would have deltaDamage ≤ 0.
    // (This can happen when removing a pipe that carried the only path to a pump chamber.)
    {
      const filledBefore = this.getFilledPositions();
      this.grid[pos.row][pos.col] = new Tile(PipeShape.Empty, 0);
      const filledAfter = this.getFilledPositions();
      const { error, positions } = this._validateConstraints(filledAfter);
      this.grid[pos.row][pos.col] = savedTile; // restore regardless
      if (error) {
        // Highlight only tiles that are both disconnected by the removal AND
        // in the constraint-violating positions set.  This ensures only the
        // relevant constraint tiles are shown.  Falls back to positions when
        // the intersection is empty (common case: constraint tile stays connected).
        const reclaimedKey = posKey(pos.row, pos.col);
        const positionKeys = positions ? new Set(positions.map(p => posKey(p.row, p.col))) : null;
        const disconnected: GridPos[] = [];
        for (const k of filledBefore) {
          if (k !== reclaimedKey && !filledAfter.has(k) && positionKeys?.has(k)) {
            const [r, c] = parseKey(k);
            disconnected.push({ row: r, col: c });
          }
        }
        return { success: false, error, errorTilePositions: disconnected.length ? disconnected : positions ?? undefined };
      }
    }

    this._reclaimInventory(tile.shape);
    this.grid[pos.row][pos.col] = new Tile(this.floorTypes.get(posKey(pos.row, pos.col)) ?? PipeShape.Empty, 0);
    return { success: true };
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

    const isGoldSpace = this.goldSpaces.has(posKey(pos.row, pos.col));
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(shape);

    // Gold spaces only accept gold pipes; regular pipes may not go on gold spaces
    if (isGoldSpace && !isGoldPipe) {
      return { success: false, error: ERR_GOLD_SPACE };
    }

    const existing = this.inventory.find((it) => it.shape === shape);
    const baseCount = existing?.count ?? 0;

    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(shape) ?? 0);
    if (effectiveCount <= 0) return { success: false };

    this._spendInventory(shape);
    this.grid[pos.row][pos.col] = new Tile(shape, rotation);

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const filled = this.getFilledPositions();
    const { error, positions } = this._validateConstraints(filled);
    if (error) {
      // Roll back placement.
      this.grid[pos.row][pos.col] = new Tile(this.floorTypes.get(posKey(pos.row, pos.col)) ?? PipeShape.Empty, 0);
      this._unspendInventory(shape);
      return { success: false, error, errorTilePositions: positions ?? undefined };
    }

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
      return { success: false, error: cementCheck.error, errorTilePositions: cementCheck.positions };
    }

    // Gold-space / gold-pipe constraint for the incoming shape
    const isGoldSpace = this.goldSpaces.has(posKey(pos.row, pos.col));
    const isGoldPipe  = GOLD_PIPE_SHAPES.has(newShape);
    if (isGoldSpace && !isGoldPipe) {
      return { success: false, error: ERR_GOLD_SPACE };
    }

    // Save inventory snapshot so we can roll back cleanly on failure
    const savedInventory = this.inventory.map((item) => ({ ...item }));
    const oldShape = tile.shape;

    // ── Step 1: Reclaim old tile into inventory (no constraint check yet) ──────
    this._reclaimInventory(oldShape);

    // ── Step 2: Place new tile from inventory ──────────────────────────────────
    // Evaluate container bonuses with the new tile already in place so that a
    // container bridged by this position remains connected in the affordability
    // check.  (Computing bonuses with an Empty cell here would temporarily
    // disconnect such a container and produce a false "not available" result.)
    const newExisting = this.inventory.find((it) => it.shape === newShape);
    const baseCount = newExisting?.count ?? 0;
    this.grid[pos.row][pos.col] = new Tile(newShape, rotation);
    const bonuses = this.getContainerBonuses();
    const effectiveCount = baseCount + (bonuses.get(newShape) ?? 0);

    if (effectiveCount <= 0) {
      // Check whether the new shape was available before the replacement (with the old tile
      // in place).  If it was, the replacement itself is disconnecting the container that
      // grants the new shape – report that as a user-visible error.
      this.grid[pos.row][pos.col] = tile; // temporarily restore old tile for bonus check
      const originalBonuses = this.getContainerBonuses();
      const originalEffective = baseCount + (originalBonuses.get(newShape) ?? 0);
      const errorMsg = originalEffective > 0 ? ERR_CONTAINER_DISCONNECT : undefined;
      const errorPositions = originalEffective > 0
        ? this._getConnectedItemChamberPositions(newShape)
        : undefined;
      this.inventory = savedInventory;
      // grid[pos.row][pos.col] is already restored to the old tile above
      return { success: false, error: errorMsg, errorTilePositions: errorPositions?.length ? errorPositions : undefined };
    }

    this._spendInventory(newShape);
    // grid[pos.row][pos.col] is already set to new Tile(newShape, rotation) above

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
    let originalBonuses: Map<PipeShape, number> | undefined;
    let originalFilled: Set<string> | undefined;
    for (const item of this.inventory) {
      const bonus = finalBonuses.get(item.shape) ?? 0;
      const finalEffective = item.count + bonus;
      if (finalEffective < 0) {
        if (!originalBonuses) {
          // Temporarily restore the old tile to compute the fill and bonuses as
          // they were before this replacement, then put the new tile back.
          this.grid[pos.row][pos.col] = tile;
          originalFilled = this.getFilledPositions();
          originalBonuses = this.getContainerBonuses(originalFilled);
          this.grid[pos.row][pos.col] = newTileRef;
        }
        const savedItem = savedInventory.find((it) => it.shape === item.shape);
        const originalCount = savedItem?.count ?? 0;
        const originalEffective = originalCount + (originalBonuses.get(item.shape) ?? 0);
        // Exception 1: was already negative and didn't get worse.
        if (originalEffective < 0 && finalEffective >= originalEffective) {
          continue;
        }
        // Exception 2: the drop is entirely due to newly-connected negative
        // containers.  Allowed when no positive-count container for this item
        // that was reachable with the old tile has become unreachable with the
        // new tile.
        const positiveContainerDisconnected = [...originalFilled!].some((key) => {
          if (finalFilled.has(key)) return false; // still connected
          const [r, c] = parseKey(key);
          const t = this.grid[r]?.[c];
          return (
            t?.shape === PipeShape.Chamber &&
            t.chamberContent === 'item' &&
            t.itemShape === item.shape &&
            t.itemCount > 0
          );
        });
        if (!positiveContainerDisconnected) {
          continue; // drop is from newly-connected negative containers only
        }
        this.inventory = savedInventory;
        this.grid[pos.row][pos.col] = tile;
        // Highlight the disconnected item chambers that are causing the constraint.
        const disconnectedPositions = [...(originalFilled ?? new Set<string>())].flatMap((key) => {
          if (finalFilled.has(key)) return [];
          const [r, c] = parseKey(key);
          const t = this.grid[r]?.[c];
          if (t?.shape === PipeShape.Chamber && t.chamberContent === 'item' && t.itemShape === item.shape && t.itemCount > 0) {
            return [{ row: r, col: c } as GridPos];
          }
          return [];
        });
        return { success: false, error: ERR_CONTAINER_REPLACE, errorTilePositions: disconnectedPositions.length ? disconnectedPositions : undefined };
      }
    }

    // Validate that no newly-connected sandstone tile has deltaDamage <= 0,
    // and that temperature/pressure don't go below 0.
    const { error: constraintError, positions: constraintPositions } =
      this._validateConstraints(finalFilled);
    if (constraintError) {
      this.inventory = savedInventory;
      this.grid[pos.row][pos.col] = tile; // revert to old tile
      // Compute only tiles that are both disconnected by the replacement AND in the
      // constraint positions set.  Falls back to positions when the intersection is empty.
      const filledBeforeReplace = this.getFilledPositions();
      const positionKeys = constraintPositions ? new Set(constraintPositions.map(p => posKey(p.row, p.col))) : null;
      const disconnected: GridPos[] = [];
      for (const k of filledBeforeReplace) {
        if (!finalFilled.has(k) && positionKeys?.has(k)) {
          const [r, c] = parseKey(k);
          disconnected.push({ row: r, col: c });
        }
      }
      return { success: false, error: constraintError, errorTilePositions: disconnected.length ? disconnected : constraintPositions ?? undefined };
    }

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
   * Return the grid positions of connected item-chamber tiles that grant the given shape.
   * @param shape  - The inventory shape to look for.
   * @param filled - Optional pre-computed fill set (avoids a second flood-fill).
   */
  private _getConnectedItemChamberPositions(shape: PipeShape, filled?: Set<string>): GridPos[] {
    const filledSet = filled ?? this.getFilledPositions();
    const positions: GridPos[] = [];
    for (const key of filledSet) {
      const [r, c] = parseKey(key);
      const t = this.grid[r]?.[c];
      if (t?.shape === PipeShape.Chamber && t.chamberContent === 'item' && t.itemShape === shape) {
        positions.push({ row: r, col: c });
      }
    }
    return positions;
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
    const lockedWaterImpact = this._turnState.lockedWaterImpact;

    // ── Incremental path (normal gameplay) ──────────────────────────────────
    // lockedWaterImpact is non-empty once applyTurnDelta() has been called
    // (at minimum the source tile is always present).
    if (lockedWaterImpact.size > 0) {
      let total = this.sourceCapacity;
      for (const key of filled) {
        total += lockedWaterImpact.get(key) ?? 0;
      }
      return total - this._turnState.leakyPermanentLoss;
    }

    // ── Dynamic fallback (test/legacy path) ─────────────────────────────────
    const connectionTurn = this._turnState.connectionTurn;
    const currentTemp = this._thermo.computeTemperature(filled, connectionTurn);
    const currentPressure = this._thermo.computePressure(filled, connectionTurn);
    let pipeCost = 0;
    let tankGain = 0;

    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      if (PIPE_SHAPES.has(tile.shape)) {
        pipeCost++;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          tankGain += tile.capacity;
        } else if (tile.chamberContent === 'dirt') {
          pipeCost += tile.cost;
        } else if (tile.chamberContent === 'ice') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          pipeCost += tile.cost * deltaTemp;
        } else if (tile.chamberContent === 'snow') {
          const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
          pipeCost += snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        } else if (tile.chamberContent === 'sandstone') {
          const { shatterOverride, deltaDamage, costPerDeltaTemp } =
            sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
          if (!shatterOverride) {
            const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
            // deltaDamage <= 0 is an invalid play state: drain all water to force immediate failure.
            pipeCost += deltaDamage >= 1
              ? costPerDeltaTemp * deltaTemp
              : this.sourceCapacity + 1;
          }
        } else if (tile.chamberContent === 'hot_plate') {
          const effectiveCost = tile.cost * (tile.temperature + currentTemp);
          const waterGain = Math.min(this._turnState.frozen, effectiveCost);
          const waterLoss = Math.max(0, effectiveCost - waterGain);
          // Net effect: gain from frozen minus direct water loss
          pipeCost += waterLoss - waterGain;
        }
      }
    }
    return this.sourceCapacity - pipeCost + tankGain - this._turnState.leakyPermanentLoss;
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
   * Return the locked water impact for the tile at the given position, or
   * `null` if that tile has not yet been evaluated by {@link applyTurnDelta}.
   * A negative return value represents a water cost; positive represents a gain.
   * Used by the UI to display the actual locked cost of an ice tile in the tooltip.
   */
  getLockedWaterImpact(pos: GridPos): number | null {
    return this._turnState.getLockedWaterImpact(pos);
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
  private _validateConstraints(filled: Set<string>): { error: string | null; positions: GridPos[] | null } {
    return this._validator.validate(
      filled,
      this._turnState.lockedWaterImpact,
      this._turnState.connectionTurn,
      this._turnState.turnNumber,
    );
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
  checkInitialStateErrors(): { error: string | null; positions: GridPos[] | null } {
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

    const isTankLike = (t: Tile) =>
      t.shape === PipeShape.Chamber && t.chamberContent === 'tank';

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.grid[r][c];
        if (!isTankLike(tile)) continue;

        const label = 'Chamber(tank)';

        // ── Edge check: no access point may lead off-grid ──────────────
        for (const dir of Object.values(Direction)) {
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

        // ── Adjacent tank-like symmetry check ────────────────────────────────────
        for (const dir of Object.values(Direction)) {
          const delta = NEIGHBOUR_DELTA[dir];
          const neighborPos: GridPos = { row: r + delta.row, col: c + delta.col };
          const neighbor = this.getTile(neighborPos);
          if (!neighbor || !isTankLike(neighbor)) continue;

          const thisConnects = tile.connections.has(dir);
          const neighborConnects = neighbor.connections.has(oppositeDirection(dir));

          if (thisConnects !== neighborConnects) {
            errors.push(
              `Adjacent tanks at (${r},${c}) and (${neighborPos.row},${neighborPos.col}) ` +
              `have mismatched connections on the ${dir} edge.`,
            );
          }
        }
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
   * Rotates the tile at `pos` clockwise by `steps × 90°` as a single game operation.
   * The sandstone constraint is validated only against the final rotation, so the
   * entire multi-step rotation either succeeds or is fully reverted.
   */
  rotateTileBy(pos: GridPos, steps: number): MoveResult {
    const tile = this.getTile(pos);
    // Spinner pipes are pre-placed fixed tiles that the player is allowed to rotate.
    if (!tile || (tile.isFixed && !SPIN_PIPE_SHAPES.has(tile.shape)) || isEmptyFloor(tile.shape)) {
      return { success: false };
    }

    // Cross pipes face all four directions and rotating them is not a valid move.
    // Fail silently (no error message) because there is nothing wrong with the board state.
    if (CROSS_PIPE_SHAPES.has(tile.shape)) return { success: false };

    // ── Cement constraint check (for player-placed pipe tiles only) ───────────
    const cementCheck = this._cement.isHardened(pos, tile);
    if (cementCheck.blocked) {
      return { success: false, error: cementCheck.error, errorTilePositions: cementCheck.positions };
    }

    // Normalize to 0–3, handling both positive and negative values (e.g. -1 → 3).
    const normalizedSteps = ((steps % 4) + 4) % 4;
    if (normalizedSteps === 0) return { success: true };
    // Capture the pre-rotation fill for disconnection-highlight computation.
    const filledBefore = this.getFilledPositions();
    for (let i = 0; i < normalizedSteps; i++) {
      tile.rotate();
    }
    // Validate the final state.
    const filled = this.getFilledPositions();
    const { error: constraintError, positions: constraintPositions } = this._validateConstraints(filled);
    if (constraintError) {
      // Revert by rotating the remaining steps to complete a full 360°.
      for (let i = 0; i < 4 - normalizedSteps; i++) {
        tile.rotate();
      }
      // Highlight only tiles that are both disconnected by the rotation AND
      // in the constraint-violating positions set.  Falls back to positions
      // when the intersection is empty.
      const positionKeys = constraintPositions ? new Set(constraintPositions.map(p => posKey(p.row, p.col))) : null;
      const disconnected: GridPos[] = [];
      for (const k of filledBefore) {
        if (!filled.has(k) && positionKeys?.has(k)) {
          const [r, c] = parseKey(k);
          disconnected.push({ row: r, col: c });
        }
      }
      return { success: false, error: constraintError, errorTilePositions: disconnected.length ? disconnected : constraintPositions ?? undefined };
    }

    // Validate container-grant constraints: rotation may disconnect a container from
    // the fill path, which could leave placed tiles with no covering grant (inventory < 0).
    const newBonuses = this.getContainerBonuses(filled);
    for (const item of this.inventory) {
      if (item.count < 0) {
        const bonus = newBonuses.get(item.shape) ?? 0;
        if (item.count + bonus < 0) {
          for (let i = 0; i < 4 - normalizedSteps; i++) {
            tile.rotate();
          }
          // After reverting the rotation the tile is back to its original state.
          // Find item chambers granting this shape in the original (pre-rotation) fill.
          const origFilled = this.getFilledPositions();
          const itemPositions = this._getConnectedItemChamberPositions(item.shape, origFilled);
          return { success: false, error: ERR_CONTAINER_ROTATE, errorTilePositions: itemPositions.length ? itemPositions : undefined };
        }
      }
    }

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
   * @returns Set of stringified "row,col" keys that are water-filled.
   */
  getFilledPositions(): Set<string> {
    const visited = new Set<string>();
    const queue: GridPos[] = [this.source];
    visited.add(posKey(this.source.row, this.source.col));

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dir of Object.values(Direction)) {
        if (!this.areMutuallyConnected(current, dir)) continue;
        const delta = NEIGHBOUR_DELTA[dir];
        const next: GridPos = { row: current.row + delta.row, col: current.col + delta.col };
        const key = posKey(next.row, next.col);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(next);
        }
      }
    }
    return visited;
  }

  /**
   * Returns true when the water has reached the sink tile.
   */
  isSolved(): boolean {
    const filled = this.getFilledPositions();
    return filled.has(posKey(this.sink.row, this.sink.col));
  }
}
