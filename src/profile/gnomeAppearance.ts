/**
 * Data model, defaults, and randomization for the per-profile gnome avatar.
 *
 * Pure data-logic — no DOM dependencies. Rendering lives in
 * `src/visuals/gnomeAvatar.ts`; persistence lives in `src/persistence.ts`.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export type HatShape = 'pointy' | 'topHat' | 'bowler' | 'straw';
export type HairLength = 'short' | 'medium' | 'long';
export type MustacheStyle = 'bushy' | 'thin' | 'handlebar' | 'none';
export type BeardShape = 'shortRound' | 'longPointy' | 'longCurved' | 'none';
export type ClothingStyle = 'overalls' | 'shortSleeveDress' | 'longSleeveDress';
/** 'clog' is the original rounded wooden-shoe silhouette. */
export type ShoeShape = 'clog' | 'pointed' | 'rounded';

export interface GnomeAppearance {
  hatShape: HatShape;
  hatColor: RgbColor;
  hairLength: HairLength;
  hairColor: RgbColor;
  /** Nose radius, normalized 0 (small) .. 1 (big). */
  noseSize: number;
  mustacheStyle: MustacheStyle;
  /** Renders in hairColor — beard connects into the hair, so it has no independent color control. */
  beardShape: BeardShape;
  clothingStyle: ClothingStyle;
  clothingColor: RgbColor;
  /** Garment length, normalized 0 (short) .. 1 (tall / ankle-length). */
  clothingHeight: number;
  /** Shoe size, normalized 0 (small) .. 1 (large). */
  shoeSize: number;
  shoeColor: RgbColor;
  shoeShape: ShoeShape;
  skinColor: RgbColor;
}

export const HAT_SHAPES: readonly HatShape[] = ['pointy', 'topHat', 'bowler', 'straw'];
export const HAIR_LENGTHS: readonly HairLength[] = ['short', 'medium', 'long'];
export const MUSTACHE_STYLES: readonly MustacheStyle[] = ['bushy', 'thin', 'handlebar', 'none'];
export const BEARD_SHAPES: readonly BeardShape[] = ['shortRound', 'longPointy', 'longCurved', 'none'];
export const CLOTHING_STYLES: readonly ClothingStyle[] = ['overalls', 'shortSleeveDress', 'longSleeveDress'];
export const SHOE_SHAPES: readonly ShoeShape[] = ['clog', 'pointed', 'rounded'];

export const DEFAULT_GNOME_APPEARANCE: GnomeAppearance = {
  hatShape: 'pointy',
  hatColor: { r: 200, g: 40, b: 40 },
  hairLength: 'medium',
  hairColor: { r: 235, g: 235, b: 235 },
  noseSize: 0.5,
  mustacheStyle: 'bushy',
  beardShape: 'longPointy',
  clothingStyle: 'overalls',
  clothingColor: { r: 60, g: 90, b: 160 },
  clothingHeight: 0.6,
  shoeSize: 0.5,
  shoeColor: { r: 120, g: 75, b: 40 },
  shoeShape: 'clog',
  skinColor: { r: 235, g: 195, b: 160 },
};

/** Curated palettes used by {@link randomGnomeAppearance} so random gnomes stay pleasant-looking. */
const SKIN_TONE_PALETTE: readonly RgbColor[] = [
  { r: 255, g: 224, b: 196 },
  { r: 241, g: 194, b: 155 },
  { r: 224, g: 172, b: 132 },
  { r: 198, g: 134, b: 92 },
  { r: 141, g: 85, b: 51 },
  { r: 96, g: 58, b: 38 },
];

const HAIR_COLOR_PALETTE: readonly RgbColor[] = [
  { r: 245, g: 245, b: 245 }, // white
  { r: 200, g: 200, b: 200 }, // grey
  { r: 120, g: 80, b: 40 },   // brown
  { r: 60, g: 40, b: 25 },    // dark brown
  { r: 20, g: 20, b: 20 },    // black
  { r: 200, g: 130, b: 60 },  // ginger
];

const HAT_COLOR_PALETTE: readonly RgbColor[] = [
  { r: 200, g: 40, b: 40 },   // red
  { r: 40, g: 120, b: 60 },   // green
  { r: 40, g: 70, b: 190 },   // blue
  { r: 180, g: 140, b: 40 },  // gold
  { r: 120, g: 40, b: 140 },  // purple
  { r: 210, g: 180, b: 120 }, // straw tan
];

const CLOTHING_COLOR_PALETTE: readonly RgbColor[] = [
  { r: 60, g: 90, b: 160 },   // denim blue
  { r: 150, g: 40, b: 40 },   // deep red
  { r: 40, g: 110, b: 90 },   // forest green
  { r: 90, g: 60, b: 130 },   // violet
  { r: 160, g: 100, b: 40 },  // brown
  { r: 40, g: 40, b: 60 },    // charcoal
];

const SHOE_COLOR_PALETTE: readonly RgbColor[] = [
  { r: 120, g: 75, b: 40 },
  { r: 90, g: 55, b: 30 },
  { r: 150, g: 100, b: 55 },
  { r: 70, g: 45, b: 25 },
];

function pickRandom<T>(options: readonly T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

/** Random value in [min, max]. */
function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Generate a randomized, curated-palette gnome appearance for a freshly created profile. */
export function randomGnomeAppearance(): GnomeAppearance {
  return {
    hatShape: pickRandom(HAT_SHAPES),
    hatColor: pickRandom(HAT_COLOR_PALETTE),
    hairLength: pickRandom(HAIR_LENGTHS),
    hairColor: pickRandom(HAIR_COLOR_PALETTE),
    noseSize: randomInRange(0.3, 0.7),
    mustacheStyle: pickRandom(MUSTACHE_STYLES),
    beardShape: pickRandom(BEARD_SHAPES),
    clothingStyle: pickRandom(CLOTHING_STYLES),
    clothingColor: pickRandom(CLOTHING_COLOR_PALETTE),
    clothingHeight: randomInRange(0.3, 0.7),
    shoeSize: randomInRange(0.3, 0.7),
    shoeColor: pickRandom(SHOE_COLOR_PALETTE),
    shoeShape: pickRandom(SHOE_SHAPES),
    skinColor: pickRandom(SKIN_TONE_PALETTE),
  };
}

/** Advance to the next option in `options`, wrapping around after the last entry. */
export function cycleNext<T>(options: readonly T[], current: T): T {
  const idx = options.indexOf(current);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % options.length;
  return options[nextIdx];
}

/** Clamp a normalized slider value into [0, 1]. */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Clamp a single RGB channel into [0, 255] integers. */
export function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(255, Math.max(0, value)));
}

function isRgbColor(value: unknown): value is RgbColor {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return typeof c.r === 'number' && typeof c.g === 'number' && typeof c.b === 'number';
}

/**
 * Validate an unknown value as a {@link GnomeAppearance}. Returns `null` when the shape
 * doesn't match, so callers can fall back to {@link DEFAULT_GNOME_APPEARANCE}.
 */
export function isValidGnomeAppearance(value: unknown): value is GnomeAppearance {
  if (!value || typeof value !== 'object') return false;
  const a = value as Record<string, unknown>;
  return (
    typeof a.hatShape === 'string' && HAT_SHAPES.includes(a.hatShape as HatShape)
    && isRgbColor(a.hatColor)
    && typeof a.hairLength === 'string' && HAIR_LENGTHS.includes(a.hairLength as HairLength)
    && isRgbColor(a.hairColor)
    && typeof a.noseSize === 'number'
    && typeof a.mustacheStyle === 'string' && MUSTACHE_STYLES.includes(a.mustacheStyle as MustacheStyle)
    && typeof a.beardShape === 'string' && BEARD_SHAPES.includes(a.beardShape as BeardShape)
    && typeof a.clothingStyle === 'string' && CLOTHING_STYLES.includes(a.clothingStyle as ClothingStyle)
    && isRgbColor(a.clothingColor)
    && typeof a.clothingHeight === 'number'
    && typeof a.shoeSize === 'number'
    && isRgbColor(a.shoeColor)
    && typeof a.shoeShape === 'string' && SHOE_SHAPES.includes(a.shoeShape as ShoeShape)
    && isRgbColor(a.skinColor)
  );
}

/**
 * Patch an unknown, possibly-older-format value so it validates against the current
 * {@link GnomeAppearance} shape. Currently handles: `shoeShape` added after shoe shapes
 * only had size/color controls — profiles saved before that default to `'clog'`, the
 * original shoe silhouette, so they render unchanged.
 */
export function migrateGnomeAppearance(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const v = value as Record<string, unknown>;
  if (typeof v.shoeShape !== 'string' || !SHOE_SHAPES.includes(v.shoeShape as ShoeShape)) {
    return { ...v, shoeShape: 'clog' };
  }
  return v;
}
