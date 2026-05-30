/**
 * @jest-environment jsdom
 */

import { playSwirlScreenTransition } from '../src/levelTransition';

describe('playSwirlScreenTransition', () => {
  let now = 0;
  let rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = '';
    now = 0;
    rafQueue = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function flushRafFrames(count: number, stepMs = 16): void {
    for (let i = 0; i < count; i++) {
      const cb = rafQueue.shift();
      if (!cb) return;
      now += stepMs;
      cb(now);
    }
  }

  function flushAllRaf(stepMs = 16): void {
    const maxFrames = 200;
    let guard = 0;
    while (rafQueue.length > 0 && guard < maxFrames) {
      const cb = rafQueue.shift()!;
      now += stepMs;
      cb(now);
      guard++;
    }
    if (rafQueue.length > 0) {
      throw new Error(`flushAllRaf hit cap (${maxFrames}) with ${rafQueue.length} callbacks still queued`);
    }
    // Note: jest.runOnlyPendingTimers() is intentionally NOT called here.
    // scheduleFrame() pairs each RAF with a setTimeout fallback and clears the
    // timeout when the RAF fires, so there are no pending timers after draining
    // the RAF queue.  Firing timers here would cause the fallback callbacks to
    // run a second time (before the `fired` guard could stop them) and could
    // also trigger unrelated timers registered elsewhere.
  }

  it('collapses to black, reveals destination, and removes blocker', () => {
    const fromEl = document.createElement('div');
    fromEl.style.display = 'flex';
    const toEl = document.createElement('div');
    toEl.style.display = 'none';
    document.body.appendChild(fromEl);
    document.body.appendChild(toEl);

    const showDestination = jest.fn(() => {
      fromEl.style.display = 'none';
      toEl.style.display = 'flex';
      return toEl;
    });
    const onComplete = jest.fn();

    playSwirlScreenTransition(fromEl, showDestination, onComplete);

    const blocker = document.body.querySelector<HTMLElement>('[data-transition-blocker="true"]');
    expect(blocker).not.toBeNull();
    expect(blocker?.style.background).toBe('transparent');

    flushRafFrames(1);

    expect(showDestination).not.toHaveBeenCalled();
    expect(blocker?.style.transform).not.toBe('');
    expect(blocker?.style.opacity).not.toBe('');

    flushAllRaf();

    expect(showDestination).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toEl.style.display).toBe('flex');
    expect(toEl.style.transform).toBe('');
    expect(document.body.querySelector('[data-transition-blocker="true"]')).toBeNull();
  });
});
