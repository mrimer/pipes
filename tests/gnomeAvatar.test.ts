/**
 * @jest-environment jsdom
 *
 * Tests for gnomeAvatar.ts
 * - renderGnomeAvatarSvg returns a well-formed SVG element
 * - mustache/beard layers are omitted when set to 'none'
 * - fixedFrame keeps canvas size constant across hat shapes
 */

import { DEFAULT_GNOME_APPEARANCE } from '../src/profile/gnomeAppearance';
import { GNOME_FEATURE_ANCHORS, renderGnomeAvatarSvg } from '../src/visuals/gnomeAvatar';

describe('renderGnomeAvatarSvg', () => {
  it('returns an SVGSVGElement sized from pixelHeight', () => {
    const svg = renderGnomeAvatarSvg(DEFAULT_GNOME_APPEARANCE, 100);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(Number(svg.getAttribute('height'))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute('width'))).toBeGreaterThan(0);
  });

  it('renders more children when mustache/beard are present than when both are none', () => {
    const withFeatures = renderGnomeAvatarSvg(
      { ...DEFAULT_GNOME_APPEARANCE, mustacheStyle: 'bushy', beardShape: 'longPointy' },
      100,
    );
    const withoutFeatures = renderGnomeAvatarSvg(
      { ...DEFAULT_GNOME_APPEARANCE, mustacheStyle: 'none', beardShape: 'none' },
      100,
    );
    expect(withFeatures.childElementCount).toBeGreaterThan(withoutFeatures.childElementCount);
  });

  it('grows taller for a pointy hat than for a straw hat (dynamic frame)', () => {
    const pointy = renderGnomeAvatarSvg({ ...DEFAULT_GNOME_APPEARANCE, hatShape: 'pointy' }, 100);
    const straw = renderGnomeAvatarSvg({ ...DEFAULT_GNOME_APPEARANCE, hatShape: 'straw' }, 100);
    expect(Number(pointy.getAttribute('height'))).toBeGreaterThan(Number(straw.getAttribute('height')));
  });

  it('keeps a constant frame size across hat shapes when fixedFrame is set', () => {
    const pointy = renderGnomeAvatarSvg({ ...DEFAULT_GNOME_APPEARANCE, hatShape: 'pointy' }, 100, { fixedFrame: true });
    const straw = renderGnomeAvatarSvg({ ...DEFAULT_GNOME_APPEARANCE, hatShape: 'straw' }, 100, { fixedFrame: true });
    expect(pointy.getAttribute('height')).toBe(straw.getAttribute('height'));
    expect(pointy.getAttribute('width')).toBe(straw.getAttribute('width'));
  });

  it('scales proportionally with pixelHeight', () => {
    const small = renderGnomeAvatarSvg(DEFAULT_GNOME_APPEARANCE, 50);
    const large = renderGnomeAvatarSvg(DEFAULT_GNOME_APPEARANCE, 100);
    expect(Number(large.getAttribute('height'))).toBeCloseTo(Number(small.getAttribute('height')) * 2, 1);
  });

  it('renders every shoe shape without throwing', () => {
    for (const shoeShape of ['clog', 'pointed', 'rounded'] as const) {
      const svg = renderGnomeAvatarSvg({ ...DEFAULT_GNOME_APPEARANCE, shoeShape }, 100);
      expect(svg.tagName.toLowerCase()).toBe('svg');
    }
  });
});

describe('GNOME_FEATURE_ANCHORS', () => {
  it('defines a normalized (0..1) anchor for every editable feature', () => {
    for (const key of ['hat', 'hair', 'skin', 'nose', 'mustache', 'beard', 'clothing', 'shoes'] as const) {
      const anchor = GNOME_FEATURE_ANCHORS[key];
      expect(anchor.xFrac).toBeGreaterThanOrEqual(0);
      expect(anchor.xFrac).toBeLessThanOrEqual(1);
      expect(anchor.yFrac).toBeGreaterThanOrEqual(0);
      expect(anchor.yFrac).toBeLessThanOrEqual(1);
    }
  });
});
