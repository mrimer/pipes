/**
 * @jest-environment jsdom
 */

import { CampaignEditor } from '../../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef } from '../../src/types';
import { PipeShape } from '../../src/types';
import type { TileParams } from '../../src/campaignEditor/types';
import {
  campaignEditorTestBeforeAll,
  campaignEditorTestAfterAll,
  makeEditor,
} from '../campaignEditorTestHelpers';

beforeAll(campaignEditorTestBeforeAll);
afterAll(campaignEditorTestAfterAll);
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
      grid: (TileDef | null)[][];
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

import { getValidTileDefKeys } from '../../src/campaignEditor/types';

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

