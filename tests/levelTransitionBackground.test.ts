/**
 * @jest-environment jsdom
 */

import { playMapScreenExitTransition } from '../src/levelTransition';

describe('map zoom transition backgrounds', () => {
  let now = 0;
  let rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.backgroundImage = 'url("pipes-bg")';
    now = 0;
    rafQueue = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: jest.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function flushAllAnimationFrames(): void {
    let safetyCounter = 0;
    while (rafQueue.length > 0 && safetyCounter < 20) {
      const cb = rafQueue.shift();
      expect(cb).toBeDefined();
      now += 250;
      cb!(now);
      safetyCounter++;
    }
  }

  it('suppresses the body pipes background image until the zoom transition finishes', () => {
    const fromScreenEl = document.createElement('div');
    const toScreenEl = document.createElement('div');
    const snapshotCanvas = document.createElement('canvas');
    const onComplete = jest.fn();

    document.body.appendChild(fromScreenEl);
    document.body.appendChild(toScreenEl);

    playMapScreenExitTransition(
      { x: 8, y: 12, width: 24, height: 16 },
      {
        canvas: snapshotCanvas,
        cssRect: { left: 40, top: 50, width: 120, height: 90 },
      },
      fromScreenEl,
      toScreenEl,
      onComplete,
    );

    expect(document.body.style.backgroundImage).toBe('none');

    flushAllAnimationFrames();

    expect(document.body.style.backgroundImage).toBe('url("pipes-bg")');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
