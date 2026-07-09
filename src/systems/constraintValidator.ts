import type { Tile } from '../tile';
import type { GridPos} from '../types';
import { PipeShape } from '../types';
import { parseKey } from '../board';
import type { ThermoSimulator } from './thermoSimulator';
import type { TranslationParams } from '../i18nTypes';
import { t } from '../i18n';

/**
 * Error key emitted when a sandstone tile's pressure is too low to connect.
 * Exported so callers can identify this specific error type by equality check.
 */
export const ERR_SANDSTONE_TOO_HARD = 'error.constraint.sandstoneTooHard';

/**
 * Validates board constraints that prevent illegal game states.
 *
 * Responsibilities:
 *  - Sandstone constraint: pressure must exceed hardness to connect;
 *    disconnecting a pump that was required at connection time is also blocked.
 *  - Heater / Cooler constraint: temperature must not go below 0.
 *  - Pump / Vacuum constraint: pressure must not go below 0.
 *
 * All checks are independently testable by passing in the required board state.
 * The validator is stateless; all mutable board state is supplied per call.
 */
export class ConstraintValidator {
  constructor(
    private readonly grid: Tile[][],
    private readonly thermo: ThermoSimulator,
  ) {}

  /**
   * Run all three constraint checks (sandstone → heater → pump) in order,
   * stopping at the first failure.
   *
   * @param filled              - Current fill set (after the board mutation).
   * @param lockedWaterImpact   - Read-only view of the per-tile locked impact map.
   * @param connectionTurn      - Read-only view of the per-tile connection-turn map.
   * @param turnNumber          - The current turn number.
   * @param sourceCapacity      - The source tile's water capacity.
   * @returns `{ error, positions }` where `error` is the first violation found
   *          (or `null` if all checks pass) and `positions` are the offending tiles.
   */
  validate(
    filled: Set<string>,
    lockedWaterImpact: ReadonlyMap<string, number>,
    connectionTurn: ReadonlyMap<string, number>,
    turnNumber: number,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    const sandstone = this._checkSandstone(filled, lockedWaterImpact, connectionTurn, turnNumber);
    if (sandstone.error) return sandstone;

    const heater = this._checkEnvStat(filled, 'heater', connectionTurn, 'constraint.cooler', 'stat.temperature');
    if (heater.error) return heater;

    return this._checkEnvStat(filled, 'pump', connectionTurn, 'constraint.vacuum', 'stat.pressure');
  }

  /**
   * Check whether any sandstone tile currently in the fill path has deltaDamage ≤ 0.
   * Checks both newly-connected tiles (not yet in the locked map) and
   * already-connected tiles (in case pressure dropped after a pump disconnected).
   */
  private _checkSandstone(
    filled: Set<string>,
    lockedWaterImpact: ReadonlyMap<string, number>,
    connectionTurn: ReadonlyMap<string, number>,
    turnNumber: number,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    const currentPressure = this.thermo.computePressure(filled, connectionTurn);
    const violating: GridPos[] = [];
    const violatingHistoricalLock: GridPos[] = [];

    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'sandstone') {
        if (lockedWaterImpact.has(key)) {
          // For already-connected sandstone, check the historically-limited pressure to
          // prevent disconnecting a pump that was required to make this tile viable at
          // connection time (i.e. a pump connected before the sandstone tile itself).
          const sandstoneConnectedTurn = connectionTurn.get(key) ?? turnNumber;
          const historicalPressure = this.thermo.computePressure(filled, connectionTurn, sandstoneConnectedTurn);
          if (historicalPressure - tile.hardness <= 0) {
            violatingHistoricalLock.push({ row: r, col: c });
          }
        } else {
          // For a newly-connecting tile, use the current pressure.
          const deltaDamage = currentPressure - tile.hardness;
          if (deltaDamage <= 0) {
            violating.push({ row: r, col: c });
          }
        }
      }
    }

    if (violatingHistoricalLock.length > 0) {
      return {
        error: 'error.constraint.sandstoneDisconnectLocked',
        params: null,
        positions: violatingHistoricalLock,
      };
    }
    if (violating.length > 0) {
      const tile = this.grid[violating[0].row]?.[violating[0].col];
      const hardnessForMsg = tile?.hardness ?? 0;
      return {
        error: ERR_SANDSTONE_TOO_HARD,
        params: { pressure: currentPressure, hardness: hardnessForMsg },
        positions: violating,
      };
    }
    return { error: null, params: null, positions: null };
  }

  /**
   * Shared helper for the Heater and Pump constraint checks.
   *
   * Checks whether the given environment stat value (temperature or pressure) has
   * gone negative after a board mutation.  When it has, collects all connected
   * Chamber tiles of type `content` whose contributing stat field is negative
   * (i.e. the tiles actually responsible for the negative value).
   *
   * @param content         - Chamber content type to blame: `'heater'` or `'pump'`.
   * @param constraintKey   - i18n key for the negative variant (e.g. `'constraint.cooler'`).
   * @param statKey         - i18n key for the stat label (e.g. `'stat.temperature'`).
   */
  private _checkEnvStat(
    filled: Set<string>,
    content: 'heater' | 'pump',
    connectionTurn: ReadonlyMap<string, number>,
    constraintKey: string,
    statKey: string,
  ): { error: string | null; params: TranslationParams | null; positions: GridPos[] | null } {
    const currentValue = content === 'heater'
      ? this.thermo.computeTemperature(filled, connectionTurn)
      : this.thermo.computePressure(filled, connectionTurn);

    if (currentValue >= 0) return { error: null, params: null, positions: null };

    const isTemp = content === 'heater';
    const violating: GridPos[] = [];
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === content) {
        const stat = isTemp ? tile.temperature : tile.pressure;
        if (stat < 0) violating.push({ row: r, col: c });
      }
    }

    return {
      error: 'error.constraint.statBelowZero',
      params: {
        constraint: t(constraintKey),
        stat: t(statKey),
        value: currentValue,
      },
      positions: violating.length > 0 ? violating : null,
    };
  }
}
