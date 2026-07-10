import { app, BrowserWindow } from 'electron';
import path from 'path';

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Cool Pipes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Renderer bundle is always emitted to dist/ alongside this compiled file.
  void win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Hide the native menu bar in packaged builds; keep it in dev for DevTools access.
  if (app.isPackaged) {
    win.setMenuBarVisibility(false);
  }
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create the window when the dock icon is clicked and no windows are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(console.error);

// Quit when all windows are closed (except on macOS where the app stays active).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
