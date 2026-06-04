/**
 * @jest-environment jsdom
 */

import { buildPlaybackListModal } from '../src/recordingModals';
import { PlayerProfileScreen } from '../src/playerProfileScreen';
import { registerTranslations, resetI18n, setLocale } from '../src/i18n';
import type { PlaySequenceRecord } from '../src/types';

function makeRecord(id: string): PlaySequenceRecord {
  return {
    id,
    campaignId: 'campaign-1',
    levelId: 1,
    moves: ['P:0,0:Straight:0'],
    outcome: 'success',
    autoRecorded: false,
    timestamp: 1_700_000_000_000,
    playerName: 'Player',
    corrupted: false,
  };
}

describe('i18n DOM integration', () => {
  afterEach(() => {
    resetI18n();
    document.body.innerHTML = '';
  });

  it('renders translated recording modal labels', () => {
    registerTranslations('pirate', {
      'recording.list.title': '🏴‍☠️ Saved Booty',
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

    expect(document.querySelector('h2')?.textContent).toBe('��‍☠️ Saved Booty');
    expect(document.querySelector('li')?.textContent).toBe('No booty yet.');
  });

  it('renders translated player profile headings', () => {
    registerTranslations('pirate', {
      'profile.title': '🏴‍☠️ Choose Pirate',
      'profile.empty': 'Vacant berth',
    });
    setLocale('pirate');

    const screen = new PlayerProfileScreen();
    screen.show();

    const overlay = document.getElementById('player-profile-screen');
    expect(overlay?.querySelector('h2')?.textContent).toBe('🏴‍☠️ Choose Pirate');
    expect(overlay?.querySelector('div')?.textContent).toContain('Vacant berth');

    screen.hide();
  });
});
