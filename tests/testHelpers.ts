/**
 * Shared test utilities for the Pipes test suite.
 */

import type { CampaignDef, ChapterDef, LevelDef, PlaySequenceRecord } from '../src/types';
import { Direction, PipeShape } from '../src/types';

/**
 * Build a minimal {@link LevelDef} with sensible defaults.
 * Any field may be overridden via `overrides`.
 *
 * Default grid: 1×2, Source at (0,0) facing East → Sink at (0,1) facing West.
 */
export function makeLevelDef(overrides: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 1,
    name: 'Test Level',
    rows: 1,
    cols: 2,
    grid: [
      [
        { shape: PipeShape.Source, capacity: 10, connections: [Direction.East] },
        { shape: PipeShape.Sink, connections: [Direction.West] },
      ],
    ],
    inventory: [],
    ...overrides,
  };
}

/**
 * Build a minimal {@link ChapterDef} with sensible defaults.
 * Any field may be overridden via `overrides`.
 */
export function makeChapterDef(overrides: Partial<ChapterDef> = {}): ChapterDef {
  return {
    id: 1,
    name: 'Chapter 1',
    levels: [makeLevelDef()],
    ...overrides,
  };
}

/**
 * Build a minimal {@link CampaignDef} with sensible defaults.
 * Any field may be overridden via `overrides`.
 */
export function makeCampaignDef(overrides: Partial<CampaignDef> = {}): CampaignDef {
  return {
    id: 'test_campaign',
    name: 'Test',
    author: 'Tester',
    chapters: [makeChapterDef()],
    ...overrides,
  };
}

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
