import { getLocale, registerTranslations, resetI18n, setLocale, t } from '../src/i18n';

describe('i18n', () => {
  afterEach(() => {
    resetI18n();
  });

  it('uses English fallback strings and interpolates placeholders', () => {
    expect(getLocale()).toBe('en');
    expect(t('profile.lastPlayed', { date: 'Today' })).toBe('Last played: Today');
    expect(t('missing.key')).toBe('missing.key');
  });

  it('uses registered locale overrides and falls back to English for missing keys', () => {
    registerTranslations('pirate', {
      'profile.title': '🏴‍☠️ Choose Pirate',
      'recording.delete.message': 'Keelhaul {playerName}?',
    });
    setLocale('pirate');

    expect(t('profile.title')).toBe('🏴‍☠️ Choose Pirate');
    expect(t('recording.delete.message', { playerName: 'Anne' })).toBe('Keelhaul Anne?');
    expect(t('profile.empty')).toBe('Empty');
  });

  it('resets back to the default English catalog', () => {
    registerTranslations('pirate', { 'profile.title': '��‍☠️ Choose Pirate' });
    setLocale('pirate');
    resetI18n();

    expect(getLocale()).toBe('en');
    expect(t('profile.title')).toBe('👤 Select Player');
  });

  it('coerces numeric params to string', () => {
    registerTranslations('en', { 'count': '{n} items' });
    setLocale('en');

    expect(t('count', { n: 5 })).toBe('5 items');
  });

  it('coerces zero numeric params to string', () => {
    registerTranslations('en', { 'count': '{n} items' });
    setLocale('en');

    expect(t('count', { n: 0 })).toBe('0 items');
  });
});
