type ElectronWindowAPI = { triggerCloudSave(): void };

/** Trigger a cloud save write at a meaningful persistence checkpoint.
 *  No-op outside Electron builds or if the API bridge isn't available. */
export function triggerCloudSave(): void {
  if (BUILD_TARGET !== 'electron') return;
  (window as unknown as { electronAPI?: ElectronWindowAPI }).electronAPI?.triggerCloudSave();
}
