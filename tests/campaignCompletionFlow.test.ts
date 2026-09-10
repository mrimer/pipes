/**
 * @jest-environment jsdom
 */

import { CampaignCompletionFlow } from '../src/campaignCompletionFlow';
import type { CampaignCompletionCallbacks } from '../src/campaignCompletionFlow';
import type { CampaignDef, ChapterDef } from '../src/types';
import {
  loadCompletedChapters, markChapterCompleted,
  loadMasteredChaptersShown, markMasteredChapterShown,
  loadCampaignMasteredShown, loadCampaignCompleteShown, markCampaignCompleteShown,
} from '../src/persistence';
import { makeCampaignDef, makeChapterDef, makeLevelDef } from './testHelpers';

jest.mock('../src/visuals/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));
jest.mock('../src/visuals/balloons', () => ({
  spawnBalloons: (onComplete?: () => void) => { if (onComplete) onComplete(); },
}));
jest.mock('../src/visuals/fireworks', () => ({
  spawnFireworks: jest.fn(),
}));

type ChapterMapScreenStub = {
  isChapterComplete: jest.Mock<boolean, []>;
  playWinAnimation: jest.Mock<void, [(() => void)?]>;
};

type CampaignMapScreenStub = {
  isCampaignComplete: jest.Mock<boolean, []>;
  playWinAnimation: jest.Mock<void, [(() => void)?]>;
};

function makeChapterMapScreenStub(isChapterComplete = true): ChapterMapScreenStub {
  return {
    isChapterComplete: jest.fn(() => isChapterComplete),
    playWinAnimation: jest.fn((onComplete?: () => void) => onComplete?.()),
  };
}

function makeCampaignMapScreenStub(isCampaignComplete = true): CampaignMapScreenStub {
  return {
    isCampaignComplete: jest.fn(() => isCampaignComplete),
    playWinAnimation: jest.fn((onComplete?: () => void) => onComplete?.()),
  };
}

/** Build a fake CampaignCompletionCallbacks whose state fields are inspectable/mutable in the test. */
function makeFakeCallbacks() {
  const levelListEl = document.createElement('div');
  let campaignMasteredShown = false;
  let campaignCompleteShown = false;
  let progress = new Set<number>();
  let completedChapters = new Set<number>();
  let masteredChaptersShown = new Set<number>();
  let chapterMapScreen: ChapterMapScreenStub | null = null;
  let campaignMapScreen: CampaignMapScreenStub | null = null;
  const masteredChapterIds = new Set<number>();

  const cb: Omit<CampaignCompletionCallbacks, 'showChapterMap' | 'showCampaignMap' | 'showLevelSelect'> & {
    __setProgress(s: Set<number>): void;
    __setCompletedChapters(s: Set<number>): void;
    __setMasteredChaptersShown(s: Set<number>): void;
    __setChapterMapScreen(s: ChapterMapScreenStub | null): void;
    __setCampaignMapScreen(s: CampaignMapScreenStub | null): void;
    __setChapterMastered(chapterId: number, mastered: boolean): void;
    showChapterMap: jest.Mock<void, [number]>;
    showCampaignMap: jest.Mock<void, []>;
    showLevelSelect: jest.Mock<void, []>;
  } = {
    getActiveCampaignProgress: () => progress,
    getActiveCampaignCompletedChapters: () => completedChapters,
    getActiveCampaignMasteredChaptersShown: () => masteredChaptersShown,
    isCampaignMasteredShown: () => campaignMasteredShown,
    setCampaignMasteredShown: (v) => { campaignMasteredShown = v; },
    isCampaignCompleteShown: () => campaignCompleteShown,
    setCampaignCompleteShown: (v) => { campaignCompleteShown = v; },
    isChapterMastered: (chapter) => masteredChapterIds.has(chapter.id),
    getChapterMapScreen: () => chapterMapScreen as never,
    getCampaignMapScreen: () => campaignMapScreen as never,
    showLevelSelect: jest.fn(),
    levelListEl,
    showChapterMap: jest.fn(),
    showCampaignMap: jest.fn(),
    __setProgress: (s) => { progress = s; },
    __setCompletedChapters: (s) => { completedChapters = s; },
    __setMasteredChaptersShown: (s) => { masteredChaptersShown = s; },
    __setChapterMapScreen: (s) => { chapterMapScreen = s; },
    __setCampaignMapScreen: (s) => { campaignMapScreen = s; },
    __setChapterMastered: (chapterId, mastered) => {
      if (mastered) masteredChapterIds.add(chapterId); else masteredChapterIds.delete(chapterId);
    },
  };
  return cb;
}

function campaignWithMap(): CampaignDef {
  return makeCampaignDef({
    id: 'cmp-1',
    grid: [[{}]] as unknown as CampaignDef['grid'],
    chapters: [
      makeChapterDef({
        id: 1, name: 'Chapter 1', grid: [[{}]] as unknown as ChapterDef['grid'],
        levels: [makeLevelDef({ id: 1 })],
      }),
      makeChapterDef({
        id: 2, name: 'Chapter 2', grid: [[{}]] as unknown as ChapterDef['grid'],
        levels: [makeLevelDef({ id: 2 })],
      }),
    ],
  });
}

describe('CampaignCompletionFlow.recognizeChapterProgress', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('is a no-op when the chapter index is out of range', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();

    flow.recognizeChapterProgress(99, campaign);

    expect(cb.showChapterMap).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });

  it('clears stale completion + mastered-shown records when the chapter map reports it incomplete', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setCompletedChapters(new Set([1]));
    markChapterCompleted(campaign.id, 1, cb.getActiveCampaignCompletedChapters());
    cb.__setMasteredChaptersShown(new Set([1]));
    markMasteredChapterShown(campaign.id, 1, cb.getActiveCampaignMasteredChaptersShown());
    cb.__setChapterMapScreen(makeChapterMapScreenStub(false));

    flow.recognizeChapterProgress(0, campaign);

    expect(loadCompletedChapters(campaign.id)).toEqual(new Set());
    expect(loadMasteredChaptersShown(campaign.id)).toEqual(new Set());
  });

  it('auto-completes the chapter and shows the chapter-complete modal when newly complete', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setChapterMapScreen(makeChapterMapScreenStub(true));

    flow.recognizeChapterProgress(0, campaign);

    expect(loadCompletedChapters(campaign.id)).toEqual(new Set([1]));
    expect(document.getElementById('chapter-complete-modal')).not.toBeNull();
    expect(document.body.textContent).toContain('Chapter Complete!');
  });

  it('does not re-complete a chapter already marked completed', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setCompletedChapters(new Set([1]));
    const chapterMapScreen = makeChapterMapScreenStub(true);
    cb.__setChapterMapScreen(chapterMapScreen);

    flow.recognizeChapterProgress(0, campaign);

    expect(chapterMapScreen.playWinAnimation).not.toHaveBeenCalled();
    expect(document.getElementById('chapter-complete-modal')).toBeNull();
  });

  it('shows the chapter-mastery sequence once when the chapter just became mastered', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setCompletedChapters(new Set([1])); // already completed — mastery is independent
    cb.__setChapterMastered(1, true);

    flow.recognizeChapterProgress(0, campaign);

    expect(document.body.textContent).toContain('mastered');
    expect(loadMasteredChaptersShown(campaign.id)).toEqual(new Set([1]));
  });

  it('does not re-show chapter mastery once already shown', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setCompletedChapters(new Set([1]));
    cb.__setMasteredChaptersShown(new Set([1]));
    cb.__setChapterMastered(1, true);

    flow.recognizeChapterProgress(0, campaign);

    expect(document.body.children).toHaveLength(0);
  });
});

describe('CampaignCompletionFlow chapter-complete modal buttons', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('routes to the campaign map when the campaign has a map', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setChapterMapScreen(makeChapterMapScreenStub(true));

    flow.recognizeChapterProgress(0, campaign);
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Campaign Map');
    expect(button).toBeDefined();
    button!.click();

    expect(cb.showCampaignMap).toHaveBeenCalledTimes(1);
    expect(cb.showLevelSelect).not.toHaveBeenCalled();
  });

  it('routes to the main menu when the campaign has no map', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = makeCampaignDef({
      id: 'cmp-no-map',
      chapters: [makeChapterDef({ id: 1, grid: [[{}]] as unknown as ChapterDef['grid'], levels: [makeLevelDef({ id: 1 })] })],
    });
    cb.__setChapterMapScreen(makeChapterMapScreenStub(true));

    flow.recognizeChapterProgress(0, campaign);
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Main Menu');
    expect(button).toBeDefined();
    button!.click();

    expect(cb.showLevelSelect).toHaveBeenCalledTimes(1);
    expect(cb.showCampaignMap).not.toHaveBeenCalled();
  });

  it('navigates to the next chapter map from the "Next Chapter" button', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setChapterMapScreen(makeChapterMapScreenStub(true));

    flow.recognizeChapterProgress(0, campaign);
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Next Chapter →');
    expect(button).toBeDefined();
    button!.click();

    expect(cb.showChapterMap).toHaveBeenCalledWith(1);
  });

  it('omits the "Next Chapter" button on the last chapter', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setChapterMapScreen(makeChapterMapScreenStub(true));

    flow.recognizeChapterProgress(1, campaign);
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Next Chapter →');
    expect(button).toBeUndefined();
  });
});

describe('CampaignCompletionFlow.recognizeCampaignProgress', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('is a no-op when the campaign has no grid', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = makeCampaignDef({ id: 'cmp-no-grid' });
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(true));

    flow.recognizeCampaignProgress(campaign);

    expect(document.body.children).toHaveLength(0);
  });

  it('is a no-op when there is no campaign map screen', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();

    flow.recognizeCampaignProgress(campaign);

    expect(document.body.children).toHaveLength(0);
  });

  it('clears the campaign-complete-shown flag when the campaign is no longer complete', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    markCampaignCompleteShown(campaign.id);
    cb.setCampaignCompleteShown(true);
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(false));

    flow.recognizeCampaignProgress(campaign);

    expect(loadCampaignCompleteShown(campaign.id)).toBe(false);
    expect(cb.isCampaignCompleteShown()).toBe(false);
  });

  it('auto-completes the campaign and shows the campaign-complete modal when newly complete', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(true));

    flow.recognizeCampaignProgress(campaign);

    expect(cb.isCampaignCompleteShown()).toBe(true);
    expect(document.body.textContent).toContain('Campaign Complete!');
  });

  it('does not re-complete a campaign already marked complete-shown', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.setCampaignCompleteShown(true);
    const campaignMapScreen = makeCampaignMapScreenStub(true);
    cb.__setCampaignMapScreen(campaignMapScreen);

    flow.recognizeCampaignProgress(campaign);

    expect(campaignMapScreen.playWinAnimation).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Campaign Complete!');
  });

  it('shows the campaign-mastery sequence, then the complete modal, when all chapters are mastered on first completion', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.__setChapterMastered(1, true);
    cb.__setChapterMastered(2, true);
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(true));

    flow.recognizeCampaignProgress(campaign);

    expect(cb.isCampaignMasteredShown()).toBe(true);
    expect(document.body.textContent).toContain('Campaign Mastered!');
    expect(document.body.textContent).not.toContain('Campaign Complete!');

    // Completion is chained behind mastery — it only shows once the mastery modal is dismissed.
    const kudosBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((btn) => btn.textContent === 'Kudos!');
    kudosBtn!.click();

    expect(document.body.textContent).toContain('Campaign Complete!');
  });

  it('shows campaign mastery independently of completion, on reshow after prior completion', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.setCampaignCompleteShown(true);
    cb.__setChapterMastered(1, true);
    cb.__setChapterMastered(2, true);
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(true));

    flow.recognizeCampaignProgress(campaign);

    expect(document.body.textContent).toContain('Campaign Mastered!');
    expect(document.body.textContent).not.toContain('Campaign Complete!');
  });

  it('does not re-show campaign mastery once already shown', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();
    cb.setCampaignCompleteShown(true);
    cb.setCampaignMasteredShown(true);
    cb.__setChapterMastered(1, true);
    cb.__setChapterMastered(2, true);
    cb.__setCampaignMapScreen(makeCampaignMapScreenStub(true));

    flow.recognizeCampaignProgress(campaign);

    expect(document.body.textContent).not.toContain('Campaign Mastered!');
  });
});

describe('CampaignCompletionFlow.showCampaignMasterySequence', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows the mastery modal and records it as shown, independent of recognizeCampaignProgress', () => {
    const cb = makeFakeCallbacks();
    const flow = new CampaignCompletionFlow(cb);
    const campaign = campaignWithMap();

    flow.showCampaignMasterySequence(campaign);

    expect(cb.isCampaignMasteredShown()).toBe(true);
    expect(loadCampaignMasteredShown(campaign.id)).toBe(true);
    expect(document.body.textContent).toContain('Campaign Mastered!');
  });
});
