/**
 * Shared test utilities for the Pipes test suite.
 */

import { PlaySequenceRecord } from '../src/types';

/**
 * Build a minimal {@link PlaySequenceRecord} with sensible defaults.
 * Any field may be overridden via `overrides`.
 */
export function makeRecord(overrides: Partial<PlaySequenceRecord> = {}): PlaySequenceRecord {
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
