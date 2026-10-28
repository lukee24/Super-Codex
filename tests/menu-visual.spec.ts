import {test,expect} from '@playwright/test';
import {initialState,STORAGE_KEY} from '../src/lib/storage';
test('reference menus expose matching geometry and scrollable states',async({page})=>{
  await page.addInitScript(({key,initial})=>localStorage.setItem(key,JSON.stringify(initial)),{key:STORAGE_KEY,initial:{...initialState,language:'zh',theme:'dark'}});
  await page.setViewportSize({width:1280,height:819}); await page.goto('/');
  await page.getByRole('button',{name:'帮我批准'}).click();
  const approval=page.locator('.replica-approval'); await expect(approval).toBeVisible();
  await approval.screenshot({path:'artifacts/visual/menu-approval-current.png'});
  await expect(approval.getByRole('menuitemradio')).toHaveCount(3);
  await page.getByRole('button',{name:'添加',exact:true}).click();
  const add=page.locator('.replica-add'); await expect(add).toBeVisible();
  await add.screenshot({path:'artifacts/visual/menu-add-top-current.png'});
  await add.evaluate(el=>{el.scrollTop=el.scrollHeight});
  await expect(add.getByRole('menuitem',{name:/Plugin Management/})).toBeVisible();
  await add.screenshot({path:'artifacts/visual/menu-add-bottom-current.png'});
});
