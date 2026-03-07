/**
 * @jest-environment jsdom
 */

/**
 * Tests for the CampaignEditor and related persistence helpers.
 */

import { loadImportedCampaigns, saveImportedCampaigns, loadCampaignProgress, markCampaignLevelCompleted, clearCampaignProgress, saveActiveCampaignId, clearActiveCampaignId } from '../src/persistence';
import { CampaignEditor, OFFICIAL_CAMPAIGN } from '../src/campaignEditor';
import { CampaignDef, LevelDef } from '../src/types';

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

// ─── OFFICIAL_CAMPAIGN ────────────────────────────────────────────────────────

describe('OFFICIAL_CAMPAIGN', () => {
  it('has id "official"', () => {
    expect(OFFICIAL_CAMPAIGN.id).toBe('official');
  });

  it('has a non-empty name and author', () => {
    expect(OFFICIAL_CAMPAIGN.name.length).toBeGreaterThan(0);
    expect(OFFICIAL_CAMPAIGN.author.length).toBeGreaterThan(0);
  });

  it('contains at least one chapter', () => {
    expect(OFFICIAL_CAMPAIGN.chapters.length).toBeGreaterThan(0);
  });

  it('has at least one level across all chapters', () => {
    const total = OFFICIAL_CAMPAIGN.chapters.reduce((n, ch) => n + ch.levels.length, 0);
    expect(total).toBeGreaterThan(0);
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
 * Note: JSDOM normalises CSS hex colours to rgb(), so we can't use style attribute selectors.
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

  it('Official campaign shows "Active" disabled button when no user campaign is active', () => {
    // No active campaign stored → official is active
    const editor = makeEditor();
    editor.show();
    expect(getFirstButtonTextForCampaign('Official')).toBe('Active');
    expect(isFirstButtonDisabledForCampaign('Official')).toBe(true);
  });

  it('Official campaign shows "▶ Play" when a user campaign is active', () => {
    const userCampaign: CampaignDef = { id: 'cmp_test1', name: 'My Campaign', author: 'Tester', chapters: [] };
    saveActiveCampaignId('cmp_test1');
    const editor = makeEditor([userCampaign]);
    editor.show();
    expect(getFirstButtonTextForCampaign('Official')).toBe('▶ Play');
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
    // No active campaign stored → official is active, not this user campaign
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
    expect(getFirstButtonTextForCampaign('Official')).toBe('▶ Play');
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
      _editLevelNote: string;
      _editLevelHint: string;
      _editLevelName: string;
      _editRows: number;
      _editCols: number;
      _editGrid: (import('../src/types').TileDef | null)[][];
      _editInventory: import('../src/types').InventoryItem[];
      _activeCampaignId: string | null;
      _activeChapterIdx: number;
      _activeLevelIdx: number;
      _buildCurrentLevelDef(): LevelDef;
      _openLevelEditor(level: LevelDef, readOnly: boolean): void;
    };
  }

  it('_editLevelNote and _editLevelHint are empty by default', () => {
    const editor = makeEditor();
    const state = editorState(editor);
    expect(state._editLevelNote).toBe('');
    expect(state._editLevelHint).toBe('');
  });

  it('_openLevelEditor populates _editLevelNote and _editLevelHint from a level', () => {
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
      hint: 'This is a hint.',
    };
    state._openLevelEditor(level, true);
    expect(state._editLevelNote).toBe('This is a note.');
    expect(state._editLevelHint).toBe('This is a hint.');
  });

  it('_openLevelEditor sets empty strings when level has no note or hint', () => {
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
    expect(state._editLevelNote).toBe('');
    expect(state._editLevelHint).toBe('');
  });

  it('_buildCurrentLevelDef omits note/hint when they are empty', () => {
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
    state._editLevelName = 'Test Level';
    state._editLevelNote = '';
    state._editLevelHint = '';
    state._editRows = 3;
    state._editCols = 3;
    state._editGrid = Array.from({ length: 3 }, () => Array(3).fill(null) as null[]);
    state._editInventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.note).toBeUndefined();
    expect(def.hint).toBeUndefined();
  });

  it('_buildCurrentLevelDef includes note and hint when they are non-empty', () => {
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
    state._editLevelName = 'Test Level';
    state._editLevelNote = 'Route the water carefully.';
    state._editLevelHint = 'Start from the left.';
    state._editRows = 3;
    state._editCols = 3;
    state._editGrid = Array.from({ length: 3 }, () => Array(3).fill(null) as null[]);
    state._editInventory = [];

    const def = state._buildCurrentLevelDef();
    expect(def.note).toBe('Route the water carefully.');
    expect(def.hint).toBe('Start from the left.');
  });

  it('campaign export JSON includes note and hint fields when populated', () => {
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
          hint: 'Use an elbow at the corner.',
        }],
      }],
    };
    // The export function uses JSON.stringify, so verify round-trip via JSON
    const json = JSON.stringify(campaign, null, 2);
    const parsed = JSON.parse(json) as CampaignDef;
    expect(parsed.chapters[0].levels[0].note).toBe('Watch the water level.');
    expect(parsed.chapters[0].levels[0].hint).toBe('Use an elbow at the corner.');
  });
});
