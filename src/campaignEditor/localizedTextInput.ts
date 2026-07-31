/**
 * Shared builders for editing `string | LocalizedText` campaign content
 * fields (campaign/chapter/level name, level note, level hints) in the
 * Campaign Editor. Modeled on TileParamsPanel.labeledInput, but locale-aware:
 * the authoring language is the app's current locale (the same one the
 * Settings language picker controls) — there is no separate editor-only
 * language selector.
 */

import type { LocalizedText } from '../types';
import { getLocale, SUPPORTED_LOCALES } from '../i18n';
import { rawLocalizedTextSlice, resolveLocalizedText, writeLocalizedText } from '../campaignLocalization';
import { EDITOR_INPUT_BG, UI_BORDER, RADIUS_SM } from '../uiConstants';

function localeLabelSuffix(): string {
  const entry = SUPPORTED_LOCALES.find((l) => l.code === getLocale());
  return entry ? ` (${entry.nativeName})` : '';
}

/** Shared getter/setter pair every localized-field builder accepts. */
export interface LocalizedFieldBinding {
  get(): string | LocalizedText | undefined;
  set(value: string | LocalizedText | undefined): void;
}

/**
 * Build a labeled single-line `<input>` row bound to a `string | LocalizedText`
 * field. Value shown is the raw text for the current locale only (blank if
 * untranslated); the placeholder shows the fallback-resolved text so authors
 * can see what players currently see in its place.
 */
export function buildLocalizedTextInput(
  labelText: string,
  binding: LocalizedFieldBinding,
  rowCss: string,
  inputWidth?: string,
): HTMLElement {
  const locale = getLocale();
  const current = binding.get();

  const wrap = document.createElement('div');
  wrap.style.cssText = rowCss;
  const lbl = document.createElement('label');
  lbl.textContent = labelText + localeLabelSuffix();
  lbl.style.cssText = 'font-size:0.85rem;color:#aaa;';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = rawLocalizedTextSlice(current, locale);
  const fallback = resolveLocalizedText(current, locale);
  if (fallback) inp.placeholder = fallback;
  inp.style.cssText =
    'padding:6px 10px;font-size:0.9rem;background:' + EDITOR_INPUT_BG + ';color:#eee;' +
    `border:1px solid ${UI_BORDER};border-radius:${RADIUS_SM};` +
    (inputWidth ? `width:${inputWidth};` : 'flex:1;');
  inp.addEventListener('input', () => {
    binding.set(writeLocalizedText(binding.get(), locale, inp.value));
  });
  wrap.appendChild(lbl);
  wrap.appendChild(inp);
  return wrap;
}

/**
 * Build a `<textarea>` bound to a `string | LocalizedText` field, with the
 * same raw-value / fallback-placeholder behavior as
 * {@link buildLocalizedTextInput}. When there's no fallback text to show
 * (nothing authored in any locale yet), falls back to `genericPlaceholder`.
 */
export function buildLocalizedTextarea(
  binding: LocalizedFieldBinding,
  textareaStyle: string,
  genericPlaceholder?: string,
): HTMLTextAreaElement {
  const locale = getLocale();
  const current = binding.get();
  const inp = document.createElement('textarea');
  inp.value = rawLocalizedTextSlice(current, locale);
  const fallback = resolveLocalizedText(current, locale);
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string fallback should also defer to genericPlaceholder, not just null/undefined
  const placeholder = fallback || genericPlaceholder;
  if (placeholder) inp.placeholder = placeholder;
  inp.style.cssText = textareaStyle;
  inp.addEventListener('input', () => {
    binding.set(writeLocalizedText(binding.get(), locale, inp.value));
  });
  return inp;
}
