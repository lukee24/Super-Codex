import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// All account/model data below is synthetic. No OpenAI account or network is used.
const browser = await chromium.launch({headless:true});
const initial = {version:1,language:'en',theme:'light',modelId:'astra',effort:'High',speed:1,planId:'free',quotas:{session:100,weekly:100},resetCount:0,resetHistory:[],chats:[],activeChatId:null,onboarded:true,sound:false,animations:false,mode:'demo'};
async function scenario(models, reference, expectedId, {defer=false, expectedFallback=false, empty=false}={}) {
  const context=await browser.newContext({viewport:{width:1280,height:819}}); const page=await context.newPage(); const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({initial,models,defer})=>{
    localStorage.setItem('super-codex-state-v1',JSON.stringify(initial));
    const listeners=[];const c={connected:false,calls:[],models,hold:defer,releases:[],emit(e){for(const f of listeners)f(e)},release(){c.hold=false;for(const f of c.releases.splice(0))f(c.models)}};window.__referenceCheck=c;
    window.superCodex={getStatus:async()=>({available:true,connected:c.connected,mode:c.connected?'live':'demo'}),connect:async()=>({available:true,connected:c.connected,mode:c.connected?'live':'demo'}),getModels:async()=>c.hold?new Promise(resolve=>c.releases.push(resolve)):c.models,sendTurn:async payload=>{c.calls.push(payload);return{threadId:'mock-thread',turnId:'mock-turn'}},cancelTurn:async()=>({cancelled:true}),onEvent:fn=>{listeners.push(fn);return()=>{}},windowAction:async()=>{}};
  },{initial,models,defer});
  await page.goto('http://127.0.0.1:5191/');await page.getByTestId('model-selector').click();
  const menu=page.locator('.native-model-menu');
  if(defer){await mkdir('artifacts/screenshots',{recursive:true});await page.screenshot({path:'artifacts/screenshots/reference-model-menu.png',animations:'disabled'});}
  await menu.locator(`[data-reference-model="${reference}"]`).click();
  await expect(page.getByTestId('model-selector')).toHaveText(reference==='default'?'Default':reference);
  if(defer){
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('super-codex-reference-model'))).toBe(reference);
    await page.reload();
    await expect(page.getByTestId('model-selector')).toHaveText(reference);
    assert.equal(await page.evaluate(()=>window.__referenceCheck.calls.length),0,'Reload must not issue a model call or start login');
    await page.getByTestId('model-selector').click();
    await expect(page.locator(`[data-reference-model="${reference}"]`)).toHaveAttribute('aria-checked','true');
    await page.keyboard.press('Escape');
  }
  await page.getByRole('textbox',{name:'Message'}).fill('Please explain my task.');
  await page.getByRole('textbox',{name:'Message'}).press('Enter');
  await expect(page.getByRole('dialog',{name:'Connect Codex'})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.__referenceCheck.calls.length),0);
  await page.evaluate(()=>{const c=window.__referenceCheck;c.connected=true;c.emit({type:'status',available:true,connected:true,mode:'live'});});
  await expect(page.getByRole('dialog',{name:'Connect Codex'})).toBeHidden();
  await expect(page.getByRole('textbox',{name:'Message'})).toHaveValue('Please explain my task.');
  if(defer||empty){
    await page.getByRole('textbox',{name:'Message'}).press('Enter');
    assert.equal(await page.evaluate(()=>window.__referenceCheck.calls.length),0,'Do not send before model selection is verified');
    await expect(page.getByRole('textbox',{name:'Message'})).toHaveValue('Please explain my task.');
  }
  if(defer)await page.evaluate(()=>window.__referenceCheck.release());
  if(empty){
    await page.waitForTimeout(150);
    await page.getByRole('textbox',{name:'Message'}).press('Enter');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.__referenceCheck.calls.length),0,'Empty catalog must never be reported as a verified model');
    await expect(page.getByRole('textbox',{name:'Message'})).toHaveValue('Please explain my task.');
    assert.equal(await page.evaluate(()=>localStorage.getItem('super-codex-reference-model')),reference,'Unverified reference must survive a failed catalog fetch');
  }else{
    if(expectedFallback)await expect(page.getByRole('status')).toContainText(/reference model/i);
    await expect(page.getByTestId('model-selector')).toHaveText(models.find(m=>m.id===expectedId).name);
    await page.getByRole('textbox',{name:'Message'}).press('Enter');
    await page.waitForFunction(()=>window.__referenceCheck.calls.length===1);
    const payload=await page.evaluate(()=>window.__referenceCheck.calls[0]);
    assert.equal(payload.model,expectedId,'Only the actual model id from the returned catalog can be sent');
    assert.match(payload.style,/Methodical and explicit/,'A selected concept remains a style instruction, never an actual model id');
    assert.equal(await page.evaluate(()=>localStorage.getItem('super-codex-reference-model')),null,'A verified or resolved reference must not remain pending');
  }
  assert.deepEqual(errors,[]);await context.close();
}
async function invalidSavedReference(){
  const context=await browser.newContext({viewport:{width:1280,height:819}});const page=await context.newPage();
  await page.addInitScript(initial=>{localStorage.setItem('super-codex-state-v1',JSON.stringify(initial));localStorage.setItem('super-codex-reference-model','arbitrary-unsafe-model-id');},initial);
  await page.goto('http://127.0.0.1:5191/');
  await expect(page.getByTestId('model-selector')).toHaveText('GPT-6 Astra');
  await page.getByTestId('model-selector').click();
  assert.equal(await page.locator('[data-reference-model][aria-checked=true]').count(),0,'An unknown saved value must not become a pending reference');
  assert.equal(await page.locator('[data-official-model-id]').count(),0,'A saved string must never become an official model');
  await context.close();
}
try{
  const actual=[{id:'actual-1',name:'Actual default',isDefault:true,efforts:['high']},{id:'actual-2',name:'GPT-5.6 Luna',isDefault:false,efforts:['high']}];
  await scenario(actual,'GPT-5.6 Luna','actual-2',{defer:true});
  await scenario(actual,'GPT-6 Luna','actual-1',{expectedFallback:true});
  await scenario(actual,'default','actual-1');
  await scenario([],'GPT-6 Luna',null,{empty:true});
  await invalidSavedReference();
  console.log('PASS: screenshot reference survives reload, unknown values are ignored, and only verified catalog IDs can be sent; draft, style, fallback and empty-catalog guards are preserved.');
}finally{await browser.close();}
