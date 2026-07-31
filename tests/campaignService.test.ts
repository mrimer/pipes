/**
 * @jest-environment jsdom
 */

/**
 * Tests for CampaignService – pure data-operations service.
 */

import { saveImportedCampaigns, loadImportedCampaigns } from '../src/persistence';
import type { ImportResult } from '../src/campaignEditor';
import { CampaignService } from '../src/campaignEditor';
import type { CampaignDef, LevelDef, TileDef } from '../src/types';
import { PipeShape } from '../src/types';
import { makeCampaignDef, makeChapterDef, makeLevelDef } from './testHelpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeService(campaigns: CampaignDef[] = []): CampaignService {
  // Save to localStorage so persistence tests can read back via loadImportedCampaigns().
  // Pass the same array reference to CampaignService so mutations on the campaign
  // objects are visible through both the test variable and the service's internal list.
  saveImportedCampaigns(campaigns);
  return new CampaignService(campaigns);
}

function emptyCampaign(id = 'cmp_test', name = 'Test Campaign'): CampaignDef {
  return makeCampaignDef({ id, name, chapters: [] });
}

function campaignWithChapter(): CampaignDef {
  return makeCampaignDef({
    id: 'cmp_ch',
    name: 'Campaign',
    author: 'A',
    chapters: [
      makeChapterDef({
        id: 1,
        name: 'Chapter 1',
        levels: [makeLevelDef({ id: 101, name: 'Level 1', rows: 2, cols: 2, grid: [[null, null], [null, null]] })],
      }),
    ],
  });
}

beforeEach(() => {
  localStorage.clear();
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('CampaignService – constructor', () => {
  it('loads campaigns from storage by default', () => {
    const stored: CampaignDef[] = [emptyCampaign()];
    saveImportedCampaigns(stored);
    const svc = new CampaignService();
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.campaigns[0].id).toBe('cmp_test');
  });

  it('uses provided campaigns array instead of reading from storage', () => {
    const provided: CampaignDef[] = [emptyCampaign('cmp_provided')];
    const svc = new CampaignService(provided);
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.campaigns[0].id).toBe('cmp_provided');
  });
});

// ─── campaigns getter ─────────────────────────────────────────────────────────

describe('CampaignService – campaigns / getAllCampaigns / getCampaign', () => {
  it('campaigns returns a readonly view of the list', () => {
    const svc = makeService([emptyCampaign()]);
    expect(svc.campaigns).toHaveLength(1);
  });

  it('getAllCampaigns returns a shallow copy', () => {
    const svc = makeService([emptyCampaign()]);
    const all = svc.getAllCampaigns();
    expect(all).toHaveLength(1);
    // Should be a copy, not the same array reference
    expect(all).not.toBe(svc.campaigns);
  });

  it('getCampaign finds by ID', () => {
    const svc = makeService([emptyCampaign('cmp_a'), emptyCampaign('cmp_b')]);
    expect(svc.getCampaign('cmp_b')?.id).toBe('cmp_b');
  });

  it('getCampaign returns null for unknown ID', () => {
    const svc = makeService([emptyCampaign()]);
    expect(svc.getCampaign('missing')).toBeNull();
  });
});

// ─── ensureCampaignMaps ────────────────────────────────────────────────────────

describe('CampaignService – ensureCampaignMaps', () => {
  it('adds a default map when map fields are missing', () => {
    const campaign = emptyCampaign('cmp_missing_map');
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(true);
    expect(campaign.rows).toBe(3);
    expect(campaign.cols).toBe(6);
    expect(campaign.grid).toHaveLength(3);
    expect(campaign.grid?.[1][0]?.shape).toBe(PipeShape.Source);
    expect(campaign.grid?.[1][5]?.shape).toBe(PipeShape.Sink);
  });

  it('replaces structurally invalid campaign maps with a default map', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign('cmp_invalid_map'),
      rows: 3,
      cols: 6,
      grid: [],
    };
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(true);
    expect(campaign.grid).toHaveLength(3);
    expect(campaign.grid?.every((row) => row.length === 6)).toBe(true);
    expect(campaign.grid?.[1][0]?.shape).toBe(PipeShape.Source);
    expect(campaign.grid?.[1][5]?.shape).toBe(PipeShape.Sink);
  });

  it('does not modify campaigns that already have a valid campaign map', () => {
    const grid: (TileDef | null)[][] = Array.from({ length: 3 }, () => Array(6).fill(null) as null[]);
    grid[1][0] = { shape: PipeShape.Source };
    grid[1][5] = { shape: PipeShape.Sink };
    const campaign: CampaignDef = {
      ...emptyCampaign('cmp_valid_map'),
      rows: 3,
      cols: 6,
      grid,
      lastUpdated: '2020-01-01T00:00:00.000Z',
    };
    const svc = makeService([campaign]);

    const changed = svc.ensureCampaignMaps();

    expect(changed).toBe(false);
    expect(campaign.grid).toBe(grid);
    expect(campaign.lastUpdated).toBe('2020-01-01T00:00:00.000Z');
  });
});

// ─── reload ───────────────────────────────────────────────────────────────────

describe('CampaignService – reload', () => {
  it('re-reads campaigns from storage', () => {
    const svc = makeService([]);
    // Write a new campaign to storage externally
    saveImportedCampaigns([emptyCampaign('cmp_new')]);
    svc.reload();
    expect(svc.getCampaign('cmp_new')).not.toBeNull();
  });
});

// ─── createCampaign ───────────────────────────────────────────────────────────

describe('CampaignService – createCampaign', () => {
  it('returns a new campaign with the given name and author', () => {
    const svc = makeService();
    const c = svc.createCampaign('  My Campaign  ', '  Alice  ');
    expect(c.name).toBe('My Campaign');
    expect(c.author).toBe('Alice');
  });

  it('assigns a unique ID', () => {
    const svc = makeService();
    const c1 = svc.createCampaign('A', '');
    const c2 = svc.createCampaign('B', '');
    expect(c1.id).not.toBe(c2.id);
  });

  it('sets lastUpdated on creation', () => {
    const before = Date.now();
    const svc = makeService();
    const c = svc.createCampaign('X', '');
    expect(c.lastUpdated).toBeDefined();
    expect(new Date(c.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('persists the new campaign to storage', () => {
    const svc = makeService();
    svc.createCampaign('Saved', '');
    const stored = loadImportedCampaigns();
    expect(stored.some((c) => c.name === 'Saved')).toBe(true);
  });
});

// ─── deleteCampaign ───────────────────────────────────────────────────────────

describe('CampaignService – deleteCampaign', () => {
  it('removes the campaign from the list', () => {
    const svc = makeService([emptyCampaign('cmp_del')]);
    svc.deleteCampaign('cmp_del');
    expect(svc.getCampaign('cmp_del')).toBeNull();
  });

  it('persists the deletion', () => {
    const svc = makeService([emptyCampaign('cmp_del')]);
    svc.deleteCampaign('cmp_del');
    expect(loadImportedCampaigns().some((c) => c.id === 'cmp_del')).toBe(false);
  });

  it('is a no-op for an unknown ID', () => {
    const svc = makeService([emptyCampaign()]);
    expect(() => svc.deleteCampaign('nonexistent')).not.toThrow();
    expect(svc.campaigns).toHaveLength(1);
  });
});

// ─── updateCampaignField ──────────────────────────────────────────────────────

describe('CampaignService – updateCampaignField', () => {
  it('updates name and persists', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'name', 'New Name');
    expect(campaign.name).toBe('New Name');
    expect(loadImportedCampaigns()[0].name).toBe('New Name');
  });

  it('updates author and persists', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'author', 'Bob');
    expect(campaign.author).toBe('Bob');
    expect(loadImportedCampaigns()[0].author).toBe('Bob');
  });

  it('sets official=true when passed true', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'official', true);
    expect(campaign.official).toBe(true);
  });

  it('removes official flag when passed false', () => {
    const campaign: CampaignDef = { ...emptyCampaign(), official: true };
    const svc = makeService([campaign]);
    svc.updateCampaignField(campaign, 'official', false);
    expect(campaign.official).toBeUndefined();
  });

  it('touches lastUpdated', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const campaign: CampaignDef = { ...emptyCampaign(), lastUpdated: old };
    const svc = makeService([campaign]);
    const before = Date.now();
    svc.updateCampaignField(campaign, 'name', 'Changed');
    expect(new Date(campaign.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── touch ────────────────────────────────────────────────────────────────────

describe('CampaignService – touch', () => {
  it('sets lastUpdated to the current time', () => {
    const campaign = emptyCampaign();
    const svc = new CampaignService([campaign]);
    const before = Date.now();
    svc.touch(campaign);
    expect(new Date(campaign.lastUpdated!).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── save ─────────────────────────────────────────────────────────────────────

describe('CampaignService – save', () => {
  it('writes the current list to storage', () => {
    const svc = new CampaignService([emptyCampaign('cmp_s1')]);
    svc.save();
    expect(loadImportedCampaigns()[0].id).toBe('cmp_s1');
  });
});

// ─── addChapter ───────────────────────────────────────────────────────────────

describe('CampaignService – addChapter', () => {
  it('appends a chapter to the campaign', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch = svc.addChapter(campaign, 'Act 1');
    expect(campaign.chapters).toHaveLength(1);
    expect(ch.name).toBe('Act 1');
  });

  it('assigns a monotonically increasing id', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch1 = svc.addChapter(campaign, 'A');
    const ch2 = svc.addChapter(campaign, 'B');
    expect(ch2.id).toBeGreaterThan(ch1.id);
  });

  it('trims whitespace from the name', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    const ch = svc.addChapter(campaign, '  Spaces  ');
    expect(ch.name).toBe('Spaces');
  });

  it('persists the change', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    svc.addChapter(campaign, 'Persisted Chapter');
    const stored = loadImportedCampaigns()[0];
    expect(stored.chapters[0].name).toBe('Persisted Chapter');
  });
});

// ─── deleteChapter ────────────────────────────────────────────────────────────

describe('CampaignService – deleteChapter', () => {
  it('removes the chapter at the given index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteChapter(campaign, 0);
    expect(campaign.chapters).toHaveLength(0);
  });

  it('persists the deletion', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteChapter(campaign, 0);
    expect(loadImportedCampaigns()[0].chapters).toHaveLength(0);
  });

  it('removes/remaps campaign.grid chapterIdx chamber references', () => {
    const chapterTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'chapter',
      chapterIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        makeChapterDef({ id: 1, name: 'A', levels: [] }),
        makeChapterDef({ id: 2, name: 'B', levels: [] }),
        makeChapterDef({ id: 3, name: 'C', levels: [] }),
      ],
      rows: 1,
      cols: 3,
      grid: [[chapterTile(0), chapterTile(1), chapterTile(2)]],
    };
    const svc = makeService([campaign]);
    svc.deleteChapter(campaign, 1);
    const grid = campaign.grid!;
    expect(grid[0][0]).not.toBeNull();
    expect(grid[0][1]).toBeNull();
    expect((grid[0][2] as TileDef).chapterIdx).toBe(1);
  });
});

// ─── renameChapter ────────────────────────────────────────────────────────────

describe('CampaignService – renameChapter', () => {
  it('renames the chapter', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.renameChapter(campaign, 0, 'Renamed');
    expect(campaign.chapters[0].name).toBe('Renamed');
  });

  it('is a no-op for invalid index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    expect(() => svc.renameChapter(campaign, 99, 'X')).not.toThrow();
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.renameChapter(campaign, 0, 'Stored Name');
    expect(loadImportedCampaigns()[0].chapters[0].name).toBe('Stored Name');
  });
});

// ─── reorderChapters ─────────────────────────────────────────────────────────

describe('CampaignService – reorderChapters', () => {
  it('moves a chapter from one position to another', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        { id: 1, name: 'A', levels: [] },
        { id: 2, name: 'B', levels: [] },
        { id: 3, name: 'C', levels: [] },
      ],
    };
    const svc = makeService([campaign]);
    svc.reorderChapters(campaign, 0, 2); // move A to position 2
    expect(campaign.chapters.map((c) => c.name)).toEqual(['B', 'C', 'A']);
  });

  it('is a no-op for out-of-range indices', () => {
    const campaign: CampaignDef = { ...emptyCampaign(), chapters: [{ id: 1, name: 'A', levels: [] }] };
    const svc = makeService([campaign]);
    expect(() => svc.reorderChapters(campaign, 0, 5)).not.toThrow();
    expect(campaign.chapters[0].name).toBe('A');
  });

  it('remaps campaign.grid chapterIdx references after reorder', () => {
    const chapterTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'chapter',
      chapterIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        makeChapterDef({ id: 1, name: 'A', levels: [] }),
        makeChapterDef({ id: 2, name: 'B', levels: [] }),
        makeChapterDef({ id: 3, name: 'C', levels: [] }),
      ],
      rows: 1,
      cols: 3,
      grid: [[chapterTile(0), chapterTile(1), chapterTile(2)]],
    };
    const svc = makeService([campaign]);
    svc.reorderChapters(campaign, 0, 2); // [B, C, A]
    const grid = campaign.grid!;
    expect((grid[0][0] as TileDef).chapterIdx).toBe(2);
    expect((grid[0][1] as TileDef).chapterIdx).toBe(0);
    expect((grid[0][2] as TileDef).chapterIdx).toBe(1);
  });
});

// ─── addLevel ─────────────────────────────────────────────────────────────────

describe('CampaignService – addLevel', () => {
  it('appends a level to the chapter', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'New Level');
    expect(campaign.chapters[0].levels).toHaveLength(2);
    expect(lv.name).toBe('New Level');
  });

  it('creates a 6×6 blank grid', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'Grid Test');
    expect(lv.rows).toBe(6);
    expect(lv.cols).toBe(6);
    expect(lv.grid).toHaveLength(6);
  });

  it('assigns a unique id', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const l1 = svc.addLevel(campaign, 0, 'A');
    const l2 = svc.addLevel(campaign, 0, 'B');
    expect(l1.id).not.toBe(l2.id);
  });

  it('inherits chapter style for new levels', () => {
    const campaign = campaignWithChapter();
    campaign.chapters[0].style = 'Winter';
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'Styled');
    expect(lv.style).toBe('Winter');
  });

  it('does not write a style field when chapter style is unset', () => {
    const campaign = campaignWithChapter();
    delete campaign.chapters[0].style;
    const svc = makeService([campaign]);
    const lv = svc.addLevel(campaign, 0, 'Unstyled');
    expect(Object.prototype.hasOwnProperty.call(lv, 'style')).toBe(false);
  });

  it('throws for an invalid chapter index', () => {
    const campaign = emptyCampaign();
    const svc = makeService([campaign]);
    expect(() => svc.addLevel(campaign, 0, 'X')).toThrow();
  });
});

// ─── deleteLevel ──────────────────────────────────────────────────────────────

describe('CampaignService – deleteLevel', () => {
  it('removes the level at the given index', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteLevel(campaign, 0, 0);
    expect(campaign.chapters[0].levels).toHaveLength(0);
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    svc.deleteLevel(campaign, 0, 0);
    expect(loadImportedCampaigns()[0].chapters[0].levels).toHaveLength(0);
  });

  it('removes/remaps chapter.grid levelIdx chamber references', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [makeChapterDef({
        id: 1,
        name: 'A',
        levels: [
          makeLevelDef({ id: 10, name: 'L1', rows: 1, cols: 1, grid: [[null]] }),
          makeLevelDef({ id: 11, name: 'L2', rows: 1, cols: 1, grid: [[null]] }),
          makeLevelDef({ id: 12, name: 'L3', rows: 1, cols: 1, grid: [[null]] }),
        ],
        grid: [[levelTile(0), levelTile(1), levelTile(2)]],
      })],
    };
    const svc = makeService([campaign]);
    svc.deleteLevel(campaign, 0, 1);
    const grid = campaign.chapters[0].grid!;
    expect(grid[0][0]).not.toBeNull();
    expect(grid[0][1]).toBeNull();
    expect((grid[0][2] as TileDef).levelIdx).toBe(1);
  });
});

// ─── duplicateLevel ───────────────────────────────────────────────────────────

describe('CampaignService – duplicateLevel', () => {
  it('inserts a copy after the original', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(campaign.chapters[0].levels).toHaveLength(2);
    expect(campaign.chapters[0].levels[1]).toBe(copy);
  });

  it('gives the copy a different ID', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const original = campaign.chapters[0].levels[0];
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(copy.id).not.toBe(original.id);
  });

  it('appends " (copy)" to the name', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const copy = svc.duplicateLevel(campaign, 0, 0);
    expect(copy.name).toBe('Level 1 (copy)');
  });

  it('remaps chapter.grid levelIdx refs at and after the inserted index', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      chamberContent: 'level',
      levelIdx: idx,
      chapterIdx: 0,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 10, name: 'L0', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 11, name: 'L1', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 12, name: 'L2', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        rows: 1,
        cols: 3,
        grid: [[levelTile(0), levelTile(1), levelTile(2)]],
      }],
    };
    const svc = makeService([campaign]);

    svc.duplicateLevel(campaign, 0, 0);

    const grid = campaign.chapters[0].grid!;
    expect((grid[0][0] as TileDef).levelIdx).toBe(0);
    expect((grid[0][1] as TileDef).levelIdx).toBe(2);
    expect((grid[0][2] as TileDef).levelIdx).toBe(3);
  });
});

// ─── moveLevel ────────────────────────────────────────────────────────────────

describe('CampaignService – moveLevel', () => {
  it('moves a level to another chapter', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        { id: 1, name: 'A', levels: [{ id: 10, name: 'Lv1', rows: 2, cols: 2, grid: [[null, null], [null, null]], inventory: [] }] },
        { id: 2, name: 'B', levels: [] },
      ],
    };
    const svc = makeService([campaign]);
    svc.moveLevel(campaign, 0, 0, 1, 0);
    expect(campaign.chapters[0].levels).toHaveLength(0);
    expect(campaign.chapters[1].levels).toHaveLength(1);
    expect(campaign.chapters[1].levels[0].name).toBe('Lv1');
  });

  it('is a no-op for invalid chapter indices', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    expect(() => svc.moveLevel(campaign, 0, 0, 99, 0)).not.toThrow();
  });

  it('removes/remaps source map refs and remaps destination refs on cross-chapter move', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [
        makeChapterDef({
          id: 1,
          name: 'A',
          levels: [
            makeLevelDef({ id: 10, name: 'L1', rows: 1, cols: 1, grid: [[null]] }),
            makeLevelDef({ id: 11, name: 'L2', rows: 1, cols: 1, grid: [[null]] }),
            makeLevelDef({ id: 12, name: 'L3', rows: 1, cols: 1, grid: [[null]] }),
          ],
          grid: [[levelTile(0), levelTile(1), levelTile(2)]],
        }),
        makeChapterDef({
          id: 2,
          name: 'B',
          levels: [
            makeLevelDef({ id: 20, name: 'M1', rows: 1, cols: 1, grid: [[null]] }),
            makeLevelDef({ id: 21, name: 'M2', rows: 1, cols: 1, grid: [[null]] }),
          ],
          grid: [[levelTile(0), levelTile(1)]],
        }),
      ],
    };
    const svc = makeService([campaign]);
    svc.moveLevel(campaign, 0, 1, 1, 1);
    const srcGrid = campaign.chapters[0].grid!;
    const dstGrid = campaign.chapters[1].grid!;
    expect(srcGrid[0][1]).toBeNull();
    expect((srcGrid[0][2] as TileDef).levelIdx).toBe(1);
    expect((dstGrid[0][0] as TileDef).levelIdx).toBe(0);
    expect((dstGrid[0][1] as TileDef).levelIdx).toBe(2);
  });
});

// ─── saveLevel ────────────────────────────────────────────────────────────────

describe('CampaignService – saveLevel', () => {
  it('replaces an existing level in-place', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const updated: LevelDef = {
      id: 101,
      name: 'Updated',
      rows: 3,
      cols: 3,
      grid: Array.from({ length: 3 }, () => Array(3).fill(null) as null[]),
      inventory: [],
    };
    svc.saveLevel(campaign, 0, 0, updated);
    expect(campaign.chapters[0].levels[0].name).toBe('Updated');
  });

  it('touches the campaign timestamp', () => {
    const old = '2020-01-01T00:00:00.000Z';
    const campaign = { ...campaignWithChapter(), lastUpdated: old };
    const svc = makeService([campaign]);
    const before = Date.now();
    svc.saveLevel(campaign, 0, 0, campaign.chapters[0].levels[0]);
    expect(new Date(campaign.lastUpdated).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('persists the change', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const updated: LevelDef = { ...campaign.chapters[0].levels[0], name: 'Persisted' };
    svc.saveLevel(campaign, 0, 0, updated);
    expect(loadImportedCampaigns()[0].chapters[0].levels[0].name).toBe('Persisted');
  });
});

// ─── reorderLevels ───────────────────────────────────────────────────────────

describe('CampaignService – reorderLevels', () => {
  it('moves a level within the chapter', () => {
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 3, name: 'C', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 2); // move A to position 2
    expect(campaign.chapters[0].levels.map((l) => l.name)).toEqual(['B', 'C', 'A']);
  });

  it('updates chapter.grid levelIdx references on adjacent swap (move down)', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[levelTile(0), levelTile(1)]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 1); // swap A↔B
    const grid = campaign.chapters[0].grid!;
    expect((grid[0][0] as TileDef).levelIdx).toBe(1); // was 0 (A), now points to B's new position
    expect((grid[0][1] as TileDef).levelIdx).toBe(0); // was 1 (B), now points to A's new position
  });

  it('updates chapter.grid levelIdx references on non-adjacent move', () => {
    const levelTile = (idx: number): TileDef => ({
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'level',
      levelIdx: idx,
    });
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 3, name: 'C', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[levelTile(0), levelTile(1), levelTile(2)]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 2); // move A (idx 0) to position 2 → [B, C, A]
    const grid = campaign.chapters[0].grid!;
    expect((grid[0][0] as TileDef).levelIdx).toBe(2); // was 0 (A), now at position 2
    expect((grid[0][1] as TileDef).levelIdx).toBe(0); // was 1 (B), shifted left to 0
    expect((grid[0][2] as TileDef).levelIdx).toBe(1); // was 2 (C), shifted left to 1
  });

  it('does not touch levelIdx on tiles without chamberContent=level', () => {
    const otherTile: TileDef = {
      shape: PipeShape.Chamber,
      rotation: 0,
      chamberContent: 'tank',
    };
    const campaign: CampaignDef = {
      ...emptyCampaign(),
      chapters: [{
        id: 1,
        name: 'Ch',
        levels: [
          { id: 1, name: 'A', rows: 1, cols: 1, grid: [[null]], inventory: [] },
          { id: 2, name: 'B', rows: 1, cols: 1, grid: [[null]], inventory: [] },
        ],
        grid: [[otherTile]],
      }],
    };
    const svc = makeService([campaign]);
    svc.reorderLevels(campaign, 0, 0, 1);
    expect((campaign.chapters[0].grid![0][0] as TileDef).levelIdx).toBeUndefined();
  });
});

// ─── exportToJson ─────────────────────────────────────────────────────────────

describe('CampaignService – exportToJson', () => {
  it('returns valid JSON that round-trips the campaign', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    const parsed = JSON.parse(json) as CampaignDef;
    expect(parsed.id).toBe(campaign.id);
    expect(parsed.chapters[0].levels[0].name).toBe('Level 1');
  });

  it('strips unrecognized fields from the output', () => {
    const campaign = campaignWithChapter();
    // Inject an unknown field
    (campaign as unknown as Record<string, unknown>)['unknownField'] = 'surprise';
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    expect(json).not.toContain('unknownField');
  });

  it('includes the pipes-campaign type identifier in the exported JSON', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['type']).toBe('pipes-campaign');
  });

  it('places the type identifier before other campaign fields', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const json = svc.exportToJson(campaign);
    const typeIdx = json.indexOf('"type"');
    const idIdx   = json.indexOf('"id"');
    expect(typeIdx).toBeGreaterThanOrEqual(0);
    expect(typeIdx).toBeLessThan(idIdx);
  });
});

// ─── parseImport ─────────────────────────────────────────────────────────────

describe('CampaignService – parseImport', () => {
  it('returns conflict=none for a brand-new campaign', () => {
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(emptyCampaign('cmp_brand_new')));
    expect(result.conflict).toBe('none');
    expect(result.campaign.id).toBe('cmp_brand_new');
  });

  it('returns conflict=same_version when timestamps match', () => {
    const ts = '2024-06-01T12:00:00.000Z';
    const existing: CampaignDef = { ...emptyCampaign('cmp_sv'), lastUpdated: ts };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing }));
    expect(result.conflict).toBe('same_version');
    expect(result.existing).toBeDefined();
  });

  it('returns conflict=version_conflict with isNewer=true when import is newer', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_vc'), lastUpdated: '2024-01-01T00:00:00.000Z' };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing, lastUpdated: '2024-06-01T00:00:00.000Z' }));
    expect(result.conflict).toBe('version_conflict');
    expect(result.isNewer).toBe(true);
  });

  it('returns conflict=version_conflict with isNewer=false when import is older', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_old'), lastUpdated: '2024-06-01T00:00:00.000Z' };
    const svc = makeService([existing]);
    const result = svc.parseImport(JSON.stringify({ ...existing, lastUpdated: '2024-01-01T00:00:00.000Z' }));
    expect(result.conflict).toBe('version_conflict');
    expect(result.isNewer).toBe(false);
  });

  it('throws for invalid JSON', () => {
    const svc = makeService();
    expect(() => svc.parseImport('not-json')).toThrow();
  });

  it('throws for a campaign with missing required fields', () => {
    const svc = makeService();
    expect(() => svc.parseImport(JSON.stringify({ id: 'x', name: 'X' }))).toThrow();
  });

  it('throws for invalid campaign shape before migration runs', () => {
    const svc = makeService();
    expect(() => svc.parseImport(JSON.stringify({ id: 'x', name: 'X', chapters: {} }))).toThrow(/invalid campaign file format/i);
  });

  it('strips the official flag on import', () => {
    const campaign: CampaignDef = { ...emptyCampaign('cmp_official_strip'), official: true };
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(campaign));
    expect(result.campaign.official).toBeUndefined();
  });

  it('reassigns the ID when the imported campaign uses "official"', () => {
    const campaign: CampaignDef = { ...emptyCampaign('official') };
    const svc = makeService();
    const result = svc.parseImport(JSON.stringify(campaign));
    expect(result.campaign.id).not.toBe('official');
  });

  // ── Type identifier enforcement ───────────────────────────────────────────

  it('accepts a campaign file that has the pipes-campaign type identifier', () => {
    const campaign = emptyCampaign('cmp_typed');
    const json = JSON.stringify({ type: 'pipes-campaign', ...campaign });
    const svc = makeService();
    const result = svc.parseImport(json);
    expect(result.campaign.id).toBe('cmp_typed');
  });

  it('accepts a campaign file with no type field (legacy format)', () => {
    const campaign = emptyCampaign('cmp_legacy');
    const json = JSON.stringify(campaign);  // no type field
    const svc = makeService();
    const result = svc.parseImport(json);
    expect(result.campaign.id).toBe('cmp_legacy');
  });

  it('throws with a type-mismatch message when a player-profile file is imported as campaign', () => {
    const json = JSON.stringify({ type: 'pipes-player-profile', version: 1, payload: {}, checksum: '0' });
    const svc = makeService();
    expect(() => svc.parseImport(json)).toThrow(/player profile/i);
  });

  it('throws with a descriptive message when an unknown type is used', () => {
    const json = JSON.stringify({ type: 'unknown-type', id: 'x', name: 'X', author: 'A', chapters: [] });
    const svc = makeService();
    expect(() => svc.parseImport(json)).toThrow(/wrong file type/i);
  });
});

// ─── acceptImport ─────────────────────────────────────────────────────────────

describe('CampaignService – acceptImport', () => {
  it('adds a new campaign when conflict=none', () => {
    const svc = makeService();
    const result: ImportResult = { campaign: emptyCampaign('cmp_new'), conflict: 'none' };
    svc.acceptImport(result);
    expect(svc.getCampaign('cmp_new')).not.toBeNull();
  });

  it('replaces an existing campaign when conflict=version_conflict', () => {
    const existing: CampaignDef = { ...emptyCampaign('cmp_replace'), chapters: [{ id: 1, name: 'Old', levels: [] }] };
    const svc = makeService([existing]);
    const incoming: CampaignDef = { ...emptyCampaign('cmp_replace'), chapters: [{ id: 1, name: 'New', levels: [] }] };
    const result: ImportResult = { campaign: incoming, conflict: 'version_conflict', existing, isNewer: true };
    svc.acceptImport(result);
    expect(svc.campaigns).toHaveLength(1);
    expect(svc.getCampaign('cmp_replace')!.chapters[0].name).toBe('New');
  });

  it('persists after accept', () => {
    const svc = makeService();
    const result: ImportResult = { campaign: emptyCampaign('cmp_persist'), conflict: 'none' };
    svc.acceptImport(result);
    expect(loadImportedCampaigns().some((c) => c.id === 'cmp_persist')).toBe(true);
  });
});

// ─── scanData ─────────────────────────────────────────────────────────────────

describe('CampaignService – scanData', () => {
  it('detects unrecognized campaign-level fields', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('Campaign')?.has('badField')).toBe(true);
  });

  it('removes unrecognized fields when dryRun=false', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    svc.scanData(campaign, false);
    expect((campaign as unknown as Record<string, unknown>)['badField']).toBeUndefined();
  });

  it('does not modify data when dryRun=true', () => {
    const campaign = emptyCampaign();
    (campaign as unknown as Record<string, unknown>)['badField'] = 1;
    const svc = new CampaignService([campaign]);
    svc.scanData(campaign, true);
    expect((campaign as unknown as Record<string, unknown>)['badField']).toBe(1);
  });

  it('detects unrecognized tile fields on level grid tiles', () => {
    const campaign = campaignWithChapter();
    const tile = { shape: PipeShape.Straight, unknownTileField: 'oops' };
    campaign.chapters[0].levels[0].grid[0][0] = tile as unknown as TileDef;
    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('Tile')?.has('unknownTileField')).toBe(true);
  });

  it('does not flag Level.style as unrecognized', () => {
    const campaign = campaignWithChapter();
    campaign.chapters[0].levels[0].style = 'Dark';
    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('Level')?.has('style') ?? false).toBe(false);
  });

  it('migrates legacy Grass style values to Summer when dryRun=false', () => {
    const campaign = campaignWithChapter();
    const chapter = campaign.chapters[0];
    const level = chapter.levels[0];
    (campaign as unknown as Record<string, unknown>)['style'] = 'Grass';
    (chapter as unknown as Record<string, unknown>)['style'] = 'Grass';
    (level as unknown as Record<string, unknown>)['style'] = 'Grass';
    const svc = new CampaignService([campaign]);

    const dryRunIssues = svc.scanData(campaign, true);
    expect(dryRunIssues.get('Campaign')?.has('style:Grass→Summer')).toBe(true);
    expect(dryRunIssues.get('Chapter')?.has('style:Grass→Summer')).toBe(true);
    expect(dryRunIssues.get('Level')?.has('style:Grass→Summer')).toBe(true);

    svc.scanData(campaign, false);
    expect(campaign.style).toBe('Summer');
    expect(chapter.style).toBe('Summer');
    expect(level.style).toBe('Summer');
  });

  it('does not flag campaign map Source.capacity or map pipe rotation as unrecognized', () => {
    const campaign = campaignWithChapter();
    campaign.rows = 1;
    campaign.cols = 2;
    campaign.grid = [[
      { shape: PipeShape.Source, capacity: 10 },
      { shape: PipeShape.Cross, rotation: 90 },
    ]];

    const svc = new CampaignService([campaign]);
    const issues = svc.scanData(campaign, true);
    expect(issues.get('CampaignMapTile')?.has('capacity') ?? false).toBe(false);
    expect(issues.get('CampaignMapTile')?.has('rotation') ?? false).toBe(false);
  });

  it('flags and strips chapter map Source.capacity (unused field)', () => {
    const campaign = campaignWithChapter();
    campaign.chapters[0].rows = 1;
    campaign.chapters[0].cols = 2;
    campaign.chapters[0].grid = [[
      { shape: PipeShape.Source, capacity: 10 },
      { shape: PipeShape.Cross, rotation: 180 },
    ]];

    const svc = new CampaignService([campaign]);

    // dry-run: capacity should be detected as an unrecognized field
    const issues = svc.scanData(campaign, true);
    expect(issues.get('ChapterMapTile')?.has('capacity') ?? false).toBe(true);
    // rotation is still valid (compat with saved editor output)
    expect(issues.get('ChapterMapTile')?.has('rotation') ?? false).toBe(false);

    // non-dry-run: capacity should be stripped from the tile
    svc.scanData(campaign, false);
    expect((campaign.chapters[0].grid[0][0] as unknown as Record<string, unknown>)['capacity']).toBeUndefined();
  });
});

// ─── guid handling ──────────────────────────────────────────────────────────

describe('CampaignService – guid handling', () => {
  it('createCampaign assigns a guid', () => {
    const svc = makeService();
    const campaign = svc.createCampaign('New Campaign', 'Author');
    expect(campaign.guid).toEqual(expect.any(String));
    expect(campaign.guid).not.toBe('');
  });

  it('getCampaignByGuid finds a campaign by its guid', () => {
    const campaign = { ...emptyCampaign('cmp_guid'), guid: 'guid-123' };
    const svc = makeService([campaign]);
    expect(svc.getCampaignByGuid('guid-123')?.id).toBe('cmp_guid');
  });

  it('getCampaignByGuid returns null when no campaign matches', () => {
    const svc = makeService([emptyCampaign()]);
    expect(svc.getCampaignByGuid('does-not-exist')).toBeNull();
  });

  it('exportToJson backfills and persists a guid for a campaign that lacks one', () => {
    const campaign = emptyCampaign('cmp_no_guid');
    expect(campaign.guid).toBeUndefined();
    const svc = makeService([campaign]);
    svc.exportToJson(campaign);
    expect(campaign.guid).toEqual(expect.any(String));
    // Persisted, not just set on the in-memory object.
    const reloaded = loadImportedCampaigns();
    expect(reloaded[0].guid).toBe(campaign.guid);
  });

  it('exportToJson does not change an existing guid', () => {
    const campaign = { ...emptyCampaign('cmp_has_guid'), guid: 'existing-guid' };
    const svc = makeService([campaign]);
    svc.exportToJson(campaign);
    expect(campaign.guid).toBe('existing-guid');
  });
});

// ─── Text-pack export/import ────────────────────────────────────────────────

describe('CampaignService – exportTextPack', () => {
  it('backfills a guid and includes it in the pack', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const json = svc.exportTextPack(campaign, 'es');
    const pack = JSON.parse(json) as Record<string, unknown>;
    expect(pack['type']).toBe('pipes-campaign-text-pack');
    expect(pack['campaignGuid']).toBe(campaign.guid);
    expect(pack['locale']).toBe('es');
  });

  it('resolves each field via the standard fallback chain for the target locale', () => {
    const campaign = makeCampaignDef({
      id: 'cmp_fallback',
      name: 'English Only',
      chapters: [makeChapterDef({
        id: 1,
        name: { en: 'Chapter EN', es: 'Chapter ES' },
        levels: [makeLevelDef({ id: 101, name: 'Level EN' })],
      })],
    });
    const svc = makeService([campaign]);
    const pack = JSON.parse(svc.exportTextPack(campaign, 'es')) as {
      campaign: { name: string };
      chapters: { name: string; levels: { name: string }[] }[];
    };
    // No Spanish campaign name -> falls back to the only (bare-string) value.
    expect(pack.campaign.name).toBe('English Only');
    // Explicit Spanish chapter name wins.
    expect(pack.chapters[0].name).toBe('Chapter ES');
    // No Spanish level name -> falls back to the bare-string English name.
    expect(pack.chapters[0].levels[0].name).toBe('Level EN');
  });

  it('omits note/hints for a level that has neither', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = JSON.parse(svc.exportTextPack(campaign, 'es')) as {
      chapters: { levels: Record<string, unknown>[] }[];
    };
    expect(pack.chapters[0].levels[0]['note']).toBeUndefined();
    expect(pack.chapters[0].levels[0]['hints']).toBeUndefined();
  });

  it('includes note/hints when present, resolved per-hint', () => {
    const campaign = makeCampaignDef({
      id: 'cmp_hints',
      chapters: [makeChapterDef({
        id: 1,
        levels: [makeLevelDef({
          id: 101,
          note: 'A note',
          hints: ['Hint one', { en: 'Hint two EN', es: 'Hint two ES' }],
        })],
      })],
    });
    const svc = makeService([campaign]);
    const pack = JSON.parse(svc.exportTextPack(campaign, 'es')) as {
      chapters: { levels: { note?: string; hints?: string[] }[] }[];
    };
    expect(pack.chapters[0].levels[0].note).toBe('A note');
    expect(pack.chapters[0].levels[0].hints).toEqual(['Hint one', 'Hint two ES']);
  });
});

describe('CampaignService – parseTextPack', () => {
  it('parses a well-formed text pack', () => {
    const svc = makeService();
    const pack = svc.parseTextPack(JSON.stringify({
      type: 'pipes-campaign-text-pack',
      campaignGuid: 'g-1',
      locale: 'es',
      campaign: { name: 'Nombre' },
      chapters: [],
    }));
    expect(pack.campaignGuid).toBe('g-1');
    expect(pack.locale).toBe('es');
  });

  it('throws for the wrong type identifier', () => {
    const svc = makeService();
    expect(() => svc.parseTextPack(JSON.stringify({ type: 'pipes-campaign', campaignGuid: 'g', locale: 'es', campaign: { name: 'X' }, chapters: [] }))).toThrow();
  });

  it('throws for missing required fields', () => {
    const svc = makeService();
    expect(() => svc.parseTextPack(JSON.stringify({ type: 'pipes-campaign-text-pack' }))).toThrow();
  });

  it('throws for invalid JSON', () => {
    const svc = makeService();
    expect(() => svc.parseTextPack('not-json')).toThrow();
  });
});

describe('CampaignService – mergeTextPack', () => {
  function exportAndParsePack(svc: CampaignService, campaign: CampaignDef, locale: string) {
    return svc.parseTextPack(svc.exportTextPack(campaign, locale));
  }

  it('throws when no local campaign matches the pack guid', () => {
    const svc = makeService([campaignWithChapter()]);
    const pack = svc.parseTextPack(JSON.stringify({
      type: 'pipes-campaign-text-pack', campaignGuid: 'no-such-guid', locale: 'es', campaign: { name: 'X' }, chapters: [],
    }));
    expect(() => svc.mergeTextPack(pack)).toThrow();
  });

  it('adds text for a locale not already present, without touching other locales', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    // Hand-edit the pack as a translator would.
    pack.campaign.name = 'Campaña (ES)';
    pack.chapters[0].name = 'Capítulo (ES)';
    pack.chapters[0].levels[0].name = 'Nivel (ES)';

    const result = svc.mergeTextPack(pack);
    expect(result.added).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.overwritten).toBe(0);
    expect(campaign.name).toEqual({ en: 'Campaign', es: 'Campaña (ES)' });
    expect(campaign.chapters[0].name).toEqual({ en: 'Chapter 1', es: 'Capítulo (ES)' });
    expect(campaign.chapters[0].levels[0].name).toEqual({ en: 'Level 1', es: 'Nivel (ES)' });
  });

  it('does not overwrite existing text for that locale by default, even if the pack value changed', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    pack.campaign.name = 'Campaña (ES) v1';

    // First merge: campaign name, chapter name, and level name all get 'es' added.
    const firstResult = svc.mergeTextPack(pack);
    expect(firstResult.added).toBe(3);
    expect(firstResult.skipped).toBe(0);

    // Second merge with a changed campaign-name value: everything is already
    // present for 'es', so nothing is added and the earlier value is kept.
    pack.campaign.name = 'Campaña (ES) v2';
    const secondResult = svc.mergeTextPack(pack);
    expect(secondResult.added).toBe(0);
    expect(secondResult.skipped).toBe(3);
    expect(campaign.name).toEqual({ en: 'Campaign', es: 'Campaña (ES) v1' });
  });

  it('overwrites existing text for that locale when overwrite: true is passed', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    pack.campaign.name = 'Campaña (ES) v1';
    svc.mergeTextPack(pack);

    pack.campaign.name = 'Campaña (ES) v2';
    const result = svc.mergeTextPack(pack, { overwrite: true });
    // All 3 fields (campaign/chapter/level name) already had 'es' text from
    // the first merge, so with overwrite:true all 3 get replaced.
    expect(result.overwritten).toBe(3);
    expect(result.added).toBe(0);
    expect(campaign.name).toEqual({ en: 'Campaign', es: 'Campaña (ES) v2' });
  });

  it('skips (and counts) chapters/levels in the pack that no longer exist locally', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    // Simulate a stale pack referencing a deleted chapter.
    pack.chapters.push({ id: 999, name: 'Ghost Chapter', levels: [] });

    const result = svc.mergeTextPack(pack);
    expect(result.unmatchedNodes).toBe(1);
  });

  it('merges hints by index, bounded by the shorter of pack/local hint arrays', () => {
    const campaign = makeCampaignDef({
      id: 'cmp_hint_merge',
      chapters: [makeChapterDef({
        id: 1,
        levels: [makeLevelDef({ id: 101, hints: ['Hint A', 'Hint B'] })],
      })],
    });
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    // Pack has 3 hints (stale — local level was trimmed to 2 since export).
    pack.chapters[0].levels[0].hints = ['Hint A (ES)', 'Hint B (ES)', 'Hint C (ES)'];

    const result = svc.mergeTextPack(pack);
    // 3 name fields (campaign/chapter/level) + 2 bounded hints = 5; the pack's
    // 3rd hint is never consulted since the local level only has 2.
    expect(result.added).toBe(5);
    expect(campaign.chapters[0].levels[0].hints).toEqual([
      { en: 'Hint A', es: 'Hint A (ES)' },
      { en: 'Hint B', es: 'Hint B (ES)' },
    ]);
  });

  it('persists the merge via save()', () => {
    const campaign = campaignWithChapter();
    const svc = makeService([campaign]);
    const pack = exportAndParsePack(svc, campaign, 'es');
    pack.campaign.name = 'Campaña (ES)';
    svc.mergeTextPack(pack);

    const reloaded = loadImportedCampaigns();
    expect(reloaded[0].name).toEqual({ en: 'Campaign', es: 'Campaña (ES)' });
  });
});
