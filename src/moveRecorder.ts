/**
 * Move encoding and replay utilities for the Pipes puzzle game.
 *
 * A "move" is a single player action that mutates the board.  The three
 * possible actions are encoded as compact strings:
 *
 *   P:<SHAPE>:<row>:<col>:<rot>   – Place / replace a pipe (e.g. P:ELBOW:3:4:90)
 *   R:<row>:<col>:<CW|CCW>       – Rotate the tile at (row, col)
 *   D:<row>:<col>                – Delete / reclaim the tile at (row, col)
 *
 * These strings are human-readable, version-stable, and trivially serialisable
 * to JSON for storage and file export.
 */

import { Board } from './board';
import { LevelDef, PipeShape, Rotation } from './types';

// ─── Encoded move type union ──────────────────────────────────────────────────

export type PlaceMove = {
  type: 'place';
  shape: PipeShape;
  row: number;
  col: number;
  rotation: Rotation;
};

export type RotateMove = {
  type: 'rotate';
  row: number;
  col: number;
  /** 'CW' = clockwise, 'CCW' = counter-clockwise. */
  direction: 'CW' | 'CCW';
};

export type DeleteMove = {
  type: 'delete';
  row: number;
  col: number;
};

export type DecodedMove = PlaceMove | RotateMove | DeleteMove;

// ─── Encoding ─────────────────────────────────────────────────────────────────

/**
 * Encode a place/replace action as a compact string.
 *
 * @param shape    - PipeShape enum value being placed.
 * @param row      - Grid row.
 * @param col      - Grid column.
 * @param rotation - Rotation in degrees (0 | 90 | 180 | 270).
 */
export function encodePlaceMove(shape: PipeShape, row: number, col: number, rotation: Rotation): string {
  return `P:${shape}:${row}:${col}:${rotation}`;
}

/**
 * Encode a rotate action as a compact string.
 *
 * @param row       - Grid row.
 * @param col       - Grid column.
 * @param direction - 'CW' (clockwise) or 'CCW' (counter-clockwise).
 */
export function encodeRotateMove(row: number, col: number, direction: 'CW' | 'CCW'): string {
  return `R:${row}:${col}:${direction}`;
}

/**
 * Encode a delete/reclaim action as a compact string.
 *
 * @param row - Grid row.
 * @param col - Grid column.
 */
export function encodeDeleteMove(row: number, col: number): string {
  return `D:${row}:${col}`;
}

// ─── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Decode an encoded move string back into a typed `DecodedMove` object.
 *
 * @returns The decoded move, or `null` when the string is malformed / unknown.
 */
export function decodeMove(encoded: string): DecodedMove | null {
  if (!encoded) return null;
  const parts = encoded.split(':');
  const kind = parts[0];

  if (kind === 'P' && parts.length === 5) {
    const shape = parts[1] as PipeShape;
    const row = parseInt(parts[2], 10);
    const col = parseInt(parts[3], 10);
    const rotation = parseInt(parts[4], 10) as Rotation;
    if (isNaN(row) || isNaN(col) || isNaN(rotation)) return null;
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return null;
    return { type: 'place', shape, row, col, rotation };
  }

  if (kind === 'R' && parts.length === 4) {
    const row = parseInt(parts[1], 10);
    const col = parseInt(parts[2], 10);
    const direction = parts[3];
    if (isNaN(row) || isNaN(col)) return null;
    if (direction !== 'CW' && direction !== 'CCW') return null;
    return { type: 'rotate', row, col, direction };
  }

  if (kind === 'D' && parts.length === 3) {
    const row = parseInt(parts[1], 10);
    const col = parseInt(parts[2], 10);
    if (isNaN(row) || isNaN(col)) return null;
    return { type: 'delete', row, col };
  }

  return null;
}

// ─── Replay ───────────────────────────────────────────────────────────────────

/**
 * Result returned by {@link replayMoves}.
 */
export type ReplayResult = {
  /** The board after all successfully applied moves. */
  board: Board;
  /**
   * The index of the first move that failed (0-based).
   * Equals `moves.length` when all moves were applied successfully.
   */
  stoppedAt: number;
  /**
   * True when a move could not be applied or could not be decoded.
   * The `stoppedAt` field identifies the failing move.
   */
  corrupted: boolean;
};

/**
 * Reconstruct a board state by replaying a sequence of encoded moves from the
 * initial level state.
 *
 * A fresh {@link Board} is constructed from `level`, then each move in `moves`
 * is applied in order.  If a move cannot be decoded or the resulting board
 * operation fails, replay stops and `corrupted` is set to `true`.
 *
 * @param level  - The level definition used to initialise the starting board state.
 * @param moves  - Ordered array of encoded move strings (may be a slice of a full sequence).
 * @param existingDecorations - Optional pre-generated ambient decorations to reuse.
 */
export function replayMoves(
  level: LevelDef,
  moves: string[],
  existingDecorations?: ReadonlyMap<string, import('./types').AmbientDecoration>,
): ReplayResult {
  const board = new Board(level.rows, level.cols, level, existingDecorations);
  board.initHistory();

  for (let i = 0; i < moves.length; i++) {
    const decoded = decodeMove(moves[i]);
    if (!decoded) {
      return { board, stoppedAt: i, corrupted: true };
    }

    let success = false;

    if (decoded.type === 'place') {
      const result = board.placeOrReplaceForReplay(decoded.row, decoded.col, decoded.shape, decoded.rotation);
      success = result.success;
    } else if (decoded.type === 'rotate') {
      const result = decoded.direction === 'CW'
        ? board.rotateTileCW({ row: decoded.row, col: decoded.col })
        : board.rotateTileCCW({ row: decoded.row, col: decoded.col });
      success = result.success;
    } else if (decoded.type === 'delete') {
      const result = board.reclaimTile({ row: decoded.row, col: decoded.col });
      success = result.success;
    }

    if (!success) {
      return { board, stoppedAt: i, corrupted: true };
    }

    // Apply turn delta and record the move in board history.
    board.applyTurnDelta();
    board.recordMove();
  }

  return { board, stoppedAt: moves.length, corrupted: false };
}
