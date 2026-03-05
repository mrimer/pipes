/** Helpers for persisting long-term player progress in localStorage. */

const STORAGE_KEY = 'pipes_completed';

/** Load the set of completed level IDs from localStorage. */
export function loadCompletedLevels(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw) as number[];
      return new Set(ids);
    }
  } catch {
    // ignore parse errors
  }
  return new Set<number>();
}

/** Persist a newly-completed level and return the updated set. */
export function markLevelCompleted(completedLevels: Set<number>, levelId: number): void {
  completedLevels.add(levelId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedLevels]));
  } catch {
    // ignore storage errors
  }
}

/** Clear all level-completion data from both memory and localStorage. */
export function clearCompletedLevels(completedLevels: Set<number>): void {
  completedLevels.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}
