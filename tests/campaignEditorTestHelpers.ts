/**
 * Shared CampaignEditor test fixtures used across the
 * tests/campaignEditor/*.test.ts split files (split out of
 * campaignEditor.test.ts in the campaignEditor.test.ts hotspot sweep).
 * Each split file still registers its own `beforeAll(campaignEditorTestBeforeAll)`
 * / `afterAll(campaignEditorTestAfterAll)` -- Jest lifecycle hooks are
 * per-file and can't be shared directly.
 */

import type { CampaignDef, LevelDef } from '../src/types';
import { CampaignEditor } from '../src/campaignEditor';
import { saveImportedCampaigns } from '../src/persistence';

let originalInnerWidth: PropertyDescriptor | undefined;
let originalInnerHeight: PropertyDescriptor | undefined;

/** Keep TILE_SIZE at 64 for all tests by simulating a small viewport. */
export function campaignEditorTestBeforeAll(): void {
  originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  Object.defineProperty(window, 'innerWidth',  { value: 0, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
}

export function campaignEditorTestAfterAll(): void {
  if (originalInnerWidth) {
    Object.defineProperty(window, 'innerWidth', originalInnerWidth);
  }
  if (originalInnerHeight) {
    Object.defineProperty(window, 'innerHeight', originalInnerHeight);
  }
}

/** Create a minimal CampaignEditor for DOM testing. */
export function makeEditor(userCampaigns: CampaignDef[] = []): CampaignEditor {
  saveImportedCampaigns(userCampaigns);
  const noop = () => {};
  const noopLevel = (_l: LevelDef) => {};
  const noopCampaign = (_c: CampaignDef) => {};
  return new CampaignEditor(noop, noopLevel, noopCampaign);
}

/**
 * Get the text of the first button in the campaign row whose info section
 * contains a campaign with the given name.
 * Note: JSDOM normalizes CSS hex colors to rgb(), so we can't use style attribute selectors.
 */
export function getFirstButtonTextForCampaign(name: string): string | null {
  const nameDivs = Array.from(document.querySelectorAll('div'));
  for (const div of nameDivs) {
    // Find name divs that contain exactly the campaign name
    if (div.style.fontWeight === 'bold' && div.textContent?.startsWith(name)) {
      // Walk up to the row container and find the first button
      const row = div.closest('div[style*="border-radius"]');
      if (row) {
        const btn = row.querySelector('button');
        return btn ? btn.textContent : null;
      }
    }
  }
  return null;
}
