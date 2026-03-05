/** Floating animation labels that rise and fade on the canvas after tile connections. */

/** A floating animation label drawn on the canvas. */
export interface TileAnimation {
  /** Canvas pixel X of the animation origin (tile centre). */
  x: number;
  /** Canvas pixel Y of the animation origin (tile centre). */
  y: number;
  /** Text to display (e.g. '+5', '-1'). */
  text: string;
  /** CSS/canvas colour string for the label. */
  color: string;
  /** `performance.now()` timestamp when the animation started. */
  startTime: number;
  /** Total duration in milliseconds. */
  duration: number;
}

/** Duration for tile-connection animations (ms). */
export const ANIM_DURATION = 900;

/** Vertical rise in pixels over the full animation duration. */
export const ANIM_RISE_PX = 36;

/** Colour for positive (beneficial) animation labels. */
export const ANIM_POSITIVE_COLOR = '#4caf50';

/** Colour for negative (costly) animation labels. */
export const ANIM_NEGATIVE_COLOR = '#f44336';

/** Colour for zero-value animation labels. */
export const ANIM_ZERO_COLOR = '#9e9e9e';

/**
 * Choose the animation label colour based on a numeric value.
 * Positive → green, negative → red, zero → gray.
 */
export function animColor(value: number): string {
  if (value > 0) return ANIM_POSITIVE_COLOR;
  if (value < 0) return ANIM_NEGATIVE_COLOR;
  return ANIM_ZERO_COLOR;
}

/**
 * Draw all active animation labels onto the canvas and remove expired ones.
 * Mutates the `animations` array in-place (splices out finished animations).
 *
 * @param ctx - The 2D rendering context to draw onto.
 * @param animations - The live array of active animations.
 */
export function renderAnimations(
  ctx: CanvasRenderingContext2D,
  animations: TileAnimation[],
): void {
  const now = performance.now();
  let i = 0;
  while (i < animations.length) {
    const anim = animations[i];
    const elapsed = now - anim.startTime;
    if (elapsed >= anim.duration) {
      animations.splice(i, 1);
      continue;
    }
    const progress = elapsed / anim.duration;
    const alpha = 1 - progress;
    const yOffset = -ANIM_RISE_PX * progress;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = anim.color;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(anim.text, anim.x, anim.y + yOffset);
    ctx.restore();

    i++;
  }
}
