import { HistoryManager } from '../src/campaignEditor/historyManager';

describe('HistoryManager', () => {
  it('keeps unsaved changes true when a saved point is truncated by a new record', () => {
    const h = new HistoryManager<{ n: number }>();
    h.record({ n: 0 });
    h.record({ n: 1 });
    h.markSaved();
    h.record({ n: 2 });
    h.undo();
    h.undo();

    expect(h.hasUnsavedChanges).toBe(true);

    h.record({ n: 3 });

    expect(h.savedIndex).toBe(-1);
    expect(h.hasUnsavedChanges).toBe(true);
  });
});
