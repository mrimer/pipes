/**
 * @jest-environment jsdom
 */

describe('applyScrollingPipeBackground', () => {
  let now = 0;
  let rafQueue: FrameRequestCallback[] = [];

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    jest.resetModules();
    now = 0;
    rafQueue = [];
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback): number => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function flushNextAnimationFrame(nextNowMs: number): void {
    now = nextNowMs;
    const cb = rafQueue.shift();
    expect(cb).toBeDefined();
    cb!(nextNowMs);
  }

  it('keeps multiple backgrounds on the same shared scroll position', () => {
    const { applyScrollingPipeBackground } = require('../src/uiBackground') as typeof import('../src/uiBackground');
    const first = document.createElement('div');
    const second = document.createElement('div');

    applyScrollingPipeBackground(first, { baseColor: '#123456', overlayAlpha: 0.5 });
    applyScrollingPipeBackground(second, { baseColor: '#654321', overlayAlpha: 0.8 });

    expect(first.style.backgroundImage).toContain('linear-gradient');
    expect(first.style.backgroundImage).toContain('data:image/svg+xml');
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(first.style.backgroundPosition).toBe(second.style.backgroundPosition);

    flushNextAnimationFrame(15_000);
    expect(first.style.backgroundPosition).toBe(second.style.backgroundPosition);

    flushNextAnimationFrame(30_000);
    expect(first.style.backgroundPosition).toBe(second.style.backgroundPosition);
  });
});
