/**
 * ResumePlayer — replays a saved partial-progress move sequence into the live
 * play board, leaving the board in a state identical to manual entry.  The
 * per-move delay scales with the sequence length (see {@link computeMoveIntervalMs})
 * so short sequences do not flash past too quickly.
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
import type { MoveAnimationInfo } from './screens/playbackScreen';
import type { Tile } from './tile';
import { GameState } from './types';
import { showTimedMessage } from './uiHelpers';
import { t } from './i18n';

/** Duration of the resume/invalid-halt flash message (ms). */
const RESUME_FLASH_MS = 3500;
/** Fastest per-move delay (ms) — used when there are many moves to replay. */
const MIN_MOVE_INTERVAL_MS = 125;
/** Slowest per-move delay (ms) — cap applied when there are few moves. */
const MAX_MOVE_INTERVAL_MS = 500;
/** Target total playback duration (ms) the per-move delay aims for. */
const TARGET_PLAYBACK_MS = 2000;

/**
 * Compute the per-move replay delay so a short sequence does not flash past too
 * quickly: aim for {@link TARGET_PLAYBACK_MS} total, clamped to
 * [{@link MIN_MOVE_INTERVAL_MS}, {@link MAX_MOVE_INTERVAL_MS}].
 *
 * Examples: 2000 ms target → 4 or fewer moves run at the 500 ms cap (≥2 s total),
 * 8 moves at 250 ms, 16 moves at the 125 ms floor, more moves stay at 125 ms.
 */
export function computeMoveIntervalMs(moveCount: number): number {
  if (moveCount <= 0) return MIN_MOVE_INTERVAL_MS;
  const ideal = Math.round(TARGET_PLAYBACK_MS / moveCount);
  return Math.min(MAX_MOVE_INTERVAL_MS, Math.max(MIN_MOVE_INTERVAL_MS, ideal));
}

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
 * Replays a saved move sequence into a live board, one move per scaled interval.
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
  /** Per-move delay, scaled so short sequences take at least ~2 s to replay. */
  private readonly _intervalMs: number;

  constructor(
    private readonly _game: ResumeGameCallbacks,
    private readonly _board: Board,
    private readonly _moves: string[],
    private readonly _flashEl: HTMLElement,
  ) {
    this._intervalMs = computeMoveIntervalMs(this._moves.length);
  }

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
    }, this._intervalMs);
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
