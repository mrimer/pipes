/**
 * @jest-environment jsdom
 */

import {
  detectDefaultTouchUiEnabled,
  hasTouchUiSupport,
  isTouchDevice,
  setTouchUiEnabledOverride,
} from '../src/deviceUtils';

type MatchMediaState = {
  anyPointerCoarse: boolean;
  anyPointerFine: boolean;
  anyHoverHover: boolean;
};

describe('deviceUtils touch-ui detection', () => {
  const originalMatchMedia = window.matchMedia;
  const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(Navigator.prototype, 'maxTouchPoints');
  let mm: MatchMediaState;

  function setMaxTouchPoints(value: number): void {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    setTouchUiEnabledOverride(null);
    mm = { anyPointerCoarse: false, anyPointerFine: false, anyHoverHover: false };
    window.matchMedia = ((query: string) => {
      const matches =
        query === '(any-pointer: coarse)' ? mm.anyPointerCoarse
          : query === '(any-pointer: fine)' ? mm.anyPointerFine
            : query === '(any-hover: hover)' ? mm.anyHoverHover
              : false;
      return {
        matches,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    }) as typeof window.matchMedia;
  });

  afterEach(() => {
    setTouchUiEnabledOverride(null);
    window.matchMedia = originalMatchMedia;
    if (originalMaxTouchPoints) {
      Object.defineProperty(Navigator.prototype, 'maxTouchPoints', originalMaxTouchPoints);
    }
  });

  it('defaults to touch UI for touch-first devices', () => {
    setMaxTouchPoints(5);
    mm.anyPointerCoarse = true;
    mm.anyPointerFine = false;
    mm.anyHoverHover = false;
    expect(hasTouchUiSupport()).toBe(true);
    expect(detectDefaultTouchUiEnabled()).toBe(true);
    expect(isTouchDevice()).toBe(true);
  });

  it('defaults to desktop UI for touchscreen laptops (fine pointer + hover)', () => {
    setMaxTouchPoints(5);
    mm.anyPointerCoarse = true;
    mm.anyPointerFine = true;
    mm.anyHoverHover = true;
    expect(hasTouchUiSupport()).toBe(true);
    expect(detectDefaultTouchUiEnabled()).toBe(false);
    expect(isTouchDevice()).toBe(false);
  });

  it('allows manual override of touch-ui mode', () => {
    setMaxTouchPoints(0);
    mm.anyPointerCoarse = false;
    mm.anyPointerFine = true;
    mm.anyHoverHover = true;
    expect(isTouchDevice()).toBe(false);
    setTouchUiEnabledOverride(true);
    expect(isTouchDevice()).toBe(true);
  });
});
