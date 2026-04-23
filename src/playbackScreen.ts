/**
 * PlaybackScreen – manages the level playback mode.
 *
 * Enters a "playback" mode where a saved move sequence is replayed step by step
 * on a fresh copy of the board.  The existing game state is preserved and
 * restored when the player exits playback.
 *
 * Responsibilities:
 *  - Build and manage the playback HUD (transport controls + speed + scrub bar).
 *  - Own the playback `Board` (separate from Game's live board).
 *  - Drive the step-by-step replay with configurable speed.
 *  - Flash a message when a corrupt move is reached.
 *  - Provide `board` / `decorations` so Game's render loop can paint them.
 *  - Restore the original game state on exit.
 */

import { Board, MoveResult } from './board';
import { LevelDef, GameScreen, GameState, PlaySequenceRecord, AmbientDecoration } from './types';
import { DecodedMove, decodeMove, replayMoves } from './moveRecorder';
import { Tile } from './tile';
import { saveRecording } from './persistence';
import { MUTED_BTN_BG } from './uiConstants';
import { showTimedMessage } from './uiHelpers';

/** Default playback interval between moves (ms). */
const DEFAULT_SPEED_MS = 500;
/** Minimum configurable playback speed (ms). */
const MIN_SPEED_MS = 100;
/** Maximum configurable playback speed (ms). */
const MAX_SPEED_MS = 5000;
/** How long the "invalid move" flash stays visible (ms). */
const CORRUPT_FLASH_MS = 3000;

/**
 * Data captured around a single replay move, passed to the {@link PlaybackCallbacks.spawnMoveAnimations}
 * callback so the Game can spawn the correct visual effects.
 */
export interface MoveAnimationInfo {
  /** Filled-position set captured immediately before the move was applied. */
  filledBefore: Set<string>;
  /** The decoded move that was applied. */
  decodedMove: DecodedMove;
  /** Result returned by the board operation (carries `cementDecrement` when set). */
  moveResult: MoveResult;
  /** Locked-cost change deltas returned by {@link Board.applyTurnDelta}. */
  turnChanges: Array<{ row: number; col: number; delta: number }>;
  /** For delete moves: the tile that occupied the cell before it was reclaimed. */
  reclaimedTile?: Tile;
  /** For rotate moves: the cell and its rotation angle before the move. */
  rotationInfo?: { row: number; col: number; oldRotation: number };
}

/** Saved game state captured before entering playback, restored on exit. */
interface SavedGameState {
  board: Board | null;
  gameState: GameState;
  screen: GameScreen;
}

/**
 * Interface through which PlaybackScreen communicates back to Game.
 * Game implements this by providing closures that touch its private state.
 */
export interface PlaybackCallbacks {
  /** Returns the current live board (used to copy decorations). */
  getBoard(): Board | null;
  /** Returns the current GameState. */
  getGameState(): GameState;
  /** Switches to the given board as the active board. */
  setBoard(board: Board | null): void;
  /** Updates Game's gameState field. */
  setGameState(state: GameState): void;
  /** Switches Game to the given screen. */
  setScreen(screen: GameScreen): void;
  /** Refreshes the play UI (inventory bar, water display, undo/redo buttons). */
  refreshUI(): void;
  /** Canvas element used to focus after showing controls. */
  canvas: HTMLCanvasElement;
  /** Parent element of the HUD buttons (undo/redo/restart/rules row). */
  hudEl: HTMLElement;
  /** Element used to show brief flash messages. */
  errorFlashEl: HTMLElement;
  /** Element showing the campaign name / chapter / level header text. */
  levelHeaderEl: HTMLElement;
  /**
   * Spawn canvas animations and refresh the play UI (inventory bar + stat rows)
   * after a single forward replay step has been applied to the board.
   */
  spawnMoveAnimations(board: Board, info: MoveAnimationInfo): void;
  /** Reset metric-sparkle baselines so the next stat refresh fires no spurious sparkles. */
  resetMetricBaselines(): void;
}

/** CSS shared between all transport icon buttons. */
const TRANSPORT_BTN_CSS =
  `padding:6px 10px;font-size:1rem;background:${MUTED_BTN_BG};color:#aaa;` +
  'border:1px solid #555;border-radius:4px;cursor:pointer;min-height:36px;';

export class PlaybackScreen {
  /** The board being replayed (injected into Game's render loop). */
  board: Board | null = null;

  private _record: PlaySequenceRecord | null = null;
  private _level: LevelDef | null = null;
  private _decorations: ReadonlyMap<string, AmbientDecoration> | undefined;
  private _savedState: SavedGameState | null = null;

  private _currentStep = 0;
  private _stepLimit = 0;   // total moves in the record (may be < record.moves.length if corrupted)
  private _speedMs = DEFAULT_SPEED_MS;
  private _playing = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _corrupted = false;

  /** Original text of the level-header line2 element, saved so it can be restored on exit. */
  private _savedHeaderLine2Text: string | null = null;

  // HUD overlay elements
  private _hudOverlayEl: HTMLElement | null = null;
  private _playPauseBtn: HTMLButtonElement | null = null;
  private _scrubBar: HTMLInputElement | null = null;
  private _stepLabel: HTMLElement | null = null;
  private _speedLabel: HTMLElement | null = null;

  constructor(private readonly _cb: PlaybackCallbacks) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Enter playback mode for the given record and level.
   * Saves the current game state, builds a replay board, and sets up controls.
   */
  enter(record: PlaySequenceRecord, level: LevelDef): void {
    const existingBoard = this._cb.getBoard();

    // Save current game state for restoration on exit.
    // The move log is stored inside the board's snapshot history and will be
    // automatically restored when the board is restored on exit.
    this._savedState = {
      board: existingBoard,
      gameState: this._cb.getGameState(),
      screen: GameScreen.Play,
    };

    this._record = record;
    this._level = level;
    this._decorations = existingBoard?.ambientDecorations;
    this._currentStep = 0;
    this._corrupted = false;
    this._playing = false;

    // Determine the effective upper bound for steps.  If the record is already
    // marked corrupted, stoppedAt is where replay will abort; we cap there.
    this._stepLimit = record.moves.length;

    // Build the initial board state (step 0 = empty board).
    this._applyStep(0);

    // Switch to playback screen.
    this._cb.setScreen(GameScreen.Playback);
    this._buildHudOverlay();
    this._appendReplayToHeader();
    this._cb.refreshUI();
    this._cb.canvas.focus();
  }

  /** Exit playback mode and restore the previously saved game state. */
  exit(): void {
    this._stopTimer();

    if (this._savedState) {
      this._cb.setBoard(this._savedState.board);
      this._cb.setGameState(this._savedState.gameState);
      this._cb.setScreen(GameScreen.Play);
      this._savedState = null;
    }

    this._removeHudOverlay();
    this._restoreHeaderLine2();
    this._cb.refreshUI();
    this._cb.canvas.focus();

    this._record = null;
    this._level = null;
    this.board = null;
  }

  /** Step forward one move.  Returns false if already at the end or corrupted. */
  stepForward(): boolean {
    if (!this._record || !this._level) return false;
    if (this._currentStep >= this._stepLimit) return false;
    if (this._corrupted) return false;
    return this._applyMoveIncremental();
  }

  /** Step back one move. */
  stepBack(): boolean {
    if (this._currentStep <= 0) return false;
    this._applyStep(this._currentStep - 1);
    return true;
  }

  /** Rewind to the initial state (step 0). */
  rewind(): void {
    this._stopTimer();
    this._playing = false;
    this._updatePlayPauseIcon();
    this._applyStep(0);
  }

  /** Toggle play / pause. */
  togglePlay(): void {
    if (this._playing) {
      this._pause();
    } else {
      this._play();
    }
  }

  /** Update speed and restart the timer if currently playing. */
  setSpeedMs(ms: number): void {
    this._speedMs = Math.max(MIN_SPEED_MS, Math.min(MAX_SPEED_MS, ms));
    if (this._speedLabel) {
      this._speedLabel.textContent = `${(this._speedMs / 1000).toFixed(1)}s`;
    }
    if (this._playing) {
      this._stopTimer();
      this._scheduleNext();
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _play(): void {
    if (this._corrupted || this._currentStep >= this._stepLimit) return;
    this._playing = true;
    this._updatePlayPauseIcon();
    this._scheduleNext();
  }

  private _pause(): void {
    this._playing = false;
    this._stopTimer();
    this._updatePlayPauseIcon();
  }

  private _scheduleNext(): void {
    this._timer = setTimeout(() => {
      this._timer = null;
      const advanced = this.stepForward();
      if (!advanced || this._corrupted) {
        this._pause();
        return;
      }
      if (this._playing) {
        this._scheduleNext();
      }
    }, this._speedMs);
  }

  private _stopTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Rebuild the board from scratch to represent the state after exactly `step`
   * moves have been applied.  Updates `this.board` and injects it into Game.
   * Resets metric baselines and refreshes the play UI (used for scrub / rewind /
   * step-back, where jumping to an arbitrary position makes sparkles meaningless).
   *
   * If replay encounters a corrupt move at the requested step, it stops there,
   * sets the corrupted flag, updates the persisted record, and flashes a message.
   */
  private _applyStep(step: number): void {
    if (!this._record || !this._level) return;

    const movesToApply = this._record.moves.slice(0, step);
    const result = replayMoves(this._level, movesToApply, this._decorations);

    this._currentStep = result.stoppedAt; // may be < step if corrupt
    this.board = result.board;
    this._cb.setBoard(result.board);

    if (result.corrupted && !this._corrupted) {
      this._handleCorruption(result.stoppedAt);
    }

    this._cb.resetMetricBaselines();
    this._cb.refreshUI();
    this._updateScrubAndLabel();
  }

  /**
   * Apply the single move at `this._currentStep` directly to the existing board
   * (incremental forward step).  Captures the pre-move filled set, applies the
   * board operation, then notifies Game to spawn animations and refresh the UI.
   *
   * Returns `true` on success, `false` when the move is corrupt or the board
   * operation fails.
   */
  private _applyMoveIncremental(): boolean {
    if (!this._record || !this._level || !this.board) return false;

    const step = this._currentStep;
    const encoded = this._record.moves[step];
    const decoded = decodeMove(encoded);
    if (!decoded) {
      if (!this._corrupted) this._handleCorruption(step);
      return false;
    }

    const filledBefore = this.board.getFilledPositions();
    let moveResult: MoveResult;
    let reclaimedTile: Tile | undefined;
    let rotationInfo: { row: number; col: number; oldRotation: number } | undefined;

    if (decoded.type === 'place') {
      moveResult = this.board.placeOrReplaceForReplay(decoded.row, decoded.col, decoded.shape, decoded.rotation);
    } else if (decoded.type === 'rotate') {
      const tile = this.board.getTile({ row: decoded.row, col: decoded.col });
      rotationInfo = { row: decoded.row, col: decoded.col, oldRotation: tile?.rotation ?? 0 };
      moveResult = decoded.direction === 'CW'
        ? this.board.rotateTileCW({ row: decoded.row, col: decoded.col })
        : this.board.rotateTileCCW({ row: decoded.row, col: decoded.col });
    } else {
      reclaimedTile = this.board.getTile({ row: decoded.row, col: decoded.col }) ?? undefined;
      moveResult = this.board.reclaimTile({ row: decoded.row, col: decoded.col });
    }

    if (!moveResult.success) {
      if (!this._corrupted) this._handleCorruption(step);
      return false;
    }

    const turnChanges = this.board.applyTurnDelta();
    this.board.recordMove();
    this._currentStep = step + 1;

    this._cb.spawnMoveAnimations(this.board, {
      filledBefore,
      decodedMove: decoded,
      moveResult,
      turnChanges,
      reclaimedTile,
      rotationInfo,
    });
    this._updateScrubAndLabel();
    return true;
  }

  /** Mark the sequence as corrupted, pause playback, persist the flag, and show a flash message. */
  private _handleCorruption(stoppedAt: number): void {
    this._corrupted = true;
    this._pause();
    this._markRecordCorrupted();
    showTimedMessage(
      this._cb.errorFlashEl,
      `Playback halted at move ${stoppedAt + 1}: invalid move`,
      CORRUPT_FLASH_MS,
    );
  }

  /** Persist the corrupted flag back onto the record in localStorage. */
  private _markRecordCorrupted(): void {
    if (!this._record) return;
    this._record = { ...this._record, corrupted: true };
    saveRecording(this._record);
  }

  private _updateScrubAndLabel(): void {
    if (this._scrubBar) {
      this._scrubBar.max = String(this._stepLimit);
      this._scrubBar.value = String(this._currentStep);
    }
    if (this._stepLabel) {
      this._stepLabel.textContent = `${this._currentStep} / ${this._stepLimit}`;
    }
  }

  private _updatePlayPauseIcon(): void {
    if (this._playPauseBtn) {
      this._playPauseBtn.textContent = this._playing ? '⏸' : '▶';
      this._playPauseBtn.title = this._playing ? 'Pause' : 'Play';
    }
  }

  // ─── HUD overlay ──────────────────────────────────────────────────────────

  /** Append " (Replay)" to the level-header line2 text and save the original. */
  private _appendReplayToHeader(): void {
    const line2 = this._cb.levelHeaderEl.lastElementChild as HTMLElement | null;
    if (line2) {
      this._savedHeaderLine2Text = line2.textContent ?? '';
      line2.textContent = `${this._savedHeaderLine2Text} (Replay)`;
    }
  }

  /** Restore the level-header line2 text saved by {@link _appendReplayToHeader}. */
  private _restoreHeaderLine2(): void {
    if (this._savedHeaderLine2Text === null) return;
    const line2 = this._cb.levelHeaderEl.lastElementChild as HTMLElement | null;
    if (line2) {
      line2.textContent = this._savedHeaderLine2Text;
    }
    this._savedHeaderLine2Text = null;
  }

  /**
   * Build the playback transport control bar and inject it into the HUD.
   * The original HUD buttons are hidden while playback is active and restored on exit.
   */
  private _buildHudOverlay(): void {
    const hudEl = this._cb.hudEl;

    // Hide existing HUD children (undo/redo/restart/rules/exit buttons).
    for (const child of Array.from(hudEl.children)) {
      (child as HTMLElement).style.display = 'none';
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;';
    this._hudOverlayEl = overlay;

    const makeBtn = (icon: string, title: string, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = icon;
      btn.title = title;
      btn.style.cssText = TRANSPORT_BTN_CSS;
      btn.addEventListener('click', onClick);
      return btn;
    };

    // ⏮ Rewind
    overlay.appendChild(makeBtn('⏮', 'Rewind to start', () => this.rewind()));

    // ⏪ Step back
    overlay.appendChild(makeBtn('⏪', 'Step back one move', () => {
      this._stopTimer();
      this._playing = false;
      this._updatePlayPauseIcon();
      this.stepBack();
    }));

    // ▶/⏸ Play/Pause
    const playPauseBtn = makeBtn('▶', 'Play', () => this.togglePlay());
    this._playPauseBtn = playPauseBtn;
    overlay.appendChild(playPauseBtn);

    // ⏩ Step forward
    overlay.appendChild(makeBtn('⏩', 'Step forward one move', () => {
      this._stopTimer();
      this._playing = false;
      this._updatePlayPauseIcon();
      this.stepForward();
    }));

    // Speed slider label
    const speedSection = document.createElement('div');
    speedSection.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const speedLabelPrefix = document.createElement('span');
    speedLabelPrefix.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    speedLabelPrefix.textContent = '⏱';

    const speedSlider = document.createElement('input');
    speedSlider.type = 'range';
    speedSlider.min = String(MIN_SPEED_MS);
    speedSlider.max = String(MAX_SPEED_MS);
    speedSlider.step = '100';
    speedSlider.value = String(DEFAULT_SPEED_MS);
    speedSlider.style.cssText = 'width:90px;cursor:pointer;';
    speedSlider.title = 'Playback speed (seconds per move)';
    speedSlider.addEventListener('input', () => {
      this.setSpeedMs(Number(speedSlider.value));
    });

    const speedLabel = document.createElement('span');
    speedLabel.style.cssText = 'font-size:0.75rem;color:#aaa;min-width:30px;';
    speedLabel.textContent = `${DEFAULT_SPEED_MS / 1000}s`;
    this._speedLabel = speedLabel;

    speedSection.appendChild(speedLabelPrefix);
    speedSection.appendChild(speedSlider);
    speedSection.appendChild(speedLabel);
    overlay.appendChild(speedSection);

    // Scrub bar
    const scrubSection = document.createElement('div');
    scrubSection.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const scrubBar = document.createElement('input');
    scrubBar.type = 'range';
    scrubBar.min = '0';
    scrubBar.max = String(this._stepLimit);
    scrubBar.value = '0';
    scrubBar.style.cssText = 'width:110px;cursor:pointer;';
    scrubBar.title = 'Scrub to any move';
    this._scrubBar = scrubBar;
    scrubBar.addEventListener('input', () => {
      this._stopTimer();
      this._playing = false;
      this._updatePlayPauseIcon();
      this._applyStep(Number(scrubBar.value));
    });

    const stepLabel = document.createElement('span');
    stepLabel.style.cssText = 'font-size:0.75rem;color:#aaa;min-width:55px;';
    stepLabel.textContent = `0 / ${this._stepLimit}`;
    this._stepLabel = stepLabel;

    scrubSection.appendChild(scrubBar);
    scrubSection.appendChild(stepLabel);
    overlay.appendChild(scrubSection);

    // 🚪 Exit button
    const exitBtn = makeBtn('🚪 Exit', 'Exit playback', () => this.exit());
    exitBtn.style.cssText = TRANSPORT_BTN_CSS + 'margin-left:6px;';
    overlay.appendChild(exitBtn);

    hudEl.appendChild(overlay);
  }

  /** Remove the playback overlay and restore original HUD buttons. */
  private _removeHudOverlay(): void {
    if (this._hudOverlayEl) {
      this._hudOverlayEl.remove();
      this._hudOverlayEl = null;
    }
    // Restore original HUD children.
    const hudEl = this._cb.hudEl;
    for (const child of Array.from(hudEl.children)) {
      (child as HTMLElement).style.display = '';
    }
    this._playPauseBtn = null;
    this._scrubBar = null;
    this._stepLabel = null;
    this._speedLabel = null;
  }
}
