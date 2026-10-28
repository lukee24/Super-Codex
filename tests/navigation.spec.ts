import { expect, test } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, initial }) => localStorage.setItem(key, JSON.stringify(initial)), {
    key: STORAGE_KEY, initial: { ...initialState, language: 'en', onboarded: true, sound: false },
  });
  await page.addInitScript(() => { window.superCodex={platform:'win32',getStatus:async()=>({available:true,connected:true,mode:'live'}),connect:async()=>({available:true,connected:true,mode:'live'}),getModels:async()=>[],sendTurn:async()=>({threadId:'unused',turnId:'unused',model:'unused'}),cancelTurn:async()=>({cancelled:true}),onEvent:()=>()=>{},windowAction:async()=>undefined}; });
  await page.goto('/');
  await expect(page.getByRole('dialog', { name:'Connect Codex' })).toHaveCount(0);
});

test('native navigation destinations remain distinct and disclose local-only behavior', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Application navigation' });
  for (const name of ['Spaces', 'Scheduled tasks', 'Plugins', 'Explore', 'Code review', 'Sites']) {
    await rail.getByRole('button', { name, exact: true }).click();
    const destination = page.getByRole('region', { name, exact: true });
    await expect(destination).toBeVisible();
    await expect(destination).toContainText('Local demo');
    await expect(rail.getByRole('button', { name, exact: true })).toHaveClass(/rail-active/);
    const key = name.toLowerCase().replaceAll(' ', '-');
    await page.screenshot({ path: `artifacts/visual/navigation-current/${key}.png`, animations: 'disabled' });
  }
  await rail.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
});

test('local tools and membership stay reachable after navigation restructure', async ({ page }) => {
  const rail = page.getByRole('navigation', { name: 'Application navigation' });
  await rail.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('region', { name: 'Explore' }).getByRole('button', { name: 'Future model lab' }).click();
  await expect(page.getByText('SUPER CODEX LAB')).toBeVisible();
  await rail.getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('.profile').click();
  await expect(page.getByTestId('quota-button')).toContainText('100%');
  await page.screenshot({ path: 'artifacts/visual/navigation-current/account-menu.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Upgrade plan', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Plans', exact: true })).toBeVisible();
});
