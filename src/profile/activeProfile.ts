/**
 * Active player-profile slot tracking.
 *
 * A single module-level integer (`_activeSlotIndex`) determines which profile
 * slot is currently "active".  All per-player localStorage keys in
 * `persistence.ts` are prefixed with the return value of
 * `getActiveSlotPrefix()` so that each profile occupies its own namespace.
 *
 * - No active slot (null) → prefix is `''` → legacy behaviour, all keys are
 *   unchanged from their historical names.
 * - Active slot n → prefix is `'p<n>_'` (e.g. `'p0_'`) → keys are namespaced
 *   like `pipes_p0_player_name`.
 *
 * Callers should set the slot index exactly once at startup (after migration),
 * and again whenever the player switches profiles.
 */

let _activeSlotIndex: number | null = null;

/** Return the 0-based index of the currently active profile slot, or null. */
export function getActiveSlotIndex(): number | null {
  return _activeSlotIndex;
}

/**
 * Set the active profile slot index.  Pass `null` to revert to the
 * un-namespaced (legacy) key scheme – used while no slot is selected.
 */
export function setActiveSlotIndex(n: number | null): void {
  _activeSlotIndex = n;
}

/**
 * Return the localStorage key-name segment for the currently active slot.
 *
 * Inserted between `pipes_` and the rest of the key name so that
 * per-player keys are isolated per profile:
 *   - No slot active  → `''`      → `pipes_player_name`
 *   - Slot 0 active   → `'p0_'`   → `pipes_p0_player_name`
 *   - Slot 1 active   → `'p1_'`   → `pipes_p1_player_name`
 */
export function getActiveSlotPrefix(): string {
  return _activeSlotIndex !== null ? `p${_activeSlotIndex}_` : '';
}

/**
 * Temporarily activate a specific slot (or no slot when `n` is `null`) for
 * the duration of a synchronous callback, then restore the previous slot.
 *
 * Useful for reading another slot's data on the Player Profile screen without
 * permanently changing which slot is active.
 *
 * **Important**: only safe for synchronous code.  Do not `await` inside `fn`.
 */
export function withSlot<T>(n: number | null, fn: () => T): T {
  const prev = _activeSlotIndex;
  _activeSlotIndex = n;
  try {
    return fn();
  } finally {
    _activeSlotIndex = prev;
  }
}
