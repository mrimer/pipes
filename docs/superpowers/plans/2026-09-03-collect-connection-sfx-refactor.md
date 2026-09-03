# game.ts _collectConnectionSfx Complexity Refactor (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `Game._collectConnectionSfx`'s cyclomatic complexity from 46 (the single worst function in the entire codebase, per CodeScene) down to a set of small, independently-readable helpers, each under CodeScene's cc<9 threshold, with zero behavior change — and, since this function currently has **no test coverage at all** (confirmed: no test in `tests/game.test.ts` asserts on any `SfxId` this function selects), add real regression coverage for it first so the refactor has an actual safety net instead of relying on manual visual/reasoning verification.

**Architecture:** Two tasks. Task 1 adds characterization tests — tests that pin the function's *current* observed behavior (this is legacy code with no spec; a characterization test captures "what it does today," which is exactly the safety net an Extract-Method refactor needs). Task 2 performs the extraction: split the one 104-line, 12-branch dispatch-and-accumulate function into a small orchestrator plus 11 tiny single-purpose private helpers (one "immediate sfx" dispatcher, one "accumulate cold/hot tracker" dispatcher, 5 per-content-type tracker accumulators, and 4 per-category threshold-to-SfxId mappers).

**Tech Stack:** TypeScript, Jest (`npm test`), ESLint (`npm run lint`).

**Spec:** CodeScene on-prem hotspot analysis, project `pipes` (id 1), analysis run 2026-09-03 (post Phase 2a merge). `Game._collectConnectionSfx` (`src/game.ts:1579-1682` at plan-writing time): cc=46, 11 bumps — the worst Complex Method and worst Bumpy Road finding in the project. No separate design spec exists for this function's behavior beyond its own source code and the (currently absent) tests; Task 1's characterization tests **become** the closest thing to a spec this function has, and are the binding authority for Task 2's "no behavior change" requirement.

## Global Constraints

- **No functionality change.** Task 2 must produce byte-identical `SfxId[]` output for every input `(board, filledBefore)` pair. This is enforced entirely by Task 1's characterization tests plus the full existing Jest suite staying green — there is no manual/visual verification step for this plan, because this function has zero rendering/visual component (it's pure enum-selection logic over a `Board`).
- **Characterization tests, not specification tests.** Every expected value in Task 1 was hand-derived from reading the current implementation (see "Derivation notes" per test group below) and is believed correct, but the implementer's job is to confirm each assertion **actually passes against the unmodified code on HEAD** before treating it as ground truth. If any assertion fails against the current (pre-Task-2) code, the current code's actual observed output is correct by definition — replace the plan's stated expected value with the actually-observed one, note the discrepancy in the task report, and proceed. Do not "fix" `_collectConnectionSfx` itself in Task 1 to match a wrong expectation; Task 1 touches only `tests/game.test.ts`.
- **Extraction is pure Extract Method.** No control-flow branch may change its condition, its order relative to other branches touching the *same* accumulator/output, or its threshold comparison operator (`<` stays `<`, never becomes `<=`). Branch **reordering across mutually-exclusive `chamberContent` string checks** is safe and expected (see Task 2's design note) since each tile has exactly one `chamberContent` value.
- Preserve existing code style: 2-space indent, JSDoc comments on every new private helper describing what it does (this file's existing private-method convention — see e.g. `_playGoldSfxIfNeeded`'s docblock immediately below `_collectConnectionSfx` in the current file for the house style).
- Every new helper's own argument count must itself stay at or under 4 (per this project's now-established options-object convention from the prior excess-arguments refactor) — bundle related values into one options object rather than adding a 5th+ positional parameter.
- Run `npm test`, `npx tsc --noEmit`, and `npm run lint` after every task, before committing. All three must pass with zero new failures/warnings.

---

## Task 1: Add characterization tests for `Game._collectConnectionSfx`

**Files:**
- Modify: `tests/game.test.ts` (append a new `describe('Game._collectConnectionSfx', ...)` block; add one shared board-builder helper)

**Interfaces:**
- Consumes: `Game._collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[]` — private, accessed via the established test pattern `(game as unknown as { _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] })._collectConnectionSfx(board, filledBefore)` (see e.g. `tests/game.test.ts:1002` for the same cast-to-access-private pattern already used in this file).
- Produces: a `makeChamberConnectionBoard(chamberTiles: Tile[]): Board` test helper that later tests in this describe block (and Task 2's re-verification) all share.

Every test uses a fresh `Game` from `makeGame()` purely to get a `Game` instance to call the private method on — the `board` argument passed to `_collectConnectionSfx` is always a freshly-constructed standalone `Board`, unrelated to `game`'s own board. `filledBefore` is always `new Set<string>()` (nothing filled at the start of the turn), so every currently-connected position on the constructed board counts as "newly connected this turn."

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all 1794 tests pass (record the pass count to compare after this task's additions — expect 1794 + the number of new tests added).

- [ ] **Step 2: Add the shared board-builder helper**

Add near the top of the file, alongside the other test helpers (e.g. immediately after the existing `makeGame` helper, or in the `// ─── Helpers ─────` section):

```ts
/**
 * Build a 1-row board: Source(0,0, temp=0, pressure=1) → chamberTiles... → Sink.
 * All tiles are fixed and mutually connected, so every chamber is filled
 * (flood-filled from source) with nothing pre-existing in `filledBefore` —
 * used to exercise Game._collectConnectionSfx in isolation for one turn.
 */
function makeChamberConnectionBoard(chamberTiles: Tile[]): Board {
  const cols = chamberTiles.length + 2;
  const board = new Board(1, cols);
  board.source = { row: 0, col: 0 };
  board.sink = { row: 0, col: cols - 1 };
  // Source: temperature=0, pressure=1 (explicit, so tests don't depend on the
  // Tile constructor's own defaults for the environment baseline).
  board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 0, 1);
  chamberTiles.forEach((tile, i) => { board.grid[0][i + 1] = tile; });
  board.grid[0][cols - 1] = new Tile(PipeShape.Sink, 0, true);
  board.sourceCapacity = 100;
  return board;
}

/** Call the private Game._collectConnectionSfx for a test. */
function collectConnectionSfx(game: Game, board: Board): SfxId[] {
  return (game as unknown as { _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] })
    ._collectConnectionSfx(board, new Set<string>());
}
```

Confirm `Board`, `Tile`, `PipeShape`, `SfxId`, and `Game` are already imported at the top of `tests/game.test.ts` (they are, per existing usage elsewhere in the file) — no new imports needed.

- [ ] **Step 3: Add the immediate-sfx test group**

Add a new describe block (place it near the end of the file, or wherever this file's convention groups related describes — check the last few `describe` blocks for placement style):

```ts
describe('Game._collectConnectionSfx', () => {
  it('plays Tank for a newly-connected tank chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Tank]);
  });

  it('plays NegativeCount for a newly-connected item chamber with itemCount <= 0', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 0, null, 'item'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.NegativeCount]);
  });

  it('plays nothing for a newly-connected item chamber with a positive itemCount', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, PipeShape.Elbow, 2, null, 'item'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([]);
  });

  it('plays Cooler for a newly-connected heater chamber with negative temperature', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', -1),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Cooler]);
  });

  it('plays Heater for a newly-connected heater chamber with non-negative temperature', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'heater', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Heater]);
  });

  it('plays Vacuum for a newly-connected pump chamber with negative pressure', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, -1),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Vacuum]);
  });

  it('plays Pump for a newly-connected pump chamber with non-negative pressure', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'pump', 0, 2),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Pump]);
  });

  it('plays Star for a newly-connected star chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'star'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Star]);
  });

  it('plays Gel for a newly-connected gel chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'gel'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Gel]);
  });

  it('plays Siphon for a newly-connected siphon chamber', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'siphon'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Siphon]);
  });

  it('plays Sizzle for a newly-connected hot_plate chamber with no locked frozen gain', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'hot_plate'),
    ]);
    // Fresh board: getLockedHotPlateGain returns null (never evaluated) → frozenGain 0 → Sizzle.
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sizzle]);
  });
});
```

**Derivation notes for this group:** each case matches exactly one `chamberContent` branch of the current function's dispatch chain (`src/game.ts:1599-1638`); the expected `SfxId` is read directly off that branch's `sfxToPlay.push(...)` call. The "positive itemCount" case expects `[]` because the current code's `item` branch only pushes when `itemCount <= 0` — no `else` push exists.

- [ ] **Step 4: Add the ice/snow/dirt/sandstone threshold test group**

Add to the same `describe('Game._collectConnectionSfx', ...)` block from Step 3:

```ts
  it('plays Ice0 for a connected ice chamber at zero raw cost', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 0),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice0]);
  });

  it('plays Ice1 for a connected ice chamber below the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice1]);
  });

  it('plays Ice2 for a connected ice chamber at exactly the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice2]);
  });

  it('plays Ice3 for a connected ice chamber at exactly the high threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'ice', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice3]);
  });

  it('plays Snow0 for a connected snow chamber at zero raw cost', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 0),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow0]);
  });

  it('plays Snow1 for a connected snow chamber below the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 3),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow1]);
  });

  it('plays Snow2 for a connected snow chamber at exactly the mid threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'snow', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow2]);
  });

  it('plays Snow3 for a connected snow chamber at exactly the high threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 2, null, 1, null, 'snow', 5),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Snow3]);
  });

  it('plays Dirt1 for a connected dirt chamber below the mid cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt1]);
  });

  it('plays Dirt2 for a connected dirt chamber between the mid and high cost thresholds', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 7, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt2]);
  });

  it('plays Dirt3 for a connected dirt chamber at or above the high cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 12, null, 1, null, 'dirt'),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Dirt3]);
  });

  it('plays Sandstone1 for a connected non-shattering sandstone chamber below the mid cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone1]);
  });

  it('plays Sandstone2 for a connected non-shattering sandstone chamber between the mid and high cost thresholds', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 7, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone2]);
  });

  it('plays Sandstone3 for a connected non-shattering sandstone chamber at or above the high cost threshold', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 12, null, 1, null, 'sandstone', 0, 0, 5, 10),
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Sandstone3]);
  });

  it('plays SandstoneShatter for a connected sandstone chamber whose pressure meets its shatter threshold', () => {
    const { game } = makeGame();
    // Source pressure=5 (set via board.grid[0][0] below, overriding makeChamberConnectionBoard's
    // default pressure=1) so the environment pressure (5) meets this tile's shatter threshold (3).
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'sandstone', 0, 0, 2, 3),
    ]);
    board.grid[0][0] = new Tile(PipeShape.Source, 0, true, 0, 0, null, 1, null, null, 0, 5);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.SandstoneShatter]);
  });
```

**Derivation notes for this group:** ice raw cost = `tile.cost * max(0, tile.temperature - currentTemp)`; with `currentTemp = 0` (Source temperature default from `makeChamberConnectionBoard`), raw cost = `cost * temperature`. Snow raw cost = `snowCostPerDeltaTemp(cost, currentPressure) * deltaTemp`; with `currentPressure = 1` (Source pressure from the helper), `snowCostPerDeltaTemp(cost, 1) = ceil(cost/1) = cost`, so raw cost = `cost * temperature`, identical formula to ice at pressure=1 — the two categories only diverge at pressure≠1, not exercised here (not part of this function's own branching, so out of scope for a `_collectConnectionSfx` characterization test). Thresholds are all `MID=5, HIGH=10` (`src/game.ts:96-110`); the `<` comparison means a value of exactly 5 lands in the "mid-to-high" tier (Ice2/Snow2), not the "low" tier — the Ice2/Snow2 test cases above deliberately hit that boundary. Sandstone tier comparison uses `tile.cost` directly (not a temperature-derived raw value); `shatterOverride = shatter > hardness && pressure >= shatter` (`sandstoneCostFactors`, `src/systems/thermoSimulator.ts:48`) — the shatter test's `pressure=5, shatter=3, hardness=2` satisfies both (`3 > 2` and `5 >= 3`).

- [ ] **Step 5: Add the max-tracking and mixed-category test group**

Add to the same describe block:

```ts
  it('plays only the sfx for the highest-cost of two simultaneously-connected ice chambers', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 2),  // raw = 2 → would be Ice1 alone
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 6),  // raw = 6 → Ice2, and the higher of the two
    ]);
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Ice2]);
  });

  it('plays an immediate sfx before accumulator-category sfx, combining sfx from different categories connected the same turn', () => {
    const { game } = makeGame();
    const board = makeChamberConnectionBoard([
      new Tile(PipeShape.Chamber, 0, true, 0, 0, null, 1, null, 'tank'),
      new Tile(PipeShape.Chamber, 0, true, 0, 1, null, 1, null, 'ice', 3),   // raw 3 → Ice1
      new Tile(PipeShape.Chamber, 0, true, 0, 3, null, 1, null, 'dirt'),     // cost 3 → Dirt1
    ]);
    // Immediate-type sfx (tank) is pushed while scanning tiles; accumulator-type sfx
    // (ice, dirt) is only pushed once after the scan completes, in a fixed
    // hot_plate → ice → snow → dirt → sandstone order — so Tank is always first here
    // regardless of the tiles' left-to-right board order.
    expect(collectConnectionSfx(game, board)).toEqual([SfxId.Tank, SfxId.Ice1, SfxId.Dirt1]);
  });
```

**Derivation notes:** the max-tracking test confirms the function emits exactly one sfx per accumulator category per turn (the highest-cost/raw tile wins), not one per matching tile. The mixed-category test confirms the two-phase structure (immediate pushes happen inline during the scan; accumulator pushes happen in one fixed order after the scan) — this ordering guarantee is exactly what Task 2's extraction must preserve.

- [ ] **Step 6: Run the new tests against the CURRENT (pre-Task-2) code**

Run: `npx jest tests/game.test.ts -t "_collectConnectionSfx"`
Expected: all new tests pass against the unmodified `src/game.ts`. If any fails, per the Global Constraints note above: trust the actual observed output, correct that one test's expected value to match it, re-run, and note the correction in your report — do not modify `src/game.ts` in this task.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: 1794 + (number of new tests added in Steps 3-5) tests passed, zero failures.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors.

- [ ] **Step 9: Commit**

```bash
git add tests/game.test.ts
git commit -m "test(game): add characterization tests for _collectConnectionSfx

Game._collectConnectionSfx (cc=46, the worst-complexity function in the
codebase per CodeScene) had zero test coverage of its SfxId selection
logic before this commit — no test asserted on any SfxId this function
returns. Adds a shared makeChamberConnectionBoard test helper and 21
characterization tests covering every chamberContent branch (tank, item,
heater, pump, star, gel, siphon, hot_plate, and the ice/snow/dirt/
sandstone threshold tiers including boundary values), plus max-tracking
and mixed-category ordering behavior. These pin the function's current
observed behavior as a safety net for the following task's Extract
Method refactor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Task 2: Extract `Game._collectConnectionSfx` into named helpers

**Files:**
- Modify: `src/game.ts:1579-1682` (`_collectConnectionSfx`)

**Interfaces:**
- Consumes: Task 1's characterization tests (`tests/game.test.ts`) as the regression safety net — must stay green with zero edits to their assertions.
- Produces: one new interface `ConnectionSfxTrackers` and 11 new private methods, all placed immediately above the rewritten `_collectConnectionSfx`:
  - `_immediateChamberSfx(tile: Tile): SfxId | null`
  - `_accumulateColdChamberTrackers(opts: { board: Board; tile: Tile; row: number; col: number; currentTemp: number; currentPressure: number; trackers: ConnectionSfxTrackers }): void`
  - `_accumulateHotPlateTracker(board: Board, tile: Tile, row: number, col: number, trackers: ConnectionSfxTrackers): void`
  - `_accumulateIceTracker(tile: Tile, currentTemp: number, trackers: ConnectionSfxTrackers): void`
  - `_accumulateSnowTracker(tile: Tile, currentTemp: number, currentPressure: number, trackers: ConnectionSfxTrackers): void`
  - `_accumulateDirtTracker(tile: Tile, trackers: ConnectionSfxTrackers): void`
  - `_accumulateSandstoneTracker(tile: Tile, currentPressure: number, trackers: ConnectionSfxTrackers): void`
  - `_iceSfxForRaw(raw: number): SfxId`
  - `_snowSfxForRaw(raw: number): SfxId`
  - `_dirtSfxForCost(cost: number): SfxId`
  - `_sandstoneSfxFor(info: { cost: number; shattered: boolean }): SfxId`

**Design note — why branch reordering across `chamberContent` checks is safe:** the original `if (tile.chamberContent === 'tank') ... else if (tile.chamberContent === 'item') ... else if ...` chain tests a single tile's single `chamberContent` field against 12 mutually-exclusive string literals. A tile has exactly one `chamberContent` value, so at most one branch can ever match regardless of the order the branches are written in or evaluated in. Splitting the 12-way chain into two smaller dispatchers (7-way "immediate" and 5-way "accumulate") and reordering within each therefore cannot change which branch fires for any given tile — this is what makes the split behavior-preserving without needing to preserve the original chain's literal branch order.

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all tests pass (the count recorded at the end of Task 1, including the new characterization tests).

- [ ] **Step 2: Add `ConnectionSfxTrackers` and the four threshold-mapper helpers**

Add immediately above the `/** * Play all SFX for a tile-placement action. ... */` JSDoc block that precedes `_playAfterTilePlacedSfx` (i.e., immediately above where `_collectConnectionSfx` currently starts, `src/game.ts:1579`):

```ts
/** Running per-category accumulators for {@link Game._collectConnectionSfx}. */
interface ConnectionSfxTrackers {
  hotPlateSfx: SfxId | null;
  maxIceRaw: number;
  maxSnowRaw: number;
  maxDirtCost: number;
  maxSandstoneInfo: { cost: number; shattered: boolean } | null;
}
```

Then, as private methods on `Game` (placed together, in this order, immediately above `_collectConnectionSfx`):

```ts
  /**
   * Map a connected ice chamber's highest raw cost this turn to its sfx tier.
   */
  private _iceSfxForRaw(raw: number): SfxId {
    if (raw === 0) return SfxId.Ice0;
    if (raw < ICE_SFX_THRESHOLD_MID) return SfxId.Ice1;
    if (raw < ICE_SFX_THRESHOLD_HIGH) return SfxId.Ice2;
    return SfxId.Ice3;
  }

  /**
   * Map a connected snow chamber's highest raw cost this turn to its sfx tier.
   */
  private _snowSfxForRaw(raw: number): SfxId {
    if (raw === 0) return SfxId.Snow0;
    if (raw < SNOW_SFX_THRESHOLD_MID) return SfxId.Snow1;
    if (raw < SNOW_SFX_THRESHOLD_HIGH) return SfxId.Snow2;
    return SfxId.Snow3;
  }

  /**
   * Map a connected dirt chamber's highest cost this turn to its sfx tier.
   */
  private _dirtSfxForCost(cost: number): SfxId {
    if (cost < DIRT_SFX_THRESHOLD_MID) return SfxId.Dirt1;
    if (cost < DIRT_SFX_THRESHOLD_HIGH) return SfxId.Dirt2;
    return SfxId.Dirt3;
  }

  /**
   * Map a connected sandstone chamber's highest-cost tile info this turn to its sfx tier.
   * SandstoneShatter plays when the highest-cost tile was shattered (pressure ≥ shatter),
   * overriding the cost-tier mapping.
   */
  private _sandstoneSfxFor(info: { cost: number; shattered: boolean }): SfxId {
    if (info.shattered) return SfxId.SandstoneShatter;
    if (info.cost < SANDSTONE_SFX_THRESHOLD_MID) return SfxId.Sandstone1;
    if (info.cost < SANDSTONE_SFX_THRESHOLD_HIGH) return SfxId.Sandstone2;
    return SfxId.Sandstone3;
  }
```

- [ ] **Step 3: Add the five per-content-type tracker accumulators**

Add immediately below the four helpers from Step 2, still above `_collectConnectionSfx`:

```ts
  /**
   * Track at most one hot-plate sfx per turn. Sizzle overrides SizzleIce when
   * both a frozen and a non-frozen hot-plate tile connect the same turn.
   */
  private _accumulateHotPlateTracker(board: Board, tile: Tile, row: number, col: number, trackers: ConnectionSfxTrackers): void {
    // Use getLockedHotPlateGain to check if frozen water was actually consumed
    // when this hot plate's cost was computed during applyTurnDelta this turn.
    const frozenGain = board.getLockedHotPlateGain({ row, col }) ?? 0;
    const candidate = frozenGain > 0 ? SfxId.SizzleIce : SfxId.Sizzle;
    if (candidate === SfxId.Sizzle || trackers.hotPlateSfx === null) trackers.hotPlateSfx = candidate;
  }

  /**
   * Track the highest raw cost among ice chambers connected this turn.
   */
  private _accumulateIceTracker(tile: Tile, currentTemp: number, trackers: ConnectionSfxTrackers): void {
    const rawIceCost = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
    if (rawIceCost > trackers.maxIceRaw) trackers.maxIceRaw = rawIceCost;
  }

  /**
   * Track the highest raw cost among snow chambers connected this turn.
   * Snow cost is pressure-adjusted (unlike ice): snowCostPerDeltaTemp factors in
   * the current pressure, which reduces the effective cost per deltaTemp unit.
   */
  private _accumulateSnowTracker(tile: Tile, currentTemp: number, currentPressure: number, trackers: ConnectionSfxTrackers): void {
    const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
    const rawSnowCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
    if (rawSnowCost > trackers.maxSnowRaw) trackers.maxSnowRaw = rawSnowCost;
  }

  /**
   * Track the highest cost among dirt chambers connected this turn.
   */
  private _accumulateDirtTracker(tile: Tile, trackers: ConnectionSfxTrackers): void {
    if (tile.cost > trackers.maxDirtCost) trackers.maxDirtCost = tile.cost;
  }

  /**
   * Track the sandstone tile with the highest base cost connected this turn,
   * and whether it shattered.
   */
  private _accumulateSandstoneTracker(tile: Tile, currentPressure: number, trackers: ConnectionSfxTrackers): void {
    const { shatterOverride } = sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
    if (trackers.maxSandstoneInfo === null || tile.cost > trackers.maxSandstoneInfo.cost) {
      trackers.maxSandstoneInfo = { cost: tile.cost, shattered: shatterOverride };
    }
  }
```

- [ ] **Step 4: Add the two dispatcher helpers**

Add immediately below the five accumulators from Step 3, still above `_collectConnectionSfx`:

```ts
  /**
   * Return the sfx to play immediately for a chamber content type that plays
   * at most once per tile per turn (as opposed to the cold/hot-plate content
   * types, which track a running max/priority across all tiles connected
   * this turn — see {@link _accumulateColdChamberTrackers}). Returns null for
   * a content type not handled here (including a not-yet-fully-formed item
   * chamber, and every cold/hot-plate content type).
   */
  private _immediateChamberSfx(tile: Tile): SfxId | null {
    if (tile.chamberContent === 'tank') return SfxId.Tank;
    if (tile.chamberContent === 'item' && tile.itemShape !== null) {
      return tile.itemCount <= 0 ? SfxId.NegativeCount : null;
    }
    if (tile.chamberContent === 'heater') return tile.temperature < 0 ? SfxId.Cooler : SfxId.Heater;
    if (tile.chamberContent === 'pump') return tile.pressure < 0 ? SfxId.Vacuum : SfxId.Pump;
    if (tile.chamberContent === 'star') return SfxId.Star;
    if (tile.chamberContent === 'gel') return SfxId.Gel;
    if (tile.chamberContent === 'siphon') return SfxId.Siphon;
    return null;
  }

  /**
   * Dispatch a chamber tile to the tracker accumulator for its content type
   * (hot_plate, ice, snow, dirt, sandstone). No-op for any other content type.
   */
  private _accumulateColdChamberTrackers(opts: {
    board: Board; tile: Tile; row: number; col: number;
    currentTemp: number; currentPressure: number; trackers: ConnectionSfxTrackers;
  }): void {
    const { board, tile, row, col, currentTemp, currentPressure, trackers } = opts;
    if (tile.chamberContent === 'hot_plate') this._accumulateHotPlateTracker(board, tile, row, col, trackers);
    else if (tile.chamberContent === 'ice') this._accumulateIceTracker(tile, currentTemp, trackers);
    else if (tile.chamberContent === 'snow') this._accumulateSnowTracker(tile, currentTemp, currentPressure, trackers);
    else if (tile.chamberContent === 'dirt') this._accumulateDirtTracker(tile, trackers);
    else if (tile.chamberContent === 'sandstone') this._accumulateSandstoneTracker(tile, currentPressure, trackers);
  }
```

- [ ] **Step 5: Rewrite `_collectConnectionSfx` as the orchestrator**

Replace (currently lines 1579-1682, the entire function body):

```ts
  private _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] {
    const filledAfter = board.getFilledPositions();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    let maxIceRaw = -1;
    let maxSnowRaw = -1;
    let maxDirtCost = -1;
    let hotPlateSfx: SfxId | null = null;
    // Track highest-cost sandstone tile connected this turn, and whether it shattered.
    let maxSandstoneInfo: { cost: number; shattered: boolean } | null = null;

    const sfxToPlay: SfxId[] = [];

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (tile?.shape !== PipeShape.Chamber) continue;

      if (tile.chamberContent === 'tank') {
        sfxToPlay.push(SfxId.Tank);
      } else if (tile.chamberContent === 'item' && tile.itemShape !== null) {
        if (tile.itemCount <= 0) sfxToPlay.push(SfxId.NegativeCount);
      } else if (tile.chamberContent === 'heater') {
        sfxToPlay.push(tile.temperature < 0 ? SfxId.Cooler : SfxId.Heater);
      } else if (tile.chamberContent === 'pump') {
        sfxToPlay.push(tile.pressure < 0 ? SfxId.Vacuum : SfxId.Pump);
      } else if (tile.chamberContent === 'hot_plate') {
        // Sizzle overrides SizzleIce; collect at most one hot-plate sound per turn.
        // Use getLockedHotPlateGain to check if frozen water was actually consumed
        // when this hot plate's cost was computed during applyTurnDelta this turn.
        const frozenGain = board.getLockedHotPlateGain({ row: r, col: c }) ?? 0;
        const candidate = frozenGain > 0 ? SfxId.SizzleIce : SfxId.Sizzle;
        if (candidate === SfxId.Sizzle || hotPlateSfx === null) hotPlateSfx = candidate;
      } else if (tile.chamberContent === 'star') {
        sfxToPlay.push(SfxId.Star);
      } else if (tile.chamberContent === 'gel') {
        sfxToPlay.push(SfxId.Gel);
      } else if (tile.chamberContent === 'siphon') {
        sfxToPlay.push(SfxId.Siphon);
      } else if (tile.chamberContent === 'ice') {
        const rawIceCost = tile.cost * computeDeltaTemp(tile.temperature, currentTemp);
        if (rawIceCost > maxIceRaw) maxIceRaw = rawIceCost;
      } else if (tile.chamberContent === 'snow') {
        // Snow cost is pressure-adjusted (unlike ice): snowCostPerDeltaTemp factors in
        // the current pressure, which reduces the effective cost per deltaTemp unit.
        const deltaTemp = computeDeltaTemp(tile.temperature, currentTemp);
        const rawSnowCost = snowCostPerDeltaTemp(tile.cost, currentPressure) * deltaTemp;
        if (rawSnowCost > maxSnowRaw) maxSnowRaw = rawSnowCost;
      } else if (tile.chamberContent === 'dirt') {
        if (tile.cost > maxDirtCost) maxDirtCost = tile.cost;
      } else if (tile.chamberContent === 'sandstone') {
        // Track the sandstone tile with the highest base cost connected this turn.
        // When the highest-cost tile shatters, play SandstoneShatter; otherwise Sandstone1/2/3.
        const { shatterOverride } = sandstoneCostFactors(tile.cost, tile.hardness, tile.shatter, currentPressure);
        if (maxSandstoneInfo === null || tile.cost > maxSandstoneInfo.cost) {
          maxSandstoneInfo = { cost: tile.cost, shattered: shatterOverride };
        }
      }
    }

    // Collect a single hot-plate sfx per turn (Sizzle overrides SizzleIce).
    if (hotPlateSfx !== null) sfxToPlay.push(hotPlateSfx);

    // Collect a single ice sfx based on the highest-cost ice tile connected this turn.
    if (maxIceRaw >= 0) {
      if (maxIceRaw === 0) sfxToPlay.push(SfxId.Ice0);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Ice1);
      else if (maxIceRaw < ICE_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Ice2);
      else sfxToPlay.push(SfxId.Ice3);
    }

    // Collect a single snow sfx based on the highest-cost snow tile connected this turn.
    if (maxSnowRaw >= 0) {
      if (maxSnowRaw === 0) sfxToPlay.push(SfxId.Snow0);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Snow1);
      else if (maxSnowRaw < SNOW_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Snow2);
      else sfxToPlay.push(SfxId.Snow3);
    }

    // Collect a single dirt sfx based on the highest-cost dirt tile connected this turn.
    if (maxDirtCost >= 0) {
      if (maxDirtCost < DIRT_SFX_THRESHOLD_MID) sfxToPlay.push(SfxId.Dirt1);
      else if (maxDirtCost < DIRT_SFX_THRESHOLD_HIGH) sfxToPlay.push(SfxId.Dirt2);
      else sfxToPlay.push(SfxId.Dirt3);
    }

    // Collect a single sandstone sfx based on the highest-cost sandstone tile connected.
    // SandstoneShatter plays when the highest-cost tile was shattered (pressure ≥ shatter).
    if (maxSandstoneInfo !== null) {
      if (maxSandstoneInfo.shattered) {
        sfxToPlay.push(SfxId.SandstoneShatter);
      } else if (maxSandstoneInfo.cost < SANDSTONE_SFX_THRESHOLD_MID) {
        sfxToPlay.push(SfxId.Sandstone1);
      } else if (maxSandstoneInfo.cost < SANDSTONE_SFX_THRESHOLD_HIGH) {
        sfxToPlay.push(SfxId.Sandstone2);
      } else {
        sfxToPlay.push(SfxId.Sandstone3);
      }
    }

    return sfxToPlay;
  }
```

with:

```ts
  private _collectConnectionSfx(board: Board, filledBefore: Set<string>): SfxId[] {
    const filledAfter = board.getFilledPositions();
    const currentTemp = board.getCurrentTemperature(filledAfter);
    const currentPressure = board.getCurrentPressure(filledAfter);

    const trackers: ConnectionSfxTrackers = {
      hotPlateSfx: null, maxIceRaw: -1, maxSnowRaw: -1, maxDirtCost: -1, maxSandstoneInfo: null,
    };
    const sfxToPlay: SfxId[] = [];

    for (const key of filledAfter) {
      if (filledBefore.has(key)) continue;
      const [r, c] = parseKey(key);
      const tile = board.grid[r]?.[c];
      if (tile?.shape !== PipeShape.Chamber) continue;

      const immediate = this._immediateChamberSfx(tile);
      if (immediate !== null) { sfxToPlay.push(immediate); continue; }

      this._accumulateColdChamberTrackers({ board, tile, row: r, col: c, currentTemp, currentPressure, trackers });
    }

    // Collect at most one sfx per accumulator category, in this fixed order,
    // after every newly-connected tile this turn has been scanned.
    if (trackers.hotPlateSfx !== null) sfxToPlay.push(trackers.hotPlateSfx);
    if (trackers.maxIceRaw >= 0) sfxToPlay.push(this._iceSfxForRaw(trackers.maxIceRaw));
    if (trackers.maxSnowRaw >= 0) sfxToPlay.push(this._snowSfxForRaw(trackers.maxSnowRaw));
    if (trackers.maxDirtCost >= 0) sfxToPlay.push(this._dirtSfxForCost(trackers.maxDirtCost));
    if (trackers.maxSandstoneInfo !== null) sfxToPlay.push(this._sandstoneSfxFor(trackers.maxSandstoneInfo));

    return sfxToPlay;
  }
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: identical pass count to Step 1, zero failures. Task 1's characterization tests are the primary signal here — if any of them fail, the extraction changed behavior; do not adjust the test's expected value to make it pass (that would defeat the safety net) — find and fix the transcription error in the new helpers instead.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors.

- [ ] **Step 8: Commit**

```bash
git add src/game.ts
git commit -m "refactor(game): extract Game._collectConnectionSfx into named helpers

Resolves CodeScene's worst Complex Method finding in the codebase
(cc=46, 11 bumps). Splits the single 104-line dispatch-and-accumulate
function into: _immediateChamberSfx (7-way single-tile dispatch for
content types that push at most once per tile), _accumulateColdChamberTrackers
(5-way dispatch to per-content-type tracker accumulators for content types
that track a running max/priority across all tiles connected this turn),
and 4 threshold-to-SfxId mapper functions (ice/snow/dirt/sandstone). Each
new helper stays under CodeScene's cc<9 threshold. No behavior change —
verified by 21 characterization tests added in the prior commit (this
function had zero test coverage before this pair of commits) plus the
full existing suite, both green with unchanged assertions.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Verification: re-run CodeScene analysis

After both tasks are committed:

- [ ] **Step 1: Trigger a fresh CodeScene analysis**

In the CodeScene on-prem UI (`http://localhost:3003/projects/1`), click **Analyze Now** (or push to the branch CodeScene's project tracks).

- [ ] **Step 2: Compare scores**

Use `mcp__codescene__code_health_review` on `src/game.ts`, or `mcp__codescene__list_technical_debt_hotspots_for_project` (project_id 1), and confirm:
- `Game._collectConnectionSfx` no longer appears in the Complex Method or Bumpy Road findings (or, if CodeScene still flags the *orchestrator* at a much lower cc, confirm none of the 11 new helpers individually exceed cc=9).
- `src/game.ts`'s overall Code Health score has increased from the 3.60 baseline recorded at the start of this plan.

`game.ts` will not reach green (9.0+) from this task alone — `Game.constructor` (cc=40), `Game.startLevel` (cc=26), `Game._showWin` (cc=26), and the rest of the Phase 2 backlog remain out of scope here; see the remaining items in `docs/superpowers/plans/2026-09-02-red-file-code-health-refactor.md`'s Phase 2 section for the next slice.
