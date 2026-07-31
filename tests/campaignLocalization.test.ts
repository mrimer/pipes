/**
 * Tests for campaign-content localization: resolveLocalizedText,
 * writeLocalizedText, isLocalizedTextShape, rawLocalizedTextSlice,
 * collectLocalesPresent.
 */

import {
  resolveLocalizedText,
  writeLocalizedText,
  isLocalizedTextShape,
  rawLocalizedTextSlice,
  collectLocalesPresent,
} from '../src/campaignLocalization';
import { setLocale, resetI18n } from '../src/i18n';

afterEach(() => {
  resetI18n();
});

describe('resolveLocalizedText', () => {
  it('returns empty string for undefined', () => {
    expect(resolveLocalizedText(undefined, 'en')).toBe('');
  });

  it('returns a bare string unconditionally, regardless of locale', () => {
    expect(resolveLocalizedText('Hello', 'es')).toBe('Hello');
    expect(resolveLocalizedText('Hello', 'en')).toBe('Hello');
  });

  it('returns the exact-locale value when present', () => {
    expect(resolveLocalizedText({ en: 'Hello', es: 'Hola' }, 'es')).toBe('Hola');
  });

  it('falls back to en when the requested locale is missing', () => {
    expect(resolveLocalizedText({ en: 'Hello', fr: 'Bonjour' }, 'es')).toBe('Hello');
  });

  it('falls back to the first non-empty value when neither the requested locale nor en is present', () => {
    expect(resolveLocalizedText({ fr: 'Bonjour', de: 'Hallo' }, 'es')).toBe('Bonjour');
  });

  it('skips an empty-string value and continues the fallback chain', () => {
    expect(resolveLocalizedText({ es: '', en: 'Hello' }, 'es')).toBe('Hello');
  });

  it('returns empty string when every value is empty', () => {
    expect(resolveLocalizedText({ es: '', en: '' }, 'es')).toBe('');
  });

  it('defaults locale to the current app locale via getLocale()', () => {
    setLocale('fr');
    expect(resolveLocalizedText({ en: 'Hello', fr: 'Bonjour' })).toBe('Bonjour');
  });
});

describe('rawLocalizedTextSlice', () => {
  it('returns empty string for undefined', () => {
    expect(rawLocalizedTextSlice(undefined, 'en')).toBe('');
  });

  it('treats a bare string as present for en only', () => {
    expect(rawLocalizedTextSlice('Hello', 'en')).toBe('Hello');
    expect(rawLocalizedTextSlice('Hello', 'es')).toBe('');
  });

  it('returns the exact-locale slice with no fallback for an object', () => {
    expect(rawLocalizedTextSlice({ en: 'Hello', es: 'Hola' }, 'es')).toBe('Hola');
    expect(rawLocalizedTextSlice({ en: 'Hello' }, 'es')).toBe('');
  });
});

describe('writeLocalizedText', () => {
  it('writing en on an unset field produces a bare string', () => {
    expect(writeLocalizedText(undefined, 'en', 'Hello')).toBe('Hello');
  });

  it('writing en on a bare string replaces it in place (no shape change)', () => {
    expect(writeLocalizedText('Old', 'en', 'New')).toBe('New');
  });

  it('writing a non-en locale on a bare string promotes it, preserving the original under en', () => {
    expect(writeLocalizedText('Hello', 'es', 'Hola')).toEqual({ en: 'Hello', es: 'Hola' });
  });

  it('writing a non-en locale on an unset field creates an object with only that locale', () => {
    expect(writeLocalizedText(undefined, 'es', 'Hola')).toEqual({ es: 'Hola' });
  });

  it('writing into an existing object sets that locale key', () => {
    expect(writeLocalizedText({ en: 'Hello' }, 'es', 'Hola')).toEqual({ en: 'Hello', es: 'Hola' });
  });

  it('blanking a locale key on an object deletes it', () => {
    expect(writeLocalizedText({ en: 'Hello', es: 'Hola' }, 'es', '  ')).toEqual({ en: 'Hello' });
  });

  it('blanking the only locale key returns undefined', () => {
    expect(writeLocalizedText({ en: 'Hello' }, 'en', '')).toBeUndefined();
  });

  it('blanking an unset field in en stays undefined', () => {
    expect(writeLocalizedText(undefined, 'en', '   ')).toBeUndefined();
  });

  it('trims the written value', () => {
    expect(writeLocalizedText(undefined, 'en', '  Hello  ')).toBe('Hello');
  });
});

describe('isLocalizedTextShape', () => {
  it('accepts a plain string', () => {
    expect(isLocalizedTextShape('Hello')).toBe(true);
  });

  it('accepts a locale-keyed object of strings', () => {
    expect(isLocalizedTextShape({ en: 'Hello', es: 'Hola' })).toBe(true);
  });

  it('accepts an empty object', () => {
    expect(isLocalizedTextShape({})).toBe(true);
  });

  it('rejects null', () => {
    expect(isLocalizedTextShape(null)).toBe(false);
  });

  it('rejects a number', () => {
    expect(isLocalizedTextShape(42)).toBe(false);
  });

  it('rejects an object with a non-string value', () => {
    expect(isLocalizedTextShape({ en: 'Hello', count: 3 })).toBe(false);
  });
});

describe('collectLocalesPresent', () => {
  it('returns an empty set when only bare strings and undefined are present', () => {
    expect(collectLocalesPresent(['Hello', undefined, 'World']).size).toBe(0);
  });

  it('collects locale keys from LocalizedText objects', () => {
    const locales = collectLocalesPresent([{ en: 'Hello' }, { es: 'Hola', fr: 'Bonjour' }, 'Plain']);
    expect([...locales].sort()).toEqual(['en', 'es', 'fr']);
  });

  it('deduplicates repeated locale keys across fields', () => {
    const locales = collectLocalesPresent([{ en: 'A' }, { en: 'B', es: 'C' }]);
    expect([...locales].sort()).toEqual(['en', 'es']);
  });
});
