# i18n migration status

Last audited: 2026-06-04

## Phase 0 verification

- `modal.win.returnToEditor` and `modal.gameover.returnToEditor` are wired in playtest mode via `CampaignManager.playtestLevel()`.
  - Evidence: `/tmp/workspace/mrimer/pipes/src/campaignManager.ts:852-854`
- The win subtitle key wiring matches the HTML element id.
  - Evidence: `/tmp/workspace/mrimer/pipes/src/main.ts:80` (`setText('win-modal-subtitle', 'modal.win.subtitle')`)
  - Evidence: `/tmp/workspace/mrimer/pipes/index.html:539` (`<p id="win-modal-subtitle">...`)

## Surface status

| Surface | Status | Evidence |
|---|---|---|
| i18n foundation (`i18n.ts`, `en.ts`, bootstrap) | MIGRATED | `/tmp/workspace/mrimer/pipes/src/i18n.ts`, `/tmp/workspace/mrimer/pipes/src/i18n/en.ts`, `/tmp/workspace/mrimer/pipes/src/main.ts:109-112` |
| HUD + win/lose modal baseline chrome | MIGRATED | `/tmp/workspace/mrimer/pipes/src/main.ts:69-89`, `/tmp/workspace/mrimer/pipes/src/game.ts:623-626` |
| index.html static labels | MIGRATED | Localized via `/tmp/workspace/mrimer/pipes/src/main.ts:69-77` using keys added in `/tmp/workspace/mrimer/pipes/src/i18n/en.ts` for `document.title`, skip link, sr-only app title, canvas aria-label, stats water label, and best score title. |
| Splash screen + title screen | NOT MIGRATED | Hardcoded play CTA in `/tmp/workspace/mrimer/pipes/src/splashScreen.ts:79`; title/splash text still literal-driven |
| Level select screen | NOT MIGRATED | Multiple literals in `/tmp/workspace/mrimer/pipes/src/levelSelect.ts` (e.g., lines 216, 220, 629) |
| Settings modal (`gameModals.ts`) | PARTIAL | Reset/challenge/exit/player-name paths use `t()`, but settings/import-result sections still literal-heavy (e.g., lines 323, 338, 947) |
| Rules modal | NOT MIGRATED | Literal section copy remains in `/tmp/workspace/mrimer/pipes/src/rulesModal.ts:336-428` |
| Recording modals | MIGRATED | Catalog-backed keys used throughout `/tmp/workspace/mrimer/pipes/src/recordingModals.ts` |
| Player profile screen | MIGRATED | User-facing labels route through `t()` in `/tmp/workspace/mrimer/pipes/src/playerProfileScreen.ts` |
| Validation messages (symbolic/localized consumption path) | NOT MIGRATED | Current validators/editor flow still expose literal messaging patterns; full symbolic-key flow not yet implemented |
| Campaign editor UI surface (`src/campaignEditor/*`) | NOT MIGRATED | Broad literal usage across editor files (see grep audit output) |
| Native `alert`/`confirm`/`prompt` replacement | NOT MIGRATED | Calls still present in `/tmp/workspace/mrimer/pipes/src/campaignEditor/index.ts`, `/tmp/workspace/mrimer/pipes/src/profileIO.ts`, `/tmp/workspace/mrimer/pipes/src/gameModals.ts` |
| i18n regression tooling (missing/unused key checks, hardcoded text guard) | NOT MIGRATED | No dedicated guard/test added yet |

## Grep audit snapshot

Commands run:

- `grep -rn 'textContent\s*=' src/`
- `grep -rn 'innerText\s*=' src/`
- `grep -rn 'innerHTML\s*=' src/`
- `grep -rn "setAttribute('aria-label'" src/`
- `grep -rn "setAttribute('placeholder'" src/`
- `grep -rn "setAttribute('title'" src/`
- `grep -rn 'alert(' src/`
- `grep -rn 'confirm(' src/`
- `grep -rn 'prompt(' src/`

Raw output snapshot:

- `/tmp/workspace/mrimer/pipes/.tmp_i18n_grep.txt`

Cross-reference result:

- Files with UI text-setting patterns but no `t` import are currently concentrated in:
  - `/tmp/workspace/mrimer/pipes/src/levelSelect.ts`
  - `/tmp/workspace/mrimer/pipes/src/rulesModal.ts`
  - `/tmp/workspace/mrimer/pipes/src/splashScreen.ts`
  - `/tmp/workspace/mrimer/pipes/src/mapScreenBase.ts`
  - `/tmp/workspace/mrimer/pipes/src/campaignEditor/*`
