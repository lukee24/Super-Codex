import { test, expect } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

test('menus work and GPT-10 preview does not send a message', async ({ page }) => {
  await page.addInitScript(({key,initial})=>{ localStorage.setItem(key,JSON.stringify(initial)); localStorage.setItem('super-codex-model-selection','concept:apex'); },{key:STORAGE_KEY,initial:{...initialState,language:'zh',modelId:'apex',effort:'Ultimate'}});
  await page.goto('/');
  await page.getByRole('button',{name:'添加',exact:true}).click();
  await expect(page.getByRole('menuitem',{name:'文件和文件夹'})).toBeVisible();
  await page.getByRole('button',{name:'帮我批准'}).click();
  await page.getByRole('menuitemradio',{name:/^请求批准/}).click();
  await expect(page.getByRole('button',{name:'请求批准'})).toBeVisible();
  await page.getByRole('textbox',{name:'消息'}).fill('你可以预测未来吗');
  await expect(page.locator('.instant-preview')).toHaveText('会。');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:'请求批准'})).toBeVisible();
});

test('missing CLI does not claim the browser opened', async ({ page }) => {
  await page.addInitScript(()=>{window.superCodex={platform:'win32',getStatus:async()=>({available:false,connected:false,mode:'demo',reason:'CLI missing'}),connect:async()=>({available:false,connected:false,mode:'demo',reason:'CLI missing'}),getModels:async()=>[],sendTurn:async()=>({threadId:'',turnId:'',model:''}),cancelTurn:async()=>({cancelled:false}),onEvent:()=>()=>{},windowAction:async()=>{}};});
  await page.goto('/');
  await page.locator('textarea').fill('hello'); await page.locator('textarea').press('Enter');
  await page.getByRole('button',{name:'连接 ChatGPT'}).click();
  await expect(page.locator('.connection-note')).toContainText('CLI missing');
  await expect(page.locator('.toast')).toHaveCount(0);
});
