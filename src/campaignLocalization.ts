/**
 * Localization for user-authored campaign content (campaign/chapter/level
 * names, level notes, level hints). Independent of the app-chrome i18n
 * system in i18n.ts: that system translates static UI strings via
 * translation-table lookups; this module resolves/writes the
 * `string | LocalizedText` fields stored inline in campaign data itself.
 */
import { getLocale } from './i18n';
import type { LocalizedText } from './types';

export { isLocalizedTextShape } from './types';

/** Default locale used as the first fallback after the current locale. */
const FALLBACK_LOCALE = 'en';

/**
 * Resolve a campaign text field to a displayable string for the given locale
 * (the current app locale by default). Fallback order: the requested locale,
 * then 'en', then the first non-empty value found in the map, then ''.
 * A bare string is locale-agnostic — it is returned unconditionally, since it
 * represents "the only text available" for that field.
 */
export function resolveLocalizedText(
  value: string | LocalizedText | undefined,
  locale: string = getLocale(),
): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty-string translation must also fall through to the next candidate, not just null/undefined
  return value[locale] || value[FALLBACK_LOCALE] || Object.values(value).find((v) => v) || '';
}

/**
 * The raw text explicitly present for `locale` in a campaign text field, with
 * no fallback — '' when this locale has no text of its own yet. A bare
 * string counts as present only for 'en' (writeLocalizedText edits it in
 * place under 'en'; any other locale must promote it first). Used by editor
 * inputs to show blank (not a fallback value) for untranslated locales, so
 * authors can see at a glance what's missing.
 */
export function rawLocalizedTextSlice(value: string | LocalizedText | undefined, locale: string): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return locale === FALLBACK_LOCALE ? value : '';
  return value[locale] ?? '';
}

/**
 * Write `newValue` for `locale` into a campaign text field, returning the
 * updated field. Tags the value with the current authoring locale:
 *  - Unset or a plain string, writing in 'en' -> stays/becomes a plain string
 *    (matches the shape every pre-existing campaign already has).
 *  - A plain string, writing in a non-'en' locale -> promoted to an object,
 *    preserving the old text under 'en' before adding the new locale.
 *  - Already an object -> the locale's key is set (or deleted, when blanked).
 * Returns `undefined` when the result would be an optional field with no
 * text in any locale (mirrors the existing "omit empty note" convention).
 */
export function writeLocalizedText(
  current: string | LocalizedText | undefined,
  locale: string,
  newValue: string,
): string | LocalizedText | undefined {
  const trimmed = newValue.trim();

  if (current === undefined || typeof current === 'string') {
    if (locale === FALLBACK_LOCALE) {
      return trimmed === '' ? undefined : trimmed;
    }
    const promoted: LocalizedText = {};
    if (current) promoted[FALLBACK_LOCALE] = current;
    if (trimmed !== '') promoted[locale] = trimmed;
    return Object.keys(promoted).length > 0 ? promoted : undefined;
  }

  const next: LocalizedText = { ...current };
  if (trimmed === '') {
    delete next[locale];
  } else {
    next[locale] = trimmed;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The set of distinct locale codes explicitly present across every
 * LocalizedText object reachable from `values` (bare strings contribute
 * nothing, since they carry no locale tag). Used to gate multi-language-only
 * UI (e.g. the translation-completeness report) so it stays hidden for
 * single-language campaigns.
 */
export function collectLocalesPresent(values: ReadonlyArray<string | LocalizedText | undefined>): Set<string> {
  const locales = new Set<string>();
  for (const value of values) {
    if (value !== undefined && typeof value !== 'string') {
      for (const locale of Object.keys(value)) locales.add(locale);
    }
  }
  return locales;
}
