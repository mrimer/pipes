# Excess-Arguments Refactor (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate CodeScene's "Excess Number of Function Arguments" findings across `src/game.ts` and `src/renderer.ts` by converting every flagged function's positional parameters into a single trailing options object, with zero behavior change. This also proportionally reduces the "Primitive Obsession" finding on both files (a high fraction of function arguments are primitive types today).

**Architecture:** Pure Parameter Object refactor — same pattern as Phase 1 Task 4's `GameDomRefs` (`Game` constructor). No new features, no changed call semantics, no changed rendering output, no changed control flow. Every function keeps its exact current behavior; only how its inputs are packaged changes. Tasks are ordered so that a function's callers are only touched once, even when multiple tasks edit lines inside the same caller body (see Task Ordering Rationale below).

**Tech Stack:** TypeScript, Jest (`npm test`), ESLint (`npm run lint`), webpack. Visual verification via the `run-pipes` skill (builds and drives the web build) for the renderer.ts tasks.

**Spec:** CodeScene on-prem hotspot analysis, project `pipes` (id 1). Findings sourced from `mcp__codescene__code_health_review` on `src/game.ts` and `src/renderer.ts`, and from the Phase 2 backlog recorded in `docs/superpowers/plans/2026-09-02-red-file-code-health-refactor.md` (the Phase 1 plan for these same two files). Function signatures, line numbers, and call sites verified directly against the repo at plan-writing time (2026-09-02, HEAD after Phase 1 merge).

## Global Constraints

- **No functionality change.** Every task must produce byte-identical runtime behavior — same function called with the same effective values in the same order, same defaults applied in the same cases. Enforced by keeping the existing Jest suite green with unchanged assertions (no test may be edited to make a task pass).
- **Naming/shape convention for every new options type** (mirrors Phase 1 Task 4's `GameDomRefs`):
  - A drawing/render function that takes `ctx: CanvasRenderingContext2D` (and, for `renderBoard` only, also `canvas: HTMLCanvasElement`) keeps those as leading positional parameters — this repo's universal convention for canvas functions. **Every other parameter** collapses into one final `opts` parameter typed as a new interface.
  - Exported functions get an **exported** options interface (`export interface FooOptions { ... }`) named `<FunctionName-without-leading-underscore>Options`, declared immediately above the function. Module-private (`_`-prefixed, non-exported) functions get a module-private (non-exported) options interface named the same way, still declared immediately above the function.
  - A parameter that had a default value (`= false`, `= 0`, `= 1`, `= new Set()`, `= Date.now()`, etc.) becomes an **optional** field (`?`) on the options interface, with the same default applied in the destructuring inside the function body (`const { shiftHeld = false, ... } = opts;`) — not in the interface itself. A parameter that had a `?` but no default stays optional with no default. A parameter that was required stays required.
  - Field order inside each interface follows the original parameter order, for easy side-by-side diffing against this plan's "before" signature.
- **renderer.ts drawing functions have no Jest coverage of their pixel output** (jsdom's `HTMLCanvasElement.getContext` returns `null` in this project's test env, confirmed again for this plan — no `jest-canvas-mock` or similar dependency exists). For every renderer.ts task, verification is: (a) Jest suite stays green (this catches call-site/compile mistakes, since `npx tsc --noEmit` and the test run both fail on a TS error), (b) a manual visual check via the `run-pipes` skill comparing before/after screenshots of the specific tile types and interactions each task's functions render.
- Preserve existing code style: 2-space indent, JSDoc comments on exported/private helpers following the existing convention already on each function (keep the existing JSDoc, just delete any `@param` lines for parameters that no longer exist as standalone params — see each task for the exact JSDoc edit).
- Run `npm test`, `npx tsc --noEmit`, and `npm run lint` after every task, before committing. All three must pass with zero new failures/warnings.
- **Out of scope for this plan:** inventing a *shared* render-context type spanning multiple functions (e.g. one `RenderContext` object threaded through `renderBoard` and all its pass functions). Each function in this plan gets its **own** bespoke options interface, even where two functions' parameter lists overlap heavily (e.g. `_renderPass2NonPipeTiles` / `_renderPass3PipeTiles` share 7 of 9/12 params; `renderContainerFillAnims` / `renderContainerDrainAnims` are identical but for the anim-array element type). A shared cross-function context is a larger architectural change with more behavior-change surface (easy to accidentally thread a stale value through a second call site) and is deferred to a future Phase 2b plan if desired.

## Task Ordering Rationale

`drawTile` is called from inside `renderContainerFillAnims`, `renderContainerDrainAnims`, `_renderPass2NonPipeTiles`, `_renderPass3PipeTiles`, and (via `_drawPreviewTile`) `_renderHoverPreview`. `_drawPipeArmInRotatedFrame` and `drawSourceOrSink` are both called from inside `drawTile` itself. Task 2 (below) changes `drawTile`'s own signature and therefore must touch all 7 of `drawTile`'s call sites as plain call-syntax edits — this happens regardless of task order, since making the caller files compile requires it. Doing `drawTile`/`_drawPipeArmInRotatedFrame`/`drawSourceOrSink` **first** (Task 2) means Tasks 3 and 4 inherit already-correct `drawTile` call syntax inside the functions they touch, and only need to change what belongs to their own task (their own function's signature and its own external call sites). Task 1 (game.ts) touches neither file Tasks 2-4 touch and can run first or in parallel; it's sequenced first as a low-risk warm-up, consistent with Phase 1's task ordering.

---

## Task 1: game.ts — Parameter-object pass for `_playAfterTilePlacedSfx` and `afterTilePlaced`

Resolves 2 of game.ts's Excess Function Arguments findings. `afterTilePlaced` is declared on the `InputCallbacks` interface (`src/inputHandler.ts`) that `Game` implements — its interface declaration must change in lockstep or `class Game implements InputCallbacks` fails to typecheck. No canvas rendering involved; both functions are exercised indirectly by `tests/game.test.ts`'s tile-placement flow tests, so this task's regression coverage is real (not visual-check-only).

**Files:**
- Modify: `src/game.ts:1697-1720` (`_playAfterTilePlacedSfx`), `src/game.ts:1890-1944` (`afterTilePlaced`), `src/game.ts:1987` (call site)
- Modify: `src/inputHandler.ts:41-48` (`InputCallbacks.afterTilePlaced` interface declaration)

**Interfaces:**
- Produces: module-private `PlayAfterTilePlacedSfxOptions` (declared in game.ts, above `_playAfterTilePlacedSfx`) and exported `AfterTilePlacedOptions` (declared in game.ts, above `afterTilePlaced`, and imported by `inputHandler.ts` for the interface declaration).

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all tests pass (record the pass count to compare after the change — 1794 tests as of the last Phase 1 merge).

- [ ] **Step 2: Add `PlayAfterTilePlacedSfxOptions` and convert `_playAfterTilePlacedSfx`**

Replace (currently lines 1697-1703):

```ts
  private _playAfterTilePlacedSfx(
    board: Board,
    filledBefore: Set<string>,
    changes: Array<{ row: number; col: number; delta: number }>,
    placedIsLeakyAndConnected: boolean,
    placedPosKey: string | null,
  ): void {
```

with:

```ts
  private _playAfterTilePlacedSfx(opts: PlayAfterTilePlacedSfxOptions): void {
    const { board, filledBefore, changes, placedIsLeakyAndConnected, placedPosKey } = opts;
```

Add immediately above the `/** Play all SFX for a tile-placement action. ... */` JSDoc block that precedes `_playAfterTilePlacedSfx` (currently starting line 1686):

```ts
interface PlayAfterTilePlacedSfxOptions {
  board: Board;
  filledBefore: Set<string>;
  changes: Array<{ row: number; col: number; delta: number }>;
  placedIsLeakyAndConnected: boolean;
  placedPosKey: string | null;
}

```

- [ ] **Step 3: Update `_playAfterTilePlacedSfx`'s one call site**

Replace (currently line 1938, inside `afterTilePlaced`):

```ts
    this._playAfterTilePlacedSfx(this.board, filledBefore, changes, placedIsLeakyAndConnected, posKey);
```

with:

```ts
    this._playAfterTilePlacedSfx({ board: this.board, filledBefore, changes, placedIsLeakyAndConnected, placedPosKey: posKey });
```

- [ ] **Step 4: Add `AfterTilePlacedOptions` and convert `afterTilePlaced`**

Replace (currently lines 1890-1897):

```ts
  afterTilePlaced(
    placedShape: PipeShape,
    result: MoveResult,
    filledBefore: Set<string>,
    replacedTile: Tile | undefined,
    replacedRow: number,
    replacedCol: number,
  ): void {
```

with:

```ts
  afterTilePlaced(opts: AfterTilePlacedOptions): void {
    const { placedShape, result, filledBefore, replacedTile, replacedRow, replacedCol } = opts;
```

Add immediately above the `/** * Post-placement bookkeeping shared by both place and replace actions. ... */` JSDoc block that precedes `afterTilePlaced` (currently starting line 1885), and **export** it (this interface is imported by `inputHandler.ts` in Step 6):

```ts
export interface AfterTilePlacedOptions {
  placedShape: PipeShape;
  result: MoveResult;
  filledBefore: Set<string>;
  replacedTile: Tile | undefined;
  replacedRow: number;
  replacedCol: number;
}

```

- [ ] **Step 5: Update `afterTilePlaced`'s one call site**

Replace (currently line 1987, inside `tryPlaceOrReplace`):

```ts
      this.afterTilePlaced(this.selectedShape, result, filledBefore, replacedTile, pos.row, pos.col);
```

with:

```ts
      this.afterTilePlaced({
        placedShape: this.selectedShape, result, filledBefore, replacedTile,
        replacedRow: pos.row, replacedCol: pos.col,
      });
```

- [ ] **Step 6: Update the `InputCallbacks` interface declaration in inputHandler.ts**

Replace (currently lines 41-48):

```ts
  afterTilePlaced(
    shape: PipeShape,
    result: MoveResult,
    filledBefore: Set<string>,
    replacedTile: Tile | undefined,
    row: number,
    col: number,
  ): void;
```

with:

```ts
  afterTilePlaced(opts: AfterTilePlacedOptions): void;
```

`inputHandler.ts` does not currently import anything from `./game` (verified at plan-writing time — `game.ts` imports `InputCallbacks`/`InputHandler` from `./inputHandler`, so this is a new reverse, type-only edge; `import type` is erased at compile time and does not create a runtime circular-require issue). Add this new import line near the top of the file, after the existing `import type { Board, MoveResult} from './board';` line (currently line 1):

```ts
import type { AfterTilePlacedOptions } from './game';
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: identical pass count to Step 1, zero failures.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors.

- [ ] **Step 9: Commit**

```bash
git add src/game.ts src/inputHandler.ts
git commit -m "refactor(game): collapse _playAfterTilePlacedSfx/afterTilePlaced args into options objects

Resolves CodeScene's Excess Number of Function Arguments findings on both
functions. afterTilePlaced is also declared on the InputCallbacks interface
(inputHandler.ts) that Game implements, so that declaration is updated in
lockstep. Both call sites (game.ts internal only) updated to pass an
options object instead of positional arguments. No behavior change — same
values passed in the same order, just packaged differently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Task 2: renderer.ts — Parameter-object pass for `drawTile`, `_drawPipeArmInRotatedFrame`, and `drawSourceOrSink`

Resolves 3 of renderer.ts's Excess Function Arguments findings, including its two worst (`drawTile` at 20 args, `drawSourceOrSink` at 9 args). `drawSourceOrSink` is also called from `src/visuals/chapterMap.ts`, outside renderer.ts — that call site is updated too. `drawTile` has 7 call sites, all within renderer.ts (inside `renderContainerFillAnims`, `renderContainerDrainAnims`, `_renderPass2NonPipeTiles` ×2, `_renderPass3PipeTiles` ×2, `_drawPreviewTile`) — every one is updated in this task, even though the functions containing most of those call sites (`renderContainerFillAnims`, `renderContainerDrainAnims`, `_renderPass2NonPipeTiles`, `_renderPass3PipeTiles`) don't get their own signatures changed until Tasks 3 and 4. See "Task Ordering Rationale" above.

**Files:**
- Modify: `src/renderer.ts:362-372` (`drawSourceOrSink`), `src/renderer.ts:1347-1354` (`_drawPipeArmInRotatedFrame`), `src/renderer.ts:1902-1923` (`drawTile`)
- Modify (call-site only, no signature change): `src/renderer.ts` lines 1965, 1972 (`_drawPipeArmInRotatedFrame` calls), 2004 (`drawSourceOrSink` call), 2342, 2437, 2637, 2640, 2718, 2721, 2765 (`drawTile` calls)
- Modify: `src/visuals/chapterMap.ts:465` (`drawSourceOrSink` call)

**Interfaces:**
- Produces: exported `DrawSourceOrSinkOptions`, module-private `DrawPipeArmOptions`, exported `DrawTileOptions` (all declared in renderer.ts, immediately above their function).

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all tests pass (record the pass count).

- [ ] **Step 2: Add `DrawSourceOrSinkOptions` and convert `drawSourceOrSink`**

Replace (currently lines 362-372):

```ts
export function drawSourceOrSink(
  ctx: CanvasRenderingContext2D,
  connections: ReadonlySet<Direction>,
  color: string,
  half: number,
  isSource: boolean,
  buttEndDirs?: Set<Direction>,
  centerLabel?: { text: string; color: string },
  bgColor?: string,
  afterOuterCircleFn?: () => void,
): void {
```

with:

```ts
export interface DrawSourceOrSinkOptions {
  connections: ReadonlySet<Direction>;
  color: string;
  half: number;
  isSource: boolean;
  buttEndDirs?: Set<Direction>;
  centerLabel?: { text: string; color: string };
  bgColor?: string;
  afterOuterCircleFn?: () => void;
}

export function drawSourceOrSink(ctx: CanvasRenderingContext2D, opts: DrawSourceOrSinkOptions): void {
  const { connections, color, half, isSource, buttEndDirs, centerLabel, bgColor, afterOuterCircleFn } = opts;
```

- [ ] **Step 3: Update `drawSourceOrSink`'s two call sites**

Replace (currently renderer.ts:2004, inside `drawTile`):

```ts
    drawSourceOrSink(ctx, tile.connections, color, half, isSource, effectiveButtEndDirs, isSource ? { text: String(currentWater), color: LABEL_COLOR } : undefined, undefined, afterOuterCircleFn);
```

with:

```ts
    drawSourceOrSink(ctx, {
      connections: tile.connections, color, half, isSource, buttEndDirs: effectiveButtEndDirs,
      centerLabel: isSource ? { text: String(currentWater), color: LABEL_COLOR } : undefined,
      afterOuterCircleFn,
    });
```

Replace (currently `src/visuals/chapterMap.ts:465`, inside `_drawChapterMapEndpointTile`):

```ts
  drawSourceOrSink(ctx, connections, color, CELL / 2, isSource, buttEndDirs, centerLabel, CHAPTER_MAP_TILE_BG);
```

with:

```ts
  drawSourceOrSink(ctx, { connections, color, half: CELL / 2, isSource, buttEndDirs, centerLabel, bgColor: CHAPTER_MAP_TILE_BG });
```

- [ ] **Step 4: Add `DrawPipeArmOptions` and convert `_drawPipeArmInRotatedFrame`**

Replace (currently lines 1347-1354):

```ts
function _drawPipeArmInRotatedFrame(
  ctx: CanvasRenderingContext2D,
  absDir: Direction,
  tileRotation: number,
  half: number,
  color: string,
  buttEnd = false,
): void {
```

with:

```ts
interface DrawPipeArmOptions {
  absDir: Direction;
  tileRotation: number;
  half: number;
  color: string;
  buttEnd?: boolean;
}

function _drawPipeArmInRotatedFrame(ctx: CanvasRenderingContext2D, opts: DrawPipeArmOptions): void {
  const { absDir, tileRotation, half, color, buttEnd = false } = opts;
```

- [ ] **Step 5: Update `_drawPipeArmInRotatedFrame`'s two call sites**

Replace (currently lines 1965-1966, inside `drawTile`):

```ts
      _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, 'black',
        effectiveButtEndDirs?.has(armDir) ?? false);
```

with:

```ts
      _drawPipeArmInRotatedFrame(ctx, {
        absDir: armDir, tileRotation: rotation, half, color: 'black',
        buttEnd: effectiveButtEndDirs?.has(armDir) ?? false,
      });
```

Replace (currently lines 1972-1973, inside `drawTile`):

```ts
      _drawPipeArmInRotatedFrame(ctx, armDir, rotation, half, armColor,
        effectiveButtEndDirs?.has(armDir) ?? false);
```

with:

```ts
      _drawPipeArmInRotatedFrame(ctx, {
        absDir: armDir, tileRotation: rotation, half, color: armColor,
        buttEnd: effectiveButtEndDirs?.has(armDir) ?? false,
      });
```

- [ ] **Step 6: Add `DrawTileOptions` and convert `drawTile`**

Replace (currently lines 1902-1923):

```ts
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tile: Tile,
  isWater: boolean,
  currentWater: number,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  lockedCost: number | null = null,
  lockedGain: number | null = null,
  isHovered = false,
  blockedWaterDir: Direction | null = null,
  rotationDegOverride?: number,
  buttEndDirs?: Set<Direction>,
  seaNeighbors?: SeaNeighbors,
  graniteNeighbors?: GraniteNeighbors,
  afterOuterCircleFn?: () => void,
  levelStyle?: LevelStyle,
  nowMs = Date.now(),
): void {
```

with:

```ts
export interface DrawTileOptions {
  x: number;
  y: number;
  tile: Tile;
  isWater: boolean;
  currentWater: number;
  shiftHeld?: boolean;
  currentTemp?: number;
  currentPressure?: number;
  lockedCost?: number | null;
  lockedGain?: number | null;
  isHovered?: boolean;
  blockedWaterDir?: Direction | null;
  rotationDegOverride?: number;
  buttEndDirs?: Set<Direction>;
  seaNeighbors?: SeaNeighbors;
  graniteNeighbors?: GraniteNeighbors;
  afterOuterCircleFn?: () => void;
  levelStyle?: LevelStyle;
  nowMs?: number;
}

export function drawTile(ctx: CanvasRenderingContext2D, opts: DrawTileOptions): void {
  const {
    x, y, tile, isWater, currentWater,
    shiftHeld = false, currentTemp = 0, currentPressure = 1,
    lockedCost = null, lockedGain = null, isHovered = false, blockedWaterDir = null,
    rotationDegOverride, buttEndDirs, seaNeighbors, graniteNeighbors,
    afterOuterCircleFn, levelStyle, nowMs = Date.now(),
  } = opts;
```

- [ ] **Step 7: Update `drawTile`'s seven call sites**

Replace (currently renderer.ts:2342, inside `renderContainerFillAnims`):

```ts
    drawTile(ctx, x, y, tile, true, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs);
```

with:

```ts
    drawTile(ctx, {
      x, y, tile, isWater: true, currentWater, shiftHeld, currentTemp, currentPressure,
      lockedCost, lockedGain, buttEndDirs,
    });
```

Replace (currently renderer.ts:2437, inside `renderContainerDrainAnims` — identical original argument list to the previous site):

```ts
    drawTile(ctx, x, y, tile, true, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs);
```

with:

```ts
    drawTile(ctx, {
      x, y, tile, isWater: true, currentWater, shiftHeld, currentTemp, currentPressure,
      lockedCost, lockedGain, buttEndDirs,
    });
```

Replace (currently renderer.ts:2637, inside `_renderPass2NonPipeTiles`'s shake-offset branch):

```ts
        drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs, seaNeighbors, graniteNeighbors, afterOuterCircleFn, tileStyle);
```

with:

```ts
        drawTile(ctx, {
          x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
          lockedCost, lockedGain, buttEndDirs, seaNeighbors, graniteNeighbors,
          afterOuterCircleFn, levelStyle: tileStyle,
        });
```

Replace (currently renderer.ts:2640, inside `_renderPass2NonPipeTiles`'s non-shake branch — identical original argument list to the shake branch):

```ts
        drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, lockedCost, lockedGain, false, null, undefined, buttEndDirs, seaNeighbors, graniteNeighbors, afterOuterCircleFn, tileStyle);
```

with:

```ts
        drawTile(ctx, {
          x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
          lockedCost, lockedGain, buttEndDirs, seaNeighbors, graniteNeighbors,
          afterOuterCircleFn, levelStyle: tileStyle,
        });
```

Replace (currently renderer.ts:2718, inside `_renderPass3PipeTiles`'s scale/shake branch):

```ts
        drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, null, null, isHovered, blockedWaterDir, rotOverride, buttEndDirs, undefined, undefined, undefined, undefined, now);
```

with:

```ts
        drawTile(ctx, {
          x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
          isHovered, blockedWaterDir, rotationDegOverride: rotOverride, buttEndDirs, nowMs: now,
        });
```

Replace (currently renderer.ts:2721, inside `_renderPass3PipeTiles`'s non-scale/shake branch — identical original argument list to the scale/shake branch):

```ts
        drawTile(ctx, x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure, null, null, isHovered, blockedWaterDir, rotOverride, buttEndDirs, undefined, undefined, undefined, undefined, now);
```

with:

```ts
        drawTile(ctx, {
          x, y, tile, isWater, currentWater, shiftHeld, currentTemp, currentPressure,
          isHovered, blockedWaterDir, rotationDegOverride: rotOverride, buttEndDirs, nowMs: now,
        });
```

Replace (currently renderer.ts:2765, inside `_drawPreviewTile`):

```ts
  drawTile(ctx, px, py, previewTile, false, currentWater);
```

with:

```ts
  drawTile(ctx, { x: px, y: py, tile: previewTile, isWater: false, currentWater });
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: identical pass count to Step 1, zero failures.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors. This is the primary signal for this task — TypeScript will catch any dropped/misnamed field across the 9 updated call sites.

- [ ] **Step 10: Visual check**

Use the `run-pipes` skill to launch the web build and screenshot a level containing: at least one Source tile, one Sink tile, several pipe tiles of different shapes/rotations including one connected (water-filled) and one dry, a one-way tile with a blocked arm, and (if available in the chosen level) a Chamber with a locked cost/gain display. Also open the chapter map screen (which renders Source/Sink tiles via `chapterMap.ts`'s `_drawChapterMapEndpointTile`) and screenshot it. Hover the mouse over an empty tile with an inventory item selected to trigger the preview-tile path (`_drawPreviewTile`), and screenshot that too. Confirm every screenshot is pixel-identical to a same-scenario screenshot taken before this change.

- [ ] **Step 11: Commit**

```bash
git add src/renderer.ts src/visuals/chapterMap.ts
git commit -m "refactor(renderer): collapse drawTile/drawSourceOrSink/_drawPipeArmInRotatedFrame args into options objects

Resolves CodeScene's Excess Number of Function Arguments findings on all
three functions (drawTile was renderer.ts's worst at 20 args). ctx stays
the leading positional parameter per this file's existing convention;
every other parameter moves into a typed opts object. All 7 drawTile call
sites, both _drawPipeArmInRotatedFrame call sites, and both
drawSourceOrSink call sites (including src/visuals/chapterMap.ts, the one
external caller) updated to match. No behavior change — same effective
values passed in the same order via defaults preserved in the
destructuring, just packaged differently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Task 3: renderer.ts — Parameter-object pass for `renderContainerFillAnims` and `renderContainerDrainAnims`

Resolves 2 of renderer.ts's Excess Function Arguments findings. Both functions have an identical 8-parameter shape (differing only in the `anims` array's element type: `PipeFillAnim[]` vs `PipeDrainAnim[]`) and are called back-to-back from the same one method, `AnimationManager.renderFillEffects` (`src/animationManager.ts`) — batched into one task per the "batch small same-shape work" guidance, since both changes are mechanical, touch the same caller method, and warrant one shared review pass rather than two.

**Files:**
- Modify: `src/renderer.ts:2264-2273` (`renderContainerFillAnims`), `src/renderer.ts:2355-2364` (`renderContainerDrainAnims`)
- Modify: `src/animationManager.ts:540-545` (both call sites, same method)

**Interfaces:**
- Produces: exported `ContainerFillAnimsOptions` and `ContainerDrainAnimsOptions` (declared in renderer.ts, immediately above their respective function).

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all tests pass (record the pass count).

- [ ] **Step 2: Add `ContainerFillAnimsOptions` and convert `renderContainerFillAnims`**

Replace (currently lines 2264-2273):

```ts
export function renderContainerFillAnims(
  ctx: CanvasRenderingContext2D,
  board: Board,
  anims: PipeFillAnim[],
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  now: number,
): void {
```

with:

```ts
export interface ContainerFillAnimsOptions {
  board: Board;
  anims: PipeFillAnim[];
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  now: number;
}

export function renderContainerFillAnims(ctx: CanvasRenderingContext2D, opts: ContainerFillAnimsOptions): void {
  const { board, anims, currentWater, shiftHeld, currentTemp, currentPressure, now } = opts;
```

The existing `@param` JSDoc lines immediately above this function (currently lines 2254-2262: `@param ctx`, `@param board`, `@param anims`, `@param currentWater`, `@param shiftHeld`, `@param currentTemp`, `@param currentPressure`, `@param now`) stay as-is — they document the same names, which now live on `opts` instead of being direct parameters; no JSDoc edit needed here since the field names are unchanged.

- [ ] **Step 3: Add `ContainerDrainAnimsOptions` and convert `renderContainerDrainAnims`**

Replace (currently lines 2355-2364):

```ts
export function renderContainerDrainAnims(
  ctx: CanvasRenderingContext2D,
  board: Board,
  anims: PipeDrainAnim[],
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  now: number,
): void {
```

with:

```ts
export interface ContainerDrainAnimsOptions {
  board: Board;
  anims: PipeDrainAnim[];
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  now: number;
}

export function renderContainerDrainAnims(ctx: CanvasRenderingContext2D, opts: ContainerDrainAnimsOptions): void {
  const { board, anims, currentWater, shiftHeld, currentTemp, currentPressure, now } = opts;
```

- [ ] **Step 4: Update both call sites in animationManager.ts**

Replace (currently lines 540-545, inside `AnimationManager.renderFillEffects`):

```ts
    renderContainerFillAnims(
      this.ctx, board, this._fillAnims, water, shiftHeld, currentTemp, currentPressure, now,
    );
    renderContainerDrainAnims(
      this.ctx, board, this._drainAnims, water, shiftHeld, currentTemp, currentPressure, now,
    );
```

with:

```ts
    renderContainerFillAnims(this.ctx, {
      board, anims: this._fillAnims, currentWater: water, shiftHeld, currentTemp, currentPressure, now,
    });
    renderContainerDrainAnims(this.ctx, {
      board, anims: this._drainAnims, currentWater: water, shiftHeld, currentTemp, currentPressure, now,
    });
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: identical pass count to Step 1, zero failures.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors.

- [ ] **Step 7: Visual check**

Use the `run-pipes` skill to launch the web build, start a level with at least one Chamber and one Sink, place/replace a tile to trigger a fill animation and remove one to trigger a drain animation, and screenshot mid-animation for both. Confirm the wipe-reveal/wipe-drain visuals are pixel-identical to same-scenario screenshots taken before this change.

- [ ] **Step 8: Commit**

```bash
git add src/renderer.ts src/animationManager.ts
git commit -m "refactor(renderer): collapse renderContainerFillAnims/DrainAnims args into options objects

Resolves CodeScene's Excess Number of Function Arguments findings on both
functions. Both call sites (src/animationManager.ts, the same method)
updated to match. No behavior change — same values passed in the same
order, just packaged differently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Task 4: renderer.ts — Parameter-object pass for `renderBoard` and its four pass functions

Resolves 5 of renderer.ts's Excess Function Arguments findings, including `renderBoard` itself (18 args) — the file's largest exported function signature besides `drawTile` (already handled in Task 2). `renderBoard` is called from `src/game.ts` at two sites. `_renderPass1Backgrounds`, `_renderPass2NonPipeTiles`, `_renderPass3PipeTiles`, and `_renderHoverPreview` are each called exactly once, from inside `renderBoard` itself — updating their call sites is entirely internal to this task (no other file touches them).

**Files:**
- Modify: `src/renderer.ts:2182-2243` (`renderBoard`), `src/renderer.ts:2446-2453` (`_renderPass1Backgrounds`), `src/renderer.ts:2525-2535` (`_renderPass2NonPipeTiles`), `src/renderer.ts:2653-2665` (`_renderPass3PipeTiles`), `src/renderer.ts:2878-2889` (`_renderHoverPreview`)
- Modify: `src/game.ts:1111-1141` (main call site), `src/game.ts:2401` (offscreen-snapshot call site)

**Interfaces:**
- Produces: exported `RenderBoardOptions`, and module-private `RenderPass1BackgroundsOptions`, `RenderPass2NonPipeTilesOptions`, `RenderPass3PipeTilesOptions`, `RenderHoverPreviewOptions` (all declared in renderer.ts, immediately above their respective function). Per the Global Constraints "out of scope" note, these are five independent interfaces — no shared base type between them, even though several fields (`board`, `currentWater`, `filled`/`filledPositions`) repeat across two or more.

- [ ] **Step 1: Confirm current test baseline**

Run: `npm test`
Expected: all tests pass (record the pass count).

- [ ] **Step 2: Add `RenderPass1BackgroundsOptions` and convert `_renderPass1Backgrounds`**

Replace (currently lines 2446-2453):

```ts
function _renderPass1Backgrounds(
  ctx: CanvasRenderingContext2D,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  selectedIsGold: boolean,
  shimmerAlpha: number,
): void {
```

with:

```ts
interface RenderPass1BackgroundsOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  selectedIsGold: boolean;
  shimmerAlpha: number;
}

function _renderPass1Backgrounds(ctx: CanvasRenderingContext2D, opts: RenderPass1BackgroundsOptions): void {
  const { board, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha } = opts;
```

- [ ] **Step 3: Add `RenderPass2NonPipeTilesOptions` and convert `_renderPass2NonPipeTiles`**

Replace (currently lines 2525-2535):

```ts
function _renderPass2NonPipeTiles(
  ctx: CanvasRenderingContext2D,
  board: Board,
  filled: Set<string>,
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  sinkVortexFn?: () => void,
  shakeOffsets?: Map<string, number>,
): void {
```

with:

```ts
interface RenderPass2NonPipeTilesOptions {
  board: Board;
  filled: Set<string>;
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  sinkVortexFn?: () => void;
  shakeOffsets?: Map<string, number>;
}

function _renderPass2NonPipeTiles(ctx: CanvasRenderingContext2D, opts: RenderPass2NonPipeTilesOptions): void {
  const { board, filled, currentWater, shiftHeld, currentTemp, currentPressure, sinkVortexFn, shakeOffsets } = opts;
```

- [ ] **Step 4: Add `RenderPass3PipeTilesOptions` and convert `_renderPass3PipeTiles`**

Replace (currently lines 2653-2665):

```ts
function _renderPass3PipeTiles(
  ctx: CanvasRenderingContext2D,
  board: Board,
  filled: Set<string>,
  currentWater: number,
  shiftHeld: boolean,
  currentTemp: number,
  currentPressure: number,
  mouseCanvasPos: { x: number; y: number } | null,
  now: number,
  rotationOverrides?: Map<string, number>,
  scaleOverrides?: Map<string, number>,
  shakeOffsets?: Map<string, number>,
): void {
```

with:

```ts
interface RenderPass3PipeTilesOptions {
  board: Board;
  filled: Set<string>;
  currentWater: number;
  shiftHeld: boolean;
  currentTemp: number;
  currentPressure: number;
  mouseCanvasPos: { x: number; y: number } | null;
  now: number;
  rotationOverrides?: Map<string, number>;
  scaleOverrides?: Map<string, number>;
  shakeOffsets?: Map<string, number>;
}

function _renderPass3PipeTiles(ctx: CanvasRenderingContext2D, opts: RenderPass3PipeTilesOptions): void {
  const {
    board, filled, currentWater, shiftHeld, currentTemp, currentPressure,
    mouseCanvasPos, now, rotationOverrides, scaleOverrides, shakeOffsets,
  } = opts;
```

- [ ] **Step 5: Add `RenderHoverPreviewOptions` and convert `_renderHoverPreview`**

Replace (currently lines 2878-2889):

```ts
function _renderHoverPreview(
  ctx: CanvasRenderingContext2D,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  selectedIsGold: boolean,
  mouseCanvasPos: { x: number; y: number } | null,
  hoverRotationDelta: number,
  currentWater: number,
  filledPositions: Set<string>,
  now: number,
): void {
```

with:

```ts
interface RenderHoverPreviewOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  selectedIsGold: boolean;
  mouseCanvasPos: { x: number; y: number } | null;
  hoverRotationDelta: number;
  currentWater: number;
  filledPositions: Set<string>;
  now: number;
}

function _renderHoverPreview(ctx: CanvasRenderingContext2D, opts: RenderHoverPreviewOptions): void {
  const {
    board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos,
    hoverRotationDelta, currentWater, filledPositions, now,
  } = opts;
```

- [ ] **Step 6: Add `RenderBoardOptions` and convert `renderBoard`, updating its four internal calls to the pass functions**

Replace (currently lines 2182-2243, the full function):

```ts
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  board: Board,
  selectedShape: PipeShape | null,
  pendingRotation: number,
  mouseCanvasPos: { x: number; y: number } | null,
  shiftHeld = false,
  currentTemp = 0,
  currentPressure = 1,
  highlightedPositions: Set<string> = new Set(),
  hoverRotationDelta = 0,
  rotationOverrides?: Map<string, number>,
  scaleOverrides?: Map<string, number>,
  shakeOffsets?: Map<string, number>,
  fillExclude?: Set<string>,
  drainInclude?: Set<string>,
  winTileOverlayFn?: (ctx: CanvasRenderingContext2D) => void,
  sinkVortexFn?: () => void,
  cementCrackFn?: (ctx: CanvasRenderingContext2D) => void,
): void {
  const now = Date.now();
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  // Tiles in fillExclude are rendered dry so the fill overlay can paint water on top.
  // Tiles in drainInclude are rendered as filled (water) so the drain overlay can paint dry on top.
  let effectiveFilled: Set<string>;
  const needsModified = (fillExclude !== undefined && fillExclude.size > 0) || (drainInclude !== undefined && drainInclude.size > 0);
  if (needsModified) {
    effectiveFilled = new Set<string>(filled);
    if (fillExclude) {
      for (const k of fillExclude) effectiveFilled.delete(k);
    }
    if (drainInclude) {
      for (const k of drainInclude) effectiveFilled.add(k);
    }
  } else {
    effectiveFilled = filled;
  }
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(now / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  _renderPass1Backgrounds(ctx, board, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha);
  _renderPass2NonPipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, sinkVortexFn, shakeOffsets);
  // Win tile glow overlay: rendered above Source/Sink/Chamber content but beneath
  // pipe strokes, so it is visible on all connected tile types.
  winTileOverlayFn?.(ctx);
  // Cement crack lines: rendered above floor/obstacle tiles but beneath pipe strokes.
  cementCrackFn?.(ctx);
  _renderPass3PipeTiles(ctx, board, effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure, mouseCanvasPos, now, rotationOverrides, scaleOverrides, shakeOffsets);
  _renderPass4CementLabels(ctx, board);
  _renderPass5FixedPipeBolts(ctx, board);
  // Error highlights are drawn last so they appear above all tile content.
  _renderPass6ErrorHighlights(ctx, board, highlightedPositions, now);
  _renderHoverPreview(ctx, board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos, hoverRotationDelta, currentWater, effectiveFilled, now);
}
```

with:

```ts
export interface RenderBoardOptions {
  board: Board;
  selectedShape: PipeShape | null;
  pendingRotation: number;
  mouseCanvasPos: { x: number; y: number } | null;
  shiftHeld?: boolean;
  currentTemp?: number;
  currentPressure?: number;
  highlightedPositions?: Set<string>;
  hoverRotationDelta?: number;
  rotationOverrides?: Map<string, number>;
  scaleOverrides?: Map<string, number>;
  shakeOffsets?: Map<string, number>;
  fillExclude?: Set<string>;
  drainInclude?: Set<string>;
  winTileOverlayFn?: (ctx: CanvasRenderingContext2D) => void;
  sinkVortexFn?: () => void;
  cementCrackFn?: (ctx: CanvasRenderingContext2D) => void;
}

export function renderBoard(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, opts: RenderBoardOptions): void {
  const {
    board, selectedShape, pendingRotation, mouseCanvasPos,
    shiftHeld = false, currentTemp = 0, currentPressure = 1,
    highlightedPositions = new Set<string>(), hoverRotationDelta = 0,
    rotationOverrides, scaleOverrides, shakeOffsets, fillExclude, drainInclude,
    winTileOverlayFn, sinkVortexFn, cementCrackFn,
  } = opts;

  const now = Date.now();
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const filled = board.getFilledPositions();
  // Tiles in fillExclude are rendered dry so the fill overlay can paint water on top.
  // Tiles in drainInclude are rendered as filled (water) so the drain overlay can paint dry on top.
  let effectiveFilled: Set<string>;
  const needsModified = (fillExclude !== undefined && fillExclude.size > 0) || (drainInclude !== undefined && drainInclude.size > 0);
  if (needsModified) {
    effectiveFilled = new Set<string>(filled);
    if (fillExclude) {
      for (const k of fillExclude) effectiveFilled.delete(k);
    }
    if (drainInclude) {
      for (const k of drainInclude) effectiveFilled.add(k);
    }
  } else {
    effectiveFilled = filled;
  }
  const currentWater = board.getCurrentWater();

  // Shimmer phase for gold spaces (oscillates smoothly over time)
  const shimmerAlpha = 0.2 + 0.25 * ((Math.sin(now / 500) + 1) / 2);

  const selectedIsGold = selectedShape !== null && GOLD_PIPE_SHAPES.has(selectedShape);

  _renderPass1Backgrounds(ctx, { board, selectedShape, pendingRotation, selectedIsGold, shimmerAlpha });
  _renderPass2NonPipeTiles(ctx, {
    board, filled: effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure,
    sinkVortexFn, shakeOffsets,
  });
  // Win tile glow overlay: rendered above Source/Sink/Chamber content but beneath
  // pipe strokes, so it is visible on all connected tile types.
  winTileOverlayFn?.(ctx);
  // Cement crack lines: rendered above floor/obstacle tiles but beneath pipe strokes.
  cementCrackFn?.(ctx);
  _renderPass3PipeTiles(ctx, {
    board, filled: effectiveFilled, currentWater, shiftHeld, currentTemp, currentPressure,
    mouseCanvasPos, now, rotationOverrides, scaleOverrides, shakeOffsets,
  });
  _renderPass4CementLabels(ctx, board);
  _renderPass5FixedPipeBolts(ctx, board);
  // Error highlights are drawn last so they appear above all tile content.
  _renderPass6ErrorHighlights(ctx, board, highlightedPositions, now);
  _renderHoverPreview(ctx, {
    board, selectedShape, pendingRotation, selectedIsGold, mouseCanvasPos,
    hoverRotationDelta, currentWater, filledPositions: effectiveFilled, now,
  });
}
```

- [ ] **Step 7: Update `renderBoard`'s two call sites in game.ts**

Replace (currently `src/game.ts:1111-1141`, inside `Game._renderBoard`):

```ts
    renderBoard(
      this.ctx,
      this.canvas,
      this.board,
      this.selectedShape,
      this.pendingRotation,
      this._input.mouseCanvasPos,
      this._input.shiftHeld,
      currentTemp,
      currentPressure,
      this._errorHighlightKeys,
      this._input.hoverRotationDelta,
      rotationOverrides,
      scaleOverrides,
      shakeOffsets,
      fillExclude,
      this._animMgr.getDrainInclude(now),
      () => {
        this._animMgr.renderWinTileGlowsOverlay(now);
        if (this.gameState === GameState.GameOver) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
          this._animMgr.renderDrySourcePulseOverlay(this.board!, now);
        }
      },
      // Vortex callback: rendered inside drawSourceOrSink after the outer circle
      // but before the connector arms, so particles appear above the sink backdrop
      // and underneath the arms.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
      () => this._animMgr.tickVortex(this.board!),
      (ctx) => this._animMgr.renderCementCracks(ctx, now),
    );
```

with:

```ts
    renderBoard(this.ctx, this.canvas, {
      board: this.board,
      selectedShape: this.selectedShape,
      pendingRotation: this.pendingRotation,
      mouseCanvasPos: this._input.mouseCanvasPos,
      shiftHeld: this._input.shiftHeld,
      currentTemp,
      currentPressure,
      highlightedPositions: this._errorHighlightKeys,
      hoverRotationDelta: this._input.hoverRotationDelta,
      rotationOverrides,
      scaleOverrides,
      shakeOffsets,
      fillExclude,
      drainInclude: this._animMgr.getDrainInclude(now),
      winTileOverlayFn: () => {
        this._animMgr.renderWinTileGlowsOverlay(now);
        if (this.gameState === GameState.GameOver) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
          this._animMgr.renderDrySourcePulseOverlay(this.board!, now);
        }
      },
      // Vortex callback: rendered inside drawSourceOrSink after the outer circle
      // but before the connector arms, so particles appear above the sink backdrop
      // and underneath the arms.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- board is always set during play state
      sinkVortexFn: () => this._animMgr.tickVortex(this.board!),
      cementCrackFn: (ctx) => this._animMgr.renderCementCracks(ctx, now),
    });
```

Replace (currently `src/game.ts:2401`, the offscreen-snapshot render):

```ts
          renderBoard(offCtx, offscreen, this.board, null, 0, null);
```

with:

```ts
          renderBoard(offCtx, offscreen, { board: this.board, selectedShape: null, pendingRotation: 0, mouseCanvasPos: null });
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: identical pass count to Step 1, zero failures.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit` and `npm run lint`
Expected: zero type errors, zero lint warnings/errors.

- [ ] **Step 10: Visual check**

Use the `run-pipes` skill to launch the web build and screenshot: (a) a normal in-play board render (covers pass 1-3 and hover preview with no overrides active), (b) the board mid-tile-rotation-animation if triggerable within the driver's timing (covers `rotationOverrides`/`scaleOverrides`), (c) hovering an inventory item over an empty tile (covers `_renderHoverPreview`'s placement-preview path, `selectedShape`/`pendingRotation`/`selectedIsGold`), (d) the level-transition snapshot path — trigger a level transition (win a level or use the campaign menu) so `game.ts:2401`'s offscreen `renderBoard` call runs, and screenshot the resulting chapter-map transition frame. Confirm all screenshots are pixel-identical to same-scenario screenshots taken before this change.

- [ ] **Step 11: Commit**

```bash
git add src/renderer.ts src/game.ts
git commit -m "refactor(renderer): collapse renderBoard and its 4 pass functions' args into options objects

Resolves CodeScene's Excess Number of Function Arguments findings on
renderBoard (18 args, renderer.ts's 2nd-largest signature after drawTile)
and its four single-call-site pass helpers (_renderPass1Backgrounds,
_renderPass2NonPipeTiles, _renderPass3PipeTiles, _renderHoverPreview).
Each function gets its own bespoke options interface rather than a shared
cross-function context object (see plan's Global Constraints) to minimize
behavior-change risk. Both renderBoard call sites in game.ts updated to
match. No behavior change — same values passed in the same order via
defaults preserved in the destructuring, just packaged differently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VnpF4i19Lu6wZQ1NC9r5t9"
```

---

## Verification: re-run CodeScene analysis

After all 4 tasks are committed:

- [ ] **Step 1: Trigger a fresh CodeScene analysis**

In the CodeScene on-prem UI (`http://localhost:3003/projects/1`), click **Analyze Now** (or push to the branch CodeScene's project tracks).

- [ ] **Step 2: Compare scores**

Use `mcp__codescene__code_health_review` on `src/game.ts` and `src/renderer.ts`, or `mcp__codescene__list_technical_debt_hotspots_for_project` (project_id 1), and confirm:
- The "Excess Number of Function Arguments" findings targeted by this plan are resolved or reduced: `_playAfterTilePlacedSfx` and `afterTilePlaced` in game.ts; `drawTile`, `_drawPipeArmInRotatedFrame`, `drawSourceOrSink`, `renderContainerFillAnims`, `renderContainerDrainAnims`, `renderBoard`, `_renderPass1Backgrounds`, `_renderPass2NonPipeTiles`, `_renderPass3PipeTiles`, and `_renderHoverPreview` in renderer.ts (12 functions total; CodeScene may have grouped some as one finding per file rather than one per function — check whichever granularity the report uses).
- "Primitive Obsession" findings on both files have decreased (fewer functions taking >3 primitive-typed parameters).
- Neither file reaches green (9.0+) from this plan alone — the remaining findings (Brain Methods, very-high-complexity functions like `_resolveTileColor` cc=57 and `Game._collectConnectionSfx` cc=46) are out of scope here; see Phase 2 remainder in `docs/superpowers/plans/2026-09-02-red-file-code-health-refactor.md`.
