#!/usr/bin/env node
// Batch browser driver for the Pipes web build, for agents without chromium-cli.
// Reads one command per line from stdin, runs them against a single Playwright
// page in order, then exits. Pipe a heredoc to stdin (see SKILL.md).
//
// Commands:
//   nav <url>                    goto
//   click text=<exact text>      click a button/link by EXACT text (role=button first,
//                                 falls back to any element) — avoids matching hidden
//                                 modal buttons whose text contains the same substring
//   click css=<selector>         click by CSS selector
//   click xy=<x>,<y>              click raw viewport coordinates (title-screen dismiss)
//   fill css=<selector> <text>   fill an input
//   select css=<selector> <val>  set a <select>'s value
//   press <key>                  keyboard press (e.g. Enter)
//   wait-for text=<exact text>   wait until an element with exact text exists
//   wait-for css=<selector>      wait until selector matches
//   wait-ms <ms>                 fixed delay (use sparingly — prefer wait-for)
//   screenshot [name]            → SCREENSHOT_DIR/<name-or-timestamp>.png
//   text [css=<selector>]        print innerText (body if no selector)
//   eval <js-expression>         page.evaluate, prints JSON result
//   console-errors               print collected console.error / pageerror text
//   quit                         close browser, exit

import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';

const SHOT_DIR = process.env.SCREENSHOT_DIR || 'C:/tmp/pipes-shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const errors = [];
let browser = null;
let page = null;

async function ensurePage() {
  if (page) return page;
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  return page;
}

function parseTarget(arg) {
  if (arg.startsWith('text=')) return { kind: 'text', value: arg.slice(5) };
  if (arg.startsWith('css=')) return { kind: 'css', value: arg.slice(4) };
  if (arg.startsWith('xy=')) return { kind: 'xy', value: arg.slice(3) };
  return { kind: 'css', value: arg };
}

const COMMANDS = {
  async nav(url) {
    await ensurePage();
    await page.goto(url, { waitUntil: 'load' });
    console.log('nav ok:', url);
  },

  async click(arg) {
    await ensurePage();
    const t = parseTarget(arg);
    if (t.kind === 'xy') {
      const [x, y] = t.value.split(',').map(Number);
      await page.mouse.click(x, y);
      console.log('click xy ok:', x, y);
      return;
    }
    if (t.kind === 'text') {
      const byRole = page.getByRole('button', { name: t.value, exact: true });
      if (await byRole.count() > 0) {
        await byRole.first().click();
        console.log('click text (role=button) ok:', t.value);
        return;
      }
      const clicked = await page.evaluate((text) => {
        const els = [...document.querySelectorAll('button, a, [role="button"], label')];
        const el = els.find((e) => e.textContent?.trim() === text);
        if (!el) return false;
        el.click();
        return true;
      }, t.value);
      console.log(clicked ? `click text ok: ${t.value}` : `click text NOT_FOUND: ${t.value}`);
      return;
    }
    await page.click(t.value);
    console.log('click css ok:', t.value);
  },

  async fill(arg) {
    await ensurePage();
    const sp = arg.indexOf(' ');
    const selArg = arg.slice(0, sp);
    const value = arg.slice(sp + 1);
    const t = parseTarget(selArg);
    await page.fill(t.value, value);
    console.log('fill ok:', t.value, '=', value);
  },

  async select(arg) {
    await ensurePage();
    const sp = arg.indexOf(' ');
    const selArg = arg.slice(0, sp);
    const value = arg.slice(sp + 1);
    const t = parseTarget(selArg);
    await page.selectOption(t.value, value);
    console.log('select ok:', t.value, '=', value);
  },

  async press(key) {
    await ensurePage();
    await page.keyboard.press(key);
    console.log('press ok:', key);
  },

  async 'wait-for'(arg) {
    await ensurePage();
    const t = parseTarget(arg);
    try {
      if (t.kind === 'text') {
        await page.getByText(t.value, { exact: true }).first().waitFor({ timeout: 15_000 });
      } else {
        await page.waitForSelector(t.value, { timeout: 15_000 });
      }
      console.log('wait-for ok:', arg);
    } catch {
      console.log('wait-for TIMEOUT:', arg);
    }
  },

  async 'wait-ms'(ms) {
    await new Promise((r) => setTimeout(r, Number(ms)));
    console.log('wait-ms ok:', ms);
  },

  async screenshot(name) {
    await ensurePage();
    const file = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: file });
    console.log('screenshot:', file);
  },

  async text(arg) {
    await ensurePage();
    const t = arg ? parseTarget(arg) : null;
    const out = await page.evaluate(
      (sel) => (sel ? document.querySelector(sel) : document.body)?.innerText ?? '(null)',
      t ? t.value : null,
    );
    console.log('text:', out.slice(0, 1500));
  },

  async eval(expr) {
    await ensurePage();
    try {
      console.log('eval:', JSON.stringify(await page.evaluate(expr)));
    } catch (e) {
      console.log('eval ERROR:', e.message);
    }
  },

  async 'console-errors'() {
    console.log('console-errors:', JSON.stringify(errors));
  },

  async quit() {
    if (browser) await browser.close().catch(() => {});
    browser = null;
    page = null;
  },
};

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let exitCode = 0;

// readline's 'close' fires as soon as piped stdin is exhausted, which happens
// synchronously — it does NOT wait for our async 'line' handlers (browser
// launch, navigation, etc.) to finish. Chain every command onto one promise
// and await that chain in 'close', or the process exits mid-navigation with
// zero output.
let queue = Promise.resolve();

async function runLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) return;
  const sp = line.indexOf(' ');
  const cmd = sp === -1 ? line : line.slice(0, sp);
  const rest = sp === -1 ? '' : line.slice(sp + 1);
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown command:', cmd); return; }
  try {
    await fn(rest);
  } catch (e) {
    console.log(`${cmd} ERROR:`, e.message);
    exitCode = 1;
  }
}

rl.on('line', (rawLine) => {
  queue = queue.then(() => runLine(rawLine));
});

rl.on('close', async () => {
  await queue;
  await COMMANDS.quit();
  process.exit(exitCode);
});
