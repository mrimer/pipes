import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

const SAVE_FILENAME = 'save.json.gz';

function getSavePath(): string {
  return path.join(app.getPath('userData'), SAVE_FILENAME);
}

function writeSaveFile(data: unknown): void {
  const savePath = getSavePath();
  const tmpPath = `${savePath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, zlib.gzipSync(JSON.stringify(data)));
    fs.renameSync(tmpPath, savePath);
  } catch { /* ignore write errors — Steam Cloud sync will re-try next session */ }
}

function readSaveFile(): Record<string, string> | null {
  try {
    const buf = fs.readFileSync(getSavePath());
    return JSON.parse(zlib.gunzipSync(buf).toString('utf8')) as Record<string, string>;
  } catch {
    return null; // missing or corrupt file — start fresh
  }
}

// Preload requests the cloud save data synchronously at startup before page JS runs.
ipcMain.on('get-cloud-save', (event) => {
  event.returnValue = readSaveFile();
});

// Renderer sends updated save data at each checkpoint.
ipcMain.on('cloud-save', (_event, data: unknown) => {
  writeSaveFile(data);
});

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

// Safety-net save before the process exits.
// Calls gatherSaveData() via executeJavaScript to get the latest localStorage snapshot.
app.on('before-quit', (event) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  event.preventDefault();
  let done = false;
  const finish = (): void => {
    if (!done) { done = true; app.exit(0); }
  };
  setTimeout(finish, 3000); // never block quit for more than 3 s
  win.webContents.executeJavaScript('window.electronAPI?.gatherSaveData() ?? null')
    .then((data: unknown) => { if (data) writeSaveFile(data); finish(); })
    .catch(finish);
});

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
