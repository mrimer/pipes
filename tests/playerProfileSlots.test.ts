/**
 * @jest-environment jsdom
 *
 * Tests for playerProfileSlots.ts:
 * - loadSlotMeta / saveSlotMeta / deleteSlotMeta / loadAllSlotMetas
 * - loadActiveSlotIndex / saveActiveSlotIndex / clearActiveSlotIndex
 * - findEmptySlotIndex
 * - generateGuid
 * - migrateIfNeeded
 * - loadSlotStats
 */

import type {
  ProfileSlotMeta} from '../src/playerProfileSlots';
import {
  PROFILE_SLOT_COUNT,
  loadSlotMeta,
  saveSlotMeta,
  deleteSlotMeta,
  loadAllSlotMetas,
  loadActiveSlotIndex,
  saveActiveSlotIndex,
  clearActiveSlotIndex,
  findEmptySlotIndex,
  generateGuid,
  migrateIfNeeded,
  loadSlotStats,
} from '../src/playerProfileSlots';
import { setActiveSlotIndex, getActiveSlotPrefix } from '../src/activeProfile';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMeta(name = 'Alice'): ProfileSlotMeta {
  return { formatVersion: 1, guid: generateGuid(), name, lastPlayedAt: null };
}

beforeEach(() => {
  localStorage.clear();
  setActiveSlotIndex(null);
});

// ─── loadSlotMeta / saveSlotMeta / deleteSlotMeta ────────────────────────────

describe('slot metadata CRUD', () => {
  it('returns null for an empty slot', () => {
    expect(loadSlotMeta(0)).toBeNull();
  });

  it('can save and load a slot', () => {
    const meta = makeMeta('Bob');
    saveSlotMeta(0, meta);
    expect(loadSlotMeta(0)).toEqual(meta);
  });

  it('can delete a slot', () => {
    saveSlotMeta(1, makeMeta());
    deleteSlotMeta(1);
    expect(loadSlotMeta(1)).toBeNull();
  });

  it('deleting a non-existent slot is a no-op', () => {
    expect(() => deleteSlotMeta(2)).not.toThrow();
    expect(loadSlotMeta(2)).toBeNull();
  });

  it('slots are independent', () => {
    const m0 = makeMeta('Alice');
    const m1 = makeMeta('Bob');
    saveSlotMeta(0, m0);
    saveSlotMeta(1, m1);
    expect(loadSlotMeta(0)).toEqual(m0);
    expect(loadSlotMeta(1)).toEqual(m1);
  });
});

// ─── loadAllSlotMetas ────────────────────────────────────────────────────────

describe('loadAllSlotMetas', () => {
  it('returns an array of the correct length', () => {
    expect(loadAllSlotMetas()).toHaveLength(PROFILE_SLOT_COUNT);
  });

  it('returns null for each empty slot', () => {
    expect(loadAllSlotMetas().every((m) => m === null)).toBe(true);
  });

  it('reflects saved slots', () => {
    saveSlotMeta(0, makeMeta('A'));
    saveSlotMeta(2, makeMeta('C'));
    const metas = loadAllSlotMetas();
    expect(metas[0]?.name).toBe('A');
    expect(metas[1]).toBeNull();
    expect(metas[2]?.name).toBe('C');
    expect(metas[3]).toBeNull();
  });
});

// ─── active slot index ───────────────────────────────────────────────────────

describe('active slot index', () => {
  it('returns null when not set', () => {
    expect(loadActiveSlotIndex()).toBeNull();
  });

  it('can save and load a slot index', () => {
    saveActiveSlotIndex(2);
    expect(loadActiveSlotIndex()).toBe(2);
  });

  it('can clear the active slot', () => {
    saveActiveSlotIndex(1);
    clearActiveSlotIndex();
    expect(loadActiveSlotIndex()).toBeNull();
  });

  it('rejects out-of-range indices gracefully (returns null)', () => {
    // Directly write a bad value to test the guard.
    localStorage.setItem('pipes_active_slot', '99');
    expect(loadActiveSlotIndex()).toBeNull();
  });
});

// ─── findEmptySlotIndex ───────────────────────────────────────────────────────

describe('findEmptySlotIndex', () => {
  it('returns 0 when all slots are empty', () => {
    expect(findEmptySlotIndex()).toBe(0);
  });

  it('returns the first empty slot', () => {
    saveSlotMeta(0, makeMeta());
    saveSlotMeta(1, makeMeta());
    expect(findEmptySlotIndex()).toBe(2);
  });

  it('returns null when all slots are occupied', () => {
    for (let i = 0; i < PROFILE_SLOT_COUNT; i++) {
      saveSlotMeta(i, makeMeta(`Player${i}`));
    }
    expect(findEmptySlotIndex()).toBeNull();
  });
});

// ─── generateGuid ────────────────────────────────────────────────────────────

describe('generateGuid', () => {
  it('returns a UUID-shaped string', () => {
    expect(generateGuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns a different value on each call', () => {
    expect(generateGuid()).not.toBe(generateGuid());
  });
});

// ─── migrateIfNeeded ─────────────────────────────────────────────────────────

describe('migrateIfNeeded', () => {
  it('returns false when there is no legacy data', () => {
    expect(migrateIfNeeded()).toBe(false);
  });

  it('returns false when slot metadata already exists (no double-migration)', () => {
    saveSlotMeta(0, makeMeta('Alice'));
    localStorage.setItem('pipes_player_name', 'Legacy');
    expect(migrateIfNeeded()).toBe(false);
  });

  it('migrates legacy player name to slot 0', () => {
    localStorage.setItem('pipes_player_name', 'LegacyPlayer');
    const migrated = migrateIfNeeded();
    expect(migrated).toBe(true);
    const meta = loadSlotMeta(0);
    expect(meta).not.toBeNull();
    expect(meta!.name).toBe('LegacyPlayer');
  });

  it('creates a valid GUID for the migrated slot', () => {
    localStorage.setItem('pipes_player_name', 'Test');
    migrateIfNeeded();
    const meta = loadSlotMeta(0);
    expect(meta!.guid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('removes legacy keys after migration', () => {
    localStorage.setItem('pipes_player_name', 'Test');
    localStorage.setItem('pipes_sfx_volume', '80');
    localStorage.setItem('pipes_active_campaign', 'cmp1');
    migrateIfNeeded();
    expect(localStorage.getItem('pipes_player_name')).toBeNull();
    expect(localStorage.getItem('pipes_sfx_volume')).toBeNull();
    expect(localStorage.getItem('pipes_active_campaign')).toBeNull();
  });

  it('copies legacy keys to slot-0 namespace', () => {
    localStorage.setItem('pipes_player_name', 'Migrated');
    localStorage.setItem('pipes_sfx_volume', '75');
    migrateIfNeeded();
    expect(localStorage.getItem('pipes_p0_player_name')).toBe('Migrated');
    expect(localStorage.getItem('pipes_p0_sfx_volume')).toBe('75');
  });

  it('migrates campaign-prefixed keys', () => {
    localStorage.setItem('pipes_campaign_progress_cmpABC', JSON.stringify([1, 2, 3]));
    migrateIfNeeded();
    expect(localStorage.getItem('pipes_campaign_progress_cmpABC')).toBeNull();
    expect(localStorage.getItem('pipes_p0_campaign_progress_cmpABC')).toBe(JSON.stringify([1, 2, 3]));
  });

  it('active-slot prefix is empty before any slot is explicitly set', () => {
    expect(getActiveSlotPrefix()).toBe('');
  });
});

// ─── loadSlotStats ────────────────────────────────────────────────────────────

describe('loadSlotStats', () => {
  it('returns zeroed stats for an empty slot with no campaign', () => {
    const stats = loadSlotStats(0);
    expect(stats.activeCampaignId).toBeNull();
    expect(stats.levelsCompleted).toBe(0);
    expect(stats.starsCollected).toBe(0);
  });

  it('reads progress from the correct slot namespace', () => {
    // Write data under slot 1's namespace.
    localStorage.setItem('pipes_p1_active_campaign', 'cmpXYZ');
    localStorage.setItem('pipes_p1_campaign_progress_cmpXYZ', JSON.stringify([101, 102, 103]));
    localStorage.setItem('pipes_p1_campaign_stars_cmpXYZ', JSON.stringify({ '101': 2, '102': 1 }));
    localStorage.setItem('pipes_p1_campaign_water_cmpXYZ', JSON.stringify({ '101': 15 }));

    const stats = loadSlotStats(1);
    expect(stats.activeCampaignId).toBe('cmpXYZ');
    expect(stats.levelsCompleted).toBe(3);
    expect(stats.starsCollected).toBe(3);
    expect(stats.waterTotal).toBe(15);
  });

  it('does not affect the globally active slot index', () => {
    setActiveSlotIndex(2);
    localStorage.setItem('pipes_p1_active_campaign', 'cmpXYZ');
    loadSlotStats(1);
    expect(getActiveSlotPrefix()).toBe('p2_');
  });
});
