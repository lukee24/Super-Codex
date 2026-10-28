import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
const iteration = args.iteration || '05';
const output = path.resolve(args.output || `artifacts/visual/states/iteration-${iteration}`);
const url = args.url || 'http://127.0.0.1:4173/?reference=home';
let fixture = null;
try { fixture = JSON.parse(await readFile('artifacts/visual/reference-analysis/sidebar-fixture.local.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const captures = [];

async function scenario(name, theme, run, viewport = { width: 1920, height: 1032 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, locale: 'zh-CN' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ theme, fixture }) => {
    if (fixture) window.__SUPER_CODEX_VISUAL_FIXTURE__ = fixture;
    localStorage.setItem('super-codex-state-v1', JSON.stringify({ version: 1, language: 'zh', theme, modelId: 'astra', effort: 'Ultra', speed: 1, planId: 'free', quotas: { session: 100, weekly: 100 }, resetCount: 0, resetHistory: [], chats: [], activeChatId: null, onboarded: true, sound: false, animations: false, mode: 'demo' }));
  }, { theme, fixture });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await run(page, async (stateName, note, counterpart = null) => {
      const filename = `${name}-${stateName}.png`;
      await page.screenshot({ path: path.join(output, filename), animations: 'disabled' });
      const actualState = await page.evaluate(() => {
        const state = JSON.parse(localStorage.getItem('super-codex-state-v1'));
        return { language: state.language, theme: state.theme, modelId: state.modelId, effort: state.effort, speed: state.speed, planId: state.planId, chatCount: state.chats.length, messageCount: state.chats.reduce((n, chat) => n + chat.messages.length, 0), activeElement: document.activeElement?.getAttribute('aria-label'), dpr: devicePixelRatio, viewportScale: visualViewport?.scale, cssZoom: getComputedStyle(document.documentElement).zoom, scriptAssets: Array.from(document.scripts).map(element => element.src).filter(Boolean) };
      });
      captures.push({ filename, scenario: name, stateName, note, nativeCounterpart: counterpart, comparisonStatus: counterpart ? 'Reference exists with differing content; no pixel-equivalence assertion.' : 'No matching native state reference available; actual app evidence only.', viewport, actualState, errors: [...errors] });
    });
    expect(errors, `${name} JavaScript errors`).toEqual([]);
  } finally { await context.close(); }
}

try {
  await scenario('home', 'light', async (page, capture) => {
    await capture('default', 'Light home, no menus open.', 'reference-original.png');
    await page.locator('.project-nav').first().hover();
    await capture('project-hover', 'Actual project-row hover; reference has no matching hover state.');
    await page.locator('.main-nav').getByRole('button', { name: '新聊天', exact: true }).hover();
    await capture('button-hover', 'Actual new-chat button hover.');
    await page.locator('.application-menu-wrap').getByRole('button', { name: '文件', exact: true }).click();
    await capture('file-menu-open', 'Application File menu open; native counterpart unavailable.');
  }, { width: 1280, height: 819 });

  await scenario('models', 'dark', async (page, capture) => {
    await page.getByTestId('model-selector').click();
    await capture('open-astra-selected', 'Astra selected; native menu also selects Astra, but available rows differ.', 'original-native/models-dark-1920x1032.png');
    await page.locator('[data-model-id="terra"]').hover();
    await capture('terra-hover', 'Concept GPT-6.1 Terra hover; native hover is GPT-5.6 Terra, so text and row position differ.');
    await page.locator('[data-model-id="terra"]').click();
    await page.getByTestId('model-selector').click();
    await expect(page.locator('[data-model-id="terra"]')).toHaveAttribute('aria-checked', 'true');
    await capture('terra-selected', 'Terra selected through the real menu interaction.');
  });

  await scenario('reasoning', 'dark', async (page, capture) => {
    await page.getByTestId('effort-selector').click();
    await capture('open-ultra-selected', 'Ultra selected; the reference popup has Ultra selected.', 'original-native/reasoning-dark-1920x1032.png');
    const range = page.getByTestId('effort-range');
    await range.hover();
    await capture('range-hover', 'Pointer hovering over the real range control.');
    const box = await range.boundingBox();
    await page.mouse.move(box.x + box.width - 14, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 14 + (box.width - 28) * 0.4, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(range).toHaveValue('2');
    await expect(range).toHaveAttribute('aria-valuetext', 'Medium');
    await capture('drag-medium-selected', 'Real pointer drag selects Medium and persists it in local state.');
  });

  await scenario('settings', 'dark', async (page, capture) => {
    await page.locator('.context-shelf').getByRole('button', { name: '设置', exact: true }).click();
    await capture('general-open', 'General settings open; simulated permission copy differs.', 'original-native/settings-dark-1920x1032.png');
    await page.getByTestId('settings-tab-appearance').hover();
    await capture('appearance-nav-hover', 'Appearance navigation item hovered.');
    await page.getByTestId('settings-tab-appearance').click();
    await expect(page.getByRole('button', { name: '深色', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await capture('appearance-dark-selected', 'Appearance page with Dark selected.', 'original-native/appearance-dark-1920x1032.png');
    await page.getByRole('button', { name: '浅色', exact: true }).hover();
    await capture('appearance-light-hover', 'Light preview hovered while Dark remains selected.');
    await page.getByRole('button', { name: '浅色', exact: true }).click();
    await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await capture('appearance-light-selected', 'Light selected through actual settings interaction; no matched native light reference.');
  });

  await scenario('plans', 'dark', async (page, capture) => {
    await page.locator('.profile').click();
    await page.getByRole('button', { name: '升级套餐', exact: true }).click();
    await capture('open-pro100', 'Reference plans open at Pro 100; USD/free simulation content differs from native JPY billing.', 'original-native/plans-all-dark-1920x1032.png');
    await page.getByTestId('plan-pro-100').locator('.replica-plan-buy').hover();
    await capture('buy-hover', 'Free simulated purchase button hovered; no charge or network payment.');
    await page.getByRole('button', { name: 'Pro 200', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Pro 200', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('plan-pro-200')).toBeVisible();
    await capture('pro200-selected', 'Display tier changed to Pro 200; membership is still Free until explicit simulated purchase.');
    await page.getByTestId('plan-pro-200').locator('.replica-plan-buy').click();
    await expect(page.getByRole('dialog', { name: '模拟购买成功', exact: true })).toBeVisible();
    await capture('local-purchase-complete', 'Local free simulated purchase receipt; real payment is not integrated.');
  });

  await scenario('chat', 'dark', async (page, capture) => {
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('创建一个带递增按钮的计数器组件，并展示模拟测试与文件修改。');
    await page.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(page.locator('.message.assistant .markdown')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0);
    await capture('demo-complete', 'Actual local Demo response and simulated task events; native private chat content is incompatible, so no whole-chat comparison.');
    await page.locator('.top-actions').getByRole('button', { name: '终端', exact: true }).click();
    await capture('terminal-open', 'Actual simulated terminal pane; no matched native screenshot is available.');
    await page.locator('.panel-tabs').getByRole('button', { name: /^更改/ }).click();
    await capture('diff-open', 'Actual simulated file diff pane; no matched native screenshot is available.');
  });
} finally {
  await writeFile(path.join(output, 'states.json'), JSON.stringify({ iteration, url, capturedAt: new Date().toISOString(), source: 'Playwright actual application state captures; native references are never fabricated.', isolatedContexts: true, paymentIntegration: false, captures }, null, 2));
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  await writeFile(path.join(output, 'gallery.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Super Codex state evidence ${escape(iteration)}</title><style>body{margin:32px;font:15px/1.6 system-ui;background:#f6f6f6;color:#222}h1{font-size:26px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px}article{background:#fff;padding:18px;border:1px solid #ddd;border-radius:12px}img{width:100%;height:auto;border:1px solid #ddd}h2{font-size:17px}small{color:#666}code{font-size:12px}</style><h1>Actual application state captures · iteration ${escape(iteration)}</h1><p>Local review only. ${captures.length} captures; isolated browser contexts; no matching reference is invented. Click an image for its original pixels.</p><main>${captures.map(item => `<article><h2>${escape(item.scenario)} · ${escape(item.stateName)}</h2><a href="${escape(item.filename)}"><img src="${escape(item.filename)}" loading="lazy" alt="${escape(item.stateName)}"></a><p>${escape(item.note)}</p><small>${escape(item.comparisonStatus)}</small><p><code>${escape(JSON.stringify(item.actualState))}</code></p></article>`).join('')}</main></html>`);
  await browser.close();
}
console.log(JSON.stringify({ output, captures: captures.length, errors: captures.flatMap(item => item.errors) }));
