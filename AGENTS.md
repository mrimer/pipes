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
├── types.ts                     # All shared TypeScript types and interfaces, incl. LocalizedText
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
├── mapUtils.ts                  # Shared BFS helpers: computeMapReachable, findMapTile, tileDefConnections
├── chapterMapUtils.ts           # Re-exports mapUtils for backward compat (do not add new logic here)
├── bfs.ts                       # Generic BFS: bfs(start, getNeighbors) and bfsWithDepth
│
├── moveRecorder.ts              # Move encoding P/R/D strings, replayMoves()
├── autoRecording.ts             # Auto-recording dedup helper
├── resumePlayer.ts              # Save-and-resume replay driver (125 ms per-move chain)
│
├── bundledCampaigns.ts          # Syncs bundled official campaign(s) from BUNDLED_CAMPAIGNS into localStorage at startup
├── persistence.ts               # All localStorage access — single source of truth for storage keys
├── campaignLocalization.ts      # resolveLocalizedText/writeLocalizedText/etc. — localization for user-authored campaign text (separate from src/i18n.ts)
├── fileIO.ts                    # Gzip+download, plain-JSON download, and gzip-or-JSON file reading helpers
├── uiConstants.ts               # UI color tokens, border-radius constants, modal CSS strings
├── uiBackground.ts              # Shared dim scrolling pipe-pattern background helper for full-screen UI layers
├── graphicsSettings.ts          # In-memory cache for background and environmental graphics flags
├── colors.ts                    # Canvas rendering colors only (not UI)
├── uiHelpers.ts                 # Shared DOM-building helpers
├── svgUtils.ts                  # SVG element creation utilities
├── i18n.ts                      # Lightweight locale registry, locale bootstrap, fallback, string interpolation, and SUPPORTED_LOCALES
├── i18n/
│   ├── en.ts                    # English translation catalog (canonical fallback locale)
│   ├── es.ts                    # Spanish translation catalog (draft)
│   ├── fr.ts                    # French translation catalog (draft)
│   ├── de.ts                    # German translation catalog (draft)
│   └── pl.ts                    # Polish translation catalog (draft)
├── i18nTypes.ts                 # Shared i18n type definitions
├── commandKeyManager.ts         # Keyboard shortcut registry
├── deviceUtils.ts               # Touch/mobile detection helpers
│
├── screens/
│   ├── titleScreen.ts           # COOL PIPES glyph title intro animation
│   ├── splashScreen.ts          # Caravel Games logo splash screen (shown before title intro)
│   ├── levelSelect.ts           # Level-select screen
│   ├── playbackScreen.ts        # Transport-controls HUD for step-by-step replay
│   ├── playerProfileScreen.ts   # Player profile management UI screen
│   ├── mapScreenBase.ts         # Abstract base: canvas + anim loop + BFS fill shared by both map screens
│   ├── chapterMapScreen.ts      # Chapter map screen (thin wrapper over MapScreenBase)
│   └── campaignMapScreen.ts     # Campaign map screen (thin wrapper over MapScreenBase)
│
├── modals/
│   ├── modalUtils.ts            # Modal a11y helper — setupModal provides role=dialog, aria-modal, focus trap, focus restoration, Esc handling; all modal builders use this
│   ├── gameModals.ts            # Core game modals (level complete, level fail, settings, etc.)
│   ├── recordingModals.ts       # Record/playback list modals
│   ├── rulesModal.ts            # Rules/help modal
│   └── creditsModal.ts          # Credits overlay
│
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
│   ├── constraintValidator.ts   # Sandstone pressure validation errors
│   ├── gameEventBus.ts          # Typed pub/sub event bus (levelStarted, levelWon, levelFailed)
│   └── achievementSystem.ts     # Subscribes to game events, evaluates predicates, shows toast, calls adapter
│
├── achievements/
│   ├── definitions.ts           # Static AchievementDef[] list; contains OFFICIAL_CAMPAIGN_ID TODO
│   └── stats.ts                 # Per-profile cumulative stats (levels won, stars, etc.) + localStorage helpers
│
├── platform/
│   ├── storage.ts               # PlatformStorage interface and BUILD_TARGET-selected implementation
│   ├── achievementAdapter.ts    # AchievementAdapter interface; Local / Steam / GooglePlay implementations
│   └── cloudSave.ts             # triggerCloudSave() — no-op outside electron, else calls window.electronAPI.triggerCloudSave()
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
│   ├── placementEffects.ts      # Scale-pop (placement), shrink-fade (removal), shake (invalid), and undo/redo flash tile effects
│   ├── ringEffect.ts            # Expanding ring burst effect
│   ├── sinkVortex.ts            # Sink drain vortex animation
│   ├── starSparkle.ts           # Star award sparkle effect
│   ├── tileAnimation.ts         # General tile animation driver
│   ├── waterParticles.ts        # Flowing water particle effects
│   └── winTileEffect.ts         # Per-tile win flash
│
└── campaignEditor/
    ├── index.ts                 # Editor orchestrator — wires all editor sub-modules
    ├── campaignService.ts       # Campaign/chapter/level CRUD, import/export, text-pack export/import (exportTextPack/parseTextPack/mergeTextPack), findLevelLocation
    ├── mapEditorBase.ts         # Abstract base for both map editors: history, grid ops, undo/redo
    ├── chapterMapEditor.ts      # Chapter map editor (extends MapEditorBase)
    ├── campaignMapEditor.ts     # Campaign map editor (extends MapEditorBase)
    ├── chapterEditorUI.ts       # Chapter map editor UI panel
    ├── chapterMapInput.ts       # Mouse/keyboard input for chapter map editor
    ├── editorInputHandler.ts    # Input handling for level editor
    ├── levelEditorState.ts      # Level editor mutable state
    ├── tileParamsPanel.ts       # Tile-parameter side panel UI
    ├── levelMetadataPanel.ts    # Level metadata form UI
    ├── localizedTextInput.ts    # buildLocalizedTextInput/buildLocalizedTextarea — shared locale-aware field builders for name/note/hints
    ├── editorDialogs.ts         # Editor modal dialogs, incl. Export Texts and text-pack import confirmation
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

Source tables live in `src/i18n/<locale>.ts`. English (`en.ts`) is canonical and the fallback. Locales currently shipped: `en`, `es`, `fr`, `de`, `pl` (the `de`/`es`/`fr`/`pl` catalogs are a draft machine-assisted translation pass, not yet native-reviewed).

To add a new string:
1. Add the key + English value to `src/i18n/en.ts`.
2. Use `t('your.key')` at the call site.

To add a new locale:
1. Create `src/i18n/<locale>.ts` exporting a `TranslationTable`.
2. Register in `src/main.ts`: `registerTranslations('<locale>', table)`.
3. Add an entry to `SUPPORTED_LOCALES` in `src/i18n.ts` (drives both `initLocale([...])` and the settings language picker).

Don't localize via `t()`:
- `console.warn` / `console.error` (developer-facing)
- Test strings (Jest descriptions, assertions)
- Validation error keys (keep them symbolic; localize the displayed value)
- Campaign/chapter/level name, note, and hints — these are user-generated content with their **own**, separate localization mechanism; see "Campaign-content localization" below. Never route them through `t()`.

Migration status: All static, app-authored user-facing strings are localized via `t()`. New strings must add keys to `src/i18n/en.ts`. CI guards against missing keys and warns on hardcoded `textContent`. Whenever a new key is added to `en.ts`, add a machine-translated entry for it to `es.ts`/`fr.ts`/`de.ts`/`pl.ts` too, at the same relative position — don't leave the other locale catalogs behind.

Bootstrap is explicit: `src/main.ts` registers all five translation tables and calls `initLocale(SUPPORTED_LOCALES.map((l) => l.code))` before any UI renders. Adding a locale requires updating this bootstrap plus `SUPPORTED_LOCALES`.

**Language selector:** The settings modal (`src/modals/gameModals.ts`) exposes a language picker driven by `SUPPORTED_LOCALES`; the chosen locale is persisted via `saveLocale()`/`loadLocale()` in `persistence.ts`.

---

## Campaign-content localization

A **second, independent** localization mechanism — separate from the `t()` system above — covers user-authored campaign text: `CampaignDef.name`, `ChapterDef.name`, `LevelDef.name`/`.note`/`.hints[]`. These are typed `string | LocalizedText` (`LocalizedText = Partial<Record<string, string>>`, defined in `src/types.ts`) rather than routed through translation-table keys, because their content is arbitrary player-authored data, not a fixed set of app strings.

- A bare `string` value is locale-agnostic and displays to every player regardless of locale — this is the shape every campaign has by default and requires no migration.
- A field only becomes a `{ locale: text, ... }` object once a second language is actually authored for it.
- `src/campaignLocalization.ts` is the single choke point for reading/writing these fields:
  - `resolveLocalizedText(value, locale = getLocale())` — display resolution: current locale → `'en'` → first non-empty value found → `''`.
  - `writeLocalizedText(current, locale, newValue)` — the "tag with the currently-authoring language" write rule; promotes a bare string to an object the first time a non-`'en'` locale is written, preserving the original text under `'en'`.
  - `rawLocalizedTextSlice(value, locale)` — the untranslated-vs-translated editor view: the exact text for one locale, no fallback (used so editor inputs show blank, not fallback text, for an untranslated locale).
  - `isLocalizedTextShape` / `collectLocalesPresent` — import-time shape validation and multi-language detection, respectively.
- **Editor UI:** `src/campaignEditor/localizedTextInput.ts` (`buildLocalizedTextInput`/`buildLocalizedTextarea`) is the shared builder for every editable instance of these fields (campaign name, chapter name, level name/note/hints in `campaignEditor/index.ts` and `levelMetadataPanel.ts`). The authoring language is always the app's current locale — there is no separate editor-only language selector.
- **Export Texts:** a lighter, locale-scoped export/import path alongside full campaign export/import, for translating a campaign without full-content access. `CampaignService.exportTextPack`/`parseTextPack`/`mergeTextPack` (`campaignEditor/campaignService.ts`) produce/consume a `pipes-campaign-text-pack` file (plain JSON, never gzip — meant to be hand-edited) keyed by `CampaignDef.guid` (a stable cross-install UUID, distinct from the local-storage-key `id`, generated via `generateGuid()` and backfilled lazily on first export). Merges are additive-only by default (never overwrite existing translations) with an explicit opt-in overwrite toggle in the confirmation dialog.

---

## Architecture decisions

**`board.ts` is pure data.** No DOM, no canvas, no `renderer` imports. All mutations return `MoveResult` (success flag + metadata). Tests can exercise board logic without a browser.

**`renderer.ts` is pure canvas.** Never mutates board state or game state. Reads what it needs as arguments; writes only to a `CanvasRenderingContext2D`.

**`game.ts` is the orchestrator.** It wires together sub-managers but delegates all domain logic. Adding a new game feature means either adding a manager or extending an existing one — not growing `game.ts`.

**`mapScreenBase.ts` / `mapEditorBase.ts` avoid code duplication.** Chapter and campaign variants of each screen are thin wrappers; shared canvas setup, animation loop, BFS water fill, click handling, and history management live in the base.

**Achievement system uses event bus + platform adapter.** `src/systems/gameEventBus.ts` is a module-level pub/sub for typed `GameEvent` values (`levelStarted`, `levelWon`, `levelFailed`). `game.ts` dispatches events at the three key moments; `AchievementSystem` subscribes and evaluates the static `AchievementDef[]` predicates in `achievements/definitions.ts`. Platform unlock is delegated to an `AchievementAdapter` (selected by `BUILD_TARGET`) that wraps Steam (`steamworks.js`), Google Play (`@capawesome-team/capacitor-google-play-games-services`), or a no-op local stub. This keeps achievement logic fully decoupled from the existing callback chains — adding a new achievement means adding a predicate to `definitions.ts`, not modifying `game.ts`.

**`persistence.ts` is the primary localStorage gateway.** All storage keys for gameplay, campaign progress, and player settings are constants defined there. Exception: self-contained subsystems that own their own data (e.g. `achievements/stats.ts`) may define their own helpers, but must follow the same `pipes_<slot>…` key-naming convention and must not overlap with keys in `persistence.ts`.

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
| Modal accessibility plumbing | `modals/modalUtils.ts` |
| Keyboard shortcuts | `commandKeyManager.ts` |
| localStorage keys | `persistence.ts` |
| Gzip download / file read | `fileIO.ts` |
| Menu/settings/profile background pattern | `uiBackground.ts` |
| Localization helper and catalogs (app-chrome strings) | `i18n.ts`, `i18n/en.ts` |
| Campaign-content localization (name/note/hints) | `campaignLocalization.ts` → `resolveLocalizedText()`/`writeLocalizedText()` |
| Localized editor input builders | `campaignEditor/localizedTextInput.ts` |
| Text-pack (translation-only) export/import | `campaignEditor/campaignService.ts` → `exportTextPack()`/`parseTextPack()`/`mergeTextPack()` |
| Graphics settings (background / environmental) in-memory cache | `graphicsSettings.ts` |
| Move encoding format | `moveRecorder.ts` (top-of-file JSDoc) |
| Auto-recording dedup | `autoRecording.ts` |
| Player profile schema | `profile/playerProfile.ts` |
| Active profile slot / namespacing | `profile/activeProfile.ts` |
| Profile import/export (file I/O) | `profile/profileIO.ts` |
| Sound effect playback | `audio/sfxManager.ts` |
| Background music scheduling | `audio/musicScheduler.ts` |
| Level screen transition animation | `visuals/levelTransition.ts` |
| Splash screen (Caravel Games logo) | `screens/splashScreen.ts` |
| Title intro animation (COOL PIPES glyphs) | `screens/titleScreen.ts` |
| Idle pulse animation | `visuals/idlePulse.ts` |
| Win confetti | `visuals/confetti.ts` |
| Balloon animation (campaign completion) | `visuals/balloons.ts` |
| Fireworks animation (campaign mastery) | `visuals/fireworks.ts` |
| Tile placement/removal effects (scale pop, dust, shrink-fade) | `visuals/placementEffects.ts` |
| Cloud shadow overlay | `visuals/cloudShadows.ts` |
| Campaign-map wheel zoom + zoom sizing clamps | `screens/mapScreenBase.ts` → `clampCampaignZoomScale()`, `computeCampaignZoomFitMinTileSize()`, `_updateCampaignZoomFromWheel()` |
| Map sea-wave animation on chapter/campaign screens | `screens/mapScreenBase.ts` → `_compositeFrame()` + `visuals/chapterMap.ts` → `renderChapterMapSeaTiles()` |
| Campaign CRUD | `campaignEditor/campaignService.ts` |
| Editor undo/redo | `campaignEditor/historyManager.ts` + `mapEditorBase.ts` |
| Validation error messages | `campaignEditor/validationMessages.ts` |
| Game event pub/sub | `systems/gameEventBus.ts` |
| Achievement predicates and IDs | `achievements/definitions.ts` |
| Achievement stats + per-profile persistence | `achievements/stats.ts` |
| Platform achievement unlock (Steam / Google Play) | `platform/achievementAdapter.ts` |
| Steam Cloud save trigger (renderer side) | `platform/cloudSave.ts` → `triggerCloudSave()` |
| Steam Cloud save read/write (main process) | `electron/main.ts` → `readSaveFile()` / `writeSaveFile()`; IPC in `electron/preload.ts` → `collectSaveData()` |
| Language selector UI | `modals/gameModals.ts`; locale list in `i18n.ts` → `SUPPORTED_LOCALES` |

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
| `screens/mapScreenBase.ts` | Reference chapter-specific or campaign-specific data directly (use abstract methods) |
| `chapterMapUtils.ts` | Define new logic — it is a re-export shim only |
| `systems/gameEventBus.ts` | Import from `game.ts`, `campaignManager.ts`, or any domain module — it must remain a pure pub/sub primitive |
| `platform/achievementAdapter.ts` | Contain achievement predicates or stats logic — adapters only call the platform SDK |
