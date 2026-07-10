/**
 * Compile-time build constants injected by webpack's DefinePlugin.
 *
 * These are replaced with literal values at bundle time so that unreachable
 * branches (e.g. `if (DEV_CONTROLS)` in a non-dev build) are eliminated by
 * the minifier. Never read them at module-load time in ways that prevent
 * tree-shaking (e.g. storing in a mutable variable before branching).
 *
 * See BUILDS.md for the full build-mode matrix and npm scripts.
 *
 * BUILD_TARGET  — platform context for the current build
 *   'web'       → browser / GitHub Pages / Capacitor WebView
 *   'electron'  → Electron desktop renderer
 *   'android'   → Capacitor Android app WebView
 *
 * IS_DEMO       — true in demo builds; gates paid / unreleased content
 *
 * DEV_CONTROLS  — true in personal dev builds only; enables debug overlays,
 *                 cheat shortcuts, and verbose logging — never set in any
 *                 public-facing build
 */
declare const BUILD_TARGET: 'web' | 'electron' | 'android';
declare const IS_DEMO: boolean;
declare const DEV_CONTROLS: boolean;
declare const BUNDLED_CAMPAIGNS: readonly (import('./types').CampaignDef)[];
