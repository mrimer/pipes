import type { CampaignDef, PlaySequenceRecord } from '../types';
import {
  FILE_TYPE_REPLAY,
  computeChecksum,
  buildPlayerProfilePayload,
  buildPlayerFile,
  parsePlayerFile,
  applyPlayerProfile,
  type CampaignImportOutcome,
} from './playerProfile';
import { saveRecording, loadPlayerName, loadRecordingsForProfile } from '../persistence';
import { downloadGzipJson, readGzipOrJsonFile } from '../fileIO';
import { findLevelLocation } from '../campaignEditor/campaignService';
import { getActiveSlotIndex, withSlot } from './activeProfile';
import { loadSlotMeta, loadAllSlotMetas, saveSlotMeta, findEmptySlotIndex, generateGuid, PROFILE_SLOT_COUNT } from './playerProfileSlots';
import { t } from '../i18n';
import { resolveLocalizedText } from '../campaignLocalization';

const FILE_INPUT_ACCEPT = '.json,.gz,.pipes.json.gz,application/json,application/gzip';
const FILENAME_SAFE_CHARACTERS_REGEX = /[^\w\s-]/g;
const FILENAME_WHITESPACE_REGEX = /\s+/g;
const EXPORT_FILENAME_FALLBACK_PLAYER = 'player';
const EXPORT_FILENAME_FALLBACK_CAMPAIGN = 'campaign';
const REPLAY_FILE_VERSION = 1;
const FILE_READ_ERROR_MESSAGE =
  'Failed to read the selected file. It may be corrupted or an unsupported format.';

function showProfileIoMessage(message: string): void {
  if (process.env['NODE_ENV'] === 'test') {
    window.alert(message);
    return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.65);display:flex;justify-content:center;align-items:center;z-index:1000;';
  const box = document.createElement('div');
  box.style.cssText =
    'background:#111827;color:#eee;border:1px solid #4a90d9;border-radius:8px;padding:16px;max-width:520px;width:90%;display:flex;flex-direction:column;gap:12px;';
  const msg = document.createElement('div');
  msg.style.whiteSpace = 'pre-wrap';
  msg.textContent = message;
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = t('editor.common.ok');
  ok.style.cssText = 'align-self:flex-end;padding:6px 12px;background:#4a90d9;color:#fff;border:none;border-radius:6px;cursor:pointer;';
  ok.addEventListener('click', () => overlay.remove());
  box.appendChild(msg);
  box.appendChild(ok);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function assertReplayRecordShape(record: unknown): asserts record is { id: string; moves: unknown[] } {
  if (!record || typeof record !== 'object') {
    throw new Error('Import failed: replay record is not an object.');
  }
  const candidate = record as Record<string, unknown>;
  if (typeof candidate.id !== 'string') {
    throw new Error('Import failed: replay record is missing a valid string "id".');
  }
  if (!Array.isArray(candidate.moves)) {
    throw new Error('Import failed: replay record is missing a valid "moves" array.');
  }
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const safeValue = value
    .replace(FILENAME_SAFE_CHARACTERS_REGEX, '')
    .trim()
    .replace(FILENAME_WHITESPACE_REGEX, '_');
  return safeValue || fallback;
}

function openImportFilePicker(onText: (text: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = FILE_INPUT_ACCEPT;
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    readGzipOrJsonFile(file).then(onText).catch((err: unknown) => {
      const details = err instanceof Error ? err.message : String(err);
      showProfileIoMessage(`${FILE_READ_ERROR_MESSAGE}\n${details}`);
    });
  });
  input.click();
}

export async function exportReplay(
  record: PlaySequenceRecord,
  campaigns: CampaignDef[],
): Promise<void> {
  const campaign = campaigns.find((c) => c.id === record.campaignId);
  const campaignName = campaign ? resolveLocalizedText(campaign.name) : record.campaignId;
  const location = campaign ? findLevelLocation(campaign, record.levelId) : null;
  const chapterNumber = location?.chapterNumber ?? null;
  const levelNumber = location?.levelNumber ?? null;

  const payload = {
    type: FILE_TYPE_REPLAY,
    version: REPLAY_FILE_VERSION,
    campaignId: record.campaignId,
    campaignName,
    levelId: record.levelId,
    record,
    checksum: computeChecksum(JSON.stringify(record)),
  };
  const json = JSON.stringify(payload, null, 2);
  const safeName = sanitizeFilenamePart(record.playerName, EXPORT_FILENAME_FALLBACK_PLAYER);
  const safeCampaign = sanitizeFilenamePart(campaignName, EXPORT_FILENAME_FALLBACK_CAMPAIGN);
  const chapterPart = chapterNumber !== null ? `-ch${chapterNumber}` : '';
  const levelPart = levelNumber !== null ? `-level${levelNumber}` : `-levelid${record.levelId}`;
  const filename = `replay-${safeName}-${safeCampaign}${chapterPart}${levelPart}.pipes.json.gz`;

  try {
    await downloadGzipJson(json, filename);
  } catch (err) {
    showProfileIoMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function importReplay(
  campaigns: CampaignDef[],
  onSuccess: (
    record: PlaySequenceRecord,
    campaignName: string,
    chapterNumber: number | null,
    levelNumber: number | null,
  ) => void,
): void {
  const processText = (text: string): void => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      showProfileIoMessage('Import failed: invalid JSON.');
      return;
    }
    if (parsed.type !== FILE_TYPE_REPLAY || typeof parsed.record !== 'object' || parsed.record === null) {
      showProfileIoMessage('Import failed: not a valid replay file.');
      return;
    }
    const replayVersion = parsed.version;
    if (typeof replayVersion !== 'number' || !Number.isFinite(replayVersion)) {
      showProfileIoMessage('Import failed: replay file is missing a valid version.');
      return;
    }
    if (replayVersion > REPLAY_FILE_VERSION) {
      showProfileIoMessage('Import failed: file from newer version (replay file is from a newer game version).');
      return;
    }
    const recordJson = JSON.stringify(parsed.record);
    if (typeof parsed.checksum === 'string' && computeChecksum(recordJson) !== parsed.checksum) {
      showProfileIoMessage('Import failed: replay file checksum mismatch (file may be corrupted).');
      return;
    }

    const recordCandidate = parsed.record as unknown;
    try {
      assertReplayRecordShape(recordCandidate);
    } catch (err) {
      showProfileIoMessage(err instanceof Error ? err.message : 'Import failed: invalid replay record.');
      return;
    }
    const record = {
      ...(recordCandidate as PlaySequenceRecord),
      formatVersion: (recordCandidate as PlaySequenceRecord).formatVersion ?? 1,
    };
    saveRecording(record);

    const campaign = campaigns.find((c) => c.id === record.campaignId);
    const campaignName = campaign
      ? resolveLocalizedText(campaign.name)
      : (typeof parsed.campaignName === 'string' ? parsed.campaignName : record.campaignId);
    const location = campaign ? findLevelLocation(campaign, record.levelId) : null;
    onSuccess(record, campaignName, location?.chapterNumber ?? null, location?.levelNumber ?? null);
  };

  openImportFilePicker(processText);
}

export async function exportPlayerProfile(
  campaigns: CampaignDef[],
): Promise<void> {
  // Include this slot's GUID and last-played date in the export so the file
  // can be matched back to the same slot on import.
  const slotIdx = getActiveSlotIndex();
  const meta = slotIdx !== null ? loadSlotMeta(slotIdx) : null;
  const payload = buildPlayerProfilePayload(campaigns, meta?.guid, meta?.lastPlayedAt ?? null);
  const fileObj = buildPlayerFile(payload);
  const json = JSON.stringify(fileObj, null, 2);
  const playerName = sanitizeFilenamePart(loadPlayerName(), EXPORT_FILENAME_FALLBACK_PLAYER);
  const filename = `player-${playerName}.pipes.json.gz`;

  try {
    await downloadGzipJson(json, filename);
  } catch (err) {
    showProfileIoMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Export a player profile together with all recordings that belong to it.
 *
 * Recordings are matched to the profile using the GUID-first, name-fallback
 * strategy: a recording belongs to this profile when its `playerGuid` equals
 * the profile GUID, or — for older recordings that pre-date the `playerGuid`
 * field — when its `playerName` equals the profile's player name.
 *
 * The resulting file is identical to a standard profile export except that
 * `payload.recordings` is populated.  On import, {@link importPlayerProfile}
 * will merge those recordings into the local store, skipping any whose `id`
 * already exists.
 */
export async function exportPlayerProfileWithRecordings(
  campaigns: CampaignDef[],
): Promise<void> {
  const slotIdx = getActiveSlotIndex();
  const meta = slotIdx !== null ? loadSlotMeta(slotIdx) : null;
  const playerName = loadPlayerName();
  const guid = meta?.guid ?? '';
  const recordings = loadRecordingsForProfile(guid, playerName);
  // Inject the player's GUID into any recording that was created before the
  // playerGuid field existed, so the export can be matched back to this profile.
  const recordingsWithGuid = guid
    ? recordings.map((r) => ({ ...r, playerGuid: r.playerGuid ?? guid }))
    : recordings;
  const payload = buildPlayerProfilePayload(campaigns, meta?.guid, meta?.lastPlayedAt ?? null, recordingsWithGuid);
  const fileObj = buildPlayerFile(payload);
  const json = JSON.stringify(fileObj, null, 2);
  const safePlayerName = sanitizeFilenamePart(playerName, EXPORT_FILENAME_FALLBACK_PLAYER);
  const filename = `player-${safePlayerName}-with-recordings.pipes.json.gz`;

  try {
    await downloadGzipJson(json, filename);
  } catch (err) {
    showProfileIoMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Import a player profile from a file.
 *
 * GUID-matching rules:
 * - If the file's GUID matches the active slot's GUID → merge into the active slot.
 * - If the file's GUID matches any other occupied slot → merge into that slot.
 * - Otherwise, import into an empty slot (creating a new profile).
 * - If no empty slot is available, show an error.
 *
 * @param campaigns  All locally installed campaigns.
 * @param onSuccess  Called with the merge outcomes, target slot index,
 *                   whether the target slot was empty before the import,
 *                   and the player name from the imported file.
 * @param requiredSlotGuid  When provided, the import is only permitted if the
 *                          file's GUID matches this value.  Used by the
 *                          "Import Merge" action on occupied slots to prevent
 *                          accidentally merging a different player's data.
 */
export function importPlayerProfile(
  campaigns: CampaignDef[],
  onSuccess: (outcomes: CampaignImportOutcome[], targetSlotIndex: number, isNewSlot: boolean, importedPlayerName: string) => void,
  requiredSlotGuid?: string,
): void {
  const processText = (text: string): void => {
    const result = parsePlayerFile(text);
    if (!result.ok) {
      showProfileIoMessage(`Import failed: ${result.error}`);
      return;
    }

    const importedGuid = result.payload.guid;

    // When merging into a specific occupied slot, verify the file belongs to that profile.
    if (requiredSlotGuid !== undefined && importedGuid !== requiredSlotGuid) {
      showProfileIoMessage(
        `Import Merge aborted: the profile in the file ("${result.payload.playerName}") ` +
        `doesn't match the selected profile. No changes were made.`,
      );
      return;
    }

    const allMetas = loadAllSlotMetas();

    // Find a slot whose GUID matches the imported file.
    let targetSlot: number | null = null;
    for (let i = 0; i < PROFILE_SLOT_COUNT; i++) {
      if (allMetas[i]?.guid === importedGuid) {
        targetSlot = i;
        break;
      }
    }

    // If no GUID match, look for an empty slot.
    if (targetSlot === null) {
      targetSlot = findEmptySlotIndex();
    }

    if (targetSlot === null) {
      showProfileIoMessage('Import failed: no empty profile slots available. Delete a profile first.');
      return;
    }

    const finalTarget = targetSlot;

    // Detect whether the target slot was empty before the import.
    const existingMeta = loadSlotMeta(finalTarget);
    const isNewSlot = !existingMeta;

    // Perform the merge inside the target slot's namespace.
    const applyResult = withSlot(finalTarget, () => applyPlayerProfile(result.payload, campaigns));

    // Update slot metadata: if this is a new slot, create metadata from the file.
    if (!existingMeta) {
      saveSlotMeta(finalTarget, {
        // parsePlayerFile always ensures payload.guid is a string (generating a fallback for v1
        // files), so importedGuid is never null here.  The fallback is a safety net.
        guid:         importedGuid ?? generateGuid(),
        name:         result.payload.playerName,
        lastPlayedAt: result.payload.lastPlayedAt ?? null,
      });
    } else {
      // Update the name in case it changed.
      saveSlotMeta(finalTarget, { ...existingMeta, name: result.payload.playerName });
    }

    onSuccess(applyResult.outcomes, finalTarget, isNewSlot, result.payload.playerName);
  };

  openImportFilePicker(processText);
}
