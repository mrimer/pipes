/**
 * @jest-environment jsdom
 */

/**
 * Tests for partial-progress persistence helpers added to persistence.ts:
 *   – loadPartialProgress / savePartialProgressEntry / deletePartialProgress
 *   – getPartialProgressFor / getMostRecentPartialProgress / replaceAllPartialProgress
 *   – loadSaveNoticeSuppressed / saveSaveNoticeSuppressed
 *   – slot-prefix isolation (p() keying)
 */

import {
  loadPartialProgress,
  savePartialProgressEntry,
  deletePartialProgress,
  getPartialProgressFor,
  getMostRecentPartialProgress,
  replaceAllPartialProgress,
  mergePartialProgress,
  loadSaveNoticeSuppressed,
  saveSaveNoticeSuppressed,
} from '../src/persistence';
import { setActiveSlotIndex } from '../src/profile/activeProfile';
import type { PartialPlayProgress } from '../src/types';

beforeEach(() => {
  localStorage.clear();
  setActiveSlotIndex(null);
});

afterEach(() => {
  setActiveSlotIndex(null);
});

// ─── loadPartialProgress ──────────────────────────────────────────────────────

describe('loadPartialProgress', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadPartialProgress()).toEqual([]);
  });

  it('returns empty array when stored value is corrupt JSON', () => {
    localStorage.setItem('pipes_partial_progress', '{not valid json');
    expect(loadPartialProgress()).toEqual([]);
  });

  it('returns empty array when stored value is a non-array JSON value', () => {
    localStorage.setItem('pipes_partial_progress', '"oops"');
    expect(loadPartialProgress()).toEqual([]);
  });

  it('filters out entries with missing required fields', () => {
    localStorage.setItem('pipes_partial_progress', JSON.stringify([
      { campaignId: 'c1', levelId: 1, moves: ['P:STRAIGHT:0:0:N'], timestamp: 100 }, // valid
      { levelId: 1, moves: [], timestamp: 200 },          // missing campaignId
      { campaignId: 'c1', moves: [], timestamp: 300 },    // missing levelId
      { campaignId: 'c1', levelId: 2 },                   // missing moves + timestamp
      null,
    ]));
    const result = loadPartialProgress();
    expect(result).toHaveLength(1);
    expect(result[0].campaignId).toBe('c1');
    expect(result[0].levelId).toBe(1);
  });
});

// ─── savePartialProgressEntry ─────────────────────────────────────────────────

describe('savePartialProgressEntry', () => {
  it('round-trips a single entry', () => {
    const entry: PartialPlayProgress = {
      campaignId: 'camp1',
      levelId: 42,
      moves: ['P:STRAIGHT:0:0:N', 'R:0:0:CW'],
      timestamp: 9999,
      formatVersion: 1,
    };
    savePartialProgressEntry(entry);
    const loaded = loadPartialProgress();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toEqual(entry);
  });

  it('replaces a prior entry with the same campaignId+levelId (no duplicates)', () => {
    const first: PartialPlayProgress = { campaignId: 'c', levelId: 5, moves: ['P:STRAIGHT:0:0:N'], timestamp: 1 };
    const second: PartialPlayProgress = { campaignId: 'c', levelId: 5, moves: ['P:ELBOW:1:1:E'], timestamp: 2 };
    savePartialProgressEntry(first);
    savePartialProgressEntry(second);
    const all = loadPartialProgress();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(second);
  });

  it('coexists entries with different campaignId+levelId combinations', () => {
    savePartialProgressEntry({ campaignId: 'c1', levelId: 1, moves: [], timestamp: 10 });
    savePartialProgressEntry({ campaignId: 'c1', levelId: 2, moves: [], timestamp: 20 });
    savePartialProgressEntry({ campaignId: 'c2', levelId: 1, moves: [], timestamp: 30 });
    expect(loadPartialProgress()).toHaveLength(3);
  });
});

// ─── deletePartialProgress ────────────────────────────────────────────────────

describe('deletePartialProgress', () => {
  it('removes only the matching entry', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: [], timestamp: 1 });
    savePartialProgressEntry({ campaignId: 'c', levelId: 2, moves: [], timestamp: 2 });
    deletePartialProgress('c', 1);
    const all = loadPartialProgress();
    expect(all).toHaveLength(1);
    expect(all[0].levelId).toBe(2);
  });

  it('is a no-op when the entry does not exist', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 5, moves: [], timestamp: 1 });
    deletePartialProgress('c', 99);
    expect(loadPartialProgress()).toHaveLength(1);
  });
});

// ─── getPartialProgressFor ────────────────────────────────────────────────────

describe('getPartialProgressFor', () => {
  it('returns the matching entry', () => {
    const entry: PartialPlayProgress = { campaignId: 'cam', levelId: 7, moves: ['D:0:0'], timestamp: 42 };
    savePartialProgressEntry(entry);
    expect(getPartialProgressFor('cam', 7)).toEqual(entry);
  });

  it('returns null when no matching entry exists', () => {
    expect(getPartialProgressFor('missing', 1)).toBeNull();
  });
});

// ─── getMostRecentPartialProgress ────────────────────────────────────────────

describe('getMostRecentPartialProgress', () => {
  it('returns null when no entries exist', () => {
    expect(getMostRecentPartialProgress()).toBeNull();
  });

  it('returns the entry with the highest timestamp across all campaigns', () => {
    savePartialProgressEntry({ campaignId: 'c1', levelId: 1, moves: [], timestamp: 100 });
    savePartialProgressEntry({ campaignId: 'c2', levelId: 2, moves: [], timestamp: 999 });
    savePartialProgressEntry({ campaignId: 'c1', levelId: 3, moves: [], timestamp: 500 });
    const best = getMostRecentPartialProgress();
    expect(best).not.toBeNull();
    expect(best!.campaignId).toBe('c2');
    expect(best!.levelId).toBe(2);
    expect(best!.timestamp).toBe(999);
  });
});

// ─── replaceAllPartialProgress ────────────────────────────────────────────────

describe('replaceAllPartialProgress', () => {
  it('overwrites the whole array', () => {
    savePartialProgressEntry({ campaignId: 'old', levelId: 1, moves: [], timestamp: 1 });
    const newEntries: PartialPlayProgress[] = [
      { campaignId: 'new', levelId: 10, moves: ['P:STRAIGHT:0:0:N'], timestamp: 500 },
    ];
    replaceAllPartialProgress(newEntries);
    expect(loadPartialProgress()).toEqual(newEntries);
  });

  it('clears all entries when called with an empty array', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: [], timestamp: 1 });
    replaceAllPartialProgress([]);
    expect(loadPartialProgress()).toEqual([]);
  });
});

// ─── mergePartialProgress ─────────────────────────────────────────────────────

describe('mergePartialProgress', () => {
  it('keeps local entries for levels the incoming set does not mention', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['a'], timestamp: 100 });
    savePartialProgressEntry({ campaignId: 'c', levelId: 2, moves: ['b'], timestamp: 100 });

    mergePartialProgress([
      { campaignId: 'c', levelId: 1, moves: ['a2'], timestamp: 200 },
    ]);

    const all = loadPartialProgress();
    expect(all).toHaveLength(2);
    // Level 2 (untouched by the merge) survives — not wiped.
    expect(getPartialProgressFor('c', 2)?.moves).toEqual(['b']);
  });

  it('newer incoming timestamp wins a per-level conflict', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['local'], timestamp: 100 });
    mergePartialProgress([
      { campaignId: 'c', levelId: 1, moves: ['incoming'], timestamp: 200 },
    ]);
    expect(getPartialProgressFor('c', 1)?.moves).toEqual(['incoming']);
  });

  it('keeps local on an equal-timestamp tie', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['local'], timestamp: 100 });
    mergePartialProgress([
      { campaignId: 'c', levelId: 1, moves: ['incoming'], timestamp: 100 },
    ]);
    expect(getPartialProgressFor('c', 1)?.moves).toEqual(['local']);
  });

  it('keeps local when the incoming entry is older', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['local'], timestamp: 200 });
    mergePartialProgress([
      { campaignId: 'c', levelId: 1, moves: ['incoming'], timestamp: 100 },
    ]);
    expect(getPartialProgressFor('c', 1)?.moves).toEqual(['local']);
  });

  it('adds a brand-new incoming entry', () => {
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['local'], timestamp: 100 });
    mergePartialProgress([
      { campaignId: 'c', levelId: 9, moves: ['new'], timestamp: 50 },
    ]);
    expect(loadPartialProgress()).toHaveLength(2);
    expect(getPartialProgressFor('c', 9)?.moves).toEqual(['new']);
  });

  it('distinguishes the same levelId across different campaigns', () => {
    savePartialProgressEntry({ campaignId: 'a', levelId: 1, moves: ['a1'], timestamp: 100 });
    mergePartialProgress([
      { campaignId: 'b', levelId: 1, moves: ['b1'], timestamp: 100 },
    ]);
    expect(loadPartialProgress()).toHaveLength(2);
    expect(getPartialProgressFor('a', 1)?.moves).toEqual(['a1']);
    expect(getPartialProgressFor('b', 1)?.moves).toEqual(['b1']);
  });
});

// ─── slot-prefix isolation ────────────────────────────────────────────────────

describe('slot-prefix isolation', () => {
  it('entries saved under one slot are not visible under another', () => {
    setActiveSlotIndex(0);
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['P:STRAIGHT:0:0:N'], timestamp: 1 });

    // Switch to a different slot.
    setActiveSlotIndex(1);
    expect(loadPartialProgress()).toEqual([]);
    expect(getPartialProgressFor('c', 1)).toBeNull();
    expect(getMostRecentPartialProgress()).toBeNull();
  });

  it('entries from different slots do not interfere', () => {
    setActiveSlotIndex(0);
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: [], timestamp: 100 });

    setActiveSlotIndex(1);
    savePartialProgressEntry({ campaignId: 'c', levelId: 1, moves: ['P:ELBOW:0:0:N'], timestamp: 200 });

    // Verify slot 1 has the slot-1 entry.
    expect(loadPartialProgress()).toHaveLength(1);
    expect(loadPartialProgress()[0].timestamp).toBe(200);

    // Switch back to slot 0 — should see slot-0 entry only.
    setActiveSlotIndex(0);
    expect(loadPartialProgress()).toHaveLength(1);
    expect(loadPartialProgress()[0].timestamp).toBe(100);
  });
});

// ─── loadSaveNoticeSuppressed / saveSaveNoticeSuppressed ──────────────────────

describe('save-notice suppressed flag', () => {
  it('defaults to false when nothing is stored', () => {
    expect(loadSaveNoticeSuppressed()).toBe(false);
  });

  it('round-trips true', () => {
    saveSaveNoticeSuppressed(true);
    expect(loadSaveNoticeSuppressed()).toBe(true);
  });

  it('round-trips false (clears storage)', () => {
    saveSaveNoticeSuppressed(true);
    saveSaveNoticeSuppressed(false);
    expect(loadSaveNoticeSuppressed()).toBe(false);
  });

  it('is slot-prefixed: flag set on slot 0 is not seen on slot 1', () => {
    setActiveSlotIndex(0);
    saveSaveNoticeSuppressed(true);

    setActiveSlotIndex(1);
    expect(loadSaveNoticeSuppressed()).toBe(false);
  });
});

// ─── levelIdToChapterLevel ────────────────────────────────────────────────────

import { levelIdToChapterLevel } from '../src/screens/levelSelect';
import { makeChapterDef, makeLevelDef } from './testHelpers';
import type { ChapterDef } from '../src/types';

function makeChapters(): ChapterDef[] {
  return [
    makeChapterDef({ id: 1, levels: [
      makeLevelDef({ id: 10, name: 'A', rows: 1, cols: 1, grid: [[null]] }),
      makeLevelDef({ id: 11, name: 'B', rows: 1, cols: 1, grid: [[null]] }),
    ] }),
    makeChapterDef({ id: 2, levels: [
      makeLevelDef({ id: 20, name: 'C', rows: 1, cols: 1, grid: [[null]] }),
    ] }),
  ];
}

describe('levelIdToChapterLevel', () => {
  it('returns 1-based { chapter, level } for first level in first chapter', () => {
    expect(levelIdToChapterLevel(makeChapters(), 10)).toEqual({ chapter: 1, level: 1 });
  });

  it('returns 1-based { chapter, level } for second level in first chapter', () => {
    expect(levelIdToChapterLevel(makeChapters(), 11)).toEqual({ chapter: 1, level: 2 });
  });

  it('returns 1-based { chapter, level } for a level in the second chapter', () => {
    expect(levelIdToChapterLevel(makeChapters(), 20)).toEqual({ chapter: 2, level: 1 });
  });

  it('returns null for an unknown levelId', () => {
    expect(levelIdToChapterLevel(makeChapters(), 9999)).toBeNull();
  });

  it('returns null when chapters array is empty', () => {
    expect(levelIdToChapterLevel([], 10)).toBeNull();
  });
});
