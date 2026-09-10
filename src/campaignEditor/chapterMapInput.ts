/**
 * ChapterMapInput – chapter map editor canvas placement/erase/rotate rules.
 * The gesture state machine itself (paint-drag, right-erase-drag, tile-drag,
 * contextmenu suppression, mouseleave cancellation, attach/detach wiring) is
 * owned by GridGestureEngine — shared with the level editor's
 * EditorInputHandler. This class supplies the chapter-map-specific decisions:
 * level-chamber placement, auto-selecting the palette for a focused tile, the
 * native hover tooltip, and double-click-to-open-level (all outside the
 * shared engine's concern).
 *
 * ChapterMapEditorSection wires callbacks via ChapterMapInputCallbacks and
 * calls attach() / detach() as the chapter map canvas is built / torn down.
 */

import type { CampaignDef, ChapterDef, TileDef} from '../types';
import { PipeShape, Direction } from '../types';
import { PIPE_SHAPES, isEmptyFloor, EMPTY_FLOOR_SHAPES } from '../board';
import type { DragState } from './editorRenderer';
import type { EditorPalette} from './types';
import { REPEATABLE_EDITOR_TILES, isPipePlacementPalette, isTreeShape } from './types';
import { sfxManager, SfxId } from '../audio/sfxManager';
import { isTileConnectedToSource } from '../tile';
import { canvasPos as computeCanvasPos } from './canvasUtils';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';
import type { GestureRules, LeftMouseDownAction, DragInFlight, GridPos } from './gridGestureEngine';
import { GridGestureEngine } from './gridGestureEngine';

/** The palette entry used for level chamber tiles in the chapter map editor. */
const LEVEL_CHAMBER_PALETTE: EditorPalette = 'chamber:level';

// ─── Callback interface ────────────────────────────────────────────────────────

export interface ChapterMapInputCallbacks {
  // State access
  getEditGrid(): (TileDef | null)[][];
  getEditRows(): number;
  getEditCols(): number;
  getPalette(): EditorPalette;
  setPalette(p: EditorPalette): void;
  getSelectedLevelIdx(): number | null;
  setSelectedLevelIdx(idx: number | null): void;
  getFocusedTilePos(): { row: number; col: number } | null;
  setFocusedTilePos(pos: { row: number; col: number } | null): void;

  // Tile operations
  buildTileDef(): TileDef;
  hasSourceElsewhere(): boolean;
  hasSinkElsewhere(): boolean;
  showSinkError(): void;
  rotateTileAt(pos: { row: number; col: number }, clockwise: boolean, chapter: ChapterDef, campaign: CampaignDef): void;
  rotateSourceSinkAt(pos: { row: number; col: number }, clockwise: boolean, chapter: ChapterDef, campaign: CampaignDef): void;
  rotatePalette(clockwise: boolean): void;

  // Post-action hooks
  recordSnapshot(chapter: ChapterDef): void;
  saveGridState(chapter: ChapterDef, campaign: CampaignDef): void;
  renderCanvas(): void;
  rebuildPalette(chapter: ChapterDef, campaign: CampaignDef): void;
  rebuildLevelInventory(chapter: ChapterDef, campaign: CampaignDef): void;
  rebuildTileParamsPanel(chapter: ChapterDef, campaign: CampaignDef): void;
  clearFocusIfAt(pos: { row: number; col: number }): void;

  // Parent callbacks
  getActiveCampaign(): CampaignDef | null;
  getActiveChapterIdx(): number;
  openLevelEditor(levelIdx: number, readOnly: boolean): void;
}

// ─── ChapterMapInput ───────────────────────────────────────────────────────────

export class ChapterMapInput {
  private readonly _engine: GridGestureEngine;
  private _canvas: HTMLCanvasElement | null = null;
  private _campaign: CampaignDef | null = null;
  private _chapter: ChapterDef | null = null;
  private _dblClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(private readonly _cb: ChapterMapInputCallbacks) {
    const rules: GestureRules = {
      canvasPos: (e) => this._canvasPos(e),
      decideLeftMouseDown: (pos, e) => this._decideLeftMouseDown(pos, e),
      paintCell: (pos) => this._paintCellRule(pos),
      eraseCell: (pos) => this._eraseCellRule(pos),
      canDropTileAt: (pos) => this._canDropTileAt(pos),
      onTileMoved: (drag) => this._commitTileMove(drag),
      onTileClicked: (drag, e) => this._onTileDragClicked(drag, e),
      onRightClick: (pos) => this._eraseAtRightClick(pos),
      onWheel: (e) => this._applyWheel(e),
      onGestureEnd: (kind, trigger) => this._onGestureEnd(kind, trigger),
      onHoverChanged: (pos) => this._updateHoverTooltip(pos),
    };
    this._engine = new GridGestureEngine(rules, { renderCanvas: () => this._cb.renderCanvas() });
  }

  /** Read-only hover position for the renderer. */
  get hover(): GridPos | null {
    return this._engine.hover;
  }

  /** Read-only drag state for the renderer. */
  get dragState(): DragState | null {
    const drag = this._engine.dragState;
    if (!drag) return null;
    return { fromPos: drag.startPos, toPos: drag.currentPos, tile: drag.tile };
  }

  /** Register all canvas and window event listeners. */
  attach(canvas: HTMLCanvasElement, campaign: CampaignDef, chapter: ChapterDef): void {
    this.detach();
    this._canvas = canvas;
    this._campaign = campaign;
    this._chapter = chapter;
    this._engine.attach(canvas);

    this._dblClickHandler = (e: MouseEvent) => this._onDblClick(e);
    canvas.addEventListener('dblclick', this._dblClickHandler);
  }

  /** Remove the window mouseup listener. Call when tearing down the chapter map canvas. */
  detach(): void {
    this._engine.detach();
    if (this._canvas && this._dblClickHandler) {
      this._canvas.removeEventListener('dblclick', this._dblClickHandler);
    }
    this._dblClickHandler = null;
    this._canvas = null;
  }

  // ─── GestureRules implementation (private — engine-facing only) ───────────────

  /** Convert a mouse event to a grid position on the chapter canvas. */
  private _canvasPos(e: MouseEvent): GridPos | null {
    if (!this._canvas) return null;
    return computeCanvasPos(e, this._canvas, this._cb.getEditRows(), this._cb.getEditCols());
  }

  /** Tile at a grid position, or null if the cell is out of range or empty. */
  private _tileAt(pos: GridPos): TileDef | null {
    return this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
  }

  /** campaign/chapter are only unset before the first attach() — every rule method below only
   *  runs while the engine is attached and dispatching real gestures, so this invariant always holds. */
  private _requireContext(): { chapter: ChapterDef; campaign: CampaignDef } {
    if (!this._chapter || !this._campaign) {
      throw new Error('ChapterMapInput: gesture handled before attach()');
    }
    return { chapter: this._chapter, campaign: this._campaign };
  }

  /** Non-'erase' palette that itself represents an empty-floor shape (e.g. Empty-Fall). */
  private _isEmptyFloorPalette(palette: EditorPalette): boolean {
    return palette !== 'erase' && EMPTY_FLOOR_SHAPES.includes(palette as PipeShape);
  }

  /** Whether an existing tree tile may be overwritten by the currently selected tree palette. */
  private _isTreeOverwriteCandidate(existingTile: TileDef | null, palette: EditorPalette): boolean {
    return existingTile !== null &&
      REPEATABLE_EDITOR_TILES.has(palette) &&
      isTreeShape(palette as PipeShape) &&
      isTreeShape(existingTile.shape);
  }

  private _decideLeftMouseDown(pos: GridPos, _e: MouseEvent): LeftMouseDownAction {
    const { chapter, campaign } = this._requireContext();
    this._cb.setFocusedTilePos(pos);
    this._autoSelectPaletteForFocusedTile(pos, chapter, campaign);
    // Rebuild the tile params panel so it reflects the newly focused tile
    this._cb.rebuildTileParamsPanel(chapter, campaign);

    const existingTile = this._tileAt(pos);

    // If a level is selected for placement
    if (this._cb.getSelectedLevelIdx() !== null) {
      return this._decideLevelPlacementMouseDown(pos, existingTile, chapter, campaign);
    }

    // 'chamber:level' palette: only focus/drag existing tiles; never place new ones
    if (this._cb.getPalette() === LEVEL_CHAMBER_PALETTE) {
      if (existingTile !== null) {
        return { type: 'startTileDrag', tile: existingTile };
      }
      return { type: 'immediate' };
    }

    return this._decideRegularTileMouseDown(pos, existingTile, chapter, campaign);
  }

  /** Auto-select the palette item that matches the focused tile's type. */
  private _autoSelectPaletteForFocusedTile(pos: GridPos, chapter: ChapterDef, campaign: CampaignDef): void {
    const tileAtPos = this._tileAt(pos);
    if (tileAtPos === null) return;
    const selectedPalette = this._cb.getPalette();
    const preserveTreePaletteSelection = isTreeShape(selectedPalette as PipeShape) && isTreeShape(tileAtPos.shape);
    const paletteForTile: EditorPalette | null =
      tileAtPos.shape === PipeShape.Chamber && tileAtPos.chamberContent === 'level'
        ? LEVEL_CHAMBER_PALETTE
        : tileAtPos.shape === PipeShape.Chamber
          ? null
          : tileAtPos.shape;
    if (paletteForTile !== null && !preserveTreePaletteSelection) {
      this._cb.setPalette(paletteForTile);
      this._cb.rebuildPalette(chapter, campaign);
    }
  }

  private _decideLevelPlacementMouseDown(pos: GridPos, existingTile: TileDef | null, chapter: ChapterDef, campaign: CampaignDef): LeftMouseDownAction {
    if (existingTile === null) {
      // Place level chamber
      this._cb.getEditGrid()[pos.row][pos.col] = {
        shape: PipeShape.Chamber,
        chamberContent: 'level',
        levelIdx: this._cb.getSelectedLevelIdx()!, // eslint-disable-line @typescript-eslint/no-non-null-assertion -- caller checked getSelectedLevelIdx() !== null
        connections: [Direction.East, Direction.West],
      };
      this._cb.setSelectedLevelIdx(null);
      // Auto-select the 'Level' palette and sync params panel after placement
      this._cb.setPalette(LEVEL_CHAMBER_PALETTE);
      this._cb.rebuildPalette(chapter, campaign);
      this._cb.rebuildTileParamsPanel(chapter, campaign);
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
      this._cb.rebuildLevelInventory(chapter, campaign);
      return { type: 'immediate' };
    } else if (existingTile.shape === PipeShape.Chamber && existingTile.chamberContent === 'level') {
      // Start dragging existing level chamber
      return { type: 'startTileDrag', tile: existingTile };
    }
    return { type: 'immediate' };
  }

  private _shouldStartDragOnClick(existingTile: TileDef | null, existingIsEmptyFloor: boolean, palette: EditorPalette, isEmptyFloorPalette: boolean, canOverwriteTree: boolean): existingTile is TileDef {
    return existingTile !== null && !existingIsEmptyFloor && palette !== 'erase' && !isEmptyFloorPalette && !canOverwriteTree;
  }

  private _decideRegularTileMouseDown(pos: GridPos, existingTile: TileDef | null, chapter: ChapterDef, campaign: CampaignDef): LeftMouseDownAction {
    const palette = this._cb.getPalette();
    const isEmptyFloorPalette = this._isEmptyFloorPalette(palette);
    const existingIsEmptyFloor = existingTile === null || isEmptyFloor(existingTile.shape);
    const canOverwriteTree = this._isTreeOverwriteCandidate(existingTile, palette);

    if (this._shouldStartDragOnClick(existingTile, existingIsEmptyFloor, palette, isEmptyFloorPalette, canOverwriteTree)) {
      return { type: 'startTileDrag', tile: existingTile };
    }

    if (this._isBlockedBySourceSinkLimit(palette)) return { type: 'immediate' };
    if (this._canPaintDragPlace(existingIsEmptyFloor, canOverwriteTree, palette)) {
      return { type: 'startPaintDrag' };
    }

    this._placeOrClearRegularTile(pos, existingTile, palette, chapter, campaign);
    this._cb.recordSnapshot(chapter);
    this._cb.saveGridState(chapter, campaign);
    return { type: 'immediate' };
  }

  /** Only one Source/Sink tile is allowed per chapter map; blocks placement (and shows an error for Sink) if one exists elsewhere. */
  private _isBlockedBySourceSinkLimit(palette: EditorPalette): boolean {
    if (palette === PipeShape.Source && this._cb.hasSourceElsewhere()) return true; // Only one source allowed
    if (palette === PipeShape.Sink && this._cb.hasSinkElsewhere()) {
      this._cb.showSinkError();
      return true; // Only one sink allowed
    }
    return false;
  }

  private _canPaintDragPlace(existingIsEmptyFloor: boolean, canOverwriteTree: boolean, palette: EditorPalette): boolean {
    return (existingIsEmptyFloor || canOverwriteTree) && REPEATABLE_EDITOR_TILES.has(palette);
  }

  private _placeOrClearRegularTile(pos: GridPos, existingTile: TileDef | null, palette: EditorPalette, chapter: ChapterDef, campaign: CampaignDef): void {
    // 'erase' and the Empty-Summer palette both just clear the cell to null.
    if (palette === 'erase' || palette === PipeShape.Empty) {
      if (existingTile !== null) sfxManager.play(SfxId.Delete);
      this._cb.getEditGrid()[pos.row][pos.col] = null;
      this._cb.clearFocusIfAt(pos);
      this._cb.rebuildLevelInventory(chapter, campaign);
    } else {
      this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
      this._playChapterPlacementSfx(pos);
    }
  }

  private _paintCellRule(pos: GridPos): void {
    const cur = this._tileAt(pos);
    const curIsEmpty = cur === null || isEmptyFloor(cur.shape);
    const palette = this._cb.getPalette();
    const canOverwriteTree = this._isTreeOverwriteCandidate(cur, palette);
    if (curIsEmpty || canOverwriteTree) {
      this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
    }
  }

  private _eraseCellRule(pos: GridPos): boolean {
    if (this._tileAt(pos) === null) return false;
    this._cb.getEditGrid()[pos.row][pos.col] = null;
    this._cb.clearFocusIfAt(pos);
    return true;
  }

  private _canDropTileAt(pos: GridPos): boolean {
    const targetTile = this._tileAt(pos);
    return targetTile === null || isEmptyFloor(targetTile.shape);
  }

  private _commitTileMove(drag: DragInFlight): void {
    const { chapter, campaign } = this._requireContext();
    this._cb.getEditGrid()[drag.startPos.row][drag.startPos.col] = null;
    this._cb.getEditGrid()[drag.currentPos.row][drag.currentPos.col] = drag.tile;
    this._cb.setFocusedTilePos(drag.currentPos);
    this._cb.rebuildTileParamsPanel(chapter, campaign);
    this._cb.recordSnapshot(chapter);
    this._cb.saveGridState(chapter, campaign);
  }

  private _onTileDragClicked(drag: DragInFlight, e: MouseEvent): void {
    if (!PIPE_SHAPES.has(drag.tile.shape)) return;
    const { chapter, campaign } = this._requireContext();
    // Click on a placed pipe tile: rotate it (shift = counter-clockwise).
    this._cb.rotateTileAt(drag.startPos, !e.shiftKey, chapter, campaign);
  }

  private _eraseAtRightClick(pos: GridPos): void {
    const { chapter, campaign } = this._requireContext();
    if (this._tileAt(pos) === null) return;
    sfxManager.play(SfxId.Delete);
    this._cb.getEditGrid()[pos.row][pos.col] = null;
    this._cb.clearFocusIfAt(pos);
    this._cb.rebuildLevelInventory(chapter, campaign);
    this._cb.recordSnapshot(chapter);
    this._cb.saveGridState(chapter, campaign);
    this._cb.renderCanvas();
  }

  private _onDblClick(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._tileAt(pos);
    if (!this._isLevelChamberTile(tile)) return;
    sfxManager.play(SfxId.LevelSelect);
    const readOnly = this._cb.getActiveCampaign()?.official === true;
    this._cb.openLevelEditor(tile.levelIdx, readOnly);
  }

  private _applyWheel(e: WheelEvent): void {
    const { chapter, campaign } = this._requireContext();
    // Recomputed from the wheel event's own coordinates (not the engine's tracked hover) —
    // wheel rotation targets whatever cell the cursor is actually over right now.
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._tileAt(pos);
    if (tile && PIPE_SHAPES.has(tile.shape)) {
      this._cb.rotateTileAt(pos, e.deltaY > 0, chapter, campaign);
    } else if (tile && this._isSourceSinkOrLevelChamberTile(tile)) {
      this._cb.rotateSourceSinkAt(pos, e.deltaY > 0, chapter, campaign);
    } else if (PIPE_SHAPES.has(this._cb.getPalette() as PipeShape)) {
      this._cb.rotatePalette(e.deltaY > 0);
      sfxManager.play(e.deltaY > 0 ? SfxId.PendingCW : SfxId.PendingCCW);
    }
  }

  private _isSourceSinkOrLevelChamberTile(tile: TileDef): boolean {
    return tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level');
  }

  private _onGestureEnd(kind: 'paintDrag' | 'eraseDrag', trigger: 'mouseup' | 'mouseleave'): void {
    const { chapter, campaign } = this._requireContext();
    // Matches the pre-engine asymmetry: an erase-drag ended by releasing the mouse
    // rebuilds the level inventory (a level chamber may have been erased); one
    // ended by the cursor leaving the canvas does not.
    if (kind === 'eraseDrag' && trigger === 'mouseup') this._cb.rebuildLevelInventory(chapter, campaign);
    this._cb.recordSnapshot(chapter);
    this._cb.saveGridState(chapter, campaign);
  }

  private _isLevelChamberTile(tile: TileDef | null): tile is TileDef & { levelIdx: number } {
    return tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined;
  }

  /** Update the native browser tooltip with the level name when hovering a level chamber tile. */
  private _updateHoverTooltip(pos: GridPos | null): void {
    if (!this._canvas) return;
    const tile = pos ? this._tileAt(pos) : null;
    this._canvas.title = this._resolveHoverTooltipText(tile);
  }

  private _resolveHoverTooltipText(tile: TileDef | null): string {
    if (!this._isLevelChamberTile(tile)) return '';
    const levelIdx = tile.levelIdx;
    const campaign = this._cb.getActiveCampaign();
    const chapter = campaign?.chapters[this._cb.getActiveChapterIdx()];
    const level = chapter?.levels[levelIdx];
    return level ? `${levelIdx + 1}: ${resolveLocalizedText(level.name)}` : t('editor.chapterMap.levelFallback', { number: levelIdx + 1 });
  }

  /** Play the sfx appropriate for the current chapter map palette selection. */
  private _playChapterPlacementSfx(pos: GridPos): void {
    const palette = this._cb.getPalette();
    if (isPipePlacementPalette(palette)) {
      const isConnected = isTileConnectedToSource(this._cb.getEditGrid(), pos);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
  }
}
