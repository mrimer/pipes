#!/usr/bin/env node
'use strict';
// Local release pipeline — builds all publishable targets and collects
// artifacts under releases/v{VERSION}/.
//
// Usage:
//   npm run release
//
// Prerequisites:
//   - node_modules installed (npm ci)
//   - Campaign files placed in campaigns/full/ and campaigns/demo/
//   - Java + Android SDK (optional — Android builds are skipped when absent)

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT   = path.resolve(__dirname, '..');
const pkg    = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VER    = pkg.version;
const OUT    = path.join(ROOT, 'releases', `v${VER}`);
const ANDDIR = path.join(ROOT, 'android');

// ─── Terminal colours ─────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold:   '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m',
  red:   '\x1b[31m', cyan:   '\x1b[36m',
};
const log  = (s) => process.stdout.write(s + '\n');
const ok   = (s) => log(`  ${C.green}✓${C.reset}  ${s}`);
const warn = (s) => log(`  ${C.yellow}⚠${C.reset}  ${s}`);
const step = (s) => log(`\n${C.bold}${C.cyan}▶ ${s}${C.reset}`);

// ─── Step runner ──────────────────────────────────────────────────────────────
const timings = [];

function run(label, cmd, opts = {}) {
  log(`\n  ${C.bold}$ ${cmd}${C.reset}`);
  const t0 = Date.now();
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
  const ms = Date.now() - t0;
  timings.push({ label, ms });
  ok(`${label}  ${C.yellow}(${(ms / 1000).toFixed(1)}s)${C.reset}`);
}

// ─── File helpers ─────────────────────────────────────────────────────────────
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

/** Zip the contents of srcDir (not the directory itself) into destZip. */
function zipContents(srcDir, destZip) {
  fs.mkdirSync(path.dirname(destZip), { recursive: true });
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(srcDir, '*')}' -DestinationPath '${destZip}' -Force"`,
      { cwd: ROOT, stdio: 'inherit' },
    );
  } else {
    execSync(`zip -qr "${destZip}" .`, { cwd: srcDir, stdio: 'inherit' });
  }
}

// ─── Campaign pre-flight ──────────────────────────────────────────────────────
function checkCampaigns(subdir) {
  const dir   = path.join(ROOT, 'campaigns', subdir);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz'))
    : [];
  files.length === 0
    ? warn(`campaigns/${subdir}/ has no .json files — build will bundle no official campaign`)
    : ok(`campaigns/${subdir}/: ${files.length} campaign file(s) found`);
}

// ─── Android detection ────────────────────────────────────────────────────────
const gradlew = process.platform === 'win32'
  ? path.join(ANDDIR, 'gradlew.bat')
  : path.join(ANDDIR, 'gradlew');
const buildAndroid = !!(
  (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) &&
  fs.existsSync(gradlew)
);

// ─── Header ───────────────────────────────────────────────────────────────────
log(`\n${C.bold}Cool Pipes — local release pipeline${C.reset}  v${VER}`);
log('─'.repeat(52));
log(`Output dir : ${OUT}`);
log(`Android    : ${buildAndroid
  ? 'enabled'
  : 'skipped (ANDROID_HOME / ANDROID_SDK_ROOT not set, or android/ missing)'}`);

// ─── Pipeline ─────────────────────────────────────────────────────────────────
try {

  // Pre-flight —————————————————————————————————————————————————————————————————
  step('Campaign files');
  checkCampaigns('full');
  checkCampaigns('demo');

  // Quality gates ──────────────────────────────────────────────────────────────
  step('Lint');
  run('lint', 'npm run lint');

  step('Tests');
  run('tests', 'npm test');

  // Web ────────────────────────────────────────────────────────────────────────
  step('Build: web (full)');
  run('webpack:web', 'npm run build:web');
  zipContents(path.join(ROOT, 'dist'), path.join(OUT, `web-${VER}.zip`));
  ok(`→ ${path.join(OUT, `web-${VER}.zip`)}`);

  step('Build: web (demo)');
  run('webpack:web:demo', 'npm run build:web:demo');
  zipContents(path.join(ROOT, 'dist'), path.join(OUT, `web-demo-${VER}.zip`));
  ok(`→ ${path.join(OUT, `web-demo-${VER}.zip`)}`);

  // Electron ───────────────────────────────────────────────────────────────────
  step('Build: Electron (full)');
  run('tsc:electron', 'npx tsc --project electron/tsconfig.json');
  run('webpack:electron', 'npx webpack --mode production --env target=electron');
  const elOut     = path.relative(ROOT, path.join(OUT, 'electron')).replace(/\\/g, '/');
  run('electron-builder:full',
    `npx electron-builder --config.directories.output="${elOut}"`);

  step('Build: Electron (demo)');
  // tsc output is identical for demo; skip recompile
  run('webpack:electron:demo',
    'npx webpack --mode production --env target=electron --env demo=true');
  const elDemoOut = path.relative(ROOT, path.join(OUT, 'electron-demo')).replace(/\\/g, '/');
  run('electron-builder:demo',
    `npx electron-builder --config.productName="Cool Pipes Demo" --config.directories.output="${elDemoOut}"`);

  // Android ────────────────────────────────────────────────────────────────────
  if (buildAndroid) {
    const aabSrc = path.join(ANDDIR, 'app/build/outputs/bundle/release/app-release.aab');

    step('Build: Android (full)');
    run('webpack:android', 'npm run build:android');
    run('gradle:bundleRelease', `"${gradlew}" bundleRelease`, { cwd: ANDDIR });
    const aabFull = path.join(OUT, `cool-pipes-${VER}.aab`);
    copyFile(aabSrc, aabFull);
    ok(`→ ${aabFull}`);

    step('Build: Android (demo)');
    run('webpack:android:demo', 'npm run build:android:demo');
    run('gradle:bundleRelease:demo', `"${gradlew}" bundleRelease`, { cwd: ANDDIR });
    const aabDemo = path.join(OUT, `cool-pipes-demo-${VER}.aab`);
    copyFile(aabSrc, aabDemo);
    ok(`→ ${aabDemo}`);
  }

  // Summary ────────────────────────────────────────────────────────────────────
  const totalMs = timings.reduce((s, t) => s + t.ms, 0);
  log(`\n${C.bold}${'─'.repeat(52)}${C.reset}`);
  log(`${C.bold}Build summary — v${VER}${C.reset}`);
  for (const t of timings) {
    log(`  ${C.green}✓${C.reset}  ${t.label.padEnd(30)} ${(t.ms / 1000).toFixed(1)}s`);
  }
  log(`\n  Total: ${(totalMs / 1000).toFixed(1)}s`);
  log(`\n${C.green}${C.bold}All builds complete!${C.reset}  Artifacts in: ${OUT}\n`);

} catch {
  log(`\n${C.red}${C.bold}Pipeline aborted — see error above.${C.reset}\n`);
  process.exit(1);
}
