import { contextBridge } from 'electron';

/**
 * Preload script — runs in a privileged context before the renderer page loads.
 *
 * Only expose the minimum surface area needed by the renderer through
 * contextBridge. Never forward full Node.js / Electron APIs; doing so would
 * allow XSS in the renderer to escalate to native OS access.
 *
 * Steam integration: when adding greenworks (Steamworks SDK), expose IPC
 * wrappers here rather than calling greenworks directly from the renderer.
 *
 * electron-store: if you migrate persistence.ts to use native file-based
 * storage instead of localStorage, expose get/set/delete wrappers here and
 * implement them in main.ts via ipcMain handlers.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform as string,
});
