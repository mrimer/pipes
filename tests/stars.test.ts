/**
 * @jest-environment jsdom
 */

/** Tests for star-progress persistence and level-select star display. */

import { loadLevelStars, saveLevelStar, clearLevelStars } from '../src/persistence';
import { renderLevelList } from '../src/levelSelect';
import { LevelDef, PipeShape, Direction } from '../src/types';

// ─── Persistence helpers ──────────────────────────────────────────────────────

describe('loadLevelStars / saveLevelStar / clearLevelStars', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns empty object when nothing has been saved', () => {
    expect(loadLevelStars()).toEqual({});
  });

  it('saves and loads a star count for a level', () => {
    saveLevelStar(42, 3);
    expect(loadLevelStars()[42]).toBe(3);
  });

  it('updates the count when the same level is saved again', () => {
    saveLevelStar(7, 1);
    saveLevelStar(7, 2);
    expect(loadLevelStars()[7]).toBe(2);
  });

  it('stores stars for multiple levels independently', () => {
    saveLevelStar(1, 2);
    saveLevelStar(2, 1);
    const stars = loadLevelStars();
    expect(stars[1]).toBe(2);
    expect(stars[2]).toBe(1);
  });

  it('clears all star progress', () => {
    saveLevelStar(5, 3);
    clearLevelStars();
    expect(loadLevelStars()).toEqual({});
  });

  it('uses separate storage keys for official and campaign stars', () => {
    saveLevelStar(10, 2);              // official
    saveLevelStar(10, 3, 'cmp_abc');   // campaign
    expect(loadLevelStars()[10]).toBe(2);
    expect(loadLevelStars('cmp_abc')[10]).toBe(3);
  });

  it('clearLevelStars with campaignId only clears that campaign', () => {
    saveLevelStar(10, 2);
    saveLevelStar(10, 3, 'cmp_abc');
    clearLevelStars('cmp_abc');
    expect(loadLevelStars()[10]).toBe(2);
    expect(loadLevelStars('cmp_abc')[10]).toBeUndefined();
  });

  it('returns {} gracefully when localStorage contains invalid JSON', () => {
    localStorage.setItem('pipes_level_stars', 'not-json');
    expect(loadLevelStars()).toEqual({});
  });
});

// ─── Level-select star display ────────────────────────────────────────────────

/** Minimal level for testing. */
function makeLevel(id: number, starCount?: number, challenge?: boolean): LevelDef {
  return {
    id,
    name: `Level ${id}`,
    rows: 1,
    cols: 2,
    grid: [
      [
        { shape: PipeShape.Source, connections: [Direction.East], capacity: 5 },
        { shape: PipeShape.Sink,   connections: [Direction.West] },
      ],
    ],
    inventory: [],
    starCount,
    challenge,
  };
}

function makeLevelListEl(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('renderLevelList star display', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('shows ⭐ X/Y on a level button when the level has stars', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 1 };

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const btn = container.querySelector('button.level-btn');
    expect(btn?.textContent).toContain('⭐');
    expect(btn?.textContent).toContain('1/2');
  });

  it('does not show ⭐ on a level button when the level has no stars', () => {
    const level = makeLevel(1);   // starCount undefined
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {},
    );

    const btn = container.querySelector('button.level-btn');
    expect(btn?.textContent).not.toContain('⭐');
  });

  it('caps displayed collected stars at the total', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    // levelStars reports more than possible (e.g. after level edit)
    const levelStars: Record<number, number> = { 1: 99 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const btn = container.querySelector('button.level-btn');
    expect(btn?.textContent).toContain('2/2');
    expect(btn?.textContent).not.toContain('99');
  });

  it('shows ⭐ X/Y in chapter header when all levels are complete and chapter has stars', () => {
    const level = makeLevel(1, 3);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const levelStars: Record<number, number> = { 1: 2 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).toContain('⭐');
    expect(chapterTitle?.textContent).toContain('2/3');
  });

  it('does not show chapter star tally when chapter is not yet fully complete', () => {
    const levels = [makeLevel(1, 2), makeLevel(2, 1)];
    const chapters = [{ id: 1, name: 'Ch1', levels }];
    // Only level 1 completed
    const levelStars: Record<number, number> = { 1: 2 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    // Chapter not complete → no star tally in header
    expect(chapterTitle?.textContent).not.toMatch(/⭐.*\d+\/\d+/);
  });

  it('shows campaign star tally when campaign is 100% complete and has stars', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const levelStars: Record<number, number> = { 1: 1 };
    const activeCampaign = { name: 'My Campaign', author: 'Tester', completionPct: 100 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, levelStars,
    );

    const header = container.querySelector('div');
    expect(header?.textContent).toContain('⭐');
    expect(header?.textContent).toContain('1/2');
  });

  it('does not show campaign star tally when campaign is not complete', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const activeCampaign = { name: 'My Campaign', author: 'Tester', completionPct: 50 };

    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, { 1: 1 },
    );

    // The campaign header should exist but not have a star tally
    const header = container.firstChild as HTMLElement;
    // completionPct < 100 → no star row should be added
    expect(header?.textContent).not.toMatch(/⭐.*\d+\/\d+/);
  });
});

// ─── Challenge level display and chapter-locking ──────────────────────────────

describe('renderLevelList – challenge levels', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('shows 💀 icon on the button for a challenge level', () => {
    const level = makeLevel(1, undefined, true);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];

    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const btn = container.querySelector('.level-btn');
    expect(btn?.textContent).toContain('💀');
  });

  it('does NOT show 💀 icon on a regular (non-challenge) level', () => {
    const level = makeLevel(1);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];

    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const btn = container.querySelector('.level-btn');
    expect(btn?.textContent).not.toContain('💀');
  });

  it('unlocks next chapter when enough levels are completed, including a challenge level substituting for a non-challenge one', () => {
    // Chapter 1 has 3 regular levels (1,2,3) and 1 challenge level (4).
    // Required completions = 3 (the non-challenge count).
    // Completing L1 + L2 + L4💀 satisfies the quota even though L3 is skipped.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2), makeLevel(3), makeLevel(4, undefined, true)],
    };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(5)] };
    const chapters = [ch1, ch2];

    // L1, L2, and L4💀 completed; L3 not done.
    const completed = new Set<number>([1, 2, 4]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterHeaders = container.querySelectorAll('.chapter-header');
    // Chapter 2 must be unlocked: 3 completions >= 3 non-challenge count.
    expect(chapterHeaders[1]?.classList.contains('locked')).toBe(false);
  });

  it('keeps next chapter locked when total completions are below the non-challenge count', () => {
    // Chapter 1 has 3 regular levels and 1 challenge level. Quota = 3.
    // Completing only 2 levels (1 regular + 1 challenge) is not enough.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2), makeLevel(3), makeLevel(4, undefined, true)],
    };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(5)] };
    const chapters = [ch1, ch2];

    // Only L1 and L4💀 completed (2 total < 3 required).
    const completed = new Set<number>([1, 4]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterHeaders = container.querySelectorAll('.chapter-header');
    expect(chapterHeaders[1]?.classList.contains('locked')).toBe(true);
  });

  it('unlocks next chapter when all non-challenge levels of previous chapter are done', () => {
    // Chapter 1 has a regular level (id=1) and a challenge level (id=2).
    // Completing only the regular level should unlock chapter 2 (quota=1, completed=1).
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2, undefined, true)],
    };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(3)] };
    const chapters = [ch1, ch2];

    // Only the non-challenge level (1) is completed; challenge level (2) is not.
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterHeaders = container.querySelectorAll('.chapter-header');
    // Chapter 2 header must NOT have the 'locked' class.
    expect(chapterHeaders[1]?.classList.contains('locked')).toBe(false);
  });

  it('keeps next chapter locked when a non-challenge level in the previous chapter is incomplete', () => {
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2)],
    };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(3)] };
    const chapters = [ch1, ch2];

    // Only level 1 is completed; level 2 (also non-challenge) is not (1 < 2 required).
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterHeaders = container.querySelectorAll('.chapter-header');
    expect(chapterHeaders[1]?.classList.contains('locked')).toBe(true);
  });

  it('does not lock a non-challenge level behind an incomplete challenge level', () => {
    // Levels: [L1 (regular, completed), L2 (challenge, not done), L3 (regular)]
    // L3 should be accessible even though L2 is not done.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2, undefined, true), makeLevel(3)],
    };
    const chapters = [ch1];
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const levelBtns = container.querySelectorAll('.level-btn');
    // L3 is the 3rd button (index 2)
    expect(levelBtns[2]?.classList.contains('locked')).toBe(false);
  });

  it('shows 💀 X/Y in chapter header when chapter is complete and has challenge levels', () => {
    // 1 regular level (id=1) + 2 challenge levels (id=2, id=3). All completed.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2, undefined, true), makeLevel(3, undefined, true)],
    };
    const chapters = [ch1];
    const completed = new Set<number>([1, 2, 3]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).toContain('💀');
    expect(chapterTitle?.textContent).toContain('2/2');
  });

  it('shows 💀 0/N when chapter is complete but no challenge levels completed', () => {
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2, undefined, true)],
    };
    const chapters = [ch1];
    // Only the regular level is completed → chapter is "done" (all non-challenge done)
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).toContain('💀');
    expect(chapterTitle?.textContent).toContain('0/1');
  });

  it('does not show 💀 in chapter header when chapter has no challenge levels', () => {
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2)],
    };
    const chapters = [ch1];
    const completed = new Set<number>([1, 2]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    expect(chapterTitle?.textContent).not.toContain('💀');
  });

  it('does not show 💀 tally in chapter header when chapter is not yet fully complete', () => {
    // Chapter has 2 regular levels + 1 challenge level; only 1 regular done.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2), makeLevel(3, undefined, true)],
    };
    const chapters = [ch1];
    const completed = new Set<number>([1, 3]);  // L2 (regular) still incomplete

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const chapterTitle = container.querySelector('.chapter-header span');
    // Chapter not complete → no skull tally in header
    expect(chapterTitle?.textContent).not.toMatch(/💀\s+\d+\/\d+/);
  });

  it('hides levels after the first locked level in a chapter', () => {
    // Levels: [L1 (regular, not done), L2 (challenge), L3 (regular)]
    // L2 is locked because L1 is not done.  L3 should not be shown at all
    // (levels after the first locked one are hidden to reveal them incrementally).
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2, undefined, true), makeLevel(3)],
    };
    const chapters = [ch1];
    const completed = new Set<number>();

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters,
    );

    const levelBtns = container.querySelectorAll('.level-btn');
    // Only L1 (unlocked) and L2 (first locked) should be rendered; L3 is hidden.
    expect(levelBtns.length).toBe(2);
    expect(levelBtns[1]?.classList.contains('locked')).toBe(true);
  });
});
