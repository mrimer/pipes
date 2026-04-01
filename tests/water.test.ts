/**
 * @jest-environment jsdom
 */

/** Tests for water-remaining persistence and level-select water display. */

import { loadLevelWater, saveLevelWater, clearLevelWater, clearLevelWaterRecord } from '../src/persistence';
import { renderLevelList } from '../src/levelSelect';
import { LevelDef, PipeShape, Direction } from '../src/types';

// ─── Persistence helpers ──────────────────────────────────────────────────────

describe('loadLevelWater / saveLevelWater / clearLevelWater', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty object when nothing has been saved', () => {
    expect(loadLevelWater()).toEqual({});
  });

  it('saves and loads a water value for a level', () => {
    saveLevelWater(42, 7);
    expect(loadLevelWater()[42]).toBe(7);
  });

  it('only updates the stored value when new water is greater than the existing max', () => {
    saveLevelWater(7, 5);
    saveLevelWater(7, 3); // lower – should not overwrite
    expect(loadLevelWater()[7]).toBe(5);
    saveLevelWater(7, 8); // higher – should overwrite
    expect(loadLevelWater()[7]).toBe(8);
  });

  it('stores water for multiple levels independently', () => {
    saveLevelWater(1, 10);
    saveLevelWater(2, 4);
    const water = loadLevelWater();
    expect(water[1]).toBe(10);
    expect(water[2]).toBe(4);
  });

  it('clears all water progress', () => {
    saveLevelWater(5, 3);
    clearLevelWater();
    expect(loadLevelWater()).toEqual({});
  });

  it('uses separate storage keys for official and campaign water', () => {
    saveLevelWater(10, 2);              // official
    saveLevelWater(10, 5, 'cmp_abc');   // campaign
    expect(loadLevelWater()[10]).toBe(2);
    expect(loadLevelWater('cmp_abc')[10]).toBe(5);
  });

  it('clearLevelWater with campaignId only clears that campaign', () => {
    saveLevelWater(10, 2);
    saveLevelWater(10, 5, 'cmp_abc');
    clearLevelWater('cmp_abc');
    expect(loadLevelWater()[10]).toBe(2);
    expect(loadLevelWater('cmp_abc')[10]).toBeUndefined();
  });

  it('returns {} gracefully when localStorage contains invalid JSON', () => {
    localStorage.setItem('pipes_level_water', 'not-json');
    expect(loadLevelWater()).toEqual({});
  });
});

// ─── clearLevelWaterRecord ────────────────────────────────────────────────────

describe('clearLevelWaterRecord', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes only the specified level from the water record', () => {
    saveLevelWater(1, 10);
    saveLevelWater(2, 4);
    clearLevelWaterRecord(1);
    expect(loadLevelWater()[1]).toBeUndefined();
    expect(loadLevelWater()[2]).toBe(4);
  });

  it('does nothing when the level has no stored water record', () => {
    saveLevelWater(5, 3);
    clearLevelWaterRecord(99); // no record for level 99
    expect(loadLevelWater()[5]).toBe(3);
  });

  it('works with a campaign-specific water record', () => {
    saveLevelWater(10, 5, 'cmp_abc');
    saveLevelWater(11, 2, 'cmp_abc');
    clearLevelWaterRecord(10, 'cmp_abc');
    expect(loadLevelWater('cmp_abc')[10]).toBeUndefined();
    expect(loadLevelWater('cmp_abc')[11]).toBe(2);
  });

  it('does not affect the official water record when called with a campaign ID', () => {
    saveLevelWater(10, 2);
    saveLevelWater(10, 5, 'cmp_abc');
    clearLevelWaterRecord(10, 'cmp_abc');
    expect(loadLevelWater()[10]).toBe(2);
  });
});

// ─── Level-select water display ───────────────────────────────────────────────

/** Minimal level for testing. */
function makeLevel(id: number, challenge?: boolean): LevelDef {
  return {
    id,
    name: `Level ${id}`,
    rows: 1,
    cols: 2,
    grid: [
      [
        { shape: PipeShape.Source, connections: [Direction.East], capacity: 10 },
        { shape: PipeShape.Sink,   connections: [Direction.West] },
      ],
    ],
    inventory: [],
    challenge,
  };
}

function makeLevelListEl(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('renderLevelList water display', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('shows 💧 N in chapter header when completed levels have water', () => {
    const level = makeLevel(1);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const levelWater: Record<number, number> = { 1: 4 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {}, levelWater,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).toContain('💧 4');
  });

  it('does not show 💧 in chapter header when no water is recorded for completed levels', () => {
    const level = makeLevel(1);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {}, {},
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).not.toContain('💧');
  });

  it('sums water across multiple completed levels in a chapter', () => {
    const levels = [makeLevel(1), makeLevel(2)];
    const chapters = [{ id: 1, name: 'Ch1', levels }];
    const levelWater: Record<number, number> = { 1: 3, 2: 5 };

    renderLevelList(
      container, new Set<number>([1, 2]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {}, levelWater,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).toContain('💧 8');
  });

  it('shows 💧 in campaign header when any levels are completed with water', () => {
    const level = makeLevel(1);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const levelWater: Record<number, number> = { 1: 5 };
    const activeCampaign = { name: 'My Campaign', author: 'Tester', completionPct: 50 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, {}, levelWater,
    );

    const header = container.querySelector('div');
    expect(header?.textContent).toContain('💧');
    expect(header?.textContent).toContain('5');
  });

  it('shows 💀 challenge count in campaign header', () => {
    const normalLevel = makeLevel(1);
    const challengeLevel = makeLevel(2, true);
    const chapters = [{ id: 1, name: 'Ch1', levels: [normalLevel, challengeLevel] }];
    const activeCampaign = { name: 'My Campaign', author: 'Tester', completionPct: 50 };

    renderLevelList(
      container, new Set<number>([1, 2]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, {}, {},
    );

    const header = container.querySelector('div');
    expect(header?.textContent).toContain('💀');
    expect(header?.textContent).toContain('1/1');
  });
});
