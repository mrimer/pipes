/** Metrics display component for the play-screen HUD stats and best-score box. */

import { Board, GOLD_PIPE_SHAPES } from './board';
import { PipeShape } from './types';
import { WATER_COLOR, LOW_WATER_COLOR, MEDIUM_WATER_COLOR } from './colors';
import { renderInventoryBar } from './inventoryRenderer';
import { spawnStarSparkles, spawnStarTwinkle } from './visuals/starSparkle';
import { AnimSparkleCallbacks } from './animationManager';
import { CampaignManager } from './campaignManager';

/** Sparkle color palette for metric increases (gold). */
export const METRIC_SPARKLE_GOLD: readonly string[] = ['#ffd700', '#ffe866', '#ffec8b', '#ffc200', '#fff0a0', '#f0c040'];
/** Sparkle color palette for metric decreases (light blue). */
export const METRIC_SPARKLE_BLUE: readonly string[] = ['#add8e6', '#87ceeb', '#b0e0e6', '#e0f7ff', '#cce8ff', '#aed6f1'];
/** Sparkle color palette for frozen metric decreases (red). */
export const METRIC_SPARKLE_RED:  readonly string[] = ['#ff4444', '#ff7777', '#ff9999', '#ff6666', '#ffaaaa', '#cc3333'];

/**
 * Manages the play-screen HUD metric displays (water, temperature, frozen, pressure),
 * the best-score box, and the inventory bar (including pending CSS sparkle sets).
 *
 * Note: This class renders the inventory bar but does not manage inventory state;
 * item counts and the active selection are maintained by the Board and Game classes.
 */
export class MetricsDisplay {
  /** The water stat row element (always visible during play). */
  private readonly waterDisplayEl: HTMLElement;

  /** Span holding the numeric value in the water stat row. */
  private readonly waterValueEl: HTMLElement;

  /** Element showing the total water frozen by ice blocks (shown when frozen > 0). */
  private readonly frozenDisplayEl: HTMLElement;

  /** Span holding the numeric value in the frozen stat row. */
  private readonly frozenValueEl: HTMLElement;

  /** Element showing the current source temperature (shown for Chapter 2+ levels). */
  private readonly tempDisplayEl: HTMLElement;

  /** Span holding the numeric value in the temperature stat row. */
  private readonly tempValueEl: HTMLElement;

  /** Element showing the current game Pressure (shown when pressure-relevant tiles are present). */
  private readonly pressureDisplayEl: HTMLElement;

  /** Span holding the numeric value in the pressure stat row. */
  private readonly pressureValueEl: HTMLElement;

  /** Container element for the inventory bar. */
  private readonly inventoryBarEl: HTMLElement;

  /** Best score box element (shown below inventory when the level has been completed before). */
  private readonly _bestScoreBoxEl: HTMLElement;

  /** Water row inside the best score box. */
  private readonly _bestScoreWaterRowEl: HTMLElement;

  /** Value span for the best water score. */
  private readonly _bestScoreWaterValueEl: HTMLElement;

  /** Stars row inside the best score box (hidden when no stars). */
  private readonly _bestScoreStarsRowEl: HTMLElement;

  /** Value span for the best stars count. */
  private readonly _bestScoreStarsValueEl: HTMLElement;

  /** Previous water count for metric sparkle detection (null before first display or after level reset). */
  private _prevWater: number | null = null;

  /** Previous temperature value for metric sparkle detection (null when row is hidden). */
  private _prevTemp: number | null = null;

  /** Previous frozen value for metric sparkle detection (null when row is hidden). */
  private _prevFrozen: number | null = null;

  /** Previous pressure value for metric sparkle detection (null when row is hidden). */
  private _prevPressure: number | null = null;

  /** When true, the next {@link updateWaterDisplay} call skips all metric sparkles (used after undo/redo baseline reset). */
  private _suppressNextMetricSparkles: boolean = false;

  /** Shapes that should receive a sparkle CSS animation on the next inventory render. */
  readonly pendingSparkleShapes: Set<PipeShape> = new Set();

  /** Shapes that should receive a red-sparkle CSS animation on the next inventory render (negative-count click). */
  readonly pendingRedSparkleShapes: Set<PipeShape> = new Set();

  /** Shapes that should receive a gray-sparkle CSS animation on the next inventory render (zero net change). */
  readonly pendingGraySparkleShapes: Set<PipeShape> = new Set();

  /** `performance.now()` after which the next golden-inventory-item twinkle may fire. */
  private _nextInventoryTwinkle = 0;

  constructor(
    waterDisplayEl: HTMLElement,
    inventoryBarEl: HTMLElement,
    bestScoreBoxEl: HTMLElement,
  ) {
    this.waterDisplayEl = waterDisplayEl;
    this.inventoryBarEl = inventoryBarEl;
    this._bestScoreBoxEl = bestScoreBoxEl;

    // Grab the value span from the water stat row (its second child span)
    this.waterValueEl = this.waterDisplayEl.querySelector('.stat-value') as HTMLElement;

    // Create the frozen stat row (inserted into the stats box after water display)
    ({ rowEl: this.frozenDisplayEl, valueEl: this.frozenValueEl } =
      MetricsDisplay._createStatRow('❄️ Frozen', '#a8d8ea'));
    this.waterDisplayEl.insertAdjacentElement('afterend', this.frozenDisplayEl);

    // Create the temperature stat row (inserted into the stats box after frozen display)
    ({ rowEl: this.tempDisplayEl, valueEl: this.tempValueEl } =
      MetricsDisplay._createStatRow('🌡️ Temp °', '#74b9ff'));
    this.frozenDisplayEl.insertAdjacentElement('afterend', this.tempDisplayEl);

    // Create the pressure stat row (inserted into the stats box after temp display)
    ({ rowEl: this.pressureDisplayEl, valueEl: this.pressureValueEl } =
      MetricsDisplay._createStatRow('🔧 Pressure', '#a8e063'));
    this.tempDisplayEl.insertAdjacentElement('afterend', this.pressureDisplayEl);

    // Wire up the best-score box rows (the box itself is in the HTML; rows are created here)
    ({ rowEl: this._bestScoreWaterRowEl, valueEl: this._bestScoreWaterValueEl } =
      MetricsDisplay._createStatRow('💧', '#4fc3f7'));
    this._bestScoreBoxEl.appendChild(this._bestScoreWaterRowEl);
    this._bestScoreWaterRowEl.style.display = 'flex';
    ({ rowEl: this._bestScoreStarsRowEl, valueEl: this._bestScoreStarsValueEl } =
      MetricsDisplay._createStatRow('⭐', '#f0c040'));
    this._bestScoreBoxEl.appendChild(this._bestScoreStarsRowEl);
  }

  /**
   * Create a stats-box row element (hidden by default) with a label and value span.
   * @param labelText - Emoji + text for the label span.
   * @param color     - CSS color applied to the whole row.
   * @returns `{ rowEl, valueEl }` – caller inserts `rowEl` and updates `valueEl`.
   */
  private static _createStatRow(labelText: string, color: string): { rowEl: HTMLDivElement; valueEl: HTMLElement } {
    const rowEl = document.createElement('div');
    rowEl.className = 'stat-row';
    rowEl.style.cssText = `display:none;color:${color};`;
    const labelEl = document.createElement('span');
    labelEl.className = 'stat-label';
    labelEl.textContent = labelText;
    const valueEl = document.createElement('span');
    valueEl.className = 'stat-value';
    rowEl.appendChild(labelEl);
    rowEl.appendChild(valueEl);
    return { rowEl, valueEl };
  }

  /**
   * Show or hide a stats-box row based on whether a value is available.
   * When `value` is not null, updates `valueEl.textContent` and sets `rowEl` to flex;
   * when null, hides `rowEl`.
   */
  private static _showStatRow(rowEl: HTMLElement, valueEl: HTMLElement, value: number | null): void {
    if (value !== null) {
      valueEl.textContent = `${value}`;
      rowEl.style.display = 'flex';
    } else {
      rowEl.style.display = 'none';
    }
  }

  /** Spawn a small burst of sparkle particles centered on a HUD stat value element. */
  private static _spawnMetricSparkles(rowEl: HTMLElement, colors: readonly string[]): void {
    const valueEl = (rowEl.querySelector('.stat-value') as HTMLElement | null) ?? rowEl;
    const rect = valueEl.getBoundingClientRect();
    spawnStarSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, 16, colors);
  }

  /**
   * Build a callbacks object that wires CSS-based inventory sparkle side effects
   * into the AnimationManager's spawn methods.
   */
  sparkleCallbacks(): AnimSparkleCallbacks {
    return {
      positive: (shape) => this.pendingSparkleShapes.add(shape),
      negative: (shape) => this.pendingRedSparkleShapes.add(shape),
      zero: (shape) => this.pendingGraySparkleShapes.add(shape),
    };
  }

  /** Reset metric-sparkle baselines so the next {@link updateWaterDisplay} call treats all values as initial (no sparkles fired). */
  resetBaselines(): void {
    this._prevWater = null;
    this._prevTemp = null;
    this._prevFrozen = null;
    this._prevPressure = null;
    this._suppressNextMetricSparkles = true;
  }

  /**
   * Re-render the inventory bar with pending CSS sparkle effects applied.
   * After calling {@link renderInventoryBar} from inventoryRenderer, applies and
   * clears any pending sparkle CSS classes (gold, red, gray) on the matching
   * inventory item elements.
   *
   * @param board - The active board (provides inventory counts and container bonuses).
   * @param selectedShape - The pipe shape currently selected by the player, or null.
   * @param onItemClick - Callback invoked when the player left-clicks an inventory item.
   * @param onItemRightClick - Callback invoked when the player right-clicks an inventory item.
   */
  renderInventoryBar(
    board: Board,
    selectedShape: PipeShape | null,
    onItemClick: (shape: PipeShape, count: number) => void,
    onItemRightClick: () => void,
  ): void {
    renderInventoryBar(
      this.inventoryBarEl,
      board,
      selectedShape,
      onItemClick,
      onItemRightClick,
    );
    if (this.pendingSparkleShapes.size > 0) {
      for (const shape of this.pendingSparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle');
        }
      }
      this.pendingSparkleShapes.clear();
    }
    if (this.pendingRedSparkleShapes.size > 0) {
      for (const shape of this.pendingRedSparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle-red');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle-red');
        }
      }
      this.pendingRedSparkleShapes.clear();
    }
    if (this.pendingGraySparkleShapes.size > 0) {
      for (const shape of this.pendingGraySparkleShapes) {
        const el = this.inventoryBarEl.querySelector(`[data-shape="${shape}"]`) as HTMLElement | null;
        if (el) {
          el.classList.remove('sparkle-gray');
          void el.offsetWidth; // force reflow to restart the CSS animation
          el.classList.add('sparkle-gray');
        }
      }
      this.pendingGraySparkleShapes.clear();
    }
  }

  /**
   * Update all HUD metric stat rows (water, temperature, frozen, pressure) based on
   * current board state. Spawns metric sparkles when values change (suppressed after
   * undo/redo until {@link resetBaselines} is called).
   */
  updateWaterDisplay(board: Board): void {    const suppressSparkles = this._suppressNextMetricSparkles;
    this._suppressNextMetricSparkles = false;

    const w = board.getCurrentWater();
    this.waterValueEl.textContent = `${w}`;
    let waterColor: string;
    if (w <= 0)      waterColor = LOW_WATER_COLOR;
    else if (w <= 5) waterColor = MEDIUM_WATER_COLOR;
    else             waterColor = WATER_COLOR;
    this.waterDisplayEl.style.color = waterColor;
    if (!suppressSparkles && this._prevWater !== null && w > this._prevWater) {
      // Per design: water sparkles only on increase (water can't meaningfully "decrease" as a good event).
      MetricsDisplay._spawnMetricSparkles(this.waterDisplayEl, METRIC_SPARKLE_GOLD);
    }
    this._prevWater = w;

    const tempValue = board.hasTempRelevantTiles() ? board.getCurrentTemperature() : null;
    MetricsDisplay._showStatRow(this.tempDisplayEl, this.tempValueEl, tempValue);
    if (!suppressSparkles && tempValue !== null && this._prevTemp !== null) {
      if (tempValue > this._prevTemp)      MetricsDisplay._spawnMetricSparkles(this.tempDisplayEl, METRIC_SPARKLE_GOLD);
      else if (tempValue < this._prevTemp) MetricsDisplay._spawnMetricSparkles(this.tempDisplayEl, METRIC_SPARKLE_BLUE);
    }
    this._prevTemp = tempValue;

    const frozenValue = board.frozen > 0 ? board.frozen : null;
    MetricsDisplay._showStatRow(this.frozenDisplayEl, this.frozenValueEl, frozenValue);
    if (!suppressSparkles) {
      if (frozenValue !== null && this._prevFrozen !== null) {
        if (frozenValue > this._prevFrozen)      MetricsDisplay._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_BLUE);
        else if (frozenValue < this._prevFrozen) MetricsDisplay._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_RED);
      } else if (frozenValue !== null && this._prevFrozen === null) {
        // Row just became visible (frozen increased from 0): show sparkle.
        MetricsDisplay._spawnMetricSparkles(this.frozenDisplayEl, METRIC_SPARKLE_BLUE);
      }
    }
    this._prevFrozen = frozenValue;

    const pressureValue = board.hasPressureRelevantTiles() ? board.getCurrentPressure() : null;
    MetricsDisplay._showStatRow(this.pressureDisplayEl, this.pressureValueEl, pressureValue);
    if (!suppressSparkles && pressureValue !== null && this._prevPressure !== null) {
      if (pressureValue > this._prevPressure)      MetricsDisplay._spawnMetricSparkles(this.pressureDisplayEl, METRIC_SPARKLE_GOLD);
      else if (pressureValue < this._prevPressure) MetricsDisplay._spawnMetricSparkles(this.pressureDisplayEl, METRIC_SPARKLE_BLUE);
    }
    this._prevPressure = pressureValue;
  }

  /**
   * Update the best-score box below the inventory bar.
   * Shows the box when the level has been previously completed (has a best water score).
   * Shows a stars row when at least one star has been obtained.
   */
  updateBestScore(levelId: number, campaign: CampaignManager): void {
    const bestWater = campaign.loadBestWater(levelId);
    if (bestWater === null) {
      this._bestScoreBoxEl.style.display = 'none';
      return;
    }
    this._bestScoreBoxEl.style.display = 'flex';
    this._bestScoreWaterValueEl.textContent = `${bestWater}`;
    const levelStars = campaign.loadBestStars();
    const stars = levelStars[levelId] ?? 0;
    MetricsDisplay._showStatRow(this._bestScoreStarsRowEl, this._bestScoreStarsValueEl, stars > 0 ? stars : null);
  }

  /** Hide the best-score box (called when starting a playtest level). */
  hideBestScore(): void {
    this._bestScoreBoxEl.style.display = 'none';
  }

  /**
   * Occasionally spawn a small golden star sparkle over a random golden pipe
   * item in the inventory bar whose effective count is greater than zero.
   * Call this every animation frame while the play screen is active.
   */
  tickGoldenInventoryTwinkle(): void {
    const now = performance.now();
    if (now < this._nextInventoryTwinkle) return;
    // Re-arm with a random interval of 3–7 s (offset from the board twinkle timer).
    this._nextInventoryTwinkle = now + 3000 + Math.random() * 4000;

    // Find all gold inventory items whose count is > 0.
    const goldItems = Array.from(
      this.inventoryBarEl.querySelectorAll<HTMLElement>('.inv-item.gold:not(.depleted):not(.negative)'),
    );
    if (goldItems.length === 0) return;

    const el = goldItems[Math.floor(Math.random() * goldItems.length)];
    const svgEl = el.querySelector<SVGElement>('.inv-shape svg');
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();

    // Arm-tip positions (in the 0..32 SVG coordinate space used by shapeIcon).
    // Pick one arm at random and place the twinkle at a random point along its
    // length so it appears on the pipe itself rather than blending into the
    // pipe color at the center.
    const shape = el.dataset.shape as PipeShape | undefined;
    const armTips = _goldInvArmTips(shape);
    const [ax, ay] = armTips[Math.floor(Math.random() * armTips.length)];
    // Interpolate from center (16,16) toward the arm tip by a random fraction.
    const t = 0.3 + Math.random() * 0.7;
    const x = svgRect.left + ((16 + (ax - 16) * t) / 32) * svgRect.width;
    const y = svgRect.top  + ((16 + (ay - 16) * t) / 32) * svgRect.height;
    spawnStarTwinkle(x, y);
  }
}

/**
 * Arm-tip positions in the 0..32 SVG coordinate space used by {@link shapeIcon}.
 * Each entry is [x, y] of the far end of one arm (the center is always at [16,16]).
 * Used to pick a random arm along which to place the inventory twinkle.
 */
function _goldInvArmTips(shape: PipeShape | undefined): Array<[number, number]> {
  switch (shape) {
    case PipeShape.GoldElbow:
      return [[16, 0], [32, 16]];
    case PipeShape.GoldTee:
      return [[16, 0], [16, 32], [32, 16]];
    case PipeShape.GoldCross:
      return [[16, 0], [16, 32], [0, 16], [32, 16]];
    default: // GoldStraight (and unknown)
      return [[16, 0], [16, 32]];
  }
}
