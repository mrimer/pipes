/**
 * Player-profile export/import: file-type constants, payload interfaces,
 * checksum helper, snapshot/restore, and merge utilities.
 *
 * This module is pure data-logic – it has no DOM dependencies and does not
 * perform any gzip compression/decompression or file-system I/O.
 * Those concerns are handled by the caller (game.ts).
 */

import {
  loadCompletedLevels,
  loadCampaignProgress,
  loadLevelStars,
  loadLevelWater,
  loadCompletedChapters,
  loadMasteredChaptersShown,
  loadCampaignMasteredShown,
  loadCampaignCompleteShown,
  loadSfxVolume,
  loadTouchUiEnabled,
  loadPlayerName,
  loadCommandKeyAssignments,
  markLevelCompleted,
  markCampaignLevelCompleted,
  saveLevelStar,
  saveLevelWater,
  markChapterCompleted,
  markMasteredChapterShown,
  markCampaignMasteredShown,
  markCampaignCompleteShown,
  saveSfxVolume,
  saveTouchUiEnabled,
  savePlayerName,
  saveCommandKeyAssignments,
} from './persistence';
import { CampaignDef } from './types';

// ─── File type constants ──────────────────────────────────────────────────────

/** Semantic type identifier for player-profile files. */
export const FILE_TYPE_PLAYER   = 'pipes-player-profile' as const;

/** Semantic type identifier for campaign files. */
export const FILE_TYPE_CAMPAIGN = 'pipes-campaign' as const;

/** Current player-profile file format version. */
export const PROFILE_FORMAT_VERSION = 1;

// ─── Checksum ─────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic 32-bit FNV-1a hash of `data` and return it as a
 * zero-padded 8-character hex string.
 *
 * Used for lightweight data-integrity verification only – not cryptographic.
 */
export function computeChecksum(data: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data.charCodeAt(i);
    // Unsigned 32-bit multiply: use >>> 0 to keep it in [0, 2^32).
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Player-profile interfaces ────────────────────────────────────────────────

/** Progress snapshot for a single campaign. */
export interface CampaignProgressBlock {
  campaignId: string;
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
  playerName: string;
  sfxVolume: number;
  touchUiEnabled: boolean | null;
  commandKeys: Record<string, string> | null;
  officialProgress: {
    completedLevels: number[];
    levelStars: Record<string, number>;
    levelWater: Record<string, number>;
  };
  campaignProgress: CampaignProgressBlock[];
}

/** The complete serialized player-profile file. */
export interface PlayerProfileFile {
  type: typeof FILE_TYPE_PLAYER;
  version: number;
  payload: PlayerProfilePayload;
  checksum: string;
}

// ─── Snapshot (build) ─────────────────────────────────────────────────────────

/**
 * Build a {@link PlayerProfilePayload} from the current local-storage state.
 *
 * @param localCampaigns - All locally installed campaigns; used to enumerate
 *   per-campaign progress keys.  The official campaign (no campaignId) is
 *   always included separately via `officialProgress`.
 */
export function buildPlayerProfilePayload(
  localCampaigns: readonly CampaignDef[],
): PlayerProfilePayload {
  const officialStars  = loadLevelStars();
  const officialWater  = loadLevelWater();

  const campaignProgress: CampaignProgressBlock[] = localCampaigns.map((c) => ({
    campaignId:            c.id,
    completedLevels:       [...loadCampaignProgress(c.id)],
    completedChapters:     [...loadCompletedChapters(c.id)],
    masteredChaptersShown: [...loadMasteredChaptersShown(c.id)],
    campaignMasteredShown: loadCampaignMasteredShown(c.id),
    campaignCompleteShown: loadCampaignCompleteShown(c.id),
    levelStars:            loadLevelStars(c.id),
    levelWater:            loadLevelWater(c.id),
  }));

  return {
    playerName:    loadPlayerName(),
    sfxVolume:     loadSfxVolume(),
    touchUiEnabled: loadTouchUiEnabled(),
    commandKeys:   loadCommandKeyAssignments(),
    officialProgress: {
      completedLevels: [...loadCompletedLevels()],
      levelStars:      officialStars,
      levelWater:      officialWater,
    },
    campaignProgress,
  };
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

/**
 * Parse and validate a player-profile JSON string.
 *
 * Validation steps:
 * 1. Valid JSON
 * 2. `type` field must equal {@link FILE_TYPE_PLAYER} (campaign files are
 *    rejected with a specific message)
 * 3. Required fields (`payload`, `checksum`) must be present
 * 4. Checksum must match the payload
 */
export function parsePlayerFile(json: string): PlayerFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON – the file could not be read.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Invalid file format.' };
  }

  const file = parsed as Record<string, unknown>;

  if (file['type'] !== FILE_TYPE_PLAYER) {
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

  const storedChecksum = file['checksum'];
  const payload        = file['payload'];
  if (typeof storedChecksum !== 'string' || !payload || typeof payload !== 'object') {
    return { ok: false, error: 'Invalid player profile file: missing required fields.' };
  }

  const payloadJson       = JSON.stringify(payload);
  const expectedChecksum  = computeChecksum(payloadJson);
  if (storedChecksum !== expectedChecksum) {
    return {
      ok: false,
      error: 'File checksum mismatch – the file may be corrupted or has been modified.',
    };
  }

  return { ok: true, payload: payload as PlayerProfilePayload };
}

// ─── Apply / merge ────────────────────────────────────────────────────────────

/** Outcome of importing a single campaign's progress block. */
export type CampaignImportOutcome =
  | { status: 'merged';  campaignName: string; campaignId: string }
  | { status: 'ignored'; campaignId: string;   reason: 'not_found_locally' };

/** Result returned from {@link applyPlayerProfile}. */
export interface ApplyProfileResult {
  outcomes: CampaignImportOutcome[];
}

/**
 * Apply a {@link PlayerProfilePayload} to local storage.
 *
 * - Player settings are overwritten with the imported values.
 * - Official-campaign level completion is unioned with the local set;
 *   stars and water use max-value semantics.
 * - For each campaign in the payload whose ID exists locally, progress
 *   is merged (union for sets/flags, max for numeric scores).
 * - Campaigns whose IDs are not found locally are silently skipped.
 *
 * @param payload         The decoded player-profile payload.
 * @param localCampaigns  All campaigns currently installed locally.
 * @param completedLevels The in-memory official completed-levels set to update.
 */
export function applyPlayerProfile(
  payload:         PlayerProfilePayload,
  localCampaigns:  readonly CampaignDef[],
  completedLevels: Set<number>,
): ApplyProfileResult {

  // ── Settings ───────────────────────────────────────────────────────────────
  savePlayerName(payload.playerName);
  saveSfxVolume(payload.sfxVolume);
  if (payload.touchUiEnabled !== null) {
    saveTouchUiEnabled(payload.touchUiEnabled);
  }
  if (payload.commandKeys) {
    saveCommandKeyAssignments(payload.commandKeys);
  }

  // ── Official progress ──────────────────────────────────────────────────────
  const inc = payload.officialProgress;

  // Union: mark any newly-completed official levels
  for (const levelId of inc.completedLevels) {
    markLevelCompleted(completedLevels, levelId);
  }

  // Max-value merge for official stars (saveLevelStar unconditionally overwrites,
  // so we compare manually before calling it)
  const existingOfficialStars = loadLevelStars();
  for (const [idStr, stars] of Object.entries(inc.levelStars)) {
    const id = Number(idStr);
    if (stars > (existingOfficialStars[id] ?? -Infinity)) {
      saveLevelStar(id, stars);
    }
  }

  // Max-value merge for official water (saveLevelWater already has max semantics)
  for (const [idStr, water] of Object.entries(inc.levelWater)) {
    saveLevelWater(Number(idStr), water);
  }

  // ── Per-campaign progress ──────────────────────────────────────────────────
  const localById  = new Map(localCampaigns.map((c) => [c.id, c]));
  const outcomes: CampaignImportOutcome[] = [];

  for (const block of payload.campaignProgress) {
    const local = localById.get(block.campaignId);
    if (!local) {
      outcomes.push({ status: 'ignored', campaignId: block.campaignId, reason: 'not_found_locally' });
      continue;
    }

    // Union: completed levels
    const localProgress = loadCampaignProgress(block.campaignId);
    for (const levelId of block.completedLevels) {
      markCampaignLevelCompleted(block.campaignId, levelId, localProgress);
    }

    // Union: completed chapters
    const localChapters = loadCompletedChapters(block.campaignId);
    for (const chapterId of block.completedChapters) {
      markChapterCompleted(block.campaignId, chapterId, localChapters);
    }

    // Union: mastered-chapters-shown
    const localMastered = loadMasteredChaptersShown(block.campaignId);
    for (const chapterId of block.masteredChaptersShown) {
      markMasteredChapterShown(block.campaignId, chapterId, localMastered);
    }

    // Flags: only set, never clear
    if (block.campaignMasteredShown) markCampaignMasteredShown(block.campaignId);
    if (block.campaignCompleteShown)  markCampaignCompleteShown(block.campaignId);

    // Max-value merge: stars
    const existingStars = loadLevelStars(block.campaignId);
    for (const [idStr, stars] of Object.entries(block.levelStars)) {
      const id = Number(idStr);
      if (stars > (existingStars[id] ?? -Infinity)) {
        saveLevelStar(id, stars, block.campaignId);
      }
    }

    // Max-value merge: water (saveLevelWater already uses max semantics)
    for (const [idStr, water] of Object.entries(block.levelWater)) {
      saveLevelWater(Number(idStr), water, block.campaignId);
    }

    outcomes.push({ status: 'merged', campaignName: local.name, campaignId: block.campaignId });
  }

  return { outcomes };
}
