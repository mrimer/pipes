/**
 * @jest-environment jsdom
 */

import { buildPlaybackListModal } from '../src/recordingModals';
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

describe('buildPlaybackListModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Ensure any open modal unregisters its Escape key listener from document.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.body.innerHTML = '';
  });

  it('dismisses the modal and triggers onReturn when Escape is pressed', () => {
    const onReturn = jest.fn();
    const modal = buildPlaybackListModal({
      getRecords: () => [makeRecord('r1')],
      onReplay: jest.fn(),
      onReturn,
      onDelete: jest.fn(),
      onExport: jest.fn(),
      onImport: jest.fn(),
    });

    expect(document.body.contains(modal)).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(document.body.contains(modal)).toBe(false);
  });

  it('keeps Delete and Export disabled when nothing is selected', () => {
    buildPlaybackListModal({
      getRecords: () => [makeRecord('r1')],
      onReplay: jest.fn(),
      onReturn: jest.fn(),
      onDelete: jest.fn(),
      onExport: jest.fn(),
      onImport: jest.fn(),
    });

    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    const deleteBtn = buttons.find((button) => button.textContent === 'Delete');
    const exportBtn = buttons.find((button) => button.textContent === 'Export');
    const listItem = document.querySelector<HTMLLIElement>('li');
    const listContainer = document.querySelector<HTMLDivElement>('ul')?.parentElement as HTMLDivElement | null;

    expect(deleteBtn).toBeDefined();
    expect(exportBtn).toBeDefined();
    expect(listItem).not.toBeNull();
    expect(listContainer).not.toBeNull();

    expect(deleteBtn!.disabled).toBe(true);
    expect(exportBtn!.disabled).toBe(true);

    listItem!.click();
    expect(deleteBtn!.disabled).toBe(false);
    expect(exportBtn!.disabled).toBe(false);

    listContainer!.click();
    expect(deleteBtn!.disabled).toBe(true);
    expect(exportBtn!.disabled).toBe(true);
  });
});
