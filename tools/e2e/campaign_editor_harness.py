#!/usr/bin/env python3
"""
Runtime test harness for the Cool Pipes browser app (Playwright).

Purpose
-------
Drive the real app in a headless browser to observe canvas-render behaviour that
the Jest suite CANNOT see: jsdom's getContext('2d') returns null, so every
`if (!ctx) return` render path is skipped in unit tests. This harness loads the
real bundle, navigates to a target screen, captures console logs + page errors,
and screenshots — the only reliable way to catch blank-canvas / render-wiring
regressions (e.g. the campaign-map blank-render bug, June 2026).

GOTCHAS (learned the hard way — read before using)
---------------------------------------------------
1. The dev server (`npm run dev`) serves static files from `dist/`. If a stale
   production build exists there, `webpack serve`'s in-memory bundle is BYPASSED
   and you load the OLD bundle. => Run `npm run build` AFTER any source edit so
   `dist/` carries your change, THEN point this harness at the dev server (or
   just serve `dist/`). Verify your change shipped:
       curl -s http://localhost:8080/ | grep -oE 'main\\.[a-f0-9]+\\.js'
       curl -s http://localhost:8080/<that-file> | grep -c '<your-marker>'
2. Console output contains emoji (button labels, logs). Run with UTF-8:
       PYTHONIOENCODING=utf-8 python tools/e2e/campaign_editor_harness.py
3. App navigation is mostly canvas-rendered, but menus/editor use real DOM
   <button>s. Match them by visible text; "New Campaign" name uses window.prompt
   (register a `dialog` handler — it is NOT an in-page input). "New Player" IS an
   in-page modal (input + Create button).
4. localStorage persists players/campaigns across runs — clear it for a clean slate.

Usage
-----
    # server must be running on --url (e.g. `npm run dev` on :8080, after a build)
    PYTHONIOENCODING=utf-8 python tools/e2e/campaign_editor_harness.py \
        --url http://localhost:8080 --shot /tmp/campaign_editor.png

Programmatic reuse:
    from campaign_editor_harness import goto_campaign_editor
    with sync_playwright() as p:
        page = p.chromium.launch(headless=True).new_page()
        goto_campaign_editor(page, 'http://localhost:8080')
        # ... assert page.evaluate(...) / inspect console ...
"""
import argparse
import sys


def goto_campaign_editor(page, url, player='Tester', campaign='HarnessCamp',
                         clear_storage=True):
    """Navigate splash -> player select -> create player -> main menu ->
    Select Campaign -> New Campaign (window.prompt) -> Edit, landing on the
    campaign-map editor. `page` must already have console/dialog handlers wired
    by the caller if they want to capture them (see main())."""
    page.goto(url)
    if clear_storage:
        page.evaluate("() => { localStorage.clear(); }")
        page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(600)

    page.get_by_role('button', name='Play').click()
    page.wait_for_timeout(2600)              # title animation
    page.keyboard.press('Enter')             # dismiss title -> player select
    page.wait_for_timeout(1400)

    page.get_by_role('button', name='New Player').first.click()
    page.wait_for_timeout(800)
    page.locator('input:visible').first.fill(player)
    page.get_by_role('button', name='Create').first.click()
    page.wait_for_timeout(1200)
    page.locator('button:visible', has_text='Select').first.click()
    page.wait_for_timeout(1600)

    page.locator('button:visible', has_text='Select Campaign').first.click()
    page.wait_for_timeout(1400)
    # New Campaign name is a window.prompt -> caller's dialog handler supplies it.
    page.locator('button:visible', has_text='New Campaign').first.click()
    page.wait_for_timeout(1500)
    page.locator('button:visible', has_text='Edit').first.click()
    page.wait_for_timeout(2000)


def main():
    from playwright.sync_api import sync_playwright

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default='http://localhost:8080')
    ap.add_argument('--shot', default='/tmp/campaign_editor.png')
    ap.add_argument('--campaign-name', default='HarnessCamp')
    ap.add_argument('--keep-storage', action='store_true',
                    help='do NOT clear localStorage first')
    args = ap.parse_args()

    logs = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 900})
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        page.on('dialog', lambda d: d.accept(args.campaign_name))
        goto_campaign_editor(page, args.url, campaign=args.campaign_name,
                             clear_storage=not args.keep_storage)
        page.screenshot(path=args.shot, full_page=True)
        browser.close()

    print(f'screenshot -> {args.shot}')
    print('=== console ===')
    for line in logs:
        print(line)
    # Surface any page errors as a non-zero exit for CI use.
    if any(l.startswith('PAGEERROR') for l in logs):
        sys.exit(1)


if __name__ == '__main__':
    main()
