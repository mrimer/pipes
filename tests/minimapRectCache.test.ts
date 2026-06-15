/**
 * @jest-environment jsdom
 */

/**
 * Regression test for the computeMinimapRect cache (src/visuals/chapterMap.ts).
 *
 * The cache key includes TILE_SIZE, so a cached entry can never be returned for
 * a different tile size even if invalidateMinimapRectCache() is not called.
 */

import { computeMinimapRect, invalidateMinimapRectCache } from '../src/visuals/chapterMap';
import { setTileSize } from '../src/renderer';
import type { LevelDef } from '../src/types';
import { PipeShape } from '../src/types';

function makeLevel(): LevelDef {
  return {
    id: 1,
    name: 'T',
    rows: 3,
    cols: 3,
    grid: [[{ shape: PipeShape.Source, rotation: 0 }]],
    inventory: [],
  } as unknown as LevelDef;
}

afterEach(() => {
  invalidateMinimapRectCache();
  setTileSize(64);
});

describe('computeMinimapRect cache', () => {
  it('returns a different rect after a TILE_SIZE change without an explicit cache invalidation', () => {
    const level = makeLevel();

    setTileSize(64);
    const small = computeMinimapRect(0, 0, level); // populates the cache at size 64

    // Change the tile size but deliberately skip invalidateMinimapRectCache().
    setTileSize(128);
    const large = computeMinimapRect(0, 0, level);

    // A stale (size-64) entry would make these identical; the tile-size-keyed
    // cache must recompute instead.
    expect(large).not.toEqual(small);
    expect(large.width).toBeGreaterThan(small.width);
  });

  it('returns the same cached object for identical inputs at the same tile size', () => {
    const level = makeLevel();
    setTileSize(64);
    const a = computeMinimapRect(10, 20, level);
    const b = computeMinimapRect(10, 20, level);
    expect(b).toBe(a); // memoized reference
  });
});
