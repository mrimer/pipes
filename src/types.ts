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
  /** Chamber – a unified enclosure that houses a Tank, DirtBlock, or inventory item grant */
  Chamber = 'CHAMBER',
  /** Granite block – an impassable obstacle; cannot be moved and water cannot flow through it */
  Granite = 'GRANITE',
  /** Gold space – background tile; only gold pipes may be placed here */
  GoldSpace = 'GOLD_SPACE',
  /** Gold straight pipe – behaves like Straight but may only be placed on gold spaces */
  GoldStraight = 'GOLD_STRAIGHT',
  /** Gold elbow pipe – behaves like Elbow but may only be placed on gold spaces */
  GoldElbow = 'GOLD_ELBOW',
  /** Gold T-junction – behaves like Tee but may only be placed on gold spaces */
  GoldTee = 'GOLD_TEE',
  /** Gold cross junction – behaves like Cross but may only be placed on gold spaces */
  GoldCross = 'GOLD_CROSS',
}

/** The type of content housed inside a Chamber tile. */
export type ChamberContent = 'tank' | 'dirt' | 'item' | 'heater' | 'ice';

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
  /** Water capacity (Source and Chamber-tank tiles only). */
  capacity?: number;
  /** Water cost for Chamber-dirt and Chamber-ice tiles – water wasted when water flows through this tile. */
  dirtCost?: number;
  /** Shape of the inventory item stored inside a Chamber-item tile. */
  itemShape?: PipeShape;
  /** Number of inventory items granted by a Chamber-item tile (defaults to 1). */
  itemCount?: number;
  /** Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', or 'ice'). */
  chamberContent?: ChamberContent;
  /**
   * Temperature value: the base temperature for Source tiles, the additive bonus for
   * Chamber-heater tiles, and the threshold temperature for Chamber-ice tiles.
   * Defaults to 0.
   */
  temperature?: number;
  /**
   * Explicit set of open connection directions for Source, Sink, and Chamber tiles.
   * When provided, overrides the default (all four sides).
   */
  connections?: Direction[];
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
}

/** A chapter groups a set of levels under a shared name. */
export interface ChapterDef {
  id: number;
  name: string;
  levels: LevelDef[];
}
