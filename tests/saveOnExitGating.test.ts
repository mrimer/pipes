/**
 * Save-on-exit gating — pure-function decision test.
 *
 * The decision logic inside _persistPartialProgressOnExit follows these rules:
 *   - isPlaytesting  → 'noop'   (never touch storage during editor playtests)
 *   - Won            → 'delete' (discard partial on win)
 *   - movesLength === 0 and not Won → 'delete' (pristine board — no partial to keep)
 *   - Playing-exit with moves → 'store'
 *   - GameOver with moves     → 'store'
 *
 * This test extracts that decision as a pure function and verifies each branch.
 */

import { GameState } from '../src/types';

// ─── Pure decision helper (mirrors _persistPartialProgressOnExit logic) ───────

type ExitAction = 'delete' | 'store' | 'noop';

interface ExitParams {
  gameState: GameState;
  movesLength: number;
  isPlaytesting: boolean;
}

function computeExitAction({ gameState, movesLength, isPlaytesting }: ExitParams): ExitAction {
  if (isPlaytesting) return 'noop';
  if (gameState === GameState.Won || movesLength === 0) return 'delete';
  return 'store';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('save-on-exit decision', () => {
  it('isPlaytesting → noop regardless of other conditions', () => {
    expect(computeExitAction({ gameState: GameState.Playing, movesLength: 5, isPlaytesting: true })).toBe('noop');
    expect(computeExitAction({ gameState: GameState.Won, movesLength: 0, isPlaytesting: true })).toBe('noop');
    expect(computeExitAction({ gameState: GameState.GameOver, movesLength: 3, isPlaytesting: true })).toBe('noop');
  });

  it('Won → delete (discard partial), regardless of movesLength', () => {
    expect(computeExitAction({ gameState: GameState.Won, movesLength: 0, isPlaytesting: false })).toBe('delete');
    expect(computeExitAction({ gameState: GameState.Won, movesLength: 5, isPlaytesting: false })).toBe('delete');
  });

  it('pristine (movesLength === 0) and not Won → delete (no partial to keep)', () => {
    expect(computeExitAction({ gameState: GameState.Playing, movesLength: 0, isPlaytesting: false })).toBe('delete');
    expect(computeExitAction({ gameState: GameState.GameOver, movesLength: 0, isPlaytesting: false })).toBe('delete');
  });

  it('Playing-exit with moves → store', () => {
    expect(computeExitAction({ gameState: GameState.Playing, movesLength: 3, isPlaytesting: false })).toBe('store');
  });

  it('GameOver with moves → store (save pre-fail progress)', () => {
    expect(computeExitAction({ gameState: GameState.GameOver, movesLength: 2, isPlaytesting: false })).toBe('store');
  });
});
