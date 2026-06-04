/** Locale code (e.g. 'en', 'es', 'fr'). */
export type Locale = string;

/** Translation table: key → string, possibly with {placeholder} interpolation. */
export type TranslationTable = Record<string, string>;

export type TranslationParams = Record<string, string | number>;
