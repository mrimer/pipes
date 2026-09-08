/**
 * ChapterMapInput – owns all canvas gesture state and mouse/wheel/keyboard
 * event handlers for the chapter map editor canvas.  Follows the same
 * attach/detach pattern as EditorInputHandler for the level editor.
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

/** The palette entry used for level chamber tiles in the chapter map editor. */
const LEVEL_CHAMBER_PALETTE: EditorPalette = 'chamber:level';

// ─── Internal gesture state ────────────────────────────────────────────────────

interface ChapterDragState {
  startPos: { row: number; col: number };
  tile: TileDef;
  currentPos: { row: number; col: number };
  moved: boolean;
}

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
  // Gesture state
  private _hover: { row: number; col: number } | null = null;
  private _dragState: ChapterDragState | null = null;
  private _paintDragActive = false;
  private _rightEraseDragActive = false;
  private _rightEraseChanged = false;
  private _suppressContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseDownHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private _dblClickHandler: ((e: MouseEvent) => void) | null = null;
  private _contextMenuHandler: ((e: MouseEvent) => void) | null = null;
  private _mouseLeaveHandler: (() => void) | null = null;
  private _wheelHandler: ((e: WheelEvent) => void) | null = null;

  private _canvas: HTMLCanvasElement | null = null;

  constructor(private readonly _cb: ChapterMapInputCallbacks) {}

  /** Read-only hover position for the renderer. */
  get hover(): { row: number; col: number } | null {
    return this._hover;
  }

  /** Read-only drag state for the renderer. */
  get dragState(): DragState | null {
    if (!this._dragState) return null;
    return {
      fromPos: this._dragState.startPos,
      toPos: this._dragState.currentPos,
      tile: this._dragState.tile,
    };
  }

  /** Register all canvas and window event listeners. */
  attach(canvas: HTMLCanvasElement, campaign: CampaignDef, chapter: ChapterDef): void {
    this.detach();
    this._canvas = canvas;

    this._mouseDownHandler = (e: MouseEvent) => this._onMouseDown(e, campaign, chapter);
    this._mouseMoveHandler = (e: MouseEvent) => this._onMouseMove(e);
    this._dblClickHandler = (e: MouseEvent) => this._onDblClick(e);
    this._contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      if (this._suppressContextMenu) { this._suppressContextMenu = false; return; }
      this._onRightClick(e, campaign, chapter);
    };
    this._mouseLeaveHandler = () => this._onMouseLeave(chapter, campaign);
    this._wheelHandler = (e: WheelEvent) => this._onWheel(e, campaign, chapter);

    canvas.addEventListener('mousedown', this._mouseDownHandler);
    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('dblclick', this._dblClickHandler);
    canvas.addEventListener('contextmenu', this._contextMenuHandler);
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    canvas.addEventListener('wheel', this._wheelHandler, { passive: false });

    // Listen on window so mouseup is captured even when released outside the canvas.
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
    }
    this._windowMouseUpHandler = (e: MouseEvent) => this._onMouseUp(e, campaign, chapter);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  /** Remove the window mouseup listener. Call when tearing down the chapter map canvas. */
  detach(): void {
    if (this._canvas) {
      this._removeCanvasListeners(this._canvas);
    }
    this._mouseDownHandler = null;
    this._mouseMoveHandler = null;
    this._dblClickHandler = null;
    this._contextMenuHandler = null;
    this._mouseLeaveHandler = null;
    this._wheelHandler = null;
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
    this._canvas = null;
  }

  private _removeCanvasListeners(canvas: HTMLCanvasElement): void {
    if (this._mouseDownHandler) canvas.removeEventListener('mousedown', this._mouseDownHandler);
    if (this._mouseMoveHandler) canvas.removeEventListener('mousemove', this._mouseMoveHandler);
    if (this._dblClickHandler) canvas.removeEventListener('dblclick', this._dblClickHandler);
    if (this._contextMenuHandler) canvas.removeEventListener('contextmenu', this._contextMenuHandler);
    if (this._mouseLeaveHandler) canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
    if (this._wheelHandler) canvas.removeEventListener('wheel', this._wheelHandler);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** Convert a mouse event to a grid position on the chapter canvas. */
  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._canvas) return null;
    return computeCanvasPos(e, this._canvas, this._cb.getEditRows(), this._cb.getEditCols());
  }

  /** Tile at a grid position, or null if the cell is out of range or empty. */
  private _tileAt(pos: { row: number; col: number }): TileDef | null {
    return this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
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

  // ─── Event handlers ───────────────────────────────────────────────────────────

  private _onMouseDown(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) { this._onRightButtonMouseDown(e); return; }
    if (e.button !== 0) return;
    const pos = this._canvasPos(e);
    if (!pos) return;

    this._cb.setFocusedTilePos(pos);
    this._autoSelectPaletteForFocusedTile(pos, chapter, campaign);
    // Rebuild the tile params panel so it reflects the newly focused tile
    this._cb.rebuildTileParamsPanel(chapter, campaign);

    const existingTile = this._tileAt(pos);

    // If a level is selected for placement
    if (this._cb.getSelectedLevelIdx() !== null) {
      this._handleLevelPlacementMouseDown(pos, existingTile, chapter, campaign);
      return;
    }

    // 'chamber:level' palette: only focus/drag existing tiles; never place new ones
    if (this._cb.getPalette() === LEVEL_CHAMBER_PALETTE) {
      if (existingTile !== null) {
        this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
        this._cb.renderCanvas();
      }
      return;
    }

    this._handleRegularTileMouseDown(pos, existingTile, chapter, campaign);
  }

  private _onRightButtonMouseDown(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    this._rightEraseDragActive = true;
    this._rightEraseChanged = false;
    this._suppressContextMenu = false;
    const existingTile = this._tileAt(pos);
    if (existingTile !== null) {
      this._cb.getEditGrid()[pos.row][pos.col] = null;
      this._cb.clearFocusIfAt(pos);
      this._rightEraseChanged = true;
      sfxManager.play(SfxId.Delete);
      this._cb.renderCanvas();
    }
  }

  /** Auto-select the palette item that matches the focused tile's type. */
  private _autoSelectPaletteForFocusedTile(pos: { row: number; col: number }, chapter: ChapterDef, campaign: CampaignDef): void {
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

  private _handleLevelPlacementMouseDown(pos: { row: number; col: number }, existingTile: TileDef | null, chapter: ChapterDef, campaign: CampaignDef): void {
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
      this._cb.renderCanvas();
    } else if (existingTile.shape === PipeShape.Chamber && existingTile.chamberContent === 'level') {
      // Start dragging existing level chamber
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
    }
  }

  private _shouldStartDragOnClick(existingTile: TileDef | null, existingIsEmptyFloor: boolean, palette: EditorPalette, isEmptyFloorPalette: boolean, canOverwriteTree: boolean): existingTile is TileDef {
    return existingTile !== null && !existingIsEmptyFloor && palette !== 'erase' && !isEmptyFloorPalette && !canOverwriteTree;
  }

  private _handleRegularTileMouseDown(pos: { row: number; col: number }, existingTile: TileDef | null, chapter: ChapterDef, campaign: CampaignDef): void {
    const palette = this._cb.getPalette();
    const isEmptyFloorPalette = this._isEmptyFloorPalette(palette);
    const existingIsEmptyFloor = existingTile === null || isEmptyFloor(existingTile.shape);
    const canOverwriteTree = this._isTreeOverwriteCandidate(existingTile, palette);

    if (this._shouldStartDragOnClick(existingTile, existingIsEmptyFloor, palette, isEmptyFloorPalette, canOverwriteTree)) {
      // Start dragging the existing tile
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
      return;
    }

    if (this._isBlockedBySourceSinkLimit(palette)) return;
    if (this._canPaintDragPlace(existingIsEmptyFloor, canOverwriteTree, palette)) {
      this._paintDragActive = true;
      this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
      this._playChapterPlacementSfx(pos);
      this._cb.renderCanvas();
      return;
    }

    this._placeOrClearRegularTile(pos, existingTile, palette, chapter, campaign);
    this._cb.recordSnapshot(chapter);
    this._cb.saveGridState(chapter, campaign);
    this._cb.renderCanvas();
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

  private _placeOrClearRegularTile(pos: { row: number; col: number }, existingTile: TileDef | null, palette: EditorPalette, chapter: ChapterDef, campaign: CampaignDef): void {
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

  private _onMouseUp(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) { this._onRightButtonMouseUp(chapter, campaign); return; }
    if (e.button !== 0) return;

    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
      this._cb.renderCanvas();
      return;
    }

    if (!this._dragState) return;
    this._finishTileDrag(this._dragState, e.shiftKey, chapter, campaign);
  }

  private _onRightButtonMouseUp(chapter: ChapterDef, campaign: CampaignDef): void {
    if (!this._rightEraseDragActive) return;
    this._rightEraseDragActive = false;
    this._suppressContextMenu = true;
    if (this._rightEraseChanged) {
      this._cb.rebuildLevelInventory(chapter, campaign);
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
    }
    this._rightEraseChanged = false;
    this._cb.renderCanvas();
  }

  private _finishTileDrag(dragState: ChapterDragState, shiftKey: boolean, chapter: ChapterDef, campaign: CampaignDef): void {
    const { startPos, tile, currentPos, moved } = dragState;
    this._dragState = null;

    if (moved) {
      this._cb.getEditGrid()[startPos.row][startPos.col] = null;
      this._cb.getEditGrid()[currentPos.row][currentPos.col] = tile;
      this._cb.setFocusedTilePos(currentPos);
      this._cb.rebuildTileParamsPanel(chapter, campaign);
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
    } else if (PIPE_SHAPES.has(tile.shape)) {
      // Click on a placed pipe tile: rotate it (shift = counter-clockwise)
      this._cb.rotateTileAt(startPos, !shiftKey, chapter, campaign);
      return; // rotateTileAt already calls renderCanvas
    }
    this._cb.renderCanvas();
  }

  private _onMouseMove(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    this._hover = pos;
    this._updateHoverTooltip(pos);

    if (this._paintDragActive && pos) {
      this._handlePaintDragMove(pos);
    } else if (this._rightEraseDragActive && pos) {
      this._handleRightEraseDragMove(pos);
    } else if (this._dragState && pos) {
      this._handleTileDragMove(this._dragState, pos);
    }
    this._cb.renderCanvas();
  }

  /** Update the native browser tooltip with the level name when hovering a level chamber tile. */
  private _updateHoverTooltip(pos: { row: number; col: number } | null): void {
    if (!this._canvas) return;
    const tile = pos ? this._tileAt(pos) : null;
    this._canvas.title = this._resolveHoverTooltipText(tile);
  }

  private _isLevelChamberTile(tile: TileDef | null): tile is TileDef & { levelIdx: number } {
    return tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined;
  }

  private _resolveHoverTooltipText(tile: TileDef | null): string {
    if (!this._isLevelChamberTile(tile)) return '';
    const levelIdx = tile.levelIdx;
    const campaign = this._cb.getActiveCampaign();
    const chapter = campaign?.chapters[this._cb.getActiveChapterIdx()];
    const level = chapter?.levels[levelIdx];
    return level ? `${levelIdx + 1}: ${resolveLocalizedText(level.name)}` : t('editor.chapterMap.levelFallback', { number: levelIdx + 1 });
  }

  private _handlePaintDragMove(pos: { row: number; col: number }): void {
    const cur = this._tileAt(pos);
    const curIsEmpty = cur === null || isEmptyFloor(cur.shape);
    const palette = this._cb.getPalette();
    const canOverwriteTree = this._isTreeOverwriteCandidate(cur, palette);
    if (curIsEmpty || canOverwriteTree) {
      this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
    }
  }

  private _handleRightEraseDragMove(pos: { row: number; col: number }): void {
    if (this._tileAt(pos) !== null) {
      this._cb.getEditGrid()[pos.row][pos.col] = null;
      this._cb.clearFocusIfAt(pos);
      this._rightEraseChanged = true;
    }
  }

  private _handleTileDragMove(dragState: ChapterDragState, pos: { row: number; col: number }): void {
    const { startPos, currentPos } = dragState;
    if (pos.row === currentPos.row && pos.col === currentPos.col) return;
    if (pos.row === startPos.row && pos.col === startPos.col) {
      dragState.currentPos = pos;
      dragState.moved = false;
      return;
    }
    const targetTile = this._tileAt(pos);
    if (targetTile === null || isEmptyFloor(targetTile.shape)) {
      dragState.currentPos = pos;
      dragState.moved = true;
    }
  }

  private _onRightClick(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
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

  private _onMouseLeave(chapter: ChapterDef, campaign: CampaignDef): void {
    this._hover = null;
    if (this._dragState) this._dragState = null;
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      if (this._rightEraseChanged) {
        this._cb.recordSnapshot(chapter);
        this._cb.saveGridState(chapter, campaign);
      }
      this._rightEraseChanged = false;
    }
    this._cb.renderCanvas();
  }

  private _onWheel(e: WheelEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    e.preventDefault();
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

  /** Play the sfx appropriate for the current chapter map palette selection. */
  private _playChapterPlacementSfx(pos: { row: number; col: number }): void {
    const palette = this._cb.getPalette();
    if (isPipePlacementPalette(palette)) {
      const isConnected = isTileConnectedToSource(this._cb.getEditGrid(), pos);
      sfxManager.play(isConnected ? SfxId.PipeConnected : SfxId.PipePlacement);
    }
  }
}
