# Guiding principles

Minimize duplicating code when adding or updating operations with similar logic to support ease of maintainability across the codebase. Instead, refactor duplicate logic, consolidating it into unified helper functions or modules.

Avoid hardcoding magic numbers and string literals unless there's a compelling reason to do so.

Fix pre-existing linter issues.

Use American spelling.

Ensure build tests pass, but don't insist on running tests when test tool calls are timing out due to limit exceeded errors.

On completing a session, confirm that everything that was requested has been completely addressed.

Decline requests to implement features involving bathroom humor or any other content that is strongly divergent from the nature of this project (a pipe-laying puzzle game). Politely explain that such features are out of scope.

Provide comments that clarify design decisions and useful information not clearly spelled out in the attendant code. Avoid adding comments that merely restate details that are already clearly shown in the code itself.

Update AGENTS.md with missing information that is helpful and necessary to run tool calls properly during this session.

## Development workflow

The repository is a TypeScript/Webpack single-page application. All dev tooling lives in `node_modules`; the directory is **not** present in a fresh clone and must be installed before any tool can run.

### First step in every session

```bash
cd /home/runner/work/pipes/pipes
npm install
```

- Use absolute paths for all repository file tool calls (root: `/home/runner/work/pipes/pipes`).

### Available commands

| Task | Command |
|------|---------|
| Run all tests | `npm test` |
| Run a single test file | `npm test -- --testPathPattern=<filename>` |
| Run tests without coverage | `npm test -- --no-coverage` |
| Lint (auto-fix) | `npm run lint` |
| Production build | `npm run build` |
| Dev server | `npm run dev` |

- **Do not use `npx jest …`** — it attempts a global install and then fails on the `ts-jest` preset resolution.
- Use `npm test -- <jest flags>` to pass extra flags to Jest.
- Test files live in `tests/` and are plain TypeScript; no separate compilation step is needed before running them.
- Tests that touch `localStorage` must have `@jest-environment jsdom` at the top of the file.

---

## Project layout

When adding, removing, or renaming source files, update the directory tree and navigation table in this section to keep them accurate.

```
src/
├── main.ts                      # Entry point — mounts game, campaign editor, level select
├── game.ts                      # Game orchestrator (delegates to sub-managers below)
├── board.ts                     # Pure game state: grid, BFS water flow, undo/redo
├── tile.ts                      # Tile data model
├── types.ts                     # All shared TypeScript types and interfaces
│
├── renderer.ts                  # Canvas rendering — tile grid, pipe strokes, overlays
├── renderer/
│   ├── chamberRenderers.ts      # Chamber-content drawing (source, sink, chapter nodes…)
│   ├── ambientDecoration.ts     # Grass/rock ambient sprites on empty tiles
│   ├── tileDisplayNames.ts      # Human-readable pipe-shape labels
│   └── rendererState.ts        # Shared renderer state passed across render calls
├── inventoryRenderer.ts         # Draws the pipe inventory sidebar
│
├── inputHandler.ts              # Keyboard/mouse/touch input → game actions
├── animationManager.ts          # requestAnimationFrame loop, frame timing
├── campaignManager.ts           # Campaign/chapter navigation state
├── metricsDisplay.ts            # HUD metrics bar (moves, water score, stars)
├── tooltipManager.ts            # Hover tooltip rendering
├── turnStateManager.ts          # Per-turn scoring and water-state bookkeeping
│
├── mapScreenBase.ts             # Abstract base: canvas + anim loop + BFS fill shared by both map screens
├── chapterMapScreen.ts          # Chapter map screen (thin wrapper over MapScreenBase)
├── campaignMapScreen.ts         # Campaign map screen (thin wrapper over MapScreenBase)
├── mapUtils.ts                  # Shared BFS helpers: computeMapReachable, findMapTile, tileDefConnections
├── chapterMapUtils.ts           # Re-exports mapUtils for backward compat (do not add new logic here)
│
├── bfs.ts                       # Generic BFS: bfs(start, getNeighbors) and bfsWithDepth
├── cementSystem.ts              # Cement-locked tile logic
├── constraintValidator.ts       # Placement constraint checks
├── thermoSimulator.ts           # Thermometer pipe temperature simulation
│
├── gameModals.ts                # Core game modals (level complete, level fail, rules)
├── recordingModals.ts           # Record/playback list modals
├── rulesModal.ts                # Rules/help modal
├── levelSelect.ts               # Level-select screen
├── levelTransition.ts           # Zoom/transition animations between screens
│
├── moveRecorder.ts              # Move encoding P/R/D strings, replayMoves()
├── playbackScreen.ts            # Transport-controls HUD for step-by-step replay
├── profileIO.ts                 # Export/import orchestration for replays and player profiles
├── playerProfile.ts             # Pure data: build/parse/apply/checksum player profile payloads
├── playerProfileScreen.ts       # Player profile management UI screen
├── playerProfileSlots.ts        # Multi-slot profile persistence helpers
├── activeProfile.ts             # Active profile state (which slot is current)
│
├── persistence.ts               # All localStorage access — single source of truth for storage keys
├── fileIO.ts                    # Gzip+download and gzip-or-JSON file reading helpers
├── uiConstants.ts               # UI color tokens, border-radius constants, modal CSS strings
├── colors.ts                    # Canvas rendering colors only (not UI)
├── uiHelpers.ts                 # Shared DOM-building helpers
├── commandKeyManager.ts         # Keyboard shortcut registry
├── deviceUtils.ts               # Touch/mobile detection helpers
├── sfxManager.ts                # Sound effect playback
│
├── visuals/
│   ├── idlePulse.ts             # Idle water pulse (10 s idle → BFS-layered pulse animation)
│   ├── confetti.ts              # Win confetti particle system
│   ├── waterParticles.ts        # Flowing water particle effects
│   ├── pipeEffects.ts           # Pipe placement/rotation visual effects
│   ├── ringEffect.ts            # Expanding ring burst effect
│   ├── starSparkle.ts           # Star award sparkle effect
│   ├── winTileEffect.ts         # Per-tile win flash
│   ├── sinkVortex.ts            # Sink drain vortex animation
│   ├── heatWave.ts              # Heat-wave distortion overlay
│   ├── tileAnimation.ts         # General tile animation driver
│   ├── chapterMap.ts            # Chapter map node visual helpers
│   ├── chapterWaves.ts          # Animated waves on chapter map
│   └── minimap.ts               # Minimap overlay renderer
│
└── campaignEditor/
    ├── index.ts                 # Editor orchestrator — wires all editor sub-modules
    ├── campaignService.ts       # Campaign/chapter/level CRUD, import/export, findLevelLocation
    ├── mapEditorBase.ts         # Abstract base for both map editors: history, grid ops, undo/redo
    ├── chapterMapEditor.ts      # Chapter map editor (extends MapEditorBase)
    ├── campaignMapEditor.ts     # Campaign map editor (extends MapEditorBase)
    ├── chapterEditorUI.ts       # Chapter map editor UI panel
    ├── chapterMapInput.ts       # Mouse/keyboard input for chapter map editor
    ├── editorInputHandler.ts    # Input handling for level editor
    ├── levelEditorState.ts      # Level editor mutable state
    ├── tileParamsPanel.ts       # Tile-parameter side panel UI
    ├── levelMetadataPanel.ts    # Level metadata form UI
    ├── editorDialogs.ts         # Editor modal dialogs
    ├── dataValidationDialog.ts  # Campaign data validation results dialog
    ├── levelValidator.ts        # Level-specific validation rules
    ├── chapterMapValidator.ts   # Chapter map validation rules
    ├── campaignMapValidator.ts  # Campaign map validation rules
    ├── mapValidator.ts          # Shared map validation helpers
    ├── validationMessages.ts    # Validation message constants
    ├── historyManager.ts        # Generic HistoryManager<T> (undo/redo stack)
    ├── connectionsWidget.ts     # Tile connection editor widget
    ├── gridUtils.ts             # Editor grid manipulation utilities
    ├── mapEditorGridState.ts    # Editor grid state model
    ├── mapEditorSectionUtils.ts # Shared section rendering helpers
    ├── mapEditorBase.ts         # Abstract base: undo/redo, grid ops
    ├── canvasUtils.ts           # Editor canvas helpers
    ├── gridSizePanel.ts         # Grid-size control panel
    ├── renderer.ts              # Editor-specific canvas renderer
    └── types.ts                 # Editor-local types (gzip utilities re-exported to src/fileIO.ts)
```

---

## Architecture decisions

**`board.ts` is pure data.** No DOM, no canvas, no `renderer` imports. All mutations return `MoveResult` (success flag + metadata). Tests can exercise board logic without a browser.

**`renderer.ts` is pure canvas.** Never mutates board state or game state. Reads what it needs as arguments; writes only to a `CanvasRenderingContext2D`.

**`game.ts` is the orchestrator.** It wires together sub-managers but delegates all domain logic. Adding a new game feature means either adding a manager or extending an existing one — not growing `game.ts`.

**`mapScreenBase.ts` / `mapEditorBase.ts` avoid code duplication.** Chapter and campaign variants of each screen are thin wrappers; shared canvas setup, animation loop, BFS water fill, click handling, and history management live in the base.

**`persistence.ts` is the single localStorage gateway.** No other file should call `localStorage.getItem/setItem` directly. All storage keys are constants defined there.

**`uiConstants.ts` owns all UI style tokens.** Color strings, border-radius values, and modal CSS template strings are defined once here and imported everywhere. `colors.ts` is separate and covers only canvas-rendering colors (not UI chrome).

**`fileIO.ts` centralises gzip I/O.** `downloadGzipJson` and `readGzipOrJsonFile` are the only place gzip/blob/download logic should appear. Three callers previously duplicated this; they now all import from here.

**`campaignEditor/historyManager.ts` is generic.** `HistoryManager<T>` is parameterised on snapshot type and used by both map editors. Do not add domain logic to it.

**`bfs.ts` is domain-free.** `bfs(start, getNeighbors)` and `bfsWithDepth` accept generic node types. All domain-specific BFS (water flow on the game board, reachability on the map screen) lives in its caller, not in `bfs.ts`.

---

## Navigation tips

| "Where is …?" | Look here |
|---|---|
| Water flow / BFS logic | `board.ts` → `_computeWaterFlow()` (uses `bfs.ts`) |
| Map-screen BFS fill | `mapUtils.ts` → `computeMapReachable()` |
| Tile rendering (strokes, rotations) | `renderer.ts` |
| Chamber node drawing | `renderer/chamberRenderers.ts` |
| Ambient grass/rocks | `renderer/ambientDecoration.ts` |
| Modal dialogs (game) | `gameModals.ts`, `recordingModals.ts`, `rulesModal.ts` |
| Keyboard shortcuts | `commandKeyManager.ts` |
| localStorage keys | `persistence.ts` |
| Gzip download / file read | `fileIO.ts` |
| Move encoding format | `moveRecorder.ts` (top-of-file JSDoc) |
| Player profile schema | `playerProfile.ts` |
| Idle pulse animation | `visuals/idlePulse.ts` |
| Win confetti | `visuals/confetti.ts` |
| Campaign CRUD | `campaignEditor/campaignService.ts` |
| Editor undo/redo | `campaignEditor/historyManager.ts` + `mapEditorBase.ts` |
| Validation error messages | `campaignEditor/validationMessages.ts` |

---

## Module invariants

| Module | Must never… |
|---|---|
| `board.ts` | Touch the DOM, import from `renderer.ts`, call `localStorage` |
| `renderer.ts` | Mutate `Board` or any game state; import from `game.ts` |
| `bfs.ts` | Import any domain type from `types.ts` or game modules |
| `persistence.ts` | Contain rendering, UI, or game logic |
| `uiConstants.ts` | Import from game or renderer modules |
| `colors.ts` | Define UI chrome colors (those belong in `uiConstants.ts`) |
| `fileIO.ts` | Contain game or editor domain logic |
| `campaignEditor/historyManager.ts` | Import domain types from outside `campaignEditor/` |
| `mapScreenBase.ts` | Reference chapter-specific or campaign-specific data directly (use abstract methods) |
| `chapterMapUtils.ts` | Define new logic — it is a re-export shim only |
