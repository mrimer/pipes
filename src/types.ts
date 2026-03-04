/** Shared TypeScript types and enums for the Pipes puzzle game. */

/** The four cardinal directions used for pipe connections. */
export enum Direction {
  North = 'N',
  East = 'E',
  South = 'S',
  West = 'W',
}

/**
 * Pipe shapes defined by which directions they connect.
 * Key: shape name, Value: array of connected directions before rotation.
 */
export enum PipeShape {
  /** Empty tile: no pipe placed; players may fill these with inventory pieces */
  Empty = 'EMPTY',
  /** Straight pipe: North–South */
  Straight = 'STRAIGHT',
  /** Elbow pipe: North–East */
  Elbow = 'ELBOW',
  /** T-junction: North–East–South */
  Tee = 'TEE',
  /** Cross junction: all four directions */
  Cross = 'CROSS',
  /** Source of water */
  Source = 'SOURCE',
  /** Sink / destination */
  Sink = 'SINK',
  /** Water tank – accessible on all four sides, stores extra water */
  Tank = 'TANK',
}

/** Valid rotation values (clockwise, in degrees). */
export type Rotation = 0 | 90 | 180 | 270;

/** A grid coordinate. */
export interface GridPos {
  row: number;
  col: number;
}

/** The set of open connection directions for a given tile state. */
export type ConnectionSet = Set<Direction>;

/** Current top-level screen displayed to the player. */
export enum GameScreen {
  LevelSelect = 'LEVEL_SELECT',
  Play = 'PLAY',
}

/** State of an active game level. */
export enum GameState {
  Playing = 'PLAYING',
  Won = 'WON',
  GameOver = 'GAME_OVER',
}

/** One entry in the player's pipe inventory. */
export interface InventoryItem {
  shape: PipeShape;
  count: number;
}

/** Static definition for a single tile in a level layout. */
export interface TileDef {
  shape: PipeShape;
  rotation?: Rotation;
  isFixed?: boolean;
  /** Water capacity (Source and Tank tiles only). */
  capacity?: number;
}

/** Complete definition of a game level. */
export interface LevelDef {
  id: number;
  name: string;
  rows: number;
  cols: number;
  /** Row-major grid; null means the tile starts as Empty (player can fill it). */
  grid: (TileDef | null)[][];
  /** Starting inventory of pipe pieces available for the player to place. */
  inventory: InventoryItem[];
  /** Initial water capacity of the source tank. */
  sourceCapacity: number;
}
