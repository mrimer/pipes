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

  it('shows the "Select a Player Profile" heading', () => {
    const screen = new PlayerProfileScreen();

    screen.show();

    const heading = document.querySelector('#player-profile-screen h1');
    expect(heading?.textContent).toBe('Select a Player Profile');
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
});
