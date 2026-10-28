import { test, expect, type Page } from '@playwright/test';
import { MODELS, PLANS, EFFORTS, SPEEDS } from '../src/lib/catalog';
import { initialState, STORAGE_KEY, type AppState } from '../src/lib/storage';

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(runtimeErrors.get(page) ?? [], 'No uncaught browser exceptions').toEqual([]);
});

async function installConnectedDemoBridge(page: Page) {
  await page.addInitScript(() => {
    if (window.superCodex) return;
    window.superCodex = {
      platform:'win32', getStatus:async()=>({available:true,connected:true,mode:'live',account:{type:'chatgpt',email:'test@example.invalid',planType:'free'}}),
      connect:async()=>({available:true,connected:true,mode:'live'}), getModels:async()=>[{id:'test-model',name:'Test model',isDefault:true}],
      sendTurn:async()=>({threadId:'unused',turnId:'unused',model:'unused'}),cancelTurn:async()=>({cancelled:true}),onEvent:()=>()=>{},windowAction:async()=>undefined,
    };
  });
}

async function enterDemoMode(page: Page) {
  await expect(page.getByRole('dialog', { name: 'Connect Codex' })).toHaveCount(0);
  await page.locator('.codex-mode').click();
  await page.getByRole('button', { name: 'Use local demo', exact: true }).click();
  await expect.poll(async () => (await saved(page)).mode).toBe('demo');
}

async function bootstrap(page: Page, overrides: Partial<AppState> = {}) {
  await installConnectedDemoBridge(page);
  await page.addInitScript(({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { key: STORAGE_KEY, state: { ...initialState, language: 'en', onboarded: true, sound: false, speed: 50, ...overrides } });
  await page.goto('/');
  await enterDemoMode(page);
}

async function saved(page: Page): Promise<AppState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);
}

async function openPlans(page: Page) {
  await page.locator('.profile').click();
  await page.getByRole('button', { name: 'Upgrade plan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Plans', exact: true })).toBeVisible();
}

async function expectMembership(page: Page, name: string) {
  await page.locator('.profile').click();
  await expect(page.locator('.account-menu-heading')).toContainText(name);
  await page.locator('.profile').click();
}

async function openSettings(page: Page) {
  await page.locator('.profile').click();
  await page.locator('.account-menu').getByRole('button', { name: /^Settings(?:\s*Ctrl\+,)?$/ }).click();
}

async function expectAccountMode(page: Page, connected: boolean) {
  await page.locator('.profile').click();
  if (!await page.locator('.account-submenu').isVisible()) await page.locator('.account-menu').getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.locator('.account-menu').getByRole('button', {
    name: connected ? 'ChatGPT connected' : 'Demo · Connect ChatGPT', exact: true,
  })).toBeVisible();
  await page.locator('.profile').click();
}

async function completePrompt(page: Page, prompt: string) {
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
}

test('first run opens the workspace, and only a nonempty submission requests connection', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '消息', exact: true });
  const connect = page.getByRole('dialog', { name: '连接 Codex', exact: true });
  await expect(input).toBeVisible();
  await expect(connect).toHaveCount(0);
  await input.press('Enter');
  await expect(connect).toHaveCount(0);
  await input.fill('测试尚未发送的草稿');
  await input.press('Enter');
  await expect(connect).toBeVisible();
  await expect(input).toHaveValue('测试尚未发送的草稿');
  await page.keyboard.press('Escape');
  await expect(connect).toHaveCount(0);
  await expect(input).toHaveValue('测试尚未发送的草稿');
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(connect).toBeVisible();
  await connect.getByRole('button', { name: '连接 ChatGPT', exact: true }).click();
  await expect(connect.locator('.connection-note').first()).toContainText('网页演示无法启动本地 Codex');
  await expect(connect.locator('.disclaimer')).toContainText('非官方');
  await expect(connect.getByRole('button', { name: '先体验 Demo', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/screenshots/01-login-required-on-submit-zh.png', fullPage: true, animations: 'disabled' });
});

test('login preserves draft without auto-sending, and a later disconnect gates the next submission', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: Record<string, unknown>) => void>();
    const control={connected:false, calls:[] as Record<string, unknown>[], emit(event:Record<string,unknown>){for(const listener of listeners)listener(event);}};
    (window as any).__submitGate=control;
    window.superCodex={platform:'win32',getStatus:async()=>({available:true,connected:control.connected,mode:control.connected?'live':'demo'}),connect:async()=>{control.connected=true;return {available:true,connected:true,mode:'live'};},getModels:async()=>[{id:'mock-real',name:'Mock actual model',isDefault:true}],sendTurn:async payload=>{control.calls.push(payload as unknown as Record<string,unknown>);return {threadId:'test-thread',turnId:'test-turn',model:'mock-real'};},cancelTurn:async()=>({cancelled:true}),onEvent:listener=>{listeners.add(listener as (event:Record<string,unknown>)=>void);return ()=>listeners.delete(listener as (event:Record<string,unknown>)=>void);},windowAction:async()=>undefined};
  });
  await page.goto('/');
  const input=page.getByRole('textbox',{name:'消息',exact:true});
  await input.fill('保留这条草稿');await input.press('Enter');
  const dialog=page.getByRole('dialog',{name:'连接 Codex'});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'连接 ChatGPT',exact:true}).click();
  await expect(dialog).toHaveCount(0);
  await expect(input).toHaveValue('保留这条草稿');
  expect(await page.evaluate(()=>(window as any).__submitGate.calls.length)).toBe(0);
  await input.press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).__submitGate.calls.length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__submitGate.calls[0].text)).toBe('保留这条草稿');
  await page.evaluate(()=>{const c=(window as any).__submitGate;c.emit({type:'done',threadId:'test-thread',turnId:'test-turn'});c.connected=false;c.emit({type:'status',available:true,connected:false,reason:'Disconnected'});});
  await expect(page.getByRole('button',{name:'停止生成'})).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await input.fill('断线后的草稿');await input.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('断线后的草稿');
  expect(await page.evaluate(()=>(window as any).__submitGate.calls.length)).toBe(1);
});

test('all concept models, reasoning presets and speed selections work and persist', async ({ page }) => {
  await bootstrap(page);
  await page.getByTestId('model-selector').click();
  await expect(page.locator('.native-model-menu [data-model-id]')).toHaveCount(16);
  expect(await page.locator('.native-model-menu').innerText()).not.toContain('6.12');
  for (let i = 0; i < MODELS.length; i++) {
    if (i > 0) await page.getByTestId('model-selector').click();
    await page.locator(`.native-model-menu [data-model-id="${MODELS[i].id}"]`).click();
    await expect(page.getByTestId('model-selector')).toContainText(MODELS[i].name);
    expect((await saved(page)).modelId).toBe(MODELS[i].id);
  }
  await page.getByTestId('effort-selector').click();
  const range = page.getByTestId('effort-range');
  await expect(range).toHaveAttribute('min', '0');
  await expect(range).toHaveAttribute('max', '6');
  await expect(range).toHaveAttribute('step', '1');
  const slider = (await range.boundingBox())!;
  await page.mouse.click(slider.x + 14 + (slider.width - 28) * 2 / 6, slider.y + slider.height / 2);
  await expect(range).toHaveAttribute('aria-valuetext', 'Medium');
  expect((await saved(page)).effort).toBe('Medium');
  await range.press('Home');
  for (let index = 0; index < EFFORTS.length; index++) {
    const effort = EFFORTS[index];
    if (index > 0) await range.press('ArrowRight');
    await expect(range).toHaveAttribute('aria-valuetext', effort);
    expect((await saved(page)).effort).toBe(effort);
  }
  await range.press('ArrowRight');
  await expect(range).toHaveAttribute('aria-valuetext', 'Ultimate');
  expect((await saved(page)).effort).toBe('Ultimate');
  await range.press('Escape');
  for (const speed of SPEEDS) {
    await page.getByTestId('effort-selector').click();
    await page.getByTestId('speed-selector').click();
    await expect(page.locator('.native-speed-menu').getByRole('menuitemradio')).toHaveCount(6);
    await page.locator('.native-speed-menu').getByRole('menuitemradio', { name: speed === 1 ? 'Normal' : `${speed}×`, exact: true }).click();
    expect((await saved(page)).speed).toBe(speed);
    await expect(page.getByTestId('speed-selector')).toHaveCount(0);
    if (speed === 1) { await expect(page.getByTestId('speed-indicator')).toBeVisible(); await expect(page.getByTestId('speed-indicator')).not.toContainText('×'); }
    if (speed === 20) await expect(page.getByTestId('speed-indicator').locator('svg')).toHaveCount(4);
    if (speed === 50) await expect(page.getByTestId('speed-indicator').locator('.speed-sparkles')).toBeVisible();
  }
  await page.reload();
  await enterDemoMode(page);
  await expect(page.getByTestId('model-selector')).toContainText('Apex');
  await expect(page.getByTestId('effort-selector')).toContainText('Ultimate');
  await expect(page.getByTestId('speed-indicator')).toHaveText('50×');
  await page.getByRole('navigation', { name: 'Application navigation' }).getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('region', { name: 'Explore' }).getByRole('button', { name: 'Future model lab' }).click();
  await expect(page.locator('.model-card')).toHaveCount(16);
  await page.screenshot({ path: 'artifacts/screenshots/02-model-lab-en.png', fullPage: true, animations: 'disabled' });
});

test('streamed demo preserves context and exposes honest terminal, diff and Git interactions', async ({ page }) => {
  await bootstrap(page, { modelId: 'terra', effort: 'Ultra' });
  await completePrompt(page, 'Build a React counter');
  const answer = page.locator('.message.assistant').last();
  await expect(answer).toContainText('Offline Demo');
  await expect(answer).toContainText('not live AI reasoning');
  await expect(answer).toContainText('Terra');
  await expect(answer.locator('.task-progress')).toContainText('Simulated');
  expect((await saved(page)).quotas.session).toBeLessThan(100);
  await answer.locator('.file-summary').click();
  await expect(page.locator('.diff-content')).toContainText('Counter.tsx');
  await expect(page.locator('.diff-content')).toContainText('Counter.test.tsx');
  await page.getByRole('button', { name: 'Simulate commit', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Demo commit created');
  await page.screenshot({ path: 'artifacts/screenshots/03-conversation-diff.png', fullPage: true, animations: 'disabled' });
  await page.locator('.panel-tabs').getByRole('button', { name: 'Terminal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Simulated terminal command' }).fill('npm test');
  await page.getByRole('textbox', { name: 'Simulated terminal command' }).press('Enter');
  await expect(page.locator('.terminal-body pre')).toContainText('illustrative checks passed (simulated)');
  await page.getByRole('textbox', { name: 'Simulated terminal command' }).fill('git status');
  await page.getByRole('textbox', { name: 'Simulated terminal command' }).press('Enter');
  await expect(page.locator('.terminal-body pre')).toContainText('Simulated workspace only');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await completePrompt(page, 'Continue that component');
  await expect(page.locator('.message.assistant').last()).toContainText('Build a React counter');
  const before = await saved(page);
  expect(before.chats).toHaveLength(1);
  expect(before.chats[0].messages).toHaveLength(4);
  await page.reload();
  await expect(page.locator('.message')).toHaveCount(4);
  expect((await saved(page)).chats[0].messages[3].content).toBe(before.chats[0].messages[3].content);
});

test('generation can be stopped without reporting completed simulated file changes', async ({ page }) => {
  await bootstrap(page, { speed: 1, effort: 'Ultra' });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Build an app');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await expect(page.locator('.message.assistant')).toContainText('Demo stopped');
  await expect(page.locator('.file-summary')).toHaveCount(0);
  expect((await saved(page)).chats[0].messages[1].status).toBe('complete');
});

test('all ten plans are free simulations with separate fictional catalog and persistent membership', async ({ page }) => {
  await bootstrap(page);
  await openPlans(page);
  // Six reference memberships remain reachable: Go, Plus, Free and three Pro tiers.
  await expect(page.locator('.replica-plans-grid').first().locator('.replica-plan')).toHaveCount(3);
  await expect(page.getByTestId('plan-free')).toHaveCount(1);
  await expect(page.locator('.pro-tiers').getByRole('button')).toHaveCount(3);
  for (const price of [100, 200, 500]) await expect(page.locator('.pro-tiers').getByRole('button', { name: `Pro ${price}`, exact: true })).toBeVisible();
  await expect(page.locator('.fictional-plans-section .replica-plan')).toHaveCount(4);
  await expect(page.locator('.plans-native-bar')).toContainText('UNOFFICIAL DEMO');
  await expect(page.locator('.plans-native-bar')).toContainText('ALL PURCHASES FREE');
  await expect(page.locator('.replica-plan-note').first()).toContainText('Charged $0');
  await page.screenshot({ path: 'artifacts/screenshots/04-memberships-en.png', fullPage: true, animations: 'disabled' });
  for (let i = 0; i < PLANS.length; i++) {
    if (i > 0) await openPlans(page);
    const plan = PLANS[i];
    if (plan.id.startsWith('pro-') && !plan.fictional) await page.locator('.pro-tiers').getByRole('button', { name: `Pro ${plan.price}`, exact: true }).click();
    const card = page.getByTestId(`plan-${plan.id}`);
    const price = plan.id === 'free' ? card.locator(':scope > span') : card.locator('.replica-price');
    await expect(price).toContainText(`$${plan.price}`);
    const buy = plan.id === 'free' ? card.getByRole('button', { name: 'Simulate for free', exact: true }) : card.locator('.replica-plan-buy');
    await buy.click();
    const receipt = page.getByRole('dialog', { name: 'Demo purchase complete', exact: true });
    await expect(receipt).toContainText('Charged $0');
    await expect(receipt.locator('.purchase-receipt')).toContainText(PLANS[i].name);
    await receipt.getByRole('button', { name: 'Start exploring', exact: true }).click();
    expect((await saved(page)).planId).toBe(PLANS[i].id);
    await expectMembership(page, PLANS[i].name);
  }
  await page.reload();
  await expectMembership(page, 'Ultimate');
  expect((await saved(page)).planId).toBe('ultimate');
});

test('mechanical drag needs a full pull, resets both quotas once per gesture, and persists its record', async ({ page }) => {
  await bootstrap(page, { quotas: { session: 17, weekly: 23 } });
  await page.getByTestId('quota-shortcut').click();
  const handle = page.getByTestId('reset-handle');
  await expect(handle).toBeVisible();
  await expect(page.locator('.resetter-stage')).toHaveAttribute('data-renderer', 'three');
  // Wait until the Three scene has projected the physical handle's DOM hit target.
  await expect.poll(async () => await handle.evaluate(el => el.style.left)).not.toBe('');
  const rect = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 20, { steps: 4 });
  await expect(handle).toHaveAttribute('aria-valuenow', /[1-9]\d?/);
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '0');
  expect((await saved(page)).resetCount).toBe(0);
  expect((await saved(page)).quotas).toEqual({ session: 17, weekly: 23 });
  const settledRect = (await handle.boundingBox())!;
  await page.mouse.move(settledRect.x + settledRect.width / 2, settledRect.y + settledRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(settledRect.x + settledRect.width / 2, settledRect.y + settledRect.height / 2 + 180, { steps: 15 });
  await expect.poll(async () => (await saved(page)).resetCount).toBe(1);
  await expect(page.locator('.app')).toHaveClass(/reset-flash/);
  await page.mouse.move(settledRect.x + settledRect.width / 2, settledRect.y + settledRect.height / 2 + 190);
  await page.mouse.up();
  expect((await saved(page)).quotas).toEqual({ session: 100, weekly: 100 });
  expect((await saved(page)).resetCount).toBe(1);
  expect((await saved(page)).resetHistory[0].before).toEqual({ session: 17, weekly: 23 });
  await page.screenshot({ path: 'artifacts/screenshots/05-resetter-success.png', fullPage: true, animations: 'disabled' });
  await expect(page.locator('.resetter-status')).toHaveText('Pull down. Start fresh.');
  await handle.press('Enter');
  await expect.poll(async () => (await saved(page)).resetCount).toBe(2);
  await page.getByRole('button', { name: 'Close reset device' }).click();
  await page.reload();
  expect((await saved(page)).resetCount).toBe(2);
  await page.locator('.profile').click();
  await expect(page.getByTestId('quota-button')).toContainText('100%');
  await page.locator('.profile').click();
});

test('touch dragging follows the same physical threshold as mouse dragging', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await bootstrap(page, { quotas: { session: 9, weekly: 12 } });
  await page.locator('.profile').click();
  await page.getByTestId('quota-button').click();
  const handle = page.getByTestId('reset-handle');
  await expect(handle).toBeVisible();
  await expect.poll(async () => await handle.evaluate(el => el.style.left)).not.toBe('');
  const rect = (await handle.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const point = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), id: 1, radiusX: 5, radiusY: 5, force: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + 22 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await saved(page)).resetCount).toBe(0);
  const next = (await handle.boundingBox())!;
  const start = { ...point, x: Math.round(next.x + next.width / 2), y: Math.round(next.y + next.height / 2) };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  for (let dy = 15; dy <= 180; dy += 15) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, y: start.y + dy }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await saved(page)).resetCount).toBe(1);
  expect((await saved(page)).quotas).toEqual({ session: 100, weekly: 100 });
  await page.screenshot({ path: 'artifacts/screenshots/06-resetter-touch.png', fullPage: true, animations: 'disabled' });
  await context.close();
});

test('language, dark theme, sound and animation settings apply instantly and persist', async ({ page }) => {
  await bootstrap(page);
  await openSettings(page);
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByTestId('settings-tab-appearance').click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.getByRole('switch', { name: 'Interface animations' }).click();
  await expect(page.getByRole('switch', { name: 'Interface animations' })).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('settings-tab-voice').click();
  await page.getByRole('switch', { name: 'Mechanical sound' }).click();
  await expect(page.getByRole('switch', { name: 'Mechanical sound' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('settings-tab-general').click();
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh');
  await expect(page.getByRole('heading', { name: '常规', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.screenshot({ path: 'artifacts/screenshots/07-settings-dark-zh.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: '你想让我们在 super codex 中构建什么？' })).toBeVisible();
  const state = await saved(page);
  expect(state.language).toBe('zh');
  expect(state.sound).toBe(true);
  expect(state.animations).toBe(false);
  await page.locator('.profile').click();
  if (!await page.locator('.account-submenu').isVisible()) await page.locator('.account-menu').getByRole('button', { name: '帮助', exact: true }).click();
  await page.getByRole('button', { name: '切换中英文', exact: true }).click();
  await page.locator('.profile').click();
  await expect(page.getByRole('heading', { name: /^What would you like to build in super codex\s*\?$/ })).toBeVisible();
});

test('search, pinning, archive and restore preserve conversations', async ({ page }) => {
  await bootstrap(page);
  await completePrompt(page, 'Hello');
  await page.locator('.task-item').hover();
  await page.locator('.task-item').getByRole('button', { name: 'Pin', exact: true }).click();
  expect((await saved(page)).chats[0].pinned).toBe(true);
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder('Search your tasks…').fill('Hello');
  await expect(page.locator('.search-results > button')).toHaveCount(1);
  await page.locator('.search-results > button').click();
  await expect(page.locator('.message')).toHaveCount(2);
  await page.locator('.task-item').hover();
  await page.locator('.task-item').getByRole('button', { name: 'Archive / restore', exact: true }).click();
  expect((await saved(page)).chats[0].archived).toBe(true);
  await page.locator('.profile').click();
  if (!await page.locator('.account-submenu').isVisible()) await page.locator('.account-menu').getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('button', { name: 'Archived tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archived tasks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  expect((await saved(page)).chats[0].archived).toBe(false);
  await page.reload();
  await expect(page.locator('.task-item')).toHaveCount(1);
  await expect(page.locator('.message')).toHaveCount(2);
});

test('automation and skill controls respond and identify their session-only simulation', async ({ page }) => {
  await bootstrap(page);
  await page.getByRole('navigation', { name: 'Application navigation' }).getByRole('button', { name: 'Scheduled tasks', exact: true }).click();
  await page.getByRole('button', { name: 'View simulated automations', exact: true }).click();
  await expect(page.locator('.page-description')).toContainText('do not run in the background');
  await page.getByRole('button', { name: 'Try automation', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Demo enabled', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Demo enabled', exact: true }).click();
  await page.getByRole('navigation', { name: 'Application navigation' }).getByRole('button', { name: 'Plugins', exact: true }).click();
  await page.getByRole('button', { name: 'View demo skills', exact: true }).click();
  await expect(page.locator('.feature-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Add skill', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Added', exact: true })).toHaveCount(2);
});

async function mockBridge(page: Page, deferFirstTurn = false) {
  await page.addInitScript(({ deferFirstTurn }) => {
    const listeners = new Set<(event: Record<string, unknown>) => void>();
    const controls = {
      connected: true, statusReads: 0, turnCalls: [] as Record<string, unknown>[],
      cancelled: [] as { threadId: string; turnId?: string }[],
      resolveFirst: null as null | ((result: { threadId: string; turnId: string }) => void),
      emit(event: Record<string, unknown>) { for (const listener of listeners) listener(event); },
    };
    (window as unknown as { __bridgeTest: typeof controls }).__bridgeTest = controls;
    window.superCodex = {
      getStatus: async () => { controls.statusReads++; return { available: true, connected: controls.connected }; },
      connect: async () => ({ available: true, connected: controls.connected }),
      getModels: async () => [{ id: 'official-test-model', name: 'Official test model', isDefault: true }, ...(localStorage.getItem('test.dropSecond') ? [] : [{ id: 'official-second', name: 'Official second model', isDefault: false }])],
      sendTurn: async payload => {
        controls.turnCalls.push(payload as unknown as Record<string, unknown>);
        const result = { threadId: 'mock-thread', turnId: `turn-${controls.turnCalls.length}` };
        if (deferFirstTurn && controls.turnCalls.length === 1) return new Promise(resolve => { controls.resolveFirst = resolve; });
        return result;
      },
      cancelTurn: async payload => { controls.cancelled.push(payload); return { cancelled: true }; },
      onEvent: listener => { listeners.add(listener as (event: Record<string, unknown>) => void); return () => listeners.delete(listener as (event: Record<string, unknown>) => void); },
      windowAction: async () => undefined,
    };
  }, { deferFirstTurn });
}

async function enterMockLiveMode(page: Page) {
  await page.locator('.codex-mode').click();
  await page.getByRole('button', { name: 'Start a real conversation', exact: true }).click();
  await expect.poll(async () => (await saved(page)).mode).toBe('live');
  await expectAccountMode(page, true);
}

test('each future concept style sends the real prompt through the selected official model and displays its streamed answer', async ({ page }) => {
  await mockBridge(page);
  await bootstrap(page);
  await enterMockLiveMode(page);
  for (const [index, persona] of MODELS.entries()) {
    await page.getByTestId('model-selector').click();
    await page.locator(`[data-model-id="${persona.id}"]`).click();
    const question = `Original question ${index}: explain a unique topic about ${persona.name}`;
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(question);
    await page.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
    await expect.poll(() => page.evaluate(() => (window as any).__bridgeTest.turnCalls.length)).toBe(index + 1);
    const sent = await page.evaluate(index => (window as any).__bridgeTest.turnCalls[index], index);
    expect(sent).toMatchObject({ text: question, model: 'official-test-model' });
    expect(sent.style).toContain(persona.style.en);
    if (Number(persona.version) >= 6.2) expect(sent.style).toContain('Fictional interactive comedy roleplay');
    await expect.poll(async () => (await saved(page)).chats[0].threadId).toBe('mock-thread');
    await page.evaluate(({ index, answer }) => {
      const bridge = (window as any).__bridgeTest;
      bridge.emit({ type:'delta', threadId:'mock-thread',turnId:`turn-${index+1}`,text:answer });
      bridge.emit({ type:'done', threadId:'mock-thread',turnId:`turn-${index+1}` });
    }, {index, answer:`Mock streamed answer ${index}`});
    await expect(page.locator('.message.assistant').last()).toContainText(`Mock streamed answer ${index}`);
    await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  }
});

test('the unified menu preserves actual model selection and safely resets unavailable official IDs', async ({ page }) => {
  await mockBridge(page);
  await bootstrap(page);
  await page.getByTestId('model-selector').click();
  await expect(page.locator('.native-model-menu [data-model-id]')).toHaveCount(16);
  await expect(page.locator('.native-model-menu [data-official-model-id]')).toHaveCount(2);
  await page.getByRole('menuitemradio', { name: 'Official second model' }).click();
  await expect(page.getByTestId('model-selector')).toHaveText('Official second model');
  await enterMockLiveMode(page);
  await expect(page.getByTestId('model-selector')).toHaveText('Official second model');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('super-codex-real-model'))).toBe('official-second');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Use the selected official model');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bridgeTest.turnCalls[0]?.model)).toBe('official-second');
  await page.evaluate(() => (window as any).__bridgeTest.emit({ type:'done', threadId:'mock-thread',turnId:'turn-1' }));
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await page.reload();
  await enterMockLiveMode(page);
  await expect(page.getByTestId('model-selector')).toHaveText('Official second model');
  await page.evaluate(() => localStorage.setItem('test.dropSecond', '1'));
  await page.reload();
  await enterMockLiveMode(page);
  await expect(page.getByTestId('model-selector')).toHaveText('Official test model');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('super-codex-real-model'))).toBe('official-test-model');
});

test('mocked bridge disconnect returns to Demo without recursive status refreshes', async ({ page }) => {
  await mockBridge(page);
  await bootstrap(page);
  await enterMockLiveMode(page);
  const readsBefore = await page.evaluate(() => (window as any).__bridgeTest.statusReads);
  await page.evaluate(() => {
    const bridge = (window as any).__bridgeTest;
    bridge.connected = false;
    for (let i = 0; i < 4; i++) bridge.emit({ type: 'status', available: true, connected: false, reason: 'Mock transport disconnected' });
  });
  await expect(page.getByRole('dialog', { name: 'Connect Codex' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Hello');
  await page.getByRole('textbox', { name: 'Message', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Connect Codex' })).toBeVisible();
  expect((await saved(page)).mode).toBe('demo');
  expect(await page.evaluate(() => (window as any).__bridgeTest.statusReads)).toBe(readsBefore);
  expect(await page.evaluate(() => (window as any).__bridgeTest.turnCalls.length)).toBe(0);
  await expect(page.locator('.message.assistant')).toHaveCount(0);
});

test('mocked live cancellation before turn acknowledgment cannot overwrite the next turn', async ({ page }) => {
  await mockBridge(page, true);
  await bootstrap(page);
  await enterMockLiveMode(page);
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('First live request');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bridgeTest.turnCalls.length)).toBe(1);
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await expect(page.locator('.message.assistant').first()).toContainText('Stopped');
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Second live request');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__bridgeTest.turnCalls.length)).toBe(2);
  await expect.poll(async () => (await saved(page)).chats[0].threadId).toBe('mock-thread');
  await page.evaluate(() => (window as any).__bridgeTest.resolveFirst({ threadId: 'mock-thread', turnId: 'turn-1' }));
  await expect.poll(() => page.evaluate(() => (window as any).__bridgeTest.cancelled)).toEqual([{ threadId: 'mock-thread', turnId: 'turn-1' }]);
  await page.evaluate(() => {
    const bridge = (window as any).__bridgeTest;
    bridge.emit({ type: 'delta', threadId: 'mock-thread', turnId: 'turn-1', text: 'STALE OLD TURN' });
    bridge.emit({ type: 'done', threadId: 'mock-thread', turnId: 'turn-1' });
    bridge.emit({ type: 'delta', threadId: 'other-thread', turnId: 'turn-2', text: 'WRONG THREAD' });
  });
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const bridge = (window as any).__bridgeTest;
    bridge.emit({ type: 'delta', threadId: 'mock-thread', turnId: 'turn-2', text: 'Second reply is intact.' });
    bridge.emit({ type: 'done', threadId: 'mock-thread', turnId: 'turn-2' });
  });
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await expect(page.locator('.message.assistant').last()).toContainText('Second reply is intact.');
  await expect(page.locator('.messages')).not.toContainText('STALE OLD TURN');
  await expect(page.locator('.messages')).not.toContainText('WRONG THREAD');
  expect((await saved(page)).chats[0].messages[1].content).toBe('Stopped');
  expect((await saved(page)).chats[0].messages[3].content).toBe('Second reply is intact.');
});

test('unavailable storage is disclosed while the current session remains usable', async ({ page }) => {
  await installConnectedDemoBridge(page);
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); };
  }, { key: STORAGE_KEY, state: { ...initialState, language: 'en', onboarded: true, speed: 50, sound: false } });
  await page.goto('/');
  await enterDemoMode(page);
  await expect(page.locator('.toast')).toContainText('Local storage is unavailable or full');
  await expect(page.locator('.toast')).toContainText('Export conversations in Settings');
  await completePrompt(page, 'Hello');
  await expect(page.locator('.message.assistant')).toContainText('Offline Demo');
  expect((await saved(page)).chats).toHaveLength(0);
  await openSettings(page);
  await page.getByTestId('settings-tab-data').click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('super-codex-history.json');
});
