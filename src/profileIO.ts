import type { CampaignDef, PlaySequenceRecord } from './types';
import {
  FILE_TYPE_REPLAY,
  computeChecksum,
  buildPlayerProfilePayload,
  buildPlayerFile,
  parsePlayerFile,
  applyPlayerProfile,
  type CampaignImportOutcome,
} from './playerProfile';
import { saveRecording, loadPlayerName } from './persistence';
import { downloadGzipJson, readGzipOrJsonFile } from './fileIO';
import { findLevelLocation } from './campaignEditor/campaignService';
import { getActiveSlotIndex, withSlot } from './activeProfile';
import { loadSlotMeta, loadAllSlotMetas, saveSlotMeta, findEmptySlotIndex, generateGuid, PROFILE_SLOT_COUNT } from './playerProfileSlots';

const FILE_INPUT_ACCEPT = '.json,.gz,.pipes.json.gz,application/json,application/gzip';
const FILENAME_SAFE_CHARACTERS_REGEX = /[^\w\s-]/g;
const FILENAME_WHITESPACE_REGEX = /\s+/g;
const EXPORT_FILENAME_FALLBACK_PLAYER = 'player';
const EXPORT_FILENAME_FALLBACK_CAMPAIGN = 'campaign';
const REPLAY_FILE_VERSION = 1;
const FILE_READ_ERROR_MESSAGE =
  'Failed to read the selected file. It may be corrupted or an unsupported format.';

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
    readGzipOrJsonFile(file).then(onText).catch(() => {
      alert(FILE_READ_ERROR_MESSAGE);
    });
  });
  input.click();
}

export async function exportReplay(
  record: PlaySequenceRecord,
  campaigns: CampaignDef[],
): Promise<void> {
  const campaign = campaigns.find((c) => c.id === record.campaignId);
  const campaignName = campaign?.name ?? record.campaignId;
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
    alert(`Export failed: ${err}`);
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
      alert('Import failed: invalid JSON.');
      return;
    }
    if (parsed.type !== FILE_TYPE_REPLAY || typeof parsed.record !== 'object' || parsed.record === null) {
      alert('Import failed: not a valid replay file.');
      return;
    }
    const recordJson = JSON.stringify(parsed.record);
    if (typeof parsed.checksum === 'string' && computeChecksum(recordJson) !== parsed.checksum) {
      alert('Import failed: replay file checksum mismatch (file may be corrupted).');
      return;
    }

    const record = parsed.record as PlaySequenceRecord;
    saveRecording(record);

    const campaign = campaigns.find((c) => c.id === record.campaignId);
    const campaignName = campaign?.name ?? (typeof parsed.campaignName === 'string' ? parsed.campaignName : record.campaignId);
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
  const filename = `pipes-player-${playerName}.pipes.json.gz`;

  try {
    await downloadGzipJson(json, filename);
  } catch (err) {
    alert(`Export failed: ${err}`);
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
 * @param onSuccess  Called with the merge outcomes and target slot index.
 */
export function importPlayerProfile(
  campaigns: CampaignDef[],
  onSuccess: (outcomes: CampaignImportOutcome[], targetSlotIndex: number) => void,
): void {
  const processText = (text: string): void => {
    const result = parsePlayerFile(text);
    if (!result.ok) {
      alert(`Import failed: ${result.error}`);
      return;
    }

    const importedGuid = result.payload.guid;
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
      alert('Import failed: no empty profile slots available. Delete a profile first.');
      return;
    }

    const finalTarget = targetSlot;

    // Perform the merge inside the target slot's namespace.
    const applyResult = withSlot(finalTarget, () => applyPlayerProfile(result.payload, campaigns));

    // Update slot metadata: if this is a new slot, create metadata from the file.
    const existingMeta = loadSlotMeta(finalTarget);
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

    onSuccess(applyResult.outcomes, finalTarget);
  };

  openImportFilePicker(processText);
}
