/**
 * CampaignService – pure data-operations service for campaign/chapter/level CRUD,
 * persistence, import/export, and validation.  Has no DOM dependencies.
 *
 * Design principle: CampaignService does the work; CampaignEditor asks the user
 * (prompt/confirm dialogs) and tells CampaignService what to do.
 */

import { CampaignDef, ChapterDef, LevelDef, TileDef, PipeShape } from '../types';
import {
  loadImportedCampaigns,
  saveImportedCampaigns,
  migrateCampaign,
  clearLevelStarRecord,
  clearLevelWaterRecord,
} from '../persistence';
import {
  generateCampaignId,
  generateLevelId,
  VALID_CAMPAIGN_KEYS,
  VALID_CHAPTER_KEYS,
  VALID_LEVEL_KEYS,
  VALID_INVENTORY_ITEM_KEYS,
  getValidTileDefKeys,
  getValidChapterMapTileDefKeys,
} from './types';

// ─── ImportResult ─────────────────────────────────────────────────────────────

/**
 * Result of parsing a campaign import file.
 *
 * `conflict` signals whether an existing local campaign has the same ID:
 *  - `'none'`             – no collision; the campaign is new.
 *  - `'same_version'`     – local and imported timestamps are identical.
 *  - `'version_conflict'` – timestamps differ; `isNewer` tells which is newer.
 */
export interface ImportResult {
  campaign: CampaignDef;
  conflict: 'none' | 'same_version' | 'version_conflict';
  existing?: CampaignDef;
  isNewer?: boolean;
}

// ─── CampaignService ──────────────────────────────────────────────────────────

export class CampaignService {
  private _campaigns: CampaignDef[];

  constructor(campaigns?: CampaignDef[]) {
    this._campaigns = campaigns ?? loadImportedCampaigns();
  }

  // ── Campaign access ──────────────────────────────────────────────────────────

  /** Read-only view of the current campaign list. */
  get campaigns(): readonly CampaignDef[] {
    return this._campaigns;
  }

  /** Return a shallow copy of all campaigns (existing public API shape). */
  getAllCampaigns(): CampaignDef[] {
    return [...this._campaigns];
  }

  /** Find a campaign by ID, or null if not found. */
  getCampaign(id: string): CampaignDef | null {
    return this._campaigns.find((c) => c.id === id) ?? null;
  }

  /** Re-read campaigns from persistence. */
  reload(): void {
    this._campaigns = loadImportedCampaigns();
  }

  // ── Campaign CRUD ────────────────────────────────────────────────────────────

  /** Create a new campaign, persist it, and return it. */
  createCampaign(name: string, author: string): CampaignDef {
    const campaign: CampaignDef = {
      id: generateCampaignId(),
      name: name.trim(),
      author: author.trim(),
      chapters: [],
      lastUpdated: new Date().toISOString(),
    };
    this._campaigns.push(campaign);
    this.save();
    return campaign;
  }

  /** Remove a campaign from the list and persist. */
  deleteCampaign(campaignId: string): void {
    this._campaigns = this._campaigns.filter((c) => c.id !== campaignId);
    this.save();
  }

  /**
   * Update a top-level campaign field, touch the timestamp, and persist.
   * Passing `false` for the `'official'` field removes the flag entirely.
   */
  updateCampaignField(
    campaign: CampaignDef,
    field: 'name' | 'author' | 'official',
    value: string | boolean,
  ): void {
    if (field === 'name') campaign.name = value as string;
    else if (field === 'author') campaign.author = value as string;
    else if (field === 'official') campaign.official = (value as boolean) ? true : undefined;
    this.touch(campaign);
    this.save();
  }

  /** Set the campaign's lastUpdated timestamp to the current time. */
  touch(campaign: CampaignDef): void {
    campaign.lastUpdated = new Date().toISOString();
  }

  /** Persist the current campaign list to storage. */
  save(): void {
    saveImportedCampaigns(this._campaigns);
  }

  // ── Chapter CRUD ─────────────────────────────────────────────────────────────

  /** Add a new chapter to a campaign, persist, and return it. */
  addChapter(campaign: CampaignDef, name: string): ChapterDef {
    const newId = campaign.chapters.reduce((mx, ch) => Math.max(mx, ch.id), 0) + 1;
    const chapter: ChapterDef = { id: newId, name: name.trim(), levels: [] };
    campaign.chapters.push(chapter);
    this.touch(campaign);
    this.save();
    return chapter;
  }

  /** Remove a chapter (and all its levels) from a campaign and persist. */
  deleteChapter(campaign: CampaignDef, chapterIdx: number): void {
    campaign.chapters.splice(chapterIdx, 1);
    this.touch(campaign);
    this.save();
  }

  /** Rename a chapter and persist. */
  renameChapter(campaign: CampaignDef, chapterIdx: number, name: string): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    chapter.name = name;
    this.touch(campaign);
    this.save();
  }

  /**
   * Move a chapter from `fromIdx` to `toIdx` (shifting others as needed)
   * and persist.
   */
  reorderChapters(campaign: CampaignDef, fromIdx: number, toIdx: number): void {
    const chapters = campaign.chapters;
    if (
      fromIdx < 0 || fromIdx >= chapters.length ||
      toIdx   < 0 || toIdx   >= chapters.length
    ) return;
    const [moved] = chapters.splice(fromIdx, 1);
    chapters.splice(toIdx, 0, moved);
    this.touch(campaign);
    this.save();
  }

  // ── Level CRUD ───────────────────────────────────────────────────────────────

  /** Add a new blank 6×6 level to a chapter, persist, and return it. */
  addLevel(campaign: CampaignDef, chapterIdx: number, name: string): LevelDef {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) throw new Error(`Chapter index ${chapterIdx} does not exist.`);
    const grid: (TileDef | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null) as null[]);
    const newLevel: LevelDef = {
      id: generateLevelId(),
      name: name.trim(),
      rows: 6,
      cols: 6,
      grid,
      inventory: [],
    };
    chapter.levels.push(newLevel);
    this.touch(campaign);
    this.save();
    return newLevel;
  }

  /** Remove a level from a chapter and persist. */
  deleteLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    chapter.levels.splice(levelIdx, 1);
    this.touch(campaign);
    this.save();
  }

  /**
   * Deep-clone a level with a new ID, insert it after the original, and persist.
   * Returns the new level.
   */
  duplicateLevel(campaign: CampaignDef, chapterIdx: number, levelIdx: number): LevelDef {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) throw new Error(`Chapter index ${chapterIdx} does not exist.`);
    const level = chapter.levels[levelIdx];
    if (!level) throw new Error(`Level index ${levelIdx} does not exist.`);
    const copy: LevelDef = {
      ...(structuredClone(level) as LevelDef),
      id: generateLevelId(),
      name: `${level.name} (copy)`,
    };
    chapter.levels.splice(levelIdx + 1, 0, copy);
    this.touch(campaign);
    this.save();
    return copy;
  }

  /**
   * Move a level from one chapter/position to another and persist.
   * The level is appended to the end of the target chapter if `toLevel` exceeds
   * the target chapter's level count.
   */
  moveLevel(
    campaign: CampaignDef,
    fromChapter: number,
    fromLevel: number,
    toChapter: number,
    toLevel: number,
  ): void {
    const srcChapter = campaign.chapters[fromChapter];
    const dstChapter = campaign.chapters[toChapter];
    if (!srcChapter || !dstChapter) return;
    const [movedLevel] = srcChapter.levels.splice(fromLevel, 1);
    if (movedLevel === undefined) return;
    const insertIdx = Math.min(toLevel, dstChapter.levels.length);
    dstChapter.levels.splice(insertIdx, 0, movedLevel);
    this.touch(campaign);
    this.save();
  }

  /**
   * Save a built LevelDef back into the campaign.
   * When updating an existing level, clears stored star/water records so the
   * player must replay the new version to set a new score, then persists.
   */
  saveLevel(
    campaign: CampaignDef,
    chapterIdx: number,
    levelIdx: number,
    levelDef: LevelDef,
  ): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    if (levelIdx >= 0 && levelIdx < chapter.levels.length) {
      clearLevelStarRecord(levelDef.id, campaign.id);
      clearLevelWaterRecord(levelDef.id, campaign.id);
      chapter.levels[levelIdx] = levelDef;
    } else {
      chapter.levels.push(levelDef);
    }
    this.touch(campaign);
    this.save();
  }

  /**
   * Move a level within its chapter from `fromIdx` to `toIdx` and persist.
   */
  reorderLevels(
    campaign: CampaignDef,
    chapterIdx: number,
    fromIdx: number,
    toIdx: number,
  ): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    const levels = chapter.levels;
    if (
      fromIdx < 0 || fromIdx >= levels.length ||
      toIdx   < 0 || toIdx   >= levels.length
    ) return;
    const [moved] = levels.splice(fromIdx, 1);
    levels.splice(toIdx, 0, moved);
    if (chapter.grid) {
      for (const row of chapter.grid) {
        for (const tile of row) {
          if (tile?.shape === PipeShape.Chamber && tile.chamberContent === 'level' && tile.levelIdx !== undefined) {
            const i = tile.levelIdx;
            if (i === fromIdx) {
              tile.levelIdx = toIdx;
            } else if (fromIdx < toIdx && i > fromIdx && i <= toIdx) {
              tile.levelIdx = i - 1;
            } else if (fromIdx > toIdx && i >= toIdx && i < fromIdx) {
              tile.levelIdx = i + 1;
            }
          }
        }
      }
    }
    this.touch(campaign);
    this.save();
  }

  // ── Import / Export ──────────────────────────────────────────────────────────

  /**
   * Deep-clone a campaign, strip unrecognized fields via {@link scanData},
   * and return the resulting JSON string.
   */
  exportToJson(campaign: CampaignDef): string {
    const clean = structuredClone(campaign) as CampaignDef;
    this.scanData(clean, false);
    return JSON.stringify(clean, null, 2);
  }

  /**
   * Parse a JSON string as a campaign, validate it, detect conflicts with the
   * current library, and return an {@link ImportResult}.
   *
   * @throws {Error} If the JSON is malformed or the campaign format is invalid.
   */
  parseImport(json: string): ImportResult {
    const data = migrateCampaign(JSON.parse(json) as CampaignDef);
    if (!data.id || !data.name || !Array.isArray(data.chapters)) {
      throw new Error('Invalid campaign file format.');
    }
    // Silently remap the reserved "official" ID to avoid collision with the
    // built-in official campaign.
    if (data.id === 'official') {
      data.id = generateCampaignId();
    }
    // Strip the official flag so imported campaigns never gain read-only status
    // automatically.
    if (data.official) {
      data.official = undefined;
    }
    const existingIdx = this._campaigns.findIndex((c) => c.id === data.id);
    if (existingIdx !== -1) {
      const existing = this._campaigns[existingIdx];
      const existingTime = existing.lastUpdated ? new Date(existing.lastUpdated).getTime() : 0;
      const importedTime = data.lastUpdated   ? new Date(data.lastUpdated).getTime()   : 0;
      if (existingTime === importedTime) {
        return { campaign: data, conflict: 'same_version', existing };
      }
      const isNewer = importedTime > existingTime;
      return { campaign: data, conflict: 'version_conflict', existing, isNewer };
    }
    return { campaign: data, conflict: 'none' };
  }

  /**
   * Add or replace the campaign described by `result` and persist.
   * Call this only after the user has confirmed the import.
   */
  acceptImport(result: ImportResult): void {
    const { campaign } = result;
    const existingIdx = this._campaigns.findIndex((c) => c.id === campaign.id);
    if (existingIdx !== -1) {
      this._campaigns[existingIdx] = campaign;
    } else {
      this._campaigns.push(campaign);
    }
    this.save();
  }

  // ── Data validation ──────────────────────────────────────────────────────────

  /**
   * Scan a campaign for unrecognized field names, optionally removing them
   * in place (clean-up pass when `dryRun` is false).
   *
   * @param campaign  The campaign to scan (mutated when `dryRun` is false).
   * @param dryRun    When true, only tallies issues without modifying data.
   * @returns Map from record-type label → Map of `{ fieldName → count }`.
   */
  scanData(
    campaign: CampaignDef,
    dryRun: boolean,
  ): Map<string, Map<string, number>> {
    const issues = new Map<string, Map<string, number>>();

    const tally = (recordType: string, field: string): void => {
      if (!issues.has(recordType)) issues.set(recordType, new Map());
      const m = issues.get(recordType)!;
      m.set(field, (m.get(field) ?? 0) + 1);
    };

    const checkKeys = (
      obj: Record<string, unknown>,
      validKeys: ReadonlySet<string>,
      recordType: string,
    ): void => {
      for (const key of Object.keys(obj)) {
        if (!validKeys.has(key)) {
          tally(recordType, key);
          if (!dryRun) delete obj[key];
        }
      }
    };

    checkKeys(campaign as unknown as Record<string, unknown>, VALID_CAMPAIGN_KEYS, 'Campaign');

    for (const chapter of campaign.chapters) {
      checkKeys(chapter as unknown as Record<string, unknown>, VALID_CHAPTER_KEYS, 'Chapter');

      if (chapter.grid) {
        for (const row of chapter.grid) {
          for (const tile of row) {
            if (!tile) continue;
            checkKeys(
              tile as unknown as Record<string, unknown>,
              getValidChapterMapTileDefKeys(tile),
              'ChapterMapTile',
            );
          }
        }
      }

      for (const level of chapter.levels) {
        checkKeys(level as unknown as Record<string, unknown>, VALID_LEVEL_KEYS, 'Level');

        for (const row of level.grid) {
          for (const tile of row) {
            if (!tile) continue;
            checkKeys(
              tile as unknown as Record<string, unknown>,
              getValidTileDefKeys(tile),
              'Tile',
            );
          }
        }

        for (const item of level.inventory) {
          checkKeys(
            item as unknown as Record<string, unknown>,
            VALID_INVENTORY_ITEM_KEYS,
            'InventoryItem',
          );
        }
      }
    }

    return issues;
  }
}
