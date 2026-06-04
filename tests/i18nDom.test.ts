/**
 * @jest-environment jsdom
 */

import { buildPlaybackListModal } from '../src/recordingModals';
import { PlayerProfileScreen } from '../src/playerProfileScreen';
import { registerTranslations, resetI18n, setLocale } from '../src/i18n';

describe('i18n DOM integration', () => {
  afterEach(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    resetI18n();
    document.body.innerHTML = '';
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('renders translated recording modal labels', () => {
    registerTranslations('pirate', {
      'recording.list.title': 'Pirate recordings',
      'recording.list.empty': 'No booty yet.',
    });
    setLocale('pirate');

    buildPlaybackListModal({
      getRecords: () => [],
      onReplay: jest.fn(),
      onReturn: jest.fn(),
      onDelete: jest.fn(),
      onExport: jest.fn(),
      onImport: jest.fn(),
    });

    expect(document.querySelector('h2')?.textContent).toBe('Pirate recordings');
    expect(document.querySelector('li')?.textContent).toBe('No booty yet.');
  });

  it('renders translated player profile headings', () => {
    registerTranslations('pirate', {
      'profile.title': 'Choose pirate',
      'profile.empty': 'Vacant berth',
    });
    setLocale('pirate');

    const screen = new PlayerProfileScreen();
    screen.show();

    const overlay = document.getElementById('player-profile-screen');
    expect(overlay?.querySelector('h2')?.textContent).toBe('Choose pirate');
    expect(overlay?.querySelector('div')?.textContent).toContain('Vacant berth');

    screen.hide();
  });
});
