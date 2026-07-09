/**
 * Player profile slot storage and migration helpers.
 *
 * Each profile slot is identified by a zero-based index (0–3).  The "active"
 * slot is persisted separately under `pipes_active_slot` so the app can
 * auto-resume the last-selected profile without showing the profile screen
 * again on every launch.
 *
 * Key scheme:
 *   - `pipes_profile_slot_<n>` → JSON `ProfileSlotMeta` (or absent = empty)
 *   - `pipes_active_slot`      → stringified slot index, or absent = no active slot
 *
 * All other player-specific data (settings, campaign progress, etc.) lives in
 * per-slot namespaced keys managed by `persistence.ts` (via `activeProfile.ts`).
 */

import { withSlot } from './activeProfile';
import {
  loadPlayerName,
  loadActiveCampaignId,
  loadCampaignProgress,
  loadCompletedChapters,
  loadLevelStars,
  loadLevelWater,
} from './persistence';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of profile slots available. */
export const PROFILE_SLOT_COUNT = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Lightweight metadata stored per slot.  Contains only the information needed
 * to render the profile card on the Player Profile screen without activating
 * the full slot namespace.
 */
export interface ProfileSlotMeta {
  /** Save-data schema version for slot metadata. Missing implies legacy version 1. */
  formatVersion?: number;
  /** UUID v4 that uniquely identifies this profile across devices. */
  guid: string;
  /** Display name for this profile (same as `pipes_p<n>_player_name`). */
  name: string;
  /**
   * ISO 8601 timestamp of the last time this profile was used, or `null` for
   * a freshly created profile that has never been played.
   */
  lastPlayedAt: string | null;
}

// ─── localStorage key helpers ─────────────────────────────────────────────────

const ACTIVE_SLOT_KEY = 'pipes_active_slot';
const PROFILE_SLOT_META_FORMAT_VERSION = 1;

function slotMetaKey(n: number): string {
  return `pipes_profile_slot_${n}`;
}

function normalizeSlotMeta(raw: unknown): ProfileSlotMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.guid !== 'string') return null;
  if (typeof candidate.name !== 'string') return null;
  if (!(candidate.lastPlayedAt === null || typeof candidate.lastPlayedAt === 'string')) return null;
  return {
    guid: candidate.guid,
    name: candidate.name,
    lastPlayedAt: candidate.lastPlayedAt,
    formatVersion: typeof candidate.formatVersion === 'number'
      ? candidate.formatVersion
      : PROFILE_SLOT_META_FORMAT_VERSION,
  };
}

// ─── Slot metadata CRUD ───────────────────────────────────────────────────────

/** Load the metadata for slot `n`, or `null` if the slot is empty. */
export function loadSlotMeta(n: number): ProfileSlotMeta | null {
  try {
    const raw = localStorage.getItem(slotMetaKey(n));
    if (raw) return normalizeSlotMeta(JSON.parse(raw));
  } catch { /* ignore parse errors */ }
  return null;
}

/** Persist metadata for slot `n`. */
export function saveSlotMeta(n: number, meta: ProfileSlotMeta): void {
  try {
    localStorage.setItem(
      slotMetaKey(n),
      JSON.stringify({
        ...meta,
        formatVersion: meta.formatVersion ?? PROFILE_SLOT_META_FORMAT_VERSION,
      }),
    );
  } catch { /* ignore storage errors */ }
}

/** Delete the metadata for slot `n` (marks the slot as empty). */
export function deleteSlotMeta(n: number): void {
  try {
    localStorage.removeItem(slotMetaKey(n));
  } catch { /* ignore storage errors */ }
}

/** Load metadata for all slots.  Returns an array of length {@link PROFILE_SLOT_COUNT}. */
export function loadAllSlotMetas(): Array<ProfileSlotMeta | null> {
  return Array.from({ length: PROFILE_SLOT_COUNT }, (_, i) => loadSlotMeta(i));
}

// ─── Active slot tracking ─────────────────────────────────────────────────────

/** Load the index of the last-selected slot, or `null`. */
export function loadActiveSlotIndex(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SLOT_KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 0 && n < PROFILE_SLOT_COUNT) return n;
    }
  } catch { /* ignore */ }
  return null;
}

/** Persist the active slot index. */
export function saveActiveSlotIndex(n: number): void {
  try {
    localStorage.setItem(ACTIVE_SLOT_KEY, String(n));
  } catch { /* ignore storage errors */ }
}

/** Clear the active slot (no slot will be auto-selected on the next launch). */
export function clearActiveSlotIndex(): void {
  try {
    localStorage.removeItem(ACTIVE_SLOT_KEY);
  } catch { /* ignore storage errors */ }
}

// ─── Slot utilities ───────────────────────────────────────────────────────────

/** Return the index of the first empty slot, or `null` if all are occupied. */
export function findEmptySlotIndex(): number | null {
  for (let i = 0; i < PROFILE_SLOT_COUNT; i++) {
    if (!loadSlotMeta(i)) return i;
  }
  return null;
}

// ─── GUID generation ──────────────────────────────────────────────────────────

/**
 * Generate a UUID v4 string.
 *
 * Uses `crypto.randomUUID()` when available (all modern browsers and Node
 * ≥ 14.17).  Falls back to a `Math.random`-based implementation that is
 * sufficient for profile identity (not cryptographic security).
 */
export function generateGuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Profile stats snapshot (for card rendering) ─────────────────────────────

/** Aggregate progress stats read from a slot's namespaced keys. */
export interface ProfileSlotStats {
  activeCampaignId: string | null;
  levelsCompleted: number;
  chaptersCompleted: number;
  starsCollected: number;
  waterTotal: number;
}

/**
 * Read campaign-progress stats for slot `n` without permanently changing the
 * active slot.  Returns zeroed stats when the slot is empty or has no active
 * campaign.
 */
export function loadSlotStats(n: number): ProfileSlotStats {
  return withSlot(n, (): ProfileSlotStats => {
    const campaignId = loadActiveCampaignId();
    if (!campaignId) {
      return { activeCampaignId: null, levelsCompleted: 0, chaptersCompleted: 0, starsCollected: 0, waterTotal: 0 };
    }
    const progress = loadCampaignProgress(campaignId);
    const chapters = loadCompletedChapters(campaignId);
    const stars    = loadLevelStars(campaignId);
    const water    = loadLevelWater(campaignId);
    const starsCollected = Object.values(stars).reduce((s, v) => s + v, 0);
    const waterTotal     = Object.values(water).reduce((s, v) => s + v, 0);
    return {
      activeCampaignId:  campaignId,
      levelsCompleted:   progress.size,
      chaptersCompleted: chapters.size,
      starsCollected,
      waterTotal,
    };
  });
}

// ─── Migration ────────────────────────────────────────────────────────────────

/**
 * Legacy per-player key prefixes used by the old (un-namespaced) storage
 * scheme.  When migration runs, matching keys are copied into the slot-0
 * namespace (`pipes_p0_*`) and then deleted.
 */
const LEGACY_EXACT_KEYS: readonly string[] = [
  'pipes_player_name',
  'pipes_sfx_volume',
  'pipes_touch_ui_enabled',
  'pipes_command_keys',
  'pipes_active_campaign',
  'pipes_recording_settings',
  'pipes_level_stars',
  'pipes_level_water',
];

const LEGACY_KEY_PREFIXES: readonly string[] = [
  'pipes_campaign_progress_',
  'pipes_campaign_stars_',
  'pipes_campaign_water_',
  'pipes_campaign_chapters_',
  'pipes_campaign_mastered_shown_',
  'pipes_campaign_mastered_campaign_',
  'pipes_campaign_complete_shown_',
];

/**
 * Check for legacy (pre-profile-slot) player data and, if found, migrate it
 * transparently into slot 0.
 *
 * Migration is skipped when:
 * - Any slot already has metadata (the app is already running in slot mode), OR
 * - No legacy player data is present (fresh install with no prior data).
 *
 * On success the legacy top-level settings keys are removed and slot 0
 * becomes the sole copy of the player's data.
 *
 * @returns `true` if migration was performed, `false` otherwise.
 */
export function migrateIfNeeded(): boolean {
  // Skip if any slot already exists (already migrated or profiles were created).
  for (let i = 0; i < PROFILE_SLOT_COUNT; i++) {
    if (loadSlotMeta(i)) return false;
  }

  // Check for any legacy player data to migrate.
  const allStorageKeys = Object.keys(localStorage);
  const hasLegacyData =
    LEGACY_EXACT_KEYS.some((k) => localStorage.getItem(k) !== null) ||
    allStorageKeys.some((k) => LEGACY_KEY_PREFIXES.some((prefix) => k.startsWith(prefix)));

  if (!hasLegacyData) return false;

  // Collect all legacy keys that exist in localStorage.
  const keysToMigrate = allStorageKeys.filter((k) => {
    if (LEGACY_EXACT_KEYS.includes(k)) return true;
    return LEGACY_KEY_PREFIXES.some((prefix) => k.startsWith(prefix));
  });

  // Copy each legacy key to the slot-0 namespace.
  // Legacy key format: `pipes_<rest>`  →  slot-0 key: `pipes_p0_<rest>`
  for (const key of keysToMigrate) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      const newKey = key.replace(/^pipes_/, 'pipes_p0_');
      try { localStorage.setItem(newKey, value); } catch { /* ignore */ }
    }
  }

  // Create slot-0 metadata using the player name from the legacy key.
  const legacyName = withSlot(0, loadPlayerName);
  const meta: ProfileSlotMeta = {
    guid:         generateGuid(),
    name:         legacyName,
    lastPlayedAt: null,
  };
  saveSlotMeta(0, meta);

  // Remove the legacy keys.
  for (const key of keysToMigrate) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  return true;
}
