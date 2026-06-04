/** Helpers for persisting long-term player progress in localStorage. */

import type { CampaignDef, PlaySequenceRecord, RecordingSettings } from './types';
import { getActiveSlotPrefix } from './activeProfile';

/**
 * Convenience shorthand: returns the active-slot prefix string.
 * Avoids repeating `getActiveSlotPrefix()` inline in every key function.
 */
const p = (): string => getActiveSlotPrefix();

// ─── Campaign persistence ────────────────────────────────────────────────────

const CAMPAIGNS_STORAGE_KEY = 'pipes_campaigns';

/**
 * Migrate a campaign loaded from storage or an imported file, applying any
 * backwards-compatibility fixes needed after renames in the data model.
 *
 * Currently handles:
 *   - chamberContent 'weak_ice' → 'snow'  (renamed in the v2026-03 refactor)
 *   - level.hint → level.hints            (deprecated single-string field folded into array)
 *   - tile shape 'EMPTY_DIRT' → 'EMPTY_FALL'  (renamed in the v2026-04 refactor)
 *   - style 'Dirt' → 'Fall'               (renamed in the v2026-04 refactor)
 */
export function migrateCampaign(campaign: CampaignDef): CampaignDef {
  // Migrate campaign-level style
  const campaignRec = campaign as unknown as Record<string, unknown>;
  if (campaignRec['style'] === 'Dirt') campaignRec['style'] = 'Fall';

  for (const chapter of campaign.chapters) {
    // Migrate chapter-level style
    const chapterRec = chapter as unknown as Record<string, unknown>;
    if (chapterRec['style'] === 'Dirt') chapterRec['style'] = 'Fall';

    // Migrate chapter map grid tile shapes
    if (chapter.grid) {
      for (const row of chapter.grid) {
        for (const tile of row) {
          if (tile && (tile as unknown as Record<string, unknown>)['shape'] === 'EMPTY_DIRT') {
            (tile as unknown as Record<string, unknown>)['shape'] = 'EMPTY_FALL';
          }
        }
      }
    }

    for (const level of chapter.levels) {
      // Migrate level-level style
      const levelRec = level as unknown as Record<string, unknown>;
      if (levelRec['style'] === 'Dirt') levelRec['style'] = 'Fall';

      // Migrate deprecated single-string `hint` to the `hints` array.
      if (typeof levelRec['hint'] === 'string') {
        const hintStr = levelRec['hint'];
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
          if (tile && (tile as unknown as Record<string, unknown>)['shape'] === 'EMPTY_DIRT') {
            (tile as unknown as Record<string, unknown>)['shape'] = 'EMPTY_FALL';
          }
        }
      }
    }
  }

  // Migrate campaign map grid tile shapes
  if (campaign.grid) {
    for (const row of campaign.grid) {
      for (const tile of row) {
        if (tile && (tile as unknown as Record<string, unknown>)['shape'] === 'EMPTY_DIRT') {
          (tile as unknown as Record<string, unknown>)['shape'] = 'EMPTY_FALL';
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
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const campaigns: CampaignDef[] = [];
      for (const entry of parsed) {
        if (
          entry
          && typeof entry === 'object'
          && typeof (entry as Record<string, unknown>)['id'] === 'string'
          && typeof (entry as Record<string, unknown>)['name'] === 'string'
          && Array.isArray((entry as Record<string, unknown>)['chapters'])
        ) {
          campaigns.push(migrateCampaign(entry as CampaignDef));
        } else {
          console.warn('Dropping invalid imported campaign entry from storage.');
        }
      }
      return campaigns;
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
  return `pipes_${p()}campaign_progress_${campaignId}`;
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

const ACTIVE_CAMPAIGN_KEY = () => `pipes_${p()}active_campaign`;

/** Load the ID of the campaign currently activated for play, or null for the official campaign. */
export function loadActiveCampaignId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY());
  } catch {
    return null;
  }
}

/** Persist the ID of the campaign to activate for play. */
export function saveActiveCampaignId(campaignId: string): void {
  try {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY(), campaignId);
  } catch {
    // ignore storage errors
  }
}

/** Clear the active campaign (reverts to playing the official campaign). */
export function clearActiveCampaignId(): void {
  try {
    localStorage.removeItem(ACTIVE_CAMPAIGN_KEY());
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
  (campaignId?) => campaignId ? `pipes_${p()}campaign_stars_${campaignId}` : `pipes_${p()}level_stars`,
  (newVal, existing) => newVal > existing,
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
  (campaignId?) => campaignId ? `pipes_${p()}campaign_water_${campaignId}` : `pipes_${p()}level_water`,
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
  return `pipes_${p()}campaign_chapters_${campaignId}`;
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

/** Remove a single chapter from the completed-chapters set and persist. */
export function removeChapterCompleted(campaignId: string, chapterId: number, completedChapters: Set<number>): void {
  if (!completedChapters.has(chapterId)) return;
  completedChapters.delete(chapterId);
  try {
    localStorage.setItem(campaignChaptersKey(campaignId), JSON.stringify([...completedChapters]));
  } catch { /* ignore */ }
}

// ─── Chapter mastery sequence tracking ───────────────────────────────────────

function campaignMasteredShownKey(campaignId: string): string {
  return `pipes_${p()}campaign_mastered_shown_${campaignId}`;
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

/** Remove a single chapter from the mastery-sequence-shown set and persist. */
export function removeMasteredChapterShown(campaignId: string, chapterId: number, shownSet: Set<number>): void {
  if (!shownSet.has(chapterId)) return;
  shownSet.delete(chapterId);
  try {
    localStorage.setItem(campaignMasteredShownKey(campaignId), JSON.stringify([...shownSet]));
  } catch { /* ignore */ }
}

// ─── Campaign mastery shown flag ──────────────────────────────────────────────

function campaignMasteredCampaignKey(campaignId: string): string {
  return `pipes_${p()}campaign_mastered_campaign_${campaignId}`;
}

/**
 * Returns true if the full-campaign mastery sequence (confetti + modal) has
 * already been shown for this campaign.
 */
export function loadCampaignMasteredShown(campaignId: string): boolean {
  try {
    return localStorage.getItem(campaignMasteredCampaignKey(campaignId)) === '1';
  } catch { return false; }
}

/** Record that the campaign mastery sequence has been shown. */
export function markCampaignMasteredShown(campaignId: string): void {
  try {
    localStorage.setItem(campaignMasteredCampaignKey(campaignId), '1');
  } catch { /* ignore storage errors */ }
}

/** Clear the campaign mastery shown flag (e.g. on progress reset). */
export function clearCampaignMasteredShown(campaignId: string): void {
  try {
    localStorage.removeItem(campaignMasteredCampaignKey(campaignId));
  } catch { /* ignore storage errors */ }
}

// ─── Campaign complete shown flag ─────────────────────────────────────────────

function campaignCompleteShownKey(campaignId: string): string {
  return `pipes_${p()}campaign_complete_shown_${campaignId}`;
}

/** Returns true if the full-campaign complete modal has already been shown. */
export function loadCampaignCompleteShown(campaignId: string): boolean {
  try {
    return localStorage.getItem(campaignCompleteShownKey(campaignId)) === '1';
  } catch { return false; }
}

/** Record that the full-campaign complete modal has been shown. */
export function markCampaignCompleteShown(campaignId: string): void {
  try {
    localStorage.setItem(campaignCompleteShownKey(campaignId), '1');
  } catch { /* ignore storage errors */ }
}

/** Clear the campaign complete shown flag (e.g. on progress reset). */
export function clearCampaignCompleteShown(campaignId: string): void {
  try {
    localStorage.removeItem(campaignCompleteShownKey(campaignId));
  } catch { /* ignore storage errors */ }
}

// ─── Settings persistence ─────────────────────────────────────────────────────

const SFX_VOLUME_KEY      = (): string => `pipes_${p()}sfx_volume`;
const COMMAND_KEYS_KEY     = (): string => `pipes_${p()}command_keys`;
const TOUCH_UI_ENABLED_KEY = (): string => `pipes_${p()}touch_ui_enabled`;
const PLAYER_NAME_KEY      = (): string => `pipes_${p()}player_name`;
const DEFAULT_PLAYER_NAME = 'Player';

/**
 * Load the persisted SFX volume setting.
 * @returns An integer in [0, 100]; defaults to 100 when not yet set.
 */
export function loadSfxVolume(): number {
  try {
    const raw = localStorage.getItem(SFX_VOLUME_KEY());
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
    localStorage.setItem(SFX_VOLUME_KEY(), String(Math.round(Math.max(0, Math.min(100, volume)))));
  } catch { /* ignore */ }
}

/**
 * Load the persisted Touch UI setting.
 * @returns
 * - true/false when the user has explicitly chosen a value
 * - null when no explicit choice has been saved yet
 */
export function loadTouchUiEnabled(): boolean | null {
  try {
    const raw = localStorage.getItem(TOUCH_UI_ENABLED_KEY());
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch { /* ignore */ }
  return null;
}

/** Persist the Touch UI setting. */
export function saveTouchUiEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(TOUCH_UI_ENABLED_KEY(), enabled ? '1' : '0');
  } catch { /* ignore */ }
}

/** Load the persisted player name setting. */
export function loadPlayerName(): string {
  try {
    const raw = localStorage.getItem(PLAYER_NAME_KEY());
    if (raw !== null) {
      const trimmed = raw.trim();
      if (trimmed.length > 0) return trimmed;
    }
  } catch { /* ignore */ }
  return DEFAULT_PLAYER_NAME;
}

/** Persist the player name setting. Blank values are normalized to the default name. */
export function savePlayerName(name: string): void {
  try {
    const normalized = name.trim() || DEFAULT_PLAYER_NAME;
    localStorage.setItem(PLAYER_NAME_KEY(), normalized);
  } catch { /* ignore */ }
}

/** Load persisted command key assignments (action -> binding string), or null when unset/invalid. */
export function loadCommandKeyAssignments(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(COMMAND_KEYS_KEY());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Persist command key assignments (action -> binding string). */
export function saveCommandKeyAssignments(bindings: Record<string, string>): void {
  try {
    localStorage.setItem(COMMAND_KEYS_KEY(), JSON.stringify(bindings));
  } catch {
    // ignore storage errors
  }
}

/** Clear persisted custom command key assignments. */
export function clearCommandKeyAssignments(): void {
  try {
    localStorage.removeItem(COMMAND_KEYS_KEY());
  } catch {
    // ignore storage errors
  }
}

// ─── Campaign / chapter editor map box state ─────────────────────────────────

const CAMPAIGN_EDITOR_MAP_BOX_COLLAPSED_KEY = 'pipes_campaign_editor_map_box_collapsed';
const CHAPTER_EDITOR_MAP_BOX_COLLAPSED_KEY  = 'pipes_chapter_editor_map_box_collapsed';

/** Load the persisted collapsed state of the campaign Map box in the campaign editor. */
export function loadCampaignEditorMapBoxCollapsed(): boolean {
  try {
    return localStorage.getItem(CAMPAIGN_EDITOR_MAP_BOX_COLLAPSED_KEY) === '1';
  } catch { return false; }
}

/** Persist the collapsed state of the campaign Map box in the campaign editor. */
export function saveCampaignEditorMapBoxCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(CAMPAIGN_EDITOR_MAP_BOX_COLLAPSED_KEY, '1');
    } else {
      localStorage.removeItem(CAMPAIGN_EDITOR_MAP_BOX_COLLAPSED_KEY);
    }
  } catch { /* ignore */ }
}

/** Load the persisted collapsed state of the chapter Map box in the campaign editor. */
export function loadChapterEditorMapBoxCollapsed(): boolean {
  try {
    return localStorage.getItem(CHAPTER_EDITOR_MAP_BOX_COLLAPSED_KEY) === '1';
  } catch { return false; }
}

/** Persist the collapsed state of the chapter Map box in the campaign editor. */
export function saveChapterEditorMapBoxCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      localStorage.setItem(CHAPTER_EDITOR_MAP_BOX_COLLAPSED_KEY, '1');
    } else {
      localStorage.removeItem(CHAPTER_EDITOR_MAP_BOX_COLLAPSED_KEY);
    }
  } catch { /* ignore */ }
}

// ─── Recording storage ────────────────────────────────────────────────────────

const RECORDINGS_KEY = 'pipes_recordings';
const RECORDING_SETTINGS_KEY = (): string => `pipes_${p()}recording_settings`;
const SUPPORTED_RECORDING_FORMAT_VERSION = 1;

/** Load all saved {@link PlaySequenceRecord} entries from localStorage. */
export function loadAllRecordings(): PlaySequenceRecord[] {
  try {
    const raw = localStorage.getItem(RECORDINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry): PlaySequenceRecord[] => {
        const candidate = entry as Record<string, unknown>;
        const moves = candidate['moves'];
        if (
          !entry
          || typeof entry !== 'object'
          || typeof candidate['id'] !== 'string'
          || typeof candidate['campaignId'] !== 'string'
          || typeof candidate['levelId'] !== 'number'
          || !Array.isArray(moves)
          || !moves.every((move) => typeof move === 'string')
          || typeof candidate['outcome'] !== 'string'
          || !['success', 'failure', 'partial'].includes(candidate['outcome'])
          || typeof candidate['autoRecorded'] !== 'boolean'
          || typeof candidate['timestamp'] !== 'number'
          || typeof candidate['playerName'] !== 'string'
          || typeof candidate['corrupted'] !== 'boolean'
        ) {
          return [];
        }
        const formatVersion = typeof candidate['formatVersion'] === 'number' ? candidate['formatVersion'] : 1;
        if (formatVersion > SUPPORTED_RECORDING_FORMAT_VERSION) {
          console.warn(
            `Dropping recording "${candidate['id']}" with unsupported formatVersion ${formatVersion}.`,
          );
          return [];
        }
        return [{
          id: candidate['id'],
          campaignId: candidate['campaignId'],
          levelId: candidate['levelId'],
          moves: candidate['moves'] as string[],
          outcome: candidate['outcome'] as 'success' | 'failure' | 'partial',
          autoRecorded: candidate['autoRecorded'],
          timestamp: candidate['timestamp'],
          playerName: candidate['playerName'],
          corrupted: candidate['corrupted'],
          formatVersion,
          playerGuid: typeof candidate['playerGuid'] === 'string' ? candidate['playerGuid'] : undefined,
          waterScore: typeof candidate['waterScore'] === 'number' ? candidate['waterScore'] : undefined,
          stars: typeof candidate['stars'] === 'number' ? candidate['stars'] : undefined,
          annotation: typeof candidate['annotation'] === 'string' ? candidate['annotation'] : undefined,
        }];
      });
    }
  } catch { /* ignore parse errors */ }
  return [];
}

/**
 * Load only the recordings for a specific campaign + level combination.
 * Returns a new array (does not modify the stored list).
 */
export function loadRecordingsForLevel(campaignId: string, levelId: number): PlaySequenceRecord[] {
  return loadAllRecordings().filter(
    (r) => r.campaignId === campaignId && r.levelId === levelId,
  );
}

/**
 * Load all recordings that belong to a specific player profile.
 *
 * Matching strategy (in priority order):
 * 1. If the recording has a `playerGuid`, match on that field.
 * 2. Otherwise fall back to matching on `playerName`.
 *
 * @param guid  UUID v4 of the target player profile.
 * @param name  Display name of the target player (fallback for older recordings
 *              that pre-date the `playerGuid` field).
 */
export function loadRecordingsForProfile(guid: string, name: string): PlaySequenceRecord[] {
  return loadAllRecordings().filter(
    (r) => r.playerGuid ? r.playerGuid === guid : r.playerName === name,
  );
}

/** Persist a new or updated {@link PlaySequenceRecord}. Replaces an existing entry with the same `id`. */
export function saveRecording(record: PlaySequenceRecord): void {
  try {
    const all = loadAllRecordings();
    const recordToSave: PlaySequenceRecord = {
      ...record,
      formatVersion: record.formatVersion ?? 1,
    };
    const idx = all.findIndex((r) => r.id === record.id);
    if (idx >= 0) {
      all[idx] = recordToSave;
    } else {
      all.push(recordToSave);
    }
    localStorage.setItem(RECORDINGS_KEY, JSON.stringify(all));
  } catch { /* ignore storage errors */ }
}

/** Remove the recording with the given `id` from localStorage. No-op if not found. */
export function deleteRecording(id: string): void {
  try {
    const all = loadAllRecordings().filter((r) => r.id !== id);
    localStorage.setItem(RECORDINGS_KEY, JSON.stringify(all));
  } catch { /* ignore storage errors */ }
}

/**
 * Load recording settings.
 * Defaults: `recordSuccesses = true`, `recordFailures = false`.
 */
export function loadRecordingSettings(): RecordingSettings {
  try {
    const raw = localStorage.getItem(RECORDING_SETTINGS_KEY());
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RecordingSettings>;
      return {
        recordSuccesses: parsed.recordSuccesses ?? true,
        recordFailures: parsed.recordFailures ?? false,
      };
    }
  } catch { /* ignore parse errors */ }
  return { recordSuccesses: true, recordFailures: false };
}

/** Persist recording settings. */
export function saveRecordingSettings(settings: RecordingSettings): void {
  try {
    localStorage.setItem(RECORDING_SETTINGS_KEY(), JSON.stringify(settings));
  } catch { /* ignore storage errors */ }
}

// ─── Graphics settings ────────────────────────────────────────────────────────

const BACKGROUND_ENABLED_KEY    = (): string => `pipes_${p()}background_enabled`;
const ENVIRONMENTAL_ENABLED_KEY = (): string => `pipes_${p()}environmental_enabled`;

/**
 * Load the persisted Background setting.
 * @returns true when enabled (or not yet set), false when explicitly disabled.
 */
export function loadBackgroundEnabled(): boolean {
  try {
    if (localStorage.getItem(BACKGROUND_ENABLED_KEY()) === '0') return false;
  } catch { /* ignore */ }
  return true;
}

/** Persist the Background setting. */
export function saveBackgroundEnabled(enabled: boolean): void {
  try {
    if (!enabled) {
      localStorage.setItem(BACKGROUND_ENABLED_KEY(), '0');
    } else {
      localStorage.removeItem(BACKGROUND_ENABLED_KEY());
    }
  } catch { /* ignore */ }
}

/**
 * Load the persisted Environmental setting.
 * @returns true when enabled (or not yet set), false when explicitly disabled.
 */
export function loadEnvironmentalEnabled(): boolean {
  try {
    if (localStorage.getItem(ENVIRONMENTAL_ENABLED_KEY()) === '0') return false;
  } catch { /* ignore */ }
  return true;
}

/** Persist the Environmental setting. */
export function saveEnvironmentalEnabled(enabled: boolean): void {
  try {
    if (!enabled) {
      localStorage.setItem(ENVIRONMENTAL_ENABLED_KEY(), '0');
    } else {
      localStorage.removeItem(ENVIRONMENTAL_ENABLED_KEY());
    }
  } catch { /* ignore */ }
}
