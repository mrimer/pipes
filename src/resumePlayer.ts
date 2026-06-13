/**
 * ResumePlayer — replays a saved partial-progress move sequence into the live
 * play board at one move per 125 ms, leaving the board in a state identical to
 * manual entry.
 *
 * Usage:
 *   const rp = new ResumePlayer(game, board, savedMoves, flashEl);
 *   rp.start();
 *
 * The driver feeds moves to the board, triggers win/lose checks after each
 * move (exactly as manual play does), and stops if the game transitions out of
 * Playing state.  On completion it flashes a resume message so the player
 * knows where they left off.
 */

import type { Board } from './board';
import { decodeMove } from './moveRecorder';
import type { MoveAnimationInfo } from './playbackScreen';
import type { Tile } from './tile';
import { GameState } from './types';
import { showTimedMessage } from './uiHelpers';
import { t } from './i18n';

/** Duration of the resume/invalid-halt flash message (ms). */
const RESUME_FLASH_MS = 3500;
/** Delay between each replayed move (ms). */
const MOVE_INTERVAL_MS = 125;

/**
 * Minimal interface the ResumePlayer needs from the Game object.
 * Keeping it narrow avoids circular-type issues and makes the class testable.
 */
export interface ResumeGameCallbacks {
  getGameState(): GameState;
  checkWinLose(): void;
  spawnMoveAnimations(board: Board, info: MoveAnimationInfo): void;
  updateUndoRedoButtons(): void;
}

/**
 * Replays a saved move sequence into a live board, one move per 125 ms.
 *
 * Three terminal outcomes:
 * - **Full completion** — all moves applied while still Playing → flash
 *   `resume.flash.resuming`.
 * - **Invalid-move halt** — a decoded move fails → flash `resume.flash.invalid`;
 *   board history is left at the last valid snapshot.
 * - **Win/lose halt** — replay transitions game out of Playing → standard
 *   win/game-over modal surfaces; no resume flash.
 */
export class ResumePlayer {
  private _active = false;
  private _timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly _game: ResumeGameCallbacks,
    private readonly _board: Board,
    private readonly _moves: string[],
    private readonly _flashEl: HTMLElement,
  ) {}

  /** Returns true while the driver is actively replaying moves. */
  isActive(): boolean { return this._active; }

  /** Start replaying.  No-op if already active or moves list is empty. */
  start(): void {
    if (this._active || this._moves.length === 0) return;
    this._active = true;
    this._scheduleNext(0);
  }

  /** Cancel an in-progress replay immediately (used on level restart / new level). */
  cancel(): void {
    this._active = false;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  private _scheduleNext(index: number): void {
    this._timerId = setTimeout(() => {
      this._timerId = null;
      this._tick(index);
    }, MOVE_INTERVAL_MS);
  }

  private _tick(index: number): void {
    if (!this._active) return;

    // Stop if game has moved out of Playing state (win/lose from a previous step).
    if (this._game.getGameState() !== GameState.Playing) {
      this._finish();
      return;
    }

    // All moves processed — full completion.
    if (index >= this._moves.length) {
      this._finish();
      showTimedMessage(this._flashEl, t('resume.flash.resuming'), RESUME_FLASH_MS);
      return;
    }

    const encoded = this._moves[index];
    const decoded = decodeMove(encoded);
    if (!decoded) {
      // Malformed move string — treat as invalid.
      this._finish();
      showTimedMessage(this._flashEl, t('resume.flash.invalid'), RESUME_FLASH_MS);
      return;
    }

    // Capture pre-move board state for animations.
    const filledBefore = this._board.getFilledPositions();
    const lockedWaterImpactBefore = this._board.captureLockedWaterImpacts();
    const lockedHotPlateGainBefore = this._board.captureLockedHotPlateGains();

    let reclaimedTile: Tile | undefined;
    let rotationInfo: { row: number; col: number; oldRotation: number } | undefined;

    let moveResult;
    if (decoded.type === 'place') {
      moveResult = this._board.placeOrReplaceForReplay(decoded.row, decoded.col, decoded.shape, decoded.rotation);
    } else if (decoded.type === 'rotate') {
      const tile = this._board.getTile({ row: decoded.row, col: decoded.col });
      rotationInfo = { row: decoded.row, col: decoded.col, oldRotation: tile?.rotation ?? 0 };
      moveResult = decoded.direction === 'CW'
        ? this._board.rotateTileCW({ row: decoded.row, col: decoded.col })
        : this._board.rotateTileCCW({ row: decoded.row, col: decoded.col });
    } else {
      reclaimedTile = this._board.getTile({ row: decoded.row, col: decoded.col }) ?? undefined;
      moveResult = this._board.reclaimTile({ row: decoded.row, col: decoded.col });
    }

    if (!moveResult.success) {
      // The move is invalid for this level's current state — halt here.
      this._finish();
      showTimedMessage(this._flashEl, t('resume.flash.invalid'), RESUME_FLASH_MS);
      return;
    }

    const turnChanges = this._board.applyTurnDelta();
    this._board.recordMove(encoded);

    const animInfo: MoveAnimationInfo = {
      filledBefore,
      lockedWaterImpactBefore,
      lockedHotPlateGainBefore,
      decodedMove: decoded,
      moveResult,
      turnChanges,
      reclaimedTile,
      rotationInfo,
    };
    this._game.spawnMoveAnimations(this._board, animInfo);
    this._game.updateUndoRedoButtons();

    // Run win/lose check exactly as manual play does.
    this._game.checkWinLose();

    // If win/lose check transitioned out of Playing, _tick's next call will
    // detect it and stop without flashing the resume message.
    this._scheduleNext(index + 1);
  }

  private _finish(): void {
    this._active = false;
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this._game.updateUndoRedoButtons();
  }
}
