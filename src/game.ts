import { Board } from './board';
import { GridPos, PipeShape } from './types';

const TILE_SIZE = 64; // px
const LINE_WIDTH = 10; // pipe stroke width in px
const PIPE_COLOR = '#4a90d9';
const WATER_COLOR = '#7ed321';
const BG_COLOR = '#1a1a2e';
const TILE_BG = '#16213e';
const FOCUS_COLOR = '#f0c040';
const SOURCE_COLOR = '#e67e22';
const SINK_COLOR = '#8e44ad';

/**
 * Manages the game loop, rendering, and user input for the Pipes puzzle.
 */
export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly messageEl: HTMLElement;
  private board: Board;
  private solved = false;
  private focusPos: GridPos = { row: 0, col: 0 };

  private readonly rows: number;
  private readonly cols: number;

  constructor(canvas: HTMLCanvasElement, messageEl: HTMLElement, rows = 6, cols = 6) {
    this.canvas = canvas;
    this.rows = rows;
    this.cols = cols;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context');
    this.ctx = ctx;
    this.messageEl = messageEl;

    canvas.width = cols * TILE_SIZE;
    canvas.height = rows * TILE_SIZE;

    this.board = new Board(rows, cols);

    // Input handlers
    canvas.addEventListener('click', (e) => this._handleClick(e));
    canvas.addEventListener('keydown', (e) => this._handleKey(e));
    // Give the canvas focus immediately so keyboard input works without a prior click.
    canvas.focus();

    this._loop();
  }

  /** Start a fresh game. */
  restart(): void {
    this.board = new Board(this.rows, this.cols);
    this.solved = false;
    this.messageEl.textContent = '';
    this.focusPos = { row: 0, col: 0 };
  }

  /** Main render loop. */
  private _loop(): void {
    this._render();
    requestAnimationFrame(() => this._loop());
  }

  private _render(): void {
    const { ctx, canvas, board } = this;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const filled = board.getFilledPositions();

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const tile = board.grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const isWater = filled.has(`${r},${c}`);
        const isFocused = this.focusPos.row === r && this.focusPos.col === c;

        // Tile background
        ctx.fillStyle = TILE_BG;
        ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // Focus highlight
        if (isFocused) {
          ctx.strokeStyle = FOCUS_COLOR;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        }

        this._drawPipe(x, y, tile.shape, tile.rotation, isWater, tile.isFixed);
      }
    }

    // Win check
    if (!this.solved && board.isSolved()) {
      this.solved = true;
      this.messageEl.textContent = '🎉 Puzzle solved!';
    }
  }

  /** Draw a single pipe tile at canvas position (x, y). */
  private _drawPipe(
    x: number, y: number,
    shape: PipeShape, rotation: number,
    isWater: boolean, isFixed: boolean,
  ): void {
    const { ctx } = this;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;
    const half = TILE_SIZE / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotation * Math.PI) / 180);

    const color = isFixed
      ? (shape === PipeShape.Source ? SOURCE_COLOR : SINK_COLOR)
      : isWater ? WATER_COLOR : PIPE_COLOR;

    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';

    if (shape === PipeShape.Empty) {
      // nothing
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
      // Draw a filled circle for source/sink
      ctx.beginPath();
      ctx.arc(0, 0, half * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      // Draw lines in all four directions
      for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * half, Math.sin(angle) * half);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private _handleClick(e: MouseEvent): void {
    if (this.solved) return;
    const rect = this.canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / TILE_SIZE);
    const row = Math.floor((e.clientY - rect.top) / TILE_SIZE);
    this.board.rotateTile({ row, col });
  }

  private _handleKey(e: KeyboardEvent): void {
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
        if (!this.solved) board.rotateTile(focusPos);
        break;
    }
  }
}
