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
  /** Empty - Dirt tile: aesthetically brown empty floor; functionally identical to Empty */
  EmptyDirt = 'EMPTY_DIRT',
  /** Empty - Dark tile: aesthetically dark empty floor; functionally identical to Empty */
  EmptyDark = 'EMPTY_DARK',
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
  /** Tree – an impassable obstacle; cannot be moved and water cannot flow through it.
   *  Rendered as a 2-D top-down view of a broad-leafed tree (fern / palm style). */
  Tree = 'TREE',
  /** Sea – an impassable obstacle; cannot be moved and water cannot flow through it.
   *  Rendered as a blue water tile with animated ripples and a thin land border
   *  on edges where a non-sea tile is adjacent. */
  Sea = 'SEA',
  /** Cement – open background tile; any pipe may be placed here, but pipes placed on
   *  hardened cement (Drying Time = 0) may not be removed or rotated. */
  Cement = 'CEMENT',
  /** One-way floor tile – background tile; pipe tiles may be placed on it.
   *  Water flow into or out of this tile in the direction opposite to the
   *  tile's indicated direction is prohibited.  The direction is encoded
   *  in the tile's rotation (0°=North, 90°=East, 180°=South, 270°=West). */
  OneWay = 'ONE_WAY',
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
  /** Spinnable straight pipe on cement – like SpinStraight but has a drying time; each rotation decrements it; when 0 it can no longer be rotated */
  SpinStraightCement = 'SPIN_STRAIGHT_CEMENT',
  /** Spinnable elbow pipe on cement – like SpinElbow but has a drying time; each rotation decrements it; when 0 it can no longer be rotated */
  SpinElbowCement = 'SPIN_ELBOW_CEMENT',
  /** Spinnable T-junction on cement – like SpinTee but has a drying time; each rotation decrements it; when 0 it can no longer be rotated */
  SpinTeeCement = 'SPIN_TEE_CEMENT',
  /** Leaky straight pipe – behaves like Straight but loses 1 water each turn it stays connected */
  LeakyStraight = 'LEAKY_STRAIGHT',
  /** Leaky elbow pipe – behaves like Elbow but loses 1 water each turn it stays connected */
  LeakyElbow = 'LEAKY_ELBOW',
  /** Leaky T-junction – behaves like Tee but loses 1 water each turn it stays connected */
  LeakyTee = 'LEAKY_TEE',
  /** Leaky cross junction – behaves like Cross but loses 1 water each turn it stays connected */
  LeakyCross = 'LEAKY_CROSS',
}

/** The type of content housed inside a Chamber tile. */
export type ChamberContent = 'tank' | 'dirt' | 'item' | 'heater' | 'ice' | 'pump' | 'snow' | 'sandstone' | 'star' | 'hot_plate' | 'level';

/**
 * Chamber content types that apply a cold (temperature-delta) water cost.
 * These tiles freeze water when connected: ice, snow, sandstone.
 */
export const COLD_CHAMBER_CONTENTS: ReadonlySet<ChamberContent> = new Set(['ice', 'snow', 'sandstone']);

/**
 * Chamber content types that are temperature-sensitive (their water cost or
 * frozen water gain depends on the current temperature): ice, snow, sandstone, hot_plate.
 */
export const TEMP_CHAMBER_CONTENTS: ReadonlySet<ChamberContent> = new Set(['ice', 'snow', 'sandstone', 'hot_plate']);

/**
 * Chamber content types that interact with or affect the temperature variable.
 * Includes both tiles that raise/lower temperature (heater) and tiles whose
 * cost is temperature-dependent: heater, ice, snow, sandstone, hot_plate.
 */
export const TEMP_RELEVANT_CONTENTS: ReadonlySet<ChamberContent> = new Set(['heater', 'ice', 'snow', 'sandstone', 'hot_plate']);

/**
 * Chamber content types that interact with or affect the pressure variable.
 * Includes both tiles that raise/lower pressure (pump) and tiles whose
 * cost is pressure-dependent: pump, snow, sandstone.
 */
export const PRESSURE_RELEVANT_CONTENTS: ReadonlySet<ChamberContent> = new Set(['pump', 'snow', 'sandstone']);

/**
 * Chamber content types that have a water cost (i.e. the `cost` field is used):
 * dirt, ice, snow, sandstone, hot_plate.
 */
export const COST_CHAMBER_CONTENTS: ReadonlySet<ChamberContent> = new Set(['dirt', 'ice', 'snow', 'sandstone', 'hot_plate']);

/**
 * Chamber content types that modify the environment variables (temperature or
 * pressure): heater, pump.
 */
export const ENV_MODIFIER_CONTENTS: ReadonlySet<ChamberContent> = new Set(['heater', 'pump']);

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
  ChapterMap = 'CHAPTER_MAP',
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
  /** Water cost for Chamber cost tiles (dirt, ice, snow, sandstone, hot_plate) – water consumed when water flows through this tile. */
  cost?: number;
  /** Shape of the inventory item stored inside a Chamber-item tile. */
  itemShape?: PipeShape;
  /** Number of inventory items granted by a Chamber-item tile (defaults to 1). */
  itemCount?: number;
  /** Content type for Chamber tiles ('tank', 'dirt', 'item', 'heater', 'ice', 'pump', 'snow', 'sandstone', 'star', 'hot_plate', or 'level'). */
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
   * Drying Time for Cement tiles.
   * When 0 (hardened), any tile placed on this cell may not be removed or rotated.
   * When > 0, removal or rotation is allowed but decrements this value by 1.
   * Defaults to 0.
   */
  dryingTime?: number;
  /**
   * Explicit set of open connection directions for Source, Sink, and Chamber tiles.
   * When provided, overrides the default (all four sides).
   */
  connections?: Direction[];
  /**
   * Level index (0-based, within the chapter) for Chamber tiles with chamberContent='level'.
   * References the level that this chamber represents on the chapter map.
   */
  levelIdx?: number;
  /**
   * Completion threshold for Sink tiles on chapter maps.
   * The sink's displayed value = max(0, completion − completedLevels).
   * When this value reaches 0 and the sink is water-connected, the chapter can be completed.
   * Defaults to 0 (always satisfiable once the sink is connected).
   */
  completion?: number;
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
export type AmbientDecorationType = 'pebbles' | 'flower' | 'grass' | 'mushroom' | 'crystal';

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
  /** Sub-tile center X as a fraction of TILE_SIZE (0–1). */
  offsetX: number;
  /** Sub-tile center Y as a fraction of TILE_SIZE (0–1). */
  offsetY: number;
  /** Overall rotation in degrees (0–360). */
  rotation: number;
  /** Integer variant index driving color / shape choices (0–2). */
  variant: number;
  /** Scale multiplier (1 = default size; >1 larger, <1 smaller). Only set for types that support scaling. */
  scale?: number;
  /** Number of items to draw. Currently used by crystals (1 or 2 shards); other types always draw their default quantity. */
  count?: number;
}

/** A chapter groups a set of levels under a shared name. */
export interface ChapterDef {
  id: number;
  name: string;
  levels: LevelDef[];
  /**
   * Optional 2-D chapter map grid, stored as a row-major array.
   * When present, the level-select screen shows a "Map" button for this chapter
   * instead of the list of levels.  Level chambers on this grid reference
   * chapter levels by `levelIdx` (0-based).
   */
  rows?: number;
  cols?: number;
  grid?: (TileDef | null)[][];
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
