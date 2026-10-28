import { chromium } from '@playwright/test';
import { mkdir, copyFile, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
const iteration = args.iteration || '00';
const surface = args.surface || 'home';
const output = path.resolve(args.output || (surface === 'home' ? `artifacts/visual/iteration-${iteration}` : `artifacts/visual/${surface}/iteration-${iteration}`));
const original = path.resolve(`artifacts/visual/reference-${surface === 'home' ? '' : `${surface}-`}original.png`);
// Supply reference=/absolute/path.png on the first run. Subsequent iterations use
// the immutable local copy; user-specific paths and sidebar labels stay outside source.
const reference = args.reference || original;
const width = Number(args.width || (surface === 'home' ? 1280 : 1920)), height = Number(args.height || (surface === 'home' ? 819 : 1032));
const theme = args.theme || (surface === 'home' ? 'light' : 'dark');
const url = args.url || 'http://127.0.0.1:4173/?reference=home';
const fixturePath = args.fixture || 'artifacts/visual/reference-analysis/sidebar-fixture.local.json';
let fixture = null;
try { fixture = JSON.parse(await readFile(fixturePath, 'utf8')); } catch (error) { if (args.fixture || error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
try { await stat(original); } catch { await copyFile(reference, original); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: theme === 'dark' ? 'dark' : 'light', locale: 'zh-CN' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(({ fixture, modelId, theme }) => {
  if (fixture) window.__SUPER_CODEX_VISUAL_FIXTURE__ = fixture;
  localStorage.setItem('super-codex-state-v1', JSON.stringify({
    version: 1, language: 'zh', theme, modelId, effort: 'Ultra', speed: 1,
    planId: 'free', quotas: { session: 100, weekly: 100 }, resetCount: 0, resetHistory: [],
    chats: [], activeChatId: null, onboarded: true, sound: false, animations: false, mode: 'demo',
  }));
}, { fixture, modelId: args.model || 'astra', theme });
await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// Exercise project naming before opening a surface. Otherwise this interaction
// would dismiss its popup when no local sidebar fixture is available.
const projectInput = page.locator('.project-editor input');
if (await page.locator('.project-nav').count() === 1) {
  await page.locator('.project-nav').click();
  if (await projectInput.isVisible()) {
    await projectInput.fill('super codex');
    await page.locator('.project-editor').getByRole('button', { name: '保存', exact: true }).click();
  } else await page.keyboard.press('Escape');
}
const customSteps = args.steps ? JSON.parse(await readFile(args.steps, 'utf8')) : null;
if (customSteps) {
  for (const step of customSteps) {
    const target = step.testId ? page.getByTestId(step.testId) : step.role ? page.getByRole(step.role, { name: step.name, exact: true }) : page.locator(step.selector);
    if (step.action === 'click') await target.click();
    else if (step.action === 'hover') await target.hover();
    else if (step.action === 'press') await target.press(step.key);
    else if (step.action === 'select') await target.selectOption(step.value);
    else if (step.action === 'fill') await target.fill(step.value);
    else throw new Error(`Unsupported visual step action: ${step.action}`);
  }
} else if (surface === 'models') await page.getByTestId('model-selector').click();
else if (surface === 'reasoning') await page.getByTestId('effort-selector').click();
else if (['settings', 'appearance', 'usage'].includes(surface)) {
  await page.locator('.context-shelf').getByRole('button', { name: '设置', exact: true }).click();
  if (surface !== 'settings') await page.getByTestId(`settings-tab-${surface}`).click();
} else if (surface === 'plans' || surface === 'plans-all') {
  await page.locator('.profile').click();
  await page.getByRole('button', { name: '升级套餐', exact: true }).click();
} else if (surface !== 'home') throw new Error(`Surface ${surface} needs a steps=local-scenario.json file.`);
if (args.hover) await page.locator(args.hover).hover();
await page.evaluate(() => document.fonts.ready);
// Screenshot fast-forwards finite transitions. Record geometry afterwards so
// a modal's opening scale cannot leak into the layout evidence.
await page.screenshot({ path: path.join(output, 'actual.png'), animations: 'disabled' });
const geometry = await page.evaluate(() => {
  const selectors = ['.app', '.sidebar', '.workspace', '.topbar', '.welcome-content', '.hero-mark', '.welcome-content h1', '.composer-area', '.composer', '.composer-toolbar', '.window-chrome', '.application-body', '.navigation-shell', '.sidebar-heading', '.app-rail', '.context-shelf', '.settings-page', '.sp-sidebar', '.sp-main', '.sp-content', '.sp-content>h1', '.sp-close', '.plans-modal', '.plans-native-bar', '.plans-native-bar>button', '.plans-native-bar>div', '.replica-plans-scroll', '.replica-plans-scroll>h1', '.replica-plans-grid', '.replica-plan'];
  return {
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, scale: visualViewport?.scale, cssZoom: getComputedStyle(document.documentElement).zoom },
    assets: { scripts: Array.from(document.scripts).map(element => element.src).filter(Boolean), styles: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(element => element.href) },
    elements: Object.fromEntries(selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor }];
    })),
  };
});
const popupSelector = args.popup || ({ models: '.native-model-menu', reasoning: '.native-effort-menu', settings: '.settings-page', appearance: '.settings-page', usage: '.settings-page', plans: '.plans-modal', 'plans-all': '.plans-modal' }[surface]);
let popup = null;
if (popupSelector) {
  const element = page.locator(popupSelector);
  await element.waitFor({ state: 'visible' });
  popup = { selector: popupSelector, box: await element.boundingBox() };
  await element.screenshot({ path: path.join(output, 'actual-popup.png'), animations: 'disabled' });
  // Keep the untouched element screenshot (which expands fractional bounds), and
  // separately record an explicit integer pixel crop for equal-size ROI comparisons.
  const box = popup.box;
  popup.gridCrop = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  popup.gridCropNote = 'Nearest-integer physical pixel crop; no resampling. The raw full frame and outward-rounded element screenshot are retained. CSS subpixel bounds remain recorded separately.';
  await page.screenshot({ path: path.join(output, 'actual-popup-grid.png'), clip: popup.gridCrop, animations: 'disabled' });
}
const referenceScope = surface === 'home'
  ? 'Full app window, with declared test sidebar content.'
  : ['models', 'reasoning', 'chat'].includes(surface)
    ? 'Native reference contains an evolving private chat body. Only explicit popup crops or declared structural regions are content-compatible; do not claim whole-chat 1:1. Model menu row text differs because only requested concept models are included.'
    : surface.startsWith('plans')
      ? 'Native reference has JPY official prices and billing actions; this app has USD display prices and free simulated purchases. Compare layout and controls; full raw metrics include these deliberate content differences and are not an exact page-fidelity score.'
      : 'Native settings reference contains actual system, account and permission copy. This app uses explicit local-demo copy. Full raw metrics include these content differences; structural regions may be compared independently.';
await writeFile(path.join(output, 'capture.json'), JSON.stringify({ iteration, surface, url, at: new Date().toISOString(), referenceSource: reference, originalPreservedAt: original, referenceScope, fixtureSource: fixture ? path.resolve(fixturePath) : null, hoverSelector: args.hover || null, geometry, popup, errors }, null, 2));
await browser.close();
console.log(JSON.stringify({ output, viewport: geometry.viewport, errors }));
