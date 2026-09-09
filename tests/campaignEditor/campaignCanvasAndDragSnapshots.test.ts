/**
 * @jest-environment jsdom
 */

import type { CampaignDef, LevelDef, TileDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { TileParams, EditorPalette, EditorSnapshot } from '../../src/campaignEditor/types';
import * as editorRenderer from '../../src/campaignEditor/editorRenderer';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignEditor – canvas display size and _canvasPos calibration', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(), ellipse: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  /** Build a minimal LevelDef for the given grid dimensions. */
  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99900,
      name: 'Canvas Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  /** Create an editor with an active campaign containing one level. */
  function makeEditorWithCanvas(level: LevelDef) {
    const camp: CampaignDef = {
      id: 'cmp_canvas_test',
      name: 'Canvas Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Chapter 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as {
      _state: {
        rows: number;
        cols: number;
      };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _editorCanvas: HTMLCanvasElement | null;
      _editorInput: { canvasPos(e: MouseEvent): { row: number; col: number } | null } | null;
      _openLevelEditor(level: LevelDef, readOnly: boolean): void;
      _resizeGrid(rows: number, cols: number): void;
    };
    state._activeCampaignId = 'cmp_canvas_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    return state;
  }

  /** Create a synthetic MouseEvent at the given client coordinates. */
  function mouseAt(clientX: number, clientY: number): MouseEvent {
    return new MouseEvent('mousemove', { clientX, clientY });
  }

  it('canvas CSS size equals intrinsic size for small grids (no scaling needed)', () => {
    // 4×4 grid, no mainLayout → availW=512, tile size expands to 512/4=128 px
    // → intrinsic 512×512 px, within 512 px limit → scale = 1 → CSS 512×512 px
    const state = makeEditorWithCanvas(makeLevel(4, 4));
    const canvas = state._editorCanvas!;
    expect(canvas).not.toBeNull();
    expect(canvas.style.width).toBe('512px');
    expect(canvas.style.height).toBe('512px');
  });

  it('canvas CSS size is capped at MAX_EDITOR_CANVAS_PX for large grids', () => {
    // 10×10 grid → intrinsic 640×640 px → scale = 512/640 = 0.8 → CSS 512×512 px
    const state = makeEditorWithCanvas(makeLevel(10, 10));
    const canvas = state._editorCanvas!;
    expect(canvas).not.toBeNull();
    expect(canvas.style.width).toBe('512px');
    expect(canvas.style.height).toBe('512px');
  });

  it('canvas CSS size updates after _resizeGrid to a large grid', () => {
    // 4×4 grid → tile size 128px → CSS 512px (fills MAX_EDITOR_CANVAS_PX)
    const state = makeEditorWithCanvas(makeLevel(4, 4));
    expect(state._editorCanvas!.style.width).toBe('512px');
    // Grow to 10×10
    state._resizeGrid(10, 10);
    expect(state._editorCanvas!.style.width).toBe('512px');
    expect(state._editorCanvas!.style.height).toBe('512px');
  });

  it('canvas CSS size updates after _resizeGrid back to a small grid', () => {
    const state = makeEditorWithCanvas(makeLevel(10, 10));
    expect(state._editorCanvas!.style.width).toBe('512px');
    // Shrink back to 4×4 → tile size expands to 128px → CSS 512px
    state._resizeGrid(4, 4);
    expect(state._editorCanvas!.style.width).toBe('512px');
    expect(state._editorCanvas!.style.height).toBe('512px');
  });

  it('_canvasPos maps mouse coords using actual displayed tile size (CSS-scaled canvas)', () => {
    // 10×10 grid, intrinsic canvas 640×640, CSS-scaled to 512×512 px.
    // Displayed tile size = 512 / 10 = 51.2 px.
    const state = makeEditorWithCanvas(makeLevel(10, 10));
    const canvas = state._editorCanvas!;

    // Simulate getBoundingClientRect reflecting the CSS display size (512×512).
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 512, bottom: 512,
      width: 512, height: 512,
      x: 0, y: 0,
      toJSON: () => ({}),
    });

    // Column 5 starts at 5 * 51.2 = 256 px; its center is at ~281.6 px.
    // With the fixed formula (rect.width * col / editCols) this is tile col=5.
    const pos = state._editorInput!.canvasPos(mouseAt(281, 281));
    expect(pos).not.toBeNull();
    expect(pos!.col).toBe(5);
    expect(pos!.row).toBe(5);
  });

  it('_canvasPos returns null for mouse coordinates outside the canvas', () => {
    const state = makeEditorWithCanvas(makeLevel(4, 4));
    const canvas = state._editorCanvas!;

    canvas.getBoundingClientRect = () => ({
      left: 10, top: 10, right: 266, bottom: 266,
      width: 256, height: 256,
      x: 10, y: 10,
      toJSON: () => ({}),
    });

    // Mouse to the left of the canvas
    expect(state._editorInput!.canvasPos(mouseAt(5, 50))).toBeNull();
    // Mouse below the canvas
    expect(state._editorInput!.canvasPos(mouseAt(50, 280))).toBeNull();
  });

  // ─── Resize panel constraint: both dims cannot be <= 1 ──────────────────────

  /** Get the "↔ Resize" button and both number inputs from the grid-size panel. */
  function getResizeControls(panel: HTMLElement) {
    const inputs = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="number"]'));
    const rowsInp = inputs[0];
    const colsInp = inputs[1];
    const resizeBtn = Array.from(panel.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Resize'))!;
    const errorDiv = Array.from(panel.querySelectorAll('div'))
      .find((d) => d.style.color === 'rgb(255, 68, 68)')!;
    return { rowsInp, colsInp, resizeBtn, errorDiv };
  }

  it('resize to 1×1 is rejected and shows an error', () => {
    const state = makeEditorWithCanvas(makeLevel(4, 4)) as unknown as {
      _state: { rows: number; cols: number; };
      _metadataPanel: { buildGridSizePanel(): HTMLElement } | null;
    };
    const panel = state._metadataPanel!.buildGridSizePanel();
    const { rowsInp, colsInp, resizeBtn, errorDiv } = getResizeControls(panel);

    rowsInp.value = '1';
    colsInp.value = '1';
    resizeBtn.click();

    // Grid must not have changed.
    expect(state._state.rows).toBe(4);
    expect(state._state.cols).toBe(4);
    // Error message must be shown.
    expect(errorDiv.style.display).not.toBe('none');
    expect(errorDiv.textContent).toMatch(/dimension/i);
  });

  it('resize to 1×5 (one dim > 1) is accepted', () => {
    const state = makeEditorWithCanvas(makeLevel(4, 4)) as unknown as {
      _state: { rows: number; cols: number; };
      _metadataPanel: { buildGridSizePanel(): HTMLElement } | null;
    };
    const panel = state._metadataPanel!.buildGridSizePanel();
    const { rowsInp, colsInp, resizeBtn } = getResizeControls(panel);

    rowsInp.value = '1';
    colsInp.value = '5';
    resizeBtn.click();

    expect(state._state.rows).toBe(1);
    expect(state._state.cols).toBe(5);
  });

  it('resize to 5×1 (one dim > 1) is accepted', () => {
    const state = makeEditorWithCanvas(makeLevel(4, 4)) as unknown as {
      _state: { rows: number; cols: number; };
      _metadataPanel: { buildGridSizePanel(): HTMLElement } | null;
    };
    const panel = state._metadataPanel!.buildGridSizePanel();
    const { rowsInp, colsInp, resizeBtn } = getResizeControls(panel);

    rowsInp.value = '5';
    colsInp.value = '1';
    resizeBtn.click();

    expect(state._state.rows).toBe(5);
    expect(state._state.cols).toBe(1);
  });

  it('undo after resize restores the pre-resize grid dimensions', () => {
    const state = makeEditorWithCanvas(makeLevel(4, 4)) as unknown as {
      _state: { rows: number; cols: number; };
      _metadataPanel: { buildGridSizePanel(): HTMLElement } | null;
      _editorUndo(): void;
    };
    const panel = state._metadataPanel!.buildGridSizePanel();
    const { rowsInp, colsInp, resizeBtn } = getResizeControls(panel);

    // Resize from 4×4 to 6×8.
    rowsInp.value = '6';
    colsInp.value = '8';
    resizeBtn.click();
    expect(state._state.rows).toBe(6);
    expect(state._state.cols).toBe(8);

    // Undo should restore to the original 4×4.
    state._editorUndo();
    expect(state._state.rows).toBe(4);
    expect(state._state.cols).toBe(4);
  });
});

// ─── CampaignEditor – paint-drag undo snapshot timing ────────────────────────

describe('CampaignEditor – paint-drag undo snapshot is recorded on mouseup', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(), ellipse: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type EditorDragState = {
    _state: {
      rows: number;
      cols: number;
      grid: (TileDef | null)[][];
      palette: EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): EditorSnapshot;
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _editorInput: {
      paintDragActive: boolean;
      onMouseDown(e: MouseEvent): void;
      onMouseMove(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
      canvasPos(e: MouseEvent): { row: number; col: number } | null;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99910,
      name: 'Drag Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makeDragEditor(level: LevelDef): EditorDragState {
    const camp: CampaignDef = {
      id: 'cmp_drag_test',
      name: 'Drag Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as EditorDragState;
    state._activeCampaignId = 'cmp_drag_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    // Set up a stable bounding rect so _canvasPos works
    state._editorCanvas!.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 256, bottom: 256,
      width: 256, height: 256, x: 0, y: 0,
      toJSON: () => ({}),
    });
    return state;
  }

  function mouseEvent(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true });
  }

  it('does not record a new snapshot during paint-drag mousedown', () => {
    const state = makeDragEditor(makeLevel(4, 4));
    // _openLevelEditor records the initial snapshot, so history has exactly 1 entry.
    const historyLenBefore = state._state.historyLength;

    // Mousedown on empty cell with a repeatable palette tile starts a paint drag.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(mouseEvent('mousedown', 32, 32)); // row 0, col 0

    // Snapshot count must NOT have increased yet – drag is still in progress.
    expect(state._state.historyLength).toBe(historyLenBefore);
    expect(state._editorInput!.paintDragActive).toBe(true);
  });

  it('records a snapshot only on mouseup after a paint-drag', () => {
    const state = makeDragEditor(makeLevel(4, 4));
    const historyLenBefore = state._state.historyLength;

    state._state.palette = PipeShape.Straight;
    // Start drag
    state._editorInput!.onMouseDown(mouseEvent('mousedown', 32, 32)); // row 0, col 0
    // Extend drag to another cell
    state._editorInput!.onMouseMove(mouseEvent('mousemove', 96, 32)); // row 0, col 1
    // Release mouse
    state._editorInput!.onMouseUp(mouseEvent('mouseup', 96, 32));

    // Exactly one new snapshot should have been added, and drag is finished.
    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    expect(state._editorInput!.paintDragActive).toBe(false);
  });

  it('painted cells are present in the new snapshot, pre-drag state is the previous one', () => {
    const state = makeDragEditor(makeLevel(4, 4));
    // Capture the initial (pre-drag) snapshot content.
    const preDragSnapshot = JSON.stringify(state._state.historyEntryAt(state._state.historyIndex).grid);

    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(mouseEvent('mousedown', 32, 32));   // col 0
    state._editorInput!.onMouseMove(mouseEvent('mousemove', 96, 32)); // col 1
    state._editorInput!.onMouseUp(mouseEvent('mouseup', 96, 32));

    // The new snapshot records the post-drag state (cells painted).
    const postDragSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(postDragSnapshot.grid[0][0]).not.toBeNull();
    expect(postDragSnapshot.grid[0][1]).not.toBeNull();

    // The previous history entry is still the clean pre-drag state.
    const prevSnapshot = state._state.historyEntryAt(state._state.historyIndex - 1);
    expect(JSON.stringify(prevSnapshot.grid)).toBe(preDragSnapshot);
  });
});

// ─── CampaignEditor – right-drag erase undo snapshot timing ──────────────────

describe('CampaignEditor – right-drag erase snapshot is recorded on mouseup', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type EditorEraseState = {
    _state: {
      rows: number;
      cols: number;
      grid: (TileDef | null)[][];
      palette: EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): EditorSnapshot;
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _editorInput: {
      rightEraseDragActive: boolean;
      suppressNextContextMenu: boolean;
      onMouseDown(e: MouseEvent): void;
      onMouseMove(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
      canvasPos(e: MouseEvent): { row: number; col: number } | null;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99911,
      name: 'Erase Drag Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makeEraseEditor(level: LevelDef): EditorEraseState {
    const camp: CampaignDef = {
      id: 'cmp_erase_test',
      name: 'Erase Drag Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as EditorEraseState;
    state._activeCampaignId = 'cmp_erase_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    state._editorCanvas!.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 256, bottom: 256,
      width: 256, height: 256, x: 0, y: 0,
      toJSON: () => ({}),
    });
    return state;
  }

  function rightMouseEvent(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, button: 2, bubbles: true });
  }

  function leftMouseEvent(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true });
  }

  /** Seed the grid with straight-pipe tiles at the given cell positions. */
  function placeTiles(state: EditorEraseState, cells: { row: number; col: number }[]): void {
    for (const { row, col } of cells) {
      state._state.grid[row][col] = { shape: PipeShape.Straight, rotation: 0 };
    }
  }

  it('does not record a new snapshot during right-erase mousedown', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    placeTiles(state, [{ row: 0, col: 0 }]);
    const historyLenBefore = state._state.historyLength;

    state._editorInput!.onMouseDown(rightMouseEvent('mousedown', 32, 32)); // row 0, col 0

    // Snapshot count must NOT have increased yet – drag is still in progress.
    expect(state._state.historyLength).toBe(historyLenBefore);
    expect(state._editorInput!.rightEraseDragActive).toBe(true);
    // But the cell should already be erased.
    expect(state._state.grid[0][0]).toBeNull();
  });

  it('records a snapshot only on right mouseup after a right-drag-erase', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    placeTiles(state, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    const historyLenBefore = state._state.historyLength;

    state._editorInput!.onMouseDown(rightMouseEvent('mousedown', 32, 32)); // row 0, col 0
    state._editorInput!.onMouseMove(rightMouseEvent('mousemove', 96, 32)); // row 0, col 1
    state._editorInput!.onMouseUp(rightMouseEvent('mouseup', 96, 32));

    // Exactly one new snapshot should have been added, and drag is finished.
    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    expect(state._editorInput!.rightEraseDragActive).toBe(false);
  });

  it('erased cells are absent in the new snapshot, pre-drag state is the previous one', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    placeTiles(state, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    // Snapshot the pre-drag state.
    const preDragSnapshot = JSON.stringify(state._state.historyEntryAt(state._state.historyIndex).grid);

    state._editorInput!.onMouseDown(rightMouseEvent('mousedown', 32, 32));   // col 0
    state._editorInput!.onMouseMove(rightMouseEvent('mousemove', 96, 32)); // col 1
    state._editorInput!.onMouseUp(rightMouseEvent('mouseup', 96, 32));

    // The new snapshot records the post-erase state.
    const postEraseSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(postEraseSnapshot.grid[0][0]).toBeNull();
    expect(postEraseSnapshot.grid[0][1]).toBeNull();

    // The previous history entry is still the pre-erase state.
    const prevSnapshot = state._state.historyEntryAt(state._state.historyIndex - 1);
    expect(JSON.stringify(prevSnapshot.grid)).toBe(preDragSnapshot);
  });

  it('sets _suppressNextContextMenu after right mouseup to prevent double-erase', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    placeTiles(state, [{ row: 0, col: 0 }]);

    state._editorInput!.onMouseDown(rightMouseEvent('mousedown', 32, 32));
    expect(state._editorInput!.suppressNextContextMenu).toBe(false);
    state._editorInput!.onMouseUp(rightMouseEvent('mouseup', 32, 32));
    expect(state._editorInput!.suppressNextContextMenu).toBe(true);
  });

  it('right-drag does not erase cells that are already empty', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    // Only place a tile at col 0; col 1 stays empty.
    placeTiles(state, [{ row: 0, col: 0 }]);

    state._editorInput!.onMouseDown(rightMouseEvent('mousedown', 32, 32));
    // Move to an already-empty cell – should not cause errors.
    state._editorInput!.onMouseMove(rightMouseEvent('mousemove', 96, 32)); // row 0, col 1
    state._editorInput!.onMouseUp(rightMouseEvent('mouseup', 96, 32));

    expect(state._state.grid[0][0]).toBeNull(); // erased
    expect(state._state.grid[0][1]).toBeNull(); // was already null
  });

  it('left-button paint-drag still works normally alongside right-drag state', () => {
    const state = makeEraseEditor(makeLevel(4, 4));
    const historyLenBefore = state._state.historyLength;

    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0
    state._editorInput!.onMouseMove(leftMouseEvent('mousemove', 96, 32)); // row 0, col 1
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 96, 32));

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    expect(state._state.grid[0][0]).not.toBeNull();
    expect(state._state.grid[0][1]).not.toBeNull();
    expect(state._editorInput!.rightEraseDragActive).toBe(false);
  });
});

// ─── CampaignEditor – single-click placement undo snapshot timing ─────────────

describe('CampaignEditor – single-click placement snapshot is recorded after placement', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type EditorPlaceState = {
    _state: {
      rows: number;
      cols: number;
      grid: (TileDef | null)[][];
      palette: EditorPalette;
      params: TileParams;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): EditorSnapshot;
      _linkedTilePos: { row: number; col: number } | null;
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _editorInput: {
      onMouseDown(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
      onMouseMove(e: MouseEvent): void;
      canvasPos(e: MouseEvent): { row: number; col: number } | null;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99913,
      name: 'Placement Snapshot Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makePlaceEditor(level: LevelDef): EditorPlaceState {
    const camp: CampaignDef = {
      id: 'cmp_place_test',
      name: 'Placement Snapshot Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as EditorPlaceState;
    state._activeCampaignId = 'cmp_place_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    state._editorCanvas!.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 256, bottom: 256,
      width: 256, height: 256, x: 0, y: 0,
      toJSON: () => ({}),
    });
    return state;
  }

  function leftMouseEvent(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, button: 0, bubbles: true });
  }

  function ctrlLeftMouseEvent(type: string, clientX: number, clientY: number): MouseEvent {
    return new MouseEvent(type, { clientX, clientY, button: 0, ctrlKey: true, bubbles: true });
  }

  it('placed container tile IS present in the new snapshot', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    const historyLenBefore = state._state.historyLength;

    // Place a container tile (Chamber with chamberContent='item') by single-click on empty cell.
    state._state.palette = 'chamber:item' as EditorPalette;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0

    // Exactly one new snapshot should have been added.
    expect(state._state.historyLength).toBe(historyLenBefore + 1);

    // The new snapshot must include the placed container tile.
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]).not.toBeNull();
    expect(newSnapshot.grid[0][0]?.shape).toBe(PipeShape.Chamber);
    expect(newSnapshot.grid[0][0]?.chamberContent).toBe('item');
  });

  it('placed non-repeatable tile (Sink) IS present in the new snapshot', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    const historyLenBefore = state._state.historyLength;

    state._state.palette = PipeShape.Sink;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]?.shape).toBe(PipeShape.Sink);
  });

  it('erased tile IS absent in the new snapshot (single-click erase on occupied cell)', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    // Seed a tile to erase.
    state._state.grid[0][0] = { shape: PipeShape.Straight, rotation: 0 };
    const historyLenBefore = state._state.historyLength;

    state._state.palette = 'erase';
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]).toBeNull();
  });

  it('previous snapshot is the pre-placement state when a container is placed', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    // Capture the pre-placement state from history.
    const prePlacementSnapshot = JSON.stringify(state._state.historyEntryAt(state._state.historyIndex).grid);

    state._state.palette = 'chamber:item' as EditorPalette;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));

    // The snapshot before the latest must still reflect the empty pre-placement grid.
    const prevSnapshot = state._state.historyEntryAt(state._state.historyIndex - 1);
    expect(JSON.stringify(prevSnapshot.grid)).toBe(prePlacementSnapshot);
    // And the placed tile should NOT be in that previous snapshot.
    expect(prevSnapshot.grid[0][0]).toBeNull();
  });

  it('ctrl+click overwrite: new tile IS present in the snapshot after overwrite', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    // Seed an Elbow tile at (0,0).
    state._state.grid[0][0] = { shape: PipeShape.Elbow, rotation: 0 };
    const historyLenBefore = state._state.historyLength;

    // Mousedown registers a drag-state (tile exists), then ctrl+mouseup overwrites.
    state._state.palette = PipeShape.Tee;
    state._editorInput!.onMouseDown(ctrlLeftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(ctrlLeftMouseEvent('mouseup', 32, 32));

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]?.shape).toBe(PipeShape.Tee);
  });

  it('drag pickup binds Tile Params to grabbed chamber tile', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    state._state.grid[0][0] = {
      shape: PipeShape.Chamber,
      chamberContent: 'item',
      itemCount: 3,
      rotation: 180,
    };
    state._state.palette = PipeShape.Straight;
    state._state._linkedTilePos = null;

    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));

    expect(state._state.palette).toBe('chamber:item');
    expect(state._state.params.itemCount).toBe(3);
    expect(state._state.params.rotation).toBe(180);
    expect(state._state._linkedTilePos).toEqual({ row: 0, col: 0 });
  });

  it('drag pickup with ctrl held does not rebind palette/params', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    state._state.grid[0][0] = { shape: PipeShape.Chamber, chamberContent: 'tank', capacity: 9 };
    state._state.palette = PipeShape.Tee;
    state._state.params.capacity = 1;
    state._state._linkedTilePos = null;

    state._editorInput!.onMouseDown(ctrlLeftMouseEvent('mousedown', 32, 32));

    expect(state._state.palette).toBe(PipeShape.Tee);
    expect(state._state.params.capacity).toBe(1);
    expect(state._state._linkedTilePos).toBeNull();
  });

  it('drag-move keeps linked tile position synced to destination for chamber tiles', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    state._state.grid[0][0] = { shape: PipeShape.Chamber, chamberContent: 'tank', capacity: 7 };
    state._state.palette = PipeShape.Straight;

    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseMove(leftMouseEvent('mousemove', 96, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 96, 32));

    expect(state._state._linkedTilePos).toEqual({ row: 0, col: 1 });
  });

  it('click on placed pipe rotates it clockwise', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    // Seed an Elbow tile at (0,0) with rotation 0.
    state._state.grid[0][0] = { shape: PipeShape.Elbow, rotation: 0 };
    const historyLenBefore = state._state.historyLength;

    // Click on the occupied pipe tile (no ctrl, no shift) → should rotate CW.
    state._state.palette = PipeShape.Cross;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]?.shape).toBe(PipeShape.Elbow);
    expect(newSnapshot.grid[0][0]?.rotation).toBe(90);
  });

  it('drag-move: moved tile IS present at the destination in the snapshot', () => {
    const state = makePlaceEditor(makeLevel(4, 4));
    // Seed a tile at (0,0).
    state._state.grid[0][0] = { shape: PipeShape.Straight, rotation: 0 };
    const historyLenBefore = state._state.historyLength;

    // Mousedown grabs the tile; mousemove to (0,1); mouseup commits.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));  // row 0, col 0
    state._editorInput!.onMouseMove(leftMouseEvent('mousemove', 96, 32));  // row 0, col 1
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 96, 32));

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    // Tile moved from (0,0) to (0,1).
    expect(newSnapshot.grid[0][0]).toBeNull();
    expect(newSnapshot.grid[0][1]?.shape).toBe(PipeShape.Straight);
  });

  it('renders linked-tile highlight at drag destination while dragging linked tiles', () => {
    const renderSpy = jest.spyOn(editorRenderer, 'renderEditorCanvas');
    const state = makePlaceEditor(makeLevel(4, 4));
    state._state.grid[0][0] = { shape: PipeShape.Chamber, chamberContent: 'item' };
    state._state._linkedTilePos = { row: 0, col: 0 };

    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseMove(leftMouseEvent('mousemove', 96, 32));

    expect(renderSpy).toHaveBeenCalled();
    const lastCall = renderSpy.mock.calls[renderSpy.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
    expect(lastCall?.[5]).toMatchObject({ toPos: { row: 0, col: 1 } });
    expect(lastCall?.[6]).toEqual({ row: 0, col: 1 });

    renderSpy.mockRestore();
  });
});

// ─── CampaignEditor – context-menu (right-click) erase snapshot timing ────────

describe('CampaignEditor – context-menu right-click erase snapshot is recorded after mutation', () => {
  const MOCK_CTX = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: jest.fn(), strokeRect: jest.fn(), clearRect: jest.fn(),
    beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(),
    stroke: jest.fn(), fill: jest.fn(), arc: jest.fn(),
    translate: jest.fn(), rotate: jest.fn(), restore: jest.fn(), save: jest.fn(),
    scale: jest.fn(), setTransform: jest.fn(), drawImage: jest.fn(),
    closePath: jest.fn(), clip: jest.fn(), rect: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    fillText: jest.fn(), strokeText: jest.fn(),
    createLinearGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
    createRadialGradient: jest.fn(() => ({ addColorStop: jest.fn() })),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => MOCK_CTX,
      configurable: true,
    });
  });

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type EditorRightClickState = {
    _state: {
      rows: number;
      cols: number;
      grid: (TileDef | null)[][];
      palette: EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): EditorSnapshot;
      recordSnapshot(): void;
      undo(): boolean;
      redo(): boolean;
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _editorInput: {
      onRightClick(e: MouseEvent): void;
      canvasPos(e: MouseEvent): { row: number; col: number } | null;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99914,
      name: 'RightClick Snapshot Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makeRightClickEditor(level: LevelDef): EditorRightClickState {
    const camp: CampaignDef = {
      id: 'cmp_rc_test',
      name: 'RightClick Snapshot Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as EditorRightClickState;
    state._activeCampaignId = 'cmp_rc_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    state._editorCanvas!.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 256, bottom: 256,
      width: 256, height: 256, x: 0, y: 0,
      toJSON: () => ({}),
    });
    return state;
  }

  function rightClickEvent(clientX: number, clientY: number): MouseEvent {
    return new MouseEvent('contextmenu', { clientX, clientY, button: 2, bubbles: true });
  }

  it('erased tile IS absent in the snapshot after right-click', () => {
    const state = makeRightClickEditor(makeLevel(4, 4));
    state._state.grid[0][0] = { shape: PipeShape.Straight, rotation: 0 };
    const historyLenBefore = state._state.historyLength;

    state._editorInput!.onRightClick(rightClickEvent(32, 32)); // row 0, col 0

    // Exactly one new snapshot should have been added.
    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    // The new snapshot must record the erased (post-mutation) state.
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]).toBeNull();
  });

  it('previous snapshot retains the pre-erase tile', () => {
    const state = makeRightClickEditor(makeLevel(4, 4));
    // Seed a tile and record a snapshot to simulate a prior placement action.
    state._state.grid[0][0] = { shape: PipeShape.Straight, rotation: 0 };
    state._state.recordSnapshot();

    state._editorInput!.onRightClick(rightClickEvent(32, 32));

    // The snapshot one step back must still contain the original tile.
    const prevSnapshot = state._state.historyEntryAt(state._state.historyIndex - 1);
    expect(prevSnapshot.grid[0][0]?.shape).toBe(PipeShape.Straight);
  });

  it('redo after undo restores the erased state', () => {
    const state = makeRightClickEditor(makeLevel(4, 4));
    // Seed a tile and record a snapshot to simulate a prior placement action.
    state._state.grid[0][0] = { shape: PipeShape.Elbow, rotation: 0 };
    state._state.recordSnapshot();

    // Right-click to erase.
    state._editorInput!.onRightClick(rightClickEvent(32, 32));
    expect(state._state.grid[0][0]).toBeNull();

    // Undo: tile should come back.
    state._state.undo();
    expect(state._state.grid[0][0]?.shape).toBe(PipeShape.Elbow);

    // Redo: tile should be erased again.
    state._state.redo();
    expect(state._state.grid[0][0]).toBeNull();
  });

  it('right-clicking an empty cell is a no-op (no snapshot, no mutation)', () => {
    const state = makeRightClickEditor(makeLevel(4, 4));
    const historyLenBefore = state._state.historyLength;

    state._editorInput!.onRightClick(rightClickEvent(32, 32)); // row 0, col 0 is already empty

    expect(state._state.historyLength).toBe(historyLenBefore);
    expect(state._state.grid[0][0]).toBeNull();
  });
});

// ─── CampaignEditor – Source tile placement constraint ────────────────────────

