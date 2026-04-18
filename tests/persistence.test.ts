/**
 * @jest-environment jsdom
 */

/**
 * Tests for persistence helpers in persistence.ts that are not yet covered
 * by stars.test.ts or water.test.ts:
 *   – loadCompletedLevels / markLevelCompleted / clearCompletedLevels / markAllLevelsCompleted
 *   – computeCampaignCompletionPct
 *   – loadCompletedChapters / markChapterCompleted / clearCompletedChapters
 *   – migrateCampaign
 *   – loadActiveCampaignId / saveActiveCampaignId / clearActiveCampaignId
 *   – loadCampaignProgress / markCampaignLevelCompleted / clearCampaignProgress
 */

import {
  loadCompletedLevels,
  markLevelCompleted,
  clearCompletedLevels,
  markAllLevelsCompleted,
  computeCampaignCompletionPct,
  loadCompletedChapters,
  markChapterCompleted,
  clearCompletedChapters,
  migrateCampaign,
  loadActiveCampaignId,
  saveActiveCampaignId,
  clearActiveCampaignId,
  loadCampaignProgress,
  markCampaignLevelCompleted,
  clearCampaignProgress,
  loadCommandKeyAssignments,
  saveCommandKeyAssignments,
  clearCommandKeyAssignments,
} from '../src/persistence';
import { CampaignDef } from '../src/types';

beforeEach(() => {
  localStorage.clear();
});

// ─── loadCompletedLevels / markLevelCompleted / clearCompletedLevels ──────────

describe('loadCompletedLevels', () => {
  it('returns empty Set when nothing is stored', () => {
    const result = loadCompletedLevels();
    expect(result.size).toBe(0);
    expect(result).toBeInstanceOf(Set);
  });

  it('returns empty Set when localStorage contains invalid JSON', () => {
    localStorage.setItem('pipes_completed', 'not-valid-json');
    expect(loadCompletedLevels().size).toBe(0);
  });
});

describe('markLevelCompleted', () => {
  it('adds the level ID to the in-memory set and persists it', () => {
    const completed = new Set<number>();
    markLevelCompleted(completed, 5);
    expect(completed.has(5)).toBe(true);
    // Reloading should reflect the persisted value
    const loaded = loadCompletedLevels();
    expect(loaded.has(5)).toBe(true);
  });

  it('marking multiple levels accumulates them', () => {
    const completed = new Set<number>();
    markLevelCompleted(completed, 1);
    markLevelCompleted(completed, 2);
    markLevelCompleted(completed, 3);
    expect(completed.size).toBe(3);
    const loaded = loadCompletedLevels();
    expect(loaded.has(1)).toBe(true);
    expect(loaded.has(2)).toBe(true);
    expect(loaded.has(3)).toBe(true);
  });

  it('marking the same level twice is idempotent', () => {
    const completed = new Set<number>();
    markLevelCompleted(completed, 7);
    markLevelCompleted(completed, 7);
    expect(completed.size).toBe(1);
  });
});

describe('clearCompletedLevels', () => {
  it('empties the set and removes the stored value', () => {
    const completed = new Set<number>([1, 2, 3]);
    localStorage.setItem('pipes_completed', JSON.stringify([1, 2, 3]));
    clearCompletedLevels(completed);
    expect(completed.size).toBe(0);
    expect(loadCompletedLevels().size).toBe(0);
  });
});

// ─── markAllLevelsCompleted ───────────────────────────────────────────────────

describe('markAllLevelsCompleted', () => {
  it('marks every provided level ID as completed', () => {
    const completed = new Set<number>();
    markAllLevelsCompleted(completed, [10, 20, 30]);
    expect(completed.has(10)).toBe(true);
    expect(completed.has(20)).toBe(true);
    expect(completed.has(30)).toBe(true);
    expect(completed.size).toBe(3);
  });

  it('persists all level IDs to localStorage', () => {
    const completed = new Set<number>();
    markAllLevelsCompleted(completed, [1, 2, 3]);
    const loaded = loadCompletedLevels();
    expect(loaded.has(1)).toBe(true);
    expect(loaded.has(2)).toBe(true);
    expect(loaded.has(3)).toBe(true);
  });

  it('handles an empty list gracefully', () => {
    const completed = new Set<number>();
    markAllLevelsCompleted(completed, []);
    expect(completed.size).toBe(0);
  });

  it('merges with existing completed levels', () => {
    const completed = new Set<number>([5]);
    markAllLevelsCompleted(completed, [10, 20]);
    expect(completed.has(5)).toBe(true);
    expect(completed.has(10)).toBe(true);
    expect(completed.has(20)).toBe(true);
  });
});

// ─── computeCampaignCompletionPct ─────────────────────────────────────────────

function makeCampaign(levelIds: number[][]): CampaignDef {
  return {
    id: 'test_cmp',
    name: 'Test',
    author: 'tester',
    chapters: levelIds.map((ids, i) => ({
      id: i + 1,
      name: `Chapter ${i + 1}`,
      levels: ids.map((id) => ({
        id,
        name: `Level ${id}`,
        rows: 1,
        cols: 1,
        grid: [[null]],
        inventory: [],
      })),
      rows: 1,
      cols: 1,
      grid: [[null]],
    })),
  };
}

describe('computeCampaignCompletionPct', () => {
  it('returns 0 when the campaign has no levels', () => {
    const campaign = makeCampaign([]);
    expect(computeCampaignCompletionPct(campaign, new Set())).toBe(0);
  });

  it('returns 0 when none of the levels are completed', () => {
    const campaign = makeCampaign([[1, 2, 3]]);
    expect(computeCampaignCompletionPct(campaign, new Set())).toBe(0);
  });

  it('returns 100 when all levels are completed', () => {
    const campaign = makeCampaign([[1, 2, 3]]);
    const progress = new Set([1, 2, 3]);
    expect(computeCampaignCompletionPct(campaign, progress)).toBe(100);
  });

  it('returns 50 when half the levels are completed', () => {
    const campaign = makeCampaign([[1, 2, 3, 4]]);
    const progress = new Set([1, 2]);
    expect(computeCampaignCompletionPct(campaign, progress)).toBe(50);
  });

  it('aggregates levels across multiple chapters', () => {
    const campaign = makeCampaign([[1, 2], [3, 4]]);
    const progress = new Set([1, 3]); // 2 out of 4
    expect(computeCampaignCompletionPct(campaign, progress)).toBe(50);
  });

  it('rounds to the nearest integer', () => {
    const campaign = makeCampaign([[1, 2, 3]]);
    const progress = new Set([1]); // 1/3 ≈ 33.33%
    const pct = computeCampaignCompletionPct(campaign, progress);
    expect(pct).toBe(33);
  });
});

// ─── Chapter completion ───────────────────────────────────────────────────────

describe('loadCompletedChapters / markChapterCompleted / clearCompletedChapters', () => {
  it('loadCompletedChapters returns empty Set when nothing is stored', () => {
    expect(loadCompletedChapters('cmp_1').size).toBe(0);
  });

  it('markChapterCompleted adds the chapter to the set and persists it', () => {
    const completed = new Set<number>();
    markChapterCompleted('cmp_1', 42, completed);
    expect(completed.has(42)).toBe(true);
    const loaded = loadCompletedChapters('cmp_1');
    expect(loaded.has(42)).toBe(true);
  });

  it('clearCompletedChapters empties the set and removes from storage', () => {
    const completed = new Set<number>([1, 2]);
    markChapterCompleted('cmp_1', 1, completed);
    markChapterCompleted('cmp_1', 2, completed);
    clearCompletedChapters('cmp_1', completed);
    expect(completed.size).toBe(0);
    expect(loadCompletedChapters('cmp_1').size).toBe(0);
  });

  it('uses separate storage keys per campaign ID', () => {
    const a = new Set<number>();
    const b = new Set<number>();
    markChapterCompleted('cmp_A', 1, a);
    markChapterCompleted('cmp_B', 2, b);
    expect(loadCompletedChapters('cmp_A').has(1)).toBe(true);
    expect(loadCompletedChapters('cmp_A').has(2)).toBe(false);
    expect(loadCompletedChapters('cmp_B').has(2)).toBe(true);
    expect(loadCompletedChapters('cmp_B').has(1)).toBe(false);
  });
});

// ─── Active campaign ──────────────────────────────────────────────────────────

describe('loadActiveCampaignId / saveActiveCampaignId / clearActiveCampaignId', () => {
  it('returns null when nothing has been saved', () => {
    expect(loadActiveCampaignId()).toBeNull();
  });

  it('returns the saved campaign ID after saveActiveCampaignId', () => {
    saveActiveCampaignId('cmp_abc');
    expect(loadActiveCampaignId()).toBe('cmp_abc');
  });

  it('clearActiveCampaignId reverts to null', () => {
    saveActiveCampaignId('cmp_xyz');
    clearActiveCampaignId();
    expect(loadActiveCampaignId()).toBeNull();
  });

  it('overwriting with a new campaign ID works', () => {
    saveActiveCampaignId('cmp_first');
    saveActiveCampaignId('cmp_second');
    expect(loadActiveCampaignId()).toBe('cmp_second');
  });
});

// ─── Per-campaign progress ────────────────────────────────────────────────────

describe('loadCampaignProgress / markCampaignLevelCompleted / clearCampaignProgress', () => {
  it('loadCampaignProgress returns empty Set when nothing is stored', () => {
    expect(loadCampaignProgress('cmp_1').size).toBe(0);
  });

  it('markCampaignLevelCompleted adds the level and persists it', () => {
    const progress = new Set<number>();
    markCampaignLevelCompleted('cmp_1', 99, progress);
    expect(progress.has(99)).toBe(true);
    const loaded = loadCampaignProgress('cmp_1');
    expect(loaded.has(99)).toBe(true);
  });

  it('clearCampaignProgress empties the set and removes from storage', () => {
    const progress = new Set<number>([1, 2]);
    markCampaignLevelCompleted('cmp_1', 1, progress);
    clearCampaignProgress('cmp_1', progress);
    expect(progress.size).toBe(0);
    expect(loadCampaignProgress('cmp_1').size).toBe(0);
  });

  it('uses separate storage keys per campaign ID', () => {
    const pA = new Set<number>();
    const pB = new Set<number>();
    markCampaignLevelCompleted('cmp_A', 10, pA);
    markCampaignLevelCompleted('cmp_B', 20, pB);
    expect(loadCampaignProgress('cmp_A').has(10)).toBe(true);
    expect(loadCampaignProgress('cmp_A').has(20)).toBe(false);
    expect(loadCampaignProgress('cmp_B').has(20)).toBe(true);
  });
});

describe('loadCommandKeyAssignments / saveCommandKeyAssignments / clearCommandKeyAssignments', () => {
  it('returns null when no command keys are stored', () => {
    expect(loadCommandKeyAssignments()).toBeNull();
  });

  it('saves and loads command key assignments', () => {
    saveCommandKeyAssignments({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
    expect(loadCommandKeyAssignments()).toEqual({ undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
  });

  it('clears stored command key assignments', () => {
    saveCommandKeyAssignments({ undo: 'Ctrl+Z' });
    clearCommandKeyAssignments();
    expect(loadCommandKeyAssignments()).toBeNull();
  });
});

// ─── migrateCampaign ─────────────────────────────────────────────────────────

describe('migrateCampaign', () => {
  function makeCampaignWithGrid(grid: unknown[][]): CampaignDef {
    return {
      id: 'cmp_test',
      name: 'Test',
      author: 'tester',
      chapters: [{
        id: 1,
        name: 'Chapter 1',
        levels: [{
          id: 101,
          name: 'Level 1',
          rows: 1,
          cols: grid[0]?.length ?? 1,
          grid: grid as (import('../src/types').TileDef | null)[][],
          inventory: [],
        }],
        rows: 1,
        cols: 1,
        grid: [[null]],
      }],
    };
  }

  /** Cast a strongly-typed level to a plain record to access deprecated fields in tests. */
  function asRecord(obj: unknown): Record<string, unknown> {
    return obj as Record<string, unknown>;
  }

  it('migrates chamberContent "weak_ice" → "snow"', () => {
    const campaign = makeCampaignWithGrid([
      [{ shape: 'CHAMBER', chamberContent: 'weak_ice' }],
    ]);
    const migrated = migrateCampaign(campaign);
    expect(migrated.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });

  it('does not mutate tiles that are already "snow"', () => {
    const campaign = makeCampaignWithGrid([
      [{ shape: 'CHAMBER', chamberContent: 'snow' }],
    ]);
    migrateCampaign(campaign);
    expect(campaign.chapters[0].levels[0].grid[0][0]?.chamberContent).toBe('snow');
  });

  it('migrates deprecated single-string "hint" to "hints" array', () => {
    const campaign = makeCampaignWithGrid([[null]]);
    // Add deprecated hint field
    asRecord(campaign.chapters[0].levels[0])['hint'] = 'Use elbow pipes';
    const migrated = migrateCampaign(campaign);
    const level = migrated.chapters[0].levels[0];
    expect(level.hints).toEqual(['Use elbow pipes']);
    expect(asRecord(level)['hint']).toBeUndefined();
  });

  it('does not overwrite an existing hints array with the deprecated hint', () => {
    const campaign = makeCampaignWithGrid([[null]]);
    const level = campaign.chapters[0].levels[0];
    level.hints = ['Existing hint'];
    asRecord(level)['hint'] = 'Old hint';
    migrateCampaign(campaign);
    expect(level.hints).toEqual(['Existing hint']);
    expect(asRecord(level)['hint']).toBeUndefined();
  });

  it('does not add empty/whitespace hints from deprecated hint field', () => {
    const campaign = makeCampaignWithGrid([[null]]);
    asRecord(campaign.chapters[0].levels[0])['hint'] = '   ';
    migrateCampaign(campaign);
    expect(campaign.chapters[0].levels[0].hints).toBeUndefined();
  });

  it('handles null tiles in the grid without throwing', () => {
    const campaign = makeCampaignWithGrid([[null, null]]);
    expect(() => migrateCampaign(campaign)).not.toThrow();
  });

  it('handles non-chamber tiles without modifying chamberContent', () => {
    const campaign = makeCampaignWithGrid([
      [{ shape: 'STRAIGHT' }],
    ]);
    expect(() => migrateCampaign(campaign)).not.toThrow();
    expect(campaign.chapters[0].levels[0].grid[0][0]?.chamberContent).toBeUndefined();
  });
});

// ─── Campaign mastered shown flag ─────────────────────────────────────────────

import {
  loadCampaignMasteredShown,
  markCampaignMasteredShown,
  clearCampaignMasteredShown,
} from '../src/persistence';

describe('loadCampaignMasteredShown / markCampaignMasteredShown / clearCampaignMasteredShown', () => {
  it('returns false when nothing is stored', () => {
    expect(loadCampaignMasteredShown('cmp_1')).toBe(false);
  });

  it('returns true after markCampaignMasteredShown', () => {
    markCampaignMasteredShown('cmp_1');
    expect(loadCampaignMasteredShown('cmp_1')).toBe(true);
  });

  it('clearCampaignMasteredShown resets the flag to false', () => {
    markCampaignMasteredShown('cmp_1');
    clearCampaignMasteredShown('cmp_1');
    expect(loadCampaignMasteredShown('cmp_1')).toBe(false);
  });

  it('uses separate storage keys per campaign ID', () => {
    markCampaignMasteredShown('cmp_A');
    expect(loadCampaignMasteredShown('cmp_A')).toBe(true);
    expect(loadCampaignMasteredShown('cmp_B')).toBe(false);
  });

  it('marking the same campaign twice is idempotent', () => {
    markCampaignMasteredShown('cmp_1');
    markCampaignMasteredShown('cmp_1');
    expect(loadCampaignMasteredShown('cmp_1')).toBe(true);
  });
});
