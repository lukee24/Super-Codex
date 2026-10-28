import { app, BrowserWindow, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CodexBridge, findCodex } from './codex-bridge.mjs';
import { existsSync } from 'node:fs';
import { isDocumentationUrl, smokeDataDirectory } from './security.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(directory, '..', 'dist', 'index.html');
const devUrl = !app.isPackaged && ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(process.env.SUPER_CODEX_DEV_URL) ? process.env.SUPER_CODEX_DEV_URL : null;
const smokeData = smokeDataDirectory(process.argv);
if (smokeData) app.setPath('userData', smokeData);
let window; let bridge;

function trustedSender(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) return false;
  const url = event.senderFrame.url;
  return devUrl ? new URL(url).origin === devUrl : url.split(/[?#]/)[0] === pathToFileURL(indexPath).href;
}

function register(channel, handler) {
  ipcMain.handle(`super-codex:${channel}`, async (event, payload) => {
    if (!trustedSender(event)) throw new Error('Untrusted application frame.');
    return handler(payload);
  });
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 819, minWidth: 800, minHeight: 600, show: false,
    title: 'Super Codex — Unofficial Concept', backgroundColor: '#f0f3f9',
    icon: path.join(directory, '..', 'dist', 'icon.png'),
    frame: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  window.once('ready-to-show', () => { if (!smokeData) window.show(); });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isDocumentationUrl(url)) void shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (isDocumentationUrl(url)) void shell.openExternal(url).catch(() => {});
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  if (devUrl) window.loadURL(devUrl); else window.loadFile(indexPath);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        (devUrl ? "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173; " : "connect-src 'none'; ") +
        "object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'",
      ] } });
    });
    const bundledCli = app.isPackaged ? path.join(process.resourcesPath, 'codex', 'bin', 'codex.exe') : path.join(directory, '..', 'node_modules', '@openai', 'codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
    bridge = new CodexBridge({ home: path.join(app.getPath('userData'), 'codex-home'), cwd: path.join(app.getPath('userData'), 'conversation-workspace'), resolveCli: () => existsSync(bundledCli) ? { command: bundledCli, args: [] } : findCodex(), openExternal: url => shell.openExternal(url) });
    bridge.on('event', data => { if (window && !window.isDestroyed()) window.webContents.send('super-codex:event', data); });
    register('status', () => bridge.getStatus());
    register('connect', () => bridge.connect());
    register('models', () => bridge.getModels());
    register('send', payload => bridge.sendTurn(payload));
    register('cancel', payload => bridge.cancelTurn(payload));
    register('window', action => {
      if (action === 'minimize') window.minimize();
      else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
      else if (action === 'close') window.close();
      else throw new Error('Unsupported window action.');
    });
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('before-quit', () => bridge?.close());
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
