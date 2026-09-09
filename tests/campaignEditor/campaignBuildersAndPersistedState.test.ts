/**
 * @jest-environment jsdom
 */

import type { CampaignDef, LevelDef, TileDef, InventoryItem } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { TileParams, EditorPalette } from '../../src/campaignEditor/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignEditor – _buildTileDef omits rotation for non-rotatable shapes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function editorBuildTileDef(palette: PipeShape | string): TileDef {
    const editor = makeEditor();
    const state = editor as unknown as {
      _state: {
        params: TileParams;
        palette: PipeShape | string;
        buildTileDef(): TileDef;
      };
    };
    state._state.params.rotation = 90; // non-zero rotation to detect if it leaks
    state._state.palette = palette;
    return state._state.buildTileDef();
  }

  it('GoldSpace _buildTileDef does not include rotation field', () => {
    const def = editorBuildTileDef(PipeShape.GoldSpace);
    expect(def.shape).toBe(PipeShape.GoldSpace);
    expect('rotation' in def).toBe(false);
  });

  it('Granite _buildTileDef does not include rotation field', () => {
    const def = editorBuildTileDef(PipeShape.Granite);
    expect(def.shape).toBe(PipeShape.Granite);
    expect('rotation' in def).toBe(false);
  });

  it('Tree _buildTileDef does not include rotation field', () => {
    const def = editorBuildTileDef(PipeShape.Tree);
    expect(def.shape).toBe(PipeShape.Tree);
    expect('rotation' in def).toBe(false);
  });
});

// ─── _buildCurrentLevelDef: strips unsupported fields from tiles ──────────────

describe('CampaignEditor – _buildCurrentLevelDef strips unsupported tile fields', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function makeEditorWithGrid(grid: (TileDef | null)[][]): {
    buildCurrentLevelDef(): LevelDef;
  } {
    const userCampaign: CampaignDef = {
      id: 'cmp_strip_test',
      name: 'Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch1', levels: [{ id: 1, name: 'L1', rows: 1, cols: grid[0].length, grid, inventory: [] }] }],
    };
    const editor = makeEditor([userCampaign]);
    const state = editor as unknown as {
      _state: {
        levelName: string;
        levelNote: string;
        levelHints: string[];
        rows: number;
        cols: number;
        grid: (TileDef | null)[][];
        inventory: InventoryItem[];
      };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _buildCurrentLevelDef(): LevelDef;
    };
    state._activeCampaignId = 'cmp_strip_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'L1';
    state._state.levelNote = '';
    state._state.levelHints = [];
    state._state.rows = 1;
    state._state.cols = grid[0].length;
    state._state.grid = grid;
    state._state.inventory = [];
    return { buildCurrentLevelDef: () => state._buildCurrentLevelDef() };
  }

  it('strips rotation from GoldSpace tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.GoldSpace };
    (tile as unknown as Record<string, unknown>)['rotation'] = 0;
    const editor = makeEditorWithGrid([[tile]]);
    const def = editor.buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('strips rotation from Granite tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Granite };
    (tile as unknown as Record<string, unknown>)['rotation'] = 90;
    const editor = makeEditorWithGrid([[tile]]);
    const def = editor.buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('strips rotation from Tree tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Tree };
    (tile as unknown as Record<string, unknown>)['rotation'] = 90;
    const editor = makeEditorWithGrid([[tile]]);
    const def = editor.buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('preserves rotation on Straight tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Straight, rotation: 90 };
    const editor = makeEditorWithGrid([[tile]]);
    const def = editor.buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect((savedTile as TileDef).rotation).toBe(90);
  });
});

// ─── Campaign editor palette: "Blocks" section label ─────────────────────────

describe('CampaignEditor palette – Blocks section label', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('palette has a "Blocks" toggle button, not "Chamber"', () => {
    const editor = makeEditor();
    const state = editor as unknown as {
      _paramsPanel: { chamberSectionExpanded: boolean; buildPalette(): HTMLElement };
    };
    state._paramsPanel.chamberSectionExpanded = false;
    const panel = state._paramsPanel.buildPalette();
    const buttons = Array.from(panel.querySelectorAll('button'));
    const blocksBtn = buttons.find(b => b.textContent?.includes('Blocks'));
    const chamberBtn = buttons.find(b => b.textContent?.includes('Chamber'));
    expect(blocksBtn).not.toBeUndefined();
    expect(chamberBtn).toBeUndefined();
  });
});

// ─── CampaignEditor – save then undo/redo triggers unsaved-changes dialog ─────

describe('CampaignEditor – save then undo/redo marks unsaved changes', () => {
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

  type SaveUndoState = {
    _state: {
      rows: number;
      cols: number;
      grid: (TileDef | null)[][];
      palette: EditorPalette;
      hasUnsavedChanges: boolean;
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _service: { campaigns: readonly CampaignDef[] };
    _editorInput: {
      onMouseDown(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
      canvasPos(e: MouseEvent): { row: number; col: number } | null;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
    _editorUndo(): void;
    _editorRedo(): void;
    _saveLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99920,
      name: 'Save Undo Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makeSaveUndoEditor(level: LevelDef): SaveUndoState {
    const camp: CampaignDef = {
      id: 'cmp_save_undo_test',
      name: 'Save Undo Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as SaveUndoState;
    state._activeCampaignId = 'cmp_save_undo_test';
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

  it('_editorUnsavedChanges is false after opening the editor (no changes)', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    expect(state._state.hasUnsavedChanges).toBe(false);
  });

  it('_editorUnsavedChanges is true after making a change', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    expect(state._state.hasUnsavedChanges).toBe(true);
  });

  it('_editorUnsavedChanges is false after saving', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    // Make a change then save.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_save_undo_test')!;
    state._saveLevel(campaign, 0, 0);
    expect(state._state.hasUnsavedChanges).toBe(false);
  });

  it('_editorUnsavedChanges is true after save then undo', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    // Make a change.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    // Save.
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_save_undo_test')!;
    state._saveLevel(campaign, 0, 0);
    expect(state._state.hasUnsavedChanges).toBe(false);
    // Undo: now differs from saved state.
    state._editorUndo();
    expect(state._state.hasUnsavedChanges).toBe(true);
  });

  it('_editorUnsavedChanges is true after save then redo', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    // Make two changes.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 96, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 96, 32));
    // Undo once to move away from the latest change.
    state._editorUndo();
    // Save at this intermediate state.
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_save_undo_test')!;
    state._saveLevel(campaign, 0, 0);
    expect(state._state.hasUnsavedChanges).toBe(false);
    // Redo: now differs from saved state.
    state._editorRedo();
    expect(state._state.hasUnsavedChanges).toBe(true);
  });

  it('_editorUnsavedChanges returns to false after redo brings state back to saved index', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    // Make a change.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    // Save.
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_save_undo_test')!;
    state._saveLevel(campaign, 0, 0);
    // Undo (moves away from saved).
    state._editorUndo();
    expect(state._state.hasUnsavedChanges).toBe(true);
    // Redo (comes back to saved state).
    state._editorRedo();
    expect(state._state.hasUnsavedChanges).toBe(false);
  });

  it('back button shows unsaved-changes modal after save then undo', () => {
    const state = makeSaveUndoEditor(makeLevel(4, 4));
    // Make a change then save.
    state._state.palette = PipeShape.Straight;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(leftMouseEvent('mouseup', 32, 32));
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_save_undo_test')!;
    state._saveLevel(campaign, 0, 0);
    // Undo: differs from saved state.
    state._editorUndo();
    // Click the back button – the unsaved-changes modal should appear.
    const backBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('← Back'));
    expect(backBtn).toBeDefined();
    backBtn!.click();
    // The unsaved-changes modal must be visible – it contains Save and Discard buttons.
    const allBtns = Array.from(document.querySelectorAll('button'));
    const discardBtn = allBtns.find(b => b.textContent?.toLowerCase().includes('discard'));
    expect(discardBtn).toBeDefined();
  });
});

// ─── CampaignEditor – palette section state retained between editor sessions ──

describe('CampaignEditor – palette section expanded state is retained between editor sessions', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type PaletteState = {
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _paramsPanel: {
      goldSectionExpanded: boolean;
      chamberSectionExpanded: boolean;
      pipesSectionExpanded: boolean;
      floorSectionExpanded: boolean;
    };
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(id: number): LevelDef {
    return {
      id,
      name: `Level ${id}`,
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
  }

  it('section states start as false when the editor is first opened', () => {
    const level = makeLevel(99931);
    const camp: CampaignDef = {
      id: 'cmp_pal_test',
      name: 'Palette Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as PaletteState;
    state._activeCampaignId = 'cmp_pal_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);

    expect(state._paramsPanel.goldSectionExpanded).toBe(false);
    expect(state._paramsPanel.chamberSectionExpanded).toBe(false);
    expect(state._paramsPanel.pipesSectionExpanded).toBe(false);
    expect(state._paramsPanel.floorSectionExpanded).toBe(false);
  });

  it('manually set section states are preserved when re-opening the level editor', () => {
    const level = makeLevel(99932);
    const camp: CampaignDef = {
      id: 'cmp_pal_retain',
      name: 'Palette Retain Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as PaletteState;
    state._activeCampaignId = 'cmp_pal_retain';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;

    // First session: open editor and expand all sections.
    state._openLevelEditor(level, false);
    state._paramsPanel.goldSectionExpanded = true;
    state._paramsPanel.chamberSectionExpanded = true;
    state._paramsPanel.pipesSectionExpanded = true;
    state._paramsPanel.floorSectionExpanded = true;

    // Second session: re-open the same (or any) level.
    state._openLevelEditor(level, false);

    // All section states must still be expanded.
    expect(state._paramsPanel.goldSectionExpanded).toBe(true);
    expect(state._paramsPanel.chamberSectionExpanded).toBe(true);
    expect(state._paramsPanel.pipesSectionExpanded).toBe(true);
    expect(state._paramsPanel.floorSectionExpanded).toBe(true);
  });

  it('only the expanded sections remain expanded; collapsed ones stay collapsed', () => {
    const level = makeLevel(99933);
    const camp: CampaignDef = {
      id: 'cmp_pal_mixed',
      name: 'Palette Mixed Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as PaletteState;
    state._activeCampaignId = 'cmp_pal_mixed';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;

    // First session: expand only gold and pipes.
    state._openLevelEditor(level, false);
    state._paramsPanel.goldSectionExpanded = true;
    state._paramsPanel.pipesSectionExpanded = true;
    // chamber and floor remain false.

    // Second session: re-open.
    state._openLevelEditor(level, false);

    expect(state._paramsPanel.goldSectionExpanded).toBe(true);
    expect(state._paramsPanel.pipesSectionExpanded).toBe(true);
    expect(state._paramsPanel.chamberSectionExpanded).toBe(false);
    expect(state._paramsPanel.floorSectionExpanded).toBe(false);
  });
});

// ─── CampaignEditor – Ctrl+Z/Y on campaign map screen ────────────────────────

