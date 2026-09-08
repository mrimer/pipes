/**
 * Player-profile export/import: file-type constants, payload interfaces,
 * checksum helper, snapshot/restore, and merge utilities.
 *
 * This module is pure data-logic – it has no DOM dependencies and does not
 * perform any gzip compression/decompression or file-system I/O.
 * Those concerns are handled by the caller (game.ts).
 */

import {
  loadCampaignProgress,
  loadLevelStars,
  loadLevelWater,
  loadCompletedChapters,
  loadMasteredChaptersShown,
  loadCampaignMasteredShown,
  loadCampaignCompleteShown,
  loadSfxVolume,
  loadMusicVolume,
  loadTouchUiEnabled,
  loadPlayerName,
  loadCommandKeyAssignments,
  loadActiveCampaignId,
  saveActiveCampaignId,
  clearActiveCampaignId,
  markCampaignLevelCompleted,
  saveLevelStar,
  saveLevelWater,
  markChapterCompleted,
  markMasteredChapterShown,
  markCampaignMasteredShown,
  markCampaignCompleteShown,
  saveSfxVolume,
  saveMusicVolume,
  saveTouchUiEnabled,
  savePlayerName,
  saveCommandKeyAssignments,
  loadAllRecordings,
  saveRecording,
  loadBackgroundEnabled,
  saveBackgroundEnabled,
  loadEnvironmentalEnabled,
  saveEnvironmentalEnabled,
  loadMusicMuteOnFocusLoss,
  saveMusicMuteOnFocusLoss,
  loadPartialProgress,
  mergePartialProgress,
  loadSaveNoticeSuppressed,
  saveSaveNoticeSuppressed,
  loadGnomeAppearance,
  saveGnomeAppearance,
} from '../persistence';
import type { CampaignDef, PartialPlayProgress, PlaySequenceRecord } from '../types';
import { resolveLocalizedText } from '../campaignLocalization';
import type { GnomeAppearance } from './gnomeAppearance';
import { isValidGnomeAppearance, migrateGnomeAppearance } from './gnomeAppearance';

// ─── File type constants ──────────────────────────────────────────────────────

/** Semantic type identifier for player-profile files. */
export const FILE_TYPE_PLAYER   = 'pipes-player-profile';

/** Semantic type identifier for campaign files. */
export const FILE_TYPE_CAMPAIGN = 'pipes-campaign';

/** Semantic type identifier for campaign text-pack (translation-only) files. */
export const FILE_TYPE_CAMPAIGN_TEXT_PACK = 'pipes-campaign-text-pack';

/** Semantic type identifier for replay recording files. */
export const FILE_TYPE_REPLAY   = 'pipes-replay';

/** Current player-profile file format version. */
export const PROFILE_FORMAT_VERSION = 4;

// ─── Checksum ─────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic 32-bit FNV-1a hash of `data` and return it as a
 * zero-padded 8-character hex string.
 *
 * Used for lightweight data-integrity verification only – not cryptographic.
 */
export function computeChecksum(data: string): string {
  const FNV_OFFSET_BASIS = 0x811c9dc5;  // FNV-1a offset basis (32-bit)
  const FNV_PRIME        = 0x01000193;  // FNV-1a prime (32-bit)
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    // Unsigned 32-bit multiply: use >>> 0 to keep it in [0, 2^32).
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Player-profile interfaces ────────────────────────────────────────────────

/** Progress snapshot for a single campaign. */
export interface CampaignProgressBlock {
  campaignId: string;
  campaignName: string;
  completedLevels: number[];
  completedChapters: number[];
  masteredChaptersShown: number[];
  campaignMasteredShown: boolean;
  campaignCompleteShown: boolean;
  levelStars: Record<string, number>;
  levelWater: Record<string, number>;
}

/** The data section inside a player-profile file. */
export interface PlayerProfilePayload {
  /** UUID v4 uniquely identifying this player profile across devices. Added in v2. */
  guid: string;
  /** ISO 8601 timestamp of the last play session, or null. Added in v2. */
  lastPlayedAt: string | null;
  playerName: string;
  sfxVolume: number;
  /**
   * Music volume in [0, 100]. Optional for back-compat: older exports lack this
   * field and import as the default value of 50.
   */
  musicVolume?: number;
  touchUiEnabled: boolean | null;
  commandKeys: Record<string, string> | null;
  /**
   * ID of the active campaign at export time. Added in v3.
   * On import, the active campaign is set to this value when the campaign
   * exists locally; otherwise cleared to null.
   */
  activeCampaignId?: string | null;
  /**
   * Whether the scrolling pipe-pattern background is shown on menu screens.
   * Defaults to true when absent (older profiles).
   */
  backgroundEnabled?: boolean;
  /**
   * Whether environmental visuals (clouds, cloud shadows) are rendered.
   * Defaults to true when absent (older profiles).
   */
  environmentalEnabled?: boolean;
  /**
   * Whether music is muted when the app tab/window loses focus.
   * Defaults to true when absent (older profiles).
   */
  musicMuteOnFocusLoss?: boolean;
  campaignProgress: CampaignProgressBlock[];
  /**
   * Playback recordings belonging to this profile.
   * Present only in files exported via "Export + Recordings"; absent in
   * standard profile exports.  Optional so that v1/v2 files parse correctly.
   */
  recordings?: PlaySequenceRecord[];
  /**
   * In-progress level state snapshots for levels the player was mid-way through.
   * Optional for back-compat; absent in older profiles.
   */
  partialProgress?: PartialPlayProgress[];
  /**
   * Whether the save-progress notice modal has been permanently suppressed.
   * Optional for back-compat; defaults to false when absent.
   */
  saveNoticeSuppressed?: boolean;
  /**
   * The player's gnome avatar appearance. Added in v4.
   * Optional for back-compat; when absent on import, the local appearance is
   * left untouched rather than overwritten with a default.
   */
  appearance?: GnomeAppearance;
}

/** The complete serialized player-profile file. */
export interface PlayerProfileFile {
  type: typeof FILE_TYPE_PLAYER;
  version: number;
  payload: PlayerProfilePayload;
  checksum: string;
}

// ─── ID validation helpers ────────────────────────────────────────────────────

/** Returns the set of all level IDs defined across every chapter of a campaign. */
function validLevelIds(campaign: CampaignDef): Set<number> {
  const ids = new Set<number>();
  for (const chapter of campaign.chapters) {
    for (const level of chapter.levels) {
      ids.add(level.id);
    }
  }
  return ids;
}

/** Returns the set of all chapter IDs defined in a campaign. */
function validChapterIds(campaign: CampaignDef): Set<number> {
  return new Set(campaign.chapters.map((ch) => ch.id));
}

/** Filters an object's entries, keeping only keys (converted to numbers) present in `validIds`. */
function filterRecordByLevelIds(
  record: Record<string, number>,
  validIds: Set<number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    if (validIds.has(Number(key))) {
      result[key] = value;
    }
  }
  return result;
}

// ─── Snapshot (build) ─────────────────────────────────────────────────────────

/**
 * Build a {@link PlayerProfilePayload} from the current local-storage state.
 *
 * Only IDs present in the local campaign definition are included; stale or
 * dangling references (IDs no longer in the campaign) are omitted.
 *
 * @param localCampaigns - All locally installed campaigns; used to enumerate
 *   per-campaign progress keys.
 * @param guid - UUID v4 for this profile.  Callers should pass the GUID from
 *   the active slot's metadata.  A fresh GUID is generated when omitted.
 * @param lastPlayedAt - ISO 8601 timestamp or null.
 * @param recordings - Optional recordings to embed in the payload (used by
 *   "Export + Recordings").  When omitted the `recordings` field is absent
 *   from the returned payload.
 */
export function buildPlayerProfilePayload(
  localCampaigns: readonly CampaignDef[],
  guid?: string,
  lastPlayedAt?: string | null,
  recordings?: PlaySequenceRecord[],
): PlayerProfilePayload {
  const campaignProgress: CampaignProgressBlock[] = localCampaigns.map((c) => {
    const levelIds   = validLevelIds(c);
    const chapterIds = validChapterIds(c);
    return {
      campaignId:            c.id,
      campaignName:          resolveLocalizedText(c.name),
      completedLevels:       [...loadCampaignProgress(c.id)].filter((id) => levelIds.has(id)),
      completedChapters:     [...loadCompletedChapters(c.id)].filter((id) => chapterIds.has(id)),
      masteredChaptersShown: [...loadMasteredChaptersShown(c.id)].filter((id) => chapterIds.has(id)),
      campaignMasteredShown: loadCampaignMasteredShown(c.id),
      campaignCompleteShown: loadCampaignCompleteShown(c.id),
      levelStars:            filterRecordByLevelIds(loadLevelStars(c.id), levelIds),
      levelWater:            filterRecordByLevelIds(loadLevelWater(c.id), levelIds),
    };
  });

  const payload: PlayerProfilePayload = {
    guid:                guid ?? _generateFallbackGuid(),
    lastPlayedAt:        lastPlayedAt ?? null,
    playerName:          loadPlayerName(),
    sfxVolume:           loadSfxVolume(),
    musicVolume:         loadMusicVolume(),
    touchUiEnabled:      loadTouchUiEnabled(),
    commandKeys:         loadCommandKeyAssignments(),
    activeCampaignId:    loadActiveCampaignId(),
    backgroundEnabled:   loadBackgroundEnabled(),
    environmentalEnabled: loadEnvironmentalEnabled(),
    musicMuteOnFocusLoss: loadMusicMuteOnFocusLoss(),
    campaignProgress,
    partialProgress:     loadPartialProgress(),
    saveNoticeSuppressed: loadSaveNoticeSuppressed(),
    appearance:          loadGnomeAppearance(),
  };
  if (recordings !== undefined) {
    payload.recordings = recordings;
  }
  return payload;
}

/** Minimal UUID v4 fallback (used when no GUID is supplied to buildPlayerProfilePayload). */
function _generateFallbackGuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Wrap a {@link PlayerProfilePayload} in the full file envelope
 * (type → version → payload → checksum).
 *
 * The checksum covers the JSON-serialized payload so it can be validated
 * independently of the outer envelope fields.
 */
export function buildPlayerFile(payload: PlayerProfilePayload): PlayerProfileFile {
  const payloadJson = JSON.stringify(payload);
  const checksum    = computeChecksum(payloadJson);
  return {
    type:     FILE_TYPE_PLAYER,
    version:  PROFILE_FORMAT_VERSION,
    payload,
    checksum,
  };
}

// ─── Parsing and validation ───────────────────────────────────────────────────

/** Returned by {@link parsePlayerFile} when validation fails. */
export interface PlayerFileError {
  ok: false;
  error: string;
}

/** Returned by {@link parsePlayerFile} on success. */
export interface PlayerFileSuccess {
  ok: true;
  payload: PlayerProfilePayload;
}

export type PlayerFileResult = PlayerFileSuccess | PlayerFileError;

/** id/campaignId/levelId identity fields of an imported recording. */
function isValidRecordingIdentity(record: Record<string, unknown>): boolean {
  return (
    typeof record['id'] === 'string' &&
    typeof record['campaignId'] === 'string' &&
    record['campaignId'] !== '' &&
    typeof record['levelId'] === 'number'
  );
}

/** The recording's move-list field. */
function isValidRecordingMoves(moves: unknown): boolean {
  return Array.isArray(moves) && moves.every((move) => typeof move === 'string');
}

/** The recording's outcome field. */
function isValidRecordingOutcome(record: Record<string, unknown>): boolean {
  return (
    typeof record['outcome'] === 'string' &&
    ['success', 'failure', 'partial'].includes(record['outcome'])
  );
}

/** autoRecorded/timestamp/playerName/corrupted fields of an imported recording. */
function isValidRecordingFlags(record: Record<string, unknown>): boolean {
  return (
    typeof record['autoRecorded'] === 'boolean' &&
    typeof record['timestamp'] === 'number' &&
    typeof record['playerName'] === 'string' &&
    typeof record['corrupted'] === 'boolean'
  );
}

/** Optional stars/waterScore fields: valid when absent, undefined, or a number. */
function isValidRecordingOptionalScores(record: Record<string, unknown>): boolean {
  if ('stars' in record && record['stars'] !== undefined && typeof record['stars'] !== 'number') return false;
  if ('waterScore' in record && record['waterScore'] !== undefined && typeof record['waterScore'] !== 'number') return false;
  return true;
}

/**
 * Enforce the SAME required-field contract that loadAllRecordings()
 * (persistence.ts) enforces on read. If import accepted a weaker shape, a
 * recording could be persisted here and then silently dropped on the next
 * load — so reject it at the door instead of fabricating defaults.
 */
function isValidRecordingEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as Record<string, unknown>;
  return (
    isValidRecordingIdentity(record) &&
    isValidRecordingMoves(record['moves']) &&
    isValidRecordingOutcome(record) &&
    isValidRecordingFlags(record) &&
    isValidRecordingOptionalScores(record)
  );
}

function hasValidRecordingsShape(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(isValidRecordingEntry);
}

/** True when `v` is `null` or a `string`. */
function isNullOrString(v: unknown): boolean {
  return v === null || typeof v === 'string';
}

/** True when `v` is `null` or a `boolean`. */
function isNullOrBoolean(v: unknown): boolean {
  return v === null || typeof v === 'boolean';
}

/** True when `v` is `null` or an `object`. */
function isNullOrObject(v: unknown): boolean {
  return v === null || typeof v === 'object';
}

/** True when `key` is absent from `payload`, or present and `isValid` accepts its value. */
function isValidOptionalField(payload: Record<string, unknown>, key: string, isValid: (v: unknown) => boolean): boolean {
  return !(key in payload) || isValid(payload[key]);
}

/** Required core fields present on every player-profile payload version. */
function isValidCorePayloadFields(payload: Record<string, unknown>): boolean {
  if (typeof payload['guid'] !== 'string') return false;
  if (!isNullOrString(payload['lastPlayedAt'])) return false;
  if (typeof payload['playerName'] !== 'string') return false;
  if (typeof payload['sfxVolume'] !== 'number') return false;
  if (!isNullOrBoolean(payload['touchUiEnabled'])) return false;
  if (!isNullOrObject(payload['commandKeys'])) return false;
  if (!Array.isArray(payload['campaignProgress'])) return false;
  return true;
}

/** Fields that are optional for back-compat: valid when absent, rejected only when present and malformed. */
function isValidOptionalScalarPayloadFields(payload: Record<string, unknown>): boolean {
  return (
    isValidOptionalField(payload, 'activeCampaignId', isNullOrString) &&
    isValidOptionalField(payload, 'recordings', hasValidRecordingsShape) &&
    isValidOptionalField(payload, 'musicVolume', (v) => typeof v === 'number') &&
    isValidOptionalField(payload, 'musicMuteOnFocusLoss', (v) => typeof v === 'boolean') &&
    isValidOptionalField(payload, 'saveNoticeSuppressed', (v) => typeof v === 'boolean')
  );
}

/** A single entry of the optional `partialProgress` array. */
function isValidPartialProgressEntry(e: unknown): boolean {
  if (e === null || typeof e !== 'object') return false;
  const entry = e as Record<string, unknown>;
  if (typeof entry['campaignId'] !== 'string') return false;
  if (typeof entry['levelId'] !== 'number') return false;
  if (!Array.isArray(entry['moves'])) return false;
  if (typeof entry['timestamp'] !== 'number') return false;
  return true;
}

/** partialProgress is optional for back-compat; reject only if present and malformed. */
function isValidPartialProgressShape(payload: Record<string, unknown>): boolean {
  if (!('partialProgress' in payload)) return true;
  const pp = payload['partialProgress'];
  if (!Array.isArray(pp)) return false;
  return pp.every(isValidPartialProgressEntry);
}

/**
 * appearance is optional for back-compat; migrate older shapes (e.g. files exported
 * before shoeShape existed) in place, then reject only if still malformed.
 */
function isValidAppearancePayloadField(payload: Record<string, unknown>): boolean {
  if ('appearance' in payload && payload['appearance'] !== undefined) {
    payload['appearance'] = migrateGnomeAppearance(payload['appearance']);
    if (!isValidGnomeAppearance(payload['appearance'])) return false;
  }
  return true;
}

function hasValidPayloadShape(payload: Record<string, unknown>): boolean {
  return (
    isValidCorePayloadFields(payload) &&
    isValidOptionalScalarPayloadFields(payload) &&
    isValidPartialProgressShape(payload) &&
    isValidAppearancePayloadField(payload)
  );
}

function migratePayloadV1ToV2(payload: Record<string, unknown>): Record<string, unknown> {
  if (!payload['guid'] || typeof payload['guid'] !== 'string') {
    payload['guid'] = _generateFallbackGuid();
  }
  if (!('lastPlayedAt' in payload)) {
    payload['lastPlayedAt'] = null;
  }
  return payload;
}

function migratePayloadV2ToV3(payload: Record<string, unknown>): Record<string, unknown> {
  // v3 introduced activeCampaignId; older files can safely default to null.
  if (!('activeCampaignId' in payload)) {
    payload['activeCampaignId'] = null;
  }
  // Future structural migrations should keep this version-cursor pattern:
  // add migratePayloadVnToVn+1 and advance cursor one step at a time.
  return payload;
}

function migratePayloadV3ToV4(payload: Record<string, unknown>): Record<string, unknown> {
  // v4 introduced the gnome avatar appearance; older files simply lack it, and
  // applyPlayerProfile leaves the local appearance untouched when absent.
  return payload;
}

/**
 * Parse and validate a player-profile JSON string.
 *
 * Accepts both v1 (no `guid`/`lastPlayedAt`) and v2 files:
 * - v1 files receive a freshly generated GUID and `lastPlayedAt: null` so
 *   callers can treat all payloads uniformly.
 *
 * Validation steps:
 * 1. Valid JSON
 * 2. `type` field must equal {@link FILE_TYPE_PLAYER} (campaign files are
 *    rejected with a specific message)
 * 3. Required fields (`payload`, `checksum`) must be present
 * 4. Checksum must match the payload
 */
/** True when `parsed` is a non-null object, i.e. eligible to be treated as a file record. */
function isParsedObject(parsed: unknown): parsed is Record<string, unknown> {
  return !!parsed && typeof parsed === 'object';
}

/** Validate the file's `type` field, distinguishing the campaign-file mixup from any other mismatch. */
function validateFileType(file: Record<string, unknown>): PlayerFileError | null {
  if (file['type'] === FILE_TYPE_PLAYER) return null;
  if (file['type'] === FILE_TYPE_CAMPAIGN) {
    return {
      ok: false,
      error: 'Wrong file type: this is a campaign file, not a player profile. ' +
             'Use the Campaign Editor to import campaign files.',
    };
  }
  return {
    ok: false,
    error: `Wrong file type: expected a player profile file (type "${FILE_TYPE_PLAYER}").`,
  };
}

/** Validate that the stored checksum is well-formed and matches the payload. */
function validateChecksum(storedChecksum: unknown, payload: unknown): PlayerFileError | null {
  if (typeof storedChecksum !== 'string' || !payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid player profile file: missing required fields.' };
  }
  const payloadJson      = JSON.stringify(payload);
  const expectedChecksum = computeChecksum(payloadJson);
  if (storedChecksum !== expectedChecksum) {
    return {
      ok: false,
      error: 'File checksum mismatch – the file may be corrupted or has been modified.',
    };
  }
  return null;
}

/** Validate that the file's `version` field is a supported, finite number. */
function validateVersion(versionRaw: unknown): PlayerFileError | null {
  if (typeof versionRaw !== 'number' || !Number.isFinite(versionRaw)) {
    return { ok: false, error: 'Invalid player profile file: missing or invalid version.' };
  }
  if (versionRaw > PROFILE_FORMAT_VERSION) {
    return {
      ok: false,
      error: `file from newer version (profile format ${versionRaw} > supported ${PROFILE_FORMAT_VERSION})`,
    };
  }
  return null;
}

/** Step the payload forward, version by version, to {@link PROFILE_FORMAT_VERSION}, mutating it in place. */
function migratePayloadToCurrentVersion(rawPayload: Record<string, unknown>, versionRaw: number): PlayerFileError | null {
  let payloadVersion = Math.floor(versionRaw);
  while (payloadVersion < PROFILE_FORMAT_VERSION) {
    if (payloadVersion === 1) {
      migratePayloadV1ToV2(rawPayload);
      payloadVersion = 2;
      continue;
    }
    if (payloadVersion === 2) {
      migratePayloadV2ToV3(rawPayload);
      payloadVersion = 3;
      continue;
    }
    if (payloadVersion === 3) {
      migratePayloadV3ToV4(rawPayload);
      payloadVersion = 4;
      continue;
    }
    // Guardrail for incomplete future migration chains during development.
    return { ok: false, error: `Unsupported player profile version: ${payloadVersion}` };
  }
  return null;
}

export function parsePlayerFile(json: string): PlayerFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON – the file could not be read.' };
  }

  if (!isParsedObject(parsed)) {
    return { ok: false, error: 'Invalid file format.' };
  }
  const file = parsed;

  const typeError = validateFileType(file);
  if (typeError) return typeError;

  const storedChecksum = file['checksum'];
  const payload        = file['payload'];
  const versionRaw     = file['version'];

  const checksumError = validateChecksum(storedChecksum, payload);
  if (checksumError) return checksumError;

  const versionError = validateVersion(versionRaw);
  if (versionError) return versionError;

  const rawPayload = payload as Record<string, unknown>;
  const migrationError = migratePayloadToCurrentVersion(rawPayload, versionRaw as number);
  if (migrationError) return migrationError;

  if (!hasValidPayloadShape(rawPayload)) {
    return {
      ok: false,
      error: 'Invalid player profile file: payload shape mismatch.',
    };
  }

  return { ok: true, payload: rawPayload as unknown as PlayerProfilePayload };
}

// ─── Apply / merge ────────────────────────────────────────────────────────────

/** Outcome of importing a single campaign's progress block. */
export type CampaignImportOutcome =
  | {
      status: 'merged';
      campaignName: string;
      campaignId: string;
      /** Number of levels newly marked as completed (previously incomplete). */
      newLevelsCompleted: number;
      /** Number of chapters newly marked as completed (previously incomplete). */
      newChaptersCompleted: number;
      /** Total additional stars gained across all levels (sum of deltas). */
      newStars: number;
      /** Total additional water gained across all levels (sum of deltas). */
      newWater: number;
      /** Number of recordings imported that were not already present locally. */
      newRecordings: number;
    }
  | { status: 'ignored'; campaignId: string; campaignName: string; reason: 'not_found_locally' };

/** Result returned from {@link applyPlayerProfile}. */
export interface ApplyProfileResult {
  outcomes: CampaignImportOutcome[];
}

/**
 * Apply a {@link PlayerProfilePayload} to local storage.
 *
 * - Player settings are overwritten with the imported values.
 * - For each campaign in the payload whose ID exists locally, progress
 *   is merged (union for sets/flags, max for numeric scores).
 * - Campaigns whose IDs are not found locally are silently skipped.
 * - When the payload includes `recordings`, each record is merged into the
 *   local store; records whose `id` already exists locally are skipped.
 *
 * @param payload         The decoded player-profile payload.
 * @param localCampaigns  All campaigns currently installed locally.
 */
export function applyPlayerProfile(
  payload:         PlayerProfilePayload,
  localCampaigns:  readonly CampaignDef[],
): ApplyProfileResult {

  // ── Settings ───────────────────────────────────────────────────────────────
  savePlayerName(payload.playerName);
  saveSfxVolume(payload.sfxVolume);
  // musicVolume is optional for back-compat; default to 50 when absent
  saveMusicVolume(payload.musicVolume ?? 50);
  if (payload.touchUiEnabled !== null) {
    saveTouchUiEnabled(payload.touchUiEnabled);
  }
  if (payload.commandKeys) {
    saveCommandKeyAssignments(payload.commandKeys);
  }
  if (payload.backgroundEnabled !== undefined) {
    saveBackgroundEnabled(payload.backgroundEnabled);
  }
  if (payload.environmentalEnabled !== undefined) {
    saveEnvironmentalEnabled(payload.environmentalEnabled);
  }
  // musicMuteOnFocusLoss is optional for back-compat; default to true when absent
  saveMusicMuteOnFocusLoss(payload.musicMuteOnFocusLoss ?? true);
  // saveNoticeSuppressed is optional for back-compat; default to false when absent
  saveSaveNoticeSuppressed(payload.saveNoticeSuppressed ?? false);
  // appearance is optional for back-compat; leave the local appearance untouched when absent
  if (payload.appearance) {
    saveGnomeAppearance(payload.appearance);
  }

  // ── Partial progress ───────────────────────────────────────────────────────
  if (payload.partialProgress) {
    // Build set of all valid level IDs across all known local campaigns.
    const allLevelIds = new Set<number>();
    for (const c of localCampaigns) {
      for (const ch of c.chapters) {
        for (const l of ch.levels) {
          allLevelIds.add(l.id);
        }
      }
    }
    const validEntries = payload.partialProgress.filter((e) => allLevelIds.has(e.levelId));
    mergePartialProgress(validEntries);
  }

  // ── Per-campaign progress ──────────────────────────────────────────────────
  const localById  = new Map(localCampaigns.map((c) => [c.id, c]));
  const outcomes: CampaignImportOutcome[] = [];

  // Pre-compute new recording counts per campaign before processing progress,
  // so the counts can be included directly when each outcome is created.
  const existingRecordingIds = new Set(loadAllRecordings().map((r) => r.id));
  const newRecordingsPerCampaign = new Map<string, number>();
  if (payload.recordings) {
    for (const record of payload.recordings) {
      if (!existingRecordingIds.has(record.id) && record.campaignId) {
        newRecordingsPerCampaign.set(record.campaignId, (newRecordingsPerCampaign.get(record.campaignId) ?? 0) + 1);
      }
    }
  }

  for (const block of payload.campaignProgress) {
    const local = localById.get(block.campaignId);
    if (!local) {
      outcomes.push({ status: 'ignored', campaignId: block.campaignId, campaignName: block.campaignName ?? block.campaignId, reason: 'not_found_locally' });
      continue;
    }

    const levelIds   = validLevelIds(local);
    const chapterIds = validChapterIds(local);

    // Snapshot pre-merge state to compute deltas.
    const preMergeProgress = loadCampaignProgress(block.campaignId);
    const preMergeChapters = loadCompletedChapters(block.campaignId);
    const preMergeStars    = loadLevelStars(block.campaignId);
    const preMergeWater    = loadLevelWater(block.campaignId);

    // Union: completed levels (skip IDs not present in the local campaign).
    // Use a copy so preMergeProgress remains an unmodified snapshot for delta computation.
    const localProgress = new Set(preMergeProgress);
    for (const levelId of block.completedLevels) {
      if (levelIds.has(levelId)) markCampaignLevelCompleted(block.campaignId, levelId, localProgress);
    }

    // Union: completed chapters (skip IDs not present in the local campaign).
    // Use a copy so preMergeChapters remains an unmodified snapshot for delta computation.
    const localChapters = new Set(preMergeChapters);
    for (const chapterId of block.completedChapters) {
      if (chapterIds.has(chapterId)) markChapterCompleted(block.campaignId, chapterId, localChapters);
    }

    // Union: mastered-chapters-shown (skip IDs not present in the local campaign)
    const localMastered = loadMasteredChaptersShown(block.campaignId);
    for (const chapterId of block.masteredChaptersShown) {
      if (chapterIds.has(chapterId)) markMasteredChapterShown(block.campaignId, chapterId, localMastered);
    }

    // Flags: only set, never clear
    if (block.campaignMasteredShown) markCampaignMasteredShown(block.campaignId);
    if (block.campaignCompleteShown)  markCampaignCompleteShown(block.campaignId);

    // Max-value merge: stars (skip IDs not present in the local campaign)
    const existingStars = preMergeStars;
    for (const [idStr, stars] of Object.entries(block.levelStars)) {
      const id = Number(idStr);
      if (levelIds.has(id) && stars > (existingStars[id] ?? -Infinity)) {
        saveLevelStar(id, stars, block.campaignId);
      }
    }

    // Max-value merge: water (skip IDs not present in the local campaign; saveLevelWater already uses max semantics)
    for (const [idStr, water] of Object.entries(block.levelWater)) {
      const id = Number(idStr);
      if (levelIds.has(id)) saveLevelWater(id, water, block.campaignId);
    }

    // Compute deltas for this campaign.
    const newLevelsCompleted   = block.completedLevels.filter((id) => levelIds.has(id) && !preMergeProgress.has(id)).length;
    const newChaptersCompleted = block.completedChapters.filter((id) => chapterIds.has(id) && !preMergeChapters.has(id)).length;
    let newStars = 0;
    for (const [idStr, stars] of Object.entries(block.levelStars)) {
      const id = Number(idStr);
      if (levelIds.has(id)) {
        const delta = stars - (preMergeStars[id] ?? 0);
        if (delta > 0) newStars += delta;
      }
    }
    let newWater = 0;
    for (const [idStr, water] of Object.entries(block.levelWater)) {
      const id = Number(idStr);
      if (levelIds.has(id)) {
        const delta = water - (preMergeWater[id] ?? 0);
        if (delta > 0) newWater += delta;
      }
    }

    outcomes.push({
      status: 'merged',
      campaignName: resolveLocalizedText(local.name),
      campaignId: block.campaignId,
      newLevelsCompleted,
      newChaptersCompleted,
      newStars,
      newWater,
      newRecordings: newRecordingsPerCampaign.get(block.campaignId) ?? 0,
    });
  }

  // ── Recordings (present only in "Export + Recordings" files) ──────────────
  if (payload.recordings && payload.recordings.length > 0) {
    for (const record of payload.recordings) {
      if (!existingRecordingIds.has(record.id)) {
        saveRecording(record);
        existingRecordingIds.add(record.id); // guard against duplicates within the imported list itself
      }
    }
  }

  // ── Active campaign ────────────────────────────────────────────────────────
  if ('activeCampaignId' in payload) {
    if (payload.activeCampaignId && localById.has(payload.activeCampaignId)) {
      saveActiveCampaignId(payload.activeCampaignId);
    } else {
      clearActiveCampaignId();
    }
  }

  return { outcomes };
}
