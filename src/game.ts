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
const SINK_COLOR = '#8e44ad';
const TANK_COLOR = '#2196f3';
const TANK_WATER_COLOR = '#00bcd4';
const EMPTY_COLOR = '#2a2a4a';

/** Human-readable labels for pipe shapes in the inventory. */
const SHAPE_LABELS: Partial<Record<PipeShape, string>> = {
  [PipeShape.Straight]: 'Straight',
  [PipeShape.Elbow]:    'Elbow',
  [PipeShape.Tee]:      'T-piece',
  [PipeShape.Cross]:    'Cross',
};

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

    canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
    canvas.addEventListener('keydown', (e) => this._handleKey(e));

    this._showLevelSelect();
    this._loop();
  }

  // ─── Screen transitions ───────────────────────────────────────────────────

  private _showLevelSelect(): void {
    this.screen = GameScreen.LevelSelect;
    this.levelSelectEl.style.display = 'flex';
    this.playScreenEl.style.display = 'none';
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

      const label = SHAPE_LABELS[item.shape] ?? item.shape;
      el.innerHTML =
        `<span class="inv-shape">${label}</span>` +
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
    this.waterDisplayEl.style.color = w <= 5 ? '#e74c3c' : '#7ed321';
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
          ? (isTarget ? '#1e2a4a' : EMPTY_COLOR)
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
      color = isWater ? '#f39c12' : SOURCE_COLOR;
    } else if (shape === PipeShape.Sink) {
      color = isWater ? '#9b59b6' : SINK_COLOR;
    } else if (shape === PipeShape.Tank) {
      color = isWater ? TANK_WATER_COLOR : TANK_COLOR;
    } else {
      color = isFixed
        ? (isWater ? '#5dade2' : '#2980b9')
        : isWater ? WATER_COLOR : PIPE_COLOR;
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';

    if (shape === PipeShape.Empty) {
      // Draw a subtle dot so the tile is visually distinct from fixed tiles
      ctx.fillStyle = '#2a2a4a';
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
        ctx.fillStyle = '#fff';
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
      ctx.fillStyle = isWater ? '#004d60' : '#0d2b45';
      ctx.fillRect(-bw, -bh, bw * 2, bh * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(-bw, -bh, bw * 2, bh * 2);
      // Capacity label
      ctx.fillStyle = '#fff';
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
