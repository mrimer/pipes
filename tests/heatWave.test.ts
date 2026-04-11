/** Tests for the heatWave visual-effect utilities. */

import { HeatWave, HEAT_WAVE_DURATION_MS, HEAT_WAVE_INTERVAL_MS, tickHeatWaves, renderHeatWaves } from '../src/visuals/heatWave';
import { PipeShape } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A minimal Board-shaped stub for testing. */
interface StubBoard {
  rows: number;
  cols: number;
  grid: Array<Array<{ shape: PipeShape; chamberContent: string | null }>>;
}

function makeBoard(rows: number, cols: number): StubBoard {
  return {
    rows,
    cols,
    grid: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ shape: PipeShape.Empty, chamberContent: null })),
    ),
  };
}

function setHotPlate(board: StubBoard, r: number, c: number): void {
  board.grid[r][c] = { shape: PipeShape.Chamber, chamberContent: 'hot_plate' };
}

/** Build a fake CanvasRenderingContext2D that records method calls. */
function makeFakeCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  const ctx = {
    calls,
    save:            () => { calls.push('save'); },
    restore:         () => { calls.push('restore'); },
    beginPath:       () => { calls.push('beginPath'); },
    moveTo:          () => { calls.push('moveTo'); },
    lineTo:          () => { calls.push('lineTo'); },
    stroke:          () => { calls.push('stroke'); },
    rect:            () => { calls.push('rect'); },
    clip:            () => { calls.push('clip'); },
    strokeStyle:     '',
    lineWidth:       0,
    lineCap:         '',
    globalAlpha:     1,
    fillStyle:       '',
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
    fillRect: () => { calls.push('fillRect'); },
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

// ─── tickHeatWaves ────────────────────────────────────────────────────────────

describe('tickHeatWaves', () => {
  it('does nothing when there are no hot_plate tiles', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();
    tickHeatWaves(waves, times, board, new Set(), performance.now());
    expect(waves.length).toBe(0);
  });

  it('spawns a wave for an unconnected hot_plate tile after the interval elapses', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    setHotPlate(board as unknown as StubBoard, 0, 0);
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();

    // Simulate the first tick: initialises the timer with a stagger offset.
    const t0 = performance.now();
    tickHeatWaves(waves, times, board, new Set(), t0);

    // Fast-forward time past the full interval to force a spawn.
    const future = t0 + HEAT_WAVE_INTERVAL_MS + 1;
    tickHeatWaves(waves, times, board, new Set(), future);

    expect(waves.length).toBeGreaterThanOrEqual(1);
    expect(waves[0]).toMatchObject({ row: 0, col: 0 });
  });

  it('does NOT spawn a wave for a connected (water-filled) hot_plate tile', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    setHotPlate(board as unknown as StubBoard, 0, 0);
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();

    // Mark the tile as filled (connected).
    const filled = new Set(['0,0']);
    const future = performance.now() + HEAT_WAVE_INTERVAL_MS + 1;
    tickHeatWaves(waves, times, board, filled, future);

    expect(waves.length).toBe(0);
  });

  it('resets the spawn timer when a tile becomes connected, so it fires fresh once dry again', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    setHotPlate(board as unknown as StubBoard, 1, 1);
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();

    const t0 = performance.now();
    // First dry tick – initialises the stagger timer.
    tickHeatWaves(waves, times, board, new Set(), t0);
    expect(times.has('1,1')).toBe(true);

    // Tile becomes connected – timer should be removed.
    tickHeatWaves(waves, times, board, new Set(['1,1']), t0 + 100);
    expect(times.has('1,1')).toBe(false);

    // Tile is dry again – timer is re-initialised on next dry tick.
    tickHeatWaves(waves, times, board, new Set(), t0 + 200);
    expect(times.has('1,1')).toBe(true);
  });

  it('does not spawn more than one wave per tile per interval', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    setHotPlate(board as unknown as StubBoard, 0, 1);
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();

    // Force the timer directly to guarantee a spawn on the next tick.
    times.set('0,1', performance.now() - HEAT_WAVE_INTERVAL_MS - 1);

    const t = performance.now();
    // First call spawns one wave.
    tickHeatWaves(waves, times, board, new Set(), t);
    expect(waves.length).toBe(1);

    // Rapid follow-up calls within the same interval window must not spawn again.
    tickHeatWaves(waves, times, board, new Set(), t + 1);
    tickHeatWaves(waves, times, board, new Set(), t + 2);
    expect(waves.length).toBe(1);
  });

  it('staggered tiles each get their own timer', () => {
    const board = makeBoard(2, 2) as unknown as Parameters<typeof tickHeatWaves>[2];
    setHotPlate(board as unknown as StubBoard, 0, 0);
    setHotPlate(board as unknown as StubBoard, 1, 0);
    const waves: HeatWave[] = [];
    const times = new Map<string, number>();

    const t0 = performance.now();
    tickHeatWaves(waves, times, board, new Set(), t0);
    // Both tiles should have independent timer entries.
    expect(times.has('0,0')).toBe(true);
    expect(times.has('1,0')).toBe(true);
    expect(times.get('0,0')).not.toBe(times.get('1,0'));
  });
});

// ─── renderHeatWaves ──────────────────────────────────────────────────────────

describe('renderHeatWaves', () => {
  it('removes expired waves without drawing', () => {
    const ctx = makeFakeCtx();
    const wave: HeatWave = {
      row: 0,
      col: 0,
      startTime: performance.now() - HEAT_WAVE_DURATION_MS - 1,
    };
    const waves: HeatWave[] = [wave];
    renderHeatWaves(ctx, waves, performance.now());
    expect(waves.length).toBe(0);
    expect(ctx.calls).not.toContain('stroke');
  });

  it('draws a live wave with save/restore guards', () => {
    const ctx = makeFakeCtx();
    const wave: HeatWave = {
      row: 0,
      col: 0,
      startTime: performance.now(),
    };
    const waves: HeatWave[] = [wave];
    // Use a time well into the animation (50 % progress) to ensure lines are visible.
    renderHeatWaves(ctx, waves, wave.startTime + HEAT_WAVE_DURATION_MS * 0.5);
    expect(waves.length).toBe(1);
    expect(ctx.calls).toContain('save');
    expect(ctx.calls).toContain('restore');
  });

  it('keeps an active wave in the array', () => {
    const ctx = makeFakeCtx();
    const wave: HeatWave = {
      row: 1,
      col: 2,
      startTime: performance.now(),
    };
    const waves: HeatWave[] = [wave];
    renderHeatWaves(ctx, waves, wave.startTime + 100);
    expect(waves.length).toBe(1);
  });

  it('handles an empty wave array without errors', () => {
    const ctx = makeFakeCtx();
    expect(() => renderHeatWaves(ctx, [], performance.now())).not.toThrow();
    expect(ctx.calls.length).toBe(0);
  });

  it('removes all waves once they expire', () => {
    const ctx = makeFakeCtx();
    const now = performance.now();
    const waves: HeatWave[] = [
      { row: 0, col: 0, startTime: now - HEAT_WAVE_DURATION_MS - 5 },
      { row: 1, col: 1, startTime: now - HEAT_WAVE_DURATION_MS - 5 },
    ];
    renderHeatWaves(ctx, waves, now);
    expect(waves.length).toBe(0);
  });
});
