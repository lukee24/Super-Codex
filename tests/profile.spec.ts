import { expect, test } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

test('connected account shows only official returned email, and clears it on disconnect', async ({ page }) => {
  await page.addInitScript(({ key, initial }) => {
    localStorage.setItem(key, JSON.stringify(initial));
    const listeners = new Set<(event: unknown) => void>();
    (window as any).__profileEvents = listeners;
    window.superCodex = {
      platform:'win32',
      getStatus:async()=>({ available:true, connected:true, mode:'live', account:{ type:'chatgpt', email:'alex@example.com', planType:'plus' } }),
      getModels:async()=>[], connect:async()=>({ available:true, connected:true, mode:'live' }),
      sendTurn:async()=>({threadId:'unused',turnId:'unused',model:'unused'}), cancelTurn:async()=>({cancelled:true}),
      onEvent:listener=>{listeners.add(listener as (event: unknown)=>void);return ()=>listeners.delete(listener as (event: unknown)=>void);},
      windowAction:async()=>undefined,
    };
  },{ key:STORAGE_KEY, initial:{...initialState,language:'en',onboarded:true} });
  await page.goto('/');
  const profile=page.locator('.rail-profile');
  await expect(profile).toHaveAttribute('aria-label','Account: alex@example.com');
  await profile.click();
  await expect(page.locator('.account-menu-heading')).toContainText('alex@example.com');
  await expect(page.locator('.account-menu-heading')).toContainText('Free · Demo plan');
  await expect(page.locator('.account-avatar')).toHaveText('A');
  await page.locator('.account-menu').getByRole('button',{name:'Settings'}).click();
  await page.getByTestId('settings-tab-profile').click();
  await expect(page.getByTestId('profile-page')).toContainText('alex@example.com');
  await expect(page.getByTestId('profile-page')).toContainText('Account activity data unavailable');
  await page.getByTestId('profile-page').getByRole('button',{name:'Back'}).click();
  await page.getByRole('button',{name:'Close settings'}).click();
  await page.evaluate(()=>{for(const listener of (window as any).__profileEvents) listener({type:'status',available:true,connected:false,reason:'Disconnected'});});
  await expect(profile).toHaveAttribute('aria-label','Local creator · Demo plan');
  await profile.click();
  await expect(page.locator('.account-menu-heading')).not.toContainText('alex@example.com');
  await expect(profile).toHaveAttribute('aria-label','Local creator · Demo plan');
});

test('capture profile at the original window size', async ({page})=>{
  await page.setViewportSize({width:1280,height:819});
  await page.addInitScript(({key,initial})=>localStorage.setItem(key,JSON.stringify(initial)),{key:STORAGE_KEY,initial:{...initialState,theme:'dark',language:'zh'}});
  await page.goto('/');
  await page.locator('.rail-profile').click();
  await page.locator('.account-menu').getByRole('button',{name:'设置'}).click();
  await page.getByTestId('settings-tab-profile').click();
  await page.screenshot({path:'artifacts/visual/profile-reference/current.png'});
  await page.getByTestId('profile-page').hover();
  await page.mouse.wheel(0,1600);
  await expect(page.getByRole('heading',{name:'洞察'})).toBeVisible();
  await expect(page.getByRole('img',{name:'账户活动数据不可用'})).toBeVisible();
  await page.getByRole('button',{name:'每周'}).click();
  await expect(page.getByRole('button',{name:'每周'})).toHaveAttribute('aria-pressed','true');
  await page.screenshot({path:'artifacts/visual/profile-reference/current-bottom.png'});
});

test('connected account without email uses neutral fallback and distinguishes demo mode', async ({ page }) => {
  await page.addInitScript(({key,initial})=>{
    localStorage.setItem(key,JSON.stringify(initial));
    window.superCodex={platform:'win32',getStatus:async()=>({available:true,connected:true,mode:'live'}),connect:async()=>({available:true,connected:true,mode:'live'}),getModels:async()=>[],sendTurn:async()=>({threadId:'unused',turnId:'unused',model:'unused'}),cancelTurn:async()=>({cancelled:true}),onEvent:()=>()=>{},windowAction:async()=>undefined};
  },{key:STORAGE_KEY,initial:{...initialState,language:'en',onboarded:true}});
  await page.goto('/');
  const profile=page.locator('.rail-profile');
  await expect(profile).toHaveAttribute('aria-label','Account: ChatGPT account');
  await page.locator('.codex-mode').click();
  await page.getByRole('button',{name:'Use local demo'}).click();
  await profile.click();
  await expect(page.locator('.account-menu-heading')).toContainText('ChatGPT account');
  await expect(page.locator('.account-avatar svg')).toBeVisible();
  await page.locator('.account-menu').getByRole('button',{name:'Help',exact:true}).click();
  await expect(page.getByRole('button',{name:'ChatGPT connected · Local demo'})).toBeVisible();
});
