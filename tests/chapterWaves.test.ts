/**
 * @jest-environment jsdom
 */

/** Tests for the chapter-box water-wave animation module. */

import { _heightToRgb, attachChapterWaveAnimation } from '../src/visuals/chapterWaves';

// ─── _heightToRgb ─────────────────────────────────────────────────────────────

describe('_heightToRgb', () => {
  describe('blue palette (isGold = false)', () => {
    it('returns a dark colour for the trough (h = −1)', () => {
      const [r, g, b] = _heightToRgb(-1, false);
      // Trough should be a dark navy – r and g are small, b is larger.
      expect(r).toBeLessThan(30);
      expect(g).toBeLessThan(50);
      expect(b).toBeGreaterThan(80);
    });

    it('returns a bright colour for the crest (h = +1)', () => {
      const [r, g, b] = _heightToRgb(1, false);
      // Crest should be a bright sky-blue – all channels raised.
      expect(r).toBeGreaterThan(50);
      expect(g).toBeGreaterThan(150);
      expect(b).toBeGreaterThan(200);
    });

    it('returns a mid-range colour at h = 0', () => {
      const [r, g, b] = _heightToRgb(0, false);
      // Mid-water: between the dark and bright extremes.
      const [darkR, darkG, darkB] = _heightToRgb(-1, false);
      const [brightR, brightG, brightB] = _heightToRgb(1, false);
      expect(r).toBeGreaterThan(darkR);
      expect(r).toBeLessThan(brightR);
      expect(g).toBeGreaterThan(darkG);
      expect(g).toBeLessThan(brightG);
      expect(b).toBeGreaterThan(darkB);
      expect(b).toBeLessThan(brightB);
    });

    it('returns values in valid byte range [0, 255]', () => {
      for (const h of [-1, -0.5, 0, 0.5, 1]) {
        const [r, g, b] = _heightToRgb(h, false);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('gold palette (isGold = true)', () => {
    it('returns a dark amber for the trough (h = −1)', () => {
      const [r, g, b] = _heightToRgb(-1, true);
      // Dark amber: warm r, small g, near-zero b.
      expect(r).toBeGreaterThan(30);
      expect(g).toBeLessThan(40);
      expect(b).toBeLessThan(10);
    });

    it('returns a bright sunlit gold for the crest (h = +1)', () => {
      const [r, g, b] = _heightToRgb(1, true);
      // Bright gold: high r, high g, moderate b.
      expect(r).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(180);
    });

    it('returns values in valid byte range [0, 255]', () => {
      for (const h of [-1, -0.5, 0, 0.5, 1]) {
        const [r, g, b] = _heightToRgb(h, true);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      }
    });
  });

  it('gold and blue palettes return different colours', () => {
    const blueHi  = _heightToRgb(1, false);
    const goldHi  = _heightToRgb(1, true);
    expect(blueHi).not.toEqual(goldHi);

    const blueLo  = _heightToRgb(-1, false);
    const goldLo  = _heightToRgb(-1, true);
    expect(blueLo).not.toEqual(goldLo);
  });
});

// ─── attachChapterWaveAnimation ───────────────────────────────────────────────

// Minimal canvas mock used by jsdom for tests.
const MOCK_CTX = {
  clearRect:   jest.fn(),
  putImageData: jest.fn(),
  drawImage:   jest.fn(),
  createImageData: jest.fn(() => ({
    data: new Uint8ClampedArray(4 * 10 * 10),
    width: 10,
    height: 10,
  })),
  imageSmoothingEnabled: false,
  imageSmoothingQuality: 'high' as ImageSmoothingQuality,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Patch HTMLCanvasElement.getContext so our test canvas returns the mock ctx.
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(MOCK_CTX as unknown as CanvasRenderingContext2D);
});

describe('attachChapterWaveAnimation', () => {
  it('inserts a canvas element as the last child of the header', () => {
    const header = document.createElement('button');
    const span   = document.createElement('span');
    span.textContent = 'Chapter 1';
    header.appendChild(span);

    attachChapterWaveAnimation(header, false);

    const lastChild = header.lastChild as HTMLCanvasElement;
    expect(lastChild).toBeInstanceOf(HTMLCanvasElement);
    // The original span should still be present and remain the first child.
    expect(header.firstChild).toBe(span);
  });

  it('sets position:relative and z-index:0 on the header element to form a stacking context', () => {
    const header = document.createElement('button');
    attachChapterWaveAnimation(header, false);
    expect(header.style.position).toBe('relative');
    expect(header.style.zIndex).toBe('0');
  });

  it('sets the canvas to pointer-events:none so it does not block clicks', () => {
    const header = document.createElement('button');
    attachChapterWaveAnimation(header, false);

    const canvas = header.lastChild as HTMLCanvasElement;
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('sets z-index:-1 on the canvas so it renders behind the header text', () => {
    const header = document.createElement('button');
    attachChapterWaveAnimation(header, false);

    const canvas = header.lastChild as HTMLCanvasElement;
    expect(canvas.style.zIndex).toBe('-1');
  });

  it('attaches mouseenter and mouseleave event listeners', () => {
    const header = document.createElement('button');
    const addSpy = jest.spyOn(header, 'addEventListener');

    attachChapterWaveAnimation(header, false);

    const events = addSpy.mock.calls.map((call) => call[0]);
    expect(events).toContain('mouseenter');
    expect(events).toContain('mouseleave');
  });

  it('works with isGold = true without throwing', () => {
    const header = document.createElement('button');
    expect(() => attachChapterWaveAnimation(header, true)).not.toThrow();
  });
});
