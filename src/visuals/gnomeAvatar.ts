/**
 * Procedural, layered-SVG rendering of the per-profile gnome avatar.
 *
 * Built with the same hand-composed svgEl/svgRoot approach used for legend
 * icons in `src/modals/rulesModal.ts` — there are no sprite assets in this
 * project, everything is drawn from primitives.
 */

import { svgEl, svgRoot } from '../svgUtils';
import type {
  BeardShape,
  ClothingStyle,
  GnomeAppearance,
  HairLength,
  HatShape,
  MustacheStyle,
  RgbColor,
  ShoeShape,
} from '../profile/gnomeAppearance';

/** Avatar pixel height (for the body, excluding hat) used across the game unless a call site scales it. */
export const GNOME_DEFAULT_PIXEL_HEIGHT = 100;

/**
 * Internal SVG coordinate system, centered horizontally at x=0 (range roughly
 * -VIEW_W/2 .. +VIEW_W/2). Every call site scales from this via `pixelHeight`.
 */
const VIEW_W = 80;

const OUTLINE = 'rgba(0,0,0,0.28)';
const OUTLINE_WIDTH = 1.5;

// ─── Body layout constants (all in view-box units) ────────────────────────────

const GROUND_Y = 148;
const SHOE_H_MIN = 8;
const SHOE_H_MAX = 20;
const SHOE_W_MIN = 22;
const SHOE_W_MAX = 34;

const HIP_Y = 108;
const COLLAR_Y = 72;
const HEAD_CENTER_Y = 50;
const HEAD_RADIUS = 16;
const HEAD_TOP_Y = HEAD_CENTER_Y - HEAD_RADIUS;
const NOSE_CENTER_Y = HEAD_CENTER_Y + 5;
const MOUTH_Y = HEAD_CENTER_Y + 11;
const BRIM_Y = HEAD_CENTER_Y - 2;

const BODY_HALF_WIDTH_TOP = 17;
const BODY_HALF_WIDTH_HIP = 15;
const LEG_HALF_WIDTH = 11;

const SHOULDER_X = BODY_HALF_WIDTH_TOP;
// Hand position is pulled in from its "full reach" spot by ARM_SHORTEN on both axes, so
// shortening the arms also brings the hands inward rather than just raising them
// straight up (which would look like the forearm stretched sideways).
const ARM_SHORTEN = 6;
const HAND_Y = HIP_Y + 4 - ARM_SHORTEN;
const HAND_X = 27 - ARM_SHORTEN;
const HAND_RADIUS = 7 * 0.7;
/** Visual thickness of the drawn arm (shoulder and wrist are each this much narrower
 *  than the shoulder/hand anchor x, on the inner/body-facing side). */
const ARM_WIDTH = 6;
/**
 * Hand circle center x (right side; negate for the left hand) — placed so the hand's
 * inner edge lines up with the arm's inner (body-facing) edge at the wrist, rather than
 * the hand being centered on the arm's own centerline or its outer edge.
 */
const HAND_CENTER_X = (HAND_X - ARM_WIDTH) + HAND_RADIUS;

/**
 * Fixed bottom edge for the legs (and the clothing hem's lower limit) — independent of
 * shoeSize, so adjusting shoe size never changes the body's proportions. Shoes are drawn
 * as an overlay on top of the legs/clothing and simply cover more or less of this fixed
 * leg length as they grow.
 */
const LEG_BOTTOM_Y = GROUND_Y - SHOE_H_MIN;

/** The gnome's height without a hat, in view-box units — maps directly to `pixelHeight`. */
const BODY_HEIGHT_UNITS = GROUND_Y - HEAD_TOP_Y;

/** Topmost y used by each hat shape's geometry (with a small margin for the outline stroke). */
const HAT_TOP_Y_BY_SHAPE: Record<HatShape, number> = {
  pointy: (HEAD_TOP_Y - 32) - 3,
  topHat: (HEAD_TOP_Y - 22) - 5,
  bowler: (BRIM_Y - 24) - 3,
  straw:  (BRIM_Y - 20) - 3,
};

/** Tallest possible hat headroom — used for the editor dialog's fixed preview frame. */
const MAX_HAT_TOP_Y = Math.min(...Object.values(HAT_TOP_Y_BY_SHAPE));

/**
 * Normalized (0..1 of the *fixed-frame* canvas — see `renderGnomeAvatarSvg`'s
 * `fixedFrame` option) anchor points for the editor dialog's icon buttons.
 */
export const GNOME_FEATURE_ANCHORS: Record<
  'hat' | 'hair' | 'skin' | 'nose' | 'mustache' | 'beard' | 'clothing' | 'shoes',
  { xFrac: number; yFrac: number }
> = (() => {
  const top = MAX_HAT_TOP_Y;
  const total = GROUND_Y - top;
  const yFrac = (y: number): number => (y - top) / total;
  return {
    hat:      { xFrac: 0.5,  yFrac: yFrac(HAT_TOP_Y_BY_SHAPE.pointy + 6) },
    hair:     { xFrac: 0.85, yFrac: yFrac(HEAD_CENTER_Y) },
    // Upper-body height (chest), not the face — skin also covers the arms, so this reads
    // more clearly as a "body" control down here than clustered with the face buttons.
    skin:     { xFrac: 0.15, yFrac: yFrac(COLLAR_Y + 8) },
    nose:     { xFrac: 0.5,  yFrac: yFrac(NOSE_CENTER_Y) },
    mustache: { xFrac: 0.5,  yFrac: yFrac(MOUTH_Y) },
    beard:    { xFrac: 0.5,  yFrac: yFrac(HEAD_CENTER_Y + HEAD_RADIUS + 6) },
    clothing: { xFrac: 0.5,  yFrac: yFrac(HIP_Y) },
    shoes:    { xFrac: 0.5,  yFrac: yFrac(GROUND_Y - 6) },
  };
})();

// ─── Primitive helpers ─────────────────────────────────────────────────────────

function rgb(c: RgbColor): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

function darken(c: RgbColor, amount: number): string {
  const f = 1 - amount;
  return `rgb(${Math.round(c.r * f)},${Math.round(c.g * f)},${Math.round(c.b * f)})`;
}

function circleEl(cx: number, cy: number, r: number, fill: string, outline = true): SVGElement {
  const attrs: Record<string, string | number> = { cx, cy, r, fill };
  if (outline) { attrs.stroke = OUTLINE; attrs['stroke-width'] = OUTLINE_WIDTH; }
  return svgEl('circle', attrs);
}

function ellipseEl(cx: number, cy: number, rx: number, ry: number, fill: string, outline = true): SVGElement {
  const attrs: Record<string, string | number> = { cx, cy, rx, ry, fill };
  if (outline) { attrs.stroke = OUTLINE; attrs['stroke-width'] = OUTLINE_WIDTH; }
  return svgEl('ellipse', attrs);
}

function rectEl(x: number, y: number, w: number, h: number, fill: string, rxRound = 0, outline = true): SVGElement {
  const attrs: Record<string, string | number> = { x, y, width: w, height: h, fill, rx: rxRound };
  if (outline) { attrs.stroke = OUTLINE; attrs['stroke-width'] = OUTLINE_WIDTH; }
  return svgEl('rect', attrs);
}

function polygonEl(points: Array<[number, number]>, fill: string, outline = true): SVGElement {
  const attrs: Record<string, string | number> = {
    points: points.map(([x, y]) => `${x},${y}`).join(' '),
    fill,
  };
  if (outline) { attrs.stroke = OUTLINE; attrs['stroke-width'] = OUTLINE_WIDTH; }
  return svgEl('polygon', attrs);
}

function pathEl(d: string, fill: string, outline = true): SVGElement {
  const attrs: Record<string, string | number> = { d, fill };
  if (outline) { attrs.stroke = OUTLINE; attrs['stroke-width'] = OUTLINE_WIDTH; }
  return svgEl('path', attrs);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Layer builders (bottom → top paint order) ────────────────────────────────

/** Connects the head to the torso. Drawn first (behind every other layer) since the
 *  collar/beard/hair painted later fully cover its top and bottom edges. */
function buildNeck(appearance: GnomeAppearance): SVGElement[] {
  const skin = rgb(appearance.skinColor);
  const neckHalfWidth = 6;
  const topY = HEAD_CENTER_Y + HEAD_RADIUS - 6;
  const bottomY = COLLAR_Y + 6;
  return [rectEl(-neckHalfWidth, topY, neckHalfWidth * 2, bottomY - topY, skin, 0, false)];
}

/**
 * Build one shoe. `side` is the outward direction from the body's centerline (-1 for the
 * left shoe, +1 for the right), used by the asymmetric shapes to know which edge is the
 * "outside" (away from the body) vs. "inside" (toward the body) of that foot.
 */
function buildSingleShoe(
  cx: number,
  side: -1 | 1,
  shoeW: number,
  shoeH: number,
  topY: number,
  fill: string,
  shape: ShoeShape,
): SVGElement {
  const halfW = shoeW / 2;
  const leftX = cx - halfW;
  const rightX = cx + halfW;
  const bottomY = topY + shoeH;

  if (shape === 'pointed') {
    // Heel (inside edge) stays a rounded block; the outside edge tapers to a toe point.
    const heelX = cx - side * halfW * 0.9;
    const shoulderX = cx + side * halfW * 0.2;
    const tipX = cx + side * (halfW + shoeH * 0.55);
    const midY = topY + shoeH / 2;
    return pathEl(
      `M ${heelX} ${topY} `
      + `Q ${cx - side * halfW * 0.3} ${topY} ${shoulderX} ${topY + shoeH * 0.12} `
      + `L ${tipX} ${midY} `
      + `L ${shoulderX} ${bottomY - shoeH * 0.12} `
      + `Q ${cx - side * halfW * 0.3} ${bottomY} ${heelX} ${bottomY} Z`,
      fill,
    );
  }

  if (shape === 'rounded') {
    // Outside upper corner (left edge for the left shoe, right edge for the right shoe)
    // curves up higher than the inside upper corner.
    const outerTopY = topY - shoeH * 0.15;
    const innerTopY = topY + shoeH * 0.15;
    const peakY = Math.min(outerTopY, innerTopY) - shoeH * 0.2;
    return pathEl(
      `M ${leftX} ${bottomY} `
      + `L ${leftX} ${side < 0 ? outerTopY : innerTopY} `
      + `Q ${cx} ${peakY} ${rightX} ${side < 0 ? innerTopY : outerTopY} `
      + `L ${rightX} ${bottomY} Z`,
      fill,
    );
  }

  // clog (original) — simple rounded rect.
  return rectEl(leftX, topY, shoeW, shoeH, fill, shoeH * 0.4);
}

function buildShoes(appearance: GnomeAppearance): SVGElement[] {
  const shoeH = lerp(SHOE_H_MIN, SHOE_H_MAX, appearance.shoeSize);
  const shoeW = lerp(SHOE_W_MIN, SHOE_W_MAX, appearance.shoeSize);
  const fill = rgb(appearance.shoeColor);
  const y = GROUND_Y - shoeH;
  // Centered at half its own width from x=0, so the inner edge always lands exactly at
  // the centerline — the two shoes stay touching there regardless of shoeSize, instead of
  // a fixed center-offset that leaves a gap for small shoes and an overlap for large ones.
  const cx = shoeW / 2;
  return [
    buildSingleShoe(-cx, -1, shoeW, shoeH, y, fill, appearance.shoeShape),
    buildSingleShoe(cx, 1, shoeW, shoeH, y, fill, appearance.shoeShape),
  ];
}

function buildLegsAndArms(appearance: GnomeAppearance): SVGElement[] {
  const skin = rgb(appearance.skinColor);

  const legs = polygonEl([
    [-LEG_HALF_WIDTH, HIP_Y],
    [LEG_HALF_WIDTH, HIP_Y],
    [LEG_HALF_WIDTH - 2, LEG_BOTTOM_Y],
    [-(LEG_HALF_WIDTH - 2), LEG_BOTTOM_Y],
  ], skin);

  // Thin centerline so the single leg shape still reads as two legs. Drawn on the legs
  // layer (below clothing), so only whatever portion of the legs the clothing/shoes leave
  // exposed ever shows it — the clothing shape itself is untouched.
  const legDivider = svgEl('line', {
    x1: 0, y1: HIP_Y, x2: 0, y2: LEG_BOTTOM_Y,
    stroke: darken(appearance.skinColor, 0.3),
    'stroke-width': 1.2,
  });

  // Point order goes outer-top -> inner-top -> inner-bottom -> outer-bottom all the way
  // around the perimeter — mismatching that order (e.g. outer/inner swapped on one edge)
  // makes the quadrilateral self-intersect into a bowtie instead of a trapezoid.
  const armLeft = polygonEl([
    [-SHOULDER_X, COLLAR_Y],
    [-(SHOULDER_X - ARM_WIDTH), COLLAR_Y],
    [-(HAND_X - ARM_WIDTH), HAND_Y],
    [-HAND_X, HAND_Y],
  ], skin);
  const armRight = polygonEl([
    [SHOULDER_X, COLLAR_Y],
    [SHOULDER_X - ARM_WIDTH, COLLAR_Y],
    [HAND_X - ARM_WIDTH, HAND_Y],
    [HAND_X, HAND_Y],
  ], skin);

  return [legs, legDivider, armLeft, armRight];
}

function buildClothing(appearance: GnomeAppearance): SVGElement[] {
  const hemY = lerp(HIP_Y, LEG_BOTTOM_Y, appearance.clothingHeight);
  const fill = rgb(appearance.clothingColor);
  const shade = darken(appearance.clothingColor, 0.18);

  const torso = polygonEl([
    [-BODY_HALF_WIDTH_TOP, COLLAR_Y],
    [BODY_HALF_WIDTH_TOP, COLLAR_Y],
    [BODY_HALF_WIDTH_HIP, HIP_Y],
    [LEG_HALF_WIDTH + 2, hemY],
    [-(LEG_HALF_WIDTH + 2), hemY],
    [-BODY_HALF_WIDTH_HIP, HIP_Y],
  ], fill);

  const style: ClothingStyle = appearance.clothingStyle;
  if (style === 'overalls') {
    // Bib overalls: narrower center bib sitting on the chest (below the shoulder line,
    // not the neck) + two shoulder straps over bare (skin) arms, reaching from the bib
    // up to just above the shoulder line.
    const bibTopY = COLLAR_Y + 2;
    const bibHeight = 18;
    const strapTopY = COLLAR_Y - 3;
    const strapBottomY = bibTopY + 10;
    const bib = rectEl(-9, bibTopY, 18, bibHeight, fill, 2);
    const strapLeft = rectEl(-10, strapTopY, 5, strapBottomY - strapTopY, shade, 1);
    const strapRight = rectEl(5, strapTopY, 5, strapBottomY - strapTopY, shade, 1);
    return [torso, strapLeft, strapRight, bib];
  }

  // Dress styles: sleeves colored along the arms, short vs long coverage.
  const sleeveReach = style === 'longSleeveDress' ? 0.92 : 0.42;
  const sleeveLeftEndX = lerp(-SHOULDER_X, -HAND_X, sleeveReach);
  const sleeveLeftEndY = lerp(COLLAR_Y, HAND_Y, sleeveReach);
  const sleeveRightEndX = -sleeveLeftEndX;
  const sleeveRightEndY = sleeveLeftEndY;

  const sleeveLeft = polygonEl([
    [-SHOULDER_X, COLLAR_Y],
    [-(SHOULDER_X - 6), COLLAR_Y],
    [sleeveLeftEndX + 6, sleeveLeftEndY],
    [sleeveLeftEndX, sleeveLeftEndY],
  ], fill);
  const sleeveRight = polygonEl([
    [SHOULDER_X, COLLAR_Y],
    [SHOULDER_X - 6, COLLAR_Y],
    [sleeveRightEndX - 6, sleeveRightEndY],
    [sleeveRightEndX, sleeveRightEndY],
  ], fill);

  return [sleeveLeft, sleeveRight, torso];
}

function buildHands(appearance: GnomeAppearance): SVGElement[] {
  const skin = rgb(appearance.skinColor);
  return [
    circleEl(-HAND_CENTER_X, HAND_Y, HAND_RADIUS, skin),
    circleEl(HAND_CENTER_X, HAND_Y, HAND_RADIUS, skin),
  ];
}

function buildFaceBase(appearance: GnomeAppearance): SVGElement[] {
  return [circleEl(0, HEAD_CENTER_Y, HEAD_RADIUS, rgb(appearance.skinColor))];
}

function buildMouth(): SVGElement[] {
  return [svgEl('path', {
    d: `M -5 ${MOUTH_Y} Q 0 ${MOUTH_Y + 3} 5 ${MOUTH_Y}`,
    fill: 'none',
    stroke: 'rgba(60,30,20,0.65)',
    'stroke-width': 1.6,
    'stroke-linecap': 'round',
  })];
}

function buildNose(appearance: GnomeAppearance): SVGElement[] {
  const r = lerp(4, 11, appearance.noseSize);
  return [circleEl(0, NOSE_CENTER_Y, r, rgb(appearance.skinColor))];
}

function buildMustache(appearance: GnomeAppearance): SVGElement[] {
  const style: MustacheStyle = appearance.mustacheStyle;
  if (style === 'none') return [];
  const fill = rgb(appearance.hairColor);
  const y = MOUTH_Y - 3;

  if (style === 'thin') {
    return [rectEl(-7, y - 1, 14, 2.5, fill, 1)];
  }
  if (style === 'handlebar') {
    return [
      svgEl('path', {
        d: `M -9 ${y} Q -13 ${y} -14 ${y - 7}`,
        fill: 'none',
        stroke: fill,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
      svgEl('path', {
        d: `M 9 ${y} Q 13 ${y} 14 ${y - 7}`,
        fill: 'none',
        stroke: fill,
        'stroke-width': 3,
        'stroke-linecap': 'round',
      }),
      rectEl(-9, y - 1.5, 18, 3, fill, 1.5),
    ];
  }
  // bushy
  return [pathEl(`M -10 ${y - 2} Q 0 ${y + 5} 10 ${y - 2} Q 0 ${y + 2} -10 ${y - 2} Z`, fill)];
}

/**
 * Top edge for every beard shape. Raised to just above the mouth so the beard's sides sit
 * close to the face's curve near the jaw (avoiding a visible gap between the beard and the
 * head) and fully covers the chin — covering the mouth in the process is expected/fine.
 */
const BEARD_TOP_Y = MOUTH_Y - 2;

function buildBeard(appearance: GnomeAppearance): SVGElement[] {
  const shape: BeardShape = appearance.beardShape;
  if (shape === 'none') return [];
  const fill = rgb(appearance.hairColor);
  const top = BEARD_TOP_Y;
  const sideX = HEAD_RADIUS - 1;

  if (shape === 'shortRound') {
    return [pathEl(
      `M -${sideX} ${top} Q 0 ${top + 18} ${sideX} ${top} Q 0 ${top + 4} -${sideX} ${top} Z`,
      fill,
    )];
  }
  if (shape === 'longPointy') {
    return [polygonEl([
      [-sideX, top],
      [sideX, top],
      [4, top + 34],
      [0, top + 42],
      [-4, top + 34],
    ], fill)];
  }
  // longCurved
  return [pathEl(
    `M -${sideX} ${top} L ${sideX} ${top} `
    + `Q ${sideX + 2} ${top + 28} 0 ${top + 32} `
    + `Q -${sideX - 2} ${top + 28} -${sideX} ${top} Z`,
    fill,
  )];
}

function buildHair(appearance: GnomeAppearance): SVGElement[] {
  const fill = rgb(appearance.hairColor);
  const length: HairLength = appearance.hairLength;
  const reachBySide: Record<HairLength, number> = {
    short: HEAD_CENTER_Y + 4,
    medium: HEAD_CENTER_Y + 14,
    long: COLLAR_Y + 10,
  };
  const bottomY = reachBySide[length];
  const sideX = HEAD_RADIUS - 2;

  const left = pathEl(
    `M -${sideX} ${BRIM_Y} Q -${sideX + 6} ${(BRIM_Y + bottomY) / 2} -${sideX + 2} ${bottomY} `
    + `L -${sideX - 5} ${bottomY} Q -${sideX} ${(BRIM_Y + bottomY) / 2} -${sideX + 1} ${BRIM_Y} Z`,
    fill,
  );
  const right = pathEl(
    `M ${sideX} ${BRIM_Y} Q ${sideX + 6} ${(BRIM_Y + bottomY) / 2} ${sideX + 2} ${bottomY} `
    + `L ${sideX - 5} ${bottomY} Q ${sideX} ${(BRIM_Y + bottomY) / 2} ${sideX - 1} ${BRIM_Y} Z`,
    fill,
  );
  return [left, right];
}

function buildHat(appearance: GnomeAppearance): SVGElement[] {
  const fill = rgb(appearance.hatColor);
  const shade = darken(appearance.hatColor, 0.18);
  const shape: HatShape = appearance.hatShape;
  const brimHalfW = HEAD_RADIUS + 5;

  if (shape === 'pointy') {
    const apexY = HEAD_TOP_Y - 32;
    return [
      polygonEl([[-HEAD_RADIUS - 1, BRIM_Y], [HEAD_RADIUS + 1, BRIM_Y], [0, apexY]], fill),
      ellipseEl(0, BRIM_Y, brimHalfW, 4, shade),
    ];
  }
  if (shape === 'topHat') {
    // Crown sits higher (barely overlapping the brim, instead of drooping well past it) and
    // its base is a gentle upward arch — echoing the brim ellipse's own curve — rather than a
    // flat rect edge. The brim is scaled up so it's clearly wider than the crown sitting on it.
    const crownHalfW = HEAD_RADIUS + 3;
    const brimHalfWTop = HEAD_RADIUS + 9;
    const crownTop = HEAD_TOP_Y - 22;
    const crownBottomSideY = BRIM_Y - 3;
    const crownBottomCenterY = BRIM_Y + 1;
    const crown = pathEl(
      `M ${-crownHalfW} ${crownTop} L ${crownHalfW} ${crownTop} `
      + `L ${crownHalfW} ${crownBottomSideY} `
      + `Q 0 ${crownBottomCenterY} ${-crownHalfW} ${crownBottomSideY} Z`,
      fill,
    );
    return [
      ellipseEl(0, BRIM_Y, brimHalfWTop, 5, shade),
      crown,
      ellipseEl(0, crownTop, crownHalfW - 2, 3.5, shade),
    ];
  }
  if (shape === 'bowler') {
    // A closed dome path (rather than a full ellipse) stays at full width all the way
    // down before closing, so its lower edge doesn't taper to a point and leave hair
    // exposed the way an ellipse's would. Shifted up so its corners clear the brim's
    // lowest edge instead of dipping into it.
    const domeHalfW = HEAD_RADIUS + 3;
    const domeTopY = BRIM_Y - 24;
    const domeBottomY = BRIM_Y - 2;
    const dome = pathEl(
      `M ${-domeHalfW} ${domeBottomY} `
      + `Q ${-domeHalfW} ${domeTopY} 0 ${domeTopY} `
      + `Q ${domeHalfW} ${domeTopY} ${domeHalfW} ${domeBottomY} `
      + `Q 0 ${domeBottomY + 5} ${-domeHalfW} ${domeBottomY} Z`,
      fill,
    );
    return [
      ellipseEl(0, BRIM_Y, brimHalfW, 3.5, shade),
      dome,
    ];
  }
  // straw — crown's top raised (taller crown); its base is unchanged so it still spans
  // down to/past the brim, covering the sides of the hair the same as before.
  const crownHalfW = HEAD_RADIUS + 5;
  const crownBottom = BRIM_Y + 3;
  const crownTop = BRIM_Y - 20;
  return [
    rectEl(-crownHalfW, crownTop, crownHalfW * 2, crownBottom - crownTop, fill, 2),
    ellipseEl(0, BRIM_Y, brimHalfW + 5, 5, fill),
  ];
}

export interface RenderGnomeAvatarOptions {
  /**
   * When true, always reserves headroom for the tallest possible hat, so the
   * canvas size (and therefore every feature's on-screen position) stays
   * constant as the hat is cycled. Used by the editor dialog so its
   * absolutely-positioned icon buttons don't need to move on every change.
   * Game-display call sites omit this so a tall hat visibly makes the whole
   * avatar taller, per the "~100px, may be taller with a tall hat" spec.
   */
  fixedFrame?: boolean;
}

/**
 * Build a standalone `<svg>` element rendering `appearance` as a standing, front-facing
 * cartoon gnome. `pixelHeight` is the body height (feet to top of head, excluding any
 * hat) in pixels — the single knob every call site uses to change its rendered size.
 * The returned element's actual pixel height may exceed `pixelHeight` when the hat
 * needs extra headroom (e.g. a tall pointy hat).
 */
export function renderGnomeAvatarSvg(
  appearance: GnomeAppearance,
  pixelHeight: number = GNOME_DEFAULT_PIXEL_HEIGHT,
  options: RenderGnomeAvatarOptions = {},
): SVGSVGElement {
  const children: SVGElement[] = [
    ...buildNeck(appearance),
    ...buildLegsAndArms(appearance),
    ...buildClothing(appearance),
    // Shoes paint last among the body layers so they sit as a simple overlay on top of
    // the (fixed-length) legs — bigger shoes cover more of the leg rather than the leg
    // itself shrinking to make room.
    ...buildShoes(appearance),
    ...buildHands(appearance),
    ...buildFaceBase(appearance),
    ...buildMouth(),
    // Nose paints after the mustache and beard, so it stays visible on top wherever either
    // would otherwise overlap it.
    ...buildMustache(appearance),
    ...buildBeard(appearance),
    ...buildNose(appearance),
    ...buildHair(appearance),
    ...buildHat(appearance),
  ];

  const topY = options.fixedFrame ? MAX_HAT_TOP_Y : HAT_TOP_Y_BY_SHAPE[appearance.hatShape];
  const totalUnits = GROUND_Y - topY;
  const scale = pixelHeight / BODY_HEIGHT_UNITS;

  const svg = svgRoot(pixelHeight, children);
  svg.setAttribute('viewBox', `${-VIEW_W / 2} ${topY} ${VIEW_W} ${totalUnits}`);
  svg.setAttribute('width', String(VIEW_W * scale));
  svg.setAttribute('height', String(totalUnits * scale));
  return svg;
}
