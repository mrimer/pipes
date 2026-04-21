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
  const payload = buildPlayerProfilePayload(campaigns);
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

export function importPlayerProfile(
  campaigns: CampaignDef[],
  onSuccess: (outcomes: CampaignImportOutcome[]) => void,
): void {
  const processText = (text: string): void => {
    const result = parsePlayerFile(text);
    if (!result.ok) {
      alert(`Import failed: ${result.error}`);
      return;
    }

    const applyResult = applyPlayerProfile(result.payload, campaigns);
    onSuccess(applyResult.outcomes);
  };

  openImportFilePicker(processText);
}
