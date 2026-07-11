import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — runs in a privileged context before the renderer page loads.
 *
 * Only expose the minimum surface area needed by the renderer through
 * contextBridge. Never forward full Node.js / Electron APIs; doing so would
 * allow XSS in the renderer to escalate to native OS access.
 *
 * Steam integration: steamworks.js client should be exposed here rather than
 * accessed directly from the renderer. See electron/main.ts for IPC patterns.
 *
 * Cloud saves: collectSaveData() filters and serialises all pipes_* localStorage
 * keys, then sends them to the main process via IPC for atomic gzip write.
 */

function collectSaveData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('pipes_')) continue;
    if (key.includes('partial_progress')) continue;
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }
  // Strip official campaigns — bundled content ships with the app, no need to sync.
  const raw = data['pipes_campaigns'];
  if (raw) {
    try {
      const all = JSON.parse(raw) as Array<{ official?: boolean }>;
      data['pipes_campaigns'] = JSON.stringify(all.filter((c) => !c.official));
    } catch { /* keep original if JSON is malformed */ }
  }
  return data;
}

// Import cloud save into localStorage before any page scripts run.
// sendSync blocks briefly at startup so data is in place before main.ts executes.
const saved = ipcRenderer.sendSync('get-cloud-save') as Record<string, string> | null;
if (saved && typeof saved === 'object') {
  for (const [key, val] of Object.entries(saved)) {
    if (typeof val === 'string') localStorage.setItem(key, val);
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform as string,
  /** Checkpoint save: collect localStorage snapshot and send to main to write. */
  triggerCloudSave: () => ipcRenderer.send('cloud-save', collectSaveData()),
  /** Called by main via executeJavaScript on before-quit to get the latest snapshot. */
  gatherSaveData: () => collectSaveData(),
});
