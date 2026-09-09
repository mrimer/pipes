/**
 * @jest-environment jsdom
 */

import type { CampaignEditor } from '../../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef, InventoryItem } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { TileParams } from '../../src/campaignEditor/types';
import { musicManager } from '../../src/audio/musicManager';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
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

  it('switches level-editor music when the challenge toggle changes', () => {
    const playGroupSpy = jest.spyOn(musicManager, 'playGroup').mockImplementation(() => {});
    const campaign: CampaignDef = {
      id: 'cmp_music_toggle',
      name: 'Music Toggle Campaign',
      author: 'Tester',
      chapters: [{
        id: 1,
        name: 'Chapter 1',
        levels: [],
      }],
    };
    const editor = makeEditor([campaign]);
    const state = editorState(editor);
    const level: LevelDef = {
      id: 99012,
      name: 'Music Level',
      rows: 2,
      cols: 2,
      grid: Array.from({ length: 2 }, () => Array(2).fill(null) as null[]),
      inventory: [],
      style: 'Winter',
    };

    state._activeCampaignId = campaign.id;
    state._activeChapterIdx = 0;
    state._activeLevelIdx = 0;
    state._openLevelEditor(level, false);
    playGroupSpy.mockClear();

    const checkbox = document.getElementById('editor-challenge-chk') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));
    expect(playGroupSpy).toHaveBeenLastCalledWith('challenge');

    checkbox!.checked = false;
    checkbox!.dispatchEvent(new Event('change'));
    expect(playGroupSpy).toHaveBeenLastCalledWith('Winter');
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
        buildTileDef(): TileDef;
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

