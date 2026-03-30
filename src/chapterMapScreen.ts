/**
 * Chapter map screen – the in-game overlay that displays a chapter's map
 * (grid of pipe connections between level chambers) and allows the player
 * to select a level to play.
 *
 * This class owns the chapter map DOM element, canvas, and all event handlers.
 * It communicates with the rest of the game through the {@link ChapterMapCallbacks}
 * interface.
 */

import { ChapterDef, CampaignDef, LevelDef, TileDef, PipeShape, Direction, AmbientDecoration } from './types';
import { TILE_SIZE, setTileSize, computeTileSize } from './renderer';
import { PIPE_SHAPES } from './board';
import { renderChapterMapCanvas, generateChapterMapDecorations, findChapterMapAnimPositions, ChapterMapFlowDrop, spawnChapterMapFlowDrop, renderChapterMapFlowDrops } from './visuals/chapterMap';
import { loadLevelStars, loadLevelWater } from './persistence';
import { computeChapterMapReachable, tileDefConnections } from './chapterMapUtils';
import { VortexParticle, spawnVortexParticle, renderVortex } from './visuals/sinkVortex';
import { SourceSprayDrop, spawnSourceSprayDrop, renderSourceSpray } from './visuals/waterParticles';
import { SINK_WATER_COLOR, SINK_COLOR, SOURCE_COLOR, WATER_COLOR, FOCUS_COLOR, SUCCESS_COLOR, CHAPTER_MAP_BG } from './colors';

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
  /** Ambient decorations for empty cells, keyed by "row,col". */
  private _decorations: ReadonlyMap<string, AmbientDecoration> = new Map();

  // ─── Animation state ──────────────────────────────────────────────────────
  private _animFrameId: number | null = null;
  private _vortexParticles: VortexParticle[] = [];
  private _lastVortexSpawn = 0;
  private _sourceSprayDrops: SourceSprayDrop[] = [];
  private _lastSpraySpawn = 0;
  private _chapterMapFlowDrops: ChapterMapFlowDrop[] = [];
  private _lastFlowSpawn = 0;
  private static readonly VORTEX_SPAWN_INTERVAL_MS = 80;
  private static readonly SPRAY_SPAWN_INTERVAL_MS  = 150;
  private static readonly FLOW_SPAWN_INTERVAL_MS   = 350;

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

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    // Regenerate decorations when showing a new chapter
    if (this._chapter !== chapter) {
      this._decorations = generateChapterMapDecorations(rows, cols);
      // Reset animation state when switching chapters
      this._vortexParticles = [];
      this._sourceSprayDrops = [];
      this._chapterMapFlowDrops = [];
    }
    this._chapter = chapter;
    this._chapterIdx = chapterIdx;
    this._hover = null;

    this._populate(campaign, chapterIdx, chapter);
    this.screenEl.style.display = 'flex';
    this._startAnimLoop();
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
    this._startAnimLoop();
  }

  // ─── Private – DOM building ─────────────────────────────────────────────────

  private _buildScreenEl(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'chapter-map-screen';
    el.style.cssText =
      `display:none;position:fixed;inset:0;background:${CHAPTER_MAP_BG};flex-direction:column;` +
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
    chapterTitle.style.cssText = `margin:4px 0;font-size:1.4rem;color:${FOCUS_COLOR};`;
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
      `padding:8px 16px;font-size:0.9rem;background:#16213e;color:${SUCCESS_COLOR};` +
      `border:1px solid ${SUCCESS_COLOR};border-radius:6px;cursor:pointer;`;
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

  /**
   * Render the chapter map canvas only (no DOM stats/status updates).
   * Used by both the interactive `_render` path and the animation loop.
   */
  private _renderCanvas(chapter: ChapterDef): { filledKeys: Set<string>; displayProgress: Set<number> } | null {
    const ctx = this._ctx;
    if (!ctx || !chapter.grid) return null;

    const grid = chapter.grid;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    const displayProgress = this._callbacks.getDisplayProgress();
    const levelStars = loadLevelStars(this._callbacks.getActiveCampaignId() ?? undefined);

    const filledKeys = this._computeFilledCells(chapter, displayProgress);

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
      { completedLevels: displayProgress, levelStars },
      this._hover,
      accessibleLevelIdxs,
      this._decorations,
    );

    return { filledKeys, displayProgress };
  }

  private _render(chapter: ChapterDef): void {
    const result = this._renderCanvas(chapter);
    if (!result) return;
    const { filledKeys, displayProgress } = result;
    this._updateStats(chapter, displayProgress);
    this._updateStatus(chapter, displayProgress, filledKeys);
  }

  /**
   * Update the stats bar with water, star, challenge, and completion counts
   * for the current chapter.
   */
  private _updateStats(chapter: ChapterDef, displayProgress: Set<number>): void {
    if (!this._statsEl) return;

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

  /**
   * Update the status line below the canvas ("Level Complete!" / "Click the Sink…").
   * The status is cleared when the sink is not yet filled or all levels are not complete.
   */
  private _updateStatus(chapter: ChapterDef, displayProgress: Set<number>, filledKeys: Set<string>): void {
    if (!this._statusEl) return;

    const grid = chapter.grid!;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Check whether the sink has water reaching it
    let sinkFilled = false;
    for (let r = 0; r < rows && !sinkFilled; r++) {
      for (let c = 0; c < cols && !sinkFilled; c++) {
        if (grid[r]?.[c]?.shape === PipeShape.Sink && filledKeys.has(`${r},${c}`)) sinkFilled = true;
      }
    }
    const nonChallengeLevels = chapter.levels.filter(l => !l.challenge);
    const allNonChallengeCompleted = nonChallengeLevels.length === 0 || nonChallengeLevels.every(l => displayProgress.has(l.id));

    if (sinkFilled && allNonChallengeCompleted) {
      const completedChapters = this._callbacks.getCompletedChapters?.();
      const campaign = this._callbacks.getActiveCampaign?.();
      const isAlreadyCompleted = chapter.id !== undefined && completedChapters?.has(chapter.id);
      const campaignId = this._callbacks.getActiveCampaignId();
      const levelStarsData = loadLevelStars(campaignId ?? undefined);
      const chLevels = chapter.levels;
      const starsCollectedStatus = chLevels.reduce((sum, l) => sum + Math.min(levelStarsData[l.id] ?? 0, l.starCount ?? 0), 0);
      const starsTotalStatus = chLevels.reduce((sum, l) => sum + (l.starCount ?? 0), 0);
      const isMastered = starsTotalStatus === 0 || starsCollectedStatus >= starsTotalStatus;
      if (isAlreadyCompleted && !isMastered) {
        this._statusEl.innerHTML = `<span style="color:${SUCCESS_COLOR};font-size:1rem;">✅ Chapter Complete!</span>`;
      } else if (isAlreadyCompleted && isMastered) {
        this._statusEl.innerHTML = ''; // "Mastered!" is already shown in the stats bar
      } else {
        let html = `<span style="color:${SUCCESS_COLOR};font-size:1rem;font-weight:bold;">✅ Level Complete!</span>`;
        if (campaign) {
          const chapterIdx = campaign.chapters.indexOf(chapter);
          const nextChapter = campaign.chapters[chapterIdx + 1] ?? null;
          if (nextChapter && !(completedChapters?.has(chapter.id))) {
            html += `<br><span style="color:${FOCUS_COLOR};font-size:1.05rem;font-weight:bold;">Click the Sink to advance to the next chapter.</span>`;
          }
        }
        this._statusEl.innerHTML = html;
      }
    } else {
      this._statusEl.innerHTML = '';
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
        return tileDefConnections(def);
      }
      return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
    };

    return computeChapterMapReachable(grid, rows, cols, sourcePos, getConns);
  }

  // ─── Animation loop ──────────────────────────────────────────────────────────

  /**
   * Start (or restart) the canvas animation loop.
   * The loop automatically stops when the screen element is hidden.
   */
  private _startAnimLoop(): void {
    if (this._animFrameId !== null) return; // already running
    const loop = (now: number) => {
      if (this.screenEl.style.display === 'none') {
        this._animFrameId = null;
        return; // auto-stop when hidden
      }
      this._animFrameId = requestAnimationFrame(loop);
      this._tickAnimations(now);
    };
    this._animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Advance and render animation particles (sink vortex, source spray) on top
   * of the already-rendered chapter map canvas.
   */
  private _tickAnimations(now: number): void {
    const ctx = this._ctx;
    const chapter = this._chapter;
    if (!ctx || !chapter?.grid) return;

    const grid = chapter.grid;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Re-render the base canvas each frame to clear previous particle frames
    const renderResult = this._renderCanvas(chapter);
    if (!renderResult) return;
    const { filledKeys } = renderResult;

    const positions = findChapterMapAnimPositions(grid, rows, cols, filledKeys);

    // Sink vortex – spawn and render one vortex per sink tile
    for (const sink of positions.sinks) {
      if (now - this._lastVortexSpawn >= ChapterMapScreen.VORTEX_SPAWN_INTERVAL_MS) {
        spawnVortexParticle(this._vortexParticles);
        this._lastVortexSpawn = now;
      }
      const color = sink.isFilled ? SINK_WATER_COLOR : SINK_COLOR;
      renderVortex(ctx, this._vortexParticles, sink.x, sink.y, color);
    }

    // Source spray – spawn and render water-drop spray from the source
    if (positions.source) {
      const src = positions.source;
      if (now - this._lastSpraySpawn >= ChapterMapScreen.SPRAY_SPAWN_INTERVAL_MS) {
        spawnSourceSprayDrop(this._sourceSprayDrops);
        this._lastSpraySpawn = now;
      }
      // Source spray color matches the level screen: WATER_COLOR when the source is filled, SOURCE_COLOR when not.
      const sprayColor = src.isFilled ? WATER_COLOR : SOURCE_COLOR;
      renderSourceSpray(ctx, this._sourceSprayDrops, src.x, src.y, sprayColor);

      // Flow drops – water drops traveling from source to sink along filled pipe path.
      // Use WATER_COLOR to match the flow drop color on the level screen.
      const sinkFilled = positions.sinks.some(s => s.isFilled);
      if (src.isFilled && sinkFilled) {
        const maxDrops = Math.max(10, filledKeys.size * 5);
        if (now - this._lastFlowSpawn >= ChapterMapScreen.FLOW_SPAWN_INTERVAL_MS) {
          spawnChapterMapFlowDrop(this._chapterMapFlowDrops, grid, rows, cols, filledKeys, src.row, src.col, maxDrops);
          this._lastFlowSpawn = now;
        }
        renderChapterMapFlowDrops(ctx, this._chapterMapFlowDrops, grid, rows, cols, filledKeys, WATER_COLOR);
      }
    }
  }
}
