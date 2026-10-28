import { expect, test } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    Object.defineProperty(window, 'superCodex', { value: {
      platform: 'win32', getStatus: async () => ({ available: true, connected: true, mode: 'live' }),
      getModels: async () => [], onEvent: () => () => {}, connect: async () => ({ available: true, connected: true, mode: 'live' }),
      sendTurn: async () => ({}), cancelTurn: async () => {}, windowAction: async () => {},
    }, configurable: true });
  }, {
    key: STORAGE_KEY, state: { ...initialState, language: 'en', onboarded: true, mode: 'live', sound: false, quotas: { session: 17, weekly: 23 } },
  });
  await page.goto('/'); await page.getByTestId('quota-shortcut').click();
  await expect(page.locator('.resetter-stage')).toHaveAttribute('data-renderer', 'three');
  await expect.poll(() => page.getByTestId('reset-handle').evaluate(el => el.style.left)).not.toBe('');
});

test('mouse rotation changes the 3D viewpoint without resetting; the lever still resets', async ({ page }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  const rect = (await area.boundingBox())!;
  await page.mouse.move(rect.x + 60, rect.y + 70); await page.mouse.down();
  await page.mouse.move(rect.x + 100, rect.y + 84, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Math.abs(Number(await area.getAttribute('data-rotation-y')))).toBeGreaterThan(0.3);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(0);
  await expect.poll(() => handle.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('auto');
  const box = (await handle.boundingBox())!; const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y + 180, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
});

test('touch rotation and keyboard rotation move the model without changing quota', async ({ page, context }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  const rect = (await area.boundingBox())!; const cdp = await context.newCDPSession(page);
  const pt = { x: Math.round(rect.x + 60), y: Math.round(rect.y + 70), id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...pt, x: pt.x + 80, y: pt.y + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Math.abs(Number(await area.getAttribute('data-rotation-y')))).toBeGreaterThan(0.5);
  const before = Number(await area.getAttribute('data-rotation-y'));
  await handle.focus(); await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => Number(await area.getAttribute('data-rotation-y'))).toBeGreaterThan(before + 0.2);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(0);
});

test('the device face rotates to the back and back again, then its projected handle still works', async ({ page }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  const rect = (await area.boundingBox())!; const x = rect.x + rect.width / 2 - 40, y = rect.y + rect.height * 0.30;
  const initialWidth = (await handle.boundingBox())!.width;
  // Start on the face itself, above the handle, and rotate more than half a turn.
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 230, y, { steps: 20 }); await page.mouse.up();
  await expect.poll(async () => Math.cos(Number(await area.getAttribute('data-rotation-y')))).toBeLessThan(0);
  await expect.poll(() => handle.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(0);
  await page.waitForTimeout(900);
  await page.mouse.move(x + 230, y); await page.mouse.down(); await page.mouse.move(x, y, { steps: 20 }); await page.mouse.up();
  await expect.poll(async () => Math.cos(Number(await area.getAttribute('data-rotation-y')))).toBeGreaterThan(0.8);
  await expect.poll(() => handle.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('auto');
  const box = (await handle.boundingBox())!;
  expect(box.width).toBeGreaterThan(initialWidth * 0.5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 180, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
});

test('wheel zoom is bounded and keeps the handle projected and operational', async ({ page }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  await expect(page.getByText('Drag the device to rotate it; pull the handle down to reset.')).toHaveCount(0);
  await expect(page.getByText(/Keyboard:.*rotate/)).toHaveCount(0);
  const rect = (await area.boundingBox())!, initial = (await handle.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 80);
  await page.mouse.wheel(0, -140);
  await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBeGreaterThan(1.1);
  await expect.poll(async () => (await handle.boundingBox())!.width).toBeGreaterThan(initial.width);
  await page.mouse.wheel(0, -3000);
  await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBe(1.2);
  await page.mouse.wheel(0, 3000);
  await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBe(0.72);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(0);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBeGreaterThan(1);
  await page.screenshot({ path: 'artifacts/screenshots/10-resetter-zoom.png', animations: 'disabled' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 180, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
});

test('the touch handle resets the local limits after zooming', async ({ page, context }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  const rect = (await area.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 50); await page.mouse.wheel(0, -100);
  await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBeGreaterThan(1);
  const box = (await handle.boundingBox())!, client = await context.newCDPSession(page);
  const point = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2), id: 1 };
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let dy = 15; dy <= 180; dy += 15) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, y: point.y + dy }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
});

test('zoomed tilted device remains fully inside its viewport at desktop, narrow and short sizes', async ({ page }) => {
  const area = page.getByTestId('resetter-rotate-area'), handle = page.getByTestId('reset-handle');
  for (const size of [{ width: 1280, height: 819 }, { width: 430, height: 932 }, { width: 800, height: 600 }]) {
    await page.setViewportSize(size);
    const box = (await area.boundingBox())!;
    await page.mouse.move(box.x + 35, box.y + 40); await page.mouse.wheel(0, -3000);
    await expect.poll(async () => Number(await area.getAttribute('data-zoom'))).toBe(1.2);
    // Rotate and tilt, then inspect the actual rendered stage edges rather than
    // assuming a CSS bounding rectangle proves the 3D panel is in the frame.
    await page.mouse.move(box.x + 35, box.y + 40); await page.mouse.down();
    await page.mouse.move(box.x + 95, box.y + 90, { steps: 20 }); await page.mouse.up();
    const png = await area.screenshot({ animations: 'disabled' });
    const sample = await page.evaluate(async (src: string) => {
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
      let edge = 0, inside = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] < 210 && data[i + 1] < 210 && data[i + 2] < 210) {
          if (x < 3 || y < 3 || x >= width - 3 || y >= height - 3) edge++; else inside++;
        }
      }
      return { edge, inside };
    }, 'data:image/png;base64,' + png.toString('base64'));
    expect(sample.inside).toBeGreaterThan(100);
    expect(sample.edge, `Rendered model touches the stage edge at ${size.width}×${size.height}`).toBe(0);
    await page.keyboard.press('Shift+ArrowLeft'); await page.keyboard.press('Shift+ArrowLeft');
    await expect.poll(() => handle.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('auto');
    // Restore the orientation before exercising the next viewport.
    await page.keyboard.press('Shift+ArrowLeft');
  }
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 + 180, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).resetCount, STORAGE_KEY)).toBe(1);
});
