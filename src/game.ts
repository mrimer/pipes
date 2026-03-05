import { Board, GOLD_PIPE_SHAPES } from './board';
import { LEVELS } from './levels';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape, Rotation } from './types';

const TILE_SIZE = 64; // px
const LINE_WIDTH = 10; // pipe stroke width in px
const PIPE_COLOR = '#4a90d9';
const WATER_COLOR = '#7ed321';
const BG_COLOR = '#1a1a2e';
const TILE_BG = '#16213e';
const FOCUS_COLOR = '#f0c040';
const SOURCE_COLOR = '#e67e22';
const SOURCE_WATER_COLOR = '#f39c12';
const SINK_COLOR = '#8e44ad';
const SINK_WATER_COLOR = '#9b59b6';
const TANK_COLOR = '#2196f3';
const TANK_WATER_COLOR = '#00bcd4';
const TANK_FILL_COLOR = '#0d2b45';
const TANK_FILL_WATER_COLOR = '#004d60';
const FIXED_PIPE_COLOR = '#2980b9';
const FIXED_PIPE_WATER_COLOR = '#5dade2';
const EMPTY_COLOR = '#2a2a4a';
const EMPTY_TARGET_COLOR = '#1e2a4a';
const LOW_WATER_COLOR = '#e74c3c';
const LABEL_COLOR = '#fff';
const DIRT_COLOR = '#8b5a2b';
const DIRT_WATER_COLOR = '#c4a265';
const DIRT_FILL_COLOR = '#3d2b1f';
const DIRT_FILL_WATER_COLOR = '#5a3d2b';
const DIRT_COST_COLOR = '#e74c3c';
const CONTAINER_COLOR = '#f0a500';
const CONTAINER_WATER_COLOR = '#ffd04f';
const CONTAINER_FILL_COLOR = '#3d2b00';
const CONTAINER_FILL_WATER_COLOR = '#5a4000';
const GRANITE_COLOR = '#9ca3af';
const GRANITE_FILL_COLOR = '#374151';
const GOLD_PIPE_COLOR = '#ffd700';
const GOLD_PIPE_WATER_COLOR = '#ffec6e';
const GOLD_SPACE_BASE_COLOR = '#3d2b00';
const GOLD_SPACE_SHIMMER_COLOR = 'rgba(255,215,0,';  // prefix; alpha appended at runtime
const GOLD_SPACE_BORDER_COLOR = '#b8860b';

/** Unambiguous two-character abbreviation for each pipe shape, used inside ItemContainer tiles. */
const SHAPE_ABBREV: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]:     'St',
  [PipeShape.Elbow]:        'El',
  [PipeShape.Tee]:          'Te',
  [PipeShape.Cross]:        'Cr',
  [PipeShape.GoldStraight]: 'St',
  [PipeShape.GoldElbow]:    'El',
  [PipeShape.GoldTee]:      'Te',
  [PipeShape.GoldCross]:    'Cr',
};
function _shapeIcon(shape: PipeShape, color = '#4a90d9'): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  // Map gold pipe shapes to their base shape for icon rendering
  let drawShape = shape;
  if (shape === PipeShape.GoldStraight) drawShape = PipeShape.Straight;
  else if (shape === PipeShape.GoldElbow) drawShape = PipeShape.Elbow;
  else if (shape === PipeShape.GoldTee) drawShape = PipeShape.Tee;
  else if (shape === PipeShape.GoldCross) drawShape = PipeShape.Cross;
  switch (drawShape) {
    case PipeShape.Straight:
      return `<svg ${base}>${line(H, 0, H, S)}</svg>`;
    case PipeShape.Elbow:
      return `<svg ${base}><polyline points="${H},0 ${H},${H} ${S},${H}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case PipeShape.Tee:
      return `<svg ${base}>${line(H, 0, H, S)}${line(H, H, S, H)}</svg>`;
    case PipeShape.Cross:
      return `<svg ${base}>${line(H, 0, H, S)}${line(0, H, S, H)}</svg>`;
    default:
      return '';
  }
}

/**
 * Manages the game loop, rendering, and user input for the Pipes puzzle.
 * Handles both the level-selection menu and the active play screen.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  // Screens / overlays (managed by DOM, not canvas)
  private readonly levelSelectEl: HTMLElement;
  private readonly levelListEl: HTMLElement;
  private readonly playScreenEl: HTMLElement;
  private readonly inventoryBarEl: HTMLElement;
  private readonly waterDisplayEl: HTMLElement;
  private readonly winModalEl: HTMLElement;
  private readonly gameoverModalEl: HTMLElement;
  private readonly gameoverMsgEl: HTMLElement;

  private screen: GameScreen = GameScreen.LevelSelect;
  private gameState: GameState = GameState.Playing;
  private board: Board | null = null;
  private currentLevel: LevelDef | null = null;
  private focusPos: GridPos = { row: 0, col: 0 };

  /** The pipe shape currently selected from the inventory, ready to be placed. */
  private selectedShape: PipeShape | null = null;

  /** Rotation that will be applied when the pending inventory item is placed. */
  private pendingRotation: Rotation = 0;

  /** Last-used placement rotation per pipe shape, so the same orientation is reused next time. */
  private readonly lastPlacedRotations = new Map<PipeShape, Rotation>();

  /** Most-recent mouse position over the canvas in canvas-pixel coordinates. */
  private mouseCanvasPos: { x: number; y: number } | null = null;

  /** Whether the Ctrl key is currently held. */
  private ctrlHeld = false;

  /** Tooltip element for displaying grid coordinates under Ctrl. */
  private readonly tooltipEl: HTMLElement;

  /** Floating error message element shown briefly when an action is blocked. */
  private readonly errorFlashEl: HTMLElement;
  /** Timer ID for auto-hiding the error flash message. */
  private _errorFlashTimer: ReturnType<typeof setTimeout> | null = null;

  /** Modal overlay for confirming a progress reset. */
  private readonly resetConfirmModalEl: HTMLElement;

  /** Levels that have been successfully completed (persisted in localStorage). */
  private completedLevels: Set<number>;

  constructor(
    canvas: HTMLCanvasElement,
    levelSelectEl: HTMLElement,
    levelListEl: HTMLElement,
    playScreenEl: HTMLElement,
    inventoryBarEl: HTMLElement,
    waterDisplayEl: HTMLElement,
    winModalEl: HTMLElement,
    gameoverModalEl: HTMLElement,
    gameoverMsgEl: HTMLElement,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context');
    this.ctx = ctx;

    this.levelSelectEl = levelSelectEl;
    this.levelListEl = levelListEl;
    this.playScreenEl = playScreenEl;
    this.inventoryBarEl = inventoryBarEl;
    this.waterDisplayEl = waterDisplayEl;
    this.winModalEl = winModalEl;
    this.gameoverModalEl = gameoverModalEl;
    this.gameoverMsgEl = gameoverMsgEl;

    // Load persisted completions
    this.completedLevels = this._loadCompletedLevels();

    // Create the tooltip element for Ctrl+hover grid coordinates
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText =
      'display:none;position:fixed;background:#16213e;color:#eee;border:1px solid #4a90d9;' +
      'border-radius:4px;padding:4px 8px;font-size:0.8rem;pointer-events:none;z-index:50;';
    document.body.appendChild(this.tooltipEl);

    // Create the error-flash element for brief action-blocked messages
    this.errorFlashEl = document.createElement('div');
    this.errorFlashEl.style.cssText =
      'display:none;position:fixed;top:80px;left:50%;transform:translateX(-50%);' +
      'background:#c0392b;color:#fff;border:2px solid #e74c3c;' +
      'border-radius:6px;padding:8px 18px;font-size:0.95rem;pointer-events:none;z-index:60;' +
      'text-align:center;max-width:360px;';
    document.body.appendChild(this.errorFlashEl);

    // Create the reset-progress confirmation modal
    this.resetConfirmModalEl = document.createElement('div');
    this.resetConfirmModalEl.style.cssText =
      'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);' +
      'justify-content:center;align-items:center;z-index:100;';
    const resetModalBox = document.createElement('div');
    resetModalBox.style.cssText =
      'background:#16213e;border:3px solid #e74c3c;border-radius:10px;' +
      'padding:32px 40px;text-align:center;display:flex;flex-direction:column;' +
      'gap:16px;min-width:280px;';
    const resetTitle = document.createElement('h2');
    resetTitle.textContent = '⚠️ Reset Progress?';
    const resetMsg = document.createElement('p');
    resetMsg.style.cssText = 'font-size:0.95rem;color:#aaa;';
    resetMsg.textContent = 'This will remove all level completion data. Are you sure?';
    const resetActions = document.createElement('div');
    resetActions.style.cssText = 'display:flex;gap:12px;justify-content:center;';
    const resetCancelBtn = document.createElement('button');
    resetCancelBtn.textContent = 'Cancel';
    resetCancelBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#2a2a4a;color:#aaa;' +
      'border:1px solid #555;border-radius:6px;cursor:pointer;';
    resetCancelBtn.addEventListener('click', () => {
      this.resetConfirmModalEl.style.display = 'none';
    });
    const resetConfirmBtn = document.createElement('button');
    resetConfirmBtn.textContent = 'Reset';
    resetConfirmBtn.style.cssText =
      'padding:10px 24px;font-size:1rem;background:#e74c3c;color:#fff;' +
      'border:none;border-radius:6px;cursor:pointer;';
    resetConfirmBtn.addEventListener('click', () => {
      this._resetProgress();
      this.resetConfirmModalEl.style.display = 'none';
    });
    resetActions.appendChild(resetCancelBtn);
    resetActions.appendChild(resetConfirmBtn);
    resetModalBox.appendChild(resetTitle);
    resetModalBox.appendChild(resetMsg);
    resetModalBox.appendChild(resetActions);
    this.resetConfirmModalEl.appendChild(resetModalBox);
    document.body.appendChild(this.resetConfirmModalEl);

    canvas.addEventListener('click',        (e) => this._handleCanvasClick(e));
    canvas.addEventListener('contextmenu',  (e) => this._handleCanvasRightClick(e));
    canvas.addEventListener('mousemove',    (e) => this._handleCanvasMouseMove(e));
    canvas.addEventListener('mouseleave',   ()  => this._hideTooltip());
    canvas.addEventListener('keydown',      (e) => this._handleKey(e));
    canvas.addEventListener('wheel',        (e) => this._handleCanvasWheel(e), { passive: false });
    document.addEventListener('keydown',    (e) => this._handleDocKeyDown(e));
    document.addEventListener('keyup',      (e) => this._handleDocKeyUp(e));

    this._showLevelSelect();
    this._loop();
  }

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(): void {
    this.screen = GameScreen.LevelSelect;
    this.levelSelectEl.style.display = 'flex';
    this.playScreenEl.style.display = 'none';
    // Explicitly hide both modal overlays so they cannot cover the level-select
    // screen when returning from a completed or failed level.
    this.winModalEl.style.display = 'none';
    this.gameoverModalEl.style.display = 'none';
    this._renderLevelList();
  }

  /** Start (or restart) the given level. */
  startLevel(levelId: number): void {
    const level = LEVELS.find((l) => l.id === levelId);
    if (!level) return;

    this.currentLevel = level;
    this.board = new Board(level.rows, level.cols, level);
    this.gameState = GameState.Playing;
    this.focusPos = { row: 0, col: 0 };
    this.selectedShape = null;
    this.pendingRotation = 0;

    this.canvas.width  = level.cols * TILE_SIZE;
    this.canvas.height = level.rows * TILE_SIZE;

    this.screen = GameScreen.Play;
    this.levelSelectEl.style.display = 'none';
    this.playScreenEl.style.display  = 'flex';
    this.winModalEl.style.display      = 'none';
    this.gameoverModalEl.style.display = 'none';

    this._renderInventoryBar();
    this._updateWaterDisplay();
    this.canvas.focus();
  }

  // ─── Level-select rendering ───────────────────────────────────────────────

  private _renderLevelList(): void {
    this.levelListEl.innerHTML = '';
    for (const level of LEVELS) {
      const isCompleted = this.completedLevels.has(level.id);
      const isLocked = level.id > 1 && !this.completedLevels.has(level.id - 1);

      const btn = document.createElement('button');
      btn.classList.add('level-btn');
      if (isLocked)    btn.classList.add('locked');
      if (isCompleted) btn.classList.add('completed');

      const icon = isLocked ? '🔒' : isCompleted ? '✅' : '▶';
      btn.textContent = `${icon} Level ${level.id}: ${level.name}`;
      btn.disabled = isLocked;

      if (!isLocked) {
        btn.addEventListener('click', () => this.startLevel(level.id));
      }
      this.levelListEl.appendChild(btn);
    }

    // Reset-progress button at the bottom of the level list
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄 Reset Progress';
    resetBtn.style.cssText =
      'margin-top:8px;padding:10px 20px;font-size:0.9rem;background:#2a2a4a;color:#e74c3c;' +
      'border:1px solid #e74c3c;border-radius:6px;cursor:pointer;width:100%;';
    resetBtn.addEventListener('click', () => {
      this.resetConfirmModalEl.style.display = 'flex';
    });
    this.levelListEl.appendChild(resetBtn);
  }

  // ─── Inventory bar rendering ──────────────────────────────────────────────

  private _renderInventoryBar(): void {
    if (!this.board) return;
    this.inventoryBarEl.innerHTML = '<h3 class="inv-title">Inventory</h3>';

    const bonuses = this.board.getContainerBonuses();

    for (const item of this.board.inventory) {
      const effectiveCount = item.count + (bonuses.get(item.shape) ?? 0);
      // Gold pipe items are only shown when there is at least one available
      if (GOLD_PIPE_SHAPES.has(item.shape) && effectiveCount <= 0) continue;

      const isGold = GOLD_PIPE_SHAPES.has(item.shape);
      const el = document.createElement('div');
      el.classList.add('inv-item');
      if (isGold) el.classList.add('gold');
      if (item.shape === this.selectedShape) el.classList.add('selected');
      if (effectiveCount === 0) el.classList.add('depleted');

      const icon = _shapeIcon(item.shape, isGold ? GOLD_PIPE_COLOR : '#4a90d9');
      el.innerHTML =
        `<span class="inv-shape">${icon}</span>` +
        `<span class="inv-count">×${effectiveCount}</span>`;

      el.dataset['shape'] = item.shape;
      el.addEventListener('click', () => this._handleInventoryClick(item.shape, effectiveCount));
      this.inventoryBarEl.appendChild(el);
    }
  }

  private _handleInventoryClick(shape: PipeShape, count: number): void {
    if (this.gameState !== GameState.Playing) return;
    if (count === 0) return;
    this.selectedShape = this.selectedShape === shape ? null : shape;
    if (this.selectedShape !== null) {
      this.pendingRotation = this.lastPlacedRotations.get(shape) ?? 0;
    }
    this._renderInventoryBar();
  }

  // ─── Water display ────────────────────────────────────────────────────────

  private _updateWaterDisplay(): void {
    if (!this.board) return;
    const w = this.board.getCurrentWater();
    this.waterDisplayEl.textContent = `💧 Water: ${w}`;
    this.waterDisplayEl.style.color = w <= 5 ? LOW_WATER_COLOR : WATER_COLOR;
  }

  // ─── Main render loop ──────────────────────────────────────────────────────

  private _loop(): void {
    if (this.screen === GameScreen.Play) this._renderBoard();
    requestAnimationFrame(() => this._loop());
  }

  private _renderBoard(): void {
    if (!this.board) return;
    const { ctx, canvas, board } = this;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const filled = board.getFilledPositions();
    const currentWater = board.getCurrentWater();

    // Shimmer phase for gold spaces (oscillates smoothly over time)
    const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(Date.now() / 500) + 1) / 2);

    const selectedIsGold = this.selectedShape !== null && GOLD_PIPE_SHAPES.has(this.selectedShape);

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const tile = board.grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const isWater    = filled.has(`${r},${c}`);
        const isFocused  = this.focusPos.row === r && this.focusPos.col === c;
        const isGoldCell = board.goldSpaces.has(`${r},${c}`);

        // A cell is a valid placement target only when the selected shape matches the cell type
        const isTarget = this.selectedShape !== null &&
          tile.shape === PipeShape.Empty &&
          (isGoldCell === selectedIsGold);

        // Tile background
        if (tile.shape === PipeShape.Empty) {
          if (isGoldCell) {
            // Shimmering gold background
            ctx.fillStyle = GOLD_SPACE_BASE_COLOR;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            ctx.fillStyle = `${GOLD_SPACE_SHIMMER_COLOR}${shimmerAlpha.toFixed(3)})`;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            // Gold border to make the cell clearly distinct
            ctx.strokeStyle = GOLD_SPACE_BORDER_COLOR;
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            // Brighten when it's a valid drop target
            if (isTarget) {
              ctx.fillStyle = 'rgba(255,215,0,0.2)';
              ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }
          } else {
            ctx.fillStyle = isTarget ? EMPTY_TARGET_COLOR : EMPTY_COLOR;
            ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        } else {
          ctx.fillStyle = TILE_BG;
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }

        // Focus highlight
        if (isFocused) {
          ctx.strokeStyle = FOCUS_COLOR;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        this._drawPipe(x, y, tile, isWater, currentWater);
      }
    }

    // Draw semi-transparent hover preview of the pending inventory item
    if (this.selectedShape !== null && this.mouseCanvasPos) {
      const hoverCol = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
      const hoverRow = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
      if (hoverRow >= 0 && hoverRow < board.rows && hoverCol >= 0 && hoverCol < board.cols) {
        const hoverTile = board.grid[hoverRow][hoverCol];
        const isGoldCell = board.goldSpaces.has(`${hoverRow},${hoverCol}`);
        if (hoverTile.shape === PipeShape.Empty && isGoldCell === selectedIsGold) {
          const previewTile = new Tile(this.selectedShape, this.pendingRotation);
          const px = hoverCol * TILE_SIZE;
          const py = hoverRow * TILE_SIZE;
          ctx.save();
          ctx.globalAlpha = 0.5;
          this._drawPipe(px, py, previewTile, false, currentWater);
          ctx.restore();
        }
      }
    }
  }

  /** Draw a single pipe tile at canvas position (x, y). */
  private _drawPipe(x: number, y: number, tile: Tile, isWater: boolean, currentWater: number): void {
    const { shape, rotation, isFixed, capacity, dirtCost, itemShape } = tile;
    const { ctx } = this;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;
    const half = TILE_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);

    let color: string;
    if (shape === PipeShape.Source) {
      color = isWater ? SOURCE_WATER_COLOR : SOURCE_COLOR;
    } else if (shape === PipeShape.Sink) {
      color = isWater ? SINK_WATER_COLOR : SINK_COLOR;
    } else if (shape === PipeShape.Tank) {
      color = isWater ? TANK_WATER_COLOR : TANK_COLOR;
    } else if (shape === PipeShape.DirtBlock) {
      color = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
    } else if (shape === PipeShape.ItemContainer) {
      color = isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR;
    } else if (shape === PipeShape.Granite) {
      color = GRANITE_COLOR;
    } else if (GOLD_PIPE_SHAPES.has(shape)) {
      color = isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR;
    } else {
      color = isFixed
        ? (isWater ? FIXED_PIPE_WATER_COLOR : FIXED_PIPE_COLOR)
        : isWater ? WATER_COLOR : PIPE_COLOR;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';

    if (shape === PipeShape.Empty) {
      // Draw a subtle dot so the tile is visually distinct from fixed tiles
      ctx.fillStyle = EMPTY_COLOR;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === PipeShape.Straight || shape === PipeShape.GoldStraight) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
    } else if (shape === PipeShape.Elbow || shape === PipeShape.GoldElbow) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (shape === PipeShape.Tee || shape === PipeShape.GoldTee) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (shape === PipeShape.Cross || shape === PipeShape.GoldCross) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (shape === PipeShape.Source || shape === PipeShape.Sink) {
      // Filled circle + four radiating lines
      ctx.beginPath();
      ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * half, Math.sin(angle) * half);
        ctx.stroke();
      }
      // Show capacity number on Source
      if (shape === PipeShape.Source) {
        ctx.restore();
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(currentWater), 0, 0);
      }
    } else if (shape === PipeShape.Tank) {
      // Rectangle body
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      const bw = half * 0.7;
      const bh = half * 0.7;
      ctx.fillStyle = isWater ? TANK_FILL_WATER_COLOR : TANK_FILL_COLOR;
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      // Capacity label
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(capacity), 0, 0);
      // Connection stubs (lines from box edges to tile edges)
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
    } else if (shape === PipeShape.DirtBlock) {
      // Dirt block – brown rectangle with a red negative cost label
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      const bw = half * 0.7;
      const bh = half * 0.7;
      ctx.fillStyle = isWater ? DIRT_FILL_WATER_COLOR : DIRT_FILL_COLOR;
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = isWater ? DIRT_WATER_COLOR : DIRT_COLOR;
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      // Show cost label in red when not washed away; fade when water is flowing through
      ctx.fillStyle = isWater ? DIRT_WATER_COLOR : DIRT_COST_COLOR;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`-${dirtCost}`, 0, 0);
      // Connection stubs (lines from box edges to tile edges)
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
    } else if (shape === PipeShape.ItemContainer) {
      // Item container – amber/gold rectangle with a small pipe-shape label inside
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      const bw = half * 0.7;
      const bh = half * 0.7;
      ctx.fillStyle = isWater ? CONTAINER_FILL_WATER_COLOR : CONTAINER_FILL_COLOR;
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      // Show item shape abbreviation label (use lookup map to avoid single-char ambiguities)
      // Prefix gold-type items with 'G' to distinguish them visually
      const isGoldItem = itemShape !== null && GOLD_PIPE_SHAPES.has(itemShape);
      const abbrev = (itemShape && SHAPE_ABBREV[itemShape]) ?? '?';
      const label = isGoldItem ? `G${abbrev}` : abbrev;
      ctx.fillStyle = isGoldItem
        ? (isWater ? GOLD_PIPE_WATER_COLOR : GOLD_PIPE_COLOR)
        : (isWater ? CONTAINER_WATER_COLOR : CONTAINER_COLOR);
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
      // Connection stubs
      ctx.strokeStyle = color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -bh);   ctx.lineTo(0, -half); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, bh);    ctx.lineTo(0, half);  ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw, 0);   ctx.lineTo(-half, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bw, 0);    ctx.lineTo(half, 0);  ctx.stroke();
    } else if (shape === PipeShape.Granite) {
      // Granite – solid impassable stone block; no connections
      ctx.restore();
      ctx.save();
      ctx.translate(cx, cy);
      const bw = half * 0.7;
      const bh = half * 0.7;
      ctx.fillStyle = GRANITE_FILL_COLOR;
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = GRANITE_COLOR;
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      // Stone texture – a few crack-like lines
      ctx.strokeStyle = GRANITE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-bw + 4, -bh + 10); ctx.lineTo(bw - 6, -bh + 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw + 2, 2);         ctx.lineTo(bw - 8, 8);        ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw + 6, bh - 14);   ctx.lineTo(bw - 4, bh - 8);  ctx.stroke();
    }

    ctx.restore();
  }

  // ─── Win / game-over handling ─────────────────────────────────────────────

  private _checkWinLose(): void {
    if (!this.board || this.gameState !== GameState.Playing) return;

    if (this.board.isSolved()) {
      this.gameState = GameState.Won;
      this._markLevelCompleted(this.currentLevel!.id);
      this.winModalEl.style.display = 'flex';
      return;
    }

    if (this.board.getCurrentWater() <= 0) {
      this.gameState = GameState.GameOver;
      this.gameoverMsgEl.textContent = 'The tank ran dry! Reset the level or return to the menu.';
      this.gameoverModalEl.style.display = 'flex';
    }
  }

  // ─── Input handlers ────────────────────────────────────────────────────────

  private _handleCanvasClick(e: MouseEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left)  / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)   / TILE_SIZE);
    const pos: GridPos = { row, col };
    const tile = this.board.getTile(pos);
    if (!tile) return;

    if (this.selectedShape !== null && tile.shape === PipeShape.Empty) {
      // Place pipe from inventory
      if (this.board.placeInventoryTile(pos, this.selectedShape, this.pendingRotation)) {
        // Remember the rotation used so the next placement defaults to it
        const placedShape = this.selectedShape;
        this.lastPlacedRotations.set(placedShape, this.pendingRotation);
        // Keep selected shape if there is still stock remaining
        const inv = this.board.inventory.find((it) => it.shape === placedShape);
        const bonuses = this.board.getContainerBonuses();
        const effectiveCount = (inv?.count ?? 0) + (bonuses.get(placedShape) ?? 0);
        if (effectiveCount <= 0) {
          this.selectedShape = null;
        }
        this._renderInventoryBar();
        this._updateWaterDisplay();
        this._checkWinLose();
      }
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe
      this.board.rotateTile(pos);
      this._renderInventoryBar();
      this._updateWaterDisplay();
      this._checkWinLose();
    }
  }

  private _handleCanvasRightClick(e: MouseEvent): void {
    e.preventDefault();
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (!this.board) return;

    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top)  / TILE_SIZE);

    if (this.board.reclaimTile({ row, col })) {
      this._renderInventoryBar();
      this._updateWaterDisplay();
    } else if (this.board.lastError) {
      this._showErrorFlash(this.board.lastError);
    }
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (this.ctrlHeld) {
      this._showTooltip(e.clientX, e.clientY);
    }
  }

  private _handleCanvasWheel(e: WheelEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (this.gameState !== GameState.Playing) return;
    if (this.selectedShape === null) return;
    e.preventDefault();
    // Scroll down → rotate clockwise; scroll up → rotate counter-clockwise
    if (e.deltaY > 0) {
      this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
    } else {
      this.pendingRotation = ((this.pendingRotation + 270) % 360) as Rotation;
    }
  }

  private _handleDocKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Control' && !this.ctrlHeld) {
      this.ctrlHeld = true;
      if (this.mouseCanvasPos) {
        const rect = this.canvas.getBoundingClientRect();
        this._showTooltip(
          this.mouseCanvasPos.x + rect.left,
          this.mouseCanvasPos.y + rect.top,
        );
      }
    }
  }

  private _handleDocKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control') {
      this.ctrlHeld = false;
      this._hideTooltip();
    }
  }

  private _showTooltip(clientX: number, clientY: number): void {
    if (this.screen !== GameScreen.Play || !this.mouseCanvasPos) return;
    const col = Math.floor(this.mouseCanvasPos.x / TILE_SIZE);
    const row = Math.floor(this.mouseCanvasPos.y / TILE_SIZE);
    if (!this.board || row < 0 || row >= this.board.rows || col < 0 || col >= this.board.cols) {
      this._hideTooltip();
      return;
    }
    // Display as (row, col) to match the GridPos convention used throughout the codebase.
    this.tooltipEl.textContent = `(${row}, ${col})`;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${clientX + 12}px`;
    this.tooltipEl.style.top  = `${clientY + 12}px`;
  }

  private _hideTooltip(): void {
    this.tooltipEl.style.display = 'none';
  }

  /** Show a brief error message that auto-dismisses after ~2 seconds. */
  private _showErrorFlash(message: string): void {
    this.errorFlashEl.textContent = message;
    this.errorFlashEl.style.display = 'block';
    if (this._errorFlashTimer !== null) clearTimeout(this._errorFlashTimer);
    this._errorFlashTimer = setTimeout(() => {
      this.errorFlashEl.style.display = 'none';
      this._errorFlashTimer = null;
    }, 2000);
  }

  private _handleKey(e: KeyboardEvent): void {
    if (this.screen !== GameScreen.Play) return;
    if (!this.board) return;
    const { focusPos, board } = this;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (focusPos.row > 0) this.focusPos = { ...focusPos, row: focusPos.row - 1 };
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (focusPos.row < board.rows - 1) this.focusPos = { ...focusPos, row: focusPos.row + 1 };
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (focusPos.col > 0) this.focusPos = { ...focusPos, col: focusPos.col - 1 };
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (focusPos.col < board.cols - 1) this.focusPos = { ...focusPos, col: focusPos.col + 1 };
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          const tile = board.getTile(focusPos);
          if (tile?.shape === PipeShape.Empty) {
            if (board.placeInventoryTile(focusPos, this.selectedShape, this.pendingRotation)) {
              // Remember the rotation used so the next placement defaults to it
              const placedShape = this.selectedShape;
              this.lastPlacedRotations.set(placedShape, this.pendingRotation);
              // Keep selected shape if there is still stock remaining
              const inv = board.inventory.find((it) => it.shape === placedShape);
              const bonuses = board.getContainerBonuses();
              const effectiveCount = (inv?.count ?? 0) + (bonuses.get(placedShape) ?? 0);
              if (effectiveCount <= 0) {
                this.selectedShape = null;
              }
              this._renderInventoryBar();
              this._updateWaterDisplay();
              this._checkWinLose();
            }
          }
        } else {
          board.rotateTile(focusPos);
          this._renderInventoryBar();
          this._updateWaterDisplay();
          this._checkWinLose();
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (this.gameState !== GameState.Playing) break;
        if (this.selectedShape !== null) {
          this.pendingRotation = ((this.pendingRotation + 90) % 360) as Rotation;
        }
        break;
      case 'Escape':
        this.selectedShape = null;
        this._renderInventoryBar();
        break;
    }
  }

  // ─── Public API called by main.ts button handlers ─────────────────────────

  /** Retry the current level from scratch. */
  retryLevel(): void {
    if (this.currentLevel) this.startLevel(this.currentLevel.id);
  }

  /** Exit to the level-selection screen. */
  exitToMenu(): void {
    this._showLevelSelect();
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────

  private _loadCompletedLevels(): Set<number> {
    try {
      const raw = localStorage.getItem('pipes_completed');
      if (raw) {
        const ids = JSON.parse(raw) as number[];
        return new Set(ids);
      }
    } catch {
      // ignore parse errors
    }
    return new Set<number>();
  }

  private _markLevelCompleted(levelId: number): void {
    this.completedLevels.add(levelId);
    try {
      localStorage.setItem('pipes_completed', JSON.stringify([...this.completedLevels]));
    } catch {
      // ignore storage errors
    }
  }

  /** Clear all level-completion progress and refresh the level list. */
  private _resetProgress(): void {
    this.completedLevels.clear();
    try {
      localStorage.removeItem('pipes_completed');
    } catch {
      // ignore storage errors
    }
    this._renderLevelList();
  }
}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
