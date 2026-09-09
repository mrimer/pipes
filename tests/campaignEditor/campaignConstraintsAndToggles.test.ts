/**
 * @jest-environment jsdom
 */

import {
  loadImportedCampaigns,
} from '../../src/persistence';
import type { CampaignEditor } from '../../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { EditorPalette, EditorSnapshot } from '../../src/campaignEditor/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
  getFirstButtonTextForCampaign,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignEditor – Source tile placement constraint', () => {
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
    jest.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  type EditorSourceState = {
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
    _editorSourceErrorEl: HTMLDivElement | null;
    _editorInput: {
      onMouseDown(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
    } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLevel(rows: number, cols: number): LevelDef {
    return {
      id: 99912,
      name: 'Source Constraint Test',
      rows,
      cols,
      grid: Array.from({ length: rows }, () => Array(cols).fill(null) as null[]),
      inventory: [],
    };
  }

  function makeSourceEditor(level: LevelDef): EditorSourceState {
    const camp: CampaignDef = {
      id: 'cmp_source_test',
      name: 'Source Constraint Test Campaign',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as EditorSourceState;
    state._activeCampaignId = 'cmp_source_test';
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

  it('allows placing the first Source tile on an empty board', () => {
    const state = makeSourceEditor(makeLevel(4, 4));
    state._state.palette = PipeShape.Source;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0

    expect(state._state.grid[0][0]).not.toBeNull();
    expect(state._state.grid[0][0]?.shape).toBe(PipeShape.Source);
    expect(state._editorSourceErrorEl?.style.display).not.toBe('block');
  });

  it('shows a flash error and does not place a second Source tile', () => {
    const state = makeSourceEditor(makeLevel(4, 4));

    // Place first Source at (0,0)
    state._state.palette = PipeShape.Source;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0
    expect(state._state.grid[0][0]?.shape).toBe(PipeShape.Source);

    // Attempt to place second Source at (0,1)
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 96, 32)); // row 0, col 1

    expect(state._editorSourceErrorEl?.style.display).toBe('block');
    expect(state._editorSourceErrorEl?.textContent).toBe('Only one source tile is allowed.');
    expect(state._state.grid[0][1]).toBeNull(); // second Source not placed
  });

  it('shows a flash error when trying to overwrite a non-Source tile with Source via Ctrl+click', () => {
    const state = makeSourceEditor(makeLevel(4, 4));

    // Place a Straight tile at (0,0) and a Source at (1,0)
    state._state.grid[0][0] = { shape: PipeShape.Straight, rotation: 0 };
    state._state.grid[1][0] = { shape: PipeShape.Source, rotation: 0 };

    // Ctrl+click on (0,0) with Source palette: should be blocked
    state._state.palette = PipeShape.Source;
    state._editorInput!.onMouseDown(ctrlLeftMouseEvent('mousedown', 32, 32)); // row 0, col 0 (occupied)
    state._editorInput!.onMouseUp(ctrlLeftMouseEvent('mouseup', 32, 32));

    expect(state._editorSourceErrorEl?.style.display).toBe('block');
    expect(state._editorSourceErrorEl?.textContent).toBe('Only one source tile is allowed.');
    expect(state._state.grid[0][0]?.shape).toBe(PipeShape.Straight); // not overwritten
  });

  it('allows ctrl+click overwrite when the occupied tile is already the Source', () => {
    const state = makeSourceEditor(makeLevel(4, 4));

    // Place a Source at (0,0)
    state._state.grid[0][0] = { shape: PipeShape.Source, rotation: 0 };

    // Ctrl+click on (0,0) with Source palette: should be allowed (same position)
    state._state.palette = PipeShape.Source;
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0 (occupied)
    state._editorInput!.onMouseUp(ctrlLeftMouseEvent('mouseup', 32, 32));

    expect(window.alert).not.toHaveBeenCalled();
    expect(state._state.grid[0][0]?.shape).toBe(PipeShape.Source);
  });
});

// ─── CampaignEditor – Dev Official Campaign toggle ────────────────────────────

describe('CampaignEditor – Dev Official Campaign toggle', () => {
  beforeEach(() => {
    (globalThis as unknown as Record<string, unknown>)['DEV_CONTROLS'] = true;
    localStorage.clear();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>)['DEV_CONTROLS'] = false;
  });

  /** Navigate the editor to the campaign detail page for the given user campaign. */
  function openCampaignDetail(editor: CampaignEditor, campaignId: string): void {
    const state = editor as unknown as {
      _activeCampaignId: string | null;
      _showCampaignDetail(): void;
    };
    state._activeCampaignId = campaignId;
    state._showCampaignDetail();
  }

  it('renders a campaign map editor on the campaign detail page when map data exists', () => {
    const campaign: CampaignDef = {
      id: 'cmp_map_preview_1',
      name: 'Map Preview Campaign',
      author: 'Tester',
      rows: 3,
      cols: 6,
      grid: Array.from({ length: 3 }, () => Array(6).fill(null)),
      chapters: [],
    };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_map_preview_1');

    // The full campaign map editor section (not just a static preview) should be rendered.
    expect(document.querySelector('#campaign-map-editor-section')).not.toBeNull();
    // Should contain the interactive canvas for the campaign map editor.
    const section = document.querySelector('#campaign-map-editor-section');
    expect(section!.querySelector('canvas')).not.toBeNull();
  });

  it('shows the official toggle for user campaigns on the detail page', () => {
    const campaign: CampaignDef = { id: 'cmp_t1', name: 'My Campaign', author: 'Tester', chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_t1');

    const toggle = document.querySelector<HTMLInputElement>('#official-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle!.checked).toBe(false);
  });

  it('toggle is unchecked when campaign has no official flag', () => {
    const campaign: CampaignDef = { id: 'cmp_t2', name: 'My Campaign', author: 'Tester', chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_t2');

    const toggle = document.querySelector<HTMLInputElement>('#official-toggle');
    expect(toggle!.checked).toBe(false);
  });

  it('toggle is checked when campaign has official: true', () => {
    const campaign: CampaignDef = { id: 'cmp_t3', name: 'My Campaign', author: 'Tester', official: true, chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_t3');

    const toggle = document.querySelector<HTMLInputElement>('#official-toggle');
    expect(toggle!.checked).toBe(true);
  });

  it('checking the toggle marks the campaign as official', () => {
    const campaign: CampaignDef = { id: 'cmp_t4', name: 'My Campaign', author: 'Tester', chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_t4');

    const toggle = document.querySelector<HTMLInputElement>('#official-toggle')!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));

    // Check the persisted campaign - makeEditor serializes campaigns, so we verify via storage
    const stored = loadImportedCampaigns().find((c) => c.id === 'cmp_t4');
    expect(stored?.official).toBe(true);
  });

  it('unchecking the toggle removes the official flag', () => {
    const campaign: CampaignDef = { id: 'cmp_t5', name: 'My Campaign', author: 'Tester', official: true, chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();
    openCampaignDetail(editor, 'cmp_t5');

    const toggle = document.querySelector<HTMLInputElement>('#official-toggle')!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));

    // After unchecking, the campaign should no longer have official: true
    const stored = loadImportedCampaigns().find((c) => c.id === 'cmp_t5');
    expect(stored?.official).toBeFalsy();
  });

  it('official user campaigns show lock icon and read-only UI in campaign list', () => {
    const campaign: CampaignDef = { id: 'cmp_t6', name: 'Locked Pack', author: 'Tester', official: true, chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();

    // Check that name shows lock icon
    const nameDivs = Array.from(document.querySelectorAll('div'));
    const nameDiv = nameDivs.find((d) => d.textContent === 'Locked Pack 🔒');
    expect(nameDiv).toBeDefined();

    // Check that Edit button is replaced with View button
    expect(getFirstButtonTextForCampaign('Locked Pack')).not.toContain('Edit');
  });

  it('official user campaigns do not show delete button in campaign list', () => {
    const campaign: CampaignDef = { id: 'cmp_t7', name: 'Protected Pack', author: 'Tester', official: true, chapters: [] };
    const editor = makeEditor([campaign]);
    editor.show();

    // Find the campaign row and check no delete button
    const nameDivs = Array.from(document.querySelectorAll('div'));
    for (const div of nameDivs) {
      if (div.style.fontWeight === 'bold' && div.textContent?.startsWith('Protected Pack')) {
        const row = div.closest('div[style*="border-radius"]');
        if (row) {
          const buttons = Array.from(row.querySelectorAll('button'));
          const hasDelete = buttons.some((b) => b.textContent?.includes('Delete'));
          expect(hasDelete).toBe(false);
        }
      }
    }
  });
});

// ─── CampaignEditor – Escape key un-links the joined tile ────────────────────

describe('CampaignEditor – Escape key un-links the linked tile in the level editor', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  type LinkedState = {
    _state: {
      _linkedTilePos: { row: number; col: number } | null;
      _linkedTileDirty: boolean;
    };
    _screen: string;
    _el: HTMLElement;
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeLinkedEditor(level: LevelDef): LinkedState {
    const campaign: CampaignDef = {
      id: 'cmp_linked_test',
      name: 'Linked Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([campaign]);
    const state = editor as unknown as LinkedState;
    state._activeCampaignId = 'cmp_linked_test';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    // Simulate the editor being visible
    state._el.style.display = 'flex';
    return state;
  }

  it('pressing Escape clears _linkedTilePos when a tile is linked', () => {
    const level: LevelDef = {
      id: 99920,
      name: 'Link Esc Test',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
    const state = makeLinkedEditor(level);

    // Simulate a tile being linked
    state._state._linkedTilePos = { row: 0, col: 1 };
    state._state._linkedTileDirty = false;

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(state._state._linkedTilePos).toBeNull();
  });

  it('pressing Escape does nothing when no tile is linked', () => {
    const level: LevelDef = {
      id: 99921,
      name: 'Link Esc Noop Test',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
    const state = makeLinkedEditor(level);

    // Ensure no tile is linked
    state._state._linkedTilePos = null;

    // Should not throw; _linkedTilePos stays null
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state._state._linkedTilePos).toBeNull();
  });

  it('pressing Escape does not clear _linkedTilePos when not in the level editor screen', () => {
    const level: LevelDef = {
      id: 99922,
      name: 'Link Esc Screen Test',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
    const state = makeLinkedEditor(level);

    // Manually switch the screen away from levelEditor
    state._screen = 'list';
    state._state._linkedTilePos = { row: 0, col: 1 };

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // The handler guards on _screen === 'levelEditor', so _linkedTilePos should be unchanged.
    expect(state._state._linkedTilePos).toEqual({ row: 0, col: 1 });
  });
});

// ─── CampaignEditor – wheel scroll rotates linked tile only when hovering ────

