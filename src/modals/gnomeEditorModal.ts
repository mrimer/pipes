/**
 * Dialog for editing a player's gnome avatar appearance.
 *
 * Every change is applied and reported via `onChange` immediately (no
 * separate save step) — matches the callback-based ownership split used by
 * `buildEditPlayerNameModal` in gameModals.ts, where the caller owns
 * persistence and this module owns only the DOM.
 */

import { createModalOverlay } from './gameModals';
import { setupModal } from './modalUtils';
import { t } from '../i18n';
import { RADIUS_LG, RADIUS_MD, UI_BG } from '../uiConstants';
import { attachClickOutsideToClose, createRoundIconButton } from '../uiHelpers';
import type { GnomeAppearance, RgbColor } from '../profile/gnomeAppearance';
import {
  BEARD_SHAPES,
  CLOTHING_STYLES,
  clampChannel,
  clampUnit,
  cycleNext,
  HAIR_LENGTHS,
  HAT_SHAPES,
  MUSTACHE_STYLES,
  SHOE_SHAPES,
} from '../profile/gnomeAppearance';
import { GNOME_FEATURE_ANCHORS, renderGnomeAvatarSvg } from '../visuals/gnomeAvatar';

const PREVIEW_PIXEL_HEIGHT = 240;

function rgbToCss(c: RgbColor): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

export function buildGnomeEditorModal(
  initial: GnomeAppearance,
  onChange: (appearance: GnomeAppearance) => void,
  onClose: () => void,
): void {
  let appearance: GnomeAppearance = { ...initial };
  // Tracks which popover is open (so clicking its own trigger button again toggles it
  // closed instead of tearing it down and immediately reopening in place) and the popover's
  // own element/listener so there's exactly one place that actually removes it from the DOM.
  let openPopoverKey: string | null = null;
  let openPopoverEl: HTMLElement | null = null;
  let detachOutsideListener: (() => void) | null = null;

  const el = createModalOverlay(0.7);
  const box = document.createElement('div');
  box.style.cssText =
    `background:${UI_BG};border:2px solid #4a90d9;border-radius:${RADIUS_LG};` +
    'padding:24px 28px;display:flex;flex-direction:column;gap:16px;align-items:center;';

  const title = document.createElement('h2');
  title.style.cssText = 'margin:0;font-size:1.15rem;color:#74b9ff;';
  title.textContent = t('gnome.editTitle');
  box.appendChild(title);

  const previewWrap = document.createElement('div');
  previewWrap.style.cssText = 'position:relative;';
  box.appendChild(previewWrap);

  const avatarSlot = document.createElement('div');
  avatarSlot.style.cssText = 'position:absolute;left:0;top:0;';
  previewWrap.appendChild(avatarSlot);

  // Fixed-frame render size never changes with appearance, so the preview box (and
  // every button anchor within it) can be sized once up front.
  const probeSvg = renderGnomeAvatarSvg(appearance, PREVIEW_PIXEL_HEIGHT, { fixedFrame: true });
  const frameWidth = Number(probeSvg.getAttribute('width'));
  const frameHeight = Number(probeSvg.getAttribute('height'));
  previewWrap.style.width = `${frameWidth}px`;
  previewWrap.style.height = `${frameHeight}px`;

  function redrawAvatar(): void {
    avatarSlot.innerHTML = '';
    avatarSlot.appendChild(renderGnomeAvatarSvg(appearance, PREVIEW_PIXEL_HEIGHT, { fixedFrame: true }));
  }
  redrawAvatar();

  function applyChange(mutate: (a: GnomeAppearance) => GnomeAppearance): void {
    appearance = mutate(appearance);
    redrawAvatar();
    onChange(appearance);
  }

  function anchorPx(key: keyof typeof GNOME_FEATURE_ANCHORS): { x: number; y: number } {
    const a = GNOME_FEATURE_ANCHORS[key];
    return { x: a.xFrac * frameWidth, y: a.yFrac * frameHeight };
  }

  /** Position an absolutely-positioned child of `previewWrap`, centered at (x + dx, y + dy). */
  function placeAt(node: HTMLElement, x: number, y: number, dx: number, dy: number): void {
    node.style.position = 'absolute';
    node.style.left = `${x + dx}px`;
    node.style.top = `${y + dy}px`;
    node.style.transform = 'translate(-50%, -50%)';
    previewWrap.appendChild(node);
  }

  /**
   * The one place that actually tears a popover down: detaches the outside-click listener
   * (if any), removes the element, and clears tracking state. Both the outside-click
   * callback and the manual toggle/Close-button paths route through this, so there's no
   * way to detach the listener without also removing the element (or vice versa).
   */
  function closePopover(): void {
    if (detachOutsideListener) { detachOutsideListener(); detachOutsideListener = null; }
    if (openPopoverEl) { openPopoverEl.remove(); openPopoverEl = null; }
    openPopoverKey = null;
  }

  /**
   * Opens `key`'s popover, or closes it if its own trigger button (`triggerEl`) is
   * clicked again. `triggerEl` is also excluded from the outside-click detector — see
   * {@link attachClickOutsideToClose} for why that exclusion is necessary.
   */
  function openPopover(
    key: string,
    build: () => HTMLElement,
    x: number, y: number, dx: number, dy: number,
    triggerEl: HTMLElement,
  ): void {
    if (openPopoverKey === key) { closePopover(); return; }
    closePopover();
    const pop = build();
    pop.style.position = 'absolute';
    pop.style.left = `${x + dx}px`;
    pop.style.top = `${y + dy}px`;
    pop.style.zIndex = '10';
    previewWrap.appendChild(pop);
    openPopoverKey = key;
    openPopoverEl = pop;
    detachOutsideListener = attachClickOutsideToClose(pop, closePopover, triggerEl);
  }

  function popoverShell(): HTMLDivElement {
    const pop = document.createElement('div');
    pop.style.cssText =
      `background:${UI_BG};border:1px solid #4a90d9;border-radius:${RADIUS_MD};` +
      'padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:150px;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    return pop;
  }

  function buildSliderPopover(label: string, value: number, onInput: (v: number) => void): HTMLElement {
    const pop = popoverShell();
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:0.8rem;color:#eee;';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(clampUnit(value) * 100));
    input.style.cssText = 'width:130px;';
    input.addEventListener('input', () => onInput(Number(input.value) / 100));
    pop.appendChild(labelEl);
    pop.appendChild(input);
    return pop;
  }

  function buildColorPopover(label: string, color: RgbColor, onInput: (c: RgbColor) => void): HTMLElement {
    const pop = popoverShell();
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:0.8rem;color:#eee;';
    pop.appendChild(labelEl);

    let current = { ...color };
    const swatch = document.createElement('div');
    swatch.style.cssText = `width:100%;height:16px;border-radius:3px;border:1px solid #555;background:${rgbToCss(current)};`;
    pop.appendChild(swatch);

    const channelRow = (channelLabel: string, key: keyof RgbColor): void => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const chLabel = document.createElement('span');
      chLabel.textContent = channelLabel;
      chLabel.style.cssText = 'font-size:0.75rem;color:#aaa;width:12px;';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '255';
      input.value = String(current[key]);
      input.style.cssText = 'width:110px;';
      input.addEventListener('input', () => {
        current = { ...current, [key]: clampChannel(Number(input.value)) };
        swatch.style.background = rgbToCss(current);
        onInput(current);
      });
      row.appendChild(chLabel);
      row.appendChild(input);
      pop.appendChild(row);
    };
    channelRow(t('gnome.colorChannelR'), 'r');
    channelRow(t('gnome.colorChannelG'), 'g');
    channelRow(t('gnome.colorChannelB'), 'b');
    return pop;
  }

  // ── Hat: pencil (shape) + color ────────────────────────────────────────────
  {
    const { x, y } = anchorPx('hat');
    const pencil = createRoundIconButton('✏️', t('gnome.cycleHat'), t('gnome.cycleHat'), () => {
      applyChange((a) => ({ ...a, hatShape: cycleNext(HAT_SHAPES, a.hatShape) }));
    });
    placeAt(pencil, x, y, -16, 0);
    const color = createRoundIconButton('🎨', t('gnome.colorHat'), t('gnome.colorHat'), () => {
      openPopover('hatColor', () => buildColorPopover(t('gnome.colorHat'), appearance.hatColor, (c) => {
        applyChange((a) => ({ ...a, hatColor: c }));
      }), x, y, 16, 0, color);
    });
    placeAt(color, x, y, 16, 0);
  }

  // Anchors reused by other features below to position themselves relative to hair/skin
  // rather than their own row — see the mustache/beard/nose comments for why.
  const hairAnchor = anchorPx('hair');
  const skinAnchor = anchorPx('skin');

  // ── Hair: pencil (length) + color, color sitting to the pencil's right ─────
  {
    const { x, y } = hairAnchor;
    const pencil = createRoundIconButton('✏️', t('gnome.cycleHair'), t('gnome.cycleHair'), () => {
      applyChange((a) => ({ ...a, hairLength: cycleNext(HAIR_LENGTHS, a.hairLength) }));
    });
    placeAt(pencil, x, y, 0, -14);
    const color = createRoundIconButton('🎨', t('gnome.colorHair'), t('gnome.colorHair'), () => {
      openPopover('hairColor', () => buildColorPopover(t('gnome.colorHair'), appearance.hairColor, (c) => {
        applyChange((a) => ({ ...a, hairColor: c }));
      }), x, y, 34, -14, color);
    });
    placeAt(color, x, y, 34, -14);
  }

  // ── Skin: color only, at upper-body height ──────────────────────────────────
  {
    const { x, y } = skinAnchor;
    const color = createRoundIconButton('🎨', t('gnome.colorSkin'), t('gnome.colorSkin'), () => {
      openPopover('skinColor', () => buildColorPopover(t('gnome.colorSkin'), appearance.skinColor, (c) => {
        applyChange((a) => ({ ...a, skinColor: c }));
      }), x, y, 0, 0, color);
    });
    placeAt(color, x, y, 0, 0);
  }

  // ── Nose: slider only — moved right, to about where the hair color button used to sit ──
  {
    const slider = createRoundIconButton('↔️', t('gnome.sliderNose'), t('gnome.sliderNose'), () => {
      openPopover('noseSize', () => buildSliderPopover(t('gnome.sliderNose'), appearance.noseSize, (v) => {
        applyChange((a) => ({ ...a, noseSize: clampUnit(v) }));
      }), hairAnchor.x, hairAnchor.y, 0, 14, slider);
    });
    placeAt(slider, hairAnchor.x, hairAnchor.y, 0, 14);
  }

  // ── Mustache: pencil only — aligned with the skin color button's x ─────────
  {
    const { y } = anchorPx('mustache');
    const pencil = createRoundIconButton('✏️', t('gnome.cycleMustache'), t('gnome.cycleMustache'), () => {
      applyChange((a) => ({ ...a, mustacheStyle: cycleNext(MUSTACHE_STYLES, a.mustacheStyle) }));
    });
    placeAt(pencil, skinAnchor.x, y, 0, 0);
  }

  // ── Beard: pencil only — pushed right past the arm ──────────────────────────
  {
    const { y } = anchorPx('beard');
    const pencil = createRoundIconButton('✏️', t('gnome.cycleBeard'), t('gnome.cycleBeard'), () => {
      applyChange((a) => ({ ...a, beardShape: cycleNext(BEARD_SHAPES, a.beardShape) }));
    });
    placeAt(pencil, hairAnchor.x, y, 12, 0);
  }

  // Shifts the clothing/shoe button rows off the body's centerline so they sit beside
  // the gnome rather than directly on top of the torso/shoes artwork.
  const BODY_ROW_RIGHT_SHIFT = 50;

  // ── Clothing: pencil (style) + slider (height) + color ─────────────────────
  {
    const { x, y } = anchorPx('clothing');
    const pencil = createRoundIconButton('✏️', t('gnome.cycleClothing'), t('gnome.cycleClothing'), () => {
      applyChange((a) => ({ ...a, clothingStyle: cycleNext(CLOTHING_STYLES, a.clothingStyle) }));
    });
    placeAt(pencil, x, y, -28 + BODY_ROW_RIGHT_SHIFT, 0);
    const slider = createRoundIconButton('↔️', t('gnome.sliderClothing'), t('gnome.sliderClothing'), () => {
      openPopover('clothingHeight', () => buildSliderPopover(t('gnome.sliderClothing'), appearance.clothingHeight, (v) => {
        applyChange((a) => ({ ...a, clothingHeight: clampUnit(v) }));
      }), x, y, 0 + BODY_ROW_RIGHT_SHIFT, 0, slider);
    });
    placeAt(slider, x, y, 0 + BODY_ROW_RIGHT_SHIFT, 0);
    const color = createRoundIconButton('🎨', t('gnome.colorClothing'), t('gnome.colorClothing'), () => {
      openPopover('clothingColor', () => buildColorPopover(t('gnome.colorClothing'), appearance.clothingColor, (c) => {
        applyChange((a) => ({ ...a, clothingColor: c }));
      }), x, y, 28 + BODY_ROW_RIGHT_SHIFT, 0, color);
    });
    placeAt(color, x, y, 28 + BODY_ROW_RIGHT_SHIFT, 0);
  }

  // ── Shoes: pencil (shape) + slider (size) + color ───────────────────────────
  {
    const { x, y } = anchorPx('shoes');
    const pencil = createRoundIconButton('✏️', t('gnome.cycleShoes'), t('gnome.cycleShoes'), () => {
      applyChange((a) => ({ ...a, shoeShape: cycleNext(SHOE_SHAPES, a.shoeShape) }));
    });
    placeAt(pencil, x, y, -28 + BODY_ROW_RIGHT_SHIFT, 0);
    const slider = createRoundIconButton('↔️', t('gnome.sliderShoes'), t('gnome.sliderShoes'), () => {
      // Popover opens upward (negative dy) since the shoes sit at the very bottom of the
      // preview frame — opening downward would push it off the dialog entirely.
      openPopover('shoeSize', () => buildSliderPopover(t('gnome.sliderShoes'), appearance.shoeSize, (v) => {
        applyChange((a) => ({ ...a, shoeSize: clampUnit(v) }));
      }), x, y, 0 + BODY_ROW_RIGHT_SHIFT, -75, slider);
    });
    placeAt(slider, x, y, 0 + BODY_ROW_RIGHT_SHIFT, 0);
    const color = createRoundIconButton('🎨', t('gnome.colorShoes'), t('gnome.colorShoes'), () => {
      openPopover('shoeColor', () => buildColorPopover(t('gnome.colorShoes'), appearance.shoeColor, (c) => {
        applyChange((a) => ({ ...a, shoeColor: c }));
      }), x, y, 28 + BODY_ROW_RIGHT_SHIFT, -95, color);
    });
    placeAt(color, x, y, 28 + BODY_ROW_RIGHT_SHIFT, 0);
  }

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;width:100%;';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = t('modal.common.close');
  closeBtn.style.cssText =
    `padding:8px 20px;font-size:0.95rem;background:#1a4a9a;color:#fff;` +
    `border:1px solid #4a90d9;border-radius:${RADIUS_MD};cursor:pointer;`;
  actions.appendChild(closeBtn);
  box.appendChild(actions);

  const { closeModal } = setupModal(el, { titleEl: title, onClose: () => { el.remove(); } });
  closeBtn.addEventListener('click', () => { closePopover(); closeModal(); onClose(); });

  el.appendChild(box);
  document.body.appendChild(el);
  el.style.display = 'flex';
}
