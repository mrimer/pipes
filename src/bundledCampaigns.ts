import type { CampaignDef } from './types';
import { loadImportedCampaigns, saveImportedCampaigns } from './persistence';

/**
 * On every startup, replace any locally-stored version of a bundled official
 * campaign with the bundled copy.  This ensures players always run the current
 * campaign content after an app update without any manual import step.
 *
 * - The official flag is enforced regardless of what the JSON file contains.
 * - No UI feedback is shown; this runs silently before the splash screen.
 * - Player progress (stars, water, recordings) is stored separately by GUID and
 *   is unaffected by the campaign structure being replaced.
 */
export function syncBundledCampaigns(): void {
  if (BUNDLED_CAMPAIGNS.length === 0) return;

  const stored = loadImportedCampaigns();
  let changed = false;

  for (const raw of BUNDLED_CAMPAIGNS) {
    const bundled: CampaignDef = { ...raw, official: true };
    const idx = stored.findIndex(c => c.id === bundled.id);
    if (idx === -1) {
      stored.push(bundled);
      changed = true;
    } else if (JSON.stringify(stored[idx]) !== JSON.stringify(bundled)) {
      stored[idx] = bundled;
      changed = true;
    }
  }

  if (changed) saveImportedCampaigns(stored);
}
