import { Tile } from './tile';
import { GridPos, PipeShape } from './types';
import { parseKey } from './board';

// ── Ice / snow / sandstone cost-calculation helpers ────────────────────────
// These formulas appear in getCurrentWater(), _lockNewTiles(), and
// _reEvaluateConnectedTiles() in board.ts, and in _pushTileAnimLabels() in
// animationManager.ts.  Centralising them here avoids copy-paste bugs and makes the
// cost model easier to understand.

/**
 * Compute how much colder a tile is than the current environment temperature.
 * Returns 0 if the tile is warmer than (or at) the current temperature.
 * Used as the per-deltaTemp multiplier for ice/snow/sandstone/hot_plate costs.
 */
export function computeDeltaTemp(tileTemperature: number, currentTemp: number): number {
  return Math.max(0, tileTemperature - currentTemp);
}

/**
 * Compute the pressure-adjusted cost per deltaTemp unit for a snow tile.
 * When pressure ≥ 1 the cost is divided by pressure (rounded up); otherwise
 * the full cost applies.
 */
export function snowCostPerDeltaTemp(tileCost: number, pressure: number): number {
  return pressure >= 1 ? Math.ceil(tileCost / pressure) : tileCost;
}

/**
 * Determine the sandstone cost factors based on the current pressure.
 *
 * - `shatterOverride`: pressure meets or exceeds the shatter threshold, so the
 *   tile is shattered and costs **zero** water regardless of temperature.
 * - `deltaDamage`: `pressure − hardness`.  Values < 1 indicate an invalid play
 *   state (caller must apply a failure penalty; see {@link Board.sourceCapacity}).
 * - `costPerDeltaTemp`: water cost per deltaTemp unit when `deltaDamage ≥ 1`.
 *   Falls back to `tileCost` for the failure case so callers can still display
 *   a readable label (e.g. in animation tooltips).
 */
export function sandstoneCostFactors(
  tileCost: number,
  hardness: number,
  shatter: number,
  pressure: number,
): { shatterOverride: boolean; deltaDamage: number; costPerDeltaTemp: number } {
  const shatterOverride = shatter > hardness && pressure >= shatter;
  const deltaDamage = pressure - hardness;
  const costPerDeltaTemp = deltaDamage >= 1 ? Math.ceil(tileCost / deltaDamage) : tileCost;
  return { shatterOverride, deltaDamage, costPerDeltaTemp };
}

/**
 * Result of {@link ThermoSimulator.computeColdChamberImpact} for an ice, snow, or sandstone tile.
 *  - `frozen`  – normal case: the tile freezes `frozenCost` water; impact = -frozenCost.
 *  - `zero`    – sandstone shatter override: the tile costs zero water.
 *  - `failure` – sandstone with deltaDamage ≤ 0: caller must apply the drain-all penalty
 *                and skip any frozen-counter update.
 */
export type ColdChamberImpact =
  | { kind: 'frozen'; frozenCost: number }
  | { kind: 'zero' }
  | { kind: 'failure' };

/**
 * Handles all temperature and pressure calculations for the board.
 *
 * Responsibilities:
 *  - Aggregate environment stats (temperature, pressure) from the fill set
 *  - Compute water impact for cold-chamber tiles (ice, snow, sandstone)
 *  - Compute water impact for hot-plate tiles
 *
 * The class holds stable references to the board's grid and a source-position
 * getter; all other board state (fill set, connectionTurn) is passed
 * per-call so ThermoSimulator remains stateless.
 */
export class ThermoSimulator {
  constructor(
    private readonly grid: Tile[][],
    private readonly getSource: () => GridPos,
  ) {}

  /**
   * Sum an environment stat (temperature or pressure) over a fill set.
   *
   * Starting from the source tile's base value, it adds the bonus from every
   * connected Chamber whose `chamberContent` matches `content` ('heater' for
   * temperature, 'pump' for pressure).
   *
   * When `connectionTurn` and `maxTurn` are provided, only modifier tiles whose
   * connection turn is ≤ `maxTurn` contribute.  This enforces the historical-lock
   * rule used during re-evaluation: a cost tile must not receive a retroactive
   * benefit from a heater or pump that connected *after* it did.
   */
  private _aggregateEnvStat(
    filled: Set<string>,
    content: 'heater' | 'pump',
    connectionTurn?: ReadonlyMap<string, number>,
    maxTurn?: number,
  ): number {
    const source = this.getSource();
    const sourceTile = this.grid[source.row][source.col];
    const isTemp = content === 'heater';
    let total = isTemp ? sourceTile.temperature : sourceTile.pressure;
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === content) {
        if (
          maxTurn === undefined ||
          connectionTurn === undefined ||
          (connectionTurn.get(key) ?? Infinity) <= maxTurn
        ) {
          total += isTemp ? tile.temperature : tile.pressure;
        }
      }
    }
    return total;
  }

  /**
   * Compute the effective source temperature based on the current fill set.
   * This is the source tile's base temperature plus any connected Heater bonuses.
   *
   * When `connectionTurn` and `maxTurn` are provided, only heaters whose
   * connection turn is ≤ `maxTurn` contribute (historical-lock rule).
   */
  computeTemperature(
    filled: Set<string>,
    connectionTurn?: ReadonlyMap<string, number>,
    maxTurn?: number,
  ): number {
    return this._aggregateEnvStat(filled, 'heater', connectionTurn, maxTurn);
  }

  /**
   * Compute the effective pressure based on the current fill set.
   * The base value is the source tile's pressure; each connected Pump chamber adds its bonus.
   *
   * When `connectionTurn` and `maxTurn` are provided, only pumps whose
   * connection turn is ≤ `maxTurn` contribute (historical-lock rule).
   */
  computePressure(
    filled: Set<string>,
    connectionTurn?: ReadonlyMap<string, number>,
    maxTurn?: number,
  ): number {
    return this._aggregateEnvStat(filled, 'pump', connectionTurn, maxTurn);
  }

  /**
   * Compute the water impact for a cold Chamber tile (ice, snow, or sandstone)
   * at the given environment temperature and pressure.
   *
   * Returns one of three variants:
   *  - `frozen`  – normal case; the tile freezes water equal to `frozenCost`.
   *  - `zero`    – sandstone shatter override; the tile costs zero water.
   *  - `failure` – sandstone with deltaDamage ≤ 0; the caller must apply
   *                a drain-all penalty and skip frozen-counter updates.
   */
  computeColdChamberImpact(tile: Tile, temp: number, pressure: number): ColdChamberImpact {
    const deltaTemp = computeDeltaTemp(tile.temperature, temp);

    if (tile.chamberContent === 'ice') {
      return { kind: 'frozen', frozenCost: tile.cost * deltaTemp };
    }
    if (tile.chamberContent === 'snow') {
      return { kind: 'frozen', frozenCost: snowCostPerDeltaTemp(tile.cost, pressure) * deltaTemp };
    }
    // sandstone
    const { shatterOverride, deltaDamage, costPerDeltaTemp } =
      sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, pressure);
    if (shatterOverride) return { kind: 'zero' };
    if (deltaDamage >= 1) return { kind: 'frozen', frozenCost: costPerDeltaTemp * deltaTemp };
    return { kind: 'failure' };
  }

  /**
   * Compute the net water impact of a hot-plate tile given its effective heat cost
   * and the amount of frozen water available to absorb it.
   *
   * The hot plate first melts frozen water (water gain), then consumes regular water
   * for any remaining cost (water loss).  The net impact is gain − loss.
   *
   * @param effectiveCost  - The total heat cost: `tile.cost × (tile.temperature + envTemp)`.
   * @param availableFrozen - How much frozen water is available to melt.
   * @returns `{ waterGain, impact }` where `impact = waterGain − waterLoss`.
   */
  computeHotPlateWaterEffect(
    effectiveCost: number,
    availableFrozen: number,
  ): { waterGain: number; impact: number } {
    const waterGain = Math.min(availableFrozen, effectiveCost);
    const waterLoss = Math.max(0, effectiveCost - waterGain);
    return { waterGain, impact: waterGain - waterLoss };
  }
}
