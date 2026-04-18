/**
 * @jest-environment jsdom
 */

import { CampaignManager, CampaignCallbacks } from '../src/campaignManager';
import { CampaignEditor } from '../src/campaignEditor';
import { CampaignDef, PipeShape } from '../src/types';
import * as levelTransition from '../src/levelTransition';

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
    completedLevels: new Set<number>(),
    showResetConfirmModal: () => {},
    showRules: () => {},
    showSettings: () => {},
    ...overrides,
  };
}

function makeCampaign(withMap: boolean): CampaignDef {
  return {
    id: withMap ? 'cmp-map' : 'cmp-no-map',
    name: 'Campaign',
    author: 'Tester',
    rows: withMap ? 1 : undefined,
    cols: withMap ? 1 : undefined,
    grid: withMap ? [[{ shape: PipeShape.Source }]] : undefined,
    chapters: [
      {
        id: 1,
        name: 'Chapter 1',
        rows: 1,
        cols: 1,
        grid: [[{ shape: PipeShape.Source }]],
        levels: [
          {
            id: 1,
            name: 'Level 1',
            rows: 1,
            cols: 1,
            grid: [[{ shape: PipeShape.Source }]],
            inventory: [],
          },
        ],
      },
    ],
  };
}

function makeCampaignEditorMock(): CampaignEditor {
  return {
    getAllCampaigns: () => [],
    showAndRestore: () => {},
    hide: () => {},
  } as unknown as CampaignEditor;
}

describe('CampaignManager chapter-complete modal navigation button', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows "Campaign Map" and routes there when the campaign has a map', () => {
    const callbacks = makeCallbacks();
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
    expect((callbacks.showLevelSelect as jest.Mock)).not.toHaveBeenCalled();
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
    jest.restoreAllMocks();
  });

  it('falls back to showLevelSelect when campaign map screen is unavailable', () => {
    const showLevelSelect = jest.fn();
    const callbacks = makeCallbacks({ showLevelSelect });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const swirlSpy = jest.spyOn(levelTransition, 'playSwirlScreenTransition');

    (manager as unknown as { _exitCampaignMapToMainScreen(): void })._exitCampaignMapToMainScreen();

    expect(showLevelSelect).toHaveBeenCalledTimes(1);
    expect(swirlSpy).not.toHaveBeenCalled();
  });

  it('uses swirl transition when exiting from a visible campaign map screen', () => {
    const showLevelSelect = jest.fn(() => {
      // Mimic main-screen show behavior.
      callbacks.levelSelectEl.style.display = 'flex';
    });
    const callbacks = makeCallbacks({ showLevelSelect });
    const manager = new CampaignManager(callbacks, makeCampaignEditorMock());
    const campaign = makeCampaign(true);
    const swirlSpy = jest.spyOn(levelTransition, 'playSwirlScreenTransition')
      .mockImplementation((fromScreenEl, showDestination, onComplete) => {
        expect(fromScreenEl).toBe((manager as unknown as { _campaignMapScreen?: { screenEl: HTMLElement } })._campaignMapScreen?.screenEl);
        const toEl = showDestination();
        expect(toEl).toBe(callbacks.levelSelectEl);
        onComplete();
      });

    manager.activate(campaign);
    manager.showCampaignMap();
    showLevelSelect.mockClear();

    (manager as unknown as { _exitCampaignMapToMainScreen(): void })._exitCampaignMapToMainScreen();

    expect(swirlSpy).toHaveBeenCalledTimes(1);
    expect(showLevelSelect).toHaveBeenCalledTimes(1);
  });
});
