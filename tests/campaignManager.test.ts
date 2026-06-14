/**
 * @jest-environment jsdom
 */

import type { CampaignCallbacks } from '../src/campaignManager';
import { CampaignManager } from '../src/campaignManager';
import type { CampaignEditor } from '../src/campaignEditor';
import type { CampaignDef } from '../src/types';
import { PipeShape } from '../src/types';
import { setActiveSlotIndex } from '../src/activeProfile';
import {
  loadCampaignProgress,
  loadCampaignCompleteShown,
  loadCompletedChapters,
  loadMasteredChaptersShown,
  loadLevelStars,
  markCampaignCompleteShown,
  markChapterCompleted,
  markMasteredChapterShown,
  markCampaignLevelCompleted,
  saveLevelStar,
} from '../src/persistence';
import * as levelTransition from '../src/levelTransition';
import { makeCampaignDef, makeChapterDef, makeLevelDef } from './testHelpers';
import { t } from '../src/i18n';

jest.mock('../src/visuals/confetti', () => ({
  spawnConfetti: (onComplete?: () => void) => { if (onComplete) onComplete(); },
  clearConfetti: jest.fn(),
}));

function makeCallbacks(overrides: Partial<CampaignCallbacks> = {}): CampaignCallbacks {
  const levelSelectEl = document.createElement('div');
  const levelHeaderEl = document.createElement('div');
  const levelListEl = document.createElement('div');
  const winModalEl = document.createElement('div');
  const winNextBtnEl = document.createElement('button');
  const exitBtnEl = document.createElement('button');
  const gameoverMenuBtnEl = document.createElement('button');
  const showLevelSelect = jest.fn();
  document.body.append(levelSelectEl, levelHeaderEl, levelListEl, winModalEl, winNextBtnEl, exitBtnEl, gameoverMenuBtnEl);

  return {
    startLevel: () => {},
    startLevelDef: () => {},
    showLevelSelect,
    exitToMenu: () => {},
    closeModal: () => {},
    triggerModalSparkle: () => {},
    setScreen: () => {},
    setLevelSelectVisible: () => {},
    setPlayScreenVisible: () => {},
    playLevelTransition: () => {},
    levelSelectEl,
    levelHeaderEl,
    levelListEl,
    winModalEl,
    winNextBtnEl,
    exitBtnEl,
    gameoverMenuBtnEl,
    showResetConfirmModal: () => {},
    showRules: () => {},
    showCredits: () => {},
    showSettings: () => {},
    showPlayerProfile: () => {},
    getPlayerName: () => null,
    ...overrides,
  };
}

function makeCampaign(withMap: boolean): CampaignDef {
  return makeCampaignDef({
    id: withMap ? 'cmp-map' : 'cmp-no-map',
    name: 'Campaign',
    rows: withMap ? 1 : undefined,
    cols: withMap ? 1 : undefined,
    grid: withMap ? [[{ shape: PipeShape.Source }]] : undefined,
    chapters: [
      makeChapterDef({
        id: 1,
        name: 'Chapter 1',
        rows: 1,
        cols: 1,
        grid: [[{ shape: PipeShape.Source }]],
        levels: [makeLevelDef({ id: 1, name: 'Level 1', rows: 1, cols: 1, grid: [[{ shape: PipeShape.Source }]] })],
      }),
    ],
  });
}

function makeCampaignEditorMock(): CampaignEditor {
  return {
    getAllCampaigns: () => [],
    showAndRestore: () => {},
    hide: () => {},
  } as unknown as CampaignEditor;
}

type ChapterMapScreenStub = {
  chapterIdx: number;
  show: jest.Mock<void, [CampaignDef, number]>;
  isChapterComplete: jest.Mock<boolean, []>;
  playWinAnimation: jest.Mock<void, [(() => void)?]>;
};

type CampaignMapScreenStub = {
  repopulate: jest.Mock<void, [CampaignDef]>;
  show: jest.Mock<void, [CampaignDef]>;
  isCampaignComplete: jest.Mock<boolean, []>;
  playWinAnimation: jest.Mock<void, [(() => void)?]>;
};

type CampaignManagerTestAccess = {
  _chapterMapScreen?: ChapterMapScreenStub;
  _campaignMapScreen?: CampaignMapScreenStub;
  _activeCampaignMasteredChaptersShown: Set<number>;
  _campaignCompleteShown: boolean;
  _campaignMasteredShown: boolean;
  _isCampaignChapterMastered: (chapter: CampaignDef['chapters'][number]) => boolean;
};

/** Build a minimal chapter-map screen stub for recognition-path tests. */
function makeChapterMapScreenStub(options: {
  chapterIdx?: number;
  isChapterComplete?: boolean;
} = {}): ChapterMapScreenStub {
  return {
    chapterIdx: options.chapterIdx ?? 0,
    show: jest.fn(),
    isChapterComplete: jest.fn(() => options.isChapterComplete ?? true),
    playWinAnimation: jest.fn((onComplete?: () => void) => {
      onComplete?.();
    }),
  };
}

/** Build a minimal campaign-map screen stub for recognition-path tests. */
function makeCampaignMapScreenStub(options: {
  isCampaignComplete?: boolean;
} = {}): CampaignMapScreenStub {
  return {
    repopulate: jest.fn(),
    show: jest.fn(),
    isCampaignComplete: jest.fn(() => options.isCampaignComplete ?? true),
    playWinAnimation: jest.fn((onComplete?: () => void) => {
      onComplete?.();
    }),
  };
}

describe('CampaignManager chapter-complete modal navigation button', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows "Campaign Map" and routes there when the campaign has a map', () => {
    const showLevelSelect = jest.fn();
    const callbacks = makeCallbacks({ showLevelSelect });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const managerAny = manager as unknown as {
      _activeCampaign: CampaignDef | null;
      _activeCampaignProgress: Set<number>;
      _showChapterCompleteModal(chapterIdx: number, campaign: CampaignDef): void;
    };
    const campaign = makeCampaign(true);
    managerAny._activeCampaign = campaign;
    managerAny._activeCampaignProgress = new Set<number>([1]);
    const showCampaignMapSpy = jest.spyOn(manager, 'showCampaignMap').mockImplementation(() => {});

    managerAny._showChapterCompleteModal(0, campaign);

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Campaign Map');
    expect(button).toBeDefined();
    button!.click();
    expect(showCampaignMapSpy).toHaveBeenCalledTimes(1);
    expect(showLevelSelect).not.toHaveBeenCalled();
  });

  it('keeps "Main Menu" routing when the campaign has no map', () => {
    const showLevelSelect = jest.fn();
    const callbacks = makeCallbacks({ showLevelSelect });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const managerAny = manager as unknown as {
      _activeCampaign: CampaignDef | null;
      _activeCampaignProgress: Set<number>;
      _showChapterCompleteModal(chapterIdx: number, campaign: CampaignDef): void;
    };
    const campaign = makeCampaign(false);
    managerAny._activeCampaign = campaign;
    managerAny._activeCampaignProgress = new Set<number>([1]);
    const showCampaignMapSpy = jest.spyOn(manager, 'showCampaignMap').mockImplementation(() => {});

    managerAny._showChapterCompleteModal(0, campaign);

    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('#chapter-complete-modal button'))
      .find((btn) => btn.textContent === 'Main Menu');
    expect(button).toBeDefined();
    button!.click();
    expect(showLevelSelect).toHaveBeenCalledTimes(1);
    expect(showCampaignMapSpy).not.toHaveBeenCalled();
  });
});

describe('CampaignManager campaign-map exit transition', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActiveSlotIndex(0);
    jest.restoreAllMocks();
  });

  function getMainMenuBackButton(): HTMLButtonElement | undefined {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((btn) => btn.textContent === '← Main Menu');
  }

  it('falls back to showLevelSelect when campaign map screen is hidden', () => {
    const callbacks = makeCallbacks();
    const showLevelSelect = jest.fn(() => {
      callbacks.levelSelectEl.style.display = 'flex';
    });
    callbacks.showLevelSelect = showLevelSelect;
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const swirlSpy = jest.spyOn(levelTransition, 'playSwirlScreenTransition');

    manager.activate(campaign);
    manager.showCampaignMap();
    showLevelSelect.mockClear();
    manager.hideCampaignMap();

    const backButton = getMainMenuBackButton();
    expect(backButton).toBeDefined();
    backButton!.click();

    expect(showLevelSelect).toHaveBeenCalledTimes(1);
    expect(swirlSpy).not.toHaveBeenCalled();
  });

  it('uses swirl transition when exiting from a visible campaign map screen', () => {
    const callbacks = makeCallbacks();
    const showLevelSelect = jest.fn(() => {
      callbacks.levelSelectEl.style.display = 'flex';
    });
    callbacks.showLevelSelect = showLevelSelect;
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const swirlSpy = jest.spyOn(levelTransition, 'playSwirlScreenTransition')
      .mockImplementation((_fromScreenEl, showDestination, onComplete) => {
        const toEl = showDestination();
        expect(toEl).toBe(callbacks.levelSelectEl);
        onComplete();
      });

    manager.activate(campaign);
    manager.showCampaignMap();
    showLevelSelect.mockClear();
    const backButton = getMainMenuBackButton();
    expect(backButton).toBeDefined();

    backButton!.click();

    expect(swirlSpy).toHaveBeenCalledTimes(1);
    expect(showLevelSelect).toHaveBeenCalledTimes(1);
  });
});

describe('CampaignManager profile-scoped progress actions', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActiveSlotIndex(0);
  });

  it('unlockAll marks the current campaign completed and mastered for only the active profile', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaignDef({
      id: 'cmp-profile-unlock',
      name: 'Profile Unlock',
      chapters: [
        makeChapterDef({
          id: 10,
          name: 'Chapter 1',
          levels: [
            makeLevelDef({ id: 101, starCount: 2 }),
            makeLevelDef({ id: 102, challenge: true, starCount: 1 }),
          ],
        }),
        makeChapterDef({
          id: 11,
          name: 'Chapter 2',
          levels: [makeLevelDef({ id: 103, starCount: 3 })],
        }),
      ],
    });

    manager.activate(campaign);
    manager.unlockAll();

    expect(loadCampaignProgress(campaign.id)).toEqual(new Set<number>([101, 102, 103]));
    expect(loadCompletedChapters(campaign.id)).toEqual(new Set<number>([10, 11]));
    expect(loadLevelStars(campaign.id)).toEqual({ 101: 2, 102: 1, 103: 3 });

    setActiveSlotIndex(1);
    expect(loadCampaignProgress(campaign.id)).toEqual(new Set<number>());
    expect(loadCompletedChapters(campaign.id)).toEqual(new Set<number>());
    expect(loadLevelStars(campaign.id)).toEqual({});
  });

  it('resetProgress clears only the active profile progress for the current campaign', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(false);

    setActiveSlotIndex(0);
    manager.activate(campaign);
    markCampaignLevelCompleted(campaign.id, 1, loadCampaignProgress(campaign.id));
    saveLevelStar(1, 2, campaign.id);

    setActiveSlotIndex(1);
    markCampaignLevelCompleted(campaign.id, 1, loadCampaignProgress(campaign.id));
    saveLevelStar(1, 3, campaign.id);

    setActiveSlotIndex(0);
    manager.activate(campaign);
    manager.resetProgress();

    expect(loadCampaignProgress(campaign.id)).toEqual(new Set<number>());
    expect(loadLevelStars(campaign.id)).toEqual({});

    setActiveSlotIndex(1);
    expect(loadCampaignProgress(campaign.id)).toEqual(new Set<number>([1]));
    expect(loadLevelStars(campaign.id)).toEqual({ 1: 3 });
  });
});

describe('CampaignManager reshowCampaignMap', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('fires onMapScreenEntered with isCampaignMap=true when reshowing campaign map', () => {
    const onMapScreenEntered = jest.fn();
    const callbacks = makeCallbacks({ onMapScreenEntered });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true);

    manager.activate(campaign);
    manager.showCampaignMap();
    onMapScreenEntered.mockClear();

    manager.reshowCampaignMap();

    expect(onMapScreenEntered).toHaveBeenCalledTimes(1);
    expect(onMapScreenEntered).toHaveBeenCalledWith(campaign.style, true);
  });

  it('does not fire onMapScreenEntered when reshowing without an active campaign map', () => {
    const onMapScreenEntered = jest.fn();
    const callbacks = makeCallbacks({ onMapScreenEntered });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    // Campaign without a map grid — reshowCampaignMap should be a no-op.
    const campaign = makeCampaign(false);
    manager.activate(campaign);

    manager.reshowCampaignMap();

    expect(onMapScreenEntered).not.toHaveBeenCalled();
  });
});

describe('CampaignManager progress recognition', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActiveSlotIndex(0);
    jest.restoreAllMocks();
  });

  it('shows chapter mastery on reshow after prior completion', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const chapterMapScreen = makeChapterMapScreenStub({ isChapterComplete: true });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    markChapterCompleted(campaign.id, 1, manager.completedChapters);
    managerAny._chapterMapScreen = chapterMapScreen;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => true);

    manager.reshowChapterMap();

    expect(document.body.textContent).toContain('Chapter mastered!');
  });

  it('shows only one chapter mastery modal on first completion', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const chapterMapScreen = makeChapterMapScreenStub({ isChapterComplete: true });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    managerAny._chapterMapScreen = chapterMapScreen;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => true);

    manager.showChapterMap(0, false);

    const masteryTitles = Array.from(document.querySelectorAll('h2'))
      .filter((el) => el.textContent === 'Chapter mastered!');
    expect(masteryTitles).toHaveLength(1);
  });

  it('shows campaign mastery on show after prior completion', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const campaignMapScreen = makeCampaignMapScreenStub({ isCampaignComplete: true });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    markCampaignCompleteShown(campaign.id);
    managerAny._campaignMapScreen = campaignMapScreen;
    managerAny._campaignCompleteShown = true;
    managerAny._campaignMasteredShown = false;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => true);

    manager.showCampaignMap();

    expect(document.body.textContent).toContain('Campaign Mastered!');
  });

  it('shows campaign complete on campaign-map reshow when newly completed', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const campaignMapScreen = makeCampaignMapScreenStub({ isCampaignComplete: true });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    managerAny._campaignMapScreen = campaignMapScreen;
    managerAny._campaignCompleteShown = false;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => false);

    manager.reshowCampaignMap();

    expect(document.body.textContent).toContain('Campaign Complete!');
  });

  it('clears stale chapter completion and mastery-shown records on reshow', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const chapterMapScreen = makeChapterMapScreenStub({ isChapterComplete: false });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    markChapterCompleted(campaign.id, 1, manager.completedChapters);
    markMasteredChapterShown(campaign.id, 1, managerAny._activeCampaignMasteredChaptersShown);
    managerAny._chapterMapScreen = chapterMapScreen;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => false);

    manager.reshowChapterMap();

    expect(loadCompletedChapters(campaign.id)).toEqual(new Set<number>());
    expect(loadMasteredChaptersShown(campaign.id)).toEqual(new Set<number>());
  });

  it('keeps the campaign complete flag when the campaign remains complete', () => {
    const manager = new CampaignManager(makeCallbacks(), makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const campaignMapScreen = makeCampaignMapScreenStub({ isCampaignComplete: true });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    markCampaignCompleteShown(campaign.id);
    managerAny._campaignMapScreen = campaignMapScreen;
    managerAny._campaignCompleteShown = true;
    managerAny._isCampaignChapterMastered = jest.fn((_chapter) => false);

    manager.reshowCampaignMap();

    expect(loadCampaignCompleteShown(campaign.id)).toBe(true);
  });
});

describe('CampaignManager main-menu "Continue X-Y" resume', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActiveSlotIndex(0);
    jest.restoreAllMocks();
  });

  it('establishes the chapter map context so exiting zooms back to the chapter map', () => {
    const startLevel = jest.fn();
    const callbacks = makeCallbacks({ startLevel });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true); // grid-map chapter
    const chapterMapScreen = makeChapterMapScreenStub({ chapterIdx: 0 });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    managerAny._chapterMapScreen = chapterMapScreen;

    manager.startLevelFromMainMenuPartial(1);

    expect(chapterMapScreen.show).toHaveBeenCalledWith(campaign, 0);
    expect(manager.winFromChapterMap).toBe(true);
    expect(callbacks.exitBtnEl.textContent).toBe(t('campaign.nav.chapterMap'));
    expect(startLevel).toHaveBeenCalledWith(1);
  });

  it('starts plainly (no chapter-map context) for a non-grid chapter', () => {
    const startLevel = jest.fn();
    const callbacks = makeCallbacks({ startLevel });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaignDef({
      id: 'cmp-list',
      name: 'List campaign',
      chapters: [
        makeChapterDef({
          id: 1,
          name: 'Chapter 1',
          // no grid → no chapter map screen
          levels: [makeLevelDef({ id: 7, name: 'Level 7', rows: 1, cols: 1, grid: [[{ shape: PipeShape.Source }]] })],
        }),
      ],
    });
    const chapterMapScreen = makeChapterMapScreenStub({ chapterIdx: 0 });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    managerAny._chapterMapScreen = chapterMapScreen;

    manager.startLevelFromMainMenuPartial(7);

    expect(chapterMapScreen.show).not.toHaveBeenCalled();
    expect(manager.winFromChapterMap).toBe(false);
    expect(startLevel).toHaveBeenCalledWith(7);
  });

  it('starts plainly when the resumed level is not in the active campaign', () => {
    const startLevel = jest.fn();
    const callbacks = makeCallbacks({ startLevel });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const chapterMapScreen = makeChapterMapScreenStub({ chapterIdx: 0 });
    const managerAny = manager as unknown as CampaignManagerTestAccess;

    manager.activate(campaign);
    managerAny._chapterMapScreen = chapterMapScreen;

    manager.startLevelFromMainMenuPartial(999); // unknown level id

    expect(chapterMapScreen.show).not.toHaveBeenCalled();
    expect(manager.winFromChapterMap).toBe(false);
    expect(startLevel).toHaveBeenCalledWith(999);
  });
});
