/**
 * @jest-environment jsdom
 */

import type { CampaignDef, TileDef, ChapterDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { EditorPalette } from '../../src/campaignEditor/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignEditor – Ctrl+Z/Y undo/redo on campaign map screen', () => {
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

  type CampaignMapState = {
    _el: HTMLElement;
    _screen: string;
    _activeCampaignId: string | null;
    _campaignMapEditor: {
      handleCampaignEditorKeyDown(e: KeyboardEvent): void;
      _hist: { canUndo: boolean; canRedo: boolean };
      _gridState: { grid: (TileDef | null)[][] };
      _recordSnapshot(campaign: CampaignDef): void;
    };
    _showCampaignDetail(): void;
    _service: { campaigns: readonly CampaignDef[] };
  };

  function setupCampaignMapEditor(): CampaignMapState {
    const campaign: CampaignDef = {
      id: 'cmp_kd_test',
      name: 'Keydown Test',
      author: 'Tester',
      rows: 2,
      cols: 2,
      grid: [[null, null], [null, null]],
      chapters: [],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    const state = editor as unknown as CampaignMapState;
    state._activeCampaignId = 'cmp_kd_test';
    state._showCampaignDetail();
    state._el.style.display = 'flex';
    return state;
  }

  it('Ctrl+Z on campaign screen triggers undo', () => {
    const state = setupCampaignMapEditor();
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_kd_test')!;

    // Place a tile and record a snapshot to give undo history
    state._campaignMapEditor._gridState.grid[0][0] = { shape: PipeShape.Granite };
    state._campaignMapEditor._recordSnapshot(campaign);

    expect(state._campaignMapEditor._hist.canUndo).toBe(true);

    // Dispatch Ctrl+Z via the handler directly
    state._campaignMapEditor.handleCampaignEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );

    // After undo, the tile should be removed
    expect(state._campaignMapEditor._gridState.grid[0][0]).toBeNull();
  });

  it('Ctrl+Y on campaign screen triggers redo after undo', () => {
    const state = setupCampaignMapEditor();
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_kd_test')!;

    // Place a tile and record a snapshot
    state._campaignMapEditor._gridState.grid[0][0] = { shape: PipeShape.Granite };
    state._campaignMapEditor._recordSnapshot(campaign);

    // Undo via Ctrl+Z
    state._campaignMapEditor.handleCampaignEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    expect(state._campaignMapEditor._gridState.grid[0][0]).toBeNull();

    // Redo via Ctrl+Y
    state._campaignMapEditor.handleCampaignEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }),
    );
    expect(state._campaignMapEditor._gridState.grid[0][0]?.shape).toBe(PipeShape.Granite);
  });

  it('other Ctrl+key combinations are ignored by the campaign map handler', () => {
    const state = setupCampaignMapEditor();
    // Should not throw
    expect(() => {
      state._campaignMapEditor.handleCampaignEditorKeyDown(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
      );
    }).not.toThrow();
  });
});

describe('CampaignEditor – campaign map editor pan-drag precedence', () => {
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

  it('Shift+left-drag pans an oversized campaign map without starting tile-drag', () => {
    const bigRows = 20;
    const bigCols = 20;
    const grid = Array.from({ length: bigRows }, () => Array.from({ length: bigCols }, () => null as TileDef | null));
    grid[0][0] = { shape: PipeShape.Source };
    const campaign: CampaignDef = {
      id: 'cmp_pan_priority',
      name: 'Pan Priority',
      author: 'Tester',
      rows: bigRows,
      cols: bigCols,
      grid,
      chapters: [{ id: 1, name: 'Chapter 1', levels: [] }],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    const state = editor as unknown as {
      _el: HTMLElement;
      _activeCampaignId: string | null;
      _showCampaignDetail(): void;
      _campaignMapEditor: {
        _dragState: unknown;
        _panPixelX: number;
      };
    };
    state._activeCampaignId = 'cmp_pan_priority';
    state._showCampaignDetail();
    state._el.style.display = 'flex';

    const canvas = document.querySelector<HTMLCanvasElement>('#campaign-map-editor-section canvas');
    expect(canvas).toBeTruthy();
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: canvas!.width || 768,
        height: canvas!.height || 576,
        right: canvas!.width || 768,
        bottom: canvas!.height || 576,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      configurable: true,
    });

    // Shift+left-down: pan candidate starts immediately, no tile-drag state.
    canvas!.dispatchEvent(new MouseEvent('mousedown', { button: 0, shiftKey: true, clientX: 10, clientY: 10, bubbles: true }));
    expect(state._campaignMapEditor._dragState).toBeNull();
    canvas!.dispatchEvent(new MouseEvent('mousemove', { buttons: 1, shiftKey: true, clientX: -80, clientY: 10, bubbles: true }));

    expect(state._campaignMapEditor._dragState).toBeNull();
    expect(state._campaignMapEditor._panPixelX).toBeGreaterThan(0);
  });
});

describe('CampaignEditor – tree overwrite on map editors', () => {
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

  function mockCanvasRect(canvas: HTMLCanvasElement): void {
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: canvas.width || 768,
        height: canvas.height || 576,
        right: canvas.width || 768,
        bottom: canvas.height || 576,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      configurable: true,
    });
  }

  it('campaign map editor allows placing one tree variant over another', () => {
    const campaign: CampaignDef = {
      id: 'cmp_tree_overwrite',
      name: 'Tree Overwrite Campaign',
      author: 'Tester',
      rows: 2,
      cols: 2,
      grid: [[null, null], [null, null]],
      chapters: [],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    const state = editor as unknown as {
      _el: HTMLElement;
      _activeCampaignId: string | null;
      _showCampaignDetail(): void;
      _campaignMapEditor: {
        _palette: EditorPalette;
        _gridState: { grid: (TileDef | null)[][] };
      };
    };
    state._activeCampaignId = 'cmp_tree_overwrite';
    state._showCampaignDetail();
    state._el.style.display = 'flex';

    const canvas = document.querySelector<HTMLCanvasElement>('#campaign-map-editor-section canvas');
    expect(canvas).toBeTruthy();
    mockCanvasRect(canvas!);

    state._campaignMapEditor._gridState.grid[0][0] = { shape: PipeShape.Tree };
    state._campaignMapEditor._palette = PipeShape.Tree4;

    canvas!.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

    expect(state._campaignMapEditor._gridState.grid[0][0]?.shape).toBe(PipeShape.Tree4);
  });

  it('chapter map editor allows placing one tree variant over another', () => {
    const campaign: CampaignDef = {
      id: 'cmp_ch_tree_overwrite',
      name: 'Chapter Tree Overwrite Campaign',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        rows: 2,
        cols: 2,
        grid: [[null, null], [null, null]],
        levels: [],
      }],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    const state = editor as unknown as {
      _el: HTMLElement;
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _showChapterDetail(chapterIdx: number): void;
      _chapterMapEditor: {
        _palette: EditorPalette;
        _gridState: { grid: (TileDef | null)[][] };
      };
    };
    state._activeCampaignId = 'cmp_ch_tree_overwrite';
    state._activeChapterIdx = 0;
    state._showChapterDetail(0);
    state._el.style.display = 'flex';

    const canvas = document.querySelector<HTMLCanvasElement>('#chapter-map-editor-section canvas');
    expect(canvas).toBeTruthy();
    mockCanvasRect(canvas!);

    state._chapterMapEditor._gridState.grid[0][0] = { shape: PipeShape.Tree3 };
    state._chapterMapEditor._palette = PipeShape.Tree2;

    canvas!.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));

    expect(state._chapterMapEditor._gridState.grid[0][0]?.shape).toBe(PipeShape.Tree2);
  });
});

// ─── CampaignEditor – Ctrl+Z/Y on chapter map screen ─────────────────────────

describe('CampaignEditor – Ctrl+Z/Y undo/redo on chapter map screen', () => {
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

  type ChapterMapState = {
    _el: HTMLElement;
    _screen: string;
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _chapterMapEditor: {
      handleChapterEditorKeyDown(e: KeyboardEvent): void;
      _chapterHist: { canUndo: boolean; canRedo: boolean };
      _gridState: { grid: (TileDef | null)[][] };
      _recordChapterSnapshot(chapter: ChapterDef): void;
    };
    _showChapterDetail(chapterIdx: number): void;
    _service: { campaigns: readonly CampaignDef[] };
  };

  function setupChapterMapEditor(): ChapterMapState {
    const campaign: CampaignDef = {
      id: 'cmp_ch_kd_test',
      name: 'Chapter Keydown Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        rows: 2,
        cols: 2,
        grid: [[null, null], [null, null]],
        levels: [],
      }],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    const state = editor as unknown as ChapterMapState;
    state._activeCampaignId = 'cmp_ch_kd_test';
    state._activeChapterIdx = 0;
    state._showChapterDetail(0);
    state._el.style.display = 'flex';
    return state;
  }

  it('Ctrl+Z on chapter screen triggers undo', () => {
    const state = setupChapterMapEditor();
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_ch_kd_test')!;
    const chapter = campaign.chapters[0];

    // Place a tile and record a snapshot to give undo history
    state._chapterMapEditor._gridState.grid[0][0] = { shape: PipeShape.Granite };
    state._chapterMapEditor._recordChapterSnapshot(chapter);

    expect(state._chapterMapEditor._chapterHist.canUndo).toBe(true);

    state._chapterMapEditor.handleChapterEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );

    expect(state._chapterMapEditor._gridState.grid[0][0]).toBeNull();
  });

  it('Ctrl+Y on chapter screen triggers redo after undo', () => {
    const state = setupChapterMapEditor();
    const campaign = state._service.campaigns.find(c => c.id === 'cmp_ch_kd_test')!;
    const chapter = campaign.chapters[0];

    state._chapterMapEditor._gridState.grid[0][0] = { shape: PipeShape.Granite };
    state._chapterMapEditor._recordChapterSnapshot(chapter);

    // Undo
    state._chapterMapEditor.handleChapterEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    );
    expect(state._chapterMapEditor._gridState.grid[0][0]).toBeNull();

    // Redo
    state._chapterMapEditor.handleChapterEditorKeyDown(
      new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }),
    );
    expect(state._chapterMapEditor._gridState.grid[0][0]?.shape).toBe(PipeShape.Granite);
  });

  it('other Ctrl+key combinations are ignored by the chapter map handler', () => {
    const state = setupChapterMapEditor();
    expect(() => {
      state._chapterMapEditor.handleChapterEditorKeyDown(
        new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }),
      );
    }).not.toThrow();
  });
});

// ─── CampaignMapEditorSection – canvas context wiring ────────────────────────
//
// Regression guard for the blank-map bug: jsdom returns null from getContext,
// so Jest silently skips every `if (!ctx) return` render path. By stubbing
// getContext we force the real code path and can assert the invariant that was
// broken: _ctx must be non-null after buildSection.

