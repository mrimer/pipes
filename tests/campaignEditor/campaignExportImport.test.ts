/**
 * @jest-environment jsdom
 */

import {
  loadImportedCampaigns,
  saveImportedCampaigns,
  loadCampaignProgress,
  markCampaignLevelCompleted,
  savePlayerName,
} from '../../src/persistence';
import { CampaignEditor } from '../../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef, InventoryItem } from '../../src/types';
import { DecompressionStream } from 'node:stream/web';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
describe('CampaignEditor – _exportCampaign', () => {
  let originalCreateObjectURL: ((obj: Blob | MediaSource) => string) | undefined;
  let originalRevokeObjectURL: ((url: string) => void) | undefined;

  const waitFor = async (predicate: () => boolean, maxTicks = 10): Promise<void> => {
    for (let i = 0; i < maxTicks; i += 1) {
      if (predicate()) return;
      await Promise.resolve();
    }
    throw new Error('Timed out waiting for asynchronous export side effects.');
  };

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    originalCreateObjectURL = URL.createObjectURL?.bind(URL);
    originalRevokeObjectURL = URL.revokeObjectURL?.bind(URL);
    if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:fake';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => undefined;
  });

  afterEach(() => {
    if (originalCreateObjectURL) {
      URL.createObjectURL = originalCreateObjectURL;
    } else {
      (URL as unknown as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL = undefined;
    }
    if (originalRevokeObjectURL) {
      URL.revokeObjectURL = originalRevokeObjectURL;
    } else {
      (URL as unknown as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL = undefined;
    }
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
    const typesModule = await import('../../src/campaignEditor/types');
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
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

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

    await waitFor(() => gzipSpy.mock.calls.length > 0 && appendedAnchors.length === 1 && clickedAnchors.length === 1 && removedAnchors.length === 1);

    expect(gzipSpy).toHaveBeenCalled();
    expect(appendedAnchors).toHaveLength(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(removedAnchors).toHaveLength(1);
    expect(appendedAnchors[0]).toBe(clickedAnchors[0]);

    // revokeObjectURL should not have been called yet (deferred via setTimeout).
    expect(revokeSpy).not.toHaveBeenCalled();

    // After advancing timers the URL should be revoked.
    jest.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith(fakeUrl);
  });

  it('sets the download filename from the campaign name', async () => {
    const campaign: CampaignDef = {
      id: 'cmp_exp2',
      name: 'My Cool Campaign',
      author: 'Tester',
      chapters: [],
    };
    const editor = makeEditor([campaign]);

    const typesModule = await import('../../src/campaignEditor/types');
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
    await waitFor(() => downloadNames.length === 1);

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
    const g = globalThis as Record<string, unknown>;
    if (!g.DecompressionStream) g.DecompressionStream = DecompressionStream;
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

  it('uses current player name as author when creating a new campaign (no author prompt)', () => {
    savePlayerName('Morgan');
    const promptSpy = jest.spyOn(window, 'prompt')
      .mockReturnValueOnce('New Campaign');

    const editor = makeEditor();
    (editor as unknown as { _createCampaign(): void })._createCampaign();

    // Only one prompt (campaign name) — no author prompt any more
    expect(promptSpy).toHaveBeenCalledTimes(1);
    expect(promptSpy).toHaveBeenCalledWith('Campaign name:');

    const campaigns = loadImportedCampaigns();
    expect(campaigns.some((c) => c.name === 'New Campaign' && c.author === 'Morgan')).toBe(true);
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

  it('opens the new chapter in chapter editor after adding a chapter', () => {
    const campaign: CampaignDef = { id: 'cmp_new_chapter_open', name: 'C', author: '', chapters: [] };
    const editor = makeEditor([campaign]);
    const state = editor as unknown as {
      _service: { campaigns: readonly CampaignDef[] };
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _screen: string;
      _addChapter(c: CampaignDef): void;
    };
    const internalCampaign = state._service.campaigns[0];
    state._activeCampaignId = internalCampaign.id;
    jest.spyOn(window, 'prompt').mockReturnValueOnce('Chapter 1');

    state._addChapter(internalCampaign);

    expect(state._activeChapterIdx).toBe(0);
    expect(state._screen).toBe('chapter');
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
        grid: (TileDef | null)[][];
        inventory: InventoryItem[];
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

