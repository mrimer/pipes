import { Tile } from './tile';
import { GridPos, PipeShape, COLD_CHAMBER_CONTENTS, TEMP_CHAMBER_CONTENTS, ENV_MODIFIER_CONTENTS } from './types';
import { parseKey, posKey, LEAKY_PIPE_SHAPES, PIPE_SHAPES } from './board';
import { ThermoSimulator } from './thermoSimulator';

/** Per-turn state captured for undo/redo snapshots. */
export type TurnStateSnapshot = {
  lockedWaterImpact: Map<string, number>;
  frozen: number;
  turnNumber: number;
  connectionTurn: Map<string, number>;
  hotPlateWaterGain: Map<string, number>;
  lockedConnectTemp: Map<string, number>;
  lockedConnectPressure: Map<string, number>;
  leakyPermanentLoss: number;
};

/**
 * Manages the incremental turn-state for water-cost locking.
 *
 * Responsibilities:
 *  - Own all turn-tracking maps and counters (`_lockedWaterImpact`,
 *    `_connectionTurn`, `_hotPlateWaterGain`, `_lockedConnectTemp`,
 *    `_lockedConnectPressure`, `frozen`, `leakyPermanentLoss`, `_turnNumber`).
 *  - Orchestrate `applyTurnDelta` and its five private sub-steps in the
 *    correct order:
 *      1. detect whether a beneficial tile disconnected
 *      2. clean up locks for disconnected tiles (adjusting `frozen`)
 *      3. increment the turn counter
 *      4. re-evaluate still-connected cost tiles if a beneficial tile left
 *      5. lock newly-connected tiles at the current temperature / pressure
 *      6. apply per-turn leaky-pipe penalties
 *  - Provide read-only getters consumed by other sub-modules
 *    (`ConstraintValidator`, `Board.getCurrentWater`).
 *  - Capture and restore snapshots for undo/redo.
 */
export class TurnStateManager {
  private _lockedWaterImpact: Map<string, number> = new Map();
  private _turnNumber: number = 0;
  private _connectionTurn: Map<string, number> = new Map();
  private _hotPlateWaterGain: Map<string, number> = new Map();
  private _lockedConnectTemp: Map<string, number> = new Map();
  private _lockedConnectPressure: Map<string, number> = new Map();

  /**
   * Total water units frozen by ice blocks during play.
   * Incremented each time a newly-connected cold tile subtracts water units.
   * Restored by undo/redo via the snapshot mechanism.
   * Not used in game logic; intended for display purposes.
   */
  frozen: number = 0;

  /**
   * Total water permanently lost to leaky pipe per-turn penalties.
   * Each turn a leaky pipe remains connected (after its first turn), one
   * additional water unit is consumed and added here.  Unlike the initial
   * connection cost, this loss is permanent: disconnecting the leaky pipe
   * does NOT recover it.  Restored by undo/redo via the snapshot mechanism.
   */
  leakyPermanentLoss: number = 0;

  constructor(
    private readonly grid: Tile[][],
    private readonly thermo: ThermoSimulator,
    private readonly getSourceCapacity: () => number,
  ) {}

  /** Read-only view of the current turn number. */
  get turnNumber(): number {
    return this._turnNumber;
  }

  /** Read-only view of the locked water impact map. */
  get lockedWaterImpact(): ReadonlyMap<string, number> {
    return this._lockedWaterImpact;
  }

  /** Read-only view of the per-tile connection-turn map. */
  get connectionTurn(): ReadonlyMap<string, number> {
    return this._connectionTurn;
  }

  /**
   * Reset all turn-tracking state to its initial zero values.
   * Called by {@link Board.initHistory} before the first {@link applyTurnDelta}.
   */
  reset(): void {
    this._lockedWaterImpact = new Map();
    this.frozen = 0;
    this._turnNumber = 0;
    this._connectionTurn = new Map();
    this._hotPlateWaterGain = new Map();
    this._lockedConnectTemp = new Map();
    this._lockedConnectPressure = new Map();
    this.leakyPermanentLoss = 0;
  }

  /**
   * Return the locked water impact for the tile at the given position, or
   * `null` if that tile has not yet been evaluated.
   * A negative return value represents a water cost; positive represents a gain.
   */
  getLockedWaterImpact(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedWaterImpact.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the locked frozen water consumed (waterGain) for a hot_plate tile
   * at the given position, or `null` if that tile is not a connected hot_plate.
   */
  getLockedHotPlateGain(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._hotPlateWaterGain.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the board temperature that was recorded when the tile at the given
   * position first connected, or `null` if that tile has not yet been evaluated.
   */
  getLockedConnectTemp(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedConnectTemp.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Return the board pressure that was recorded when the tile at the given
   * position first connected, or `null` if that tile has not yet been evaluated.
   */
  getLockedConnectPressure(pos: GridPos): number | null {
    const key = posKey(pos.row, pos.col);
    const val = this._lockedConnectPressure.get(key);
    return val !== undefined ? val : null;
  }

  /**
   * Evaluate and lock the water impact of each newly-connected tile based on
   * the current board state.  Must be called after every player action that may
   * change the fill path.
   *
   * Ordering invariant (must not be reordered):
   *  1a. Detect beneficial disconnect — must happen before cleanup removes locks.
   *  1b. Detect cold-tile disconnect — find minimum connection turn of cold chambers
   *      that froze water and are no longer connected; triggers hot_plate re-evaluation.
   *  2.  Clean up disconnected tiles — adjusts `frozen` for removed cost tiles.
   *  3.  Increment turn counter — newly-connected tiles get this turn's stamp.
   *  4a. Re-evaluate still-connected tiles — only if a beneficial tile left;
   *      uses historically-limited temp/pressure so no tile benefits retroactively.
   *  4b. Re-evaluate hot_plate tiles — only if a cold tile that froze water left;
   *      sorted by connection turn so frozen is allocated correctly across multiple plates.
   *  5.  Lock newly-connected tiles — uses current temp/pressure at this moment;
   *      ice/snow/sandstone are processed before hot_plate so frozen counts are current.
   *  6.  Apply leaky penalties — only for tiles locked *before* this turn.
   *
   * @returns The list of locked-cost changes for UI animation.
   */
  applyTurnDelta(filled: Set<string>): Array<{ row: number; col: number; delta: number }> {
    const changes: Array<{ row: number; col: number; delta: number }> = [];

    // Step 1a: detect beneficial disconnect
    const beneficialDisconnected = this._detectBeneficialDisconnect(filled);
    // Step 1b: detect cold-tile disconnect that froze water
    const coldDisconnectTurnX = this._detectColdDisconnect(filled);
    // Step 2: cleanup
    this._cleanupDisconnectedTiles(filled);
    // Step 3: turn counter
    this._turnNumber++;
    // Step 4a: re-evaluate all cost tiles when a heater/pump left
    if (beneficialDisconnected) {
      this._reEvaluateConnectedTiles(filled, changes);
    }
    // Step 4b: re-evaluate hot_plate tiles in turn order when frozen supply shrank
    if (coldDisconnectTurnX !== null) {
      this._reEvaluateHotPlatesForFrozenLoss(filled, coldDisconnectTurnX, changes);
    }
    // Step 5: lock new tiles
    this._lockNewTiles(filled, changes);
    // Step 6: leaky penalties
    this._applyLeakyPenalties(filled, changes);

    return changes;
  }

  /** Capture a deep copy of all turn-tracking state for undo/redo. */
  captureSnapshot(): TurnStateSnapshot {
    return {
      lockedWaterImpact: new Map(this._lockedWaterImpact),
      frozen: this.frozen,
      turnNumber: this._turnNumber,
      connectionTurn: new Map(this._connectionTurn),
      hotPlateWaterGain: new Map(this._hotPlateWaterGain),
      lockedConnectTemp: new Map(this._lockedConnectTemp),
      lockedConnectPressure: new Map(this._lockedConnectPressure),
      leakyPermanentLoss: this.leakyPermanentLoss,
    };
  }

  /** Restore all turn-tracking state from a snapshot. */
  restoreSnapshot(snap: TurnStateSnapshot): void {
    this._lockedWaterImpact = new Map(snap.lockedWaterImpact);
    this.frozen = snap.frozen;
    this._turnNumber = snap.turnNumber;
    this._connectionTurn = new Map(snap.connectionTurn);
    this._hotPlateWaterGain = new Map(snap.hotPlateWaterGain);
    this._lockedConnectTemp = new Map(snap.lockedConnectTemp);
    this._lockedConnectPressure = new Map(snap.lockedConnectPressure);
    this.leakyPermanentLoss = snap.leakyPermanentLoss;
  }

  // ── Private orchestration methods ────────────────────────────────────────

  /**
   * A water impact large enough to drain the entire source and force an immediate
   * game-over.  Used as the penalty for sandstone tiles that become unpowered
   * (deltaDamage ≤ 0) after their initial connection.
   */
  private get _drainAllImpact(): number {
    return -(this.getSourceCapacity() + 1);
  }

  /**
   * Returns true when any heater or pump that was previously locked is no
   * longer in the current fill set.  When true, still-connected cost tiles
   * must be re-evaluated to reflect the loss of the beneficial tile.
   */
  private _detectBeneficialDisconnect(filled: Set<string>): boolean {
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const [r, c] = parseKey(key);
        const tile = this.grid[r]?.[c];
        if (
          tile?.shape === PipeShape.Chamber &&
          tile.chamberContent !== null &&
          ENV_MODIFIER_CONTENTS.has(tile.chamberContent)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns the minimum connection turn of any cold-chamber tile that was
   * previously locked with a negative impact (i.e. froze water) and is no
   * longer in the current fill set.  Returns `null` when no such tile left.
   *
   * Hot-plate tiles that connected on or after this turn may have relied on the
   * now-gone frozen water, so they must be re-evaluated.
   */
  private _detectColdDisconnect(filled: Set<string>): number | null {
    let minTurn: number | null = null;
    for (const key of this._lockedWaterImpact.keys()) {
      if (filled.has(key)) continue;
      const impact = this._lockedWaterImpact.get(key)!;
      if (impact >= 0) continue; // Only care about tiles that froze water (negative impact).
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (
        tile?.shape === PipeShape.Chamber &&
        tile.chamberContent !== null &&
        COLD_CHAMBER_CONTENTS.has(tile.chamberContent)
      ) {
        const turn = this._connectionTurn.get(key) ?? this._turnNumber;
        if (minTurn === null || turn < minTurn) {
          minTurn = turn;
        }
      }
    }
    return minTurn;
  }

  /**
   * Re-evaluate the locked water impact of hot_plate tiles that connected on or
   * after `minTurnX` when a cold-chamber tile that froze water was disconnected.
   *
   * After the disconnected cold tile is removed (in `_cleanupDisconnectedTiles`),
   * `this.frozen` is already reduced and may be temporarily negative if hot_plate
   * tiles had consumed more frozen water than what remains after the cold tile left.
   * This method uses a **two-pass** approach to avoid invalid intermediate states:
   *
   * Pass 1 — budget restoration: sum all qualifying hot_plate oldWaterGains back into
   * `this.frozen` so it reflects only the unfrozen frozen supply (non-negative).
   *
   * Pass 2 — redistribution (ascending turn order): re-allocate frozen to each plate
   * using the historically-locked connect temperature (temperature did not change;
   * only the frozen supply did).
   */
  private _reEvaluateHotPlatesForFrozenLoss(
    filled: Set<string>,
    minTurnX: number,
    changes: Array<{ row: number; col: number; delta: number }>,
  ): void {
    // Collect qualifying hot_plate keys: connected, already locked, turn >= minTurnX.
    const candidates: Array<{ key: string; turn: number }> = [];
    for (const key of filled) {
      if (!this._lockedWaterImpact.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'hot_plate') continue;
      const turn = this._connectionTurn.get(key) ?? this._turnNumber;
      if (turn >= minTurnX) {
        candidates.push({ key, turn });
      }
    }

    if (candidates.length === 0) return;

    // Pass 1: restore all qualifying hot_plate waterGains into frozen so the budget
    // is non-negative before redistribution.
    for (const { key } of candidates) {
      this.frozen += this._hotPlateWaterGain.get(key) ?? 0;
    }
    // Clamp to zero as a defensive guard: all values are integers so this should
    // never be negative after restoring all gains, but guard against any future
    // bookkeeping bugs that could otherwise corrupt the frozen counter.
    if (this.frozen < 0) this.frozen = 0;

    // Pass 2: redistribute frozen in ascending connection-turn order.
    candidates.sort((a, b) => a.turn - b.turn);

    for (const { key } of candidates) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;

      const oldImpact = this._lockedWaterImpact.get(key)!;

      // Reuse the historically-locked connect temperature; only the frozen supply changed.
      const lockedTemp = this._lockedConnectTemp.get(key) ?? 0;
      const effectiveCost = tile.cost * (tile.temperature + lockedTemp);

      const { waterGain: newWaterGain, impact: newImpact } =
        this.thermo.computeHotPlateWaterEffect(effectiveCost, this.frozen);

      // Always update state (even when impact unchanged) so subsequent hot_plates in the
      // sorted list see the correct frozen value.
      this.frozen -= newWaterGain;
      this._hotPlateWaterGain.set(key, newWaterGain);
      this._lockedWaterImpact.set(key, newImpact);

      if (newImpact !== oldImpact) {
        changes.push({ row: r, col: c, delta: newImpact - oldImpact });
      }
    }
  }

  /**
   * Remove locked impacts for tiles that are no longer in the fill path.
   * Adjusts the frozen counter for cold-chamber and hot_plate tiles
   * so the resource accounting stays correct after disconnection.
   */
  private _cleanupDisconnectedTiles(filled: Set<string>): void {
    for (const key of this._lockedWaterImpact.keys()) {
      if (!filled.has(key)) {
        const impact = this._lockedWaterImpact.get(key)!;
        const [r, c] = parseKey(key);
        const tile = this.grid[r]?.[c];
        if (tile?.shape === PipeShape.Chamber) {
          if (
            tile.chamberContent !== null &&
            COLD_CHAMBER_CONTENTS.has(tile.chamberContent) &&
            impact < 0
          ) {
            // impact is negative (a cost); subtract it back out of frozen.
            this.frozen += impact;
          } else if (tile.chamberContent === 'hot_plate') {
            // Restore the frozen water that was consumed when this hot_plate connected.
            const waterGain = this._hotPlateWaterGain.get(key) ?? 0;
            this.frozen += waterGain;
            this._hotPlateWaterGain.delete(key);
          }
        }
        this._lockedWaterImpact.delete(key);
        this._connectionTurn.delete(key);
        this._lockedConnectTemp.delete(key);
        this._lockedConnectPressure.delete(key);
      }
    }
  }

  /**
   * Re-evaluate the locked water impact of still-connected cost tiles
   * (ice, snow, sandstone, hot_plate) after a beneficial tile (heater or
   * pump) was disconnected this turn.
   *
   * Re-computation uses historically-limited temperature and pressure so
   * no tile ever gains a retroactive benefit from a heater or pump that
   * connected after it did.
   */
  private _reEvaluateConnectedTiles(
    filled: Set<string>,
    changes: Array<{ row: number; col: number; delta: number }>,
  ): void {
    for (const key of filled) {
      if (!this._lockedWaterImpact.has(key)) continue; // Newly connecting – handled below.

      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile || tile.shape !== PipeShape.Chamber) continue;
      if (tile.chamberContent === null || !TEMP_CHAMBER_CONTENTS.has(tile.chamberContent)) continue;

      const tileConnectedTurn = this._connectionTurn.get(key) ?? this._turnNumber;
      const effectiveTemp = this.thermo.computeTemperature(
        filled, this._connectionTurn, tileConnectedTurn,
      );
      const effectivePressure = this.thermo.computePressure(
        filled, this._connectionTurn, tileConnectedTurn,
      );
      const oldImpact = this._lockedWaterImpact.get(key)!;

      if (tile.chamberContent === 'hot_plate') {
        // Re-evaluate using historically-limited temperature at connection time.
        const newEffectiveCost = tile.cost * (tile.temperature + effectiveTemp);
        const oldWaterGain = this._hotPlateWaterGain.get(key) ?? 0;
        // Restore the frozen water consumed at lock time, then re-apply with the
        // new effective cost so the frozen counter stays accurate.
        const restoredFrozen = this.frozen + oldWaterGain;
        const { waterGain: newWaterGain, impact: hotPlateImpact } =
          this.thermo.computeHotPlateWaterEffect(newEffectiveCost, restoredFrozen);
        if (hotPlateImpact !== oldImpact) {
          this.frozen = restoredFrozen - newWaterGain;
          this._hotPlateWaterGain.set(key, newWaterGain);
          this._lockedWaterImpact.set(key, hotPlateImpact);
          changes.push({ row: r, col: c, delta: hotPlateImpact - oldImpact });
        }
        // Always update the locked stats so the tooltip formula stays consistent with the cost.
        this._lockedConnectTemp.set(key, effectiveTemp);
        this._lockedConnectPressure.set(key, effectivePressure);
        continue; // Frozen and impact already updated above.
      }

      // ice, snow, or sandstone: use historically-limited temp/pressure.
      const result = this.thermo.computeColdChamberImpact(tile, effectiveTemp, effectivePressure);
      if (result.kind === 'failure') {
        // Historical deltaDamage ≤ 0: the pump(s) that made sandstone viable at
        // connection time are now gone.  Force immediate failure.
        const failureImpact = this._drainAllImpact;
        if (failureImpact !== oldImpact) {
          this._lockedWaterImpact.set(key, failureImpact);
          changes.push({ row: r, col: c, delta: failureImpact - oldImpact });
        }
        continue;
      }
      const newImpact = result.kind === 'frozen' ? -result.frozenCost : 0;

      if (newImpact !== oldImpact) {
        // Adjust the frozen-water display counter by the change in cost.
        this.frozen += oldImpact - newImpact;
        this._lockedWaterImpact.set(key, newImpact);
        changes.push({ row: r, col: c, delta: newImpact - oldImpact });
      }
      // Always update the locked stats so the tooltip formula stays consistent with the cost.
      this._lockedConnectTemp.set(key, effectiveTemp);
      this._lockedConnectPressure.set(key, effectivePressure);
    }
  }

  /**
   * Lock the water impact for each tile that is newly connected this turn.
   * Uses the current temperature and pressure at the moment this method runs.
   *
   * Two-pass approach: ice/snow/sandstone tiles are processed before hot_plate
   * tiles so that any water frozen this turn is visible to hot_plate tiles
   * connected on the same turn, regardless of BFS discovery order.
   */
  private _lockNewTiles(
    filled: Set<string>,
    changes: Array<{ row: number; col: number; delta: number }>,
  ): void {
    const currentTemp = this.thermo.computeTemperature(filled, this._connectionTurn);
    const currentPressure = this.thermo.computePressure(filled, this._connectionTurn);

    // First pass: all newly-connected tiles except hot_plate.
    const newHotPlateKeys: string[] = [];
    for (const key of filled) {
      if (this._lockedWaterImpact.has(key)) continue; // Already evaluated.

      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;

      // Defer hot_plate tiles to the second pass.
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'hot_plate') {
        newHotPlateKeys.push(key);
        continue;
      }

      let impact = 0;
      if (PIPE_SHAPES.has(tile.shape)) {
        impact = -1;
      } else if (tile.shape === PipeShape.Chamber) {
        if (tile.chamberContent === 'tank') {
          impact = tile.capacity;
        } else if (tile.chamberContent === 'dirt') {
          impact = -tile.cost;
        } else if (
          tile.chamberContent !== null &&
          COLD_CHAMBER_CONTENTS.has(tile.chamberContent)
        ) {
          // ice, snow, or sandstone: freeze water proportional to the cold delta
          const result = this.thermo.computeColdChamberImpact(tile, currentTemp, currentPressure);
          if (result.kind === 'frozen') {
            impact = -result.frozenCost;
            this.frozen += result.frozenCost;
          } else if (result.kind === 'failure') {
            // deltaDamage ≤ 0: invalid play state – drain all water to force immediate failure.
            impact = this._drainAllImpact;
          }
          // 'zero' (sandstone shatter): impact stays 0, no frozen water consumed.
        }
        // 'heater', 'pump', 'item', 'star', 'level': no direct water impact.
      }
      // Source, Sink, Empty, Granite, Tree, Sea: no water impact.

      this._recordLockedTileState(key, impact, currentTemp, currentPressure);
      // Only emit a change entry for non-zero impacts (zero means no visible effect).
      // Note: changes for newly-connected tiles are not emitted here – callers use
      // connection-time animations instead.  This array is only for re-evaluation deltas.
    }

    // Second pass: lock hot_plate tiles after all ice/snow/sandstone have updated frozen.
    for (const key of newHotPlateKeys) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile) continue;
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      const { waterGain, impact } =
        this.thermo.computeHotPlateWaterEffect(effectiveCost, this.frozen);
      this.frozen -= waterGain;
      this._hotPlateWaterGain.set(key, waterGain);
      this._recordLockedTileState(key, impact, currentTemp, currentPressure);
    }

    // (changes is populated in _reEvaluateConnectedTiles and _applyLeakyPenalties;
    // _lockNewTiles uses the parameter for API symmetry but emits nothing here
    // because connection-time animations are handled separately by the caller.)
    void changes;
  }

  /**
   * Record the locked water impact and connection stats for a newly-connected tile.
   */
  private _recordLockedTileState(
    key: string,
    impact: number,
    temp: number,
    pressure: number,
  ): void {
    this._lockedWaterImpact.set(key, impact);
    this._connectionTurn.set(key, this._turnNumber);
    this._lockedConnectTemp.set(key, temp);
    this._lockedConnectPressure.set(key, pressure);
  }

  /**
   * Apply the per-turn water penalty for leaky pipes that were already connected
   * before this turn (i.e. present in `_lockedWaterImpact` before `_lockNewTiles`
   * ran and still in the fill path).  Each such tile permanently loses 1 water unit
   * that cannot be recovered by disconnecting the pipe.
   */
  private _applyLeakyPenalties(
    filled: Set<string>,
    changes: Array<{ row: number; col: number; delta: number }>,
  ): void {
    for (const key of filled) {
      const [r, c] = parseKey(key);
      const tile = this.grid[r]?.[c];
      if (!tile || !LEAKY_PIPE_SHAPES.has(tile.shape)) continue;
      // Only penalise tiles that were already locked before this turn.
      const connTurn = this._connectionTurn.get(key);
      if (connTurn === undefined || connTurn === this._turnNumber) continue;

      this.leakyPermanentLoss++;
      changes.push({ row: r, col: c, delta: -1 });
    }
  }
}
