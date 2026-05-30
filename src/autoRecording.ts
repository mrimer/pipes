import { PlaySequenceRecord } from './types';

/** Returns true when an identical auto-recorded move sequence already exists. */
export function hasDuplicateAutoRecording(existingRecords: PlaySequenceRecord[], moves: string[]): boolean {
  const movesJson = JSON.stringify(moves);
  return existingRecords.some(
    (r) => r.autoRecorded && JSON.stringify(r.moves) === movesJson,
  );
}
