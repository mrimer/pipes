/**
 * Tests for pure utility functions in campaignEditor/types.ts.
 */

import { PipeShape, Direction } from '../src/types';
import {
  getValidTileDefKeys,
  getValidChapterMapTileDefKeys,
  chamberColor,
  isChamberPalette,
  chamberPaletteContent,
  generateCampaignId,
  generateLevelId,
  REPEATABLE_EDITOR_TILES,
  EditorScreen,
} from '../src/campaignEditor/types';

// ─── isChamberPalette ─────────────────────────────────────────────────────────

describe('isChamberPalette', () => {
  it('returns true for a chamber:* string', () => {
    expect(isChamberPalette('chamber:tank')).toBe(true);
    expect(isChamberPalette('chamber:dirt')).toBe(true);
    expect(isChamberPalette('chamber:level')).toBe(true);
  });

  it('returns false for a plain PipeShape string', () => {
    expect(isChamberPalette(PipeShape.Straight)).toBe(false);
    expect(isChamberPalette(PipeShape.Source)).toBe(false);
  });

  it('returns false for "erase"', () => {
    expect(isChamberPalette('erase')).toBe(false);
  });
});

// ─── chamberPaletteContent ────────────────────────────────────────────────────

describe('chamberPaletteContent', () => {
  it('extracts "tank" from "chamber:tank"', () => {
    expect(chamberPaletteContent('chamber:tank')).toBe('tank');
  });

  it('extracts "dirt" from "chamber:dirt"', () => {
    expect(chamberPaletteContent('chamber:dirt')).toBe('dirt');
  });

  it('extracts "level" from "chamber:level"', () => {
    expect(chamberPaletteContent('chamber:level')).toBe('level');
  });

  it('extracts "hot_plate" from "chamber:hot_plate"', () => {
    expect(chamberPaletteContent('chamber:hot_plate')).toBe('hot_plate');
  });
});

// ─── chamberColor ─────────────────────────────────────────────────────────────

describe('chamberColor', () => {
  it('returns correct color for "tank"', () => {
    expect(chamberColor('tank')).toBe('#74b9ff');
  });

  it('returns correct color for "dirt"', () => {
    expect(chamberColor('dirt')).toMatch(/^#/);
  });

  it('returns correct color for "item"', () => {
    expect(chamberColor('item')).toBe('#ffd700');
  });

  it('returns correct color for "heater"', () => {
    expect(chamberColor('heater')).toBe('#e17055');
  });

  it('returns correct color for "ice"', () => {
    expect(chamberColor('ice')).toMatch(/^#/);
  });

  it('returns correct color for "pump"', () => {
    expect(chamberColor('pump')).toBe('#a8e063');
  });

  it('returns correct color for "snow"', () => {
    expect(chamberColor('snow')).toBe('#b0d8f8');
  });

  it('returns correct color for "sandstone"', () => {
    expect(chamberColor('sandstone')).toBe('#c2a26e');
  });

  it('returns correct color for "star"', () => {
    expect(chamberColor('star')).toBe('#f0c040');
  });

  it('returns correct color for "hot_plate"', () => {
    expect(chamberColor('hot_plate')).toBe('#e44');
  });

  it('returns correct color for "level"', () => {
    expect(chamberColor('level')).toBe('#2a3a5e');
  });

  it('returns fallback color for unknown content', () => {
    expect(chamberColor('unknown')).toBe('#b2bec3');
    expect(chamberColor('')).toBe('#b2bec3');
  });
});

// ─── getValidTileDefKeys ──────────────────────────────────────────────────────

describe('getValidTileDefKeys', () => {
  it('Straight tile has "shape" and "rotation"', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Straight });
    expect(keys.has('shape')).toBe(true);
    expect(keys.has('rotation')).toBe(true);
  });

  it('Cross tile has "shape" but not "rotation" (symmetric shape)', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Cross });
    expect(keys.has('shape')).toBe(true);
    expect(keys.has('rotation')).toBe(false);
  });

  it('Source tile has capacity, connections, temperature, pressure', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Source });
    expect(keys.has('shape')).toBe(true);
    expect(keys.has('capacity')).toBe(true);
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('temperature')).toBe(true);
    expect(keys.has('pressure')).toBe(true);
    expect(keys.has('rotation')).toBe(false);
  });

  it('Sink tile has connections', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Sink });
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('capacity')).toBe(false);
  });

  it('Chamber/tank tile has capacity and connections', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'tank' });
    expect(keys.has('chamberContent')).toBe(true);
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('capacity')).toBe(true);
  });

  it('Chamber/item tile has itemShape and itemCount', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'item' });
    expect(keys.has('itemShape')).toBe(true);
    expect(keys.has('itemCount')).toBe(true);
  });

  it('Chamber/heater tile has temperature (heater is not a cost chamber)', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'heater' });
    expect(keys.has('temperature')).toBe(true);
    expect(keys.has('cost')).toBe(false);
  });

  it('Chamber/pump tile has pressure (pump is not a cost chamber)', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'pump' });
    expect(keys.has('pressure')).toBe(true);
    expect(keys.has('cost')).toBe(false);
  });

  it('Chamber/ice tile has cost and temperature', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'ice' });
    expect(keys.has('cost')).toBe(true);
    expect(keys.has('temperature')).toBe(true);
  });

  it('Chamber/dirt tile has cost', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'dirt' });
    expect(keys.has('cost')).toBe(true);
  });

  it('Chamber/sandstone tile has hardness and shatter', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'sandstone' });
    expect(keys.has('hardness')).toBe(true);
    expect(keys.has('shatter')).toBe(true);
  });

  it('Chamber/level tile has levelIdx', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'level' });
    expect(keys.has('levelIdx')).toBe(true);
  });

  it('Cement tile has dryingTime', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Cement });
    expect(keys.has('dryingTime')).toBe(true);
    expect(keys.has('rotation')).toBe(false);
  });

  it('SpinStraightCement tile has dryingTime and rotation', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.SpinStraightCement });
    expect(keys.has('dryingTime')).toBe(true);
    expect(keys.has('rotation')).toBe(true);
  });

  it('SpinElbowCement tile has dryingTime', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.SpinElbowCement });
    expect(keys.has('dryingTime')).toBe(true);
  });

  it('SpinTeeCement tile has dryingTime', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.SpinTeeCement });
    expect(keys.has('dryingTime')).toBe(true);
  });

  it('Granite tile has only "shape"', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.Granite });
    expect(keys.has('shape')).toBe(true);
    expect(keys.has('rotation')).toBe(false);
    expect(keys.has('connections')).toBe(false);
  });

  it('OneWay tile has rotation', () => {
    const keys = getValidTileDefKeys({ shape: PipeShape.OneWay });
    expect(keys.has('rotation')).toBe(true);
  });
});

// ─── getValidChapterMapTileDefKeys ────────────────────────────────────────────

describe('getValidChapterMapTileDefKeys', () => {
  it('Straight tile has "shape" and "rotation"', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Straight });
    expect(keys.has('shape')).toBe(true);
    expect(keys.has('rotation')).toBe(true);
  });

  it('Source tile has connections but not capacity/temperature/pressure', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Source });
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('capacity')).toBe(false);
    expect(keys.has('temperature')).toBe(false);
    expect(keys.has('pressure')).toBe(false);
  });

  it('Sink tile has connections and completion', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Sink });
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('completion')).toBe(true);
    expect(keys.has('capacity')).toBe(false);
  });

  it('Chamber/level tile has levelIdx', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'level' });
    expect(keys.has('chamberContent')).toBe(true);
    expect(keys.has('connections')).toBe(true);
    expect(keys.has('levelIdx')).toBe(true);
  });

  it('Chamber/tank tile does NOT have levelIdx', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Chamber, chamberContent: 'tank' });
    expect(keys.has('levelIdx')).toBe(false);
  });

  it('Granite tile has only "shape"', () => {
    const keys = getValidChapterMapTileDefKeys({ shape: PipeShape.Granite });
    expect(keys.has('shape')).toBe(true);
    expect(keys.size).toBe(1);
  });
});

// ─── generateCampaignId ───────────────────────────────────────────────────────

describe('generateCampaignId', () => {
  it('starts with "cmp_"', () => {
    expect(generateCampaignId()).toMatch(/^cmp_/);
  });

  it('generates unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, generateCampaignId));
    expect(ids.size).toBe(20);
  });

  it('has at least three underscore-separated segments', () => {
    const id = generateCampaignId();
    const parts = id.split('_');
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── generateLevelId ─────────────────────────────────────────────────────────

describe('generateLevelId', () => {
  it('returns a number >= 10000', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateLevelId()).toBeGreaterThanOrEqual(10000);
    }
  });

  it('returns a number < 100000', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateLevelId()).toBeLessThan(100000);
    }
  });

  it('does not always return the same value', () => {
    const ids = new Set(Array.from({ length: 50 }, generateLevelId));
    expect(ids.size).toBeGreaterThan(1);
  });
});

// ─── REPEATABLE_EDITOR_TILES ─────────────────────────────────────────────────

describe('REPEATABLE_EDITOR_TILES', () => {
  it('includes common pipe shapes', () => {
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Straight)).toBe(true);
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Elbow)).toBe(true);
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Tee)).toBe(true);
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Cross)).toBe(true);
  });

  it('includes Granite', () => {
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Granite)).toBe(true);
  });

  it('does NOT include Source or Sink (placed singly, not by drag)', () => {
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Source)).toBe(false);
    expect(REPEATABLE_EDITOR_TILES.has(PipeShape.Sink)).toBe(false);
  });
});

// ─── EditorScreen ─────────────────────────────────────────────────────────────

describe('EditorScreen enum', () => {
  it('has the expected string values', () => {
    expect(EditorScreen.List).toBe('list');
    expect(EditorScreen.Campaign).toBe('campaign');
    expect(EditorScreen.Chapter).toBe('chapter');
    expect(EditorScreen.LevelEditor).toBe('levelEditor');
  });
});
