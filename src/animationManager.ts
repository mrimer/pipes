import {
  Board,
  PIPE_SHAPES, GOLD_PIPE_SHAPES, LEAKY_PIPE_SHAPES, SPIN_PIPE_SHAPES,
  posKey, parseKey,
  computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors,
} from './board';
import { Tile } from './tile';
import { Direction, GridPos, PipeShape, GameState } from './types';
import {
  WATER_COLOR, SOURCE_COLOR, SINK_COLOR, SINK_WATER_COLOR,
  SOURCE_CONNECTOR_LIT, SOURCE_WATER_CONNECTOR_LIT,
  SINK_CONNECTOR_LIT, SINK_WATER_CONNECTOR_LIT,
  GOLD_PIPE_WATER_COLOR, FIXED_PIPE_WATER_COLOR, LEAKY_PIPE_WATER_COLOR,
  GOLD_BUBBLE_COLOR,
} from './colors';
import { TILE_SIZE, LINE_WIDTH, renderContainerFillAnims, drawConnectorGlow, connectorLitIndex } from './renderer';
import {
  TileAnimation, renderAnimations, animColor, ANIM_DURATION,
  ANIM_NEGATIVE_COLOR, ANIM_POSITIVE_COLOR, ANIM_ZERO_COLOR,
  ANIM_ITEM_COLOR, ANIM_ITEM_NEG_COLOR,
} from './visuals/tileAnimation';
import {
  SourceSprayDrop, FlowDrop, BubbleParticle, DryPuff, LeakySprayDrop,
  spawnSourceSprayDrop, renderSourceSpray,
  spawnDryPuff, renderDryPuffs,
  spawnFlowDrop, renderFlowDrops,
  spawnBubble, renderBubbles,
  spawnLeakySprayDrop, renderLeakySpray,
  computeFlowGoodDirs,
} from './visuals/waterParticles';
import { VortexParticle, spawnVortexParticle, renderVortex } from './visuals/sinkVortex';
import { spawnRingEffect, clearRingEffects } from './visuals/ringEffect';
import {
  PipeRotationAnim, PipeFillAnim,
  computeRotationOverrides, computeActiveFillKeys, computeFillOrder,
  renderFillAnims, FILL_ANIM_DURATION,
} from './visuals/pipeEffects';
import { spawnStarSparkles, spawnStarTwinkle } from './visuals/starSparkle';
import { sfxManager, SfxId } from './sfxManager';

/** How often (ms) to spawn a dry-air puff particle from the source on game-over. */
const DRY_PUFF_SPAWN_INTERVAL_MS = 200;
/** How often (ms) to spawn a water-spray drop from the source during normal play. */
const SPRAY_SPAWN_INTERVAL_MS = 150;
/** How often (ms) to spawn a fizzing bubble particle inside connected pipes. */
const BUBBLE_SPAWN_INTERVAL_MS = 90;
/** How often (ms) to spawn a win-flow drop during the won state. */
const WIN_FLOW_SPAWN_INTERVAL_MS = 70;
/** How often (ms) to spawn a vortex particle over a sink tile. */
const VORTEX_SPAWN_INTERVAL_MS = 120;
/** How often (ms) to spawn a leaky spray drop from connected leaky pipe tiles. */
const LEAKY_SPRAY_SPAWN_INTERVAL_MS = 100;
/** Ice-sfx threshold: raw cost at or above this uses Ice2 sfx (instead of Ice1). */
const ICE_SFX_THRESHOLD_MID = 5;
/** Ice-sfx threshold: raw cost at or above this uses Ice3 sfx (instead of Ice2). */
const ICE_SFX_THRESHOLD_HIGH = 10;
/** Snow-sfx threshold: raw cost at or above this uses Snow2 sfx (instead of Snow1). */
const SNOW_SFX_THRESHOLD_MID = 5;
/** Snow-sfx threshold: raw cost at or above this uses Snow3 sfx (instead of Snow2). */
const SNOW_SFX_THRESHOLD_HIGH = 10;

/**
 * Callbacks into Game for CSS-based inventory sparkle side effects triggered
 * by connecting item tiles.  The three kinds correspond to positive, negative,
 * and zero net-item-count changes.
 */
export interface AnimSparkleCallbacks {
  positive(shape: PipeShape): void;
  negative(shape: PipeShape): void;
  zero(shape: PipeShape): void;
}

/**
 * Owns all canvas-based visual effects: floating tile-label animations, pipe
 * rotation and fill animations, source-spray / dry-puff particles, win-flow
 * drops, fizzing bubbles, leaky-pipe spray, sink vortex, and level-intro ring
 * effects.
 *
 * CSS-based sparkles (inventory sparkle sets, metric HUD sparkles, modal
 * sparkles) remain in Game as UI concerns.
 */
export class AnimationManager {
  /**
   * Active floating animation labels shown over the canvas.
   *
   * The array reference is readonly (external code cannot reassign it), but the
   * array contents are intentionally mutable: AnimationManager pushes into it
   * internally, and tests are expected to inspect and clear it via `.length = 0`.
   */
  readonly animations: TileAnimation[] = [];

  private _rotationAnims: PipeRotationAnim[] = [];
  private _fillAnims: PipeFillAnim[] = [];

  private _sourceSprayDrops: SourceSprayDrop[] = [];
  /** `performance.now()` of the last source spray / dry-puff spawn. */
  private _lastSpraySpawn = 0;
  private _dryPuffs: DryPuff[] = [];

  private _flowDrops: FlowDrop[] = [];
  /**
   * Pre-computed "good" directions at each tile for the win-flow animation.
   * Only directions that lead towards the sink without entering dead-end branches.
   * Computed once when the board is solved; cleared when leaving the Won state.
   */
  private _flowGoodDirs: Map<string, Set<Direction>> | null = null;
  /**
   * Maximum number of simultaneously live win-flow drops – set on win to
   * ~5 drops per tile in the solution path.
   */
  private _flowMaxDrops = 25;
  /** `performance.now()` of the last win-flow drop spawn. */
  private _lastFlowSpawn = 0;

  private _bubbles: BubbleParticle[] = [];
  /** `performance.now()` of the last bubble spawn. */
  private _lastBubbleSpawn = 0;

  /** Separate bubble pool for golden pipe tiles, rendered in pale yellow-white. */
  private _goldBubbles: BubbleParticle[] = [];
  /** `performance.now()` of the last golden bubble spawn. */
  private _lastGoldBubbleSpawn = 0;

  private _leakySprayDrops: LeakySprayDrop[] = [];
  /** `performance.now()` of the last leaky spray drop spawn. */
  private _lastLeakySpraySpawn = 0;

  private _vortexParticles: VortexParticle[] = [];
  /** `performance.now()` of the last vortex particle spawn. */
  private _lastVortexSpawn = 0;

  /** `performance.now()` after which the next golden-pipe twinkle may fire. */
  private _nextGoldenTwinkle = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
  ) {}

  // ─── Label animations ─────────────────────────────────────────────────────

  /**
   * Spawn floating animation labels for all tiles that became newly connected
   * to the fill path since `filledBefore` was captured.
   */
  spawnConnectionAnimations(
    board: Board,
    filledBefore: Set<string>,
    sparkle: AnimSparkleCallbacks,
  ): void {
    const filledAfter = board.getFilledPositions();
    const now = performance.now();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    // Track the maximum raw ice cost, maximum raw snow cost, and maximum dirt cost
    // across all newly-connected tiles so only one sfx is played per turn (the one
    // matching the highest cost).
    let maxIceRaw = -1;
    let maxSnowRaw = -1;
    let maxDirtCost = -1;

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (!tile) continue;
      this._pushTileAnimLabels(board, tile, r, c, 'connect', currentTemp, currentPressure, now, sparkle);
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'ice') {
        const rawIceCost = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
        if (rawIceCost > maxIceRaw) maxIceRaw = rawIceCost;
      }
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'snow') {
        // Snow cost is pressure-adjusted (unlike ice): snowCostPerDeltaTemp factors in
        // the current pressure, which reduces the effective cost per deltaTemp unit.
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        const rawSnowCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        if (rawSnowCost > maxSnowRaw) maxSnowRaw = rawSnowCost;
      }
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'dirt') {
        if (tile.cost > maxDirtCost) maxDirtCost = tile.cost;
      }
    }

    // Play a single ice sfx based on the highest-cost ice tile connected this turn.
    if (maxIceRaw >= 0) {
      if (maxIceRaw === 0) sfxManager.play(SfxId.Ice0);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_MID) sfxManager.play(SfxId.Ice1);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_HIGH) sfxManager.play(SfxId.Ice2);
      else sfxManager.play(SfxId.Ice3);
    }

    // Play a single snow sfx based on the highest-cost snow tile connected this turn.
    if (maxSnowRaw >= 0) {
      if (maxSnowRaw === 0) sfxManager.play(SfxId.Snow0);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_MID) sfxManager.play(SfxId.Snow1);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_HIGH) sfxManager.play(SfxId.Snow2);
      else sfxManager.play(SfxId.Snow3);
    }

    // Play a single dirt sfx based on the highest-cost dirt tile connected this turn.
    if (maxDirtCost >= 0) {
      if (maxDirtCost < 5) sfxManager.play(SfxId.Dirt1);
      else if (maxDirtCost < 10) sfxManager.play(SfxId.Dirt2);
      else sfxManager.play(SfxId.Dirt3);
    }
  }

  /**
   * Spawn floating animation labels for tiles that have just lost their fill
   * (present in `filledBefore`, absent after the action).
   *
   * When called after a tile reclaim, `reclaimedTile` / `reclaimedRow` /
   * `reclaimedCol` must be supplied because the reclaimed grid cell has already
   * been replaced with an Empty tile by the time this method is called.
   */
  spawnDisconnectionAnimations(
    board: Board,
    filledBefore: Set<string>,
    sparkle: AnimSparkleCallbacks,
    reclaimedTile?: Tile,
    reclaimedRow?: number,
    reclaimedCol?: number,
  ): void {
    const filledAfter = board.getFilledPositions();
    const now = performance.now();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    for (const key of filledBefore) {
      if (filledAfter.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = (reclaimedRow !== undefined && reclaimedCol !== undefined &&
                    r === reclaimedRow && c === reclaimedCol)
        ? reclaimedTile
        : board.grid[r]?.[c];
      if (!tile) continue;
      this._pushTileAnimLabels(board, tile, r, c, 'disconnect', currentTemp, currentPressure, now, sparkle);
    }
  }

  /**
   * Spawn floating animation labels for tiles whose locked water impact changed
   * because a beneficial tile was disconnected and still-connected cost tiles
   * were re-evaluated by {@link Board.applyTurnDelta}.
   */
  spawnLockedCostChangeAnimations(
    changes: Array<{ row: number; col: number; delta: number }>,
  ): void {
    if (changes.length === 0) return;
    const now = performance.now();

    for (const { row: r, col: c, delta } of changes) {
      const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
      const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;
      const text = delta > 0 ? `+${delta}💧` : `${delta}💧`;
      const color = animColor(delta);
      this.animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
    }
  }

  /**
   * If the most recent board operation decremented a cement cell's setting
   * time, spawn a floating gray "-1" animation above that cell.
   */
  spawnCementDecrementAnimation(cementDecrement?: GridPos): void {
    if (!cementDecrement) return;
    const { row: r, col: c } = cementDecrement;
    const cx = c * TILE_SIZE + TILE_SIZE / 4;
    const cy = r * TILE_SIZE + TILE_SIZE / 4;
    this.animations.push({
      x: cx, y: cy,
      text: '-1',
      color: ANIM_ZERO_COLOR,
      startTime: performance.now(),
      duration: ANIM_DURATION,
    });
  }

  // ─── Pipe animations ──────────────────────────────────────────────────────

  /**
   * Immediately complete any in-progress pipe rotation or fill animations,
   * discarding all intermediate state.  Call this before processing a new
   * player action so the board snaps to its final state before new animations
   * are spawned.
   */
  completeAnims(): void {
    this._rotationAnims = [];
    this._fillAnims = [];
  }

  /**
   * Spawn a pipe-rotation animation for a tile that was just rotated from
   * `oldRotation` to `newRotation`.
   */
  spawnRotationAnim(row: number, col: number, oldRotation: number, newRotation: number): void {
    this._rotationAnims.push({ row, col, oldRotation, newRotation, startTime: performance.now() });
  }

  /**
   * Spawn pipe-fill animations for all tiles that became newly connected since
   * `filledBefore` was captured.  Tiles are animated in BFS order, each one
   * starting after the previous tile's animation completes.
   *
   * @param startDelay - Extra milliseconds to wait before the first tile begins
   *   filling.  Pass `ROTATION_ANIM_DURATION` when a rotation animation is
   *   playing so the fill starts only after the rotation completes.
   *
   * Not called during undo/redo – those actions snap to the final state
   * without playing visual animations.
   */
  spawnFillAnims(board: Board, filledBefore: Set<string>, startDelay = 0): void {
    const order = computeFillOrder(board, filledBefore);
    if (order.length === 0) return;
    const now = performance.now();
    const sinkKey = posKey(board.sink.row, board.sink.col);
    for (let i = 0; i < order.length; i++) {
      const { row, col, entryDir, blockedDir, depth } = order[i];
      const key = posKey(row, col);
      const isSink = key === sinkKey;
      const tile = board.getTile({ row, col });
      // Container tiles (Source, Chamber) are included in the animation so their
      // display is held at the pre-connected appearance (via fillExclude) until the
      // water-flow wave reaches them.  No water overlay is drawn on top of them;
      // they simply switch to their connected appearance once the entry expires.
      const isContainer = tile !== null && !isSink &&
        !PIPE_SHAPES.has(tile.shape) && !GOLD_PIPE_SHAPES.has(tile.shape) &&
        !SPIN_PIPE_SHAPES.has(tile.shape) && !LEAKY_PIPE_SHAPES.has(tile.shape);
      if (isContainer) {
        this._fillAnims.push({
          row, col, entryDir, blockedDir, isContainer: true,
          startTime: now + startDelay + depth * FILL_ANIM_DURATION,
        });
        continue;
      }
      let waterColor: string | undefined;
      if (tile) {
        if (GOLD_PIPE_SHAPES.has(tile.shape)) waterColor = GOLD_PIPE_WATER_COLOR;
        else if (LEAKY_PIPE_SHAPES.has(tile.shape)) waterColor = LEAKY_PIPE_WATER_COLOR;
        else if (SPIN_PIPE_SHAPES.has(tile.shape) || tile.isFixed) waterColor = FIXED_PIPE_WATER_COLOR;
      }
      this._fillAnims.push({
        row, col, entryDir, blockedDir, isSink, waterColor,
        startTime: now + startDelay + depth * FILL_ANIM_DURATION,
      });
    }
  }

  /** Returns per-tile rotation overrides for the current frame (passed to `renderBoard`). */
  getRotationOverrides(now: number): Map<string, number> {
    return computeRotationOverrides(this._rotationAnims, now);
  }

  /** Returns the set of tile keys that should be rendered as dry (active fill animation). */
  getFillExclude(now: number): Set<string> {
    return computeActiveFillKeys(this._fillAnims, now);
  }

  /**
   * Render pipe-fill animation overlays on top of the board.
   * Call after `renderBoard()` so the overlays appear above the base board tiles.
   */
  renderFillEffects(
    board: Board,
    water: number,
    shiftHeld: boolean,
    currentTemp: number,
    currentPressure: number,
    now: number,
  ): void {
    if (this._fillAnims.length === 0) return;
    // Build a map of connections for each animating tile.
    const tileConnectionsMap = new Map<string, Set<Direction>>();
    for (const anim of this._fillAnims) {
      const tile = board.getTile(anim);
      if (tile) {
        tileConnectionsMap.set(`${anim.row},${anim.col}`, tile.connections);
      }
    }
    renderFillAnims(this.ctx, this._fillAnims, tileConnectionsMap, LINE_WIDTH, now);
    // Draw container (Chamber) tile reveal animations: wipe from the entry edge
    // to the opposite edge, showing the connected state progressively.
    renderContainerFillAnims(
      this.ctx, board, this._fillAnims, water, shiftHeld, currentTemp, currentPressure, now,
    );
  }

  // ─── Particle tick ────────────────────────────────────────────────────────

  /**
   * Render floating label animations then spawn/render all particle effects
   * for the current frame.  Call once per animation frame while on the Play
   * screen.  If `board` is null the label render still runs but all
   * board-dependent particle effects are skipped.
   */
  tick(board: Board | null, gameState: GameState): void {
    renderAnimations(this.ctx, this.animations, this.canvas.width);
    if (!board) return;
    // Connector lights run first so they render below droplets and particles.
    this._tickConnectorLights(board);
    this._tickSourceSpray(board, gameState);
    this._tickBubbles(board);
    this._tickLeakySpray(board, gameState);
    this._tickWinFlow(board, gameState);
    this._tickVortex(board);
    this._tickGoldenTwinkles(board);
  }

  // ─── Win-flow lifecycle ───────────────────────────────────────────────────

  /**
   * Pre-compute win-flow routing for `board`.  Call once when the board is
   * first solved so that the win-flow animation can begin on the next frame.
   */
  initWinFlow(board: Board): void {
    this._flowGoodDirs = computeFlowGoodDirs(board);
    const pathLength = board.getFilledPositions().size;
    // Scale max drops to ~5 per tile in the solution path (min 10).
    this._flowMaxDrops = Math.max(10, pathLength * 5);
  }

  /**
   * Clear win-flow state.  Call when leaving the Won state (undo-win) so that
   * stale drops and routing data do not linger.
   */
  clearWinFlow(): void {
    this._flowDrops = [];
    this._bubbles = [];
    this._goldBubbles = [];
    this._vortexParticles = [];
    this._flowGoodDirs = null;
  }

  // ─── Level lifecycle ──────────────────────────────────────────────────────

  /**
   * Reset all particle and animation arrays.  Call when starting a new level
   * or returning to the level-select screen so stale state does not carry over.
   */
  clearAll(): void {
    this.animations.length = 0;
    this._sourceSprayDrops = [];
    this._dryPuffs = [];
    this._flowDrops = [];
    this._bubbles = [];
    this._goldBubbles = [];
    this._leakySprayDrops = [];
    this._vortexParticles = [];
    this._flowGoodDirs = null;
    this._rotationAnims = [];
    this._fillAnims = [];
    this._nextGoldenTwinkle = 0;
  }

  /** Clear the canvas-based level-intro ring effects (module-level state). */
  clearRings(): void {
    clearRingEffects();
  }

  /**
   * Spawn the level-intro shrinking ring effects: first on the source tile,
   * then (after the source ring completes) on the sink tile.  Called once
   * when a new level is started for the first time (not on restart).
   */
  spawnLevelIntroRings(board: Board): void {
    const { source, sink, cols, rows } = board;
    const canvas = this.canvas;

    sfxManager.play(SfxId.Rings);

    const spawnSinkRing = () => {
      spawnRingEffect(canvas, sink.col, sink.row, cols, rows, SINK_COLOR);
    };

    spawnRingEffect(canvas, source.col, source.row, cols, rows, SOURCE_COLOR, spawnSinkRing);
  }

  // ─── Private tick helpers ─────────────────────────────────────────────────

  /**
   * Render the animated landing-strip connector lights on the source and sink tiles.
   * Called at the start of each frame tick so the glow renders below all particle effects.
   */
  private _tickConnectorLights(board: Board): void {
    const now = performance.now();
    const litIndex = connectorLitIndex(now);
    const half = TILE_SIZE / 2;
    const filled = board.getFilledPositions();

    const { source, sink } = board;
    const sourceTile = board.grid[source.row]?.[source.col];
    if (sourceTile) {
      const sourceIsFilled = filled.has(`${source.row},${source.col}`);
      const color = sourceIsFilled ? SOURCE_WATER_CONNECTOR_LIT : SOURCE_CONNECTOR_LIT;
      const cx = source.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = source.row * TILE_SIZE + TILE_SIZE / 2;
      drawConnectorGlow(this.ctx, cx, cy, sourceTile.connections, true, color, half, litIndex);
    }

    const sinkTile = board.grid[sink.row]?.[sink.col];
    if (sinkTile) {
      const sinkIsFilled = filled.has(`${sink.row},${sink.col}`);
      const color = sinkIsFilled ? SINK_WATER_CONNECTOR_LIT : SINK_CONNECTOR_LIT;
      const cx = sink.col * TILE_SIZE + TILE_SIZE / 2;
      const cy = sink.row * TILE_SIZE + TILE_SIZE / 2;
      drawConnectorGlow(this.ctx, cx, cy, sinkTile.connections, false, color, half, litIndex);
    }
  }

  /** Spawn and render the source spray drops (or dry puffs). Runs every frame during play. */
  private _tickSourceSpray(board: Board, gameState: GameState): void {
    const now = performance.now();
    const sx = board.source.col * TILE_SIZE + TILE_SIZE / 2;
    const sy = board.source.row * TILE_SIZE + TILE_SIZE / 2;
    if (gameState === GameState.GameOver) {
      // Tank ran dry: show puffs of dry air bursting from the source.
      if (now - this._lastSpraySpawn >= DRY_PUFF_SPAWN_INTERVAL_MS) {
        spawnDryPuff(this._dryPuffs);
        this._lastSpraySpawn = now;
      }
      renderDryPuffs(this.ctx, this._dryPuffs, sx, sy);
    } else {
      // Normal play: show water drops spraying from the source.
      if (now - this._lastSpraySpawn >= SPRAY_SPAWN_INTERVAL_MS) {
        spawnSourceSprayDrop(this._sourceSprayDrops);
        this._lastSpraySpawn = now;
      }
      renderSourceSpray(this.ctx, this._sourceSprayDrops, sx, sy, WATER_COLOR);
    }
  }

  /**
   * Spawn and render fizzing bubble particles inside connected pipe tiles.
   * Runs every frame to give a sense of liquid flowing in the pipes.
   * Regular/spin pipe bubbles use the standard water color; golden pipe bubbles
   * use a pale yellow-white to match the golden pipe aesthetic.
   */
  private _tickBubbles(board: Board): void {
    const filledPositions = board.getFilledPositions();
    // Only show bubbles when at least one regular pipe tile is in the fill path.
    if (filledPositions.size <= 2) return; // source + sink only → nothing to show
    const now = performance.now();
    if (now - this._lastBubbleSpawn >= BUBBLE_SPAWN_INTERVAL_MS) {
      spawnBubble(this._bubbles, board, filledPositions);
      this._lastBubbleSpawn = now;
    }
    if (now - this._lastGoldBubbleSpawn >= BUBBLE_SPAWN_INTERVAL_MS) {
      spawnBubble(this._goldBubbles, board, filledPositions, GOLD_PIPE_SHAPES);
      this._lastGoldBubbleSpawn = now;
    }
    renderBubbles(this.ctx, this._bubbles, WATER_COLOR);
    renderBubbles(this.ctx, this._goldBubbles, GOLD_BUBBLE_COLOR);
  }

  /**
   * Spawn and render water-droplet spray particles from connected leaky pipe
   * tiles.  Only runs during normal play (not game-over or won state).
   */
  private _tickLeakySpray(board: Board, gameState: GameState): void {
    if (gameState !== GameState.Playing) return;
    const filledPositions = board.getFilledPositions();
    // Check if any leaky pipe is in the fill path.
    const hasLeakyPipe = [...filledPositions].some((key) => {
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      return tile !== undefined && LEAKY_PIPE_SHAPES.has(tile.shape);
    });
    if (!hasLeakyPipe) {
      this._leakySprayDrops = [];
      return;
    }
    const now = performance.now();
    if (now - this._lastLeakySpraySpawn >= LEAKY_SPRAY_SPAWN_INTERVAL_MS) {
      spawnLeakySprayDrop(this._leakySprayDrops, board, filledPositions);
      this._lastLeakySpraySpawn = now;
    }
    renderLeakySpray(this.ctx, this._leakySprayDrops, WATER_COLOR);
  }

  /** Spawn and render the win-flow drops (only active in the Won state). */
  private _tickWinFlow(board: Board, gameState: GameState): void {
    if (gameState !== GameState.Won || !this._flowGoodDirs) return;
    const now = performance.now();
    if (now - this._lastFlowSpawn >= WIN_FLOW_SPAWN_INTERVAL_MS) {
      spawnFlowDrop(this._flowDrops, board, this._flowGoodDirs, this._flowMaxDrops);
      this._lastFlowSpawn = now;
    }
    renderFlowDrops(this.ctx, this._flowDrops, board, WATER_COLOR, this._flowGoodDirs);
  }

  /**
   * Spawn and render the spinning vortex particle effect over the sink tile.
   * Runs every frame to give a visual cue that water flows into the sink.
   * Uses the sink tile's current color (filled vs unfilled).
   */
  private _tickVortex(board: Board): void {
    const { sink } = board;
    const sinkCx = sink.col * TILE_SIZE + TILE_SIZE / 2;
    const sinkCy = sink.row * TILE_SIZE + TILE_SIZE / 2;
    const isSinkFilled = board.isSolved();
    const color = isSinkFilled ? SINK_WATER_COLOR : SINK_COLOR;
    const now = performance.now();
    if (now - this._lastVortexSpawn >= VORTEX_SPAWN_INTERVAL_MS) {
      spawnVortexParticle(this._vortexParticles);
      this._lastVortexSpawn = now;
    }
    renderVortex(this.ctx, this._vortexParticles, sinkCx, sinkCy, color);
  }

  // ─── Private label helpers ────────────────────────────────────────────────

  /**
   * Occasionally spawn a small golden star sparkle at a random position on a
   * random golden pipe tile on the board.  Fires every few seconds (with jitter)
   * to give golden pipes a subtle glittering appearance.
   */
  private _tickGoldenTwinkles(board: Board): void {
    const now = performance.now();
    if (now < this._nextGoldenTwinkle) return;
    // Re-arm with a random interval of 1.5–3.75 s.
    this._nextGoldenTwinkle = now + 1500 + Math.random() * 2250;

    // Collect all golden pipe tile positions on the board.
    const goldPositions: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (GOLD_PIPE_SHAPES.has(board.grid[r][c].shape)) goldPositions.push({ r, c });
      }
    }
    if (goldPositions.length === 0) return;

    // Pick a random golden tile.
    const { r, c } = goldPositions[Math.floor(Math.random() * goldPositions.length)];
    const tile = board.grid[r][c];

    // Place the twinkle at a random arm tip so it appears along the pipe edge
    // rather than in the interior (where it would blend into the pipe color).
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width  / this.canvas.width;
    const scaleY = rect.height / this.canvas.height;
    const half = TILE_SIZE / 2;
    const cx = (c + 0.5) * TILE_SIZE;
    const cy = (r + 0.5) * TILE_SIZE;

    let tileX: number, tileY: number;
    if (tile.connections.size > 0) {
      const dirs = [...tile.connections];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      // Place at a random point along the arm (avoiding the very center).
      const t = 0.3 + Math.random() * 0.7;
      // Perpendicular offset (±LINE_WIDTH/2) so the twinkle lands at the edge
      // of the pipe stroke rather than on its center line where it would be
      // obscured by the pipe fill color.
      const edgeOffset = (LINE_WIDTH / 2) * (Math.random() < 0.5 ? 1 : -1);
      switch (dir) {
        case Direction.North: tileX = cx + edgeOffset; tileY = cy - t * half; break;
        case Direction.South: tileX = cx + edgeOffset; tileY = cy + t * half; break;
        case Direction.West:  tileX = cx - t * half; tileY = cy + edgeOffset; break;
        case Direction.East:  tileX = cx + t * half; tileY = cy + edgeOffset; break;
        default:              tileX = cx; tileY = cy;
      }
    } else {
      tileX = cx;
      tileY = cy;
    }

    spawnStarTwinkle(rect.left + tileX * scaleX, rect.top + tileY * scaleY);
  }


  /**
   * Compute and push the floating label(s) for a single tile that was just
   * connected or disconnected.
   *
   * On connect the label shows the water impact of gaining this tile; on
   * disconnect it shows the reversal (the mirror-image effect).  Multi-label
   * tiles (hot-plate with both gain and loss) push their labels directly to
   * `animations` and leave `text` null so the outer push is skipped.
   * Side effects: may invoke `sparkle` callbacks (item connect) or trigger
   * star sparkle particles (star connect).
   */
  private _pushTileAnimLabels(
    board: Board,
    tile: Tile,
    r: number,
    c: number,
    dir: 'connect' | 'disconnect',
    currentTemp: number,
    currentPressure: number,
    now: number,
    sparkle: AnimSparkleCallbacks,
  ): void {
    // Lower-right quadrant (avoids drawing over the pipe image)
    const cx = c * TILE_SIZE + TILE_SIZE * 3 / 4;
    const cy = r * TILE_SIZE + TILE_SIZE * 3 / 4;

    let text: string | null = null;
    let color: string = dir === 'connect' ? ANIM_NEGATIVE_COLOR : ANIM_POSITIVE_COLOR;

    if (PIPE_SHAPES.has(tile.shape) || GOLD_PIPE_SHAPES.has(tile.shape)) {
      // Each pipe costs 1 water when connected; removal returns it.
      text = dir === 'connect' ? '-1💧' : '+1💧';
      color = dir === 'connect' ? ANIM_NEGATIVE_COLOR : ANIM_POSITIVE_COLOR;
    } else if (tile.shape === PipeShape.Chamber) {
      if (tile.chamberContent === 'tank') {
        // Tank adds capacity on connect, removes it on disconnect.
        const val = dir === 'connect' ? tile.capacity : -tile.capacity;
        text = val >= 0 ? `+${val}💧` : `${val}💧`;
        color = animColor(val);
        if (dir === 'connect') sfxManager.play(SfxId.Tank);
      } else if (tile.chamberContent === 'dirt') {
        // Dirt consumes water on connect; removal returns it.
        const val = dir === 'connect' ? -tile.cost : tile.cost;
        const prefix = val > 0 ? '+' : '';
        text = val !== 0 ? `${prefix}${val}💧` : (dir === 'connect' ? '-0💧' : '+0💧');
        color = animColor(val);
      } else if (tile.chamberContent === 'item') {
        if (dir === 'connect' && tile.itemShape !== null) {
          const val = tile.itemCount;
          text = val >= 0 ? `+${val}` : `${val}`;
          if (val > 0) {
            color = ANIM_ITEM_COLOR;
            sparkle.positive(tile.itemShape);
          } else if (val < 0) {
            color = ANIM_ITEM_NEG_COLOR;
            sparkle.negative(tile.itemShape);
            sfxManager.play(SfxId.NegativeCount);
          } else {
            color = ANIM_ZERO_COLOR;
            sparkle.zero(tile.itemShape);
            sfxManager.play(SfxId.NegativeCount);
          }
        }
        // disconnect: items already granted; no reversal animation
      } else if (tile.chamberContent === 'heater') {
        // Heater raises temperature on connect, lowers it on disconnect.
        const val = dir === 'connect' ? tile.temperature : -tile.temperature;
        text = val >= 0 ? `+${val}°` : `${val}°`;
        color = animColor(val);
        if (dir === 'connect') sfxManager.play(SfxId.Heater);
      } else if (tile.chamberContent === 'ice') {
        const raw = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
        ({ text, color } = this._formatWaterCostLabel(raw, dir));
      } else if (tile.chamberContent === 'pump') {
        // Pump raises pressure on connect, lowers it on disconnect.
        const val = dir === 'connect' ? tile.pressure : -tile.pressure;
        text = val >= 0 ? `+${val}P` : `${val}P`;
        color = animColor(val);
        if (dir === 'connect') sfxManager.play(SfxId.Pump);
      } else if (tile.chamberContent === 'snow') {
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        const raw = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        ({ text, color } = this._formatWaterCostLabel(raw, dir));
      } else if (tile.chamberContent === 'sandstone') {
        const { shatterOverride, costPerDeltaTemp } =
          sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
        if (shatterOverride) {
          text = dir === 'connect' ? '-0' : '+0';
          color = ANIM_ZERO_COLOR;
        } else {
          const raw = costPerDeltaTemp * computeDeltaTemp(tile.temperature, currentTemp);
          ({ text, color } = this._formatWaterCostLabel(raw, dir));
        }
      } else if (tile.chamberContent === 'hot_plate') {
        ({ text, color } = this._pushHotPlateAnimLabels(board, tile, r, c, dir, currentTemp, cx, cy, now));
        if (dir === 'connect') sfxManager.play(SfxId.Sizzle);
      } else if (tile.chamberContent === 'star' && dir === 'connect') {
        // Star tile connected – spawn golden sparkle burst from the tile center and play sfx.
        const starCx = c * TILE_SIZE + TILE_SIZE / 2;
        const starCy = r * TILE_SIZE + TILE_SIZE / 2;
        const canvasRect = this.canvas.getBoundingClientRect();
        spawnStarSparkles(canvasRect.left + starCx, canvasRect.top + starCy);
        sfxManager.play(SfxId.Star);
      }
    }

    if (text !== null) {
      this.animations.push({ x: cx, y: cy, text, color, startTime: now, duration: ANIM_DURATION });
    }
  }

  /**
   * Format the water-cost animation label for tiles (ice/snow/sandstone) whose
   * cost is expressed as a raw positive number.  On connect the label is shown
   * as a negative cost; on disconnect as a positive refund.
   */
  private _formatWaterCostLabel(raw: number, dir: 'connect' | 'disconnect'): { text: string; color: string } {
    if (dir === 'connect') {
      const val = -raw;
      return { text: val < 0 ? `${val}💧` : '-0💧', color: val < 0 ? ANIM_NEGATIVE_COLOR : ANIM_ZERO_COLOR };
    } else {
      return { text: raw > 0 ? `+${raw}💧` : '+0💧', color: raw > 0 ? ANIM_POSITIVE_COLOR : ANIM_ZERO_COLOR };
    }
  }

  /**
   * Compute and push the animation label(s) for a hot-plate tile.
   * Returns `{ text, color }` for a single-label result, or `{ text: null, color }` if
   * two separate labels were pushed directly to `animations` (dual gain+loss case).
   */
  private _pushHotPlateAnimLabels(
    board: Board,
    tile: Tile,
    r: number,
    c: number,
    dir: 'connect' | 'disconnect',
    currentTemp: number,
    cx: number,
    cy: number,
    now: number,
  ): { text: string | null; color: string } {
    if (dir === 'connect') {
      // Use the locked values computed by applyTurnDelta.
      const lockedImpact = board.getLockedWaterImpact({ row: r, col: c });
      const lockedGain = board.getLockedHotPlateGain({ row: r, col: c });
      if (lockedImpact !== null && lockedGain !== null) {
        const loss = Math.max(0, lockedGain - lockedImpact);
        if (lockedGain > 0 && loss > 0) {
          // Both gain and loss: spawn two separate labels offset above/below.
          this.animations.push({ x: cx, y: cy - TILE_SIZE / 4, text: `+${lockedGain}💧`, color: ANIM_POSITIVE_COLOR, startTime: now, duration: ANIM_DURATION });
          this.animations.push({ x: cx, y: cy + TILE_SIZE / 4, text: `-${loss}💧`, color: ANIM_NEGATIVE_COLOR, startTime: now, duration: ANIM_DURATION });
          return { text: null, color: ANIM_ZERO_COLOR }; // outer push skipped
        } else if (lockedGain > 0) {
          return { text: `+${lockedGain}💧`, color: ANIM_POSITIVE_COLOR };
        } else if (loss > 0) {
          return { text: `-${loss}💧`, color: ANIM_NEGATIVE_COLOR };
        } else {
          return { text: '+0💧', color: ANIM_ZERO_COLOR };
        }
      }
      return { text: null, color: ANIM_ZERO_COLOR };
    } else {
      // Disconnecting: reverse the hot plate's effects.
      // gain (from frozen) is lost; water loss is recovered.
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      const waterGain = Math.min(board.frozen, effectiveCost);
      const waterLoss = Math.max(0, effectiveCost - waterGain);
      if (waterLoss > 0 && waterGain > 0) {
        this.animations.push({ x: cx, y: cy - TILE_SIZE / 4, text: `+${waterLoss}💧`, color: ANIM_POSITIVE_COLOR, startTime: now, duration: ANIM_DURATION });
        this.animations.push({ x: cx, y: cy + TILE_SIZE / 4, text: `-${waterGain}💧`, color: ANIM_NEGATIVE_COLOR, startTime: now, duration: ANIM_DURATION });
        return { text: null, color: ANIM_ZERO_COLOR }; // outer push skipped
      } else if (waterLoss > 0) {
        return { text: `+${waterLoss}💧`, color: ANIM_POSITIVE_COLOR };
      } else if (waterGain > 0) {
        return { text: `-${waterGain}💧`, color: ANIM_NEGATIVE_COLOR };
      } else {
        return { text: '-0💧', color: ANIM_ZERO_COLOR };
      }
    }
  }
}
