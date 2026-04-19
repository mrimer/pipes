import { CampaignDef, ChapterDef, LevelDef, PipeShape, TileDef } from './types';
import { ChapterMapCallbacks, ChapterMapScreen } from './chapterMapScreen';
import { ChapterMapSnapshot } from './levelTransition';
import { loadLevelStars, loadLevelWater } from './persistence';

export interface CampaignMapCallbacks {
  getCompletedChapters(): Set<number>;
  getCompletedLevels(): Set<number>;
  getActiveCampaignId(): string | null;
  onShowLevelSelect(): void;
  onChapterSelected(chapterIdx: number): void;
}

export class CampaignMapScreen {
  readonly screenEl: HTMLElement;
  private readonly _inner: ChapterMapScreen;
  private _pseudoLevels: LevelDef[] = [];
  private _campaign: CampaignDef | null = null;

  constructor(callbacks: CampaignMapCallbacks) {
    const chapterCallbacks: ChapterMapCallbacks = {
      getDisplayProgress: () => callbacks.getCompletedChapters(),
      getActiveCampaignId: () => callbacks.getActiveCampaignId(),
      onShowLevelSelect: () => callbacks.onShowLevelSelect(),
      onLevelSelected: (levelDef) => {
        const chapterIdx = this._pseudoLevels.indexOf(levelDef);
        if (chapterIdx >= 0) callbacks.onChapterSelected(chapterIdx);
        else console.warn('CampaignMapScreen: selected chamber could not be mapped to chapter index.', levelDef.id);
      },
      formatBackButtonText: () => '← Main Menu',
      formatChapterTitle: () => null,
      shouldShowCompletionStatus: () => false,
      isMapCompleted: () => this.isCampaignComplete(),
      isMastered: () => {
        const campaign = this._campaign;
        if (!campaign) return false;
        const completedLevels = callbacks.getCompletedLevels();
        const allLevels = campaign.chapters.flatMap((ch) => ch.levels);
        const allLevelsCompleted = allLevels.every((l) => completedLevels.has(l.id));
        if (!allLevelsCompleted) return false;
        const levelStars = loadLevelStars(callbacks.getActiveCampaignId() ?? undefined);
        const starsCollected = allLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0);
        const starsTotal = allLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
        return starsTotal === 0 || starsCollected >= starsTotal;
      },
      formatInstructionText: () => 'Click on an accessible chapter',
      formatStatsText: () => {
        const campaign = this._campaign;
        if (!campaign) return '';
        const completedLevels = callbacks.getCompletedLevels();
        const allLevels = campaign.chapters.flatMap((ch) => ch.levels);
        const nonChallengeLevels = allLevels.filter((l) => !l.challenge);
        const completedNonChallenge = nonChallengeLevels.filter((l) => completedLevels.has(l.id)).length;
        const challengeLevels = allLevels.filter((l) => l.challenge);
        const completedChallenges = challengeLevels.filter((l) => completedLevels.has(l.id)).length;
        const isComplete = this.isCampaignComplete();
        const levelWater = loadLevelWater(callbacks.getActiveCampaignId() ?? undefined);
        const levelStars = loadLevelStars(callbacks.getActiveCampaignId() ?? undefined);
        const waterTotal = allLevels.reduce(
          (sum, level) => sum + (completedLevels.has(level.id) ? (levelWater[level.id] ?? 0) : 0),
          0,
        );
        const starsCollected = allLevels.reduce((sum, l) => sum + Math.min(levelStars[l.id] ?? 0, l.starCount ?? 0), 0);
        const starsTotal = allLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);

        const parts: string[] = [
          isComplete
            ? `✅ ${completedNonChallenge}/${nonChallengeLevels.length}`
            : `✅ ${completedNonChallenge}`,
          `💧 ${waterTotal}`,
        ];
        if (starsTotal > 0) parts.push(`⭐ ${starsCollected}/${starsTotal}`);
        if (challengeLevels.length > 0) parts.push(`💀 ${completedChallenges}/${challengeLevels.length}`);
        if (isComplete) {
          const allLevelsCompleted = allLevels.every((l) => completedLevels.has(l.id));
          // Mirrors chapter-map mastery semantics: when no stars exist in the campaign,
          // full level completion alone is enough for "Mastered!".
          const isMastered = allLevelsCompleted && (starsTotal === 0 || starsCollected >= starsTotal);
          parts.push(isMastered ? '🏆 Mastered!' : '✅ Complete');
        }
        return parts.join('  ');
      },
      augmentLevelStars: (baseStars) => {
        const campaign = this._campaign;
        if (!campaign) return baseStars;
        const result = { ...baseStars };
        for (let i = 0; i < campaign.chapters.length; i++) {
          const chapter = campaign.chapters[i];
          const pseudoLevel = this._pseudoLevels[i];
          if (!pseudoLevel) continue;
          // Aggregate stars across all levels in this chapter and key by the pseudo-level ID.
          result[pseudoLevel.id] = chapter.levels.reduce(
            (sum, l) => sum + Math.min(baseStars[l.id] ?? 0, l.starCount ?? 0),
            0,
          );
        }
        return result;
      },
    };
    this._inner = new ChapterMapScreen(chapterCallbacks);
    this.screenEl = this._inner.screenEl;
  }

  show(campaign: CampaignDef): void {
    if (!campaign.grid || !campaign.rows || !campaign.cols) return;
    this._campaign = campaign;
    const pseudoChapter = this._buildPseudoChapter(campaign);
    this._pseudoLevels = pseudoChapter.levels;
    const pseudoCampaign: CampaignDef = {
      ...campaign,
      chapters: [pseudoChapter],
    };
    this._inner.show(pseudoCampaign, 0);
  }

  hide(): void {
    this._campaign = null;
    this._inner.hide();
  }

  repopulate(campaign: CampaignDef): void {
    if (!campaign.grid || !campaign.rows || !campaign.cols) return;
    this.show(campaign);
  }

  isCampaignComplete(): boolean {
    return this._inner.isChapterComplete();
  }

  playWinAnimation(onDone: () => void): void {
    this._inner.playWinAnimation(onDone);
  }

  captureCanvasSnapshot(): ChapterMapSnapshot | null {
    return this._inner.captureCanvasSnapshot();
  }

  stopAnimLoop(): void {
    this._inner.stopAnimLoop();
  }

  getMinimapScreenRect(chapterIdx: number): { x: number; y: number; width: number; height: number } | null {
    const levelDef = this._pseudoLevels[chapterIdx];
    if (!levelDef) return null;
    return this._inner.getMinimapScreenRect(levelDef);
  }

  private _buildPseudoChapter(campaign: CampaignDef): ChapterDef {
    const levels: LevelDef[] = campaign.chapters.map((chapter, chapterIdx) => {
      const rows = chapter.rows ?? 1;
      const cols = chapter.cols ?? 1;
      const grid = chapter.grid ?? [[{ shape: PipeShape.Empty } as TileDef]];
      const totalStars = chapter.levels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
      return {
        id: chapter.id ?? (-1000 - chapterIdx),
        name: chapter.name,
        rows,
        cols,
        grid,
        inventory: [],
        starCount: totalStars,
        style: chapter.style,
      };
    });

    const grid = campaign.grid!.map((row) => row.map((tile): TileDef | null => {
      if (!tile) return null;
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter') {
        const chapterIdx = typeof tile.chapterIdx === 'number' ? tile.chapterIdx : undefined;
        return {
          ...tile,
          chamberContent: 'level' as const,
          levelIdx: chapterIdx,
        } as TileDef;
      }
      return tile;
    }));

    return {
      id: -1,
      name: campaign.name,
      levels,
      rows: campaign.rows,
      cols: campaign.cols,
      grid,
      style: campaign.style,
    };
  }
}
