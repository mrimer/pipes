/**
 * @jest-environment jsdom
 */

/** Tests for star-progress persistence and level-select star display. */

import { loadLevelStars, saveLevelStar, clearLevelStars, clearLevelStarRecord } from '../src/persistence';
import { renderLevelList } from '../src/levelSelect';
import { LevelDef, TileDef, PipeShape, Direction } from '../src/types';

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

// ─── clearLevelStarRecord ─────────────────────────────────────────────────────

describe('clearLevelStarRecord', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes only the specified level from the star record', () => {
    saveLevelStar(1, 2);
    saveLevelStar(2, 3);
    clearLevelStarRecord(1);
    expect(loadLevelStars()[1]).toBeUndefined();
    expect(loadLevelStars()[2]).toBe(3);
  });

  it('does nothing when the level has no stored star record', () => {
    saveLevelStar(5, 2);
    clearLevelStarRecord(99); // no record for level 99
    expect(loadLevelStars()[5]).toBe(2);
  });

  it('works with a campaign-specific star record', () => {
    saveLevelStar(10, 3, 'cmp_abc');
    saveLevelStar(11, 2, 'cmp_abc');
    clearLevelStarRecord(10, 'cmp_abc');
    expect(loadLevelStars('cmp_abc')[10]).toBeUndefined();
    expect(loadLevelStars('cmp_abc')[11]).toBe(2);
  });

  it('does not affect the official star record when called with a campaign ID', () => {
    saveLevelStar(10, 2);
    saveLevelStar(10, 3, 'cmp_abc');
    clearLevelStarRecord(10, 'cmp_abc');
    expect(loadLevelStars()[10]).toBe(2);
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

  it('calls onChapterMap with the chapter index when a chapter with a grid is clicked', () => {
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1)],
      grid: [[null]] as (TileDef | null)[][],
      rows: 1,
      cols: 1,
    };
    const chapters = [ch1];
    let calledWithIdx = -1;

    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {}, {}, (idx) => { calledWithIdx = idx; },
    );

    const header = container.querySelector('.chapter-header') as HTMLElement;
    header.click();
    expect(calledWithIdx).toBe(0);
  });

  it('shows an error message when a chapter without a grid is clicked', () => {
    const ch1 = { id: 1, name: 'Ch1', levels: [makeLevel(1)] };
    const chapters = [ch1];

    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {}, {}, () => {},
    );

    const header = container.querySelector('.chapter-header') as HTMLElement;
    const errorEl = container.querySelector('.chapter-no-map-error') as HTMLElement;
    expect(errorEl).not.toBeNull();
    expect(errorEl.style.display).toBe('none');
    header.click();
    expect(errorEl.style.display).not.toBe('none');
  });
});

// ─── renderLevelList – campaign totals denominator gating ────────────────────

describe('renderLevelList – campaign totals denominator gating', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('shows ⭐ without denominator in campaign header until all non-challenge levels are done', () => {
    // Campaign: 2 regular levels + 1 challenge level; only L1 done.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1, 2), makeLevel(2, 1), makeLevel(3, undefined, true)],
    };
    const chapters = [ch1];
    const levelStars: Record<number, number> = { 1: 1 };
    const activeCampaign = { name: 'Partial', author: 'T', completionPct: 33 };

    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, levelStars,
    );

    const header = container.querySelector('div');
    // Should show collected star count but NOT the total denominator
    expect(header?.textContent).toContain('⭐');
    expect(header?.textContent).not.toMatch(/⭐\s*\d+\/\d+/);
  });

  it('shows ⭐ X/Y denominator in campaign header once all non-challenge levels are done', () => {
    // Campaign: 2 regular levels + 1 challenge level; L1 and L2 both done (all non-challenge).
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1, 2), makeLevel(2, 1), makeLevel(3, undefined, true)],
    };
    const chapters = [ch1];
    const levelStars: Record<number, number> = { 1: 1, 2: 1 };
    const activeCampaign = { name: 'Done', author: 'T', completionPct: 67 };

    renderLevelList(
      container, new Set<number>([1, 2]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters, levelStars,
    );

    const header = container.querySelector('div');
    // All non-challenge done → show collected/total
    expect(header?.textContent).toMatch(/⭐\s*\d+\/\d+/);
  });

  it('shows 💀 without denominator in campaign header until all non-challenge levels are done', () => {
    // Campaign: 2 regular levels + 2 challenge levels; only L1 done, L3 (challenge) done.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2), makeLevel(3, undefined, true), makeLevel(4, undefined, true)],
    };
    const chapters = [ch1];
    const activeCampaign = { name: 'Partial', author: 'T', completionPct: 25 };

    renderLevelList(
      container, new Set<number>([1, 3]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters,
    );

    const header = container.querySelector('div');
    // Should show completed challenge count but NOT the total denominator
    expect(header?.textContent).toContain('💀');
    expect(header?.textContent).not.toMatch(/💀\s*\d+\/\d+/);
  });

  it('shows 💀 X/Y denominator in campaign header once all non-challenge levels are done', () => {
    // Campaign: 2 regular + 2 challenge; L1 & L2 done (all non-challenge), L3 (challenge) done.
    const ch1 = {
      id: 1, name: 'Ch1',
      levels: [makeLevel(1), makeLevel(2), makeLevel(3, undefined, true), makeLevel(4, undefined, true)],
    };
    const chapters = [ch1];
    const activeCampaign = { name: 'Done', author: 'T', completionPct: 75 };

    renderLevelList(
      container, new Set<number>([1, 2, 3]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      activeCampaign, chapters,
    );

    const header = container.querySelector('div');
    // All non-challenge done → show X/Y
    expect(header?.textContent).toMatch(/💀\s*\d+\/\d+/);
  });
});

describe('renderLevelList – mastered campaign continue button', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('keeps the "🏆 Mastered!" button clickable and routes it to Campaign Map', () => {
    const chapters = [{ id: 1, name: 'Ch1', levels: [makeLevel(1, 1)] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 1 };
    const onCampaignMapClick = jest.fn();

    renderLevelList(
      container,
      completed,
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      { name: 'Mastered Campaign', author: 'Tester', completionPct: 100 },
      chapters,
      levelStars,
      {},
      () => {},
      new Set<number>(),
      undefined,
      undefined,
      true,
      onCampaignMapClick,
    );

    const masteredBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((btn) => btn.textContent === '🏆 Mastered!');
    expect(masteredBtn).not.toBeUndefined();
    masteredBtn!.click();
    expect(onCampaignMapClick).toHaveBeenCalledTimes(1);
  });
});

// ─── renderLevelList – no-campaign message and Select a Level header ──────────

describe('renderLevelList – no-campaign / campaign header', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  it('shows "Click Campaign Editor" message when no activeCampaign is provided', () => {
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, [],
    );

    const msg = container.querySelector('p');
    expect(msg).not.toBeNull();
    expect(msg?.textContent).toContain('Campaign Editor');
    expect(msg?.textContent).toContain('import or create');
  });

  it('does not show the "Click Campaign Editor" message when activeCampaign is provided', () => {
    const chapters = [{ id: 1, name: 'Ch1', levels: [] }];
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      { name: 'My Campaign', author: 'Author', completionPct: 0 },
      chapters,
    );

    const allText = container.textContent ?? '';
    expect(allText).not.toContain('Campaign Editor to import');
  });

  it('shows "Select a Level" h2 when activeCampaign is provided', () => {
    const chapters = [{ id: 1, name: 'Ch1', levels: [] }];
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      { name: 'My Campaign', author: 'Author', completionPct: 0 },
      chapters,
    );

    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2?.textContent).toBe('Select a Level');
  });

  it('"Select a Level" h2 is centered', () => {
    const chapters = [{ id: 1, name: 'Ch1', levels: [] }];
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      { name: 'My Campaign', author: 'Author', completionPct: 0 },
      chapters,
    );

    const h2 = container.querySelector('h2') as HTMLElement;
    expect(h2).not.toBeNull();
    expect(h2.style.textAlign).toBe('center');
  });

  it('does not show "Select a Level" h2 when no activeCampaign is provided', () => {
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, [],
    );

    const h2 = container.querySelector('h2');
    expect(h2).toBeNull();
  });
});

// ─── renderLevelList – Reset Progress button visibility ───────────────────────

describe('renderLevelList – Reset Progress button', () => {
  let container: HTMLElement;
  const campaign = { name: 'C', author: 'A', completionPct: 0 };

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  function getResetBtn(): HTMLButtonElement | null {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Reset Progress')) ?? null;
  }

  it('does not render the Reset Progress button when no activeCampaign is provided', () => {
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, [],
    );
    expect(getResetBtn()).toBeNull();
  });

  it('renders but disables Reset Progress when campaign has no completed levels or stars', () => {
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, [],
    );
    const btn = getResetBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
  });

  it('renders and enables Reset Progress when at least one level is completed', () => {
    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, [],
    );
    const btn = getResetBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
  });

  it('renders and enables Reset Progress when stars have been collected but no levels completed', () => {
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, [], { 1: 2 },
    );
    const btn = getResetBtn();
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
  });

  it('invokes onResetClick when the enabled Reset Progress button is clicked', () => {
    let clicked = false;
    renderLevelList(
      container, new Set<number>([1]),
      () => {}, () => { clicked = true; }, () => {}, () => {}, () => {},
      campaign, [],
    );
    getResetBtn()!.click();
    expect(clicked).toBe(true);
  });

  it('does not invoke onResetClick when the disabled Reset Progress button is clicked', () => {
    let clicked = false;
    renderLevelList(
      container, new Set<number>(),
      () => {}, () => { clicked = true; }, () => {}, () => {}, () => {},
      campaign, [],
    );
    getResetBtn()!.click();
    expect(clicked).toBe(false);
  });
});

// ─── renderLevelList – chapter box color coding ───────────────────────────────

describe('renderLevelList – chapter box color coding', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  function getChapterBox(): HTMLElement | null {
    return container.querySelector('.chapter-box') as HTMLElement | null;
  }

  it('shows gold border when all levels and all stars are completed', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 2 };

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const box = getChapterBox();
    expect(box?.classList.contains('chapter-gold')).toBe(true);
    expect(box?.classList.contains('chapter-indigo')).toBe(false);
  });

  it('shows gold border when all levels are completed and chapter has no stars', () => {
    const level = makeLevel(1);  // no starCount
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {},
    );

    const box = getChapterBox();
    expect(box?.classList.contains('chapter-gold')).toBe(true);
    expect(box?.classList.contains('chapter-indigo')).toBe(false);
  });

  it('shows indigo border when all levels are completed but not all stars collected', () => {
    const level = makeLevel(1, 3);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 1 };  // only 1 of 3 stars

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const box = getChapterBox();
    expect(box?.classList.contains('chapter-indigo')).toBe(true);
    expect(box?.classList.contains('chapter-gold')).toBe(false);
  });

  it('shows blue border when chapter is unlocked but not yet completed', () => {
    const levels = [makeLevel(1), makeLevel(2)];
    const chapters = [{ id: 1, name: 'Ch1', levels }];
    const completed = new Set<number>([1]);  // only 1 of 2 levels done

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {},
    );

    const box = getChapterBox();
    expect(box?.classList.contains('chapter-gold')).toBe(false);
    expect(box?.classList.contains('chapter-indigo')).toBe(false);
  });

  it('shows gray border when chapter is locked', () => {
    const ch1 = { id: 1, name: 'Ch1', levels: [makeLevel(1), makeLevel(2)] };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(3)] };
    const chapters = [ch1, ch2];
    const completed = new Set<number>();  // nothing done → ch2 is locked

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, {},
    );

    const boxes = container.querySelectorAll<HTMLElement>('.chapter-box');
    // ch2 (index 1) should be locked → no gold or indigo class
    expect(boxes[1]?.classList.contains('chapter-gold')).toBe(false);
    expect(boxes[1]?.classList.contains('chapter-indigo')).toBe(false);
  });

  it('shows gold header background when chapter is gold', () => {
    const level = makeLevel(1, 2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 2 };

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const box = getChapterBox();
    // Gold chapters carry the chapter-gold class on the container
    expect(box?.classList.contains('chapter-gold')).toBe(true);
  });

  it('shows indigo header background when chapter is completed but stars remain', () => {
    const level = makeLevel(1, 3);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 1 };

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      undefined, chapters, levelStars,
    );

    const box = getChapterBox();
    // Indigo chapters carry the chapter-indigo class on the container
    expect(box?.classList.contains('chapter-indigo')).toBe(true);
  });
});

// ─── renderLevelList – campaign summary box color ─────────────────────────────

describe('renderLevelList – campaign summary box color', () => {
  let container: HTMLElement;
  const campaign = { name: 'My Campaign', author: 'Author', completionPct: 100 };

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  function getCampaignHeader(): HTMLElement | null {
    // The campaign header is the first div child of the container.
    return Array.from(container.children)
      .find((el) => el.tagName === 'DIV') as HTMLElement | null;
  }

  it('shows gold border on campaign summary when all levels, stars, and challenges are completed', () => {
    const regular = makeLevel(1, 2);
    const challenge = makeLevel(2, undefined, true);
    const chapters = [{ id: 1, name: 'Ch1', levels: [regular, challenge] }];
    const completed = new Set<number>([1, 2]);
    const levelStars: Record<number, number> = { 1: 2 };

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, levelStars,
    );

    const header = getCampaignHeader();
    expect(header?.style.borderColor).toBe('rgb(240, 192, 64)'); // #f0c040
  });

  it('shows white border on campaign summary when not all levels are completed', () => {
    const level1 = makeLevel(1);
    const level2 = makeLevel(2);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level1, level2] }];
    const completed = new Set<number>([1]); // level2 not done

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const header = getCampaignHeader();
    expect(header?.style.borderColor).toBe('rgb(255, 255, 255)'); // #ffffff
  });

  it('shows white border on campaign summary when not all stars are collected', () => {
    const level = makeLevel(1, 3);
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);
    const levelStars: Record<number, number> = { 1: 2 }; // missing 1 star

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, levelStars,
    );

    const header = getCampaignHeader();
    expect(header?.style.borderColor).toBe('rgb(255, 255, 255)'); // #ffffff
  });

  it('shows white border on campaign summary when not all challenge levels are completed', () => {
    const regular = makeLevel(1);
    const challenge = makeLevel(2, undefined, true);
    const chapters = [{ id: 1, name: 'Ch1', levels: [regular, challenge] }];
    const completed = new Set<number>([1]); // challenge not done

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const header = getCampaignHeader();
    expect(header?.style.borderColor).toBe('rgb(255, 255, 255)'); // #ffffff
  });

  it('shows gold border when all levels are completed and campaign has no stars or challenges', () => {
    const level = makeLevel(1); // no stars, no challenges
    const chapters = [{ id: 1, name: 'Ch1', levels: [level] }];
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const header = getCampaignHeader();
    expect(header?.style.borderColor).toBe('rgb(240, 192, 64)'); // #f0c040
  });
});

// ─── renderLevelList – Continue button location text ─────────────────────────

describe('renderLevelList – Continue button location text', () => {
  let container: HTMLElement;
  const campaign = { name: 'My Campaign', author: 'Author', completionPct: 50 };

  beforeEach(() => {
    document.body.innerHTML = '';
    container = makeLevelListEl();
  });

  function getContinueBtn(): HTMLButtonElement | null {
    return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Continue')) ?? null;
  }

  it('appends chapter-level location to Continue button when there is a level to continue', () => {
    const ch1 = { id: 1, name: 'Ch1', levels: [makeLevel(1), makeLevel(2)] };
    const chapters = [ch1];
    const completed = new Set<number>([1]); // level 2 is next

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const btn = getContinueBtn();
    // Level 2 is in chapter 1 at position 2 → (1-2)
    expect(btn?.textContent).toContain('(1-2)');
    expect(btn?.textContent).toContain('Continue');
  });

  it('appends correct chapter-level location across multiple chapters', () => {
    const ch1 = { id: 1, name: 'Ch1', levels: [makeLevel(1)] };
    const ch2 = { id: 2, name: 'Ch2', levels: [makeLevel(2), makeLevel(3)] };
    const chapters = [ch1, ch2];
    const completed = new Set<number>([1, 2]); // level 3 (ch2, pos2) is next

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const btn = getContinueBtn();
    // Level 3 is chapter 2, level 2 → (2-2)
    expect(btn?.textContent).toContain('(2-2)');
  });

  it('shows Continue without location when all levels are complete', () => {
    const chapters = [{ id: 1, name: 'Ch1', levels: [makeLevel(1)] }];
    const completed = new Set<number>([1]);

    renderLevelList(
      container, completed,
      () => {}, () => {}, () => {}, () => {}, () => {},
      campaign, chapters, {},
    );

    const btn = getContinueBtn();
    // No pending level → no location appended
    expect(btn?.textContent).toBe('▶ Continue');
    expect(btn?.disabled).toBe(true);
  });
});
