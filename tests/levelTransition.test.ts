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
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function flushAllRaf(): void {
    let guard = 0;
    while (rafQueue.length > 0 && guard < 100) {
      const cb = rafQueue.shift()!;
      now += 125;
      cb(now);
      jest.runOnlyPendingTimers();
      guard++;
    }
    jest.runOnlyPendingTimers();
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

    flushAllRaf();

    expect(showDestination).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(toEl.style.display).toBe('flex');
    expect(toEl.style.transform).toBe('');
    expect(document.body.querySelector('[data-transition-blocker="true"]')).toBeNull();
  });
});
