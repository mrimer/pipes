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
  /** Cement – open background tile; any pipe may be placed here, but pipes placed on
   *  hardened cement (Setting Time = 0) may not be removed or rotated. */
  Cement = 'CEMENT',
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
  /** Spinnable straight pipe – pre-placed; player can rotate it CW but cannot remove it */
  SpinStraight = 'SPIN_STRAIGHT',
  /** Spinnable elbow pipe – pre-placed; player can rotate it CW but cannot remove it */
  SpinElbow = 'SPIN_ELBOW',
  /** Spinnable T-junction – pre-placed; player can rotate it CW but cannot remove it */
  SpinTee = 'SPIN_TEE',
}

/** The type of content housed inside a Chamber tile. */
export type ChamberContent = 'tank' | 'dirt' | 'item' | 'heater' | 'ice' | 'pump' | 'snow' | 'sandstone' | 'star' | 'hot_plate';

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
  CampaignEditor = 'CAMPAIGN_EDITOR',
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
  cost?: number;
  /** Shape of the inventory item stored inside a Chamber-item tile. */
  itemShape?: PipeShape;
  /** Number of inventory items granted by a Chamber-item tile (defaults to 1). */
  itemCount?: number;
  /** Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', or 'ice'). */
  chamberContent?: ChamberContent;
  /**
   * Temperature value: the base temperature for Source tiles, the additive bonus for
   * Chamber-heater tiles, and the threshold temperature for Chamber-ice and Chamber-snow tiles.
   * Defaults to 0.
   */
  temperature?: number;
  /**
   * Pressure value: for Source tiles, the base/starting pressure (defaults to 0).
   * For Chamber-pump tiles, the additive bonus added when the pump is connected.
   */
  pressure?: number;
  /**
   * Hardness value for Chamber-sandstone tiles.
   * deltaDamage = Pressure − Hardness; used as the cost divisor instead of Pressure.
   * Defaults to 0.
   */
  hardness?: number;
  /**
   * Shatter value for Chamber-sandstone tiles (optional).
   * Only active when Shatter > Hardness.  When active and Pressure >= Shatter,
   * the tile's effective cost is overridden to 0 (the Mass/Pressure ratio is ignored).
   * Defaults to 0 (inactive).
   */
  shatter?: number;
  /**
   * Setting Time for Cement tiles.
   * When 0 (hardened), any tile placed on this cell may not be removed or rotated.
   * When > 0, removal or rotation is allowed but decrements this value by 1.
   * Defaults to 0.
   */
  settingTime?: number;
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
  /** Optional notes displayed in a box beneath the grid while playing. */
  note?: string;
  /**
   * Optional hints shown as collapsible boxes beneath the grid while playing.
   * The first hint is revealed when the player clicks "Show Hint"; each
   * subsequent hint is nested inside the previous one and revealed in sequence.
   * @deprecated Use `hints` instead. Kept for backward compatibility with saved campaigns.
   */
  hint?: string;
  /**
   * Optional ordered list of hints. The first is revealed when the player
   * clicks "Show Hint", and each subsequent hint is nested inside the previous
   * one so they are revealed in sequence.
   */
  hints?: string[];
  /**
   * Cached number of Star chamber tiles present in the level grid.
   * Set automatically when the level is saved in the campaign editor.
   */
  starCount?: number;
  /**
   * When true, this is an optional bonus/challenge level.
   * Challenge levels are shown with a skull icon in the level list and
   * do NOT need to be completed in order to unlock the next chapter.
   */
  challenge?: boolean;
}

/** Possible types of ambient decorative element drawn under grid tiles. */
export type AmbientDecorationType = 'pebbles' | 'flower' | 'grass';

/**
 * One ambient background decoration, placed on a grid cell and rendered under
 * tile elements so it is visible only on empty (unoccupied) cells.
 * Decorations are generated once each time a level is activated.
 */
export interface AmbientDecoration {
  /** Grid row of this decoration. */
  row: number;
  /** Grid column of this decoration. */
  col: number;
  /** The kind of decoration. */
  type: AmbientDecorationType;
  /** Sub-tile centre X as a fraction of TILE_SIZE (0–1). */
  offsetX: number;
  /** Sub-tile centre Y as a fraction of TILE_SIZE (0–1). */
  offsetY: number;
  /** Overall rotation in degrees (0–360). */
  rotation: number;
  /** Integer variant index driving colour / shape choices (0–2). */
  variant: number;
}

/** A chapter groups a set of levels under a shared name. */
export interface ChapterDef {
  id: number;
  name: string;
  levels: LevelDef[];
}

/**
 * A campaign groups a set of chapters and their levels under a shared name.
 * Campaigns can be created, imported, and exported in the Campaign Editor.
 */
export interface CampaignDef {
  /** Unique identifier used to key persistent progress tracking. */
  id: string;
  name: string;
  author: string;
  chapters: ChapterDef[];
  /**
   * When true, this campaign is flagged as an "official" campaign.
   * Official campaigns are displayed as read-only in the Campaign Editor
   * and cannot be edited or deleted until this flag is unchecked.
   * Multiple campaigns may be flagged as official simultaneously.
   */
  official?: boolean;
  /**
   * ISO 8601 timestamp of when this campaign was last modified.
   * Used for versioning during import to detect newer/older/same versions.
   */
  lastUpdated?: string;
}
