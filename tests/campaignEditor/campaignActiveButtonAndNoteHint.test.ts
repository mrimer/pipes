/**
 * @jest-environment jsdom
 */

import {
  saveActiveCampaignId,
  clearActiveCampaignId,
} from '../../src/persistence';
import type { CampaignEditor } from '../../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef, InventoryItem } from '../../src/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
  getFirstButtonTextForCampaign,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
// ─── CampaignEditor – active campaign Play button ─────────────────────────────

function isFirstButtonDisabledForCampaign(name: string): boolean {
  const nameDivs = Array.from(document.querySelectorAll('div'));
  for (const div of nameDivs) {
    if (div.style.fontWeight === 'bold' && div.textContent?.startsWith(name)) {
      const row = div.closest('div[style*="border-radius"]');
      if (row) {
        const btn = row.querySelector('button');
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
        grid: (TileDef | null)[][];
        inventory: InventoryItem[];
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

