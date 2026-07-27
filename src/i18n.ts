import { en } from './i18n/en';
import type { Locale, TranslationParams, TranslationTable } from './i18nTypes';
import { loadLocale } from './persistence';

export type { Locale, TranslationParams, TranslationTable } from './i18nTypes';

const DEFAULT_LOCALE = 'en';
const tables = new Map<Locale, TranslationTable>([[DEFAULT_LOCALE, en]]);
let currentLocale: Locale = DEFAULT_LOCALE;
let emojisEnabled = false;

/** Locales with registered translation tables, shown in the settings language picker. */
export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; nativeName: string }> = [
  { code: 'en', nativeName: 'English' },
  { code: 'es', nativeName: 'Español' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'pl', nativeName: 'Polski' },
];

export function setEmojisEnabled(enabled: boolean): void {
  emojisEnabled = enabled;
}

function stripEmoji(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}️?(‍\p{Extended_Pictographic}️?)*/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function interpolate(message: string, params?: TranslationParams): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

export function registerTranslations(locale: Locale, table: TranslationTable): void {
  tables.set(locale, table);
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function resetI18n(): void {
  currentLocale = DEFAULT_LOCALE;
  emojisEnabled = false;
  tables.clear();
  tables.set(DEFAULT_LOCALE, en);
}

/**
 * Initialize the active locale.
 * Reads localStorage 'pipes_locale' first, else uses the browser default if supported,
 * else uses fallback locale.
 */
export function initLocale(supportedLocales: readonly Locale[]): void {
  const saved = loadLocale();
  if (saved !== null && supportedLocales.includes(saved)) {
    setLocale(saved);
    return;
  }

  const browserLang = (typeof navigator !== 'undefined' ? navigator.language : DEFAULT_LOCALE).split('-')[0];
  if (supportedLocales.includes(browserLang)) {
    setLocale(browserLang);
  }
}

export function t(key: string, params?: TranslationParams): string {
  const currentTable = tables.get(currentLocale);
  const fallbackTable = tables.get(DEFAULT_LOCALE);
  const message = currentTable?.[key] ?? fallbackTable?.[key] ?? key;
  const interpolated = interpolate(message, params);
  return emojisEnabled ? interpolated : stripEmoji(interpolated);
}
