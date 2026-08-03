/**
 * Tests for gnomeAppearance.ts
 * - randomGnomeAppearance stays within valid ranges/options
 * - cycleNext wraps correctly
 * - isValidGnomeAppearance shape validation
 */

import {
  BEARD_SHAPES,
  CLOTHING_STYLES,
  clampChannel,
  clampUnit,
  cycleNext,
  DEFAULT_GNOME_APPEARANCE,
  HAIR_LENGTHS,
  HAT_SHAPES,
  isValidGnomeAppearance,
  migrateGnomeAppearance,
  MUSTACHE_STYLES,
  randomGnomeAppearance,
  SHOE_SHAPES,
} from '../src/profile/gnomeAppearance';

describe('randomGnomeAppearance', () => {
  it('picks shapes/styles from the valid option sets', () => {
    for (let i = 0; i < 25; i++) {
      const a = randomGnomeAppearance();
      expect(HAT_SHAPES).toContain(a.hatShape);
      expect(HAIR_LENGTHS).toContain(a.hairLength);
      expect(MUSTACHE_STYLES).toContain(a.mustacheStyle);
      expect(BEARD_SHAPES).toContain(a.beardShape);
      expect(CLOTHING_STYLES).toContain(a.clothingStyle);
      expect(SHOE_SHAPES).toContain(a.shoeShape);
    }
  });

  it('keeps slider values within [0, 1]', () => {
    for (let i = 0; i < 25; i++) {
      const a = randomGnomeAppearance();
      expect(a.noseSize).toBeGreaterThanOrEqual(0);
      expect(a.noseSize).toBeLessThanOrEqual(1);
      expect(a.clothingHeight).toBeGreaterThanOrEqual(0);
      expect(a.clothingHeight).toBeLessThanOrEqual(1);
      expect(a.shoeSize).toBeGreaterThanOrEqual(0);
      expect(a.shoeSize).toBeLessThanOrEqual(1);
    }
  });

  it('produces valid RGB channel values', () => {
    const a = randomGnomeAppearance();
    for (const color of [a.hatColor, a.hairColor, a.clothingColor, a.shoeColor, a.skinColor]) {
      for (const channel of [color.r, color.g, color.b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('produces appearances that pass isValidGnomeAppearance', () => {
    expect(isValidGnomeAppearance(randomGnomeAppearance())).toBe(true);
  });
});

describe('cycleNext', () => {
  it('advances to the next option', () => {
    expect(cycleNext(HAT_SHAPES, 'pointy')).toBe('topHat');
  });

  it('wraps around after the last option', () => {
    const last = HAT_SHAPES[HAT_SHAPES.length - 1];
    expect(cycleNext(HAT_SHAPES, last)).toBe(HAT_SHAPES[0]);
  });

  it('defaults to the first option when the current value is not found', () => {
    expect(cycleNext(HAT_SHAPES, 'nonexistent' as never)).toBe(HAT_SHAPES[0]);
  });
});

describe('clampUnit', () => {
  it('clamps values below 0 to 0', () => {
    expect(clampUnit(-0.5)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clampUnit(1.5)).toBe(1);
  });

  it('passes through in-range values', () => {
    expect(clampUnit(0.42)).toBe(0.42);
  });

  it('maps non-finite values to 0', () => {
    expect(clampUnit(NaN)).toBe(0);
  });
});

describe('clampChannel', () => {
  it('clamps and rounds to an integer in [0, 255]', () => {
    expect(clampChannel(-10)).toBe(0);
    expect(clampChannel(300)).toBe(255);
    expect(clampChannel(127.6)).toBe(128);
  });
});

describe('isValidGnomeAppearance', () => {
  it('accepts the default appearance', () => {
    expect(isValidGnomeAppearance(DEFAULT_GNOME_APPEARANCE)).toBe(true);
  });

  it('rejects null/undefined/primitives', () => {
    expect(isValidGnomeAppearance(null)).toBe(false);
    expect(isValidGnomeAppearance(undefined)).toBe(false);
    expect(isValidGnomeAppearance('gnome')).toBe(false);
  });

  it('rejects an object missing required fields', () => {
    expect(isValidGnomeAppearance({ hatShape: 'pointy' })).toBe(false);
  });

  it('rejects an invalid enum value', () => {
    const bad = { ...DEFAULT_GNOME_APPEARANCE, hatShape: 'sombrero' };
    expect(isValidGnomeAppearance(bad)).toBe(false);
  });

  it('rejects a malformed color', () => {
    const bad = { ...DEFAULT_GNOME_APPEARANCE, skinColor: { r: 1, g: 2 } };
    expect(isValidGnomeAppearance(bad)).toBe(false);
  });

  it('rejects an appearance missing shoeShape', () => {
    const { shoeShape, ...withoutShoeShape } = DEFAULT_GNOME_APPEARANCE;
    expect(isValidGnomeAppearance(withoutShoeShape)).toBe(false);
  });
});

describe('migrateGnomeAppearance', () => {
  it('adds a default shoeShape to an appearance saved before shoe shapes existed', () => {
    const { shoeShape, ...legacy } = DEFAULT_GNOME_APPEARANCE;
    const migrated = migrateGnomeAppearance(legacy);
    expect(isValidGnomeAppearance(migrated)).toBe(true);
    expect((migrated as typeof DEFAULT_GNOME_APPEARANCE).shoeShape).toBe('clog');
  });

  it('leaves an already-valid appearance untouched', () => {
    const migrated = migrateGnomeAppearance(DEFAULT_GNOME_APPEARANCE);
    expect(migrated).toEqual(DEFAULT_GNOME_APPEARANCE);
  });

  it('passes through non-object values unchanged', () => {
    expect(migrateGnomeAppearance(null)).toBeNull();
    expect(migrateGnomeAppearance('gnome')).toBe('gnome');
  });
});
