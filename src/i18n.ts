import { EN_TRANSLATIONS } from './i18nCatalog';

/** Locale code (e.g. 'en', 'es', 'fr'). */
export type Locale = string;

/** Translation table: key → string, possibly with {placeholder} interpolation. */
export type TranslationTable = Record<string, string>;

export type TranslationParams = Record<string, string | number>;

const DEFAULT_LOCALE = 'en';
const tables = new Map<Locale, TranslationTable>([[DEFAULT_LOCALE, EN_TRANSLATIONS]]);
let currentLocale: Locale = DEFAULT_LOCALE;

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
  tables.clear();
  tables.set(DEFAULT_LOCALE, EN_TRANSLATIONS);
}

export function t(key: string, params?: TranslationParams): string {
  const currentTable = tables.get(currentLocale);
  const fallbackTable = tables.get(DEFAULT_LOCALE);
  const message = currentTable?.[key] ?? fallbackTable?.[key] ?? key;
  return interpolate(message, params);
}
