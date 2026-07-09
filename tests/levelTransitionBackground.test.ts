/**
 * @jest-environment jsdom
 */

jest.mock('../src/renderer', () => ({
  TILE_SIZE: 64,
  renderBoard: jest.fn(),
}));

import { Board } from '../src/board';
import { playMapScreenEnterTransition, playMapScreenExitTransition, playMapTransition } from '../src/visuals/levelTransition';

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
    const maxFrames = 20;
    let safetyCounter = 0;
    while (rafQueue.length > 0 && safetyCounter < maxFrames) {
      const cb = rafQueue.shift();
      expect(cb).toBeDefined();
      now += 250;
      cb!(now);
      safetyCounter++;
    }
    if (rafQueue.length > 0) {
      throw new Error(
        `flushAllAnimationFrames hit cap (${maxFrames}) with ${rafQueue.length} callbacks still queued`,
      );
    }
  }

  function flushSingleAnimationFrame(): void {
    const cb = rafQueue.shift();
    expect(cb).toBeDefined();
    now += 250;
    cb!(now);
  }

  it('does not modify the body background image during or after a zoom transition', () => {
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

    // Body background is not suppressed during the transition.
    expect(document.body.style.backgroundImage).toBe('url("pipes-bg")');

    flushAllAnimationFrames();

    // Body background is still unmodified after the transition completes.
    expect(document.body.style.backgroundImage).toBe('url("pipes-bg")');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fades destination screen UI in during map enter transitions', () => {
    const fromScreenEl = document.createElement('div');
    const toScreenEl = document.createElement('div');
    const toHeader = document.createElement('div');
    const toCanvas = document.createElement('canvas');
    toScreenEl.appendChild(toHeader);
    toScreenEl.appendChild(toCanvas);
    document.body.appendChild(fromScreenEl);
    document.body.appendChild(toScreenEl);

    playMapScreenEnterTransition(
      { x: 8, y: 12, width: 24, height: 16 },
      {
        canvas: document.createElement('canvas'),
        cssRect: { left: 40, top: 50, width: 120, height: 90 },
      },
      fromScreenEl,
      toScreenEl,
      jest.fn(),
      {
        canvas: document.createElement('canvas'),
        cssRect: { left: 10, top: 20, width: 150, height: 110 },
      },
    );

    expect(toScreenEl.style.opacity).toBe('');
    expect(toHeader.style.opacity).toBe('0');
    flushSingleAnimationFrame();
    expect(toHeader.style.opacity).not.toBe('0');
    expect(toHeader.style.opacity).not.toBe('1');

    flushAllAnimationFrames();

    expect(toHeader.style.opacity).toBe('');
    expect(toScreenEl.style.opacity).toBe('');
  });

  it('fades play-screen UI in during level enter transitions', () => {
    const playScreenEl = document.createElement('div');
    const playHeader = document.createElement('div');
    const gameCanvas = document.createElement('canvas');
    playScreenEl.appendChild(playHeader);
    playScreenEl.appendChild(gameCanvas);
    document.body.appendChild(playScreenEl);
    jest.spyOn(gameCanvas, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 160,
      bottom: 170,
      width: 140,
      height: 140,
      toJSON: () => ({}),
    });

    playMapTransition(
      { x: 8, y: 12, width: 24, height: 16 },
      gameCanvas,
      new Board(2, 2),
      null,
      playScreenEl,
      jest.fn(),
    );

    expect(playScreenEl.style.opacity).toBe('');
    expect(playHeader.style.opacity).toBe('0');
    flushSingleAnimationFrame();
    expect(playHeader.style.opacity).not.toBe('0');
    expect(playHeader.style.opacity).not.toBe('1');

    flushAllAnimationFrames();

    expect(playHeader.style.opacity).toBe('');
    expect(playScreenEl.style.opacity).toBe('');
  });
});
