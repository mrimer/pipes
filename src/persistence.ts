/** Helpers for persisting long-term player progress in localStorage. */

import { CampaignDef } from './types';

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

/** Mark every level in allLevelIds as completed and persist the full set. */
export function markAllLevelsCompleted(completedLevels: Set<number>, allLevelIds: number[]): void {
  for (const id of allLevelIds) {
    completedLevels.add(id);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completedLevels]));
  } catch {
    // ignore storage errors
  }
}

// ─── Campaign persistence ────────────────────────────────────────────────────

const CAMPAIGNS_STORAGE_KEY = 'pipes_campaigns';

/**
 * Migrate a campaign loaded from storage or an imported file, applying any
 * backwards-compatibility fixes needed after renames in the data model.
 *
 * Currently handles:
 *   - chamberContent 'weak_ice' → 'snow'  (renamed in the v2026-03 refactor)
 *   - level.hint → level.hints            (deprecated single-string field folded into array)
 */
export function migrateCampaign(campaign: CampaignDef): CampaignDef {
  for (const chapter of campaign.chapters) {
    for (const level of chapter.levels) {
      // Migrate deprecated single-string `hint` to the `hints` array.
      const levelRec = level as unknown as Record<string, unknown>;
      if (typeof levelRec['hint'] === 'string') {
        const hintStr = levelRec['hint'] as string;
        if (!level.hints?.length && hintStr.trim()) {
          level.hints = [hintStr];
        }
        delete levelRec['hint'];
      }
      for (const row of level.grid) {
        for (let i = 0; i < row.length; i++) {
          const tile = row[i];
          if (tile && (tile.chamberContent as unknown as string) === 'weak_ice') {
            (tile.chamberContent as unknown as string) = 'snow';
          }
        }
      }
    }
  }
  return campaign;
}

/** Load user-created and imported campaigns from localStorage. */
export function loadImportedCampaigns(): CampaignDef[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    if (raw) {
      const campaigns = JSON.parse(raw) as CampaignDef[];
      return campaigns.map(migrateCampaign);
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/** Save the full list of user campaigns to localStorage. */
export function saveImportedCampaigns(campaigns: CampaignDef[]): void {
  try {
    localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
  } catch {
    // ignore storage errors
  }
}

// ─── Per-campaign progress ────────────────────────────────────────────────────

function campaignProgressKey(campaignId: string): string {
  return `pipes_campaign_progress_${campaignId}`;
}

/** Load the set of completed level IDs for a specific campaign. */
export function loadCampaignProgress(campaignId: string): Set<number> {
  try {
    const raw = localStorage.getItem(campaignProgressKey(campaignId));
    if (raw) {
      const ids = JSON.parse(raw) as number[];
      return new Set(ids);
    }
  } catch {
    // ignore parse errors
  }
  return new Set<number>();
}

/** Mark a level as completed in a campaign and persist the progress. */
export function markCampaignLevelCompleted(campaignId: string, levelId: number, progress: Set<number>): void {
  progress.add(levelId);
  try {
    localStorage.setItem(campaignProgressKey(campaignId), JSON.stringify([...progress]));
  } catch {
    // ignore storage errors
  }
}

/** Clear all completion progress for a specific campaign. */
export function clearCampaignProgress(campaignId: string, progress: Set<number>): void {
  progress.clear();
  try {
    localStorage.removeItem(campaignProgressKey(campaignId));
  } catch {
    // ignore storage errors
  }
}

/**
 * Compute the completion percentage (0–100) for a campaign.
 * Returns 0 if the campaign has no levels.
 */
export function computeCampaignCompletionPct(campaign: import('./types').CampaignDef, progress: Set<number>): number {
  const total = campaign.chapters.reduce((n, ch) => n + ch.levels.length, 0);
  if (total === 0) return 0;
  const done = campaign.chapters.reduce(
    (n, ch) => n + ch.levels.filter((l) => progress.has(l.id)).length,
    0,
  );
  return Math.round((done / total) * 100);
}

// ─── Active campaign ──────────────────────────────────────────────────────────

const ACTIVE_CAMPAIGN_KEY = 'pipes_active_campaign';

/** Load the ID of the campaign currently activated for play, or null for the official campaign. */
export function loadActiveCampaignId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
  } catch {
    return null;
  }
}

/** Persist the ID of the campaign to activate for play. */
export function saveActiveCampaignId(campaignId: string): void {
  try {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaignId);
  } catch {
    // ignore storage errors
  }
}

/** Clear the active campaign (reverts to playing the official campaign). */
export function clearActiveCampaignId(): void {
  try {
    localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
  } catch {
    // ignore storage errors
  }
}

// ─── Per-level record store factory ──────────────────────────────────────────

/**
 * Factory for per-level score record stores backed by localStorage.
 * Creates load / save / clear / clearRecord helpers for a given key scheme.
 *
 * @param keyFn        - Maps an optional campaign ID to a localStorage key.
 * @param shouldUpdate - Optional predicate controlling when a new value replaces
 *                       the stored one.  Receives `(newVal, existingVal)` where
 *                       `existingVal` defaults to `-Infinity` when no record exists.
 *                       When omitted, every call to `save` unconditionally overwrites.
 */
function _makeLevelRecordStore(
  keyFn: (campaignId?: string) => string,
  shouldUpdate?: (newVal: number, existing: number) => boolean,
): {
  load: (campaignId?: string) => Record<number, number>;
  save: (levelId: number, value: number, campaignId?: string) => void;
  clear: (campaignId?: string) => void;
  clearRecord: (levelId: number, campaignId?: string) => void;
} {
  function load(campaignId?: string): Record<number, number> {
    try {
      const raw = localStorage.getItem(keyFn(campaignId));
      if (raw) return JSON.parse(raw) as Record<number, number>;
    } catch { /* ignore parse errors */ }
    return {};
  }

  function save(levelId: number, value: number, campaignId?: string): void {
    try {
      const record = load(campaignId);
      if (!shouldUpdate || shouldUpdate(value, record[levelId] ?? -Infinity)) {
        record[levelId] = value;
        localStorage.setItem(keyFn(campaignId), JSON.stringify(record));
      }
    } catch { /* ignore storage errors */ }
  }

  function clear(campaignId?: string): void {
    try {
      localStorage.removeItem(keyFn(campaignId));
    } catch { /* ignore storage errors */ }
  }

  function clearRecord(levelId: number, campaignId?: string): void {
    try {
      const record = load(campaignId);
      if (!(levelId in record)) return;
      delete record[levelId];
      localStorage.setItem(keyFn(campaignId), JSON.stringify(record));
    } catch { /* ignore storage errors */ }
  }

  return { load, save, clear, clearRecord };
}

// ─── Star progress ────────────────────────────────────────────────────────────

const _starsStore = _makeLevelRecordStore(
  (campaignId?) => campaignId ? `pipes_campaign_stars_${campaignId}` : 'pipes_level_stars',
);

/** Load the map of level IDs → stars collected from localStorage. */
export function loadLevelStars(campaignId?: string): Record<number, number> {
  return _starsStore.load(campaignId);
}

/** Save the star count collected for a specific level to localStorage. */
export function saveLevelStar(levelId: number, count: number, campaignId?: string): void {
  _starsStore.save(levelId, count, campaignId);
}

/** Clear all star progress (for a campaign or the official campaign). */
export function clearLevelStars(campaignId?: string): void {
  _starsStore.clear(campaignId);
}

/** Clear the star record for a single level (for a campaign or the official campaign). */
export function clearLevelStarRecord(levelId: number, campaignId?: string): void {
  _starsStore.clearRecord(levelId, campaignId);
}

// ─── Water-remaining progress ──────────────────────────────────────────────────

const _waterStore = _makeLevelRecordStore(
  (campaignId?) => campaignId ? `pipes_campaign_water_${campaignId}` : 'pipes_level_water',
  (newVal, existing) => newVal > existing,
);

/** Load the map of level IDs → max water remaining from localStorage. */
export function loadLevelWater(campaignId?: string): Record<number, number> {
  return _waterStore.load(campaignId);
}

/**
 * Save the water remaining for a level to localStorage.
 * Only updates the stored value when `water` exceeds the previously recorded maximum.
 */
export function saveLevelWater(levelId: number, water: number, campaignId?: string): void {
  _waterStore.save(levelId, water, campaignId);
}

/** Clear all water-remaining progress (for a campaign or the official campaign). */
export function clearLevelWater(campaignId?: string): void {
  _waterStore.clear(campaignId);
}

/** Clear the water record for a single level (for a campaign or the official campaign). */
export function clearLevelWaterRecord(levelId: number, campaignId?: string): void {
  _waterStore.clearRecord(levelId, campaignId);
}

// ─── Chapter completion tracking ─────────────────────────────────────────────

function campaignChaptersKey(campaignId: string): string {
  return `pipes_campaign_chapters_${campaignId}`;
}

/** Load the set of completed chapter IDs (using chapter.id) for a campaign. */
export function loadCompletedChapters(campaignId: string): Set<number> {
  try {
    const raw = localStorage.getItem(campaignChaptersKey(campaignId));
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore */ }
  return new Set<number>();
}

/** Mark a chapter as completed in a campaign and persist. */
export function markChapterCompleted(campaignId: string, chapterId: number, completedChapters: Set<number>): void {
  completedChapters.add(chapterId);
  try {
    localStorage.setItem(campaignChaptersKey(campaignId), JSON.stringify([...completedChapters]));
  } catch { /* ignore */ }
}

/** Clear all chapter completion data for a campaign. */
export function clearCompletedChapters(campaignId: string, completedChapters: Set<number>): void {
  completedChapters.clear();
  try {
    localStorage.removeItem(campaignChaptersKey(campaignId));
  } catch { /* ignore */ }
}

// ─── Chapter mastery sequence tracking ───────────────────────────────────────

function campaignMasteredShownKey(campaignId: string): string {
  return `pipes_campaign_mastered_shown_${campaignId}`;
}

/**
 * Load the set of chapter IDs for which the mastery sequence (sfx + confetti
 * + modal) has already been shown.
 */
export function loadMasteredChaptersShown(campaignId: string): Set<number> {
  try {
    const raw = localStorage.getItem(campaignMasteredShownKey(campaignId));
    if (raw) return new Set(JSON.parse(raw) as number[]);
  } catch { /* ignore */ }
  return new Set<number>();
}

/** Record that the mastery sequence has been shown for a given chapter. */
export function markMasteredChapterShown(campaignId: string, chapterId: number, shownSet: Set<number>): void {
  shownSet.add(chapterId);
  try {
    localStorage.setItem(campaignMasteredShownKey(campaignId), JSON.stringify([...shownSet]));
  } catch { /* ignore */ }
}

/** Clear all mastery-sequence-shown records for a campaign. */
export function clearMasteredChaptersShown(campaignId: string, shownSet: Set<number>): void {
  shownSet.clear();
  try {
    localStorage.removeItem(campaignMasteredShownKey(campaignId));
  } catch { /* ignore */ }
}

// ─── Settings persistence ─────────────────────────────────────────────────────

const SFX_VOLUME_KEY = 'pipes_sfx_volume';

/**
 * Load the persisted SFX volume setting.
 * @returns An integer in [0, 100]; defaults to 100 when not yet set.
 */
export function loadSfxVolume(): number {
  try {
    const raw = localStorage.getItem(SFX_VOLUME_KEY);
    if (raw !== null) {
      const v = Number(raw);
      if (!isNaN(v) && v >= 0 && v <= 100) return Math.round(v);
    }
  } catch { /* ignore */ }
  return 100;
}

/** Persist the SFX volume setting. @param volume - Integer in [0, 100]. */
export function saveSfxVolume(volume: number): void {
  try {
    localStorage.setItem(SFX_VOLUME_KEY, String(Math.round(Math.max(0, Math.min(100, volume)))));
  } catch { /* ignore */ }
}
