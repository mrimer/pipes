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
function makeLevel(id: number, starCount?: number): LevelDef {
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
