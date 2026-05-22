/**
 * @jest-environment jsdom
 */

import { PlayerProfileScreen } from '../src/playerProfileScreen';
import { setActiveSlotIndex } from '../src/activeProfile';
import { saveSlotMeta } from '../src/playerProfileSlots';
import { sfxManager, SfxId } from '../src/sfxManager';

describe('PlayerProfileScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    setActiveSlotIndex(null);
    jest.restoreAllMocks();
  });

  afterEach(() => {
    setActiveSlotIndex(null);
  });

  it('shows the "👤 Select Player" heading', () => {
    const screen = new PlayerProfileScreen();

    screen.show();

    const overlay = document.getElementById('player-profile-screen');
    const heading = overlay?.querySelector('h1') ?? null;
    const cards = overlay?.querySelector('div') ?? null;
    expect(heading?.textContent).toBe('👤 Select Player');
    expect(heading?.nextElementSibling).toBe(cards);
  });

  it('resets overlay scroll and centers content when shown', () => {
    const screen = new PlayerProfileScreen();
    const overlay = document.getElementById('player-profile-screen') as HTMLDivElement | null;
    expect(overlay).not.toBeNull();
    overlay!.scrollTop = 120;

    screen.show();

    expect(overlay!.scrollTop).toBe(0);
    expect(overlay!.style.justifyContent).toBe('center');
  });

  it('plays Click when selecting a profile card button', () => {
    saveSlotMeta(0, { guid: 'guid-0', name: 'Alice', lastPlayedAt: null });
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});
    const screen = new PlayerProfileScreen();

    screen.show();

    const selectBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('#player-profile-screen button'))
      .find((btn) => btn.textContent?.includes('Select'));
    expect(selectBtn).not.toBeUndefined();
    selectBtn!.click();

    expect(playSpy).toHaveBeenCalledWith(SfxId.Click);
  });

  it('plays Click when clicking the rename pencil button', () => {
    saveSlotMeta(0, { guid: 'guid-0', name: 'Alice', lastPlayedAt: null });
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});
    const screen = new PlayerProfileScreen();

    screen.show();

    const pencilBtn = document.querySelector<HTMLButtonElement>('button[title="Edit player name"]');
    expect(pencilBtn).not.toBeNull();
    pencilBtn!.click();

    expect(playSpy).toHaveBeenCalledWith(SfxId.Click);
  });

  it('plays Back and returns to the menu when Escape is pressed with an active profile', () => {
    saveSlotMeta(0, { guid: 'guid-0', name: 'Alice', lastPlayedAt: null });
    setActiveSlotIndex(0);
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});
    const onReturnToMenu = jest.fn();
    const screen = new PlayerProfileScreen();
    screen.onReturnToMenu = onReturnToMenu;

    screen.show();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    const overlay = document.getElementById('player-profile-screen') as HTMLElement | null;
    expect(playSpy).toHaveBeenCalledWith(SfxId.Back);
    expect(onReturnToMenu).toHaveBeenCalledTimes(1);
    expect(overlay?.style.display).toBe('none');
  });

  it('plays Click and returns to menu when clicking the active profile card', () => {
    saveSlotMeta(0, { guid: 'guid-0', name: 'Alice', lastPlayedAt: null });
    setActiveSlotIndex(0);
    const playSpy = jest.spyOn(sfxManager, 'play').mockImplementation(() => {});
    const onReturnToMenu = jest.fn();
    const screen = new PlayerProfileScreen();
    screen.onReturnToMenu = onReturnToMenu;

    screen.show();

    const activeBadge = Array.from(document.querySelectorAll<HTMLDivElement>('#player-profile-screen div'))
      .find((el) => el.textContent === '✅ Active');
    expect(activeBadge).toBeDefined();
    const activeCard = activeBadge?.parentElement as HTMLDivElement | null;
    expect(activeCard).not.toBeNull();

    activeCard!.click();

    expect(playSpy).toHaveBeenCalledWith(SfxId.Click);
    expect(onReturnToMenu).toHaveBeenCalledTimes(1);
  });
});
