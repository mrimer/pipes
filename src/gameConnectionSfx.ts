/**
 * Sfx-selection logic for tile placement/rotation connection events. Pure
 * functions over board/tile state — no DOM, animation, Game instance, or
 * sfxManager side effects — split out of game.ts to shrink its function
 * count. Every exported function returns an ordered `SfxId[]`; callers play
 * each entry in order via `sfxManager.play()`.
 */

import { parseKey, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './board';
import type { Board } from './board';
import type { Tile } from './tile';
import { PipeShape } from './types';
import { SfxId } from './audio/sfxManager';

/** Ice-sfx threshold: raw cost at or above this uses Ice2 sfx (instead of Ice1). */
const ICE_SFX_THRESHOLD_MID = 5;
/** Ice-sfx threshold: raw cost at or above this uses Ice3 sfx (instead of Ice2). */
const ICE_SFX_THRESHOLD_HIGH = 10;
/** Snow-sfx threshold: raw cost at or above this uses Snow2 sfx (instead of Snow1). */
const SNOW_SFX_THRESHOLD_MID = 5;
/** Snow-sfx threshold: raw cost at or above this uses Snow3 sfx (instead of Snow2). */
const SNOW_SFX_THRESHOLD_HIGH = 10;
/** Dirt-sfx threshold: dirt cost at or above this uses Dirt2 sfx (instead of Dirt1). */
const DIRT_SFX_THRESHOLD_MID = 5;
/** Dirt-sfx threshold: dirt cost at or above this uses Dirt3 sfx (instead of Dirt2). */
const DIRT_SFX_THRESHOLD_HIGH = 10;
/** Sandstone-sfx threshold: sandstone cost above this uses Sandstone2 sfx (instead of Sandstone1). */
const SANDSTONE_SFX_THRESHOLD_MID = 5;
/** Sandstone-sfx threshold: sandstone cost above this uses Sandstone3 sfx (instead of Sandstone2). */
const SANDSTONE_SFX_THRESHOLD_HIGH = 10;

/** Running per-category accumulators for {@link collectConnectionSfx}. */
interface ConnectionSfxTrackers {
  hotPlateSfx: SfxId | null;
  maxIceRaw: number;
  maxSnowRaw: number;
  maxDirtCost: number;
  maxSandstoneInfo: { cost: number; shattered: boolean } | null;
}

export interface CollectTilePlacedSfxOptions {
  board: Board;
  filledBefore: Set<string>;
  changes: Array<{ row: number; col: number; delta: number }>;
  placedIsLeakyAndConnected: boolean;
  placedPosKey: string | null;
}

/**
 * Map a connected ice chamber's highest raw cost this turn to its sfx tier.
 */
function _iceSfxForRaw(raw: number): SfxId {
  if (raw === 0) return SfxId.Ice0;
  if (raw < ICE_SFX_THRESHOLD_MID) return SfxId.Ice1;
  if (raw < ICE_SFX_THRESHOLD_HIGH) return SfxId.Ice2;
  return SfxId.Ice3;
}

/**
 * Map a connected snow chamber's highest raw cost this turn to its sfx tier.
 */
function _snowSfxForRaw(raw: number): SfxId {
  if (raw === 0) return SfxId.Snow0;
  if (raw < SNOW_SFX_THRESHOLD_MID) return SfxId.Snow1;
  if (raw < SNOW_SFX_THRESHOLD_HIGH) return SfxId.Snow2;
  return SfxId.Snow3;
}

/**
 * Map a connected dirt chamber's highest cost this turn to its sfx tier.
 */
function _dirtSfxForCost(cost: number): SfxId {
  if (cost < DIRT_SFX_THRESHOLD_MID) return SfxId.Dirt1;
  if (cost < DIRT_SFX_THRESHOLD_HIGH) return SfxId.Dirt2;
  return SfxId.Dirt3;
}

/**
 * Map a connected sandstone chamber's highest-cost tile info this turn to its sfx tier.
 * SandstoneShatter plays when the highest-cost tile was shattered (pressure ≥ shatter),
 * overriding the cost-tier mapping.
 */
function _sandstoneSfxFor(info: { cost: number; shattered: boolean }): SfxId {
  if (info.shattered) return SfxId.SandstoneShatter;
  if (info.cost < SANDSTONE_SFX_THRESHOLD_MID) return SfxId.Sandstone1;
  if (info.cost < SANDSTONE_SFX_THRESHOLD_HIGH) return SfxId.Sandstone2;
  return SfxId.Sandstone3;
}

/**
 * Track at most one hot-plate sfx per turn. Sizzle overrides SizzleIce when
 * both a frozen and a non-frozen hot-plate tile connect the same turn.
 */
function _accumulateHotPlateTracker(opts: { board: Board; row: number; col: number; trackers: ConnectionSfxTrackers }): void {
  const { board, row, col, trackers } = opts;
  // Use getLockedHotPlateGain to check if frozen water was actually consumed
  // when this hot plate's cost was computed during applyTurnDelta this turn.
  const frozenGain = board.getLockedHotPlateGain({ row, col }) ?? 0;
  const candidate = frozenGain > 0 ? SfxId.SizzleIce : SfxId.Sizzle;
  if (candidate === SfxId.Sizzle || trackers.hotPlateSfx === null) trackers.hotPlateSfx = candidate;
}

/**
 * Track the highest raw cost among ice chambers connected this turn.
 */
function _accumulateIceTracker(tile: Tile, currentTemp: number, trackers: ConnectionSfxTrackers): void {
  const rawIceCost = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
  if (rawIceCost > trackers.maxIceRaw) trackers.maxIceRaw = rawIceCost;
}

/**
 * Track the highest raw cost among snow chambers connected this turn.
 * Snow cost is pressure-adjusted (unlike ice): snowCostPerDeltaTemp factors in
 * the current pressure, which reduces the effective cost per deltaTemp unit.
 */
function _accumulateSnowTracker(tile: Tile, currentTemp: number, currentPressure: number, trackers: ConnectionSfxTrackers): void {
  const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
  const rawSnowCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
  if (rawSnowCost > trackers.maxSnowRaw) trackers.maxSnowRaw = rawSnowCost;
}

/**
 * Track the highest cost among dirt chambers connected this turn.
 */
function _accumulateDirtTracker(tile: Tile, trackers: ConnectionSfxTrackers): void {
  if (tile.cost > trackers.maxDirtCost) trackers.maxDirtCost = tile.cost;
}

/**
 * Track the sandstone tile with the highest base cost connected this turn,
 * and whether it shattered.
 */
function _accumulateSandstoneTracker(tile: Tile, currentPressure: number, trackers: ConnectionSfxTrackers): void {
  const { shatterOverride } = sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
  if (trackers.maxSandstoneInfo === null || tile.cost > trackers.maxSandstoneInfo.cost) {
    trackers.maxSandstoneInfo = { cost: tile.cost, shattered: shatterOverride };
  }
}

/**
 * Sfx for chamber content types that always play the same sound on connection,
 * with no per-tile state to inspect. Used by {@link _immediateChamberSfx}.
 */
const FIXED_CHAMBER_SFX: Partial<Record<string, SfxId>> = {
  tank: SfxId.Tank,
  star: SfxId.Star,
  gel: SfxId.Gel,
  siphon: SfxId.Siphon,
};

/**
 * Return the sfx for a newly-connected item chamber, or null if it hasn't
 * been assigned an item shape yet or its count is positive.
 */
function _itemChamberSfx(tile: Tile): SfxId | null {
  if (tile.itemShape === null) return null;
  return tile.itemCount <= 0 ? SfxId.NegativeCount : null;
}

/**
 * Return the sfx to play immediately for a chamber content type that plays
 * at most once per tile per turn (as opposed to the cold/hot-plate content
 * types, which track a running max/priority across all tiles connected
 * this turn — see {@link _accumulateColdChamberTrackers}). Returns null for
 * a content type not handled here (including a not-yet-fully-formed item
 * chamber, and every cold/hot-plate content type).
 */
function _immediateChamberSfx(tile: Tile): SfxId | null {
  if (tile.chamberContent === null) return null;
  const fixed = FIXED_CHAMBER_SFX[tile.chamberContent];
  if (fixed !== undefined) return fixed;
  if (tile.chamberContent === 'item') return _itemChamberSfx(tile);
  if (tile.chamberContent === 'heater') return tile.temperature < 0 ? SfxId.Cooler : SfxId.Heater;
  if (tile.chamberContent === 'pump') return tile.pressure < 0 ? SfxId.Vacuum : SfxId.Pump;
  return null;
}

/**
 * Dispatch a chamber tile to the tracker accumulator for its content type
 * (hot_plate, ice, snow, dirt, sandstone). No-op for any other content type.
 */
function _accumulateColdChamberTrackers(opts: {
  board: Board; tile: Tile; row: number; col: number;
  currentTemp: number; currentPressure: number; trackers: ConnectionSfxTrackers;
}): void {
  const { board, tile, row, col, currentTemp, currentPressure, trackers } = opts;
  if (tile.chamberContent === 'hot_plate') _accumulateHotPlateTracker({ board, row, col, trackers });
  else if (tile.chamberContent === 'ice') _accumulateIceTracker(tile, currentTemp, trackers);
  else if (tile.chamberContent === 'snow') _accumulateSnowTracker(tile, currentTemp, currentPressure, trackers);
  else if (tile.chamberContent === 'dirt') _accumulateDirtTracker(tile, trackers);
  else if (tile.chamberContent === 'sandstone') _accumulateSandstoneTracker(tile, currentPressure, trackers);
}

/**
 * Resolve and record the sfx for one newly-connected chamber tile: push an
 * immediate sfx straight into `sfxToPlay`, or fold the tile into `trackers`
 * for a cold/hot-plate content type. Used by {@link collectConnectionSfx}'s
 * scan loop.
 */
function _collectChamberSfx(opts: {
  board: Board; tile: Tile; row: number; col: number;
  currentTemp: number; currentPressure: number;
  trackers: ConnectionSfxTrackers; sfxToPlay: SfxId[];
}): void {
  const { board, tile, row, col, currentTemp, currentPressure, trackers, sfxToPlay } = opts;
  const immediate = _immediateChamberSfx(tile);
  if (immediate !== null) { sfxToPlay.push(immediate); return; }
  _accumulateColdChamberTrackers({ board, tile, row, col, currentTemp, currentPressure, trackers });
}

/**
 * Push at most one sfx per accumulator category onto `sfxToPlay`, in this
 * fixed order, once every newly-connected tile this turn has been scanned.
 */
function _pushAccumulatedChamberSfx(trackers: ConnectionSfxTrackers, sfxToPlay: SfxId[]): void {
  if (trackers.hotPlateSfx !== null) sfxToPlay.push(trackers.hotPlateSfx);
  if (trackers.maxIceRaw >= 0) sfxToPlay.push(_iceSfxForRaw(trackers.maxIceRaw));
  if (trackers.maxSnowRaw >= 0) sfxToPlay.push(_snowSfxForRaw(trackers.maxSnowRaw));
  if (trackers.maxDirtCost >= 0) sfxToPlay.push(_dirtSfxForCost(trackers.maxDirtCost));
  if (trackers.maxSandstoneInfo !== null) sfxToPlay.push(_sandstoneSfxFor(trackers.maxSandstoneInfo));
}

/**
 * Collect the SFX IDs to play for all chamber tiles that became newly
 * connected to the fill path since `filledBefore` was captured.
 *
 * Iterates over newly-connected tiles and collects one sfx per chamber type:
 * - Per-tile sounds: Tank, Heater, Pump, Sizzle, Star, NegativeCount (item).
 * - Single-per-turn sounds: one Ice (based on the highest raw ice cost) and
 *   one Snow (based on the highest raw snow cost), one Dirt (based on the
 *   highest dirt cost), and one Sandstone (based on the highest cost sandstone
 *   or SandstoneShatter if the most costly tile was shattered this turn).
 */
export function collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] {
  const filledAfter = board.getFilledPositions();
  const currentTemp = board.getCurrentTemperature(filledAfter);
  const currentPressure = board.getCurrentPressure(filledAfter);

  const trackers: ConnectionSfxTrackers = {
    hotPlateSfx: null, maxIceRaw: -1, maxSnowRaw: -1, maxDirtCost: -1, maxSandstoneInfo: null,
  };
  const sfxToPlay: SfxId[] = [];

  for (const key of filledAfter) {
    if (filledBefore.has(key)) continue;
    const [r, c] = parseKey(key);
    const tile = board.grid[r]?.[c];
    if (tile?.shape !== PipeShape.Chamber) continue;
    _collectChamberSfx({ board, tile, row: r, col: c, currentTemp, currentPressure, trackers, sfxToPlay });
  }

  _pushAccumulatedChamberSfx(trackers, sfxToPlay);
  return sfxToPlay;
}

/** True when `source` contains a key not present in `other` (early-exit set-difference check). */
function _hasSetDifference(source: Set<string>, other: Set<string>): boolean {
  for (const key of source) {
    if (!other.has(key)) return true;
  }
  return false;
}

/**
 * Return the leak sfx (at most once) if any leaky-pipe penalty was applied
 * in `changes`. Called once per board action so the sound plays at most
 * once per turn.
 */
export function collectLeakSfx(board: Board, changes: Array<{ row: number; col: number; delta: number }>): SfxId[] {
  const hasLeak = changes.some(({ row, col }) =>
    LEAKY_PIPE_SHAPES.has(board.grid[row]?.[col]?.shape),
  );
  return hasLeak ? [SfxId.Leak] : [];
}

/**
 * True when `tile` is a chamber holding a pickupable item (gold or
 * regular) — i.e. its item chamber content is populated with a shape.
 */
function _isPickupableItemTile(tile: Tile | undefined): boolean {
  return tile?.shape === PipeShape.Chamber && tile.chamberContent === 'item' && tile.itemShape !== null;
}

/** Classify a newly-connected board position for {@link collectGoldSfx}'s gold-vs-pickup sfx choice. */
function _classifyNewlyConnectedPickup(board: Board, key: string): 'gold' | 'pickup' | 'none' {
  const [r, c] = parseKey(key);
  const tile = board.grid[r]?.[c];
  if (!_isPickupableItemTile(tile)) return 'none';
  if (GOLD_PIPE_SHAPES.has(tile.itemShape!)) return 'gold'; // eslint-disable-line @typescript-eslint/no-non-null-assertion -- itemShape is non-null here, guarded by _isPickupableItemTile() above
  return tile.itemCount > 0 ? 'pickup' : 'none';
}

/**
 * Return the gold sfx if any gold item chamber became newly connected since
 * `filledBefore` was captured.  If no gold item connected but a positive-count
 * non-gold item chamber did, return the pickup sfx instead.
 * Gold takes precedence over pickup.
 */
export function collectGoldSfx(board: Board, filledBefore: Set<string>): SfxId[] {
  const filledAfter = board.getFilledPositions();
  let hasPickup = false;
  for (const key of filledAfter) {
    if (filledBefore.has(key)) continue;
    const outcome = _classifyNewlyConnectedPickup(board, key);
    if (outcome === 'gold') return [SfxId.Gold];
    if (outcome === 'pickup') hasPickup = true;
  }
  return hasPickup ? [SfxId.Pickup] : [];
}

/**
 * Return, in play order, all SFX for a tile-placement action.
 *
 * - When a leaky pipe tile is placed and immediately connected to the source,
 *   returns only the Leak sound (suppresses PipePlacement and connection sounds).
 * - Otherwise returns PipeConnected when the placed tile is connected to the source
 *   (only when no chamber-connection sounds fire), or PipePlacement when it is not
 *   connected to the source (only when no chamber-connection sounds fire),
 *   then Leak (if a leaky tile penalty was applied), then Gold/Pickup (if applicable),
 *   then all chamber-connection sounds collected by {@link collectConnectionSfx}.
 */
export function collectTilePlacedSfx(opts: CollectTilePlacedSfxOptions): SfxId[] {
  const { board, filledBefore, changes, placedIsLeakyAndConnected, placedPosKey } = opts;
  if (placedIsLeakyAndConnected) {
    return [SfxId.Leak];
  }
  const connectionSfx = collectConnectionSfx(board, filledBefore);
  const sfxToPlay: SfxId[] = [];
  // Only play PipePlacement/PipeConnected when no chamber-connection sounds fire this turn.
  if (connectionSfx.length === 0) {
    const filledAfter = board.getFilledPositions();
    const isConnected = placedPosKey !== null && filledAfter.has(placedPosKey);
    sfxToPlay.push(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
  }
  sfxToPlay.push(...collectLeakSfx(board, changes));
  sfxToPlay.push(...collectGoldSfx(board, filledBefore));
  sfxToPlay.push(...connectionSfx);
  return sfxToPlay;
}

/**
 * Return, in play order, connection and disconnection SFX after a tile rotation.
 *
 * - The chamber-specific connection sound for each newly connected chamber.
 * - PipeConnected if any tile is newly connected and no chamber-specific sfx fired.
 * - Disconnect if any previously filled position is no longer filled.
 *
 * Does not include Leak/Gold/Pickup — callers collect those separately via
 * {@link collectLeakSfx}/{@link collectGoldSfx} (they fire on rotation too,
 * but are computed before rotation-specific connection state).
 */
export function collectTileRotatedSfx(board: Board, filledBefore: Set<string>): SfxId[] {
  const filledAfter = board.getFilledPositions();
  const connectionSfx = collectConnectionSfx(board, filledBefore);
  const sfxToPlay: SfxId[] = [];
  if (connectionSfx.length === 0 && _hasSetDifference(filledAfter, filledBefore)) {
    sfxToPlay.push(SfxId.PipeConnected);
  }
  if (_hasSetDifference(filledBefore, filledAfter)) {
    sfxToPlay.push(SfxId.Disconnect);
  }
  sfxToPlay.push(...connectionSfx);
  return sfxToPlay;
}
