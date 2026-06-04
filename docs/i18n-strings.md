# i18n string inventory

This inventory was gathered before the initial i18n migration using the requested grep patterns plus targeted review of the highest-string-density modules in `src/`.

## Summary

- Static UI labels: heavy in `src/gameModals.ts`, `src/recordingModals.ts`, `src/playerProfileScreen.ts`, `src/rulesModal.ts`, and `src/campaignEditor/`
- Status messages: heavy in `src/gameModals.ts`, `src/campaignEditor/validationMessages.ts`, `src/profileIO.ts`, and `src/campaignEditor/*Validator*.ts`
- Dynamic strings: heavy in `src/gameModals.ts`, `src/recordingModals.ts`, `src/playerProfileScreen.ts`, `src/playbackScreen.ts`, `src/tooltipManager.ts`, and `src/levelSelect.ts`
- A11y labels: currently concentrated in `src/gameModals.ts` and `src/playerProfileScreen.ts`
- Modal copy: concentrated in `src/gameModals.ts`, `src/recordingModals.ts`, `src/rulesModal.ts`, and `src/campaignEditor/editorDialogs.ts`
- Editor strings: largest surface is `src/campaignEditor/`

## Category inventory

### Static UI labels

| Location | English source string |
|---|---|
| `src/gameModals.ts:101` | `⚠️ Reset Progress?` |
| `src/gameModals.ts:115` | `Cancel` |
| `src/gameModals.ts:121` | `Reset` |
| `src/gameModals.ts:183` | `Start Level` |
| `src/gameModals.ts:221` | `Play Level` |
| `src/gameModals.ts:227` | `Skip Level` |
| `src/gameModals.ts:260` | `Exit Level` |
| `src/gameModals.ts:265` | `Continue` |
| `src/gameModals.ts:626` | `Campaign Mastered!` |
| `src/gameModals.ts:700` | `✏️ Edit Player Name` |
| `src/gameModals.ts:783` | `👤 New Player` |
| `src/recordingModals.ts:55` | `📼 Record Play Sequence` |
| `src/recordingModals.ts:109` | `Record` |
| `src/recordingModals.ts:118` | `Cancel` |
| `src/recordingModals.ts:245` | `▶️ Saved Recordings` |
| `src/playerProfileScreen.ts:140` | `👤 Select Player` |
| `src/playerProfileScreen.ts:203` | `Empty` |
| `src/playerProfileScreen.ts:209` | `➕ New Player` |
| `src/playerProfileScreen.ts:215` | `📥 Import` |
| `src/playerProfileScreen.ts:302` | `▶ Select` |
| `src/playerProfileScreen.ts:307` | `📤 Export` |
| `src/playerProfileScreen.ts:311` | `📤 Export + Recordings` |
| `src/playerProfileScreen.ts:315` | `📥 Import Merge` |
| `src/playerProfileScreen.ts:325` | `🗑 Delete` |
| `src/rulesModal.ts:336` | `📋 Game Rules` |
| `src/rulesModal.ts:376` | `Controls` |
| `src/rulesModal.ts:405` | `Tile Legend` |

### Status messages

| Location | English source string |
|---|---|
| `src/campaignEditor/validationMessages.ts:1` | `No Source tile found.` |
| `src/campaignEditor/validationMessages.ts:2` | `No Sink tile found.` |
| `src/campaignEditor/validationMessages.ts:3` | `Only one source tile is allowed.` |
| `src/campaignEditor/validationMessages.ts:4` | `Multiple Source tiles found.` |
| `src/campaignEditor/validationMessages.ts:5` | `Multiple Sink tiles found.` |
| `src/gameModals.ts:111` | `This will remove all level completion data. Are you sure?` |
| `src/gameModals.ts:218` | `This is an optional challenge level. You may skip it without affecting your progress.` |
| `src/gameModals.ts:257` | `Your progress on this level will be lost.` |
| `src/gameModals.ts:636` | `All areas complete!` |
| `src/gameModals.ts:660` | `This level starts in a losing position and cannot be played.` |
| `src/recordingModals.ts:159` | `Delete this recording by {playerName}? This cannot be undone.` |
| `src/recordingModals.ts:319` | `No recordings saved for this level.` |
| `src/playerProfileScreen.ts:378` | `No campaign progress` |

### Dynamic strings

| Location | English source string |
|---|---|
| `src/gameModals.ts:146` | `{chaptersCompleted}/{chaptersTotal} chapters` |
| `src/gameModals.ts:148` | `{levelsCompleted}/{levelsTotal} levels` |
| `src/gameModals.ts:150` | `{challengesCompleted}/{challengesTotal} challenges` |
| `src/gameModals.ts:153` | `⭐ {starsCollected}/{starsTotal}` |
| `src/gameModals.ts:156` | `💧 {waterScore}` |
| `src/gameModals.ts:934` | `Player: {importedPlayerName}` |
| `src/recordingModals.ts:67-70` | `Outcome`, `Moves`, `Player`, `Time` summary rows |
| `src/recordingModals.ts:433` | `Campaign: {campaignName}\n{chapterLabel} · {levelLabel}` |
| `src/playerProfileScreen.ts:277` | `Last played: {date}` |
| `src/playerProfileScreen.ts:349` | `📋 {campaign.name}` |
| `src/playerProfileScreen.ts:356` | `✅ {levelsCompleted} levels` |
| `src/playerProfileScreen.ts:361` | `📖 {chaptersCompleted} chapters` |
| `src/playerProfileScreen.ts:366` | `⭐ {starsCollected} stars` |
| `src/playerProfileScreen.ts:371` | `💧 {waterTotal} water` |
| `src/playbackScreen.ts:243` | `{seconds}s` |
| `src/playbackScreen.ts:404` | `{currentStep} / {stepLimit}` |
| `src/tooltipManager.ts` | multiple computed template strings for tile/tooltips |

### Accessibility labels and related attributes

| Location | English source string |
|---|---|
| `src/gameModals.ts:437` | `Cancel key reassignment for {command}` |
| `src/gameModals.ts:438` | `Reassign key for {command}` |
| `src/gameModals.ts:461` | `Reassign {command}` |
| `src/playerProfileScreen.ts:255` | `Edit player name` |
| `src/playerProfileScreen.ts:256` | `Edit name` |

### Modal copy

| Location | English source string |
|---|---|
| `src/gameModals.ts` | reset progress, challenge, exit, settings, campaign mastered, unplayable level, player naming, import result |
| `src/recordingModals.ts` | record dialog, delete dialog, recordings list, recording import success |
| `src/rulesModal.ts` | rules/help modal body, controls table, legend table |
| `src/campaignEditor/editorDialogs.ts` | import/overwrite/version and unsaved-changes dialogs |

### Campaign editor surface

The editor remains the largest untranslated surface and should be handled in later passes.

High-density files:

- `src/campaignEditor/index.ts`
- `src/campaignEditor/chapterEditorUI.ts`
- `src/campaignEditor/tileParamsPanel.ts`
- `src/campaignEditor/levelMetadataPanel.ts`
- `src/campaignEditor/editorDialogs.ts`
- `src/campaignEditor/dataValidationDialog.ts`
- `src/campaignEditor/gridSizePanel.ts`
- `src/campaignEditor/connectionsWidget.ts`
- `src/campaignEditor/validationMessages.ts`

Representative editor strings:

| Location | English source string |
|---|---|
| `src/campaignEditor/validationMessages.ts:1-5` | validation error strings |
| `src/campaignEditor/index.ts` | timed status messages and toolbar labels |
| `src/campaignEditor/editorDialogs.ts` | import/overwrite/version dialogs |
| `src/campaignEditor/levelMetadataPanel.ts` | field labels and button text |
| `src/campaignEditor/tileParamsPanel.ts` | tile configuration labels |

## Proof-of-concept migration scope in this task

This task migrates a small foundation subset rather than the entire app:

- `src/i18n.ts` lightweight helper
- `src/i18nCatalog.ts` English key catalog
- `src/campaignEditor/validationMessages.ts`
- `src/recordingModals.ts`
- `src/playerProfileScreen.ts`
- selected modal strings in `src/gameModals.ts`
