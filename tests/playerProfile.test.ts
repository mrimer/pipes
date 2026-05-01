/**
 * @jest-environment jsdom
 *
 * Tests for playerProfile.ts:
 * - computeChecksum
 * - buildPlayerProfilePayload / buildPlayerFile
 * - parsePlayerFile (type enforcement, checksum validation)
 * - applyPlayerProfile (settings restore, progress merge, max-value semantics)
 */

import {
  computeChecksum,
  buildPlayerProfilePayload,
  buildPlayerFile,
  parsePlayerFile,
  applyPlayerProfile,
  FILE_TYPE_PLAYER,
  FILE_TYPE_CAMPAIGN,
  PROFILE_FORMAT_VERSION,
  PlayerProfilePayload,
} from '../src/playerProfile';
import {
  loadPlayerName,
  loadSfxVolume,
  loadTouchUiEnabled,
  loadCommandKeyAssignments,
  loadLevelStars,
  loadLevelWater,
  loadCampaignProgress,
  loadCompletedChapters,
  loadMasteredChaptersShown,
  loadCampaignMasteredShown,
  loadCampaignCompleteShown,
  savePlayerName,
  saveSfxVolume,
  saveTouchUiEnabled,
  saveCommandKeyAssignments,
  markCampaignLevelCompleted,
  saveLevelStar,
  saveLevelWater,
  markChapterCompleted,
  markMasteredChapterShown,
  markCampaignMasteredShown,
  markCampaignCompleteShown,
} from '../src/persistence';
import { CampaignDef } from '../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearStorage(): void {
  localStorage.clear();
}

function makeMinimalCampaign(id: string, name = 'Test Campaign'): CampaignDef {
  return {
    id,
    name,
    author: 'Tester',
    chapters: [
      {
        id: 1,
        name: 'Ch 1',
        levels: [
          { id: 101, name: 'Level 1', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 102, name: 'Level 2', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
      },
      {
        id: 2,
        name: 'Ch 2',
        levels: [
          { id: 201, name: 'Level 3', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
      },
    ],
  };
}

// ─── computeChecksum ─────────────────────────────────────────────────────────

describe('computeChecksum', () => {
  it('returns an 8-character hex string', () => {
    const cs = computeChecksum('hello');
    expect(cs).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for the same input', () => {
    expect(computeChecksum('pipes game')).toBe(computeChecksum('pipes game'));
  });

  it('produces different values for different inputs', () => {
    expect(computeChecksum('abc')).not.toBe(computeChecksum('abd'));
  });

  it('handles an empty string', () => {
    expect(computeChecksum('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ─── buildPlayerProfilePayload ────────────────────────────────────────────────

describe('buildPlayerProfilePayload', () => {
  beforeEach(clearStorage);

  it('captures player settings', () => {
    savePlayerName('Alice');
    saveSfxVolume(42);
    saveTouchUiEnabled(true);
    saveCommandKeyAssignments({ moveLeft: 'a' });

    const payload = buildPlayerProfilePayload([]);
    expect(payload.playerName).toBe('Alice');
    expect(payload.sfxVolume).toBe(42);
    expect(payload.touchUiEnabled).toBe(true);
    expect(payload.commandKeys).toEqual({ moveLeft: 'a' });
  });

  it('captures per-campaign progress', () => {
    const cmp = makeMinimalCampaign('cmp_abc');
    const prog = new Set<number>();
    markCampaignLevelCompleted('cmp_abc', 101, prog);
    saveLevelStar(101, 2, 'cmp_abc');
    saveLevelWater(101, 30, 'cmp_abc');

    const payload = buildPlayerProfilePayload([cmp]);
    const block = payload.campaignProgress.find((b) => b.campaignId === 'cmp_abc');
    expect(block).toBeDefined();
    expect(block!.completedLevels).toContain(101);
    expect(block!.levelStars['101']).toBe(2);
    expect(block!.levelWater['101']).toBe(30);
  });

  it('includes campaignMasteredShown and campaignCompleteShown flags', () => {
    const cmp = makeMinimalCampaign('cmp_flags');
    markCampaignMasteredShown('cmp_flags');
    markCampaignCompleteShown('cmp_flags');

    const payload = buildPlayerProfilePayload([cmp]);
    const block = payload.campaignProgress.find((b) => b.campaignId === 'cmp_flags');
    expect(block?.campaignMasteredShown).toBe(true);
    expect(block?.campaignCompleteShown).toBe(true);
  });

  it('includes a block for every provided campaign', () => {
    const cmps = ['c1', 'c2', 'c3'].map((id) => makeMinimalCampaign(id));
    const payload = buildPlayerProfilePayload(cmps);
    expect(payload.campaignProgress.map((b) => b.campaignId)).toEqual(['c1', 'c2', 'c3']);
  });
});

// ─── buildPlayerFile ──────────────────────────────────────────────────────────

describe('buildPlayerFile', () => {
  it('sets type to FILE_TYPE_PLAYER', () => {
    const payload = buildPlayerProfilePayload([]);
    const file = buildPlayerFile(payload);
    expect(file.type).toBe(FILE_TYPE_PLAYER);
  });

  it('sets version to PROFILE_FORMAT_VERSION', () => {
    const file = buildPlayerFile(buildPlayerProfilePayload([]));
    expect(file.version).toBe(PROFILE_FORMAT_VERSION);
  });

  it('generates a valid checksum matching the payload JSON', () => {
    const payload = buildPlayerProfilePayload([]);
    const file = buildPlayerFile(payload);
    const { computeChecksum: cs } = require('../src/playerProfile');
    const expected = cs(JSON.stringify(payload));
    expect(file.checksum).toBe(expected);
  });

  it('round-trips through JSON.stringify / JSON.parse', () => {
    const payload = buildPlayerProfilePayload([]);
    const file = buildPlayerFile(payload);
    const json = JSON.stringify(file);
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(true);
  });
});

// ─── parsePlayerFile ─────────────────────────────────────────────────────────

describe('parsePlayerFile', () => {
  function makeValidJson(overrides: Record<string, unknown> = {}): string {
    const payload: PlayerProfilePayload = {
      guid: 'test-guid-bob',
      lastPlayedAt: null,
      playerName: 'Bob',
      sfxVolume: 80,
      touchUiEnabled: null,
      commandKeys: null,
      campaignProgress: [],
    };
    const { computeChecksum: cs } = require('../src/playerProfile');
    const checksum = cs(JSON.stringify(payload));
    return JSON.stringify({ type: FILE_TYPE_PLAYER, version: 1, payload, checksum, ...overrides });
  }

  it('returns ok:true for a valid player profile', () => {
    const result = parsePlayerFile(makeValidJson());
    expect(result.ok).toBe(true);
  });

  it('returns ok:false for invalid JSON', () => {
    const result = parsePlayerFile('not-json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid json/i);
  });

  it('returns ok:false for a campaign file (wrong type)', () => {
    const json = JSON.stringify({ type: FILE_TYPE_CAMPAIGN, id: 'cmp_x', name: 'X', author: 'A', chapters: [] });
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/campaign file/i);
  });

  it('returns ok:false for an unknown type', () => {
    const json = JSON.stringify({ type: 'something-else' });
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/wrong file type/i);
  });

  it('returns ok:false when checksum is missing', () => {
    const json = makeValidJson({ checksum: undefined });
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required fields/i);
  });

  it('returns ok:false when the checksum does not match', () => {
    const json = makeValidJson({ checksum: '00000000' });
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/checksum mismatch/i);
  });

  it('returns ok:false for a non-object payload', () => {
    const json = JSON.stringify({ type: FILE_TYPE_PLAYER, version: 1, payload: 'bad', checksum: 'x' });
    const result = parsePlayerFile(json);
    expect(result.ok).toBe(false);
  });
});

// ─── applyPlayerProfile ───────────────────────────────────────────────────────

describe('applyPlayerProfile – settings', () => {
  beforeEach(clearStorage);

  function makePayload(overrides: Partial<PlayerProfilePayload> = {}): PlayerProfilePayload {
    return {
      guid: 'test-guid',
      lastPlayedAt: null,
      playerName: 'Carol',
      sfxVolume: 60,
      touchUiEnabled: false,
      commandKeys: { moveLeft: 'a' },
      campaignProgress: [],
      ...overrides,
    };
  }

  it('restores player name', () => {
    applyPlayerProfile(makePayload({ playerName: 'Carol' }), []);
    expect(loadPlayerName()).toBe('Carol');
  });

  it('restores sfx volume', () => {
    applyPlayerProfile(makePayload({ sfxVolume: 55 }), []);
    expect(loadSfxVolume()).toBe(55);
  });

  it('restores touch UI enabled', () => {
    applyPlayerProfile(makePayload({ touchUiEnabled: true }), []);
    expect(loadTouchUiEnabled()).toBe(true);
  });

  it('does not overwrite touch UI when null', () => {
    saveTouchUiEnabled(true);
    applyPlayerProfile(makePayload({ touchUiEnabled: null }), []);
    expect(loadTouchUiEnabled()).toBe(true);
  });

  it('restores command keys', () => {
    applyPlayerProfile(makePayload({ commandKeys: { shoot: 'q' } }), []);
    expect(loadCommandKeyAssignments()).toEqual({ shoot: 'q' });
  });

  it('does not overwrite command keys when null', () => {
    saveCommandKeyAssignments({ shoot: 'x' });
    applyPlayerProfile(makePayload({ commandKeys: null }), []);
    expect(loadCommandKeyAssignments()).toEqual({ shoot: 'x' });
  });
});

describe('applyPlayerProfile – campaign progress', () => {
  beforeEach(clearStorage);

  it('ignores campaigns not present locally', () => {
    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_ghost',
          campaignName: 'cmp_ghost',
          completedLevels: [101], completedChapters: [1], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    const result = applyPlayerProfile(payload, []);
    const ignored = result.outcomes.filter((o) => o.status === 'ignored');
    expect(ignored).toHaveLength(1);
    expect(ignored[0].campaignId).toBe('cmp_ghost');
  });

  it('merges campaign levels by union', () => {
    const cmp = makeMinimalCampaign('cmp_merge');
    const localProg = new Set<number>();
    markCampaignLevelCompleted('cmp_merge', 101, localProg);

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_merge',
          campaignName: 'cmp_merge',
          completedLevels: [102], completedChapters: [], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);

    const after = loadCampaignProgress('cmp_merge');
    expect(after.has(101)).toBe(true);  // local preserved
    expect(after.has(102)).toBe(true);  // imported added
  });

  it('merges campaign chapters by union', () => {
    const cmp = makeMinimalCampaign('cmp_ch');
    const localCh = new Set<number>();
    markChapterCompleted('cmp_ch', 1, localCh);

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_ch',
          campaignName: 'cmp_ch',
          completedLevels: [], completedChapters: [2], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);

    const after = loadCompletedChapters('cmp_ch');
    expect(after.has(1)).toBe(true);
    expect(after.has(2)).toBe(true);
  });

  it('merges campaign stars with max-value semantics', () => {
    const cmp = makeMinimalCampaign('cmp_stars');
    saveLevelStar(101, 2, 'cmp_stars');

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_stars',
          campaignName: 'cmp_stars',
          completedLevels: [], completedChapters: [], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: { '101': 3, '102': 1 },
          levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);
    expect(loadLevelStars('cmp_stars')[101]).toBe(3);  // imported > local
    expect(loadLevelStars('cmp_stars')[102]).toBe(1);  // new entry
  });

  it('does not overwrite higher local campaign stars', () => {
    const cmp = makeMinimalCampaign('cmp_nodown');
    saveLevelStar(101, 3, 'cmp_nodown');

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_nodown',
          campaignName: 'cmp_nodown',
          completedLevels: [], completedChapters: [], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: { '101': 1 },
          levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);
    expect(loadLevelStars('cmp_nodown')[101]).toBe(3);
  });

  it('merges mastered-shown flag (only sets, never clears)', () => {
    const cmp = makeMinimalCampaign('cmp_ms');
    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_ms',
          campaignName: 'cmp_ms',
          completedLevels: [], completedChapters: [], masteredChaptersShown: [1],
          campaignMasteredShown: true, campaignCompleteShown: true,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);
    const shown = loadMasteredChaptersShown('cmp_ms');
    expect(shown.has(1)).toBe(true);
    expect(loadCampaignMasteredShown('cmp_ms')).toBe(true);
    expect(loadCampaignCompleteShown('cmp_ms')).toBe(true);
  });

  it('does not write stale level IDs from import to local storage', () => {
    // Campaign only has levels 101 and 102; payload contains stale level 999
    const cmp = makeMinimalCampaign('cmp_stale_import');

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_stale_import',
          campaignName: 'cmp_stale_import',
          completedLevels: [101, 999],
          completedChapters: [],
          masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: { '101': 2, '999': 3 },
          levelWater: { '101': 10, '999': 20 },
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);

    const progress = loadCampaignProgress('cmp_stale_import');
    expect(progress.has(101)).toBe(true);   // valid – kept
    expect(progress.has(999)).toBe(false);  // stale – dropped

    const stars = loadLevelStars('cmp_stale_import');
    expect(stars[101]).toBe(2);             // valid – kept
    expect(stars[999]).toBeUndefined();     // stale – dropped

    const water = loadLevelWater('cmp_stale_import');
    expect(water[101]).toBe(10);            // valid – kept
    expect(water[999]).toBeUndefined();     // stale – dropped
  });

  it('does not write stale chapter IDs from import to local storage', () => {
    // Campaign only has chapter 1; payload contains stale chapter 99
    const cmp = makeMinimalCampaign('cmp_stale_ch_import');

    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_stale_ch_import',
          campaignName: 'cmp_stale_ch_import',
          completedLevels: [],
          completedChapters: [1, 99],
          masteredChaptersShown: [1, 99],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    applyPlayerProfile(payload, [cmp]);

    const chapters = loadCompletedChapters('cmp_stale_ch_import');
    expect(chapters.has(1)).toBe(true);    // valid – kept
    expect(chapters.has(99)).toBe(false);  // stale – dropped

    const mastered = loadMasteredChaptersShown('cmp_stale_ch_import');
    expect(mastered.has(1)).toBe(true);    // valid – kept
    expect(mastered.has(99)).toBe(false);  // stale – dropped
  });

  it('reports merged and ignored campaigns separately', () => {
    const local = makeMinimalCampaign('cmp_local', 'Local Campaign');
    const payload: PlayerProfilePayload = {
      guid: 'test-guid', lastPlayedAt: null, playerName: 'Test', sfxVolume: 100, touchUiEnabled: null, commandKeys: null,
      campaignProgress: [
        {
          campaignId: 'cmp_local',
          campaignName: 'Local Campaign',
          completedLevels: [], completedChapters: [], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
        {
          campaignId: 'cmp_missing',
          campaignName: 'Missing Campaign',
          completedLevels: [], completedChapters: [], masteredChaptersShown: [],
          campaignMasteredShown: false, campaignCompleteShown: false,
          levelStars: {}, levelWater: {},
        },
      ],
    };
    const result = applyPlayerProfile(payload, [local]);
    const merged  = result.outcomes.filter((o) => o.status === 'merged');
    const ignored = result.outcomes.filter((o) => o.status === 'ignored');
    expect(merged).toHaveLength(1);
    expect(merged[0].campaignId).toBe('cmp_local');
    expect((merged[0] as { campaignName: string }).campaignName).toBe('Local Campaign');
    expect(ignored).toHaveLength(1);
    expect(ignored[0].campaignId).toBe('cmp_missing');
    expect((ignored[0] as { campaignName: string }).campaignName).toBe('Missing Campaign');
  });
});
