/**
 * ChapterMapInput – owns all canvas gesture state and mouse/wheel/keyboard
 * event handlers for the chapter map editor canvas.  Follows the same
 * attach/detach pattern as EditorInputHandler for the level editor.
 *
 * ChapterMapEditorSection wires callbacks via ChapterMapInputCallbacks and
 * calls attach() / detach() as the chapter map canvas is built / torn down.
 */

import { CampaignDef, ChapterDef, TileDef, PipeShape, Direction } from '../types';
import { PIPE_SHAPES } from '../board';
import { DragState } from './renderer';
import { EditorPalette, REPEATABLE_EDITOR_TILES } from './types';
import { sfxManager, SfxId } from '../sfxManager';

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
  private _suppressContextMenu = false;
  private _windowMouseUpHandler: ((e: MouseEvent) => void) | null = null;

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
    this._canvas = canvas;

    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e, campaign, chapter));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('dblclick',  (e) => this._onDblClick(e));
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this._suppressContextMenu) { this._suppressContextMenu = false; return; }
      this._onRightClick(e, campaign, chapter);
    });
    canvas.addEventListener('mouseleave', () => this._onMouseLeave(chapter));
    canvas.addEventListener('wheel', (e) => this._onWheel(e, campaign, chapter), { passive: false });

    // Listen on window so mouseup is captured even when released outside the canvas.
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
    }
    this._windowMouseUpHandler = (e: MouseEvent) => this._onMouseUp(e, campaign, chapter);
    window.addEventListener('mouseup', this._windowMouseUpHandler);
  }

  /** Remove the window mouseup listener. Call when tearing down the chapter map canvas. */
  detach(): void {
    if (this._windowMouseUpHandler) {
      window.removeEventListener('mouseup', this._windowMouseUpHandler);
      this._windowMouseUpHandler = null;
    }
    this._canvas = null;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** Convert a mouse event to a grid position on the chapter canvas. */
  private _canvasPos(e: MouseEvent): { row: number; col: number } | null {
    if (!this._canvas) return null;
    const rect = this._canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * this._cb.getEditCols() / rect.width);
    const row = Math.floor((e.clientY - rect.top)  * this._cb.getEditRows() / rect.height);
    if (row < 0 || row >= this._cb.getEditRows() || col < 0 || col >= this._cb.getEditCols()) return null;
    return { row, col };
  }

  // ─── Event handlers ───────────────────────────────────────────────────────────

  private _onMouseDown(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) {
      const pos = this._canvasPos(e);
      if (!pos) return;
      this._rightEraseDragActive = true;
      this._suppressContextMenu = false;
      const existingTile = this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
      if (existingTile !== null) {
        this._cb.getEditGrid()[pos.row][pos.col] = null;
        this._cb.clearFocusIfAt(pos);
        sfxManager.play(SfxId.Delete);
        this._cb.renderCanvas();
      }
      return;
    }
    if (e.button !== 0) return;
    const pos = this._canvasPos(e);
    if (!pos) return;

    this._cb.setFocusedTilePos(pos);

    // Auto-select the 'Level' palette item when a level chamber is focused
    const tileAtPos = this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
    if (tileAtPos?.shape === PipeShape.Chamber && tileAtPos.chamberContent === 'level') {
      this._cb.setPalette(LEVEL_CHAMBER_PALETTE);
      this._cb.rebuildPalette(chapter, campaign);
    }

    // Rebuild the tile params panel so it reflects the newly focused tile
    this._cb.rebuildTileParamsPanel(chapter, campaign);

    const existingTile = this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;

    // If a level is selected for placement
    if (this._cb.getSelectedLevelIdx() !== null) {
      if (existingTile === null) {
        // Place level chamber
        this._cb.getEditGrid()[pos.row][pos.col] = {
          shape: PipeShape.Chamber,
          chamberContent: 'level',
          levelIdx: this._cb.getSelectedLevelIdx()!,
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

    // Regular tile placement / dragging
    if (existingTile !== null && this._cb.getPalette() !== 'erase') {
      // Start dragging the existing tile
      this._dragState = { startPos: pos, tile: existingTile, currentPos: pos, moved: false };
      this._cb.renderCanvas();
    } else {
      if (this._cb.getPalette() === PipeShape.Source && this._cb.hasSourceElsewhere()) {
        return; // Only one source allowed
      }
      if (existingTile === null && REPEATABLE_EDITOR_TILES.has(this._cb.getPalette())) {
        this._paintDragActive = true;
        this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
        sfxManager.play(SfxId.PipePlacement);
        this._cb.renderCanvas();
        return;
      }
      if (this._cb.getPalette() === 'erase') {
        if (existingTile !== null) sfxManager.play(SfxId.Delete);
        this._cb.getEditGrid()[pos.row][pos.col] = null;
        this._cb.clearFocusIfAt(pos);
        this._cb.rebuildLevelInventory(chapter, campaign);
      } else {
        if (PIPE_SHAPES.has(this._cb.getPalette() as PipeShape) ||
            this._cb.getPalette() === PipeShape.Source ||
            this._cb.getPalette() === PipeShape.Sink) {
          sfxManager.play(SfxId.PipePlacement);
        }
        this._cb.getEditGrid()[pos.row][pos.col] = this._cb.buildTileDef();
      }
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
      this._cb.renderCanvas();
    }
  }

  private _onMouseUp(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    if (e.button === 2) {
      if (!this._rightEraseDragActive) return;
      this._rightEraseDragActive = false;
      this._suppressContextMenu = true;
      this._cb.rebuildLevelInventory(chapter, campaign);
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
      this._cb.renderCanvas();
      return;
    }
    if (e.button !== 0) return;

    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
      this._cb.renderCanvas();
      return;
    }

    if (!this._dragState) return;
    const { startPos, tile, currentPos, moved } = this._dragState;
    this._dragState = null;

    if (moved) {
      this._cb.setFocusedTilePos(null);
      this._cb.getEditGrid()[startPos.row][startPos.col] = null;
      this._cb.getEditGrid()[currentPos.row][currentPos.col] = tile;
      this._cb.recordSnapshot(chapter);
      this._cb.saveGridState(chapter, campaign);
    } else {
      // Click on a placed pipe tile: rotate it (shift = counter-clockwise)
      if (PIPE_SHAPES.has(tile.shape)) {
        this._cb.rotateTileAt(startPos, !e.shiftKey, chapter, campaign);
        return; // rotateTileAt already calls renderCanvas
      }
    }
    this._cb.renderCanvas();
  }

  private _onMouseMove(e: MouseEvent): void {
    const pos = this._canvasPos(e);
    this._hover = pos;

    // Update the native browser tooltip with the level name when hovering a level chamber tile.
    if (this._canvas) {
      const grid = this._cb.getEditGrid();
      const tile = pos ? (grid[pos.row]?.[pos.col] ?? null) : null;
      if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined) {
        const campaign = this._cb.getActiveCampaign();
        const chapter = campaign?.chapters[this._cb.getActiveChapterIdx()];
        const level = chapter?.levels[tile.levelIdx];
        this._canvas.title = level ? `${tile.levelIdx + 1}: ${level.name}` : `Level ${tile.levelIdx + 1}`;
      } else {
        this._canvas.title = '';
      }
    }

    if (this._paintDragActive && pos) {
      const grid = this._cb.getEditGrid();
      if ((grid[pos.row]?.[pos.col] ?? null) === null) {
        grid[pos.row][pos.col] = this._cb.buildTileDef();
      }
    } else if (this._rightEraseDragActive && pos) {
      const grid = this._cb.getEditGrid();
      if ((grid[pos.row]?.[pos.col] ?? null) !== null) {
        grid[pos.row][pos.col] = null;
        this._cb.clearFocusIfAt(pos);
      }
    } else if (this._dragState && pos) {
      const { startPos, currentPos } = this._dragState;
      if (pos.row !== currentPos.row || pos.col !== currentPos.col) {
        if (pos.row === startPos.row && pos.col === startPos.col) {
          this._dragState.currentPos = pos;
          this._dragState.moved = false;
        } else if ((this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null) === null) {
          this._dragState.currentPos = pos;
          this._dragState.moved = true;
        }
      }
    }
    this._cb.renderCanvas();
  }

  private _onRightClick(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    const pos = this._canvasPos(e);
    if (!pos) return;
    if ((this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null) !== null) sfxManager.play(SfxId.Delete);
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
    const tile = this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
    if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'level' || tile.levelIdx === undefined) return;
    const readOnly = this._cb.getActiveCampaign()?.official === true;
    this._cb.openLevelEditor(tile.levelIdx, readOnly);
  }

  private _onMouseLeave(chapter: ChapterDef): void {
    this._hover = null;
    if (this._dragState) this._dragState = null;
    if (this._paintDragActive) {
      this._paintDragActive = false;
      this._cb.recordSnapshot(chapter);
    }
    if (this._rightEraseDragActive) {
      this._rightEraseDragActive = false;
      this._cb.recordSnapshot(chapter);
    }
    this._cb.renderCanvas();
  }

  private _onWheel(e: WheelEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    e.preventDefault();
    const pos = this._canvasPos(e);
    if (!pos) return;
    const tile = this._cb.getEditGrid()[pos.row]?.[pos.col] ?? null;
    if (tile && PIPE_SHAPES.has(tile.shape)) {
      this._cb.rotateTileAt(pos, e.deltaY > 0, chapter, campaign);
    } else if (tile && (
      tile.shape === PipeShape.Source ||
      tile.shape === PipeShape.Sink ||
      (tile.shape === PipeShape.Chamber && tile.chamberContent === 'level')
    )) {
      this._cb.rotateSourceSinkAt(pos, e.deltaY > 0, chapter, campaign);
    } else if (PIPE_SHAPES.has(this._cb.getPalette() as PipeShape)) {
      this._cb.rotatePalette(e.deltaY > 0);
    }
  }
}
