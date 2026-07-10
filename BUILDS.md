# Build Modes

This document describes every build configuration supported by the project, how to run them locally, and how the CI/CD pipeline produces release artifacts.

---

## Quick reference

| npm script | Target | Demo | Dev controls | Output |
|---|---|---|---|---|
| `npm run dev` | web | no | **yes** | webpack-dev-server :8080 |
| `npm run dev:electron` | electron | no | **yes** | live Electron window |
| `npm run build:web` | web | no | no | `dist/` |
| `npm run build:web:demo` | web | **yes** | no | `dist/` |
| `npm run build:electron` | electron | no | no | `release/` |
| `npm run build:electron:demo` | electron | **yes** | no | `release/` |
| `npm run build:android` | android | no | no | synced to `android/` |
| `npm run build:android:demo` | android | **yes** | no | synced to `android/` |

`npm run build` is an alias for `npm run build:web`.

---

## The three build axes

Every build is the product of three independent flags:

### 1. `BUILD_TARGET` — platform

| Value | Context | How the renderer loads |
|---|---|---|
| `web` | Browser, GitHub Pages | HTTP server |
| `electron` | Electron desktop app | `file://` via `win.loadFile()` |
| `android` | Capacitor WebView | `file://` via Capacitor |

The webpack `target` field is set to `electron-renderer` for Electron and `web` for everything else. The `publicPath` is always `./` for production builds and `/` for the dev server.

### 2. `IS_DEMO` — content tier

When `true`, the game should gate paid/unreleased content. Wire this flag into content-gating logic anywhere in the source:

```ts
if (!IS_DEMO) {
  // unlock all campaigns, advanced features, etc.
}
```

Dead branches are eliminated by the production minifier, so demo builds genuinely cannot contain gated code.

### 3. `DEV_CONTROLS` — developer mode

When `true`, enables debug overlays, cheat shortcuts, verbose logging, or any other developer-only aid. This flag is only set by the `dev` and `dev:electron` scripts. **Never ship a build with `DEV_CONTROLS = true`.**

```ts
if (DEV_CONTROLS) {
  showDebugOverlay();
}
```

---

## TypeScript types

These constants are declared as globals in [src/buildConfig.d.ts](src/buildConfig.d.ts). TypeScript knows their exact types (`'web' | 'electron' | 'android'`, `boolean`, `boolean`), so branches on them are type-checked and narrowed correctly.

---

## Running builds locally

### Prerequisites

```bash
npm install          # installs all devDependencies including electron and electron-builder
```

### Web (browser / GitHub Pages)

```bash
npm run dev           # dev server with hot-reload and dev controls
npm run build:web     # production bundle → dist/
```

Open `dist/index.html` directly in a browser after a production build.

### Electron (desktop / Steam)

```bash
# Dev: webpack watch + live Electron window (both start simultaneously)
npm run dev:electron

# Production: compiles main process, bundles renderer, packages with electron-builder
npm run build:electron        # full game → release/
npm run build:electron:demo   # demo build → release/
```

The packaged output lands in `release/`:
- Windows: NSIS installer (`.exe`)
- macOS: DMG (`.dmg`)
- Linux: AppImage (`.AppImage`)

**Electron version:** The `electron` devDependency is pinned to `^33.0.0`. Update it to the current [LTS release](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) before shipping.

**Steam integration:** Install `greenworks` (Steamworks SDK wrapper) and expose Steam API calls via IPC from `electron/preload.ts`. See the comments in [electron/preload.ts](electron/preload.ts) for the pattern.

### Android / Google Play (Capacitor)

> Capacitor is not installed yet. Run the one-time setup below before using the Android scripts.

```bash
# One-time Capacitor setup
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Cool Pipes" "com.pipes.game" --web-dir dist
npx cap add android

# Then build normally
npm run build:android       # production WebView bundle, then cap sync
npm run build:android:demo  # demo build
```

After `cap sync`, open `android/` in Android Studio to run on a device/emulator or produce a signed APK/AAB for the Play Store.

**Storage note:** `localStorage` works in the Capacitor WebView and requires no code changes. If you later need `@capacitor/preferences` (OS-managed store), migrate `persistence.ts` to use `getStorage()` from [src/platform/storage.ts](src/platform/storage.ts) and fill in the `AndroidStorage` stub.

---

## How the constants are injected

`webpack.config.js` exports a factory function. When you run any `npm run build:*` or `npm run dev*` script, webpack reads the `--env` flags from the script, passes them to the factory, and emits the bundle with these values baked in via `DefinePlugin`:

```js
new webpack.DefinePlugin({
  BUILD_TARGET:  JSON.stringify(target),    // e.g. '"electron"'
  IS_DEMO:       JSON.stringify(isDemo),    // e.g. 'true'
  DEV_CONTROLS:  JSON.stringify(devControls), // e.g. 'false'
})
```

The bundler replaces every reference to `BUILD_TARGET`, `IS_DEMO`, and `DEV_CONTROLS` with the literal value, and dead branches (`if (false) { ... }`) are removed by the minifier.

---

## Platform storage abstraction

[src/platform/storage.ts](src/platform/storage.ts) provides a `PlatformStorage` interface and a `getStorage()` factory that returns the right implementation for the current `BUILD_TARGET`. All three implementations currently delegate to `localStorage`, which works everywhere. The file contains step-by-step comments for wiring in `electron-store` or `@capacitor/preferences` when native storage is needed.

---

## CI/CD pipelines

### GitHub Pages (continuous deploy)

`.github/workflows/deploy.yml` runs on every push to `main`:

1. Lint → test → `npm run build:web` → deploy to GitHub Pages

### Release builds (on version tag)

`.github/workflows/release-builds.yml` triggers on `v*.*.*` tags (and manually via `workflow_dispatch`):

| Job | OS | Script |
|---|---|---|
| web | ubuntu | `build:web` |
| web-demo | ubuntu | `build:web:demo` |
| electron-win | windows | `build:electron` |
| electron-win-demo | windows | `build:electron:demo` |

Each job uploads its output as a GitHub Actions artifact (30-day retention). Download and distribute manually to Steam / Google Play.

To tag a release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

---

## Directory layout for build outputs

```
pipes/
├── dist/           ← web renderer bundle (all web/android builds)
├── electron-dist/  ← compiled electron main + preload (gitignored)
├── release/        ← electron-builder packaged app (gitignored)
└── android/        ← Capacitor Android project (add to .gitignore or commit)
```

`electron-dist/` and `release/` are gitignored. `dist/` is also gitignored (GitHub Pages deploys from the Actions artifact, not the working tree).
