import { test, expect, type Page } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

async function openFromKeyboard(page: Page) {
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    Object.defineProperty(window, 'superCodex', { value: {
      platform: 'win32', getStatus: async () => ({ available: true, connected: true, mode: 'live' }),
      getModels: async () => [], onEvent: () => () => {}, connect: async () => ({ available: true, connected: true, mode: 'live' }),
      sendTurn: async () => ({}), cancelTurn: async () => {}, windowAction: async () => {},
    }, configurable: true });
  }, {
    key: STORAGE_KEY,
    state: { ...initialState, language: 'en', onboarded: true, mode: 'live', sound: false, quotas: { session: 17, weekly: 23 } },
  });
  await page.goto('/');
  const opener = page.getByTestId('quota-shortcut');
  await opener.focus();
  await page.keyboard.press('Enter');
  const handle = page.getByTestId('reset-handle');
  await expect(handle).toBeVisible();
  await expect(handle).toBeFocused();
  await expect(page.locator('.resetter-stage')).toHaveAttribute('data-renderer', 'three');
  await expect.poll(() => handle.evaluate(element => element.style.left)).not.toBe('');
  return { opener, handle, close: page.getByRole('button', { name: 'Close reset device' }) };
}

test('resetter traps Tab in both directions and restores keyboard focus without changing quotas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { opener, handle, close } = await openFromKeyboard(page);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(handle).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(handle).toBeFocused();
  await page.screenshot({ path: 'artifacts/screenshots/08-resetter-refined-ready.png', fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'The global reset' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.quotas).toEqual({ session: 17, weekly: 23 });
  expect(saved.resetCount).toBe(0);
  expect(errors).toEqual([]);
});

test('arrow keys operate the same lever and close restores focus during the success state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { opener, handle, close } = await openFromKeyboard(page);
  await page.keyboard.press('ArrowDown');
  await expect(handle).toHaveAttribute('aria-valuenow', '24');
  await page.keyboard.press('ArrowUp');
  await expect(handle).toHaveAttribute('aria-valuenow', '0');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
  await expect(page.locator('.resetter-status')).toHaveText('All local limits restored.');
  await page.screenshot({ path: 'artifacts/screenshots/09-resetter-refined-success.png', fullPage: true, animations: 'disabled' });
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'The global reset' })).toHaveCount(0);
  await expect(opener).toBeFocused();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.quotas).toEqual({ session: 100, weekly: 100 });
  expect(saved.resetHistory[0].before).toEqual({ session: 17, weekly: 23 });
  expect(saved.resetCount).toBe(1);
  expect(errors).toEqual([]);
});
