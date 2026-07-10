/**
 * Typed game-event bus.
 *
 * Modules dispatch events; the achievement system (and any future listeners)
 * subscribe without needing to be wired into every callback chain.
 *
 * Usage:
 *   dispatchGameEvent({ type: 'levelWon', ... });
 *   const unsub = subscribeToGameEvents((e) => { ... });
 *   unsub(); // remove listener
 */

export type GameEvent =
  | { type: 'levelStarted'; campaignId: string; levelId: number; isChallenge: boolean }
  | {
      type: 'levelWon';
      campaignId: string;
      levelId: number;
      stars: number;
      waterRemaining: number;
      isChallenge: boolean;
      /** Chapter ID if winning this level completed the chapter; null otherwise. */
      completedChapterId: number | null;
      /** True if winning this level completed the whole campaign. */
      isCampaignComplete: boolean;
    }
  | { type: 'levelFailed'; campaignId: string; levelId: number };

type GameEventListener = (event: GameEvent) => void;

const _listeners: GameEventListener[] = [];

/** Subscribe to all game events. Returns a function that removes the listener. */
export function subscribeToGameEvents(listener: GameEventListener): () => void {
  _listeners.push(listener);
  return () => {
    const idx = _listeners.indexOf(listener);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

export function dispatchGameEvent(event: GameEvent): void {
  for (const fn of [..._listeners]) fn(event);
}

/** Test helper — removes all subscribers. */
export function _resetGameEventBusForTests(): void {
  _listeners.length = 0;
}
