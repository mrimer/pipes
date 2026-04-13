/**
 * HistoryManager – generic undo/redo history for the level editor and chapter
 * map editor.  Stores deep-cloned snapshots so callers never share mutable
 * state with the history stack.
 */

export class HistoryManager<T> {
  private _history: T[] = [];
  private _idx = -1;
  private _savedIdx = 0;
  private _unsavedChanges = false;

  // ── Computed state ──────────────────────────────────────────────────────────

  get canUndo(): boolean { return this._idx > 0; }
  get canRedo(): boolean { return this._idx < this._history.length - 1; }
  get hasUnsavedChanges(): boolean { return this._unsavedChanges; }

  // ── Mutation ────────────────────────────────────────────────────────────────

  /**
   * Deep-clone `snapshot` and push it onto the history stack.  Any redo
   * entries ahead of the current position are discarded.  Marks unsaved
   * changes when the index advances past 0 (i.e. past the initial snapshot).
   */
  record(snapshot: T): void {
    const clone = structuredClone(snapshot);
    if (this._idx < this._history.length - 1) {
      this._history = this._history.slice(0, this._idx + 1);
    }
    this._history.push(clone);
    this._idx = this._history.length - 1;
    if (this._idx > 0) this._unsavedChanges = true;
  }

  /**
   * Step back one position in history and return a deep clone of the snapshot
   * at that position.  Returns `null` when already at the start of history.
   */
  undo(): T | null {
    if (this._idx <= 0) return null;
    this._idx--;
    return this._cloneCurrent();
  }

  /**
   * Step forward one position in history and return a deep clone of the
   * snapshot at that position.  Returns `null` when already at the end.
   */
  redo(): T | null {
    if (this._idx >= this._history.length - 1) return null;
    this._idx++;
    return this._cloneCurrent();
  }

  /** Mark the current history position as the last-saved point. */
  markSaved(): void {
    this._unsavedChanges = false;
    this._savedIdx = this._idx;
  }

  /** Reset to an empty history. */
  clear(): void {
    this._history = [];
    this._idx = -1;
    this._savedIdx = 0;
    this._unsavedChanges = false;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _cloneCurrent(): T {
    this._unsavedChanges = this._idx !== this._savedIdx;
    return structuredClone(this._history[this._idx]);
  }

  // ── Test / debug accessors ──────────────────────────────────────────────────

  /** Read-only view of the history stack (for tests and debugging). */
  get snapshots(): readonly T[] { return this._history; }
  /** Current position in the history stack (for tests and debugging). */
  get currentIndex(): number { return this._idx; }
  /** Index of the last-saved position (for tests and debugging). */
  get savedIndex(): number { return this._savedIdx; }
}
