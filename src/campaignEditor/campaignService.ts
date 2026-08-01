/**
 * CampaignService – pure data-operations service for campaign/chapter/level CRUD,
 * persistence, import/export, and validation.  Has no DOM dependencies.
 *
 * Design principle: CampaignService does the work; CampaignEditor asks the user
 * (prompt/confirm dialogs) and tells CampaignService what to do.
 */

import type { CampaignDef, ChapterDef, LevelDef, LocalizedText, TileDef} from '../types';
import { PipeShape, Direction, LEVEL_STYLES } from '../types';
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
  getValidCampaignMapTileDefKeys,
} from './types';
import { FILE_TYPE_CAMPAIGN, FILE_TYPE_CAMPAIGN_TEXT_PACK, FILE_TYPE_PLAYER } from '../profile/playerProfile';
import { generateGuid } from '../profile/playerProfileSlots';
import { resolveLocalizedText, writeLocalizedText, isLocalizedTextShape } from '../campaignLocalization';

/**
 * Locate a level inside a campaign and return its 1-based chapter/level numbers.
 * Returns null when the level ID is not found.
 */
export function findLevelLocation(
  campaign: CampaignDef,
  levelId: number,
): { chapterNumber: number; levelNumber: number } | null {
  for (let chapterIndex = 0; chapterIndex < campaign.chapters.length; chapterIndex++) {
    const levelIndex = campaign.chapters[chapterIndex].levels.findIndex((level) => level.id === levelId);
    if (levelIndex >= 0) {
      return { chapterNumber: chapterIndex + 1, levelNumber: levelIndex + 1 };
    }
  }
  return null;
}

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

// ─── Text-pack (translation-only) import/export ────────────────────────────────

/** A single level's text fields within a {@link CampaignTextPack}. */
export interface TextPackLevel {
  id: number;
  name: string;
  note?: string;
  hints?: string[];
}

/** A single chapter's text fields within a {@link CampaignTextPack}. */
export interface TextPackChapter {
  id: number;
  name: string;
  levels: TextPackLevel[];
}

/**
 * A locale-scoped, ID-scaffolded "text pack" — the shape produced by
 * {@link CampaignService.exportTextPack} and consumed by
 * {@link CampaignService.mergeTextPack}. Carries only the 5 translatable text
 * fields plus enough IDs to relink onto a matching local campaign; no grid,
 * tile, or inventory data. `author` is never included — it isn't localized.
 */
export interface CampaignTextPack {
  campaignGuid: string;
  locale: string;
  campaign: { name: string };
  chapters: TextPackChapter[];
}

/** Summary of what a {@link CampaignService.mergeTextPack} call actually did. */
export interface TextPackMergeResult {
  campaign: CampaignDef;
  locale: string;
  added: number;
  skipped: number;
  overwritten: number;
  unmatchedNodes: number;
}

// ─── CampaignService ──────────────────────────────────────────────────────────

export class CampaignService {
  private _campaigns: CampaignDef[];
  private static readonly CAMPAIGN_DEFAULT_ROWS = 3;
  private static readonly CAMPAIGN_DEFAULT_COLS = 6;

  constructor(campaigns?: CampaignDef[]) {
    this._campaigns = campaigns ?? loadImportedCampaigns();
  }

  private _buildDefaultCampaignMap(): Pick<CampaignDef, 'rows' | 'cols' | 'grid'> {
    const rows = CampaignService.CAMPAIGN_DEFAULT_ROWS;
    const cols = CampaignService.CAMPAIGN_DEFAULT_COLS;
    const grid: (TileDef | null)[][] = Array.from(
      { length: rows },
      () => Array(cols).fill(null) as null[],
    );
    grid[1][0] = { shape: PipeShape.Source, capacity: 10, connections: [Direction.East] };
    grid[1][cols - 1] = { shape: PipeShape.Sink, connections: [Direction.West] };
    return { rows, cols, grid };
  }

  private _hasUsableCampaignMap(campaign: CampaignDef): boolean {
    const rows = campaign.rows;
    const cols = campaign.cols;
    const grid = campaign.grid;

    if (
      typeof rows !== 'number' || typeof cols !== 'number' ||
      !Number.isInteger(rows) || !Number.isInteger(cols) ||
      rows <= 0 || cols <= 0 ||
      !Array.isArray(grid) || grid.length !== rows
    ) {
      return false;
    }

    return grid.every((row) => Array.isArray(row) && row.length === cols);
  }

  private _remapChapterRefsOnCampaignDelete(campaign: CampaignDef, deletedChapterIdx: number): void {
    if (!campaign.grid) return;
    for (const row of campaign.grid) {
      for (const [col, tile] of row.entries()) {
        if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'chapter' || tile.chapterIdx === undefined) continue;
        if (tile.chapterIdx === deletedChapterIdx) {
          row[col] = null;
        } else if (tile.chapterIdx > deletedChapterIdx) {
          tile.chapterIdx -= 1;
        }
      }
    }
  }

  private _remapChapterRefsOnCampaignReorder(campaign: CampaignDef, fromIdx: number, toIdx: number): void {
    if (!campaign.grid) return;
    for (const row of campaign.grid) {
      for (const tile of row) {
        if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'chapter' || tile.chapterIdx === undefined) continue;
        const i = tile.chapterIdx;
        if (i === fromIdx) {
          tile.chapterIdx = toIdx;
        } else if (fromIdx < toIdx && i > fromIdx && i <= toIdx) {
          tile.chapterIdx = i - 1;
        } else if (fromIdx > toIdx && i >= toIdx && i < fromIdx) {
          tile.chapterIdx = i + 1;
        }
      }
    }
  }

  private _remapLevelRefsOnDelete(chapter: ChapterDef, deletedLevelIdx: number): void {
    if (!chapter.grid) return;
    for (const row of chapter.grid) {
      for (const [col, tile] of row.entries()) {
        if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'level' || tile.levelIdx === undefined) continue;
        if (tile.levelIdx === deletedLevelIdx) {
          row[col] = null;
        } else if (tile.levelIdx > deletedLevelIdx) {
          tile.levelIdx -= 1;
        }
      }
    }
  }

  private _remapLevelRefsOnInsert(chapter: ChapterDef, insertIdx: number): void {
    if (!chapter.grid) return;
    for (const row of chapter.grid) {
      for (const tile of row) {
        if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'level' || tile.levelIdx === undefined) continue;
        if (tile.levelIdx >= insertIdx) {
          tile.levelIdx += 1;
        }
      }
    }
  }

  private _remapLevelRefsOnReorder(chapter: ChapterDef, fromIdx: number, toIdx: number): void {
    if (!chapter.grid) return;
    for (const row of chapter.grid) {
      for (const tile of row) {
        if (tile?.shape !== PipeShape.Chamber || tile.chamberContent !== 'level' || tile.levelIdx === undefined) continue;
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

  /** Ensure every campaign has at least a default empty campaign map. */
  ensureCampaignMaps(): boolean {
    let changed = false;
    for (const campaign of this._campaigns) {
      if (this._hasUsableCampaignMap(campaign)) continue;
      const defaults = this._buildDefaultCampaignMap();
      campaign.rows = defaults.rows;
      campaign.cols = defaults.cols;
      campaign.grid = defaults.grid;
      this.touch(campaign);
      changed = true;
    }
    if (changed) this.save();
    return changed;
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

  /** Find a campaign by its stable cross-install `guid`, or null if not found. */
  getCampaignByGuid(guid: string): CampaignDef | null {
    return this._campaigns.find((c) => c.guid === guid) ?? null;
  }

  /**
   * Find the local campaign that represents the same campaign as `data` (a
   * parsed/imported CampaignDef-shaped record), for import conflict
   * detection. Prefers guid equality when both sides have a guid — the
   * robust, collision-resistant check also used by the text-pack import
   * path (see mergeTextPack). Falls back to id equality when either side
   * lacks a guid (reproducing prior behavior for campaigns/files that
   * predate the guid field), but NOT when both sides have a guid and it
   * differs: that's a definitive "different campaign" signal that a mere id
   * coincidence must not override. Returns the array index, or -1 if none
   * match.
   */
  private _findMatchingCampaignIndex(data: { id: string; guid?: string }): number {
    if (data.guid) {
      const byGuid = this._campaigns.findIndex((c) => c.guid !== undefined && c.guid === data.guid);
      if (byGuid !== -1) return byGuid;
    }
    const byId = this._campaigns.findIndex((c) => c.id === data.id);
    if (byId === -1) return -1;
    const candidate = this._campaigns[byId];
    if (data.guid && candidate.guid && candidate.guid !== data.guid) return -1;
    return byId;
  }

  /**
   * Ensure `campaign.guid` is set, lazily backfilling it (and persisting the
   * change) for campaigns created before this field existed. Called before
   * any export that needs a stable cross-install identifier.
   */
  private _ensureGuid(campaign: CampaignDef): string {
    if (!campaign.guid) {
      campaign.guid = generateGuid();
      this.touch(campaign);
      this.save();
    }
    return campaign.guid;
  }

  /** Re-read campaigns from persistence. */
  reload(): void {
    this._campaigns = loadImportedCampaigns();
  }

  // ── Campaign CRUD ────────────────────────────────────────────────────────────

  /** Create a new campaign, persist it, and return it. */
  createCampaign(name: string | LocalizedText, author: string, authorGuid?: string): CampaignDef {
    const defaults = this._buildDefaultCampaignMap();
    const campaign: CampaignDef = {
      id: generateCampaignId(),
      guid: generateGuid(),
      name: typeof name === 'string' ? name.trim() : name,
      author: author.trim(),
      chapters: [],
      rows: defaults.rows,
      cols: defaults.cols,
      grid: defaults.grid,
      lastUpdated: new Date().toISOString(),
    };
    if (authorGuid) campaign.authorGuid = authorGuid;
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
   * Passing `false` for the `'official'` or `'anyoneEdit'` field removes the
   * flag entirely.
   */
  updateCampaignField(
    campaign: CampaignDef,
    field: 'name' | 'author' | 'official' | 'authorGuid' | 'anyoneEdit',
    value: string | LocalizedText | boolean | undefined,
  ): void {
    if (field === 'name') campaign.name = value as string | LocalizedText;
    else if (field === 'author') campaign.author = value as string;
    else if (field === 'official') campaign.official = (value as boolean) ? true : undefined;
    else if (field === 'authorGuid') campaign.authorGuid = value as string | undefined;
    else if (field === 'anyoneEdit') campaign.anyoneEdit = (value as boolean) ? true : undefined;
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
  addChapter(campaign: CampaignDef, name: string | LocalizedText): ChapterDef {
    const newId = campaign.chapters.reduce((mx, ch) => Math.max(mx, ch.id), 0) + 1;
    const chapter: ChapterDef = { id: newId, name: typeof name === 'string' ? name.trim() : name, levels: [] };
    campaign.chapters.push(chapter);
    this.touch(campaign);
    this.save();
    return chapter;
  }

  /** Remove a chapter (and all its levels) from a campaign and persist. */
  deleteChapter(campaign: CampaignDef, chapterIdx: number): void {
    campaign.chapters.splice(chapterIdx, 1);
    this._remapChapterRefsOnCampaignDelete(campaign, chapterIdx);
    this.touch(campaign);
    this.save();
  }

  /** Rename a chapter and persist. */
  renameChapter(campaign: CampaignDef, chapterIdx: number, name: string | LocalizedText): void {
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
    this._remapChapterRefsOnCampaignReorder(campaign, fromIdx, toIdx);
    this.touch(campaign);
    this.save();
  }

  // ── Level CRUD ───────────────────────────────────────────────────────────────

  /** Add a new blank 6×6 level to a chapter, persist, and return it. */
  addLevel(campaign: CampaignDef, chapterIdx: number, name: string | LocalizedText): LevelDef {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) throw new Error(`Chapter index ${chapterIdx} does not exist.`);
    const grid: (TileDef | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null) as null[]);
    const newLevel: LevelDef = {
      id: generateLevelId(),
      name: typeof name === 'string' ? name.trim() : name,
      rows: 6,
      cols: 6,
      grid,
      inventory: [],
    };
    if (chapter.style !== undefined) newLevel.style = chapter.style;
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
    this._remapLevelRefsOnDelete(chapter, levelIdx);
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
      ...(structuredClone(level)),
      id: generateLevelId(),
      name: typeof level.name === 'string'
        ? `${level.name} (copy)`
        : Object.fromEntries(Object.entries(level.name).map(([loc, text]) => [loc, `${text} (copy)`])),
    };
    this._remapLevelRefsOnInsert(chapter, levelIdx + 1);
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
    if (srcChapter === dstChapter) {
      this._remapLevelRefsOnReorder(srcChapter, fromLevel, insertIdx);
    } else {
      this._remapLevelRefsOnDelete(srcChapter, fromLevel);
      this._remapLevelRefsOnInsert(dstChapter, insertIdx);
    }
    dstChapter.levels.splice(insertIdx, 0, movedLevel);
    this.touch(campaign);
    this.save();
  }

  /**
   * Save a built LevelDef back into the campaign.
   * When updating an existing level and `clearRecords` is true (the default),
   * clears stored star/water records so the player must replay the new version
   * to set a new score.  Pass `clearRecords: false` when saving as a side-effect
   * of an operation (e.g. Playtest) that should not invalidate prior progress.
   */
  saveLevel(
    campaign: CampaignDef,
    chapterIdx: number,
    levelIdx: number,
    levelDef: LevelDef,
    options?: { clearRecords?: boolean },
  ): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter) return;
    if (levelIdx >= 0 && levelIdx < chapter.levels.length) {
      if (options?.clearRecords !== false) {
        clearLevelStarRecord(levelDef.id, campaign.id);
        clearLevelWaterRecord(levelDef.id, campaign.id);
      }
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
    this._remapLevelRefsOnReorder(chapter, fromIdx, toIdx);
    this.touch(campaign);
    this.save();
  }

  // ── Import / Export ──────────────────────────────────────────────────────────

  /**
   * Deep-clone a campaign, strip unrecognized fields via {@link scanData},
   * prepend the campaign file-type identifier, and return the resulting JSON string.
   */
  exportToJson(campaign: CampaignDef): string {
    this._ensureGuid(campaign);
    const clean = structuredClone(campaign);
    this.scanData(clean, false);
    // Add the type identifier AFTER scanData so it is never stripped.
    const envelope = { type: FILE_TYPE_CAMPAIGN, ...clean };
    return JSON.stringify(envelope, null, 2);
  }

  /**
   * Parse a JSON string as a campaign, validate it, detect conflicts with the
   * current library, and return an {@link ImportResult}.
   *
   * If the JSON contains a `type` field it is enforced: the file must declare
   * {@link FILE_TYPE_CAMPAIGN}.  Files without a `type` field are accepted for
   * backward-compatibility with exports produced before this check was added.
   *
   * @throws {Error} If the JSON is malformed, the type is wrong, or the
   *   campaign format is invalid.
   */
  parseImport(json: string): ImportResult {
    const raw = JSON.parse(json) as Record<string, unknown>;

    // Enforce the type identifier when it is present.
    if ('type' in raw) {
      if (raw['type'] !== FILE_TYPE_CAMPAIGN) {
        const got = raw['type'] === FILE_TYPE_PLAYER
          ? 'a player profile'
          : `"${String(raw['type'])}"`;
        throw new Error(
          `Wrong file type: expected a campaign file, got ${got}. ` +
          'Use "Import Progress" in the main menu to import player profiles.',
        );
      }
      // Remove the envelope key before treating the object as a CampaignDef.
      delete raw['type'];
    }

    if (
      typeof raw['id'] !== 'string'
      || !isLocalizedTextShape(raw['name'])
      || !Array.isArray(raw['chapters'])
    ) {
      throw new Error('Invalid campaign file format.');
    }
    const data = migrateCampaign(raw as unknown as CampaignDef);
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
    const existingIdx = this._findMatchingCampaignIndex(data);
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
    const existingIdx = this._findMatchingCampaignIndex(campaign);
    if (existingIdx !== -1) {
      const existing = this._campaigns[existingIdx];
      // Matched via guid but the id drifted (e.g. a hand-edited file, or two
      // installs that diverged before ever syncing) — keep the local id so
      // progress/star/water records keyed under it stay attached.
      if (existing.guid && campaign.guid === existing.guid && campaign.id !== existing.id) {
        campaign.id = existing.id;
      }
      this._campaigns[existingIdx] = campaign;
    } else {
      this._campaigns.push(campaign);
    }
    this.save();
  }

  // ── Text-pack (translation-only) import/export ───────────────────────────────

  /**
   * Build a locale-scoped "text pack": just the campaign's guid, IDs, and its
   * 5 translatable text fields (resolved for `locale` via the standard
   * fallback chain, so untranslated fields pre-fill with the best available
   * source text). No grid/tile/inventory data. Backfills `campaign.guid` if
   * missing. Always plain JSON (never gzip) — meant to be hand-edited.
   */
  exportTextPack(campaign: CampaignDef, locale: string): string {
    const campaignGuid = this._ensureGuid(campaign);
    const pack: CampaignTextPack = {
      campaignGuid,
      locale,
      campaign: { name: resolveLocalizedText(campaign.name, locale) },
      chapters: campaign.chapters.map((chapter) => ({
        id: chapter.id,
        name: resolveLocalizedText(chapter.name, locale),
        levels: chapter.levels.map((level) => {
          const textLevel: TextPackLevel = {
            id: level.id,
            name: resolveLocalizedText(level.name, locale),
          };
          if (level.note !== undefined) textLevel.note = resolveLocalizedText(level.note, locale);
          if (level.hints !== undefined) {
            textLevel.hints = level.hints.map((hint) => resolveLocalizedText(hint, locale));
          }
          return textLevel;
        }),
      })),
    };
    return JSON.stringify({ type: FILE_TYPE_CAMPAIGN_TEXT_PACK, ...pack }, null, 2);
  }

  /**
   * Parse a JSON string as a {@link CampaignTextPack}.
   * @throws {Error} If the JSON is malformed, the type is wrong, or the shape is invalid.
   */
  parseTextPack(json: string): CampaignTextPack {
    const raw = JSON.parse(json) as Record<string, unknown>;
    if (raw['type'] !== FILE_TYPE_CAMPAIGN_TEXT_PACK) {
      throw new Error('Wrong file type: expected a campaign text-pack file.');
    }
    if (
      typeof raw['campaignGuid'] !== 'string'
      || typeof raw['locale'] !== 'string'
      || !Array.isArray(raw['chapters'])
    ) {
      throw new Error('Invalid campaign text-pack file format.');
    }
    delete raw['type'];
    return raw as unknown as CampaignTextPack;
  }

  /**
   * Merge a text pack into the local campaign it references (matched by
   * `pack.campaignGuid`, never by the local `id`). By default, only adds text
   * for locale slices that aren't already present anywhere in the matched
   * fields — it can never overwrite existing translations. Pass
   * `overwrite: true` to replace existing values for `pack.locale` instead.
   *
   * Chapters/levels referenced by the pack that no longer exist locally are
   * skipped (not a hard failure); only a missing *campaign* aborts the merge
   * entirely, since translators' packs can go stale after a campaign edit.
   *
   * @throws {Error} If no local campaign has a matching `guid`.
   */
  mergeTextPack(pack: CampaignTextPack, options?: { overwrite?: boolean }): TextPackMergeResult {
    const campaign = this.getCampaignByGuid(pack.campaignGuid);
    if (!campaign) {
      throw new Error('No local campaign matches this text pack. It may belong to a different installation.');
    }
    const overwrite = options?.overwrite === true;
    const result: TextPackMergeResult = { campaign, locale: pack.locale, added: 0, skipped: 0, overwritten: 0, unmatchedNodes: 0 };

    const mergeField = (
      current: string | LocalizedText | undefined,
      packValue: string,
    ): string | LocalizedText | undefined => {
      const alreadyPresent = typeof current === 'object' && current[pack.locale] !== undefined;
      if (alreadyPresent && !overwrite) {
        result.skipped++;
        return current;
      }
      if (alreadyPresent) result.overwritten++;
      else result.added++;
      return writeLocalizedText(current, pack.locale, packValue);
    };

    campaign.name = mergeField(campaign.name, pack.campaign.name) ?? campaign.name;

    for (const packChapter of pack.chapters) {
      const chapter = campaign.chapters.find((c) => c.id === packChapter.id);
      if (!chapter) { result.unmatchedNodes++; continue; }
      chapter.name = mergeField(chapter.name, packChapter.name) ?? chapter.name;

      for (const packLevel of packChapter.levels) {
        const level = chapter.levels.find((l) => l.id === packLevel.id);
        if (!level) { result.unmatchedNodes++; continue; }
        level.name = mergeField(level.name, packLevel.name) ?? level.name;
        if (packLevel.note !== undefined) {
          level.note = mergeField(level.note, packLevel.note);
        }
        if (packLevel.hints !== undefined && level.hints !== undefined) {
          const count = Math.min(packLevel.hints.length, level.hints.length);
          for (let i = 0; i < count; i++) {
            level.hints[i] = mergeField(level.hints[i], packLevel.hints[i]) ?? level.hints[i];
          }
        }
      }
    }

    this.touch(campaign);
    this.save();
    return result;
  }

  // ── Data validation ──────────────────────────────────────────────────────────

  /**
   * Remap legacy 'Grass' style values to 'Summer' across campaign, chapter,
   * and level style fields.
   *
   * @returns true when at least one style value was remapped.
   */
  remapLegacyGrassStyles(campaign: CampaignDef): boolean {
    let changed = false;
    const remapStyle = (obj: Record<string, unknown>): void => {
      if (obj['style'] === 'Grass') {
        obj['style'] = 'Summer';
        changed = true;
      }
    };
    remapStyle(campaign as unknown as Record<string, unknown>);
    for (const chapter of campaign.chapters) {
      remapStyle(chapter as unknown as Record<string, unknown>);
      for (const level of chapter.levels) {
        remapStyle(level as unknown as Record<string, unknown>);
      }
    }
    return changed;
  }

  /**
   * Scan a campaign for unrecognized field names, optionally removing them
   * in place (clean-up pass when `dryRun` is false).
   * Also corrects legacy style/tile values:
   *   - style 'Grass' → 'Summer'
   *   - style 'Dirt' → 'Fall'
   *   - tile shape 'EMPTY_DIRT' → 'EMPTY_FALL'
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
      let m = issues.get(recordType);
      if (!m) { m = new Map(); issues.set(recordType, m); }
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

    /** Check and fix a style field on a record. */
    const checkStyle = (obj: Record<string, unknown>, recordType: string): void => {
      const style = obj['style'];
      if (style === undefined) return;
      if (style === 'Grass') {
        tally(recordType, 'style:Grass→Summer');
        if (!dryRun) obj['style'] = 'Summer';
      } else if (style === 'Dirt') {
        tally(recordType, 'style:Dirt→Fall');
        if (!dryRun) obj['style'] = 'Fall';
      } else if (typeof style === 'string' && !LEVEL_STYLES.has(style as never)) {
        tally(recordType, `style:${style}`);
        if (!dryRun) delete obj['style'];
      }
    };

    /** Check and fix tile shape fields that contain legacy values. */
    const checkTileShape = (tile: Record<string, unknown>, recordType: string): void => {
      if (tile['shape'] === 'EMPTY_DIRT') {
        tally(recordType, 'shape:EMPTY_DIRT→EMPTY_FALL');
        if (!dryRun) tile['shape'] = 'EMPTY_FALL';
      }
    };

    checkKeys(campaign as unknown as Record<string, unknown>, VALID_CAMPAIGN_KEYS, 'Campaign');
    checkStyle(campaign as unknown as Record<string, unknown>, 'Campaign');

    if (campaign.grid) {
      for (const row of campaign.grid) {
        for (const tile of row) {
          if (!tile) continue;
          const tileRec = tile as unknown as Record<string, unknown>;
          checkKeys(tileRec, getValidCampaignMapTileDefKeys(tile), 'CampaignMapTile');
          checkTileShape(tileRec, 'CampaignMapTile');
        }
      }
    }

    for (const chapter of campaign.chapters) {
      checkKeys(chapter as unknown as Record<string, unknown>, VALID_CHAPTER_KEYS, 'Chapter');
      checkStyle(chapter as unknown as Record<string, unknown>, 'Chapter');

      if (chapter.grid) {
        for (const row of chapter.grid) {
          for (const tile of row) {
            if (!tile) continue;
            const tileRec = tile as unknown as Record<string, unknown>;
            checkKeys(tileRec, getValidChapterMapTileDefKeys(tile), 'ChapterMapTile');
            checkTileShape(tileRec, 'ChapterMapTile');
          }
        }
      }

      for (const level of chapter.levels) {
        checkKeys(level as unknown as Record<string, unknown>, VALID_LEVEL_KEYS, 'Level');
        checkStyle(level as unknown as Record<string, unknown>, 'Level');

        for (const row of level.grid) {
          for (const tile of row) {
            if (!tile) continue;
            const tileRec = tile as unknown as Record<string, unknown>;
            checkKeys(tileRec, getValidTileDefKeys(tile), 'Tile');
            checkTileShape(tileRec, 'Tile');
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
