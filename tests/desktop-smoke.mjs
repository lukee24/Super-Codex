import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Usage after npm run build:
//   node tests/desktop-smoke.mjs
// Packaged app after npm run build:unpacked:
//   node tests/desktop-smoke.mjs --packaged="release/win-unpacked/Super Codex.exe"
// No login or inference is started. The profile is temporary and is deleted afterward.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagedArg = process.argv.find(arg => arg.startsWith('--packaged='))?.slice('--packaged='.length);
const executablePath = packagedArg ? path.resolve(root, packagedArg) : undefined;
if (!existsSync(path.join(root, 'dist', 'index.html')) && !executablePath) throw new Error('Build the web application first: npm run build');
if (executablePath && !existsSync(executablePath)) throw new Error('The packaged application executable does not exist.');
const dataDirectory = mkdtempSync(path.join(os.tmpdir(), 'super-codex-smoke-'));
const screenshotPath = path.join(root, 'test-results', packagedArg ? 'desktop-packaged-smoke.png' : 'desktop-smoke.png');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.SUPER_CODEX_DEV_URL;
let application;
try {
  application = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [...(executablePath ? [] : [root]), `--super-codex-smoke-data=${dataDirectory}`],
    env, cwd: root, timeout: 45000,
  });
  const window = await application.firstWindow({ timeout: 30000 });
  const errors = [];
  window.on('pageerror', error => errors.push(error.message));
  await window.locator('.app').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(new URL(window.url()).protocol, 'file:', 'Smoke must load the production build, not Vite.');
  const renderer = await window.evaluate(() => ({
    node: typeof window.require,
    process: typeof window.process,
    bridge: Object.keys(window.superCodex ?? {}).sort(),
  }));
  assert.equal(renderer.node, 'undefined');
  assert.equal(renderer.process, 'undefined');
  assert.deepEqual(renderer.bridge, ['cancelTurn', 'connect', 'getModels', 'getStatus', 'onEvent', 'platform', 'sendTurn', 'windowAction'].sort());
  const security = await application.evaluate(({ app, BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { data: app.getPath('userData'), packaged: app.isPackaged, contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, nodeIntegration: prefs.nodeIntegration, webSecurity: prefs.webSecurity };
  });
  assert.equal(security.data, dataDirectory);
  assert.equal(security.contextIsolation, true);
  assert.equal(security.sandbox, true);
  assert.equal(security.nodeIntegration, false);
  assert.equal(security.webSecurity, true);
  if (executablePath) assert.equal(security.packaged, true);
  const status = await window.evaluate(async () => window.superCodex.getStatus());
  assert.equal(typeof status.available, 'boolean');
  assert.equal(status.connected, false, 'A fresh smoke profile must never reuse host credentials.');
  assert.equal(status.mode, 'demo');
  const connectionGate = window.getByRole('dialog', { name: '连接 Codex' });
  assert.equal(await connectionGate.count(), 0, 'Opening the application must not prompt for connection.');
  assert.equal(await window.locator('.application-body').getAttribute('inert'), null, 'The workspace is usable before sending.');
  const input = window.getByRole('textbox', { name: '消息', exact: true });
  await input.fill('保留这条待发送消息');
  await input.press('Enter');
  await connectionGate.waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await input.inputValue(), '保留这条待发送消息', 'The unsent draft is preserved behind the connection dialog.');
  assert.equal(await window.locator('.application-body').getAttribute('inert'), '', 'The workspace is inert while the dialog is open.');
  assert.equal(await connectionGate.getByRole('button', { name: '先体验 Demo' }).count(), 0, 'An unconnected user cannot bypass connection to send.');
  await window.keyboard.press('Escape');
  assert.equal(await connectionGate.count(), 0, 'Escape dismisses the optional connection dialog.');
  assert.equal(await input.inputValue(), '保留这条待发送消息', 'The draft is preserved after closing the dialog.');
  await input.press('Enter');
  await connectionGate.waitFor({ state: 'visible', timeout: 15000 });
  assert.deepEqual(errors, [], 'Renderer should load without uncaught errors.');
  // Hidden windows may pause CSS animation frames. Finish finite entrance
  // animations so captured evidence shows the settled UI, not a transparent frame.
  await window.evaluate(async () => {
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      const endTime = animation.effect?.getComputedTiming().endTime;
      if (typeof endTime === 'number' && Number.isFinite(endTime)) {
        try { animation.finish(); } catch { /* A cancelled animation needs no work. */ }
      }
    }
  });
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  // Playwright's screenshot can wait forever for a compositor frame in a hidden
  // packaged window. Electron's native capturer explicitly supports stayHidden.
  let screenshot = { saved: false, path: null, error: null };
  let captureTimeout;
  try {
    const capture = await Promise.race([
      application.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        contents.setBackgroundThrottling(false);
        // Wake the hidden compositor before collecting the settled evidence frame.
        await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        await new Promise(resolve => setTimeout(resolve, 250));
        const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
        return { empty: image.isEmpty(), size: image.getSize(), png: image.toPNG().toString('base64') };
      }),
      new Promise((_resolve, reject) => { captureTimeout = setTimeout(() => reject(new Error('Native hidden-window capture timed out after 15 seconds.')), 15000); }),
    ]);
    assert.equal(capture.empty, false, 'Native screenshot must contain pixels.');
    assert.ok(capture.size.width > 0 && capture.size.height > 0, 'Native screenshot must have positive dimensions.');
    writeFileSync(screenshotPath, Buffer.from(capture.png, 'base64'));
    screenshot = { saved: true, path: screenshotPath, error: null };
  } catch (error) {
    // Image capture is a separate evidence step. Always report its failure rather
    // than discarding completed security and connection assertions.
    screenshot = { saved: false, path: null, error: error.message };
  } finally { clearTimeout(captureTimeout); }
  assert.deepEqual(errors, [], 'Renderer should remain free of uncaught errors.');
  console.log(JSON.stringify({ passed: true, packaged: security.packaged, bridgeAvailable: status.available, connected: false, connectionGate: 'shown on nonempty send; draft preserved', security: 'isolated renderer; no Node integration', screenshot }, null, 2));
} finally {
  if (application) await application.close().catch(() => application.process().kill());
  if (path.dirname(dataDirectory) === path.resolve(os.tmpdir()) && path.basename(dataDirectory).startsWith('super-codex-smoke-')) {
    rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
  }
}
