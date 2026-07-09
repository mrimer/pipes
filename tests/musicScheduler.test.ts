/**
 * @jest-environment jsdom
 *
 * Tests for musicScheduler.ts – pure playlist/group-selection logic.
 * No audio APIs involved. jsdom is required for the localStorage-backed
 * persistence and profile round-trip tests.
 */

import { MusicScheduler, selectGroupForContext, MUSIC_REGISTRY } from '../src/audio/musicScheduler';
import type { TrackEntry, MusicGroupId } from '../src/audio/musicScheduler';
import { loadMusicVolume, saveMusicVolume } from '../src/persistence';
import { buildPlayerProfilePayload, applyPlayerProfile } from '../src/profile/playerProfile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal single-track registry for testing. */
function makeSingleTrackRegistry(): Record<MusicGroupId, TrackEntry[]> {
  return {
    menu:      [{ id: 'menu',      url: 'menu.ogg' }],
    overworld: [{ id: 'overworld', url: 'overworld.ogg' }],
    Summer:    [{ id: 'summer',    url: 'summer.ogg' }],
    Fall:      [{ id: 'fall',      url: 'fall.ogg' }],
    Dark:      [{ id: 'dark',      url: 'dark.ogg' }],
    Winter:    [{ id: 'winter',    url: 'winter.ogg' }],
    Spring:    [{ id: 'spring',    url: 'spring.ogg' }],
    challenge: [{ id: 'challenge', url: 'challenge.ogg' }],
  };
}

/** Build a registry where Summer has two tracks. */
function makeSummerTwoTrackRegistry(): Record<MusicGroupId, TrackEntry[]> {
  return {
    menu:      [{ id: 'menu',      url: 'menu.ogg' }],
    overworld: [{ id: 'overworld', url: 'overworld.ogg' }],
    Summer:    [{ id: 'a', url: 'a.ogg' }, { id: 'b', url: 'b.ogg' }],
    Fall:      [{ id: 'fall',      url: 'fall.ogg' }],
    Dark:      [{ id: 'dark',      url: 'dark.ogg' }],
    Winter:    [{ id: 'winter',    url: 'winter.ogg' }],
    Spring:    [{ id: 'spring',    url: 'spring.ogg' }],
    challenge: [{ id: 'challenge', url: 'challenge.ogg' }],
  };
}

/** Build a registry where Summer has three tracks. */
function makeSummerThreeTrackRegistry(): Record<MusicGroupId, TrackEntry[]> {
  return {
    menu:      [{ id: 'menu',      url: 'menu.ogg' }],
    overworld: [{ id: 'overworld', url: 'overworld.ogg' }],
    Summer:    [{ id: 'a', url: 'a.ogg' }, { id: 'b', url: 'b.ogg' }, { id: 'c', url: 'c.ogg' }],
    Fall:      [{ id: 'fall',      url: 'fall.ogg' }],
    Dark:      [{ id: 'dark',      url: 'dark.ogg' }],
    Winter:    [{ id: 'winter',    url: 'winter.ogg' }],
    Spring:    [{ id: 'spring',    url: 'spring.ogg' }],
    challenge: [{ id: 'challenge', url: 'challenge.ogg' }],
  };
}

/** Deterministic RNG that cycles through the provided values. */
function makeRng(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

// ─── selectGroupForContext ────────────────────────────────────────────────────

describe('selectGroupForContext', () => {
  test('challenge flag overrides style → returns challenge', () => {
    expect(selectGroupForContext({ isChallenge: true, style: 'Summer' })).toBe('challenge');
  });

  test('challenge flag with no style → returns challenge', () => {
    expect(selectGroupForContext({ isChallenge: true })).toBe('challenge');
  });

  test('isCampaignMap overrides style and challenge → returns overworld', () => {
    expect(selectGroupForContext({ isCampaignMap: true })).toBe('overworld');
    expect(selectGroupForContext({ isCampaignMap: true, style: 'Summer' })).toBe('overworld');
    expect(selectGroupForContext({ isCampaignMap: true, isChallenge: true })).toBe('overworld');
  });

  test('isCampaignMap false with style → uses style group (chapter map logic)', () => {
    expect(selectGroupForContext({ isCampaignMap: false, style: 'Summer' })).toBe('Summer');
  });

  test('each LevelStyle maps to its own group', () => {
    expect(selectGroupForContext({ style: 'Summer' })).toBe('Summer');
    expect(selectGroupForContext({ style: 'Fall'   })).toBe('Fall');
    expect(selectGroupForContext({ style: 'Dark'   })).toBe('Dark');
    expect(selectGroupForContext({ style: 'Winter' })).toBe('Winter');
    expect(selectGroupForContext({ style: 'Spring' })).toBe('Spring');
  });

  test('undefined style → Summer', () => {
    expect(selectGroupForContext({ style: undefined })).toBe('Summer');
  });

  test('empty args → Summer', () => {
    expect(selectGroupForContext({})).toBe('Summer');
  });

  test('unknown style string → Summer', () => {
    expect(selectGroupForContext({ style: 'unknown-style' })).toBe('Summer');
  });

  test('isChallenge false with style → uses style group', () => {
    expect(selectGroupForContext({ isChallenge: false, style: 'Winter' })).toBe('Winter');
  });
});

// ─── MusicScheduler.requestGroup ─────────────────────────────────────────────

describe('MusicScheduler.requestGroup', () => {
  test('returns switched=true and a trackUrl on first group request', () => {
    const s = new MusicScheduler(makeSingleTrackRegistry());
    const result = s.requestGroup('menu');
    expect(result.switched).toBe(true);
    expect(result.groupId).toBe('menu');
    expect(result.trackUrl).toBe('menu.ogg');
  });

  test('returns switched=false (no-op) when same group requested again', () => {
    const s = new MusicScheduler(makeSingleTrackRegistry());
    s.requestGroup('menu');
    const result = s.requestGroup('menu');
    expect(result.switched).toBe(false);
    expect(result.trackUrl).toBeNull();
  });

  test('returns switched=true when group changes', () => {
    const s = new MusicScheduler(makeSummerTwoTrackRegistry());
    s.requestGroup('menu');
    const result = s.requestGroup('Summer');
    expect(result.switched).toBe(true);
    expect(result.groupId).toBe('Summer');
    expect(['a.ogg', 'b.ogg']).toContain(result.trackUrl);
  });

  test('currentGroupId reflects the active group', () => {
    const s = new MusicScheduler(makeSingleTrackRegistry());
    expect(s.currentGroupId).toBeNull();
    s.requestGroup('Fall');
    expect(s.currentGroupId).toBe('Fall');
    s.requestGroup('Dark');
    expect(s.currentGroupId).toBe('Dark');
  });

  test('returns trackUrl=null for an empty group', () => {
    const reg = makeSingleTrackRegistry();
    reg.menu = [];
    const s = new MusicScheduler(reg);
    const result = s.requestGroup('menu');
    expect(result.switched).toBe(true);
    expect(result.trackUrl).toBeNull();
  });
});

// ─── MusicScheduler shuffle and nextTrack ─────────────────────────────────────

describe('MusicScheduler shuffle', () => {
  test('shuffle covers all track indices exactly once per cycle', () => {
    // Use a deterministic RNG and three-track Summer group
    const reg = makeSummerThreeTrackRegistry();
    const s = new MusicScheduler(reg, makeRng(0.1, 0.5, 0.9, 0.3, 0.7));
    const { trackUrl: url0 } = s.requestGroup('Summer');
    const url1 = s.nextTrack();
    const url2 = s.nextTrack();

    const urls = [url0, url1, url2].filter(Boolean) as string[];
    expect(urls.sort()).toEqual(['a.ogg', 'b.ogg', 'c.ogg']);
    expect(new Set(urls).size).toBe(3); // all distinct
  });

  test('nextTrack advances and wraps with reshuffle (single-track group loops)', () => {
    // Single-track group: nextTrack always returns the same URL
    const s = new MusicScheduler(makeSingleTrackRegistry(), Math.random);
    const { trackUrl } = s.requestGroup('menu');
    expect(trackUrl).toBe('menu.ogg');
    expect(s.nextTrack()).toBe('menu.ogg');
    expect(s.nextTrack()).toBe('menu.ogg');
  });

  test('reshuffle first track differs from last-played when group has 2+ tracks', () => {
    const reg = makeSummerTwoTrackRegistry();
    // Run many trials and verify the first track of each new cycle ≠ last-played
    for (let trial = 0; trial < 20; trial++) {
      const s = new MusicScheduler(reg);
      s.requestGroup('Summer');
      // There are only 2 tracks; after playing both, the reshuffle must avoid the last one.
      const first = s.nextTrack(); // completes the 2-track cycle (pos 1)
      // The next call reshuffles; its result should differ from `first`
      const reshuffledFirst = s.nextTrack();
      expect(reshuffledFirst).not.toBe(first);
    }
  });

  test('nextTrack returns null when no group is active', () => {
    const s = new MusicScheduler();
    expect(s.nextTrack()).toBeNull();
  });

  test('nextTrack returns null for empty group', () => {
    const reg = makeSingleTrackRegistry();
    reg.menu = [];
    const s = new MusicScheduler(reg);
    s.requestGroup('menu');
    expect(s.nextTrack()).toBeNull();
  });
});

// ─── MusicScheduler.reset ────────────────────────────────────────────────────

describe('MusicScheduler.reset', () => {
  test('resets to no active group', () => {
    const s = new MusicScheduler(makeSingleTrackRegistry());
    s.requestGroup('menu');
    s.reset();
    expect(s.currentGroupId).toBeNull();
    expect(s.nextTrack()).toBeNull();
  });

  test('after reset, requestGroup works as a fresh first call', () => {
    const s = new MusicScheduler(makeSingleTrackRegistry());
    s.requestGroup('menu');
    s.reset();
    const result = s.requestGroup('menu');
    expect(result.switched).toBe(true);
    expect(result.trackUrl).not.toBeNull();
  });
});

// ─── MUSIC_REGISTRY completeness ─────────────────────────────────────────────

describe('MUSIC_REGISTRY', () => {
  test('all groups have at least one track', () => {
    const groupIds: MusicGroupId[] = ['menu', 'overworld', 'Summer', 'Fall', 'Dark', 'Winter', 'Spring', 'challenge'];
    for (const id of groupIds) {
      expect(MUSIC_REGISTRY[id].length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Volume persistence ───────────────────────────────────────────────────────

describe('music volume persistence', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((k) => { delete store[k]; });
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('defaults to 50 when not yet set', () => {
    expect(loadMusicVolume()).toBe(50);
  });

  test('saveMusicVolume / loadMusicVolume round-trips', () => {
    saveMusicVolume(75);
    expect(loadMusicVolume()).toBe(75);
  });

  test('clamps to [0, 100]', () => {
    saveMusicVolume(-10);
    expect(loadMusicVolume()).toBe(0);
    saveMusicVolume(150);
    expect(loadMusicVolume()).toBe(100);
  });

  test('rounds fractional values', () => {
    saveMusicVolume(42.7);
    expect(loadMusicVolume()).toBe(43);
  });

  test('volume 0 is a valid silent-music setting', () => {
    saveMusicVolume(0);
    expect(loadMusicVolume()).toBe(0);
  });
});

// ─── Profile round-trip ──────────────────────────────────────────────────────

describe('player profile musicVolume round-trip', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((k) => store[k] ?? null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((k) => { delete store[k]; });
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('buildPlayerProfilePayload includes musicVolume', () => {
    saveMusicVolume(65);
    const payload = buildPlayerProfilePayload([]);
    expect(payload.musicVolume).toBe(65);
  });

  test('applyPlayerProfile restores musicVolume', () => {
    saveMusicVolume(65);
    const payload = buildPlayerProfilePayload([]);
    saveMusicVolume(10); // simulate changed state
    applyPlayerProfile(payload, []);
    expect(loadMusicVolume()).toBe(65);
  });

  test('missing musicVolume in imported payload defaults to 50', () => {
    saveMusicVolume(90);
    const payload = buildPlayerProfilePayload([]);
    // Simulate an old export that lacks the field
    delete payload.musicVolume;
    applyPlayerProfile(payload, []);
    expect(loadMusicVolume()).toBe(50);
  });
});
