import type { Board} from './board';
import { PIPE_SHAPES, SPIN_PIPE_SHAPES, GOLD_PIPE_SHAPES, posKey, computeDeltaTemp, snowCostPerDeltaTemp, sandstoneCostFactors } from './board';
import type { Tile } from './tile';
import { GameScreen, PipeShape, COLD_CHAMBER_CONTENTS } from './types';
import type { ChamberContent } from './types';
import { TILE_SIZE, getTileDisplayName } from './renderer';
import { t } from './i18n';
import { RADIUS_SM, UI_BG, UI_BORDER, UI_TEXT } from './uiConstants';

/** CSS style for the Ctrl-hover coordinate tooltip element. */
const TOOLTIP_CSS =
  `display:none;position:fixed;background:${UI_BG};color:${UI_TEXT};border:1px solid ${UI_BORDER};` +
  `border-radius:${RADIUS_SM};padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;white-space:pre-wrap;`;

/** Parameters for {@link TooltipManager.show}. */
export interface TooltipShowContext {
  clientX: number;
  clientY: number;
  board: Board;
  mouseCanvasPos: { x: number; y: number };
  screen: GameScreen;
}

/** Whether (row, col) falls outside the board's grid bounds. */
function _isOutOfBounds(row: number, col: number, board: Board): boolean {
  return row < 0 || row >= board.rows || col < 0 || col >= board.cols;
}

/** Whether the tile is a pre-placed fixed pipe that should show the "(fixed)" hint. */
function _isFixedPlainPipe(tile: Tile): boolean {
  return tile.isFixed && PIPE_SHAPES.has(tile.shape) && !SPIN_PIPE_SHAPES.has(tile.shape);
}

/** Whether the Chamber tile's cost/gain is one this tooltip can show a predicted or locked-in value for. */
function _hasPredictableChamberCost(tile: Tile): boolean {
  return tile.shape === PipeShape.Chamber
    && (tile.cost > 0 || tile.chamberContent === 'gel' || tile.chamberContent === 'siphon');
}

/** Bundled inputs for the "chamber is already connected" tooltip helpers. */
interface ConnectedChamberContext {
  tile: Tile;
  pos: { row: number; col: number };
  lockedImpact: number;
  board: Board;
}

/** Locked-in stats shared by the ice/snow/sandstone ("cold chamber") tooltip formulas. */
interface LockedColdStats {
  lockedDeltaTemp: number;
  lockedPressure: number;
  lockedCost: number;
}

/** A tooltip-text-so-far plus the predicted cost/gain value driving the trailing suffix, if any. */
interface UnconnectedChamberCostResult {
  text: string;
  predictedCost: number | null;
}

/** Bundled per-cell inputs shared by {@link TooltipManager.show}'s tooltip-text-append helpers. */
interface TooltipCellContext {
  board: Board;
  row: number;
  col: number;
  tile: Tile;
}

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
  private _tooltipForConnectedChamber(tooltipText: string, ctx: ConnectedChamberContext): string {
    const content = ctx.tile.chamberContent;
    if (content !== null && COLD_CHAMBER_CONTENTS.has(content)) {
      return this._tooltipForConnectedColdChamber(tooltipText, ctx);
    }
    if (content === 'hot_plate') {
      return this._tooltipForConnectedHotPlate(tooltipText, ctx);
    }
    if (content === 'gel') {
      return tooltipText + '\n' + t('tooltip.cost', { cost: Math.abs(ctx.lockedImpact) });
    }
    if (content === 'siphon') {
      return tooltipText + '\n' + t('tooltip.gain', { gain: ctx.lockedImpact });
    }
    return tooltipText;
  }

  /** Handle the ice/snow/sandstone ("cold chamber") case of {@link _tooltipForConnectedChamber}. */
  private _tooltipForConnectedColdChamber(tooltipText: string, ctx: ConnectedChamberContext): string {
    const { tile, pos, lockedImpact, board } = ctx;
    const lockedTemp = board.getLockedConnectTemp(pos) ?? 0;
    const stats: LockedColdStats = {
      lockedDeltaTemp: computeDeltaTemp(tile.temperature, lockedTemp),
      lockedPressure: board.getLockedConnectPressure(pos) ?? 1,
      lockedCost: Math.abs(lockedImpact),
    };
    const content = tile.chamberContent;
    if (content === 'ice') {
      return tooltipText + '\n' + this._iceCostFormula(stats.lockedDeltaTemp, tile.cost) + ' ' + t('tooltip.cost', { cost: stats.lockedCost });
    }
    if (content === 'snow') {
      return tooltipText + '\n' + this._snowCostFormula(stats.lockedDeltaTemp, stats.lockedPressure, tile.cost) + ' ' + t('tooltip.cost', { cost: stats.lockedCost });
    }
    return this._tooltipForConnectedSandstone(tooltipText, tile, stats);
  }

  /** Handle the sandstone case of {@link _tooltipForConnectedColdChamber}. */
  private _tooltipForConnectedSandstone(tooltipText: string, tile: Tile, stats: LockedColdStats): string {
    const { lockedDeltaTemp, lockedPressure, lockedCost } = stats;
    const shatterActive = tile.shatter > tile.hardness;
    if (shatterActive && lockedPressure >= tile.shatter) {
      return tooltipText + '\n' + t('tooltip.shatterCostZero', { pressure: lockedPressure, shatter: tile.shatter });
    }
    const lockedDeltaDamage = lockedPressure - tile.hardness;
    if (lockedDeltaDamage >= 1) {
      return tooltipText + '\n' + this._sandstoneCostFormula(lockedDeltaTemp, lockedPressure, tile) + ' ' + t('tooltip.cost', { cost: lockedCost });
    }
    return tooltipText + '\n' + t('tooltip.cost', { cost: lockedCost });
  }

  /** Handle the hot_plate case of {@link _tooltipForConnectedChamber}. */
  private _tooltipForConnectedHotPlate(tooltipText: string, ctx: ConnectedChamberContext): string {
    const { tile, pos, lockedImpact, board } = ctx;
    const lockedGain = board.getLockedHotPlateGain(pos);
    if (lockedGain === null) return tooltipText;
    const lockedTemp = board.getLockedConnectTemp(pos) ?? 0;
    const loss = Math.max(0, lockedGain - lockedImpact);
    return tooltipText + '\n' + this._hotPlateCostFormula(tile.temperature, lockedTemp, tile.cost) + ' ' + t('tooltip.hotPlateEffect', { gain: lockedGain, loss });
  }

  /**
   * Append cost-related tooltip text for a chamber tile that is **not yet connected**
   * (predicted cost using current live stats).
   * @returns The updated tooltip string, with predicted cost appended if non-zero.
   */
  private _tooltipForUnconnectedChamber(tooltipText: string, tile: Tile, board: Board): string {
    const content = tile.chamberContent;
    if (content === 'dirt') return tooltipText + ' ' + t('tooltip.dirtWater');

    const { text, predictedCost } = this._computeUnconnectedChamberCost(tooltipText, tile, board, content);
    return this._appendPredictedCostSuffix(text, predictedCost);
  }

  /** Dispatch to the per-content-type cost calculator for {@link _tooltipForUnconnectedChamber}. */
  private _computeUnconnectedChamberCost(
    tooltipText: string, tile: Tile, board: Board, content: ChamberContent | null,
  ): UnconnectedChamberCostResult {
    if (content === 'ice') return this._unconnectedIceCost(tooltipText, tile, board);
    if (content === 'snow') return this._unconnectedSnowCost(tooltipText, tile, board);
    if (content === 'sandstone') return this._unconnectedSandstoneCost(tooltipText, tile, board);
    if (content === 'hot_plate') return this._unconnectedHotPlateCost(tooltipText, tile, board);
    return { text: tooltipText, predictedCost: 0 };
  }

  private _unconnectedIceCost(tooltipText: string, tile: Tile, board: Board): UnconnectedChamberCostResult {
    const currentTemp = board.getCurrentTemperature();
    const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
    const text = tooltipText + `\n${this._iceCostFormula(deltaTemp, tile.cost)}`;
    return { text, predictedCost: tile.cost * deltaTemp };
  }

  private _unconnectedSnowCost(tooltipText: string, tile: Tile, board: Board): UnconnectedChamberCostResult {
    const currentTemp = board.getCurrentTemperature();
    const currentPressure = board.getCurrentPressure();
    const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
    const text = tooltipText + `\n${this._snowCostFormula(deltaTemp, currentPressure, tile.cost)}`;
    return { text, predictedCost: snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp };
  }

  private _unconnectedSandstoneCost(tooltipText: string, tile: Tile, board: Board): UnconnectedChamberCostResult {
    const currentTemp = board.getCurrentTemperature();
    const currentPressure = board.getCurrentPressure();
    const { shatterOverride, deltaDamage, costPerDeltaTemp } =
      sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
    if (shatterOverride) {
      const text = tooltipText + '\n' + t('tooltip.shatterCostZero', { pressure: currentPressure, shatter: tile.shatter });
      return { text, predictedCost: 0 };
    }
    if (deltaDamage <= 0) {
      const text = tooltipText + '\n' + t('tooltip.sandstoneNoConnect', { pressure: currentPressure, hardness: tile.hardness });
      return { text, predictedCost: null };
    }
    const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
    const text = tooltipText + `\n${this._sandstoneCostFormula(deltaTemp, currentPressure, tile)}`;
    return { text, predictedCost: costPerDeltaTemp * deltaTemp };
  }

  private _unconnectedHotPlateCost(tooltipText: string, tile: Tile, board: Board): UnconnectedChamberCostResult {
    const currentTemp = board.getCurrentTemperature();
    const effectiveCost = tile.cost * (tile.temperature + currentTemp);
    const waterGain = Math.min(board.frozen, effectiveCost);
    const waterLoss = Math.max(0, effectiveCost - waterGain);
    let text = tooltipText + '\n' + this._hotPlateCostFormula(tile.temperature, currentTemp, tile.cost);
    text += ' ' + t('tooltip.hotPlateEffect', { gain: waterGain, loss: waterLoss });
    return { text, predictedCost: waterLoss - waterGain };
  }

  /** Append the trailing "(+N cost)" / "(+N gain)" suffix implied by a predicted cost, if any. */
  private _appendPredictedCostSuffix(tooltipText: string, predictedCost: number | null): string {
    if (predictedCost === null || predictedCost === 0) return tooltipText;
    return tooltipText + (predictedCost > 0
      ? ' ' + t('tooltip.cost', { cost: predictedCost })
      : ' ' + t('tooltip.gain', { gain: Math.abs(predictedCost) }));
  }

  /**
   * Show the tooltip at the given client coordinates, populating it with
   * grid-position and tile information from the board.
   */
  show(ctx: TooltipShowContext): void {
    const { clientX, clientY, board, mouseCanvasPos, screen } = ctx;
    if (screen !== GameScreen.Play) return;
    const row = Math.floor(mouseCanvasPos.y / TILE_SIZE);
    const col = Math.floor(mouseCanvasPos.x / TILE_SIZE);
    if (_isOutOfBounds(row, col, board)) {
      this.hide();
      return;
    }
    const tile = board.grid[row][col];
    const cellCtx: TooltipCellContext = { board, row, col, tile };

    // Display as (row, col) to match the GridPos convention used throughout the codebase.
    let tooltipText = `(${row}, ${col})`;
    tooltipText = this._appendGoldSpaceHint(tooltipText, cellCtx);
    tooltipText = this._appendOneWayHint(tooltipText, board, row, col);
    tooltipText = this._appendCementHint(tooltipText, cellCtx);
    tooltipText = this._appendTileNameHint(tooltipText, cellCtx);
    tooltipText = this._appendFixedPipeHint(tooltipText, tile);
    tooltipText = this._appendChamberCostHint(tooltipText, cellCtx);

    this._el.textContent = tooltipText;
    this._el.style.display = 'block';
    this._el.style.left = `${clientX + 12}px`;
    this._el.style.top  = `${clientY + 12}px`;
  }

  /** Indicate a gold space; omitted when a gold pipe already occupies it (see {@link _appendTileNameHint}). */
  private _appendGoldSpaceHint(tooltipText: string, ctx: TooltipCellContext): string {
    const isGoldSpace = ctx.board.goldSpaces.has(posKey(ctx.row, ctx.col));
    const isGoldPipe = GOLD_PIPE_SHAPES.has(ctx.tile.shape);
    if (!isGoldSpace || isGoldPipe) return tooltipText;
    return tooltipText + ' ' + t('tooltip.goldSpace');
  }

  /** Indicate one-way cell direction. */
  private _appendOneWayHint(tooltipText: string, board: Board, row: number, col: number): string {
    const oneWayDir = board.getOneWayDirection({ row, col });
    if (oneWayDir === null) return tooltipText;
    return tooltipText + ' ' + t('tooltip.oneWay', { direction: oneWayDir });
  }

  /** Indicate cement cell status (hardened, or drying with a remaining time). */
  private _appendCementHint(tooltipText: string, ctx: TooltipCellContext): string {
    const cementDryingTime = ctx.board.getCementDryingTime({ row: ctx.row, col: ctx.col });
    if (cementDryingTime === null) return tooltipText;
    if (cementDryingTime === 0 && ctx.tile.shape !== PipeShape.Empty) {
      return tooltipText + ' ' + t('tooltip.cementHardened');
    }
    return tooltipText + ' ' + t('tooltip.cement', { time: cementDryingTime });
  }

  /**
   * Show a human-readable tile name derived from its shape and chamber content.
   * When a gold pipe occupies a gold space, format it as "Gold Straight on Gold Space".
   */
  private _appendTileNameHint(tooltipText: string, ctx: TooltipCellContext): string {
    const tileName = getTileDisplayName(ctx.tile);
    if (!tileName) return tooltipText;
    const isGoldSpace = ctx.board.goldSpaces.has(posKey(ctx.row, ctx.col));
    const isGoldPipe = GOLD_PIPE_SHAPES.has(ctx.tile.shape);
    return isGoldSpace && isGoldPipe
      ? tooltipText + ' ' + t('tooltip.onGoldSpace', { name: tileName })
      : tooltipText + ' ' + tileName;
  }

  /** Pre-placed fixed pipe shapes get a "(fixed)" indicator. */
  private _appendFixedPipeHint(tooltipText: string, tile: Tile): string {
    if (!_isFixedPlainPipe(tile)) return tooltipText;
    return tooltipText + ' ' + t('tooltip.fixed');
  }

  /**
   * Only show a predicted cost for tiles that are NOT yet in the fill path.
   * Once a tile is connected its cost is already reflected in the water display;
   * for ice/snow/sandstone/hot_plate/gel/siphon show the locked-in effective value.
   */
  private _appendChamberCostHint(tooltipText: string, ctx: TooltipCellContext): string {
    const { board, row, col, tile } = ctx;
    if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'regulator') {
      // Regulator parameters are already part of the tile display name above.
      return tooltipText;
    }
    if (!_hasPredictableChamberCost(tile)) return tooltipText;

    const pos = { row, col };
    const lockedImpact = board.getLockedWaterImpact(pos);
    if (lockedImpact !== null) {
      return this._tooltipForConnectedChamber(tooltipText, { tile, pos, lockedImpact, board });
    }
    if (tile.chamberContent === 'siphon') {
      // Disconnected siphon: show frozen gain if set, else no cost preview.
      const frozenGain = board.getSiphonLockedGain(pos);
      if (frozenGain === null) return tooltipText;
      return tooltipText + '\n' + t('tooltip.gain', { gain: frozenGain });
    }
    if (tile.cost > 0) {
      // Gel has no fixed cost to predict before connection.
      return this._tooltipForUnconnectedChamber(tooltipText, tile, board);
    }
    return tooltipText;
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
