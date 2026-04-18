/**
 * @jest-environment jsdom
 */

import { CampaignManager, CampaignCallbacks } from '../src/campaignManager';
import { CampaignEditor } from '../src/campaignEditor';
import { CampaignDef, PipeShape } from '../src/types';

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

describe('CampaignManager chapter-complete modal navigation button', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('shows "Campaign Map" and routes there when the campaign has a map', () => {
    const callbacks = makeCallbacks();
    const manager = new CampaignManager(callbacks, {} as CampaignEditor);
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
    const manager = new CampaignManager(callbacks, {} as CampaignEditor);
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
