/**
 * Tests for helper functions exported from campaignMapScreen.ts:
 *  - augmentChapterLevelWater
 *  - chapterHasUncompletedChallenge
 */

import { ChapterDef } from '../src/types';
import { augmentChapterLevelWater, chapterHasUncompletedChallenge } from '../src/campaignMapScreen';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChapter(id: number, levelIds: number[], challengeIds: number[] = []): ChapterDef {
  return {
    id,
    name: `Chapter ${id}`,
    levels: levelIds.map((lid) => ({
      id: lid,
      name: `Level ${lid}`,
      rows: 2,
      cols: 2,
      grid: [[null, null], [null, null]],
      inventory: [],
      challenge: challengeIds.includes(lid) || undefined,
    })),
  };
}

// ─── augmentChapterLevelWater ─────────────────────────────────────────────────

describe('augmentChapterLevelWater', () => {
  it('sums level water scores per chapter and keys them by pseudo-level ID', () => {
    const chapters = [
      makeChapter(1, [101, 102, 103]),
      makeChapter(2, [201, 202]),
    ];
    const pseudoLevelIds = [-1001, -1002];
    const baseWater: Record<number, number> = {
      101: 10,
      102: 5,
      103: 8,
      201: 3,
      202: 7,
    };

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[-1001]).toBe(23); // 10 + 5 + 8
    expect(result[-1002]).toBe(10); // 3 + 7
  });

  it('preserves existing entries for actual level IDs', () => {
    const chapters = [makeChapter(1, [101, 102])];
    const pseudoLevelIds = [-1001];
    const baseWater: Record<number, number> = { 101: 4, 102: 6 };

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[101]).toBe(4);
    expect(result[102]).toBe(6);
    expect(result[-1001]).toBe(10); // 4 + 6
  });

  it('treats missing water scores as 0', () => {
    const chapters = [makeChapter(1, [101, 102, 103])];
    const pseudoLevelIds = [-1001];
    const baseWater: Record<number, number> = { 101: 5 }; // 102 and 103 missing

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[-1001]).toBe(5);
  });

  it('produces 0 for a chapter with no water scores', () => {
    const chapters = [makeChapter(1, [101, 102])];
    const pseudoLevelIds = [-1001];
    const baseWater: Record<number, number> = {};

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[-1001]).toBe(0);
  });

  it('produces 0 for an empty chapter', () => {
    const chapters = [makeChapter(1, [])];
    const pseudoLevelIds = [-1001];
    const baseWater: Record<number, number> = {};

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[-1001]).toBe(0);
  });

  it('handles more chapters than pseudo-level IDs gracefully', () => {
    const chapters = [makeChapter(1, [101]), makeChapter(2, [201])];
    const pseudoLevelIds = [-1001]; // only one ID provided
    const baseWater: Record<number, number> = { 101: 3, 201: 7 };

    const result = augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(result[-1001]).toBe(3);
    expect(result[-1002]).toBeUndefined(); // second chapter not aggregated
  });

  it('does not mutate the baseWater argument', () => {
    const chapters = [makeChapter(1, [101])];
    const pseudoLevelIds = [-1001];
    const baseWater: Record<number, number> = { 101: 9 };
    const originalKeys = Object.keys(baseWater).slice();

    augmentChapterLevelWater(chapters, pseudoLevelIds, baseWater);

    expect(Object.keys(baseWater)).toEqual(originalKeys);
  });
});

// ─── chapterHasUncompletedChallenge ──────────────────────────────────────────

describe('chapterHasUncompletedChallenge', () => {
  it('returns false when the chapter has no challenge levels', () => {
    const chapter = makeChapter(1, [101, 102]);
    expect(chapterHasUncompletedChallenge(chapter, new Set())).toBe(false);
  });

  it('returns true when a challenge level is not completed', () => {
    const chapter = makeChapter(1, [101, 102], [102]);
    expect(chapterHasUncompletedChallenge(chapter, new Set([101]))).toBe(true);
  });

  it('returns false when all challenge levels are completed', () => {
    const chapter = makeChapter(1, [101, 102, 103], [102, 103]);
    expect(chapterHasUncompletedChallenge(chapter, new Set([101, 102, 103]))).toBe(false);
  });

  it('returns true when none of the challenge levels are completed', () => {
    const chapter = makeChapter(1, [101, 102], [102]);
    expect(chapterHasUncompletedChallenge(chapter, new Set())).toBe(true);
  });

  it('returns false when all challenges are completed but regular levels are not', () => {
    const chapter = makeChapter(1, [101, 102, 103], [103]);
    // Only challenge (103) is completed; regular levels 101, 102 are not
    expect(chapterHasUncompletedChallenge(chapter, new Set([103]))).toBe(false);
  });

  it('returns false for an empty chapter', () => {
    const chapter = makeChapter(1, []);
    expect(chapterHasUncompletedChallenge(chapter, new Set())).toBe(false);
  });

  it('returns true when multiple challenges exist and at least one is uncompleted', () => {
    const chapter = makeChapter(1, [101, 102, 103], [101, 102, 103]);
    expect(chapterHasUncompletedChallenge(chapter, new Set([101, 102]))).toBe(true);
  });
});
