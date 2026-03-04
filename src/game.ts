import { Board } from './board';
import { LEVELS } from './levels';
import { Tile } from './tile';
import { GameScreen, GameState, GridPos, InventoryItem, LevelDef, PipeShape } from './types';

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

/** Inline SVG icons for pipe shapes in the inventory. */
function _shapeIcon(shape: PipeShape): string {
  const S = 32;
  const H = S / 2;
  const sw = 5;
  const color = '#4a90d9';
  const base = `width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"`;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  switch (shape) {
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

  /** Most-recent mouse position over the canvas in canvas-pixel coordinates. */
  private mouseCanvasPos: { x: number; y: number } | null = null;

  /** Whether the Ctrl key is currently held. */
  private ctrlHeld = false;

  /** Tooltip element for displaying grid coordinates under Ctrl. */
  private readonly tooltipEl: HTMLElement;

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

    canvas.addEventListener('click',        (e) => this._handleCanvasClick(e));
    canvas.addEventListener('contextmenu',  (e) => this._handleCanvasRightClick(e));
    canvas.addEventListener('mousemove',    (e) => this._handleCanvasMouseMove(e));
    canvas.addEventListener('mouseleave',   ()  => this._hideTooltip());
    canvas.addEventListener('keydown',      (e) => this._handleKey(e));
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
  }

  // ─── Inventory bar rendering ──────────────────────────────────────────────

  private _renderInventoryBar(): void {
    if (!this.board) return;
    this.inventoryBarEl.innerHTML = '<h3 class="inv-title">Inventory</h3>';

    for (const item of this.board.inventory) {
      const el = document.createElement('div');
      el.classList.add('inv-item');
      if (item.shape === this.selectedShape) el.classList.add('selected');
      if (item.count === 0) el.classList.add('depleted');

      const icon = _shapeIcon(item.shape);
      el.innerHTML =
        `<span class="inv-shape">${icon}</span>` +
        `<span class="inv-count">×${item.count}</span>`;

      el.dataset['shape'] = item.shape;
      el.addEventListener('click', () => this._handleInventoryClick(item.shape, item.count));
      this.inventoryBarEl.appendChild(el);
    }
  }

  private _handleInventoryClick(shape: PipeShape, count: number): void {
    if (this.gameState !== GameState.Playing) return;
    if (count === 0) return;
    this.selectedShape = this.selectedShape === shape ? null : shape;
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

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const tile = board.grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const isWater   = filled.has(`${r},${c}`);
        const isFocused = this.focusPos.row === r && this.focusPos.col === c;
        const isTarget  = this.selectedShape !== null && tile.shape === PipeShape.Empty;

        // Tile background
        ctx.fillStyle = tile.shape === PipeShape.Empty
          ? (isTarget ? EMPTY_TARGET_COLOR : EMPTY_COLOR)
          : TILE_BG;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // Focus highlight
        if (isFocused) {
          ctx.strokeStyle = FOCUS_COLOR;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        this._drawPipe(x, y, tile, isWater, currentWater);
      }
    }
  }

  /** Draw a single pipe tile at canvas position (x, y). */
  private _drawPipe(x: number, y: number, tile: Tile, isWater: boolean, currentWater: number): void {
    const { shape, rotation, isFixed, capacity } = tile;
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
    } else if (shape === PipeShape.Straight) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
    } else if (shape === PipeShape.Elbow) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (shape === PipeShape.Tee) {
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(0, half);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(half, 0);
      ctx.stroke();
    } else if (shape === PipeShape.Cross) {
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
      if (this.board.placeInventoryTile(pos, this.selectedShape)) {
        this.selectedShape = null;
        this._renderInventoryBar();
        this._updateWaterDisplay();
        this._checkWinLose();
      }
    } else if (tile.shape !== PipeShape.Empty) {
      // Rotate existing pipe
      this.board.rotateTile(pos);
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
    }
  }

  private _handleCanvasMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseCanvasPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (this.ctrlHeld) {
      this._showTooltip(e.clientX, e.clientY);
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
            if (board.placeInventoryTile(focusPos, this.selectedShape)) {
              this.selectedShape = null;
              this._renderInventoryBar();
              this._updateWaterDisplay();
              this._checkWinLose();
            }
          }
        } else {
          board.rotateTile(focusPos);
          this._updateWaterDisplay();
          this._checkWinLose();
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
}

// Re-export for backward compatibility with tests that import InventoryItem via game.ts
export type { InventoryItem, LevelDef };
