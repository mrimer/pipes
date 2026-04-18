import { CampaignDef, ChapterDef, LevelDef, PipeShape, TileDef } from './types';
import { ChapterMapCallbacks, ChapterMapScreen } from './chapterMapScreen';
import { ChapterMapSnapshot } from './levelTransition';

export interface CampaignMapCallbacks {
  getCompletedChapters(): Set<number>;
  getActiveCampaignId(): string | null;
  onShowLevelSelect(): void;
  onChapterSelected(chapterIdx: number): void;
}

export class CampaignMapScreen {
  readonly screenEl: HTMLElement;
  private readonly _inner: ChapterMapScreen;
  private _pseudoLevels: LevelDef[] = [];

  constructor(callbacks: CampaignMapCallbacks) {
    const chapterCallbacks: ChapterMapCallbacks = {
      getDisplayProgress: () => callbacks.getCompletedChapters(),
      getActiveCampaignId: () => callbacks.getActiveCampaignId(),
      onShowLevelSelect: () => callbacks.onShowLevelSelect(),
      onLevelSelected: (levelDef) => {
        const chapterIdx = this._pseudoLevels.findIndex((l) => l.id === levelDef.id);
        if (chapterIdx >= 0) callbacks.onChapterSelected(chapterIdx);
        else console.warn('CampaignMapScreen: selected chamber could not be mapped to chapter index.', levelDef.id);
      },
    };
    this._inner = new ChapterMapScreen(chapterCallbacks);
    this.screenEl = this._inner.screenEl;
  }

  show(campaign: CampaignDef): void {
    if (!campaign.grid || !campaign.rows || !campaign.cols) return;
    const pseudoChapter = this._buildPseudoChapter(campaign);
    this._pseudoLevels = pseudoChapter.levels;
    const pseudoCampaign: CampaignDef = {
      ...campaign,
      chapters: [pseudoChapter],
    };
    this._inner.show(pseudoCampaign, 0);
  }

  hide(): void {
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
      const challenge = chapter.levels.some((l) => l.challenge === true);
      return {
        id: chapter.id ?? (-1000 - chapterIdx),
        name: chapter.name,
        rows,
        cols,
        grid,
        inventory: [],
        starCount: totalStars,
        challenge,
      };
    });

    const grid = campaign.grid!.map((row) => row.map((tile): TileDef | null => {
      if (!tile) return null;
      if (tile.shape === PipeShape.Chamber && tile.chamberContent === 'chapter') {
        return {
          ...tile,
          chamberContent: 'level' as const,
          levelIdx: tile.chapterIdx ?? 0,
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
