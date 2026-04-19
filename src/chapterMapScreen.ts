/**
 * Chapter map screen – the in-game overlay that displays a chapter's map
 * (grid of pipe connections between level chambers) and allows the player
 * to select a level to play.
 *
 * ChapterMapScreen is a thin subclass of MapScreenBase that wires the
 * ChapterMapCallbacks interface to the abstract methods.
 */

import { ChapterDef, CampaignDef, LevelDef, TileDef } from './types';
import { loadLevelStars, loadLevelWater } from './persistence';
import { MapScreenBase } from './mapScreenBase';

export { MAP_VIEW_MAX_COLS, MAP_VIEW_MAX_ROWS } from './mapScreenBase';

/** Callbacks that the chapter map screen uses to interact with the rest of the game. */
export interface ChapterMapCallbacks {
  /** Returns the current display progress (completed level IDs). */
  getDisplayProgress(): Set<number>;
  /** Returns the active campaign's ID (used for star loading), or null. */
  getActiveCampaignId(): string | null;
  /** Called when the player presses the "← Level Select" back button. */
  onShowLevelSelect(): void;
  /** Called when the player clicks an accessible level chamber. */
  onLevelSelected(levelDef: LevelDef): void;
  /** Optional override for the chapter title text in the screen header. Return null to hide it. */
  formatChapterTitle?(campaign: CampaignDef, chapterIdx: number, chapter: ChapterDef): string | null;
  /** Optional override for the top stats-line text. Return undefined to use the default chapter stats. */
  formatStatsText?(chapter: ChapterDef, displayProgress: Set<number>): string | undefined;
  /** Optional predicate controlling whether the bottom completion status line is shown. */
  shouldShowCompletionStatus?(chapter: ChapterDef, displayProgress: Set<number>): boolean;
  /** Optional completion predicate override used by completion-dependent effects (e.g., flow drops). */
  isMapCompleted?(chapter: ChapterDef, displayProgress: Set<number>): boolean;
  /** Optional mastery predicate override used by mastery visual effects (e.g., edge flowers, gold border). */
  isMastered?(chapter: ChapterDef, displayProgress: Set<number>): boolean;
  /** Returns the active campaign def, or null. */
  getActiveCampaign?(): CampaignDef | null;
  /** Returns the set of completed chapter IDs. */
  getCompletedChapters?(): Set<number>;
  /** Optional override for the back button text. */
  formatBackButtonText?(): string;
  /**
   * Optional override for the instruction text shown below the map canvas.
   * Return null to use the default ("Click on an accessible level").
   */
  formatInstructionText?(): string | null;
  /**
   * Optional hook to augment the per-level star map before rendering.
   * Called with the raw stars loaded from persistence; return a new map that
   * may include additional synthetic entries (e.g. chapter-aggregated totals).
   */
  augmentLevelStars?(levelStars: Record<number, number>): Record<number, number>;
}

/**
 * Manages the chapter map screen overlay (DOM, canvas, and interaction).
 *
 * Lifecycle:
 *  1. Construct once (appends the screen element to `document.body`).
 *  2. Call `show(campaign, chapterIdx)` to display a chapter's map.
 *  3. Call `repopulate(campaign)` to rebuild the screen (e.g. after winning a level
 *     and returning to the chapter map without hiding/showing the screen).
 *  4. Use `screenEl` to show/hide the overlay from outside (e.g. during win-modal flow).
 */
export class ChapterMapScreen extends MapScreenBase {
  private readonly _callbacks: ChapterMapCallbacks;

  constructor(callbacks: ChapterMapCallbacks) {
    super();
    this._callbacks = callbacks;
  }

  protected _getDisplayProgress(): Set<number> {
    return this._callbacks.getDisplayProgress();
  }

  protected _getActiveCampaignId(): string | null {
    return this._callbacks.getActiveCampaignId();
  }

  protected _getCompletedChapters(): Set<number> | undefined {
    return this._callbacks.getCompletedChapters?.();
  }

  protected _onShowLevelSelect(): void {
    this._callbacks.onShowLevelSelect();
  }

  protected _onChamberSelected(_def: TileDef, chamberIdx: number): void {
    const levelDef = this._chapter?.levels[chamberIdx];
    if (levelDef) this._callbacks.onLevelSelected(levelDef);
  }

  protected _isChamberEntityCompleted(def: TileDef): boolean {
    if (def.chamberContent !== 'level' || def.levelIdx === undefined) return false;
    const levelId = this._chapter?.levels[def.levelIdx]?.id;
    return levelId !== undefined && this._getDisplayProgress().has(levelId);
  }

  protected _getChamberSnapNum(def: TileDef): number | null {
    if (def.chamberContent !== 'level' || def.levelIdx === undefined) return null;
    return def.levelIdx + 1;
  }

  protected _getEntityDefs(): LevelDef[] {
    return this._chapter?.levels ?? [];
  }

  protected _augmentLevelStars(levelStars: Record<number, number>): Record<number, number> {
    return this._callbacks.augmentLevelStars?.(levelStars) ?? levelStars;
  }

  protected _formatStatsText(chapter: ChapterDef, displayProgress: Set<number>): string | undefined {
    const custom = this._callbacks.formatStatsText?.(chapter, displayProgress);
    if (custom !== undefined) return custom;

    const completedChapters = this._callbacks.getCompletedChapters?.();
    const campaignId = this._callbacks.getActiveCampaignId();
    const levelWater = loadLevelWater(campaignId ?? undefined);
    const chapterLevelStars = loadLevelStars(campaignId ?? undefined);

    const chLevels = chapter.levels;
    const waterTotal = chLevels.reduce((sum, l) => sum + (displayProgress.has(l.id) ? (levelWater[l.id] ?? 0) : 0), 0);
    const starsCollected = chLevels.reduce((sum, l) => sum + Math.min(chapterLevelStars[l.id] ?? 0, l.starCount ?? 0), 0);
    const starsTotal = chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
    const challengesDone = chLevels.filter(l => l.challenge && displayProgress.has(l.id)).length;
    const challengesTotal = chLevels.filter(l => l.challenge).length;
    const isChapterCompleted = chapter.id !== undefined && completedChapters?.has(chapter.id);

    const parts: string[] = [];
    if (waterTotal > 0) parts.push(`💧 ${waterTotal}`);
    if (starsTotal > 0) parts.push(`⭐ ${starsCollected}/${starsTotal}`);
    if (challengesTotal > 0) parts.push(`💀 ${challengesDone}/${challengesTotal}`);
    if (isChapterCompleted) {
      const allLevelsCompleted = chLevels.every(l => displayProgress.has(l.id));
      const isMastered = allLevelsCompleted && (starsTotal === 0 || starsCollected >= starsTotal);
      parts.push(isMastered ? '🏆 Mastered!' : '✅ Complete');
    }

    return parts.join('  ');
  }

  protected _shouldShowCompletionStatus(chapter: ChapterDef, displayProgress: Set<number>): boolean {
    return this._callbacks.shouldShowCompletionStatus?.(chapter, displayProgress) !== false;
  }

  protected _isMapCompleted(chapter: ChapterDef, displayProgress: Set<number>): boolean {
    const customValue = this._callbacks.isMapCompleted?.(chapter, displayProgress);
    if (customValue !== undefined) return customValue;
    const completedChapters = this._getCompletedChapters();
    return chapter.id !== undefined && completedChapters?.has(chapter.id) === true;
  }

  protected _isMapMastered(chapter: ChapterDef, displayProgress: Set<number>): boolean {
    const customValue = this._callbacks.isMastered?.(chapter, displayProgress);
    if (customValue !== undefined) return customValue;
    const campaignId = this._callbacks.getActiveCampaignId();
    const chapterLevelStars = loadLevelStars(campaignId ?? undefined);
    const chLevels = chapter.levels;
    const allLevelsCompleted = chLevels.every(l => displayProgress.has(l.id));
    const starsCollected = chLevels.reduce((sum, l) => sum + Math.min(chapterLevelStars[l.id] ?? 0, l.starCount ?? 0), 0);
    const starsTotal = chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
    return allLevelsCompleted && (starsTotal === 0 || starsCollected >= starsTotal);
  }

  protected _formatBackButtonText(): string {
    return this._callbacks.formatBackButtonText?.() ?? '← Chapter Select';
  }

  protected _formatInstructionText(): string | null {
    return this._callbacks.formatInstructionText?.() ?? null;
  }

  protected _formatChapterTitle(campaign: CampaignDef, chapterIdx: number, chapter: ChapterDef): string | null | undefined {
    return this._callbacks.formatChapterTitle?.(campaign, chapterIdx, chapter);
  }
}
