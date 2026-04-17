/**
 * @jest-environment jsdom
 */

/**
 * Tests for the CampaignEditor and related persistence helpers.
 */

import { loadImportedCampaigns, saveImportedCampaigns, loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress, saveActiveCampaignId, clearActiveCampaignId, migrateCampaign } from '../src/persistence';
import { CampaignEditor } from '../src/campaignEditor';
import { CampaignDef, LevelDef, PipeShape } from '../src/types';
import { TileParams } from '../src/campaignEditor/types';

// Keep TILE_SIZE at 64 for all tests by simulating a small viewport.
beforeAll(() => {
  Object.defineProperty(window, 'innerWidth',  { value: 0, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
});

// ─── Persistence helpers ──────────────────────────────────────────────────────

describe('Campaign persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loadImportedCampaigns returns empty array when nothing is stored', () => {
    expect(loadImportedCampaigns()).toEqual([]);
  });

  it('saveImportedCampaigns and loadImportedCampaigns round-trip correctly', () => {
    const campaigns: CampaignDef[] = [
      { id: 'test1', name: 'Test Campaign', author: 'Tester', chapters: [] },
    ];
    saveImportedCampaigns(campaigns);
    expect(loadImportedCampaigns()).toEqual(campaigns);
  });

  it('loadImportedCampaigns handles corrupted storage gracefully', () => {
    localStorage.setItem('pipes_campaigns', 'not-json');
    expect(loadImportedCampaigns()).toEqual([]);
  });

  it('loadCampaignProgress returns empty set when nothing is stored', () => {
    expect(loadCampaignProgress('cmp_test').size).toBe(0);
  });

  it('markCampaignLevelCompleted persists completion', () => {
    const progress = loadCampaignProgress('cmp_test');
    markCampaignLevelCompleted('cmp_test', 42, progress);
    expect(progress.has(42)).toBe(true);

    // Reload from storage
    const reloaded = loadCampaignProgress('cmp_test');
    expect(reloaded.has(42)).toBe(true);
  });

  it('clearCampaignProgress removes all completions', () => {
    const progress = loadCampaignProgress('cmp_test');
    markCampaignLevelCompleted('cmp_test', 1, progress);
    markCampaignLevelCompleted('cmp_test', 2, progress);
    clearCampaignProgress('cmp_test', progress);
    expect(progress.size).toBe(0);
    expect(loadCampaignProgress('cmp_test').size).toBe(0);
  });

  it('different campaign IDs have independent progress', () => {
    const p1 = loadCampaignProgress('cmp_a');
    const p2 = loadCampaignProgress('cmp_b');
    markCampaignLevelCompleted('cmp_a', 10, p1);
    expect(p1.has(10)).toBe(true);
    expect(p2.has(10)).toBe(false);
    expect(loadCampaignProgress('cmp_b').has(10)).toBe(false);
  });
});

// ─── migrateCampaign – backwards compatibility: weak_ice → snow ───────────────

describe('migrateCampaign', () => {
  /** Build a minimal campaign with one tile whose chamberContent is set to the given string. */
  function campaignWithContent(content: string): CampaignDef {
    return {
      id: 'cmp_migrate_test',
      name: 'Migrate Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 1,
          name: 'Level 1',
          rows: 1,
          cols: 2,
          grid: [
            [
              { shape: PipeShape.Chamber, chamberContent: content as never },
              null,
            ],
          ],
          inventory: [],
        }],
      }],
    };
  }

  it('converts chamberContent weak_ice → snow', () => {
    const campaign = campaignWithContent('weak_ice');
    const migrated = migrateCampaign(campaign);
    expect(migrated.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });

  it('leaves other chamberContent values unchanged', () => {
    for (const content of ['ice', 'tank', 'dirt', 'heater', 'pump', 'sandstone', 'star', 'snow']) {
      const campaign = campaignWithContent(content);
      const migrated = migrateCampaign(campaign);
      expect(migrated.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe(content);
    }
  });

  it('handles null grid cells without error', () => {
    const campaign = campaignWithContent('snow');
    campaign.chapters[0].levels[0].grid[0][1] = null;
    expect(() => migrateCampaign(campaign)).not.toThrow();
  });

  it('returns the same campaign object (mutates in place)', () => {
    const campaign = campaignWithContent('weak_ice');
    const result = migrateCampaign(campaign);
    expect(result).toBe(campaign);
  });

  it('migrates legacy hint string to hints array', () => {
    const campaign: CampaignDef = {
      id: 'cmp_hint_test',
      name: 'Hint Test',
      author: 'Tester',
      chapters: [{
        id: 1, name: 'Ch 1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[null]],
          inventory: [],
        }],
      }],
    };
    // Inject the deprecated field via a cast (it's no longer in LevelDef).
    (campaign.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint'] = 'A legacy hint.';
    const migrated = migrateCampaign(campaign);
    expect(migrated.chapters[0].levels[0].hints).toEqual(['A legacy hint.']);
    expect((migrated.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint']).toBeUndefined();
  });

  it('does not overwrite existing hints when hint is also present', () => {
    const campaign: CampaignDef = {
      id: 'cmp_hint_test2',
      name: 'Hint Test 2',
      author: 'Tester',
      chapters: [{
        id: 1, name: 'Ch 1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[null]],
          inventory: [],
          hints: ['Existing hint.'],
        }],
      }],
    };
    (campaign.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint'] = 'Old hint.';
    const migrated = migrateCampaign(campaign);
    // hints should be preserved; old hint deleted
    expect(migrated.chapters[0].levels[0].hints).toEqual(['Existing hint.']);
    expect((migrated.chapters[0].levels[0] as unknown as Record<string, unknown>)['hint']).toBeUndefined();
  });
});

// ─── loadImportedCampaigns – applies weak_ice → snow migration ───────────────

describe('loadImportedCampaigns – weak_ice migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates weak_ice tiles in campaigns loaded from localStorage', () => {
    // Write old-format data directly to localStorage (bypassing saveImportedCampaigns)
    const oldCampaign = {
      id: 'cmp_old',
      name: 'Old Campaign',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 1,
          name: 'Level 1',
          rows: 1,
          cols: 1,
          grid: [[{ shape: 'CHAMBER', chamberContent: 'weak_ice', cost: 3, temperature: 5 }]],
          inventory: [],
        }],
      }],
    };
    localStorage.setItem('pipes_campaigns', JSON.stringify([oldCampaign]));

    const loaded = loadImportedCampaigns();
    expect(loaded[0].chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });
});

// ─── CampaignEditor – active campaign Play button ─────────────────────────────

/** Create a minimal CampaignEditor for DOM testing. */
function makeEditor(userCampaigns: CampaignDef[] = []): CampaignEditor {
  saveImportedCampaigns(userCampaigns);
  const noop = () => {};
  const noopLevel = (_l: LevelDef) => {};
  const noopCampaign = (_c: CampaignDef) => {};
  return new CampaignEditor(noop, noopLevel, noopCampaign);
}

/**
 * Get the text of the first button in the campaign row whose info section
 * contains a campaign with the given name.
 * Note: JSDOM normalizes CSS hex colors to rgb(), so we can't use style attribute selectors.
 */
function getFirstButtonTextForCampaign(name: string): string | null {
  const nameDivs = Array.from(document.querySelectorAll('div')) as HTMLDivElement[];
  for (const div of nameDivs) {
    // Find name divs that contain exactly the campaign name
    if (div.style.fontWeight === 'bold' && div.textContent?.startsWith(name)) {
      // Walk up to the row container and find the first button
      const row = div.closest('div[style*="border-radius"]') as HTMLElement | null;
      if (row) {
        const btn = row.querySelector('button') as HTMLButtonElement | null;
        return btn ? btn.textContent : null;
      }
    }
  }
  return null;
}

function isFirstButtonDisabledForCampaign(name: string): boolean {
  const nameDivs = Array.from(document.querySelectorAll('div')) as HTMLDivElement[];
  for (const div of nameDivs) {
    if (div.style.fontWeight === 'bold' && div.textContent?.startsWith(name)) {
      const row = div.closest('div[style*="border-radius"]') as HTMLElement | null;
      if (row) {
        const btn = row.querySelector('button') as HTMLButtonElement | null;
        return btn ? btn.disabled : false;
      }
    }
  }
  return false;
}

describe('CampaignEditor – active campaign button', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('User campaign shows "Active" disabled button when it is the active campaign', () => {
    const userCampaign: CampaignDef = { id: 'cmp_test2', name: 'Adventure Pack', author: 'Tester', chapters: [] };
    saveActiveCampaignId('cmp_test2');
    const editor = makeEditor([userCampaign]);
    editor.show();
    expect(getFirstButtonTextForCampaign('Adventure Pack')).toBe('Active');
    expect(isFirstButtonDisabledForCampaign('Adventure Pack')).toBe(true);
  });

  it('User campaign shows "▶ Play" when it is not the active campaign', () => {
    const userCampaign: CampaignDef = { id: 'cmp_test3', name: 'Bonus Levels', author: 'Tester', chapters: [] };
    // No active campaign stored → no campaign is active
    clearActiveCampaignId();
    const editor = makeEditor([userCampaign]);
    editor.show();
    expect(getFirstButtonTextForCampaign('Bonus Levels')).toBe('▶ Play');
  });

  it('Only the active campaign row has the "Active" button; others have "▶ Play"', () => {
    const camp1: CampaignDef = { id: 'cmp_a', name: 'Campaign A', author: 'Tester', chapters: [] };
    const camp2: CampaignDef = { id: 'cmp_b', name: 'Campaign B', author: 'Tester', chapters: [] };
    saveActiveCampaignId('cmp_a');
    const editor = makeEditor([camp1, camp2]);
    editor.show();
    expect(getFirstButtonTextForCampaign('Campaign A')).toBe('Active');
    expect(getFirstButtonTextForCampaign('Campaign B')).toBe('▶ Play');
  });
});

// ─── CampaignEditor – note and hint round-trip ────────────────────────────────

describe('CampaignEditor – note and hint in level definitions', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  /** Access private editor state for testing purposes. */
  function editorState(editor: CampaignEditor) {
    return editor as unknown as {
      _state: {
        levelNote: string;
        levelHints: string[];
        levelChallenge: boolean;
        levelName: string;
        rows: number;
        cols: number;
        grid: (import('../src/types').TileDef | null)[][];
        inventory: import('../src/types').InventoryItem[];
      };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _buildCurrentLevelDef(): LevelDef;
      _openLevelEditor(level: LevelDef, readOnly: boolean): void;
    };
  }

  it('_editLevelNote and _editLevelHints are empty by default', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    expect(state._state.levelNote).toBe('');
    expect(state._state.levelHints).toEqual(['']);
  });

  it('_openLevelEditor populates _editLevelNote and _editLevelHints from a level', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99001,
      name: 'Test Level',
      rows: 3,
      cols: 3,
      grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
      inventory: [],
      note: 'This is a note.',
      hints: ['This is a hint.'],
    };
    state._openLevelEditor(level, true);
    expect(state._state.levelNote).toBe('This is a note.');
    expect(state._state.levelHints).toEqual(['This is a hint.']);
  });

  it('_openLevelEditor uses empty hints when level has no hints', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99001,
      name: 'Test Level',
      rows: 3,
      cols: 3,
      grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
      inventory: [],
    };
    state._openLevelEditor(level, true);
    expect(state._state.levelHints).toEqual(['']);
  });

  it('_openLevelEditor sets empty array when level has no note or hint', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99002,
      name: 'Test Level',
      rows: 3,
      cols: 3,
      grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
      inventory: [],
    };
    state._openLevelEditor(level, true);
    expect(state._state.levelNote).toBe('');
    expect(state._state.levelHints).toEqual(['']);
  });

  it('_buildCurrentLevelDef omits note/hints when they are empty', () => {
    const userCampaign: CampaignDef = {
      id: 'cmp_test_nh',
      name: 'Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 99003,
          name: 'Test Level',
          rows: 3,
          cols: 3,
          grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
          inventory: [],
        }],
      }],
    };
    const editor = makeEditor([userCampaign]);
    const state = editorState(editor);
    state._activeCampaignId = 'cmp_test_nh';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'Test Level';
    state._state.levelNote = '';
    state._state.levelHints = [''];
    state._state.rows = 3;
    state._state.cols = 3;
    state._state.grid = Array.from({ length: 3 }, () => Array(3).fill(null) as null[]);
    state._state.inventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.note).toBeUndefined();
    expect(def.hints).toBeUndefined();
  });

  it('_buildCurrentLevelDef includes note and hints when they are non-empty', () => {
    const userCampaign: CampaignDef = {
      id: 'cmp_test_nh2',
      name: 'Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 99004,
          name: 'Test Level',
          rows: 3,
          cols: 3,
          grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
          inventory: [],
        }],
      }],
    };
    const editor = makeEditor([userCampaign]);
    const state = editorState(editor);
    state._activeCampaignId = 'cmp_test_nh2';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'Test Level';
    state._state.levelNote = 'Route the water carefully.';
    state._state.levelHints = ['Start from the left.', 'Try an elbow piece.'];
    state._state.rows = 3;
    state._state.cols = 3;
    state._state.grid = Array.from({ length: 3 }, () => Array(3).fill(null) as null[]);
    state._state.inventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.note).toBe('Route the water carefully.');
    expect(def.hints).toEqual(['Start from the left.', 'Try an elbow piece.']);
  });

  it('campaign export JSON includes note and hints fields when populated', () => {
    const campaign: CampaignDef = {
      id: 'cmp_export_test',
      name: 'Export Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Chapter 1',
        levels: [{
          id: 99005,
          name: 'Annotated Level',
          rows: 3,
          cols: 3,
          grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
          inventory: [],
          note: 'Watch the water level.',
          hints: ['Use an elbow at the corner.', 'Place it at row 2.'],
        }],
      }],
    };
    // The export function uses JSON.stringify, so verify round-trip via JSON
    const json = JSON.stringify(campaign, null, 2);
    const parsed = JSON.parse(json) as CampaignDef;
    expect(parsed.chapters[0].levels[0].note).toBe('Watch the water level.');
    expect(parsed.chapters[0].levels[0].hints).toEqual(['Use an elbow at the corner.', 'Place it at row 2.']);
  });
});

// ─── gzip export ─────────────────────────────────────────────────────────────

describe('CampaignEditor – _exportCampaign', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:fake';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('appends the anchor to document.body, clicks it, removes it, then defers revokeObjectURL', async () => {
    const campaign: CampaignDef = {
      id: 'cmp_exp1',
      name: 'My Campaign',
      author: 'Tester',
      chapters: [],
    };
    const editor = makeEditor([campaign]);

    // Mock gzipString to resolve immediately with a trivial Uint8Array.
    const typesModule = await import('../src/campaignEditor/types');
    const gzipSpy = jest.spyOn(typesModule, 'gzipString').mockResolvedValue(new Uint8Array([1, 2, 3]));

    const appendedAnchors: HTMLAnchorElement[] = [];
    const removedAnchors: HTMLAnchorElement[] = [];
    const clickedAnchors: HTMLAnchorElement[] = [];

    const origAppendChild = document.body.appendChild.bind(document.body);
    const origRemoveChild = document.body.removeChild.bind(document.body);
    jest.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if ((node as HTMLElement).tagName === 'A') appendedAnchors.push(node as HTMLAnchorElement);
      return origAppendChild(node);
    });
    jest.spyOn(document.body, 'removeChild').mockImplementation((node) => {
      if ((node as HTMLElement).tagName === 'A') removedAnchors.push(node as HTMLAnchorElement);
      return origRemoveChild(node);
    });

    const fakeUrl = 'blob:fake-url';
    jest.spyOn(URL, 'createObjectURL').mockReturnValue(fakeUrl);
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: () => { clickedAnchors.push(el as HTMLAnchorElement); },
          writable: true,
        });
      }
      return el;
    });

    jest.useFakeTimers();
    (editor as unknown as { _exportCampaign(c: CampaignDef): void })._exportCampaign(campaign);

    // Flush the microtask queue so the gzipString mock resolves.
    await Promise.resolve();

    expect(gzipSpy).toHaveBeenCalled();
    expect(appendedAnchors).toHaveLength(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(removedAnchors).toHaveLength(1);
    expect(appendedAnchors[0]).toBe(clickedAnchors[0]);

    // revokeObjectURL should not have been called yet (deferred via setTimeout).
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // After advancing timers the URL should be revoked.
    jest.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeUrl);
  });

  it('sets the download filename from the campaign name', async () => {
    const campaign: CampaignDef = {
      id: 'cmp_exp2',
      name: 'My Cool Campaign',
      author: 'Tester',
      chapters: [],
    };
    const editor = makeEditor([campaign]);

    const typesModule = await import('../src/campaignEditor/types');
    jest.spyOn(typesModule, 'gzipString').mockResolvedValue(new Uint8Array([1, 2, 3]));

    const downloadNames: string[] = [];
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', {
          value: () => { downloadNames.push((el as HTMLAnchorElement).download); },
          writable: true,
        });
      }
      return el;
    });
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    jest.useFakeTimers();

    (editor as unknown as { _exportCampaign(c: CampaignDef): void })._exportCampaign(campaign);
    await Promise.resolve();

    expect(downloadNames).toHaveLength(1);
    expect(downloadNames[0]).toBe('My_Cool_Campaign.pipes.json.gz');
  });
});

// ─── gzip import ─────────────────────────────────────────────────────────────

describe('CampaignEditor – gzip import', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    // Polyfill DecompressionStream / TextEncoder / TextDecoder
    // from Node.js built-ins because jsdom does not implement them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const webStreams = require('node:stream/web') as any;
    const g = globalThis as Record<string, unknown>;
    if (!g.DecompressionStream) g.DecompressionStream = webStreams.DecompressionStream;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { TextEncoder: NodeTextEncoder, TextDecoder: NodeTextDecoder } = require('node:util') as any;
    if (!g.TextEncoder) g.TextEncoder = NodeTextEncoder;
    if (!g.TextDecoder) g.TextDecoder = NodeTextDecoder;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('_importCampaign file input accepts .json and .gz files', () => {
    // Track file inputs created during _importCampaign
    const fileInputs: HTMLInputElement[] = [];
    const origCreate = document.createElement.bind(document) as (tag: string) => HTMLElement;
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        // Intercept .click() so the file-chooser dialog doesn't open
        Object.defineProperty(input, 'click', { value: () => undefined, writable: true });
        fileInputs.push(input);
      }
      return el;
    });

    const editor = makeEditor();
    fileInputs.length = 0; // discard inputs from constructor
    (editor as unknown as { _importCampaign(): void })._importCampaign();

    const fileInput = fileInputs.find((el) => el.type === 'file');
    expect(fileInput).toBeDefined();
    expect(fileInput!.accept).toContain('.gz');
    expect(fileInput!.accept).toContain('.json');
  });
});

// ─── CampaignEditor – import version comparison ───────────────────────────────

describe('CampaignEditor – import version comparison', () => {
  /**
   * Create a File whose `arrayBuffer()` resolves immediately via a pre-allocated
   * buffer, so that `blobToBytes` resolves as a microtask (before any setTimeout)
   * and tests can `await simulateImportJson(...)` reliably.
   */
  function makeJsonFile(json: string, name = 'test.pipes.json'): File {
    const file = new File([json], name, { type: 'application/json' });
    const buf = new TextEncoder().encode(json).buffer;
    Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(buf) });
    return file;
  }

  /**
   * Simulate importing a campaign from a JSON string by dispatching a change
   * event on the hidden file input.  Returns a promise that resolves once all
   * async file-reading microtasks have settled.
   */
  function simulateImportJson(editor: CampaignEditor, json: string): Promise<void> {
    const origCreate = document.createElement.bind(document) as (tag: string) => HTMLElement;
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        Object.defineProperty(input, 'click', {
          value: () => {
            Object.defineProperty(input, 'files', {
              value: [makeJsonFile(json)],
              configurable: true,
            });
            input.dispatchEvent(new Event('change'));
          },
          writable: true,
        });
      }
      return el;
    });

    try {
      (editor as unknown as { _importCampaign(): void })._importCampaign();
    } finally {
      createSpy.mockRestore();
    }
    // Flush microtasks – arrayBuffer() resolves immediately, so one Promise.resolve()
    // tick is enough for the full blobToBytes → isGzipBytes → processText chain.
    return Promise.resolve().then(() => Promise.resolve());
  }

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows "same version" dialog and does not replace when timestamps match', async () => {
    const ts = '2024-06-01T12:00:00.000Z';
    const existing: CampaignDef = { id: 'cmp_v1', name: 'My Campaign', author: 'A', chapters: [], lastUpdated: ts };
    const editor = makeEditor([existing]);

    await simulateImportJson(editor, JSON.stringify({ ...existing }));

    expect(document.body.innerHTML).toContain('Same Version');
    expect(document.body.innerHTML).toContain('already up to date');
    // No duplicate added
    expect(loadImportedCampaigns()).toHaveLength(1);
  });

  it('does not modify the campaign when "same version" dialog is shown', async () => {
    const ts = '2024-06-01T12:00:00.000Z';
    const existing: CampaignDef = { id: 'cmp_v2', name: 'Original', author: 'A', chapters: [], lastUpdated: ts };
    const editor = makeEditor([existing]);

    await simulateImportJson(editor, JSON.stringify({ ...existing, name: 'Renamed' }));

    // The "same version" path triggers on equal timestamps; name should be untouched
    const campaigns = loadImportedCampaigns();
    expect(campaigns[0].name).toBe('Original');
  });

  it('shows "Import Newer Version?" dialog when imported timestamp is more recent', async () => {
    const existing: CampaignDef = {
      id: 'cmp_v3', name: 'Campaign', author: 'A', chapters: [],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const editor = makeEditor([existing]);

    await simulateImportJson(editor, JSON.stringify({ ...existing, lastUpdated: '2024-06-01T00:00:00.000Z' }));

    expect(document.body.innerHTML).toContain('Import Newer Version?');
    expect(document.body.innerHTML).toContain('Import newer version');
  });

  it('shows "Import Older Version?" dialog when imported timestamp is earlier', async () => {
    const existing: CampaignDef = {
      id: 'cmp_v4', name: 'Campaign', author: 'A', chapters: [],
      lastUpdated: '2024-06-01T00:00:00.000Z',
    };
    const editor = makeEditor([existing]);

    await simulateImportJson(editor, JSON.stringify({ ...existing, lastUpdated: '2024-01-01T00:00:00.000Z' }));

    expect(document.body.innerHTML).toContain('Import Older Version?');
    expect(document.body.innerHTML).toContain('Overwrite with older version');
  });

  it('replaces campaign and retains player progress when confirming a newer import', async () => {
    const existing: CampaignDef = {
      id: 'cmp_v5', name: 'Campaign', author: 'A',
      chapters: [{ id: 1, name: 'Old Chapter', levels: [] }],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const editor = makeEditor([existing]);

    // Record some player progress that should survive the import.
    const prog = loadCampaignProgress('cmp_v5');
    markCampaignLevelCompleted('cmp_v5', 42, prog);

    await simulateImportJson(editor, JSON.stringify({
      ...existing,
      chapters: [{ id: 1, name: 'New Chapter', levels: [] }],
      lastUpdated: '2024-06-01T00:00:00.000Z',
    }));

    // Click the confirm button
    const confirmBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Import newer version'));
    expect(confirmBtn).toBeDefined();
    confirmBtn!.click();

    const campaigns = loadImportedCampaigns();
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].chapters[0].name).toBe('New Chapter');
    // Progress must be retained (keyed by campaign ID which is unchanged).
    expect(loadCampaignProgress('cmp_v5').has(42)).toBe(true);
  });

  it('does not replace campaign when user cancels the version conflict dialog', async () => {
    const existing: CampaignDef = {
      id: 'cmp_v6', name: 'Campaign', author: 'A',
      chapters: [{ id: 1, name: 'Original Chapter', levels: [] }],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const editor = makeEditor([existing]);

    await simulateImportJson(editor, JSON.stringify({
      ...existing,
      chapters: [{ id: 1, name: 'New Chapter', levels: [] }],
      lastUpdated: '2024-06-01T00:00:00.000Z',
    }));

    const cancelBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Cancel');
    expect(cancelBtn).toBeDefined();
    cancelBtn!.click();

    expect(loadImportedCampaigns()[0].chapters[0].name).toBe('Original Chapter');
  });

  it('treats missing lastUpdated as epoch 0 – local with timestamp is "newer" than import without', async () => {
    const existing: CampaignDef = {
      id: 'cmp_v7', name: 'Campaign', author: 'A', chapters: [],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const editor = makeEditor([existing]);

    // Imported file has no lastUpdated at all (older pre-timestamp campaign)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { lastUpdated: _, ...noTs } = existing;
    await simulateImportJson(editor, JSON.stringify(noTs));

    expect(document.body.innerHTML).toContain('Import Older Version?');
    expect(document.body.innerHTML).toContain('Overwrite with older version');
  });

  it('lastUpdated is set on campaign creation', () => {
    const before = Date.now();
    jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('New Campaign')
      .mockReturnValueOnce('Author');

    const editor = makeEditor();
    (editor as unknown as { _createCampaign(): void })._createCampaign();

    const campaigns = loadImportedCampaigns();
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].lastUpdated).toBeDefined();
    expect(new Date(campaigns[0].lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('lastUpdated is updated when a chapter is added', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const campaign: CampaignDef = { id: 'cmp_ts1', name: 'C', author: '', chapters: [], lastUpdated: old };
    const editor = makeEditor([campaign]);
    // Get the campaign reference that the editor actually owns (loaded from storage).
    const internalCampaign = (editor as unknown as { _service: { campaigns: readonly CampaignDef[] } })._service.campaigns[0];
    jest.spyOn(window, 'prompt').mockReturnValueOnce('Chapter 1');

    const before = Date.now();
    (editor as unknown as { _addChapter(c: CampaignDef): void })._addChapter(internalCampaign);

    const saved = loadImportedCampaigns()[0];
    expect(new Date(saved.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
    expect(saved.lastUpdated).not.toBe(old);
  });

  it('lastUpdated is updated and level is saved when playtesting', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const level: LevelDef = {
      id: 99100,
      name: 'Playtest Level',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
    const campaign: CampaignDef = {
      id: 'cmp_pt1',
      name: 'Playtest Campaign',
      author: '',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
      lastUpdated: old,
    };

    const playtestCalls: LevelDef[] = [];
    saveImportedCampaigns([campaign]);
    // Clear body before construction so the editor's _el is attached to a fresh DOM.
    document.body.innerHTML = '';
    const editor = new CampaignEditor(
      () => {},
      (l: LevelDef) => { playtestCalls.push(l); },
      (_c: CampaignDef) => {},
    );

    const state = editor as unknown as {
      _state: {
        levelName: string;
        levelNote: string;
        levelHints: string[];
        levelChallenge: boolean;
        rows: number;
        cols: number;
        grid: (import('../src/types').TileDef | null)[][];
        inventory: import('../src/types').InventoryItem[];
      };
      _service: { campaigns: readonly CampaignDef[] };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _showLevelEditor(readOnly: boolean): void;
      _validateLevel(): { ok: boolean; messages: string[] };
    };

    // Set up editor state as if the level editor is open for this level.
    state._activeCampaignId = 'cmp_pt1';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'Playtest Level';
    state._state.levelNote = '';
    state._state.levelHints = [''];
    state._state.levelChallenge = false;
    state._state.rows = 2;
    state._state.cols = 2;
    state._state.grid = Array.from({ length: 2 }, () => Array(2).fill(null) as null[]);
    state._state.inventory = [];

    // Bypass _validateLevel so the test does not need a fully valid board.
    jest.spyOn(state, '_validateLevel').mockReturnValue({ ok: true, messages: [] });

    // Render the level editor toolbar.
    state._showLevelEditor(false);

    const before = Date.now();
    const playtestBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Playtest'));
    expect(playtestBtn).toBeDefined();
    playtestBtn!.click();

    // lastUpdated must be updated.
    const saved = loadImportedCampaigns()[0];
    expect(saved.lastUpdated).not.toBe(old);
    expect(new Date(saved.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);

    // Level data must be persisted.
    expect(saved.chapters[0].levels[0].name).toBe('Playtest Level');

    // The onPlaytest callback must have been called.
    expect(playtestCalls).toHaveLength(1);
    expect(playtestCalls[0].name).toBe('1-1: Playtest Level');
  });
});

// ─── CampaignEditor – import activates the campaign ──────────────────────────

describe('CampaignEditor – import activates the campaign', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** Simulate importing a JSON string through the file-input flow on an existing editor.
   *  Returns a promise that resolves once all async file-reading microtasks have settled. */
  function simulateImportOn(editor: CampaignEditor, json: string): Promise<void> {
    const origCreate = document.createElement.bind(document) as (tag: string) => HTMLElement;
    const createSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        const input = el as HTMLInputElement;
        Object.defineProperty(input, 'click', {
          value: () => {
            const file = new File([json], 'test.json', { type: 'application/json' });
            const buf = new TextEncoder().encode(json).buffer;
            Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(buf) });
            Object.defineProperty(input, 'files', {
              value: [file],
              configurable: true,
            });
            input.dispatchEvent(new Event('change'));
          },
          writable: true,
        });
      }
      return el;
    });

    try {
      (editor as unknown as { _importCampaign(): void })._importCampaign();
    } finally {
      createSpy.mockRestore();
    }
    return Promise.resolve().then(() => Promise.resolve());
  }

  /** Create a CampaignEditor whose onPlayCampaign calls are captured in the returned array. */
  function makeEditorWithCapture(initial: CampaignDef[] = []): [CampaignEditor, CampaignDef[]] {
    const playCalls: CampaignDef[] = [];
    saveImportedCampaigns(initial);
    const editor = new CampaignEditor(
      () => {},
      (_l: LevelDef) => {},
      (c: CampaignDef) => { playCalls.push(c); },
    );
    return [editor, playCalls];
  }

  it('calls onPlayCampaign with the imported campaign when importing a new campaign', async () => {
    const campaign: CampaignDef = { id: 'cmp_new_import', name: 'Imported', author: 'A', chapters: [] };
    const [editor, playCalls] = makeEditorWithCapture();
    await simulateImportOn(editor, JSON.stringify(campaign));
    expect(playCalls).toHaveLength(1);
    expect(playCalls[0].id).toBe('cmp_new_import');
    expect(playCalls[0].name).toBe('Imported');
  });

  it('calls onPlayCampaign when a version-conflict import is confirmed', async () => {
    const existing: CampaignDef = {
      id: 'cmp_conflict', name: 'Old', author: 'A', chapters: [],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const [editor, playCalls] = makeEditorWithCapture([existing]);

    await simulateImportOn(editor, JSON.stringify({
      ...existing, name: 'New', lastUpdated: '2024-06-01T00:00:00.000Z',
    }));

    // onPlayCampaign must NOT be called before the user confirms the dialog.
    expect(playCalls).toHaveLength(0);

    const confirmBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Import newer version'));
    expect(confirmBtn).toBeDefined();
    confirmBtn!.click();

    expect(playCalls).toHaveLength(1);
    expect(playCalls[0].name).toBe('New');
  });

  it('does not call onPlayCampaign when import is canceled in version conflict dialog', async () => {
    const existing: CampaignDef = {
      id: 'cmp_cancel', name: 'Old', author: 'A', chapters: [],
      lastUpdated: '2024-01-01T00:00:00.000Z',
    };
    const [editor, playCalls] = makeEditorWithCapture([existing]);

    await simulateImportOn(editor, JSON.stringify({
      ...existing, name: 'New', lastUpdated: '2024-06-01T00:00:00.000Z',
    }));

    const cancelBtn = Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === 'Cancel');
    expect(cancelBtn).toBeDefined();
    cancelBtn!.click();

    expect(playCalls).toHaveLength(0);
  });
});

// ─── CampaignEditor – challenge flag round-trip ───────────────────────────────

describe('CampaignEditor – challenge flag in level definitions', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  /** Reuse the editorState helper from the note/hint suite. */
  function editorState(editor: CampaignEditor) {
    return editor as unknown as {
      _state: {
        levelChallenge: boolean;
        levelName: string;
        levelNote: string;
        levelHints: string[];
        rows: number;
        cols: number;
        grid: (import('../src/types').TileDef | null)[][];
        inventory: import('../src/types').InventoryItem[];
      };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _buildCurrentLevelDef(): LevelDef;
      _openLevelEditor(level: LevelDef, readOnly: boolean): void;
    };
  }

  it('_editLevelChallenge defaults to false', () => {
    const editor = makeEditor();
    expect(editorState(editor)._state.levelChallenge).toBe(false);
  });

  it('_openLevelEditor reads challenge=true from level', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99010,
      name: 'Hard Level',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
      challenge: true,
    };
    state._openLevelEditor(level, true);
    expect(state._state.levelChallenge).toBe(true);
  });

  it('_openLevelEditor sets false when level has no challenge flag', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99011,
      name: 'Normal Level',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
    };
    state._openLevelEditor(level, true);
    expect(state._state.levelChallenge).toBe(false);
  });

  it('_buildCurrentLevelDef omits challenge when false', () => {
    const userCampaign: CampaignDef = {
      id: 'cmp_chal1',
      name: 'Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 99012,
          name: 'Level',
          rows: 2,
          cols: 2,
          grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
          inventory: [],
        }],
      }],
    };
    const editor = makeEditor([userCampaign]);
    const state = editorState(editor);
    state._activeCampaignId = 'cmp_chal1';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'Level';
    state._state.levelNote = '';
    state._state.levelHints = [''];
    state._state.levelChallenge = false;
    state._state.rows = 2;
    state._state.cols = 2;
    state._state.grid = Array.from({ length: 2 }, () => Array(2).fill(null) as null[]);
    state._state.inventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.challenge).toBeUndefined();
  });

  it('_buildCurrentLevelDef sets challenge=true when flag is true', () => {
    const userCampaign: CampaignDef = {
      id: 'cmp_chal2',
      name: 'Test',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Ch 1',
        levels: [{
          id: 99013,
          name: 'Level',
          rows: 2,
          cols: 2,
          grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
          inventory: [],
        }],
      }],
    };
    const editor = makeEditor([userCampaign]);
    const state = editorState(editor);
    state._activeCampaignId = 'cmp_chal2';
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._state.levelName = 'Level';
    state._state.levelNote = '';
    state._state.levelHints = [''];
    state._state.levelChallenge = true;
    state._state.rows = 2;
    state._state.cols = 2;
    state._state.grid = Array.from({ length: 2 }, () => Array(2).fill(null) as null[]);
    state._state.inventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.challenge).toBe(true);
  });
});

// ─── CampaignEditor – Source tile parameter validation ────────────────────────

describe('CampaignEditor – Source tile parameter validation', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  /** Access private editor state for testing purposes. */
  function editorState(editor: CampaignEditor) {
    return editor as unknown as {
      _state: {
        params: TileParams;
        palette: PipeShape | string;
      };
      _paramsPanel: { buildParamPanel(): HTMLElement };
    };
  }

  /** Find the <input> element whose sibling <label> has the given text. */
  function findInputByLabel(panel: HTMLElement, labelText: string): HTMLInputElement | null {
    const labels = Array.from(panel.querySelectorAll('label'));
    for (const lbl of labels) {
      if (lbl.textContent === labelText) {
        const wrap = lbl.parentElement;
        return (wrap?.querySelector('input') as HTMLInputElement) ?? null;
      }
    }
    return null;
  }

  /** Simulate an input event on a number field with the given string value. */
  function fireInput(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('Source pressure can be set to 0 without reverting to 1', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = PipeShape.Source;
    state._state.params.pressure = 1;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Base Pressure');
    expect(input).not.toBeNull();
    fireInput(input!, '0');
    expect(state._state.params.pressure).toBe(0);
  });

  it('Source pressure negative values are clamped to 0', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = PipeShape.Source;
    state._state.params.pressure = 5;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Base Pressure');
    expect(input).not.toBeNull();
    fireInput(input!, '-3');
    expect(state._state.params.pressure).toBe(0);
  });

  it('Source capacity negative values are clamped to 0', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = PipeShape.Source;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Capacity');
    expect(input).not.toBeNull();
    fireInput(input!, '-3');
    expect(state._state.params.capacity).toBe(0);
  });

  it('Source temperature negative values are clamped to 0', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = PipeShape.Source;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Base Temp');
    expect(input).not.toBeNull();
    fireInput(input!, '-10');
    expect(state._state.params.temperature).toBe(0);
  });

  it('Pump chamber pressure can be set to 0 without reverting to 1', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = 'chamber:pump';
    state._state.params.chamberContent = 'pump';
    state._state.params.pressure = 1;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Pressure');
    expect(input).not.toBeNull();
    fireInput(input!, '0');
    expect(state._state.params.pressure).toBe(0);
  });

  it('Pump chamber pressure supports negative values', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = 'chamber:pump';
    state._state.params.chamberContent = 'pump';
    state._state.params.pressure = 2;
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const input = findInputByLabel(panel, 'Pressure');
    expect(input).not.toBeNull();
    fireInput(input!, '-5');
    expect(state._state.params.pressure).toBe(-5);
  });

  it('Hot plate chamber Mass and Boiling° inputs update params correctly', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    state._state.palette = 'chamber:hot_plate';
    state._state.params.chamberContent = 'hot_plate';
    const panel = state._paramsPanel.buildParamPanel();
    document.body.appendChild(panel);
    const massInput = findInputByLabel(panel, 'Mass');
    const boilingInput = findInputByLabel(panel, 'Boiling °');
    expect(massInput).not.toBeNull();
    expect(boilingInput).not.toBeNull();
    fireInput(massInput!, '3');
    fireInput(boilingInput!, '50');
    expect(state._state.params.cost).toBe(3);
    expect(state._state.params.temperature).toBe(50);
  });

  it('Hot plate _buildTileDef saves cost and temperature to TileDef', () => {
    const editor = makeEditor();
    const state = editor as unknown as {
      _state: {
        params: TileParams;
        palette: PipeShape | string;
        buildTileDef(): import('../src/types').TileDef;
      };
    };
    state._state.palette = 'chamber:hot_plate';
    state._state.params.chamberContent = 'hot_plate';
    state._state.params.cost = 3;
    state._state.params.temperature = 50;
    const def = state._state.buildTileDef();
    expect(def.chamberContent).toBe('hot_plate');
    expect(def.cost).toBe(3);
    expect(def.temperature).toBe(50);
  });
});

// ─── CampaignEditor – canvas display size and mouse-position calibration ──────

describe('CampaignEditor – canvas display size and _canvasPos calibration', () => {
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
    const rowsInp = inputs[0]!;
    const colsInp = inputs[1]!;
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

  type EditorDragState = {
    _state: {
      rows: number;
      cols: number;
      grid: (import('../src/types').TileDef | null)[][];
      palette: import('../src/campaignEditor/types').EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): import('../src/campaignEditor/types').EditorSnapshot;
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
      grid: (import('../src/types').TileDef | null)[][];
      palette: import('../src/campaignEditor/types').EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): import('../src/campaignEditor/types').EditorSnapshot;
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
      grid: (import('../src/types').TileDef | null)[][];
      palette: import('../src/campaignEditor/types').EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): import('../src/campaignEditor/types').EditorSnapshot;
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
    state._state.palette = 'chamber:item' as import('../src/campaignEditor/types').EditorPalette;
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

    state._state.palette = 'chamber:item' as import('../src/campaignEditor/types').EditorPalette;
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
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32));
    state._editorInput!.onMouseUp(ctrlLeftMouseEvent('mouseup', 32, 32));

    expect(state._state.historyLength).toBe(historyLenBefore + 1);
    const newSnapshot = state._state.historyEntryAt(state._state.historyIndex);
    expect(newSnapshot.grid[0][0]?.shape).toBe(PipeShape.Tee);
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
});

// ─── CampaignEditor – Source tile placement constraint ────────────────────────

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
      grid: (import('../src/types').TileDef | null)[][];
      palette: import('../src/campaignEditor/types').EditorPalette;
      historyLength: number;
      historyIndex: number;
      historyEntryAt(index: number): import('../src/campaignEditor/types').EditorSnapshot;
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
    state._editorInput!.onMouseDown(leftMouseEvent('mousedown', 32, 32)); // row 0, col 0 (occupied)
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
    localStorage.clear();
    document.body.innerHTML = '';
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

  it('renders a campaign map preview on the campaign detail page when map data exists', () => {
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

    expect(document.querySelector('#campaign-map-preview-section')).not.toBeNull();
    expect(document.querySelector('#campaign-map-preview-canvas')).not.toBeNull();
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
    const nameDivs = Array.from(document.querySelectorAll('div')) as HTMLDivElement[];
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
    const nameDivs = Array.from(document.querySelectorAll('div')) as HTMLDivElement[];
    for (const div of nameDivs) {
      if (div.style.fontWeight === 'bold' && div.textContent?.startsWith('Protected Pack')) {
        const row = div.closest('div[style*="border-radius"]') as HTMLElement | null;
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

describe('CampaignEditor – wheel scroll only rotates linked tile when cursor is over it', () => {
  const MOCK_CTX = {
    clearRect: jest.fn(), fillRect: jest.fn(), strokeRect: jest.fn(),
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

  type WheelState = {
    _state: {
      palette: PipeShape | string;
      params: TileParams;
      hover: { row: number; col: number } | null;
      _linkedTilePos: { row: number; col: number } | null;
      grid: (import('../src/types').TileDef | null)[][];
    };
    _activeCampaignId: string | null;
    _activeChapterIdx: number;
    _activeLevelIdx: number;
    _editorCanvas: HTMLCanvasElement | null;
    _editorInput: { onWheel(e: WheelEvent): void } | null;
    _openLevelEditor(level: LevelDef, readOnly: boolean): void;
  };

  function makeWheelEditor(level: LevelDef): WheelState {
    const camp: CampaignDef = {
      id: 'cmp_wheel_test',
      name: 'Wheel Test',
      author: 'Tester',
      chapters: [{ id: 1, name: 'Ch 1', levels: [level] }],
    };
    const editor = makeEditor([camp]);
    const state = editor as unknown as WheelState;
    state._activeCampaignId = 'cmp_wheel_test';
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

  function wheelEvent(deltaY: number): WheelEvent {
    return new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
  }

  it('wheel updates pending-placement rotation when no tile is linked', () => {
    const level: LevelDef = {
      id: 99930,
      name: 'Wheel No Link',
      rows: 4,
      cols: 4,
      grid: Array.from({ length: 4 }, () => Array(4).fill(null) as null[]),
      inventory: [],
    };
    const state = makeWheelEditor(level);
    state._state.palette = PipeShape.Straight;
    state._state.params.rotation = 0;
    state._state._linkedTilePos = null;

    state._editorInput!.onWheel(wheelEvent(100)); // clockwise

    expect(state._state.params.rotation).toBe(90);
  });

  it('wheel rotates linked tile when cursor is hovering over it', () => {
    const level: LevelDef = {
      id: 99931,
      name: 'Wheel Over Linked',
      rows: 4,
      cols: 4,
      grid: [
        [{ shape: PipeShape.Straight, rotation: 0 }, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      inventory: [],
    };
    const state = makeWheelEditor(level);
    state._state.palette = PipeShape.Straight;
    state._state.params.rotation = 0;
    // Link the tile at (0, 0) and position the hover over it
    state._state._linkedTilePos = { row: 0, col: 0 };
    state._state.hover = { row: 0, col: 0 };

    state._editorInput!.onWheel(wheelEvent(100)); // clockwise

    // Params should be updated
    expect(state._state.params.rotation).toBe(90);
    // The linked grid tile should be updated too
    expect(state._state.grid[0][0]?.rotation).toBe(90);
  });

  it('wheel does NOT rotate linked tile when cursor is NOT hovering over it', () => {
    const level: LevelDef = {
      id: 99932,
      name: 'Wheel Away From Linked',
      rows: 4,
      cols: 4,
      grid: [
        [{ shape: PipeShape.Straight, rotation: 0 }, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      inventory: [],
    };
    const state = makeWheelEditor(level);
    state._state.palette = PipeShape.Straight;
    state._state.params.rotation = 0;
    // Link the tile at (0, 0) but hover over a different cell
    state._state._linkedTilePos = { row: 0, col: 0 };
    state._state.hover = { row: 1, col: 1 };

    state._editorInput!.onWheel(wheelEvent(100)); // clockwise

    // Pending-placement params should be updated
    expect(state._state.params.rotation).toBe(90);
    // But the linked grid tile must remain unchanged at rotation 0
    expect(state._state.grid[0][0]?.rotation).toBe(0);
  });

  it('wheel does NOT rotate linked tile when cursor is off the canvas (no hover)', () => {
    const level: LevelDef = {
      id: 99933,
      name: 'Wheel No Hover',
      rows: 4,
      cols: 4,
      grid: [
        [{ shape: PipeShape.Straight, rotation: 0 }, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      inventory: [],
    };
    const state = makeWheelEditor(level);
    state._state.palette = PipeShape.Straight;
    state._state.params.rotation = 0;
    state._state._linkedTilePos = { row: 0, col: 0 };
    state._state.hover = null; // no hover position

    state._editorInput!.onWheel(wheelEvent(100)); // clockwise

    expect(state._state.params.rotation).toBe(90);
    expect(state._state.grid[0][0]?.rotation).toBe(0);
  });
});

// ─── Data validation ──────────────────────────────────────────────────────────

import { getValidTileDefKeys } from '../src/campaignEditor/types';
import { TileDef } from '../src/types';

describe('getValidTileDefKeys', () => {
  it('Empty tile: only shape is valid', () => {
    const tile: TileDef = { shape: PipeShape.Empty };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('capacity')).toBe(false);
    expect(valid.has('dryingTime')).toBe(false);
  });

  it('Straight tile: shape + rotation valid', () => {
    const tile: TileDef = { shape: PipeShape.Straight, rotation: 90 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(true);
    expect(valid.has('capacity')).toBe(false);
    expect(valid.has('connections')).toBe(false);
  });

  it('Cross tile: rotation is NOT valid (symmetric shape)', () => {
    const tile: TileDef = { shape: PipeShape.Cross };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
  });

  it('GoldSpace tile: rotation is NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.GoldSpace };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
  });

  it('Granite tile: only shape is valid', () => {
    const tile: TileDef = { shape: PipeShape.Granite };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('dryingTime')).toBe(false);
  });

  it('Tree tile: only shape is valid', () => {
    const tile: TileDef = { shape: PipeShape.Tree };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('dryingTime')).toBe(false);
  });

  it('OneWay tile: shape + rotation valid (rotation encodes direction)', () => {
    const tile: TileDef = { shape: PipeShape.OneWay, rotation: 90 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('rotation')).toBe(true);
    expect(valid.has('capacity')).toBe(false);
    expect(valid.has('dryingTime')).toBe(false);
  });

  it('Cement tile: shape + dryingTime valid', () => {
    const tile: TileDef = { shape: PipeShape.Cement };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('dryingTime')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('capacity')).toBe(false);
  });

  it('Source tile: shape + capacity + connections + temperature + pressure valid', () => {
    const tile: TileDef = { shape: PipeShape.Source, capacity: 6 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('capacity')).toBe(true);
    expect(valid.has('connections')).toBe(true);
    expect(valid.has('temperature')).toBe(true);
    expect(valid.has('pressure')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('dryingTime')).toBe(false);
  });

  it('Sink tile: shape + connections valid; rotation NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.Sink };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('shape')).toBe(true);
    expect(valid.has('connections')).toBe(true);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('capacity')).toBe(false);
  });

  it('Chamber-tank: chamberContent + capacity + connections valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'tank', capacity: 5 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('chamberContent')).toBe(true);
    expect(valid.has('capacity')).toBe(true);
    expect(valid.has('connections')).toBe(true);
    expect(valid.has('cost')).toBe(false);
    expect(valid.has('rotation')).toBe(false);
    expect(valid.has('temperature')).toBe(false);
  });

  it('Chamber-dirt: cost valid; capacity NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'dirt' };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('cost')).toBe(true);
    expect(valid.has('capacity')).toBe(false);
    expect(valid.has('temperature')).toBe(false);
  });

  it('Chamber-item: itemShape + itemCount valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'item', itemShape: PipeShape.Straight, itemCount: 1 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('itemShape')).toBe(true);
    expect(valid.has('itemCount')).toBe(true);
    expect(valid.has('cost')).toBe(false);
    expect(valid.has('capacity')).toBe(false);
  });

  it('Chamber-heater: temperature valid; cost NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'heater' };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('temperature')).toBe(true);
    expect(valid.has('cost')).toBe(false);
    expect(valid.has('pressure')).toBe(false);
  });

  it('Chamber-pump: pressure valid; temperature NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'pump' };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('pressure')).toBe(true);
    expect(valid.has('temperature')).toBe(false);
    expect(valid.has('cost')).toBe(false);
  });

  it('Chamber-sandstone: cost + temperature + hardness + shatter valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'sandstone' };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('cost')).toBe(true);
    expect(valid.has('temperature')).toBe(true);
    expect(valid.has('hardness')).toBe(true);
    expect(valid.has('shatter')).toBe(true);
    expect(valid.has('capacity')).toBe(false);
    expect(valid.has('itemShape')).toBe(false);
  });

  it('Chamber-hot_plate: cost + temperature valid; hardness NOT valid', () => {
    const tile: TileDef = { shape: PipeShape.Chamber, chamberContent: 'hot_plate' };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('cost')).toBe(true);
    expect(valid.has('temperature')).toBe(true);
    expect(valid.has('hardness')).toBe(false);
    expect(valid.has('capacity')).toBe(false);
  });

  it('GoldStraight: rotation valid (asymmetric gold pipe)', () => {
    const tile: TileDef = { shape: PipeShape.GoldStraight, rotation: 90 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('rotation')).toBe(true);
    expect(valid.has('capacity')).toBe(false);
  });

  it('GoldCross: rotation NOT valid (symmetric)', () => {
    const tile: TileDef = { shape: PipeShape.GoldCross };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('rotation')).toBe(false);
  });

  it('SpinElbow: rotation valid', () => {
    const tile: TileDef = { shape: PipeShape.SpinElbow, rotation: 180 };
    const valid = getValidTileDefKeys(tile);
    expect(valid.has('rotation')).toBe(true);
  });
});

describe('_scanCampaignData – dry run', () => {
  function makeEditor(): CampaignEditor {
    localStorage.clear();
    return new CampaignEditor(() => {}, (_level: LevelDef) => {}, (_campaign: CampaignDef) => {});
  }

  function makeCampaign(overrides: Partial<CampaignDef> = {}): CampaignDef {
    return {
      id: 'cmp_test',
      name: 'Test',
      author: 'Tester',
      chapters: [],
      ...overrides,
    };
  }

  it('returns empty issues map when campaign data is clean', () => {
    const editor = makeEditor();
    const campaign = makeCampaign();
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.size).toBe(0);
  });

  it('detects unrecognized field on campaign record', () => {
    const editor = makeEditor();
    const campaign = makeCampaign();
    (campaign as unknown as Record<string, unknown>)['extraField'] = 'oops';
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.get('Campaign')?.get('extraField')).toBe(1);
    // dry run: field must still be present
    expect((campaign as unknown as Record<string, unknown>)['extraField']).toBe('oops');
  });

  it('detects rotation on GoldSpace tile', () => {
    const editor = makeEditor();
    const tile: TileDef = { shape: PipeShape.GoldSpace };
    (tile as unknown as Record<string, unknown>)['rotation'] = 0;
    const campaign = makeCampaign({
      chapters: [{
        id: 1, name: 'Ch1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[tile]],
          inventory: [],
        }],
      }],
    });
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.get('Tile')?.get('rotation')).toBe(1);
    // dry run: field must still be present
    expect((tile as unknown as Record<string, unknown>)['rotation']).toBe(0);
  });

  it('detects invalid field on Tree tile', () => {
    const editor = makeEditor();
    const tile: TileDef = { shape: PipeShape.Tree };
    (tile as unknown as Record<string, unknown>)['rotation'] = 0;
    const campaign = makeCampaign({
      chapters: [{
        id: 1, name: 'Ch1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[tile]],
          inventory: [],
        }],
      }],
    });
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.get('Tile')?.get('rotation')).toBe(1);
    // dry run: field must still be present
    expect((tile as unknown as Record<string, unknown>)['rotation']).toBe(0);
  });

  it('Tree tile with only shape field has no validation issues', () => {
    const editor = makeEditor();
    const tile: TileDef = { shape: PipeShape.Tree };
    const campaign = makeCampaign({
      chapters: [{
        id: 1, name: 'Ch1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[tile]],
          inventory: [],
        }],
      }],
    });
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.size).toBe(0);
  });

  it('removes invalid fields when dryRun is false', () => {
    const editor = makeEditor();
    const campaign = makeCampaign();
    (campaign as unknown as Record<string, unknown>)['badKey'] = 42;
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, false);
    expect(issues.get('Campaign')?.get('badKey')).toBe(1);
    // non-dry-run: field must be gone
    expect(Object.keys(campaign)).not.toContain('badKey');
  });

  it('counts multiple occurrences of the same invalid field across tiles', () => {
    const editor = makeEditor();
    const makeGoldSpaceWithRotation = (): TileDef => {
      const t: TileDef = { shape: PipeShape.GoldSpace };
      (t as unknown as Record<string, unknown>)['rotation'] = 0;
      return t;
    };
    const campaign = makeCampaign({
      chapters: [{
        id: 1, name: 'Ch1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 3,
          grid: [[makeGoldSpaceWithRotation(), makeGoldSpaceWithRotation(), makeGoldSpaceWithRotation()]],
          inventory: [],
        }],
      }],
    });
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.get('Tile')?.get('rotation')).toBe(3);
  });

  it('detects invalid field on InventoryItem', () => {
    const editor = makeEditor();
    const item = { shape: PipeShape.Straight, count: 2 };
    (item as unknown as Record<string, unknown>)['extra'] = true;
    const campaign = makeCampaign({
      chapters: [{
        id: 1, name: 'Ch1',
        levels: [{
          id: 1, name: 'L1', rows: 1, cols: 1,
          grid: [[null]],
          inventory: [item],
        }],
      }],
    });
    const issues = (editor as unknown as {
      _scanCampaignData(c: CampaignDef, d: boolean): Map<string, Map<string, number>>;
    })._scanCampaignData(campaign, true);
    expect(issues.get('InventoryItem')?.get('extra')).toBe(1);
  });
});

// ─── _buildTileDef: no rotation for shape-less tiles ─────────────────────────

describe('CampaignEditor – _buildTileDef omits rotation for non-rotatable shapes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function editorBuildTileDef(palette: PipeShape | string): import('../src/types').TileDef {
    const editor = makeEditor();
    const state = editor as unknown as {
      _state: {
        params: TileParams;
        palette: PipeShape | string;
        buildTileDef(): import('../src/types').TileDef;
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
        inventory: import('../src/types').InventoryItem[];
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
    const { buildCurrentLevelDef } = makeEditorWithGrid([[tile]]);
    const def = buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('strips rotation from Granite tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Granite };
    (tile as unknown as Record<string, unknown>)['rotation'] = 90;
    const { buildCurrentLevelDef } = makeEditorWithGrid([[tile]]);
    const def = buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('strips rotation from Tree tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Tree };
    (tile as unknown as Record<string, unknown>)['rotation'] = 90;
    const { buildCurrentLevelDef } = makeEditorWithGrid([[tile]]);
    const def = buildCurrentLevelDef();
    const savedTile = def.grid[0][0];
    expect(savedTile).not.toBeNull();
    expect('rotation' in (savedTile as object)).toBe(false);
  });

  it('preserves rotation on Straight tile when saving', () => {
    const tile: TileDef = { shape: PipeShape.Straight, rotation: 90 };
    const { buildCurrentLevelDef } = makeEditorWithGrid([[tile]]);
    const def = buildCurrentLevelDef();
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
      grid: (import('../src/types').TileDef | null)[][];
      palette: import('../src/campaignEditor/types').EditorPalette;
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
