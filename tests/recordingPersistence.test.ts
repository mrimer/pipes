/**
 * @jest-environment jsdom
 */

/**
 * Tests for recording persistence helpers and auto-recording dedup logic.
 */

import {
  loadAllRecordings,
  loadRecordingsForLevel,
  loadRecordingsForProfile,
  saveRecording,
  deleteRecording,
  loadRecordingSettings,
  saveRecordingSettings,
} from '../src/persistence';
import { PlaySequenceRecord, RecordingSettings } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<PlaySequenceRecord> = {}): PlaySequenceRecord {
  return {
    id: `test-${Math.random().toString(36).slice(2, 9)}`,
    campaignId: 'test_campaign',
    levelId: 1,
    moves: ['P:Straight:0:1:90'],
    outcome: 'success',
    autoRecorded: false,
    timestamp: Date.now(),
    playerName: 'Tester',
    corrupted: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

// ─── loadAllRecordings ────────────────────────────────────────────────────────

describe('loadAllRecordings', () => {
  it('returns an empty array when no recordings are stored', () => {
    expect(loadAllRecordings()).toEqual([]);
  });

  it('returns stored recordings after saving', () => {
    const r = makeRecord();
    saveRecording(r);
    const all = loadAllRecordings();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(r.id);
  });
});

// ─── loadRecordingsForLevel ───────────────────────────────────────────────────

describe('loadRecordingsForLevel', () => {
  it('returns only recordings matching campaign and level', () => {
    const r1 = makeRecord({ campaignId: 'a', levelId: 1 });
    const r2 = makeRecord({ campaignId: 'a', levelId: 2 });
    const r3 = makeRecord({ campaignId: 'b', levelId: 1 });
    saveRecording(r1);
    saveRecording(r2);
    saveRecording(r3);

    const result = loadRecordingsForLevel('a', 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(r1.id);
  });

  it('returns empty array when no matching recordings', () => {
    saveRecording(makeRecord({ campaignId: 'x', levelId: 99 }));
    expect(loadRecordingsForLevel('y', 99)).toHaveLength(0);
  });
});

// ─── saveRecording ────────────────────────────────────────────────────────────

describe('saveRecording', () => {
  it('adds a new recording when id is not yet present', () => {
    saveRecording(makeRecord({ id: 'id-1' }));
    saveRecording(makeRecord({ id: 'id-2' }));
    expect(loadAllRecordings()).toHaveLength(2);
  });

  it('replaces an existing recording when id matches', () => {
    const r = makeRecord({ id: 'id-x', playerName: 'Alice' });
    saveRecording(r);
    saveRecording({ ...r, playerName: 'Bob' });
    const all = loadAllRecordings();
    expect(all).toHaveLength(1);
    expect(all[0].playerName).toBe('Bob');
  });
});

// ─── deleteRecording ─────────────────────────────────────────────────────────

describe('deleteRecording', () => {
  it('removes a recording by id', () => {
    const r = makeRecord({ id: 'del-1' });
    saveRecording(r);
    deleteRecording('del-1');
    expect(loadAllRecordings()).toHaveLength(0);
  });

  it('is a no-op when id is not found', () => {
    saveRecording(makeRecord({ id: 'keep-1' }));
    deleteRecording('nonexistent');
    expect(loadAllRecordings()).toHaveLength(1);
  });
});

// ─── loadRecordingSettings / saveRecordingSettings ───────────────────────────

describe('loadRecordingSettings', () => {
  it('returns default settings when nothing is stored', () => {
    const settings = loadRecordingSettings();
    expect(settings).toEqual({ recordSuccesses: true, recordFailures: false });
  });

  it('returns stored settings after saving', () => {
    saveRecordingSettings({ recordSuccesses: false, recordFailures: true });
    const settings = loadRecordingSettings();
    expect(settings).toEqual({ recordSuccesses: false, recordFailures: true });
  });

  it('falls back to defaults for missing keys in partial JSON', () => {
    localStorage.setItem('pipes_recording_settings', JSON.stringify({ recordFailures: true }));
    const settings = loadRecordingSettings();
    expect(settings.recordSuccesses).toBe(true);   // default
    expect(settings.recordFailures).toBe(true);
  });
});

// ─── Auto-recording dedup logic ───────────────────────────────────────────────

/**
 * Simulate the dedup logic from Game._maybeAutoRecord to keep the test
 * isolated from Game (which requires a real DOM and many collaborators).
 */
function simulateMaybeAutoRecord(
  existingRecords: PlaySequenceRecord[],
  newMoves: string[],
): boolean {
  const movesJson = JSON.stringify(newMoves);
  const isDuplicate = existingRecords.some(
    (r) => r.autoRecorded && JSON.stringify(r.moves) === movesJson,
  );
  return !isDuplicate;
}

describe('auto-recording dedup logic', () => {
  it('records when no auto-recorded sequence exists', () => {
    const existing: PlaySequenceRecord[] = [];
    expect(simulateMaybeAutoRecord(existing, ['P:Straight:0:1:90'])).toBe(true);
  });

  it('skips when an identical auto-recorded sequence exists', () => {
    const existing = [makeRecord({ autoRecorded: true, moves: ['P:Straight:0:1:90'] })];
    expect(simulateMaybeAutoRecord(existing, ['P:Straight:0:1:90'])).toBe(false);
  });

  it('records when the existing auto-recorded sequence differs', () => {
    const existing = [makeRecord({ autoRecorded: true, moves: ['P:Straight:0:1:0'] })];
    expect(simulateMaybeAutoRecord(existing, ['P:Straight:0:1:90'])).toBe(true);
  });

  it('records when an identical sequence exists but was manually recorded (not auto)', () => {
    // A manual recording with the same moves should NOT prevent a new auto-recording.
    const existing = [makeRecord({ autoRecorded: false, moves: ['P:Straight:0:1:90'] })];
    expect(simulateMaybeAutoRecord(existing, ['P:Straight:0:1:90'])).toBe(true);
  });

  it('records when the move sequence is empty (edge case)', () => {
    const existing: PlaySequenceRecord[] = [];
    expect(simulateMaybeAutoRecord(existing, [])).toBe(true);
  });

  it('skips when an identical empty sequence was already auto-recorded', () => {
    const existing = [makeRecord({ autoRecorded: true, moves: [] })];
    expect(simulateMaybeAutoRecord(existing, [])).toBe(false);
  });
});

// ─── loadRecordingsForProfile ─────────────────────────────────────────────────

describe('loadRecordingsForProfile', () => {
  const GUID_A = 'aaaa-aaaa';
  const GUID_B = 'bbbb-bbbb';

  it('matches on playerGuid when present', () => {
    saveRecording(makeRecord({ id: 'r1', playerGuid: GUID_A, playerName: 'Alice' }));
    saveRecording(makeRecord({ id: 'r2', playerGuid: GUID_B, playerName: 'Bob' }));

    const result = loadRecordingsForProfile(GUID_A, 'Alice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('falls back to playerName when playerGuid is absent', () => {
    // Old recording without a guid.
    saveRecording(makeRecord({ id: 'r-old', playerName: 'Alice' }));
    saveRecording(makeRecord({ id: 'r-new', playerGuid: GUID_B, playerName: 'Bob' }));

    const result = loadRecordingsForProfile(GUID_A, 'Alice');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-old');
  });

  it('does not match on name when playerGuid is present but different', () => {
    // Same name but different guid → belongs to a different profile.
    saveRecording(makeRecord({ id: 'r-other', playerGuid: GUID_B, playerName: 'Alice' }));

    const result = loadRecordingsForProfile(GUID_A, 'Alice');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no recordings match', () => {
    saveRecording(makeRecord({ id: 'r1', playerGuid: GUID_B, playerName: 'Bob' }));
    expect(loadRecordingsForProfile(GUID_A, 'Alice')).toHaveLength(0);
  });

  it('returns all matching recordings across campaigns and levels', () => {
    saveRecording(makeRecord({ id: 'r1', playerGuid: GUID_A, playerName: 'Alice', campaignId: 'c1', levelId: 1 }));
    saveRecording(makeRecord({ id: 'r2', playerGuid: GUID_A, playerName: 'Alice', campaignId: 'c2', levelId: 5 }));
    saveRecording(makeRecord({ id: 'r3', playerGuid: GUID_B, playerName: 'Bob' }));

    const result = loadRecordingsForProfile(GUID_A, 'Alice');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });
});
