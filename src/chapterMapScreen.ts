/**
 * Chapter map screen – the in-game overlay that displays a chapter's map
 * (grid of pipe connections between level chambers) and allows the player
 * to select a level to play.
 *
 * This class owns the chapter map DOM element, canvas, and all event handlers.
 * It communicates with the rest of the game through the {@link ChapterMapCallbacks}
 * interface.
 */

import { ChapterDef, CampaignDef, LevelDef, TileDef, PipeShape, Direction, Rotation } from './types';
import { TILE_SIZE, setTileSize, computeTileSize } from './renderer';
import { PIPE_SHAPES } from './board';
import { Tile } from './tile';
import { renderChapterMapCanvas } from './visuals/chapterMap';
import { loadLevelStars, loadLevelWater } from './persistence';
import { computeChapterMapReachable } from './chapterMapUtils';

// ─── Callbacks ────────────────────────────────────────────────────────────────

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
  /** Returns the active campaign def, or null. */
  getActiveCampaign?(): CampaignDef | null;
  /** Called when the player clicks the water-filled Sink to complete the chapter. */
  onChapterSinkClicked?(chapterIdx: number): void;
  /** Returns the set of completed chapter IDs. */
  getCompletedChapters?(): Set<number>;
}

// ─── ChapterMapScreen ─────────────────────────────────────────────────────────

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
export class ChapterMapScreen {
  /** The root overlay element (fixed-position, full screen). */
  readonly screenEl: HTMLElement;

  private readonly _callbacks: ChapterMapCallbacks;

  /** The canvas element rendering the chapter map grid. */
  private _canvas: HTMLCanvasElement | null = null;
  /** 2D rendering context for the canvas. */
  private _ctx: CanvasRenderingContext2D | null = null;
  /** The chapter currently displayed. */
  private _chapter: ChapterDef | null = null;
  /** Index of the chapter within the active campaign. */
  private _chapterIdx = -1;
  /** Currently hovered grid cell. */
  private _hover: { row: number; col: number } | null = null;
  private _statsEl: HTMLElement | null = null;
  private _statusEl: HTMLElement | null = null;

  constructor(callbacks: ChapterMapCallbacks) {
    this._callbacks = callbacks;
    this.screenEl = this._buildScreenEl();
    document.body.appendChild(this.screenEl);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** The chapter currently displayed, or null if not yet shown. */
  get chapter(): ChapterDef | null { return this._chapter; }

  /** Index (within the campaign) of the chapter currently displayed. */
  get chapterIdx(): number { return this._chapterIdx; }

  /**
   * Populate the screen with the given chapter and make it visible.
   * Subsequent calls rebuild the content (e.g. after the player wins a level).
   */
  show(campaign: CampaignDef, chapterIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return;

    this._chapter = chapter;
    this._chapterIdx = chapterIdx;
    this._hover = null;

    this._populate(campaign, chapterIdx, chapter);
    this.screenEl.style.display = 'flex';
  }

  /**
   * Rebuild the screen content without changing visibility.
   * Used when returning to the chapter map after winning a level (the screen
   * is already visible but needs to reflect the updated completion state).
   */
  repopulate(campaign: CampaignDef): void {
    const chapter = this._chapter;
    if (!chapter) return;
    this._populate(campaign, this._chapterIdx, chapter);
  }

  // ─── Private – DOM building ─────────────────────────────────────────────────

  private _buildScreenEl(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'chapter-map-screen';
    el.style.cssText =
      'display:none;position:fixed;inset:0;background:#0a0e1a;flex-direction:column;' +
      'align-items:center;justify-content:flex-start;overflow:auto;z-index:10;' +
      'padding:20px;box-sizing:border-box;gap:16px;';
    return el;
  }

  private _populate(campaign: CampaignDef, chapterIdx: number, chapter: ChapterDef): void {
    const el = this.screenEl;
    el.innerHTML = '';

    // Header: campaign name, chapter number and name
    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;width:100%;max-width:900px;';
    const campaignName = document.createElement('div');
    campaignName.style.cssText = 'font-size:0.9rem;color:#aaa;';
    campaignName.textContent = campaign.name;
    header.appendChild(campaignName);
    const chapterTitle = document.createElement('h2');
    chapterTitle.textContent = `Chapter ${chapterIdx + 1}: ${chapter.name}`;
    chapterTitle.style.cssText = 'margin:4px 0;font-size:1.4rem;color:#f0c040;';
    header.appendChild(chapterTitle);
    el.appendChild(header);

    // Stats row
    const statsEl = document.createElement('div');
    statsEl.id = 'chapter-map-stats';
    statsEl.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:0.9rem;color:#ddd;';
    this._statsEl = statsEl;
    el.appendChild(statsEl);

    // Back button
    const backBtn = document.createElement('button');
    backBtn.textContent = '← Chapter Select';
    backBtn.style.cssText =
      'padding:8px 16px;font-size:0.9rem;background:#16213e;color:#7ed321;' +
      'border:1px solid #7ed321;border-radius:6px;cursor:pointer;';
    backBtn.addEventListener('click', () => this._callbacks.onShowLevelSelect());
    el.appendChild(backBtn);

    // Canvas container
    const canvasWrap = document.createElement('div');
    canvasWrap.style.cssText = 'max-width:900px;width:100%;';
    const canvas = document.createElement('canvas');
    this._canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (ctx) this._ctx = ctx;

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    setTileSize(computeTileSize(rows, cols));
    canvas.width  = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;
    canvas.style.cssText =
      'border:2px solid #4a90d9;border-radius:6px;cursor:pointer;' +
      'display:block;width:100%;height:auto;';

    // Mouse events for hover and click
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e, chapter));
    canvas.addEventListener('mouseleave', () => {
      this._hover = null;
      this._render(chapter);
    });
    canvas.addEventListener('click', (e) => this._onClick(e, campaign, chapter));

    // Tooltip (title attr for hover text)
    canvas.addEventListener('mousemove', (e) => {
      const pos = this._canvasPos(e, chapter);
      if (!pos) { canvas.title = ''; return; }
      const def = chapter.grid![pos.row]?.[pos.col];
      if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
        const level = chapter.levels[def.levelIdx];
        canvas.title = level ? `${def.levelIdx + 1}: ${level.name}` : '';
      } else {
        canvas.title = '';
      }
    });

    canvasWrap.appendChild(canvas);
    el.appendChild(canvasWrap);

    // Instruction text
    const instruction = document.createElement('p');
    instruction.style.cssText = 'color:#aaa;font-size:0.9rem;text-align:center;margin:0;';
    instruction.textContent = 'Click on an accessible level';
    el.appendChild(instruction);

    // Status text (Level Complete / Click Sink to advance)
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'text-align:center;margin:4px 0;min-height:2.5em;';
    this._statusEl = statusEl;
    el.appendChild(statusEl);

    // Render the chapter map
    this._render(chapter);
  }

  // ─── Private – interaction ──────────────────────────────────────────────────

  private _canvasPos(e: MouseEvent, chapter: ChapterDef): { row: number; col: number } | null {
    const canvas = this._canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const col = Math.floor((e.clientX - rect.left) * cols / rect.width);
    const row = Math.floor((e.clientY - rect.top)  * rows / rect.height);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }

  private _onMouseMove(e: MouseEvent, chapter: ChapterDef): void {
    this._hover = this._canvasPos(e, chapter);
    this._render(chapter);
  }

  private _onClick(e: MouseEvent, campaign: CampaignDef, chapter: ChapterDef): void {
    const pos = this._canvasPos(e, chapter);
    if (!pos || !chapter.grid) return;

    const def = chapter.grid[pos.row]?.[pos.col];
    if (!def) return;

    const displayProgress = this._callbacks.getDisplayProgress();
    const filledKeys = this._computeFilledCells(chapter, displayProgress);

    // Handle sink click (chapter completion)
    if (def.shape === PipeShape.Sink && filledKeys.has(`${pos.row},${pos.col}`)) {
      const nonChallengeLevels = chapter.levels.filter(l => !l.challenge);
      const allNonChallengeCompleted = nonChallengeLevels.length === 0 || nonChallengeLevels.every(l => displayProgress.has(l.id));
      if (allNonChallengeCompleted) {
        this._callbacks.onChapterSinkClicked?.(this._chapterIdx);
        return;
      }
    }

    // Handle level chamber click
    if (def.shape !== PipeShape.Chamber || def.chamberContent !== 'level') return;

    const levelIdx = def.levelIdx ?? 0;
    const levelDef = chapter.levels[levelIdx];
    if (!levelDef) return;

    // Only start a level that has water reaching it
    if (!filledKeys.has(`${pos.row},${pos.col}`)) return;

    this._callbacks.onLevelSelected(levelDef);
  }

  // ─── Private – rendering ────────────────────────────────────────────────────

  private _render(chapter: ChapterDef): void {
    const ctx = this._ctx;
    if (!ctx || !chapter.grid) return;

    const grid = chapter.grid;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    const displayProgress = this._callbacks.getDisplayProgress();
    const levelStars = loadLevelStars(this._callbacks.getActiveCampaignId() ?? undefined);

    // Compute which cells are reachable (BFS from source through connected tiles)
    const filledKeys = this._computeFilledCells(chapter, displayProgress);

    // Compute accessible level indices (level chambers that are water-filled)
    const accessibleLevelIdxs = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!filledKeys.has(`${r},${c}`)) continue;
        const def = grid[r]?.[c];
        if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
          accessibleLevelIdxs.add(def.levelIdx);
        }
      }
    }

    renderChapterMapCanvas(
      ctx,
      grid,
      rows,
      cols,
      chapter.levels,
      filledKeys,
      {
        completedLevels: displayProgress,
        levelStars,
      },
      this._hover,
      accessibleLevelIdxs,
    );

    // Update stats
    if (this._statsEl) {
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
        const isMastered = starsTotal === 0 || starsCollected >= starsTotal;
        parts.push(isMastered ? '🏆 Mastered!' : '✅ Complete');
      }

      this._statsEl.textContent = parts.join('  ');
    }

    // Update status text ("Level Complete!" / "Click Sink to advance")
    if (this._statusEl) {
      let sinkFilled = false;
      if (grid) {
        for (let r = 0; r < rows && !sinkFilled; r++) {
          for (let c = 0; c < cols && !sinkFilled; c++) {
            if (grid[r]?.[c]?.shape === PipeShape.Sink && filledKeys.has(`${r},${c}`)) sinkFilled = true;
          }
        }
      }
      const nonChallengeLevels = chapter.levels.filter(l => !l.challenge);
      const allNonChallengeCompleted = nonChallengeLevels.length === 0 || nonChallengeLevels.every(l => displayProgress.has(l.id));

      if (sinkFilled && allNonChallengeCompleted) {
        const completedChapters = this._callbacks.getCompletedChapters?.();
        const campaign = this._callbacks.getActiveCampaign?.();
        const isAlreadyCompleted = chapter.id !== undefined && completedChapters?.has(chapter.id);
        if (isAlreadyCompleted) {
          this._statusEl.innerHTML = '<span style="color:#7ed321;font-size:1rem;">✅ Chapter Complete!</span>';
        } else {
          let html = '<span style="color:#7ed321;font-size:1rem;font-weight:bold;">✅ Level Complete!</span>';
          if (campaign) {
            const chapterIdx = campaign.chapters.indexOf(chapter);
            const nextChapter = campaign.chapters[chapterIdx + 1] ?? null;
            if (nextChapter && !(completedChapters?.has(chapter.id))) {
              html += '<br><span style="color:#f0c040;font-size:1.05rem;font-weight:bold;">Click the Sink to advance to the next chapter.</span>';
            }
          }
          this._statusEl.innerHTML = html;
        }
      } else {
        this._statusEl.innerHTML = '';
      }
    }
  }

  /**
   * Compute which grid cells are water-reachable from the source.
   * Water flows through pipes and into level chambers; beyond a level chamber,
   * water only continues when the level is completed.
   */
  private _computeFilledCells(chapter: ChapterDef, completedLevels: Set<number>): Set<string> {
    const grid = chapter.grid;
    if (!grid) return new Set();

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Find source
    let sourcePos: { row: number; col: number } | null = null;
    for (let r = 0; r < rows && !sourcePos; r++) {
      for (let c = 0; c < cols && !sourcePos; c++) {
        if (grid[r]?.[c]?.shape === PipeShape.Source) sourcePos = { row: r, col: c };
      }
    }
    if (!sourcePos) return new Set();

    const getConns = (def: TileDef, isEntry: boolean): Set<Direction> => {
      if (def.connections) return new Set(def.connections);
      if (def.shape === PipeShape.Source || def.shape === PipeShape.Sink) {
        return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
      }
      if (def.shape === PipeShape.Chamber && def.chamberContent === 'level') {
        const levelIdx = def.levelIdx ?? 0;
        const levelId = chapter.levels[levelIdx]?.id;
        const isCompleted = levelId !== undefined && completedLevels.has(levelId);
        // Water enters the chamber regardless; exits only if completed
        if (!isCompleted && !isEntry) return new Set();
        return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
      }
      if (PIPE_SHAPES.has(def.shape)) {
        const rot = (def.rotation ?? 0) as Rotation;
        const t = new Tile(def.shape, rot, true, 0, 0, null, 1, null, null, 0, 0, 0, 0);
        return t.connections;
      }
      return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
    };

    return computeChapterMapReachable(grid, rows, cols, sourcePos, getConns);
  }
}
