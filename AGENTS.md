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

Prefer concise progress updates instead of verbose explanations.

## Development workflow

The repository is a TypeScript/Webpack single-page application. All dev tooling lives in `node_modules`; the directory is **not** present in a fresh clone and must be installed before any tool can run.

### First step in every session

```bash
cd /path/to/pipes   # or just run from the repo root
npm install
```

- Use absolute paths for all repository file tool calls, rooted at the current session's clone path (e.g., `/tmp/workspace/mrimer/pipes`).

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
- Tests that touch `document`/DOM APIs (modal builders, keyboard events, etc.) must also have `@jest-environment jsdom`.
- Wait for `npm install` to finish before running lint/build/test commands; running them in parallel with install can fail with missing tool errors.

### Runtime canvas harness (`tools/e2e/`)

`tools/e2e/campaign_editor_harness.py` is a Playwright-based end-to-end harness that catches canvas-render bugs invisible to Jest (jsdom's `getContext('2d')` returns `null`, so every `if (!ctx) return` guard is silently skipped). It drives a real Chromium browser, navigates to the campaign-map editor, and captures console logs + a screenshot.

**Prerequisites:**
```bash
pip install playwright && python -m playwright install chromium
```

**Running the harness** (server must be running first):
```bash
npm run build                        # ensure dist/ is up to date
npx webpack serve --mode development --port 8080 &   # or npm run dev
PYTHONIOENCODING=utf-8 python tools/e2e/campaign_editor_harness.py --shot /tmp/cme.png
```

Pass = no `PAGEERROR` in console output and the screenshot shows the SOURCE + SINK tiles on the map (not a blank rectangle).

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
│
├── gameModals.ts                # Core game modals (level complete, level fail, rules)
├── recordingModals.ts           # Record/playback list modals
├── rulesModal.ts                # Rules/help modal
├── splashScreen.ts              # Caravel Games logo splash screen (shown before title intro)
├── titleScreen.ts               # COOL PIPES glyph title intro animation
├── levelSelect.ts               # Level-select screen
│
├── moveRecorder.ts              # Move encoding P/R/D strings, replayMoves()
├── autoRecording.ts             # Auto-recording dedup helper
├── resumePlayer.ts              # Save-and-resume replay driver (125 ms per-move chain)
├── playbackScreen.ts            # Transport-controls HUD for step-by-step replay
├── playerProfileScreen.ts       # Player profile management UI screen
│
├── persistence.ts               # All localStorage access — single source of truth for storage keys
├── fileIO.ts                    # Gzip+download and gzip-or-JSON file reading helpers
├── uiConstants.ts               # UI color tokens, border-radius constants, modal CSS strings
├── uiBackground.ts              # Shared dim scrolling pipe-pattern background helper for full-screen UI layers
├── graphicsSettings.ts          # In-memory cache for background and environmental graphics flags
├── colors.ts                    # Canvas rendering colors only (not UI)
├── uiHelpers.ts                 # Shared DOM-building helpers
├── i18n.ts                      # Lightweight locale registry, locale bootstrap, fallback, and string interpolation
├── i18n/
│   └── en.ts                    # English translation catalog (canonical fallback locale)
├── i18nTypes.ts                 # Shared i18n type definitions
├── modalUtils.ts                # Modal a11y helper — setupModal provides role=dialog, aria-modal, focus trap, focus restoration, Esc handling; all modal builders use this
├── commandKeyManager.ts         # Keyboard shortcut registry
├── deviceUtils.ts               # Touch/mobile detection helpers
├── audio/
│   ├── sfxManager.ts            # Sound effect playback
│   ├── musicManager.ts          # Background music: two-slot cross-fading via Web Audio, autoplay-policy handling
│   └── musicScheduler.ts        # Pure music group/track scheduler (shuffle, avoid-repeat, group selection logic)
│
├── profile/
│   ├── activeProfile.ts         # Active profile slot tracking and namespacing
│   ├── playerProfile.ts         # Profile export/import/merge logic, pure data functions
│   ├── playerProfileSlots.ts    # Multi-slot profile persistence helpers
│   └── profileIO.ts             # File I/O for profile import/export via gzip/JSON
│
├── systems/
│   ├── thermoSimulator.ts       # Temperature cost calculations for ice/snow/sandstone tiles
│   ├── cementSystem.ts          # Cement cell hardening mechanics and state tracking
│   └── constraintValidator.ts   # Sandstone pressure validation errors
│
├── visuals/
│   ├── butterflyField.ts        # Butterfly visual effect
│   ├── chapterMap.ts            # Chapter map node visual helpers
│   ├── chapterWaves.ts          # Animated waves on chapter map
│   ├── cloudShadows.ts          # Procedural cloud-shadow overlay field for level/map screens
│   ├── balloons.ts              # Rising balloon particle system (campaign completion)
│   ├── confetti.ts              # Win confetti particle system
│   ├── fireworks.ts             # Fireworks rocket+spark particle system (campaign mastery)
│   ├── fieldUtils.ts            # Unified utility helper functions
│   ├── fireflyField.ts          # Firefly visual effect
│   ├── heatWave.ts              # Heat-wave distortion overlay
│   ├── idlePulse.ts             # Idle water pulse (10 s idle → BFS-layered pulse animation)
│   ├── minimap.ts               # Minimap overlay renderer
│   ├── pipeEffects.ts           # Pipe placement/rotation visual effects
│   ├── levelTransition.ts       # Zoom/transition animations between screens
│   ├── placementEffects.ts      # Scale-pop (placement) and shrink-fade (removal) tile effects
│   ├── ringEffect.ts            # Expanding ring burst effect
│   ├── sinkVortex.ts            # Sink drain vortex animation
│   ├── starSparkle.ts           # Star award sparkle effect
│   ├── tileAnimation.ts         # General tile animation driver
│   ├── waterParticles.ts        # Flowing water particle effects
│   └── winTileEffect.ts         # Per-tile win flash
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
    ├── canvasUtils.ts           # Editor canvas helpers
    ├── gridSizePanel.ts         # Grid-size control panel
    ├── editorRenderer.ts        # Editor-specific canvas renderer
    └── types.ts                 # Editor-local types
```

Other top-level directories:
```
tests/                           # Jest test suite (TypeScript, jsdom opt-in per file)
tools/
└── e2e/
    └── campaign_editor_harness.py  # Playwright runtime harness — canvas render regression guard
```

---

## Internationalization (i18n)

User-facing strings go through `src/i18n.ts`:

```ts
import { t } from './i18n';
el.textContent = t('hud.undo');
el.textContent = t('levelSelect.stars', { count: 3 });
```

Source tables live in `src/i18n/<locale>.ts`. English (`en.ts`) is canonical and the fallback.

To add a new string:
1. Add the key + English value to `src/i18n/en.ts`.
2. Use `t('your.key')` at the call site.

To add a new locale:
1. Create `src/i18n/<locale>.ts` exporting a `TranslationTable`.
2. Register in `src/main.ts`: `registerTranslations('<locale>', table)`.
3. Add to the supported list in the `initLocale([...])` call.

Don't localize:
- `console.warn` / `console.error` (developer-facing)
- Test strings (Jest descriptions, assertions)
- Validation error keys (keep them symbolic; localize the displayed value)
- User-generated content (campaign names, level names)

Migration status: All user-facing strings are localized via `t()`. New strings must add keys to `src/i18n/en.ts`. CI guards against missing keys and warns on hardcoded `textContent`.

Bootstrap is explicit: `src/main.ts` calls `registerTranslations('en', en)` and `initLocale(['en'])` before any UI renders. Adding a locale requires updating this bootstrap.

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

### Architecture invariants

- **Validate all external data before mutation.** Per the Task 1 audit, treat `localStorage` payloads and imported files as untrusted: `playerProfile.ts` uses `hasValidPayloadShape()` before applying imported profile payloads, and `profileIO.ts` uses `assertReplayRecordShape()` before saving replay imports. New external-data entry points should follow the same shape-check-before-mutate pattern.

- **Save-data versions are explicit compatibility gates.** `PROFILE_FORMAT_VERSION = 3` in `playerProfile.ts`; `REPLAY_FILE_VERSION = 1` in `profileIO.ts`; `PlaySequenceRecord.formatVersion` is version 1 by default in `types.ts`, set in `game.ts`, validated in `persistence.ts`, and enforced again in `playbackScreen.ts`. Bump the relevant version whenever a schema change is backward-incompatible, and reject newer-than-supported data on load/import.

- **Listener teardown must mirror setup.** `Game.destroy()` sets `_destroyed`, removes the resize listener, and cancels the active render RAF; `unregisterScrollingPipeBackground(target)` must be called on screen exit to free `uiBackground.ts` bookkeeping maps; `CampaignEditor.hide()` and `destroy()` both call `_detachKeydownHandler()`. Pattern: long-lived components register listeners in `show()`/`attach()` and unregister them symmetrically in `hide()`/`detach()`/`destroy()`.

- **Board fill-state cache must be invalidated on every grid mutation.** `Board` caches `getFilledPositions()` in `_filledPositionsCache`, and any path that mutates `board.grid` must call `_invalidateFilledCache()`. Existing mutation sites include `placeInventoryTile()`, `replaceInventoryTile()`, `reclaimTile()`, `rotateTileBy()`, and `_restoreSnapshot()`; keep that list current if new mutation paths land.

- **Prefer private-by-default module visibility.** Do not export a symbol unless a cross-module caller exists. Recent cleanup demoted 24+ symbols from `export` and deleted 8 unused ones entirely; when adding new helpers, start unexported and promote them only once a second file genuinely needs the import.

### UI / accessibility notes

- **Skip links use `.sr-only-focusable`.** The class in `index.html` implements the standard visually-hidden-until-focused pattern; use it for keyboard-only shortcuts such as "Skip to game".

- **Keyboard focus uses the global `:focus-visible` outline rule.** Preserve the shared gold focus ring and the paired `:focus:not(:focus-visible)` suppression so pointer users do not see duplicate outlines.

- **All modals go through `setupModal()`.** `modalUtils.ts` owns modal accessibility plumbing (`role="dialog"`, `aria-modal`, focus trap, focus restoration, Escape handling). Do not hand-roll modal a11y behavior in individual modal builders.

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
| Modal accessibility plumbing | `modalUtils.ts` |
| Keyboard shortcuts | `commandKeyManager.ts` |
| localStorage keys | `persistence.ts` |
| Gzip download / file read | `fileIO.ts` |
| Menu/settings/profile background pattern | `uiBackground.ts` |
| Localization helper and catalogs | `i18n.ts`, `i18n/en.ts` |
| Graphics settings (background / environmental) in-memory cache | `graphicsSettings.ts` |
| Move encoding format | `moveRecorder.ts` (top-of-file JSDoc) |
| Auto-recording dedup | `autoRecording.ts` |
| Player profile schema | `profile/playerProfile.ts` |
| Active profile slot / namespacing | `profile/activeProfile.ts` |
| Profile import/export (file I/O) | `profile/profileIO.ts` |
| Sound effect playback | `audio/sfxManager.ts` |
| Background music scheduling | `audio/musicScheduler.ts` |
| Level screen transition animation | `visuals/levelTransition.ts` |
| Splash screen (Caravel Games logo) | `splashScreen.ts` |
| Title intro animation (COOL PIPES glyphs) | `titleScreen.ts` |
| Idle pulse animation | `visuals/idlePulse.ts` |
| Win confetti | `visuals/confetti.ts` |
| Balloon animation (campaign completion) | `visuals/balloons.ts` |
| Fireworks animation (campaign mastery) | `visuals/fireworks.ts` |
| Tile placement/removal effects (scale pop, dust, shrink-fade) | `visuals/placementEffects.ts` |
| Cloud shadow overlay | `visuals/cloudShadows.ts` |
| Campaign-map wheel zoom + zoom sizing clamps | `mapScreenBase.ts` → `clampCampaignZoomScale()`, `computeCampaignZoomFitMinTileSize()`, `_updateCampaignZoomFromWheel()` |
| Map sea-wave animation on chapter/campaign screens | `mapScreenBase.ts` → `_compositeFrame()` + `visuals/chapterMap.ts` → `renderChapterMapSeaTiles()` |
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
