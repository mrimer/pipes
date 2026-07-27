---
name: run-pipes
description: Build, run, and drive the Pipes puzzle game (web build). Use when asked to start the game, take a screenshot of its UI, verify a UI/i18n/settings change actually works, or interact with the running app.
---

Pipes is a webpack web app (also ships as Electron/Steam and Capacitor/Android,
see [project_build_workflows memory] — this skill covers the **web** target
only, which is the fastest path for verifying UI changes). Drive it via the
batch Playwright driver at `.claude/skills/run-pipes/driver.mjs`: pipe it a
newline-separated command script on stdin, it runs each command against one
headless-Chromium page in order, then exits. No `chromium-cli`, no tmux —
both were unavailable in this environment, so this driver replaces them.

All paths below are relative to the repo root.

## Prerequisites

Playwright is a devDependency (`package.json`). One-time browser download per
machine (cached outside node_modules, survives `npm install`):

```bash
npx playwright install chromium
```

## Setup / Build

```bash
npm install
```

No separate build step needed — `npm run dev` compiles on the fly.

## Run (agent path)

Start the dev server in the background and wait for it to actually serve:

```bash
(npm run dev > /tmp/pipes-dev.log 2>&1 &)
timeout 60 bash -c 'until curl -sf http://localhost:8080 >/dev/null 2>&1; do sleep 1; done'
```

Then pipe a command script to the driver:

```bash
SCREENSHOT_DIR=/tmp/pipes-shots node .claude/skills/run-pipes/driver.mjs <<'EOF'
nav http://localhost:8080
wait-ms 1000
click text=Play
wait-ms 2500
press Enter
wait-ms 1000
click xy=640,450
wait-ms 1000
screenshot 01-select-player
EOF
```

Screenshots land in `SCREENSHOT_DIR` (default `C:/tmp/pipes-shots` — override
with the env var, forward slashes work fine on Windows).

### Commands

| command | what it does |
|---|---|
| `nav <url>` | `page.goto` |
| `click text=<exact text>` | click a button/link/label by **exact** text — tries `role=button` first, falls back to any element. Use this, not a substring selector (see Gotchas). |
| `click css=<selector>` | click by CSS selector |
| `click xy=<x>,<y>` | raw viewport-coordinate click — needed for the title screen's "press any key" dismiss, which has no clickable element |
| `fill css=<selector> <text>` | fill an input |
| `select css=<selector> <value>` | set a `<select>`'s value (fires `change`) |
| `press <key>` | keyboard press, e.g. `Enter` |
| `wait-for text=<exact text>` / `wait-for css=<selector>` | wait up to 15s |
| `wait-ms <ms>` | fixed delay — this app has no consistent "ready" DOM marker across screens, so timed waits are used at a few spots instead (see Gotchas) |
| `screenshot [name]` | → `SCREENSHOT_DIR/<name-or-timestamp>.png` |
| `text [css=<selector>]` | print `innerText` (body if no selector) |
| `eval <js-expression>` | `page.evaluate`, prints JSON |
| `console-errors` | print collected `console.error`/`pageerror` text |
| `quit` | close browser (implicit at end of script) |

### Verified end-to-end flow: reach Settings and change the language

This exact script was run this session and produced the screenshots below it
(German splash screen "Zum Spiel springen" / "Spielen" confirms the reload
actually re-localized):

```bash
SCREENSHOT_DIR=/tmp/pipes-shots node .claude/skills/run-pipes/driver.mjs <<'EOF'
nav http://localhost:8080
wait-ms 1000
click text=Play
wait-ms 2500
press Enter
wait-ms 1000
click xy=640,450
wait-ms 1000
click text=New Player
wait-ms 500
fill css=input[type="text"] DriverTest
click text=Create
wait-ms 1000
click text=Select
wait-ms 1000
click text=Settings
wait-ms 500
select css=select[data-locale-select] de
wait-ms 300
screenshot 04-selected-de
click text=Confirm
wait-ms 2500
screenshot 05-after-reload
text
console-errors
EOF
```

Output ended with:
```
select ok: select[data-locale-select] = de
screenshot: /tmp/pipes-shots/04-selected-de.png
click text (role=button) ok: Confirm
screenshot: /tmp/pipes-shots/05-after-reload.png
text: Zum Spiel springen
Cool Pipes
Spielen
console-errors: []
```

## Run (human path)

```bash
npm run dev:open   # opens http://localhost:8080 in your default browser
```

## Test

```bash
npm test           # jest
npx tsc --noEmit -p .   # typecheck — catches most i18n/data-shape mistakes fast
```

## Gotchas

- **Cold-load click-path is 5 screens deep.** Splash "Play" → title screen
  animates its logo for ~2.5s then needs a keypress/click past "press any
  key" (no visible button — use `press Enter` or `click xy=640,450`) →
  "Select Player" → create a player (`New Player` → fill name → `Create`) →
  `Select` on the new card → Level Select, where `Settings` finally lives.
  There is no shortcut route or URL param to skip this.
- **Every driver invocation is a fresh browser context** — no persisted
  localStorage/profile between runs (`chromium.launch()` + `newPage()`, no
  `storageState`). The player-creation steps must run in *every* script that
  needs to reach Level Select or Settings; you cannot rely on a previous
  invocation having left a player behind.
- **Substring selectors match hidden elements.** This app keeps multiple
  modals attached to the DOM simultaneously (just hidden), so
  `button:has-text("Select")` or `text=Settings` can match a *different*,
  hidden button whose text merely contains the same substring (e.g. the
  gameover modal's "Level Select" button contains "Select"). That's why
  `click text=<x>` in this driver requires an **exact** match
  (`getByRole('button', { name, exact: true })` first, exact-text DOM fallback
  second) — don't loosen it to substring matching.
- **readline's `close` event fires before async line handlers finish** when
  stdin is a piped heredoc (not a TTY) — Node emits all `line` events
  synchronously as the stream drains, then fires `close` immediately,
  without waiting for whatever async work your `line` handler kicked off
  (browser launch, navigation, etc.). The driver chains every command onto
  one promise and awaits that chain in `close` before exiting; if you edit
  the driver, keep that queuing — an unqueued rewrite silently exits with
  zero output before the first `nav` completes.
- **Locale changes reload the whole page** (see `game.ts`'s settings
  confirm handler) — this app sets DOM text imperatively at construction
  time, not reactively, so switching language is implemented as
  persist-then-`location.reload()`. After `click text=Confirm` with a new
  locale selected, wait ~2.5s (`wait-ms 2500`) before the next `screenshot`
  or `text`, or you'll capture the pre-reload page mid-navigation.

## Troubleshooting

- **Driver prints nothing and exits 0 immediately:** you edited the
  line-handling loop and broke the promise-queue chaining — see the
  `readline` gotcha above.
- **`click text=X` says `NOT_FOUND` but `X` is visible in a screenshot:**
  the visible text isn't an exact match (extra whitespace, an icon prefix
  like "▶ Play" vs `Play`) — check the real label with
  `text css=<a selector around it>` first, or use `click css=<selector>`
  instead.
- **`EADDRINUSE` on `npm run dev`:** a previous dev server is still running.
  Find it before killing broadly — on Windows this machine also runs
  Adobe Creative Cloud's own persistent `node.exe`, so don't blanket-kill
  `node.exe`. Identify the right PID first:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId,CommandLine`
  (PowerShell), then stop just that one.
