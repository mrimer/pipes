import type { Board} from './board';
import { PIPE_SHAPES, SPIN_PIPE_SHAPES, GOLD_PIPE_SHAPES, posKey, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './board';
import type { Tile } from './tile';
import { GameScreen, PipeShape, COLD_CHAMBER_CONTENTS } from './types';
import { TILE_SIZE, getTileDisplayName } from './renderer';
import { t } from './i18n';
import { RADIUS_SM, UI_BG, UI_BORDER, UI_TEXT } from './uiConstants';

/** CSS style for the Ctrl-hover coordinate tooltip element. */
const TOOLTIP_CSS =
  `display:none;position:fixed;background:${UI_BG};color:${UI_TEXT};border:1px solid ${UI_BORDER};` +
  `border-radius:${RADIUS_SM};padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;white-space:pre-wrap;`;

/** Manages the Ctrl-hover tooltip that displays grid coordinates and tile info. */
export class TooltipManager {
  private readonly _el: HTMLElement;

  constructor(tooltipEl: HTMLElement) {
    this._el = tooltipEl;
  }

  /** Expose the underlying DOM element for test backward compatibility.
   * @internal */
  get el(): HTMLElement { return this._el; }

  /** Creates and appends the tooltip DOM element, returning a new TooltipManager. */
  static create(): TooltipManager {
    const el = document.createElement('div');
    el.style.cssText = TOOLTIP_CSS;
    document.body.appendChild(el);
    return new TooltipManager(el);
  }

  /** Returns the formula text "(deltaTemp° x cost)" for ice tile tooltips. */
  private _iceCostFormula(deltaTemp: number, cost: number): string {
    return `(${deltaTemp}° x ${cost})`;
  }

  /** Returns the formula text "(deltaTemp° x ⌈cost/pressureP⌉=effectiveCost)" for snow tile tooltips. */
  private _snowCostFormula(deltaTemp: number, pressure: number, cost: number): string {
    const effectiveCost = pressure >= 1 ? Math.ceil(cost / pressure) : cost;
    return `(${deltaTemp}° x ⌈${cost}/${pressure}P⌉=${effectiveCost})`;
  }

  /** Returns the formula text "(deltaTemp° x ⌈cost/(pressure-hardness)P⌉=effectiveCost)" for sandstone tile tooltips.
   * Requires (pressure - tile.hardness) >= 1; callers must check this precondition. */
  private _sandstoneCostFormula(deltaTemp: number, pressure: number, tile: Tile): string {
    const deltaDamage = pressure - tile.hardness;
    const effectiveCost = deltaDamage >= 1 ? Math.ceil(tile.cost / deltaDamage) : 0;
    return `(${deltaTemp}° x ⌈${tile.cost}/(${pressure}-${tile.hardness})P⌉=${effectiveCost})`;
  }

  /**
   * Returns the formula text "(tileTemp+envTemp° x cost)" for hot plate tile tooltips.
   * This shows the effectiveCost calculation only.  The actual water split into gain
   * (melted frozen water) and loss (excess heat on liquid water) is computed separately
   * from board.frozen and appended alongside this formula as "(+gain -loss)".
   * Intentionally kept as a compact effectiveCost formula rather than encoding the
   * full gain/loss derivation inline.
   */
  private _hotPlateCostFormula(tileTemp: number, envTemp: number, cost: number): string {
    return `(${tileTemp}+${envTemp}° x ${cost})`;
  }

  /**
   * Append cost-related tooltip text for a chamber tile that is **already connected**
   * (locked-in values are used).
   * @returns The updated tooltip string.
   */
  private _tooltipForConnectedChamber(
    tooltipText: string,
    tile: Tile,
    pos: { row: number; col: number },
    lockedImpact: number,
    board: Board,
  ): string {
    const lockedCost = Math.abs(lockedImpact);
    const content = tile.chamberContent;
    if (content !== null && COLD_CHAMBER_CONTENTS.has(content)) {
      const lockedTemp = board.getLockedConnectTemp(pos) ?? 0;
      const lockedPressure = board.getLockedConnectPressure(pos) ?? 1;
      const lockedDeltaTemp = computeDeltaTemp(tile.temperature, lockedTemp);
      if (content === 'ice') {
        return tooltipText + '\n' + this._iceCostFormula(lockedDeltaTemp, tile.cost) + ' ' + t('tooltip.cost', { cost: lockedCost });
      } else if (content === 'snow') {
        return tooltipText + '\n' + this._snowCostFormula(lockedDeltaTemp, lockedPressure, tile.cost) + ' ' + t('tooltip.cost', { cost: lockedCost });
      } else {
        // sandstone
        const shatterActive = tile.shatter > tile.hardness;
        const isShatterTriggered = shatterActive && lockedPressure >= tile.shatter;
        if (isShatterTriggered) {
          return tooltipText + '\n' + t('tooltip.shatterCostZero', { pressure: lockedPressure, shatter: tile.shatter });
        }
        const lockedDeltaDamage = lockedPressure - tile.hardness;
        if (lockedDeltaDamage >= 1) {
          return tooltipText + '\n' + this._sandstoneCostFormula(lockedDeltaTemp, lockedPressure, tile) + ' ' + t('tooltip.cost', { cost: lockedCost });
        }
        return tooltipText + '\n' + t('tooltip.cost', { cost: lockedCost });
      }
    } else if (content === 'hot_plate') {
      const lockedGain = board.getLockedHotPlateGain(pos);
      const lockedTemp = board.getLockedConnectTemp(pos) ?? 0;
      if (lockedGain !== null) {
        const loss = Math.max(0, lockedGain - lockedImpact);
        return tooltipText + '\n' + this._hotPlateCostFormula(tile.temperature, lockedTemp, tile.cost) + ' ' + t('tooltip.hotPlateEffect', { gain: lockedGain, loss });
      }
    } else if (content === 'gel') {
      return tooltipText + '\n' + t('tooltip.cost', { cost: lockedCost });
    } else if (content === 'siphon') {
      return tooltipText + '\n' + t('tooltip.gain', { gain: lockedImpact });
    }
    return tooltipText;
  }

  /**
   * Append cost-related tooltip text for a chamber tile that is **not yet connected**
   * (predicted cost using current live stats).
   * @returns The updated tooltip string, with predicted cost appended if non-zero.
   */
  private _tooltipForUnconnectedChamber(tooltipText: string, tile: Tile, board: Board): string {
    const content = tile.chamberContent;
    let predictedCost: number | null = null;

    if (content === 'dirt') {
      return tooltipText + ' ' + t('tooltip.dirtWater');
    } else if (content === 'ice') {
      const currentTemp = board.getCurrentTemperature();
      const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
      tooltipText += `\n${this._iceCostFormula(deltaTemp, tile.cost)}`;
      predictedCost = tile.cost * deltaTemp;
    } else if (content === 'snow') {
      const currentTemp = board.getCurrentTemperature();
      const currentPressure = board.getCurrentPressure();
      const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
      tooltipText += `\n${this._snowCostFormula(deltaTemp, currentPressure, tile.cost)}`;
      predictedCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
    } else if (content === 'sandstone') {
      const currentTemp = board.getCurrentTemperature();
      const currentPressure = board.getCurrentPressure();
      const { shatterOverride, deltaDamage, costPerDeltaTemp } =
        sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
      if (shatterOverride) {
        tooltipText += '\n' + t('tooltip.shatterCostZero', { pressure: currentPressure, shatter: tile.shatter });
        predictedCost = 0;
      } else if (deltaDamage <= 0) {
        tooltipText += '\n' + t('tooltip.sandstoneNoConnect', { pressure: currentPressure, hardness: tile.hardness });
      } else {
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        tooltipText += `\n${this._sandstoneCostFormula(deltaTemp, currentPressure, tile)}`;
        predictedCost = costPerDeltaTemp * deltaTemp;
      }
    } else if (content === 'hot_plate') {
      const currentTemp = board.getCurrentTemperature();
      const effectiveCost = tile.cost * (tile.temperature + currentTemp);
      const waterGain = Math.min(board.frozen, effectiveCost);
      const waterLoss = Math.max(0, effectiveCost - waterGain);
      tooltipText += '\n' + this._hotPlateCostFormula(tile.temperature, currentTemp, tile.cost);
      tooltipText += ' ' + t('tooltip.hotPlateEffect', { gain: waterGain, loss: waterLoss });
      predictedCost = waterLoss - waterGain;
    } else {
      predictedCost = 0;
    }

    if (predictedCost !== null && predictedCost !== 0) {
      tooltipText += predictedCost > 0
        ? ' ' + t('tooltip.cost', { cost: predictedCost })
        : ' ' + t('tooltip.gain', { gain: Math.abs(predictedCost) });
    }
    return tooltipText;
  }

  /**
   * Show the tooltip at the given client coordinates, populating it with
   * grid-position and tile information from the board.
   */
  show(
    clientX: number,
    clientY: number,
    board: Board,
    mouseCanvasPos: { x: number; y: number },
    screen: GameScreen,
  ): void {
    if (screen !== GameScreen.Play) return;
    const row = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    const col = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    if (row < 0 || row >= board.rows || col < 0 || col >= board.cols) {
      this.hide();
      return;
    }
    // Display as (row, col) to match the GridPos convention used throughout the codebase.
    let tooltipText = `(${row}, ${col})`;
    const tile = board.grid[row][col];
    const isGoldSpace = board.goldSpaces.has(posKey(row, col));
    const isGoldPipe = GOLD_PIPE_SHAPES.has(tile.shape);
    // Indicate a gold space; when a gold pipe is already placed, omit the
    // "needs gold pipe" hint and instead incorporate the space info into the
    // tile name section below (e.g. "Gold Straight on Gold Space").
    if (isGoldSpace && !isGoldPipe) {
      tooltipText += ' ' + t('tooltip.goldSpace');
    }
    // Indicate one-way cell direction.
    const oneWayDir = board.getOneWayDirection({ row, col });
    if (oneWayDir !== null) {
      tooltipText += ' ' + t('tooltip.oneWay', { direction: oneWayDir });
    }
    // Indicate cement cell status.
    const cementDryingTime = board.getCementDryingTime({ row, col });
    if (cementDryingTime !== null) {
      if (cementDryingTime === 0 && tile.shape !== PipeShape.Empty) {
        tooltipText += ' ' + t('tooltip.cementHardened');
      } else {
        tooltipText += ' ' + t('tooltip.cement', { time: cementDryingTime });
      }
    }
    // Show a human-readable tile name derived from its shape and chamber content.
    // When a gold pipe occupies a gold space, format it as "Gold Straight on Gold Space".
    const tileName = getTileDisplayName(tile);
    if (tileName) {
      tooltipText += isGoldSpace && isGoldPipe
        ? ' ' + t('tooltip.onGoldSpace', { name: tileName })
        : ' ' + tileName;
    }
    // Pre-placed fixed pipe shapes get a "(fixed)" indicator.
    if (tile.isFixed && PIPE_SHAPES.has(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape)) {
      tooltipText += ' ' + t('tooltip.fixed');
    }
    if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'regulator') {
      // Regulator parameters are already part of the tile display name above.
    } else if (tile.shape === PipeShape.Chamber && (tile.cost > 0 || tile.chamberContent === 'gel' || tile.chamberContent === 'siphon')) {
      // Only show a predicted cost for tiles that are NOT yet in the fill path.
      // Once a tile is connected its cost is already reflected in the water display;
      // for ice/snow/sandstone/hot_plate/gel/siphon show the locked-in effective value.
      const lockedImpact = board.getLockedWaterImpact({ row, col });
      const isConnected = lockedImpact !== null;
      const pos = { row, col };
      if (isConnected) {
        tooltipText = this._tooltipForConnectedChamber(tooltipText, tile, pos, lockedImpact, board);
      } else if (tile.chamberContent === 'siphon') {
        // Disconnected siphon: show frozen gain if set, else no cost preview.
        const frozenGain = board.getSiphonLockedGain({ row, col });
        if (frozenGain !== null) {
          tooltipText += '\n' + t('tooltip.gain', { gain: frozenGain });
        }
      } else if (tile.cost > 0) {
        // Gel has no fixed cost to predict before connection.
        tooltipText = this._tooltipForUnconnectedChamber(tooltipText, tile, board);
      }
    }
    this._el.textContent = tooltipText;
    this._el.style.display = 'block';
    this._el.style.left = `${clientX + 12}px`;
    this._el.style.top  = `${clientY + 12}px`;
  }

  /** Show a plain-text tooltip at the given client coordinates. */
  showText(clientX: number, clientY: number, text: string): void {
    this._el.textContent = text;
    this._el.style.display = 'block';
    this._el.style.left = `${clientX + 12}px`;
    this._el.style.top  = `${clientY + 12}px`;
  }

  /** Hide the tooltip. */
  hide(): void {
    this._el.style.display = 'none';
  }
}
