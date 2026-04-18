/**
 * MapScreenBase – abstract base class shared between ChapterMapScreen and any
 * future map-screen variant.  Contains all rendering, animation, and interaction
 * logic; subclasses provide the domain-specific data and callbacks via the
 * abstract methods declared at the bottom of this file.
 */

import { ChapterDef, CampaignDef, LevelDef, TileDef, PipeShape, Direction, AmbientDecoration } from './types';
import { TILE_SIZE, setTileSize, computeTileSize } from './renderer';
import { PIPE_SHAPES, generateAmbientDecorations } from './board';
import { renderChapterMapCanvas, findChapterMapAnimPositions, ChapterMapFlowDrop, spawnChapterMapFlowDrop, renderChapterMapFlowDrops, drawEdgeFlower, computeMinimapRect, renderChapterMapConnectorLights, computeChapterFloorTypes } from './visuals/chapterMap';
import { loadLevelStars, loadLevelWater } from './persistence';
import { computeMapReachable, tileDefConnections, findMapTile } from './mapUtils';
import { VortexParticle, spawnVortexParticle, renderVortex } from './visuals/sinkVortex';
import { SourceSprayDrop, spawnSourceSprayDrop, renderSourceSpray, BubbleParticle, spawnChapterMapBubble, renderBubbles } from './visuals/waterParticles';
import { SINK_WATER_COLOR, SINK_COLOR, SOURCE_COLOR, WATER_COLOR, FOCUS_COLOR, SUCCESS_COLOR, CHAPTER_MAP_BG } from './colors';
import type { ChapterMapSnapshot } from './levelTransition';
import { sfxManager, SfxId } from './sfxManager';
import { WinTileGlow, computeChapterMapWinGlows, renderWinTileGlows, WIN_TILE_GLOW_DURATION } from './visuals/winTileEffect';
import { RADIUS_MD, RADIUS_SM, UI_BG, UI_BORDER, UI_TEXT } from './uiConstants';
import { createButton } from './uiHelpers';

// ─── Canvas border constants ──────────────────────────────────────────────────

/** CSS border-width (px) on the chapter map canvas element. */
const CHAPTER_MAP_CANVAS_BORDER_PX = 2;
/** Default CSS border-color on the chapter map canvas element. */
const CHAPTER_MAP_CANVAS_BORDER_COLOR = '#4a90d9';
/** CSS border-radius (px) on the chapter map canvas element. */
const CHAPTER_MAP_CANVAS_BORDER_RADIUS = 6;

// ─── Viewport size limits ─────────────────────────────────────────────────────

/** Maximum number of tile columns displayed in the map view window. */
export const MAP_VIEW_MAX_COLS = 12;
/** Maximum number of tile rows displayed in the map view window. */
export const MAP_VIEW_MAX_ROWS = 9;

// ─── Layout overhead constants ────────────────────────────────────────────────
// Estimated heights of UI elements that appear above/below the chapter map
// canvas, used to compute the vertical overhead passed to computeTileSize so
// the canvas fits on-screen without scrolling.

/** Estimated height (px) of the chapter-map header (campaign name + chapter title h2). */
const CHAPTER_MAP_HEADER_H = 50;
/** Estimated height (px) of the stats row. */
const CHAPTER_MAP_STATS_H = 22;
/** Estimated height (px) of the back button. */
const CHAPTER_MAP_BACK_BTN_H = 32;
/** Estimated height (px) of the instruction text line. */
const CHAPTER_MAP_INSTRUCTION_H = 20;
/** Estimated height (px) of the status element (has min-height: 1.5em). */
const CHAPTER_MAP_STATUS_H = 24;
/** Gap (px) between flex children of the chapter-map screen. */
const CHAPTER_MAP_GAP = 16;
/** Top + bottom padding (px) of the chapter-map screen container. */
const CHAPTER_MAP_PADDING = 40;

/**
 * Total estimated vertical overhead (px) consumed by all chapter-map UI
 * elements other than the canvas itself.  Includes the canvas CSS border
 * (top + bottom) so the computed TILE_SIZE keeps the full border-box
 * within the viewport.
 */
const CHAPTER_MAP_GRID_OVERHEAD =
  CHAPTER_MAP_HEADER_H + CHAPTER_MAP_STATS_H + CHAPTER_MAP_BACK_BTN_H +
  CHAPTER_MAP_INSTRUCTION_H + CHAPTER_MAP_STATUS_H +
  5 * CHAPTER_MAP_GAP + CHAPTER_MAP_PADDING + 2 * CHAPTER_MAP_CANVAS_BORDER_PX;

// ─── MapScreenBase ────────────────────────────────────────────────────────────

/** A single flower displayed along the left or right edge of the chapter map on completion. */
interface EdgeFlower {
  /** Canvas x-coordinate of the flower center. */
  x: number;
  /** Canvas y-coordinate of the flower center. */
  y: number;
  /** Timestamp (from requestAnimationFrame `now`) when this flower was spawned. */
  spawnedAt: number;
  /** Color variant 0–2, matching the decor flower palette. */
  variant: number;
  /** Static per-flower rotation offset in radians. */
  baseRotation: number;
}

/**
 * Abstract base class for map screen overlays (DOM, canvas, and interaction).
 *
 * Subclasses implement the abstract methods to supply domain-specific data
 * (e.g. which levels are completed) and react to domain-specific events
 * (e.g. a level chamber being selected).
 */
export abstract class MapScreenBase {
  /** The root overlay element (fixed-position, full screen). */
  readonly screenEl: HTMLElement;

  /** The canvas element rendering the chapter map grid. */
  private _canvas: HTMLCanvasElement | null = null;
  /** 2D rendering context for the canvas. */
  private _ctx: CanvasRenderingContext2D | null = null;
  /** The chapter currently displayed. */
  protected _chapter: ChapterDef | null = null;
  /** Index of the chapter within the active campaign. */
  protected _chapterIdx = -1;
  /** The campaign currently displayed. */
  protected _campaign: CampaignDef | null = null;
  /** Currently hovered grid cell. */
  private _hover: { row: number; col: number } | null = null;
  /** Last known mouse position in client coordinates. */
  private _mouseClientPos: { x: number; y: number } | null = null;
  /** Whether the Ctrl key is currently held. */
  private _ctrlHeld = false;
  /** Floating tooltip element shown on Ctrl+hover. */
  private readonly _tooltipEl: HTMLElement;
  /** Bound keydown handler stored so it can be removed when the screen is hidden. */
  private readonly _onKeyDown: (e: KeyboardEvent) => void;
  /** Bound keyup handler stored so it can be removed when the screen is hidden. */
  private readonly _onKeyUp: (e: KeyboardEvent) => void;
  /** Bound resize handler stored so it can be removed when the screen is hidden. */
  private readonly _onResize: () => void;
  private _statsEl: HTMLElement | null = null;
  private _statusEl: HTMLElement | null = null;
  /** Ambient decorations for empty cells, keyed by "row,col". */
  private _decorations: ReadonlyMap<string, AmbientDecoration> = new Map();
  /** Pre-computed floor types for chapter map cells. */
  private _floorTypes: ReadonlyMap<string, PipeShape> = new Map();

  // ─── Touch state ────────────────────────────────────────────────────────
  /** Client x where the most recent touch on this canvas started. */
  private _touchStartX = 0;
  /** Client y where the most recent touch on this canvas started. */
  private _touchStartY = 0;
  /** Whether the touch has moved beyond the tap threshold. */
  private _touchMoved = false;
  /** Timer ID for long-press tooltip on touch devices. */
  private _touchLongPressTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Viewport / pan state ────────────────────────────────────────────────
  /**
   * Horizontal pixel scroll offset: how many canvas-pixels the map has been
   * panned to the right (tile (0,0) is drawn at x = -_panPixelX).
   */
  private _panPixelX = 0;
  /**
   * Vertical pixel scroll offset: how many canvas-pixels the map has been
   * panned downward (tile (0,0) is drawn at y = -_panPixelY).
   */
  private _panPixelY = 0;
  /** Whether the initial snap position has been computed for the current map key. */
  private _panInitialized = false;
  /**
   * Unique key identifying the current display (`${campaign.id}-${chapterIdx}`).
   * Pan is reset whenever this key changes.
   */
  private _currentDisplayKey = '';
  /** Number of tile rows visible in the current view window (≤ MAP_VIEW_MAX_ROWS). */
  private _viewRows = MAP_VIEW_MAX_ROWS;
  /** Number of tile cols visible in the current view window (≤ MAP_VIEW_MAX_COLS). */
  private _viewCols = MAP_VIEW_MAX_COLS;

  // ─── Pan drag state ──────────────────────────────────────────────────────
  /** Active mouse-drag-to-pan state, null when no pan drag is in progress. */
  private _panDrag: {
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    /** True once the pointer has moved beyond the drag threshold. */
    moved: boolean;
  } | null = null;
  /** Start pan values for the current touch pan gesture. */
  private _touchPanStartPanX = 0;
  private _touchPanStartPanY = 0;

  // ─── Animation state ──────────────────────────────────────────────────────
  private _animFrameId: number | null = null;
  private _vortexParticles: VortexParticle[] = [];
  private _lastVortexSpawn = 0;
  private _sourceSprayDrops: SourceSprayDrop[] = [];
  private _lastSpraySpawn = 0;
  private _chapterMapFlowDrops: ChapterMapFlowDrop[] = [];
  private _lastFlowSpawn = 0;
  private _bubbles: BubbleParticle[] = [];
  private _lastBubbleSpawn = 0;
  /** Edge flowers that appear along the left/right canvas edges when the chapter is completed. */
  private _edgeFlowers: EdgeFlower[] = [];
  private _lastFlowerSpawn = 0;
  /** Which edge (0 = left, 1 = right) receives the next spawned flower. */
  private _nextFlowerSide = 0;
  /**
   * Active jitter animations for unconnected-chamber click feedback.
   * Each entry records which cell is jittering and when the animation started.
   */
  private _jitterAnims: Array<{ row: number; col: number; startedAt: number }> = [];
  /**
   * Active win-tile glow animations triggered when the chapter completion
   * sequence plays. The same WinTileGlow type used on the level-complete screen.
   */
  private _winGlows: WinTileGlow[] = [];
  /**
   * Current canvas border color – default blue, animated gold when the chapter
   * is mastered. Tracked here so captureCanvasSnapshot() can include the border
   * in the snapshot image.
   */
  private _borderColor = CHAPTER_MAP_CANVAS_BORDER_COLOR;
  private static readonly VORTEX_SPAWN_INTERVAL_MS  = 80;
  private static readonly SPRAY_SPAWN_INTERVAL_MS   = 150;
  /** One new flow-drop pulse per second when the chapter is completed. */
  private static readonly FLOW_SPAWN_INTERVAL_MS    = 1000;
  private static readonly BUBBLE_SPAWN_INTERVAL_MS  = 120;
  /** How often (ms) a new edge flower is spawned when the chapter is completed. */
  private static readonly FLOWER_SPAWN_INTERVAL_MS  = 800;
  /** Total lifespan of each edge flower in milliseconds. */
  private static readonly FLOWER_LIFETIME_MS        = 60_000;
  /** Duration of the fade-out at the end of a flower's life. */
  private static readonly FLOWER_FADE_MS            = 3_000;
  /** Duration of the grow-in animation at the start of a flower's life. */
  private static readonly FLOWER_GROW_MS            = 1_000;
  /** Divisor for the sway angle: sin(now/FLOWER_SWAY_PERIOD) → ~6 s full cycle. */
  private static readonly FLOWER_SWAY_PERIOD        = 955;
  /** Divisor for the gold border brightness oscillation: sin(now/GOLD_BORDER_PERIOD) → ~3.1 s cycle. */
  private static readonly GOLD_BORDER_PERIOD        = 500;
  /** Total duration (ms) of the jitter animation for an unconnected chamber click. */
  private static readonly JITTER_DURATION_MS        = 400;
  /** Peak displacement (px) for the jitter oscillation. */
  private static readonly JITTER_AMPLITUDE          = 6;
  /** Number of oscillation cycles in the jitter duration. */
  private static readonly JITTER_CYCLES             = 4;

  constructor() {
    this.screenEl = this._buildScreenEl();
    document.body.appendChild(this.screenEl);

    // Tooltip element for Ctrl+hover level name display
    this._tooltipEl = document.createElement('div');
    this._tooltipEl.style.cssText =
      `display:none;position:fixed;background:${UI_BG};color:${UI_TEXT};border:1px solid ${UI_BORDER};` +
      `border-radius:${RADIUS_SM};padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;white-space:pre-wrap;`;
    document.body.appendChild(this._tooltipEl);

    this._onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' && !this._ctrlHeld) {
        this._ctrlHeld = true;
        if (this._mouseClientPos && this._chapter) {
          this._showTooltip(this._mouseClientPos.x, this._mouseClientPos.y);
        }
      }
    };
    this._onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') {
        this._ctrlHeld = false;
        this._hideTooltip();
      }
    };

    // Re-populate the chapter map when the viewport size changes (e.g. orientation change).
    // Debounced at 100 ms to avoid layout thrash during the resize animation.
    let _resizeTimer: ReturnType<typeof setTimeout> | null = null;
    this._onResize = () => {
      if (_resizeTimer !== null) clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => {
        _resizeTimer = null;
        if (this.screenEl.style.display !== 'none' && this._chapter && this._campaign) {
          this.repopulate(this._campaign);
        }
      }, 100);
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** The chapter currently displayed, or null if not yet shown. */
  get chapter(): ChapterDef | null { return this._chapter; }

  /** Index (within the campaign) of the chapter currently displayed. */
  get chapterIdx(): number { return this._chapterIdx; }

  /**
   * Returns true when the chapter's sink is water-filled and all level-completion
   * requirements have been met (i.e., the chapter is ready to be marked complete).
   * Used by the campaign manager to auto-trigger the completion sequence on screen entry.
   */
  isChapterComplete(): boolean {
    const chapter = this._chapter;
    if (!chapter?.grid) return false;
    const displayProgress = this._getDisplayProgress();
    const filledKeys = this._computeFilledCells();
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const grid = chapter.grid;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileDef = grid[r]?.[c];
        if (tileDef?.shape === PipeShape.Sink && filledKeys.has(`${r},${c}`)) {
          return this._sinkRemaining(tileDef, chapter, displayProgress) <= 0;
        }
      }
    }
    return false;
  }

  /**
   * Compute the screen-space bounding rectangle of the minimap image drawn
   * inside the level chamber tile for the given level definition.
   *
   * Returns `null` if the chapter or canvas is not available, or the level
   * cannot be found on the grid.
   */
  getMinimapScreenRect(levelDef: LevelDef): { x: number; y: number; width: number; height: number } | null {
    const chapter = this._chapter;
    const canvas = this._canvas;
    if (!chapter?.grid || !canvas) return null;

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Find the grid cell containing this level.
    let cellRow = -1, cellCol = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const def = chapter.grid[r]?.[c];
        if (
          def?.shape === PipeShape.Chamber &&
          def.chamberContent === 'level' &&
          def.levelIdx !== undefined &&
          chapter.levels[def.levelIdx] === levelDef
        ) {
          cellRow = r;
          cellCol = c;
          break;
        }
      }
      if (cellRow >= 0) break;
    }
    if (cellRow < 0) return null;

    // Apply the pan offset so the minimap rect reflects the tile's current
    // on-canvas position within the view window.
    const canvasX = cellCol * TILE_SIZE - this._panPixelX;
    const canvasY = cellRow * TILE_SIZE - this._panPixelY;

    // If the cell is entirely outside the visible view window, return null so
    // the transition falls back gracefully (no off-screen animation target).
    if (
      canvasX + TILE_SIZE <= 0 || canvasX >= this._viewCols * TILE_SIZE ||
      canvasY + TILE_SIZE <= 0 || canvasY >= this._viewRows * TILE_SIZE
    ) return null;

    const { x: mx, y: my, width: mw, height: mh } = computeMinimapRect(
      canvasX, canvasY, levelDef
    );

    // Convert canvas-space → screen-space using the canvas bounding rect.
    // The canvas has a CSS border (CHAPTER_MAP_CANVAS_BORDER_PX wide on each side);
    // getBoundingClientRect() returns the border-box, so we subtract the border from
    // the dimensions and add it to the origin to get the true content area in screen space.
    const rect = canvas.getBoundingClientRect();
    const border = CHAPTER_MAP_CANVAS_BORDER_PX;
    const contentW = rect.width - 2 * border;
    const contentH = rect.height - 2 * border;
    const cssScaleX = contentW / canvas.width;
    const cssScaleY = contentH / canvas.height;

    return {
      x: rect.left + border + mx * cssScaleX,
      y: rect.top + border + my * cssScaleY,
      width: mw * cssScaleX,
      height: mh * cssScaleY,
    };
  }

  /**
   * Capture a pixel snapshot of the chapter map canvas along with its current
   * CSS bounding rect.  Call this *before* any action that changes TILE_SIZE or
   * hides the chapter map (e.g. {@link startLevel}) so the snapshot perfectly
   * matches what the player was looking at.
   *
   * Returns `null` if the canvas is not available or has zero dimensions.
   */
  captureCanvasSnapshot(): ChapterMapSnapshot | null {
    const canvas = this._canvas;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    const fullRect = canvas.getBoundingClientRect();

    // Border thickness must match the actual CSS border width so the snapshot
    // grid aligns pixel-perfectly with the original canvas display.
    const bCanvas = CHAPTER_MAP_CANVAS_BORDER_PX;

    // Create a snapshot canvas expanded by bCanvas on each side so the full
    // framing border fits inside without clipping.
    const snapW = canvas.width  + 2 * bCanvas;
    const snapH = canvas.height + 2 * bCanvas;
    const snapshot = document.createElement('canvas');
    snapshot.width  = snapW;
    snapshot.height = snapH;
    const ctx = snapshot.getContext('2d');
    if (!ctx) return null;

    // Draw the framing border FIRST so that the grid content drawn on top
    // covers the inward half of the stroke, leaving only the outer bCanvas
    // pixels visible in the border zone.
    ctx.strokeStyle = this._borderColor;
    ctx.lineWidth   = 2 * bCanvas;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    // Subtract bCanvas from the path radius so the OUTER edge of the stroke
    // lands at radius CHAPTER_MAP_CANVAS_BORDER_RADIUS from the canvas corner,
    // matching the CSS border-radius on the live canvas element exactly.
    ctx.roundRect(bCanvas, bCanvas, canvas.width, canvas.height, CHAPTER_MAP_CANVAS_BORDER_RADIUS - bCanvas);
    ctx.stroke();

    // Draw the original chapter-map content inset by bCanvas pixels so that
    // the grid tiles occupy the same relative area within the expanded canvas.
    ctx.drawImage(canvas, bCanvas, bCanvas);

    // Use the full border-box rect so the expanded snapshot is positioned to
    // cover exactly the same screen area as the original canvas element
    // (content + border).  The grid-tile scale is unchanged: the snapshot's
    // canvas pixel count and its CSS display size both grow by the same amount.
    const cssRect = {
      left:   fullRect.left,
      top:    fullRect.top,
      width:  fullRect.width,
      height: fullRect.height,
    };

    return { canvas: snapshot, cssRect };
  }

  /**
   * Start the blue tile win-glow animation over all water-filled cells on the
   * chapter map canvas, and play the Win Chapter sound effect.
   * Calls {@link onComplete} once every glow has finished AND the Win Chapter
   * sound effect has ended, so that downstream effects (e.g. mastery sequence)
   * do not overlap with the chapter-win audio.
   */
  playWinAnimation(onComplete: () => void): void {
    const chapter = this._chapter;
    if (!chapter?.grid) { onComplete(); return; }

    const filledKeys = this._computeFilledCells();
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const sourcePos = findMapTile(chapter.grid, rows, cols, PipeShape.Source);

    // Wait for both the WinChapter sfx AND the glow animation to finish before
    // calling onComplete, so mastery effects don't overlap the chapter-win sfx.
    let sfxDone = false;
    let animDone = false;
    const tryComplete = () => {
      if (sfxDone && animDone) {
        this._winGlows = [];
        onComplete();
      }
    };

    sfxManager.playWithDoneCallback(SfxId.WinChapter, () => {
      sfxDone = true;
      tryComplete();
    });

    if (!sourcePos || filledKeys.size === 0) {
      animDone = true;
      tryComplete();
      return;
    }

    const baseTime = performance.now();
    this._winGlows = computeChapterMapWinGlows(filledKeys, sourcePos.row, sourcePos.col, baseTime);

    // Compute when the last glow finishes
    const maxStart = this._winGlows.reduce((m, g) => Math.max(m, g.startTime), baseTime);
    const endTime = maxStart + WIN_TILE_GLOW_DURATION;

    // Schedule the animation-done signal once the last glow expires
    const delay = endTime - baseTime;
    setTimeout(() => {
      animDone = true;
      tryComplete();
    }, delay);
  }

  /**
   * Populate the screen with the given chapter and make it visible.
   * Subsequent calls rebuild the content (e.g. after the player wins a level).
   */
  show(campaign: CampaignDef, chapterIdx: number): void {
    const chapter = campaign.chapters[chapterIdx];
    if (!chapter?.grid) return;

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Determine whether this is a new display (different map) or a repopulate
    // of the same map (e.g. returning from a level).  Pan is only reset when
    // the map actually changes so that returning from a chapter preserves the
    // campaign-map scroll position.
    const newKey = `${campaign.id}-${chapterIdx}`;
    const isNewDisplay = newKey !== this._currentDisplayKey;
    this._currentDisplayKey = newKey;
    if (isNewDisplay) {
      this._panInitialized = false;
    }

    // Regenerate decorations and floor types when showing a new chapter
    if (this._chapter !== chapter) {
      // Compute floor types first so decoration generation selects the correct
      // types per cell (pebbles on dirt/dark, no crystals on grass, etc.).
      this._floorTypes = computeChapterFloorTypes(chapter.grid, rows, cols, chapter.style);
      const floorTypes = this._floorTypes;
      this._decorations = generateAmbientDecorations(rows, cols, (r, c) => floorTypes.get(`${r},${c}`) ?? PipeShape.Empty);
      // Reset animation state when switching chapters
      this._vortexParticles = [];
      this._sourceSprayDrops = [];
      this._chapterMapFlowDrops = [];
      this._bubbles = [];
    }
    // Edge flowers always restart fresh when entering the screen
    this._edgeFlowers = [];
    this._lastFlowerSpawn = 0;
    this._nextFlowerSide = 0;
    this._chapter = chapter;
    this._chapterIdx = chapterIdx;
    this._campaign = campaign;
    this._hover = null;

    this._populate(campaign, chapterIdx, chapter);
    this.screenEl.style.display = 'flex';
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
    this._startAnimLoop();
  }

  /**
   * Hide the screen and remove document-level event listeners.
   * Call this instead of setting `screenEl.style.display` directly.
   */
  hide(): void {
    this.screenEl.style.display = 'none';
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
    this._ctrlHeld = false;
    this._hideTooltip();
    // Clear any pending long-press timer.
    if (this._touchLongPressTimer !== null) {
      clearTimeout(this._touchLongPressTimer);
      this._touchLongPressTimer = null;
    }
  }

  /** Stop the animation loop without hiding the screen element. */
  stopAnimLoop(): void {
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  /**
   * Rebuild the screen content without changing visibility.
   * Used when returning to the chapter map after winning a level (the screen
   * is already visible but needs to reflect the updated completion state).
   */
  repopulate(campaign: CampaignDef): void {
    const chapter = this._chapter;
    if (!chapter) return;
    this._campaign = campaign;
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
    const customChapterTitle = this._formatChapterTitle(campaign, chapterIdx, chapter);
    const chapterTitleText =
      customChapterTitle === undefined
        ? `Chapter ${chapterIdx + 1}: ${chapter.name}`
        : customChapterTitle;
    if (chapterTitleText !== null) {
      const chapterTitle = document.createElement('h2');
      chapterTitle.textContent = chapterTitleText;
      chapterTitle.style.cssText = `margin:4px 0;font-size:1.4rem;color:${FOCUS_COLOR};`;
      header.appendChild(chapterTitle);
    }
    el.appendChild(header);

    // Stats row
    const statsEl = document.createElement('div');
    statsEl.id = 'chapter-map-stats';
    statsEl.style.cssText = 'display:flex;gap:12px;justify-content:center;flex-wrap:wrap;font-size:0.9rem;color:#ddd;';
    this._statsEl = statsEl;
    el.appendChild(statsEl);

    // Back button
    const backBtnText = this._formatBackButtonText();
    const backBtn = createButton(backBtnText, UI_BG, SUCCESS_COLOR, () => {
      this._onShowLevelSelect(); // stopAll() is called inside; play Back after
      sfxManager.play(SfxId.Back);
    });
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

    // Use a view-window capped at MAP_VIEW_MAX_COLS × MAP_VIEW_MAX_ROWS.
    // When the map fits within that cap, view == full grid (unchanged behaviour).
    const viewRows = Math.min(rows, MAP_VIEW_MAX_ROWS);
    const viewCols = Math.min(cols, MAP_VIEW_MAX_COLS);
    const isOversized = rows > MAP_VIEW_MAX_ROWS || cols > MAP_VIEW_MAX_COLS;

    // Scale tile size to fit the view window on screen.
    const oldTileSize = TILE_SIZE;
    setTileSize(computeTileSize(viewRows, viewCols, CHAPTER_MAP_GRID_OVERHEAD));
    this._viewRows = viewRows;
    this._viewCols = viewCols;

    // Compute or preserve pan position.
    if (!this._panInitialized) {
      this._computeInitialSnap(chapter, viewRows, viewCols);
      this._panInitialized = true;
    } else {
      // On resize (repopulate with same map), rescale the pan pixel offset so
      // tile positions stay consistent with the new tile size.
      if (oldTileSize !== TILE_SIZE && oldTileSize > 0) {
        this._panPixelX = this._panPixelX * TILE_SIZE / oldTileSize;
        this._panPixelY = this._panPixelY * TILE_SIZE / oldTileSize;
      }
      this._clampPan(chapter, viewRows, viewCols);
    }

    canvas.width  = viewCols * TILE_SIZE;
    canvas.height = viewRows * TILE_SIZE;
    const defaultCursor = isOversized ? 'grab' : 'pointer';
    canvas.style.cssText =
      `border:2px solid ${UI_BORDER};border-radius:${RADIUS_MD};` +
      `cursor:${defaultCursor};` +
      'display:block;max-width:100%;height:auto;margin:0 auto;';

    // ── Mouse events ──────────────────────────────────────────────────────────

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._panDrag = {
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPanX: this._panPixelX,
        startPanY: this._panPixelY,
        moved: false,
      };
    });

    canvas.addEventListener('mousemove', (e) => {
      this._mouseClientPos = { x: e.clientX, y: e.clientY };

      // Handle pan drag.
      if (this._panDrag) {
        const dx = e.clientX - this._panDrag.startClientX;
        const dy = e.clientY - this._panDrag.startClientY;
        if (!this._panDrag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          this._panDrag.moved = true;
        }
        if (this._panDrag.moved) {
          const cp = this._clientToCanvasPx(e.clientX, e.clientY);
          if (cp) {
            this._panPixelX = this._panDrag.startPanX - dx * cp.scaleX;
            this._panPixelY = this._panDrag.startPanY - dy * cp.scaleY;
          }
          this._clampPan(chapter, viewRows, viewCols);
          this._hover = null;
          this._render(chapter);
          canvas.style.cursor = 'grabbing';
          return;
        }
      }

      this._onMouseMove(e, chapter);
      // Update native title for non-Ctrl hover and custom tooltip for Ctrl+hover
      const pos = this._canvasPos(e, chapter);
      if (pos) {
        const def = chapter.grid![pos.row]?.[pos.col];
        const displayProgress = this._getDisplayProgress();
        if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
          const filledKeys = this._computeFilledCells();
          const isFilled = filledKeys.has(`${pos.row},${pos.col}`);
          const entityDefs = this._getEntityDefs();
          const entity = entityDefs[def.levelIdx];
          canvas.title = isFilled && entity ? `${def.levelIdx + 1}: ${entity.name}` : '???';
        } else if (def?.shape === PipeShape.Source) {
          const entityDefs = this._getEntityDefs();
          const completedCount = entityDefs.filter(l => displayProgress.has(l.id)).length;
          canvas.title = `${completedCount} completed level${completedCount === 1 ? '' : 's'}`;
        } else if (def?.shape === PipeShape.Sink) {
          const filledKeys = this._computeFilledCells();
          const remaining = this._sinkRemaining(def, chapter, displayProgress);
          if (remaining > 0) {
            canvas.title = `${remaining} level${remaining === 1 ? '' : 's'} remaining to complete chapter`;
          } else if (filledKeys.has(`${pos.row},${pos.col}`)) {
            canvas.title = 'Chapter Complete!';
          } else {
            canvas.title = '';
          }
        } else {
          canvas.title = '';
        }
      } else {
        canvas.title = '';
      }
      if (this._ctrlHeld) {
        this._showTooltip(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      if (this._panDrag?.moved) {
        canvas.style.cursor = defaultCursor;
      }
      // Click handling is deferred to the 'click' event so the browser can
      // fire it; we only use mouseup to restore the cursor.
    });

    canvas.addEventListener('mouseleave', () => {
      this._panDrag = null;
      this._mouseClientPos = null;
      this._hover = null;
      this._hideTooltip();
      canvas.style.cursor = defaultCursor;
      this._render(chapter);
    });

    canvas.addEventListener('click', (e) => {
      if (this._panDrag?.moved) {
        // A click fired after a drag – suppress it.
        this._panDrag = null;
        return;
      }
      this._panDrag = null;
      this._onClick(e, campaign, chapter);
    });

    // ── Touch events for mobile/tablet devices ────────────────────────────────
    canvas.style.touchAction = 'none'; // prevent scroll/zoom on the canvas
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      this._touchStartX = touch.clientX;
      this._touchStartY = touch.clientY;
      this._touchPanStartPanX = this._panPixelX;
      this._touchPanStartPanY = this._panPixelY;
      this._touchMoved = false;
      // Start long-press timer to show tooltip (500 ms).
      if (this._touchLongPressTimer !== null) clearTimeout(this._touchLongPressTimer);
      this._touchLongPressTimer = setTimeout(() => {
        this._touchLongPressTimer = null;
        if (!this._touchMoved) {
          this._showTooltip(this._touchStartX, this._touchStartY);
        }
      }, 500);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - this._touchStartX;
      const dy = touch.clientY - this._touchStartY;
      if (Math.sqrt(dx * dx + dy * dy) > 8) {
        this._touchMoved = true;
        if (this._touchLongPressTimer !== null) {
          clearTimeout(this._touchLongPressTimer);
          this._touchLongPressTimer = null;
        }
        this._hideTooltip();
        // Pan the map for oversized maps.
        if (isOversized) {
          const cp = this._clientToCanvasPx(touch.clientX, touch.clientY);
          if (cp) {
            this._panPixelX = this._touchPanStartPanX - dx * cp.scaleX;
            this._panPixelY = this._touchPanStartPanY - dy * cp.scaleY;
          }
          this._clampPan(chapter, viewRows, viewCols);
          this._hover = null;
          this._render(chapter);
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this._touchLongPressTimer !== null) {
        clearTimeout(this._touchLongPressTimer);
        this._touchLongPressTimer = null;
      }
      if (this._touchMoved) return; // was a scroll/swipe/pan, not a tap
      const changedTouch = e.changedTouches[0];
      if (!changedTouch) return;
      // Synthesize a click at the touch coordinates.
      const pos = this._canvasPosFromCoords(changedTouch.clientX, changedTouch.clientY, chapter);
      if (!pos || !chapter.grid) return;
      const def = chapter.grid[pos.row]?.[pos.col];
      if (!def) return;
      if (def.shape !== PipeShape.Chamber || def.chamberContent !== 'level') return;
      const levelIdx = def.levelIdx;
      if (levelIdx === undefined) return;
      const filledKeys = this._computeFilledCells();
      if (!filledKeys.has(`${pos.row},${pos.col}`)) {
        this._jitterAnims.push({ row: pos.row, col: pos.col, startedAt: performance.now() });
        sfxManager.play(SfxId.InvalidSelection);
        return;
      }
      sfxManager.play(SfxId.LevelSelect);
      this._onChamberSelected(def, levelIdx);
    }, { passive: false });

    canvasWrap.appendChild(canvas);
    el.appendChild(canvasWrap);

    // Instruction text
    const instruction = document.createElement('p');
    instruction.style.cssText = 'color:#aaa;font-size:0.9rem;text-align:center;margin:0;';
    const baseInstruction = this._formatInstructionText() ?? 'Click on an accessible level';
    instruction.textContent = isOversized
      ? `${baseInstruction}. Drag with the mouse to pan around the map.`
      : baseInstruction;
    el.appendChild(instruction);

    // Status text (shown when the sink is filled / chapter complete)
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'text-align:center;margin:4px 0;min-height:1.5em;';
    this._statusEl = statusEl;
    el.appendChild(statusEl);

    // Render the chapter map
    this._render(chapter);
  }

  // ─── Private – interaction ──────────────────────────────────────────────────

  /**
   * Compute the sink's remaining completion value: max(0, completion − completedEntityCount).
   * Returns 0 when the sink has no completion threshold set.
   */
  private _sinkRemaining(def: TileDef, chapter: ChapterDef, displayProgress: Set<number>): number {
    const completedEntityCount = chapter.levels.filter(l => displayProgress.has(l.id)).length;
    return Math.max(0, (def.completion ?? 0) - completedEntityCount);
  }

  private _showTooltip(clientX: number, clientY: number): void {
    const chapter = this._chapter;
    if (!chapter?.grid || !this._hover) { this._hideTooltip(); return; }
    const { row, col } = this._hover;
    const def = chapter.grid[row]?.[col];
    const displayProgress = this._getDisplayProgress();
    const filledKeys = this._computeFilledCells();

    if (def?.shape === PipeShape.Chamber && def.chamberContent === 'level' && def.levelIdx !== undefined) {
      const isFilled = filledKeys.has(`${row},${col}`);
      if (!isFilled) {
        this._tooltipEl.textContent = '???';
        this._tooltipEl.style.display = 'block';
        this._tooltipEl.style.left = `${clientX + 12}px`;
        this._tooltipEl.style.top  = `${clientY + 12}px`;
        return;
      }
      const entity = this._getEntityDefs()[def.levelIdx];
      if (entity) {
        this._tooltipEl.textContent = `${def.levelIdx + 1}: ${entity.name}`;
        this._tooltipEl.style.display = 'block';
        this._tooltipEl.style.left = `${clientX + 12}px`;
        this._tooltipEl.style.top  = `${clientY + 12}px`;
        return;
      }
    } else if (def?.shape === PipeShape.Source) {
      const entityDefs = this._getEntityDefs();
      const completedCount = entityDefs.filter(l => displayProgress.has(l.id)).length;
      this._tooltipEl.textContent = `${completedCount} completed level${completedCount === 1 ? '' : 's'}`;
      this._tooltipEl.style.display = 'block';
      this._tooltipEl.style.left = `${clientX + 12}px`;
      this._tooltipEl.style.top  = `${clientY + 12}px`;
      return;
    } else if (def?.shape === PipeShape.Sink) {
      const remaining = this._sinkRemaining(def, chapter, displayProgress);
      if (remaining > 0) {
        const text = `${remaining} level${remaining === 1 ? '' : 's'} remaining to complete chapter`;
        this._tooltipEl.textContent = text;
        this._tooltipEl.style.display = 'block';
        this._tooltipEl.style.left = `${clientX + 12}px`;
        this._tooltipEl.style.top  = `${clientY + 12}px`;
        return;
      }
    }
    this._hideTooltip();
  }

  private _hideTooltip(): void {
    this._tooltipEl.style.display = 'none';
  }

  /**
   * Convert a (clientX, clientY) pair into a grid cell position relative to the
   * chapter canvas.  Returns null when the point is outside the canvas bounds or
   * the canvas is not available.
   */
  /** Convert client coords to canvas intrinsic pixels (no pan applied). */
  private _clientToCanvasPx(
    clientX: number, clientY: number,
  ): { px: number; py: number; scaleX: number; scaleY: number } | null {
    const canvas = this._canvas;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      px:     (clientX - rect.left) * scaleX,
      py:     (clientY - rect.top)  * scaleY,
      scaleX,
      scaleY,
    };
  }

  private _canvasPosFromCoords(
    clientX: number,
    clientY: number,
    chapter: ChapterDef,
  ): { row: number; col: number } | null {
    const cp = this._clientToCanvasPx(clientX, clientY);
    if (!cp) return null;
    const { px: canvasPxX, py: canvasPxY } = cp;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const viewRows = this._viewRows;
    const viewCols = this._viewCols;
    // Map client coordinates to canvas pixel coordinates, then add the pan offset
    // to get the position in the full (panned) map coordinate space.
    const col = Math.floor((canvasPxX + this._panPixelX) / TILE_SIZE);
    const row = Math.floor((canvasPxY + this._panPixelY) / TILE_SIZE);
    // Bounds-check against the view window (only cells currently visible can be hit).
    const viewCol = Math.floor(canvasPxX / TILE_SIZE);
    const viewRow = Math.floor(canvasPxY / TILE_SIZE);
    if (viewRow < 0 || viewRow >= viewRows || viewCol < 0 || viewCol >= viewCols) return null;
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }

  private _canvasPos(e: MouseEvent, chapter: ChapterDef): { row: number; col: number } | null {
    return this._canvasPosFromCoords(e.clientX, e.clientY, chapter);
  }

  private _onMouseMove(e: MouseEvent, chapter: ChapterDef): void {
    this._hover = this._canvasPos(e, chapter);
    this._render(chapter);
  }

  private _onClick(e: MouseEvent, _campaign: CampaignDef, chapter: ChapterDef): void {
    const pos = this._canvasPos(e, chapter);
    if (!pos || !chapter.grid) return;

    const def = chapter.grid[pos.row]?.[pos.col];
    if (!def) return;

    const filledKeys = this._computeFilledCells();

    // Handle level chamber click
    if (def.shape !== PipeShape.Chamber || def.chamberContent !== 'level') return;

    const levelIdx = def.levelIdx;
    if (levelIdx === undefined) return;

    // Only start a level that has water reaching it
    if (!filledKeys.has(`${pos.row},${pos.col}`)) {
      // Trigger a brief jitter animation to indicate the tile cannot be accessed
      sfxManager.play(SfxId.InvalidSelection);
      this._jitterAnims.push({ row: pos.row, col: pos.col, startedAt: performance.now() });
      return;
    }

    sfxManager.play(SfxId.LevelSelect);
    this._onChamberSelected(def, levelIdx);
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

    const displayProgress = this._getDisplayProgress();
    const levelStars = loadLevelStars(this._getActiveCampaignId() ?? undefined);
    const levelWater = loadLevelWater(this._getActiveCampaignId() ?? undefined);

    const filledKeys = this._computeFilledCells();

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

    // Compute jitter offset for the most recently activated cell, if still active
    const now = performance.now();
    this._jitterAnims = this._jitterAnims.filter(j => now - j.startedAt < MapScreenBase.JITTER_DURATION_MS);
    let jitterCell: { row: number; col: number; dx: number; dy: number } | undefined;
    if (this._jitterAnims.length > 0) {
      const anim = this._jitterAnims[this._jitterAnims.length - 1];
      const t = (now - anim.startedAt) / MapScreenBase.JITTER_DURATION_MS;
      const amp = MapScreenBase.JITTER_AMPLITUDE * (1 - t);
      const dx = Math.round(amp * Math.sin(t * MapScreenBase.JITTER_CYCLES * 2 * Math.PI));
      jitterCell = { row: anim.row, col: anim.col, dx, dy: 0 };
    }

    // Apply pan transform so the view window scrolls over the full grid.
    // The canvas is sized to the view window (viewCols × viewRows tiles), and
    // the transform shifts the draw origin so that the panned region is visible.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this._viewCols * TILE_SIZE, this._viewRows * TILE_SIZE);
    ctx.clip();
    ctx.translate(-this._panPixelX, -this._panPixelY);

    renderChapterMapCanvas(
      ctx,
      grid,
      rows,
      cols,
      this._getEntityDefs(),
      filledKeys,
      { completedLevels: displayProgress, levelStars, levelWater },
      this._hover,
      accessibleLevelIdxs,
      this._decorations,
      jitterCell,
      this._floorTypes,
      chapter.style,
    );

    ctx.restore();

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
   * Update the stats bar text for the current chapter.
   */
  private _updateStats(chapter: ChapterDef, displayProgress: Set<number>): void {
    if (!this._statsEl) return;
    const statsText = this._formatStatsText(chapter, displayProgress);
    this._statsEl.textContent = statsText ?? '';
  }

  /**
   * Update the status line below the canvas.
   * Shows "✅ Level Complete!" when the sink is filled and all requirements are met,
   * unless the chapter is already marked as completed (status is shown in the stats bar).
   */
  private _updateStatus(chapter: ChapterDef, displayProgress: Set<number>, filledKeys: Set<string>): void {
    if (!this._statusEl) return;
    if (!this._shouldShowCompletionStatus(chapter, displayProgress)) {
      this._statusEl.innerHTML = '';
      return;
    }

    const grid = chapter.grid!;
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    // Find sink tile and check if it has water reaching it
    let sinkFilled = false;
    let sinkRemaining = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileDef = grid[r]?.[c];
        if (tileDef?.shape === PipeShape.Sink) {
          if (filledKeys.has(`${r},${c}`)) {
            sinkFilled = true;
            sinkRemaining = this._sinkRemaining(tileDef, chapter, displayProgress);
          }
          break;
        }
      }
      if (sinkFilled) break;
    }

    if (sinkFilled && sinkRemaining <= 0) {
      const isAlreadyCompleted = this._isMapCompleted(chapter, displayProgress);
      if (isAlreadyCompleted) {
        this._statusEl.innerHTML = ''; // "Complete"/"Mastered!" is already shown in the stats bar
      } else {
        this._statusEl.innerHTML =
          `<span style="color:${SUCCESS_COLOR};font-size:1rem;font-weight:bold;">✅ Level Complete!</span>`;
      }
    } else {
      this._statusEl.innerHTML = '';
    }
  }

  /**
   * Clamp `_panPixelX` and `_panPixelY` to valid bounds:
   *  1. Edge bounds: the map may not be panned past its edges (no empty space).
   *  2. Connected-bbox bounds: panning may not go more than one tile beyond the
   *     bounding rectangle of tiles reachable from the source.
   */
  private _clampPan(chapter: ChapterDef, viewRows: number, viewCols: number): void {
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const maxPanX = Math.max(0, (cols - viewCols) * TILE_SIZE);
    const maxPanY = Math.max(0, (rows - viewRows) * TILE_SIZE);

    // 1. Hard edge clamping – never show empty space beyond the map edge.
    this._panPixelX = Math.max(0, Math.min(maxPanX, this._panPixelX));
    this._panPixelY = Math.max(0, Math.min(maxPanY, this._panPixelY));

    // 2. Connected-bbox clamping – restrict panning to within one tile of the
    //    bounding rectangle of source-connected (reachable) tiles.
    if (!chapter.grid) return;
    const filledKeys = this._computeFilledCells();
    if (filledKeys.size === 0) return;

    let rMin = rows, rMax = -1, cMin = cols, cMax = -1;
    for (const key of filledKeys) {
      const comma = key.indexOf(',');
      const r = Number(key.slice(0, comma));
      const c = Number(key.slice(comma + 1));
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
    }

    // Allowed pan range: left edge ≥ (cMin-1)*TILE_SIZE; right edge ≤ (cMax+2)*TILE_SIZE.
    const bboxMinX = Math.max(0, (cMin - 1) * TILE_SIZE);
    const bboxMaxX = Math.min(maxPanX, (cMax + 2 - viewCols) * TILE_SIZE);
    const bboxMinY = Math.max(0, (rMin - 1) * TILE_SIZE);
    const bboxMaxY = Math.min(maxPanY, (rMax + 2 - viewRows) * TILE_SIZE);

    this._panPixelX = this._clampPanAxis(this._panPixelX, bboxMinX, bboxMaxX);
    this._panPixelY = this._clampPanAxis(this._panPixelY, bboxMinY, bboxMaxY);
  }

  private _clampPanAxis(current: number, preferredMin: number, preferredMax: number): number {
    if (preferredMin <= preferredMax) {
      return Math.max(preferredMin, Math.min(preferredMax, current));
    }
    return Math.max(preferredMax, Math.min(preferredMin, current));
  }

  /**
   * Set the initial pan position so that the latest unlocked chamber is
   * centered in the view window, clamped to valid bounds.
   */
  private _computeInitialSnap(chapter: ChapterDef, viewRows: number, viewCols: number): void {
    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;
    const grid = chapter.grid;

    // For maps that fit entirely within the view, no panning is needed.
    if (!grid || (rows <= viewRows && cols <= viewCols)) {
      this._panPixelX = 0;
      this._panPixelY = 0;
      return;
    }

    const filledKeys = this._computeFilledCells();

    // Find the highest-numbered accessible chamber tile to snap to.
    let targetRow = -1, targetCol = -1, highestNum = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!filledKeys.has(`${r},${c}`)) continue;
        const def = grid[r]?.[c];
        if (def?.shape === PipeShape.Chamber) {
          const num = this._getChamberSnapNum(def);
          if (num !== null && num > highestNum) {
            highestNum = num;
            targetRow = r;
            targetCol = c;
          }
        }
      }
    }

    if (targetRow < 0) {
      // No accessible chamber; center the source tile if available.
      const sourcePos = findMapTile(grid, rows, cols, PipeShape.Source);
      if (sourcePos) { targetRow = sourcePos.row; targetCol = sourcePos.col; }
      else { this._panPixelX = 0; this._panPixelY = 0; return; }
    }

    // Center the target tile in the view window.
    this._panPixelX = (targetCol + 0.5) * TILE_SIZE - (viewCols * TILE_SIZE) / 2;
    this._panPixelY = (targetRow + 0.5) * TILE_SIZE - (viewRows * TILE_SIZE) / 2;
    this._clampPan(chapter, viewRows, viewCols);
  }

  /**
   * Compute which grid cells are water-reachable from the source.
   * Water flows through pipes and into chambers; beyond a chamber,
   * water only continues when the chamber entity is completed.
   */
  private _computeFilledCells(): Set<string> {
    const chapter = this._chapter;
    if (!chapter?.grid) return new Set();

    const rows = chapter.rows ?? 3;
    const cols = chapter.cols ?? 6;

    const sourcePos = findMapTile(chapter.grid, rows, cols, PipeShape.Source);
    if (!sourcePos) return new Set();

    const getConns = (def: TileDef, isEntry: boolean): Set<Direction> => {
      if (def.shape === PipeShape.Chamber) {
        const isCompleted = this._isChamberEntityCompleted(def);
        // Water enters the chamber regardless; exits only if completed
        if (!isCompleted && !isEntry) return new Set();
        if (def.connections) return new Set(def.connections);
        return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
      }
      if (def.connections) return new Set(def.connections);
      if (def.shape === PipeShape.Source || def.shape === PipeShape.Sink) {
        return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
      }
      if (PIPE_SHAPES.has(def.shape)) {
        return tileDefConnections(def);
      }
      return new Set([Direction.North, Direction.East, Direction.South, Direction.West]);
    };

    return computeMapReachable(chapter.grid, rows, cols, sourcePos, getConns);
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
    const viewRows = this._viewRows;
    const viewCols = this._viewCols;

    // Re-render the base canvas each frame to clear previous particle frames
    const renderResult = this._renderCanvas(chapter);
    if (!renderResult) return;
    const { filledKeys, displayProgress } = renderResult;

    const positions = findChapterMapAnimPositions(grid, rows, cols, filledKeys);

    // All particle/animation effects that use grid-space coordinates are rendered
    // under the same pan transform that was applied in _renderCanvas.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewCols * TILE_SIZE, viewRows * TILE_SIZE);
    ctx.clip();
    ctx.translate(-this._panPixelX, -this._panPixelY);

    // Connector landing-strip lights – rendered before particles so they appear below droplets
    renderChapterMapConnectorLights(ctx, positions, now);

    // Sink vortex – spawn and render one vortex per sink tile
    for (const sink of positions.sinks) {
      if (now - this._lastVortexSpawn >= MapScreenBase.VORTEX_SPAWN_INTERVAL_MS) {
        spawnVortexParticle(this._vortexParticles);
        this._lastVortexSpawn = now;
      }
      const color = sink.isFilled ? SINK_WATER_COLOR : SINK_COLOR;
      renderVortex(ctx, this._vortexParticles, sink.x, sink.y, color);
    }

    // Source spray – spawn and render water-drop spray from the source
    if (positions.source) {
      const src = positions.source;
      if (now - this._lastSpraySpawn >= MapScreenBase.SPRAY_SPAWN_INTERVAL_MS) {
        spawnSourceSprayDrop(this._sourceSprayDrops);
        this._lastSpraySpawn = now;
      }
      // Source spray color matches the level screen: WATER_COLOR when the source is filled, SOURCE_COLOR when not.
      const sprayColor = src.isFilled ? WATER_COLOR : SOURCE_COLOR;
      renderSourceSpray(ctx, this._sourceSprayDrops, src.x, src.y, sprayColor);

      // Flow drops – water drops traveling from source to sink along filled pipe path.
      // Only shown once the chapter has been completed (auto-triggered on screen entry).
      // Use WATER_COLOR to match the flow drop color on the level screen.
      const sinkFilled = positions.sinks.some(s => s.isFilled);
      if (src.isFilled && sinkFilled && this._isChapterCompleted(chapter)) {
        const maxDrops = Math.max(10, filledKeys.size * 5);
        if (now - this._lastFlowSpawn >= MapScreenBase.FLOW_SPAWN_INTERVAL_MS) {
          spawnChapterMapFlowDrop(this._chapterMapFlowDrops, grid, rows, cols, filledKeys, src.row, src.col, maxDrops);
          this._lastFlowSpawn = now;
        }
        renderChapterMapFlowDrops(ctx, this._chapterMapFlowDrops, grid, rows, cols, filledKeys, WATER_COLOR);
      }
    }

    // Pipe bubbles – fizzing particles inside connected pipe tiles.
    if (now - this._lastBubbleSpawn >= MapScreenBase.BUBBLE_SPAWN_INTERVAL_MS) {
      spawnChapterMapBubble(this._bubbles, grid, rows, cols, filledKeys);
      this._lastBubbleSpawn = now;
    }
    renderBubbles(ctx, this._bubbles, WATER_COLOR);

    // Win tile glows – blue tile flash animation triggered by the chapter completion sequence
    if (this._winGlows.length > 0) {
      renderWinTileGlows(ctx, this._winGlows, now);
    }

    ctx.restore(); // Remove pan transform – canvas-coordinate effects follow

    // Edge flowers – shown only when the chapter is mastered.
    // These are positioned in canvas (view-window) coordinates, not grid coords.
    const isMastered = this._isChapterMastered(chapter, displayProgress);
    if (isMastered) {
      if (now - this._lastFlowerSpawn >= MapScreenBase.FLOWER_SPAWN_INTERVAL_MS) {
        this._spawnEdgeFlower(now, viewRows, viewCols);
        this._lastFlowerSpawn = now;
      }
      // Shared sway angle: ~25° amplitude, ~6 s period, synchronised across all flowers
      const swayAngle = Math.sin(now / MapScreenBase.FLOWER_SWAY_PERIOD) * 25 * Math.PI / 180;
      this._renderEdgeFlowers(ctx, now, swayAngle);
    }

    // Gold border – shown when the chapter is mastered
    if (this._canvas) {
      if (isMastered) {
        const t = (Math.sin(now / MapScreenBase.GOLD_BORDER_PERIOD) + 1) / 2;  // oscillates 0→1, period ~3.1 s
        const r = Math.round(180 + t * 75);         // 180–255
        const g = Math.round(130 + t * 85);         // 130–215
        const color = `rgb(${r},${g},0)`;
        this._borderColor = color;
        this._canvas.style.borderColor = color;
      } else {
        this._borderColor = CHAPTER_MAP_CANVAS_BORDER_COLOR;
        this._canvas.style.borderColor = CHAPTER_MAP_CANVAS_BORDER_COLOR;
      }
    }
  }

  // ─── Edge flower helpers ───────────────────────────────────────────────────

  /** Returns true if the chapter's completion flag is set. */
  private _isChapterCompleted(chapter: ChapterDef): boolean {
    const displayProgress = this._getDisplayProgress();
    return this._isMapCompleted(chapter, displayProgress);
  }

  /** Returns true when all entities are completed and mastery criteria are met. */
  private _isChapterMastered(chapter: ChapterDef, displayProgress: Set<number>): boolean {
    return this._isMapMastered(chapter, displayProgress);
  }

  /**
   * Spawn one edge flower on the next alternating side (left/right).
   * Flowers are placed at a random vertical position with a small horizontal jitter.
   */
  private _spawnEdgeFlower(now: number, viewRows: number, viewCols: number): void {
    const CELL = TILE_SIZE;
    const totalH = viewRows * CELL;
    const totalW = viewCols * CELL;
    // Alternate left/right to ensure both sides fill evenly
    const isLeft = (this._nextFlowerSide & 1) === 0;
    this._nextFlowerSide++;
    const jitter = (Math.random() - 0.5) * CELL * 0.3;
    const x = isLeft
      ? CELL * 0.18 + jitter
      : totalW - CELL * 0.18 + jitter;
    // Place new flower at the midpoint of the largest vertical gap among existing
    // flowers on the same edge, so spacing is evened out over time.
    const sideFlowerYs = this._edgeFlowers
      .filter(f => (isLeft ? f.x < totalW / 2 : f.x >= totalW / 2))
      .map(f => f.y)
      .sort((a, b) => a - b);
    let y: number;
    if (sideFlowerYs.length === 0) {
      y = Math.random() * totalH;
    } else {
      const bounds = [0, ...sideFlowerYs, totalH];
      let bestGapStart = 0;
      let bestGapSize = 0;
      for (let i = 0; i < bounds.length - 1; i++) {
        const gapSize = bounds[i + 1] - bounds[i];
        if (gapSize > bestGapSize) {
          bestGapSize = gapSize;
          bestGapStart = bounds[i];
        }
      }
      y = bestGapStart + bestGapSize / 2;
    }
    this._edgeFlowers.push({
      x,
      y,
      spawnedAt: now,
      variant: Math.floor(Math.random() * 8),
      baseRotation: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Render all live edge flowers, advancing their grow-in and fade-out animations.
   * Expired flowers are removed from the array.
   */
  private _renderEdgeFlowers(ctx: CanvasRenderingContext2D, now: number, swayAngle: number): void {
    let i = 0;
    while (i < this._edgeFlowers.length) {
      const f = this._edgeFlowers[i];
      const age = now - f.spawnedAt;
      if (age >= MapScreenBase.FLOWER_LIFETIME_MS) {
        this._edgeFlowers.splice(i, 1);
        continue;
      }
      const fadeStart = MapScreenBase.FLOWER_LIFETIME_MS - MapScreenBase.FLOWER_FADE_MS;
      const alpha = age >= fadeStart
        ? 1 - (age - fadeStart) / MapScreenBase.FLOWER_FADE_MS
        : 1;
      const scale = Math.min(1, age / MapScreenBase.FLOWER_GROW_MS);
      drawEdgeFlower(ctx, f.x, f.y, f.variant, scale, alpha, swayAngle, f.baseRotation);
      i++;
    }
  }

  // ─── Abstract methods ─────────────────────────────────────────────────────

  /** Returns the current display progress set (e.g. completed level IDs). */
  protected abstract _getDisplayProgress(): Set<number>;

  /** Returns the active campaign's ID (used for star/water loading), or null. */
  protected abstract _getActiveCampaignId(): string | null;

  /** Returns the set of completed chapter IDs, if available. */
  protected abstract _getCompletedChapters(): Set<number> | undefined;

  /** Called when the player presses the back button. */
  protected abstract _onShowLevelSelect(): void;

  /**
   * Called when the player clicks or taps an accessible chamber tile.
   * @param def - The TileDef of the clicked chamber tile.
   * @param chamberIdx - The levelIdx of the chamber tile.
   */
  protected abstract _onChamberSelected(def: TileDef, chamberIdx: number): void;

  /**
   * Returns true when this chamber tile's entity is completed (water can flow through).
   */
  protected abstract _isChamberEntityCompleted(def: TileDef): boolean;

  /**
   * Returns a snap priority number for a chamber tile (higher = snap to this tile
   * on initial display), or null if this tile is not a snap candidate.
   */
  protected abstract _getChamberSnapNum(def: TileDef): number | null;

  /** Returns entity definitions for chamber minimap rendering. */
  protected abstract _getEntityDefs(): LevelDef[];

  /**
   * Returns the stats text for the stats bar, or undefined to show nothing.
   */
  protected abstract _formatStatsText(chapter: ChapterDef, displayProgress: Set<number>): string | undefined;

  /** Returns true when the completion status line should be shown. */
  protected abstract _shouldShowCompletionStatus(chapter: ChapterDef, displayProgress: Set<number>): boolean;

  /** Returns true when the map is considered completed. */
  protected abstract _isMapCompleted(chapter: ChapterDef, displayProgress: Set<number>): boolean;

  /** Returns true when the map is considered mastered (triggers edge flowers, gold border). */
  protected abstract _isMapMastered(chapter: ChapterDef, displayProgress: Set<number>): boolean;

  /** Returns the back button text. */
  protected abstract _formatBackButtonText(): string;

  /**
   * Returns the instruction text shown below the map canvas, or null to use
   * the default ("Click on an accessible level").
   */
  protected abstract _formatInstructionText(): string | null;

  /**
   * Returns the chapter title text:
   *  - `undefined` → use default ("Chapter N: name")
   *  - `null` → hide the title entirely
   *  - string → show the provided text
   */
  protected abstract _formatChapterTitle(campaign: CampaignDef, chapterIdx: number, chapter: ChapterDef): string | null | undefined;
}
