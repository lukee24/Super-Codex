import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true});
const origin=process.env.CONNECTION_CHECK_URL||'http://127.0.0.1:5193/';
const initial={version:1,language:'en',theme:'light',modelId:'astra',effort:'High',speed:1,planId:'free',quotas:{session:100,weekly:100},resetCount:0,resetHistory:[],chats:[],activeChatId:null,onboarded:true,sound:false,animations:false,mode:'live'};
async function makePage(mockBridge){
 const context=await browser.newContext({viewport:{width:1280,height:819}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({initial,mockBridge})=>{
  localStorage.setItem('super-codex-state-v1',JSON.stringify(initial));
  if(mockBridge){const listeners=[];const control={connected:false,calls:[],emit(event){listeners.forEach(fn=>fn(event));}};window.__gateTest=control;
   window.superCodex={getStatus:async()=>({available:true,connected:control.connected,mode:control.connected?'live':'demo'}),connect:async()=>({available:true,connected:control.connected,mode:control.connected?'live':'demo'}),getModels:async()=>[{id:'actual-first',name:'Actual first',isDefault:true},{id:'actual-second',name:'Actual second',isDefault:false}],sendTurn:async payload=>{control.calls.push(payload);return{threadId:'t',turnId:'1'}},cancelTurn:async()=>({cancelled:true}),onEvent:fn=>{listeners.push(fn);return()=>{}},windowAction:async()=>{}};
  }
 },{initial,mockBridge});await page.goto(origin);return {context,page,errors};
}
async function submitDraft(page,text){const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill(text);await input.press('Enter');await expect(page.getByRole('dialog',{name:'Connect Codex'})).toBeVisible();await expect(input).toHaveValue(text);return input;}
try{
 const web=await makePage(false);const webDialog=web.page.getByRole('dialog',{name:'Connect Codex'});
 await expect(webDialog).toHaveCount(0);await web.page.getByRole('textbox',{name:'Message',exact:true}).press('Enter');await expect(webDialog).toHaveCount(0);
 const webInput=await submitDraft(web.page,'Unsent web draft');
 assert.equal(await web.page.locator('.application-body').getAttribute('inert'),'');
 await expect(webDialog.getByText('This web page cannot run local Codex. Use the Windows desktop app to connect ChatGPT.')).toBeVisible();
 await expect(webDialog.getByRole('button',{name:'Explore Demo'})).toHaveCount(0);
 await expect.poll(()=>web.page.evaluate(()=>!!document.activeElement?.closest('.connect-modal'))).toBe(true);
 for(let n=0;n<7;n++){await web.page.keyboard.press('Tab');assert.equal(await web.page.evaluate(()=>!!document.activeElement?.closest('.connect-modal')),true,'Focus stays in the connection dialog while open');}
 await web.page.keyboard.press('Escape');await expect(webDialog).toHaveCount(0);await expect(webInput).toHaveValue('Unsent web draft');
 await webInput.press('Enter');await expect(webDialog).toBeVisible();await web.page.mouse.click(5,5);await expect(webDialog).toHaveCount(0);await expect(webInput).toHaveValue('Unsent web draft');
 assert.deepEqual(web.errors,[]);await web.context.close();

 const mock=await makePage(true);const mockDialog=mock.page.getByRole('dialog',{name:'Connect Codex'});await expect(mockDialog).toHaveCount(0);
 const mockInput=await submitDraft(mock.page,'Test the selected model');assert.equal(await mock.page.evaluate(()=>window.__gateTest.calls.length),0);
 await mock.page.evaluate(()=>{window.__gateTest.connected=true;window.__gateTest.emit({type:'status',available:true,connected:true,mode:'live'});});
 await expect(mockDialog).toHaveCount(0);await expect(mockInput).toHaveValue('Test the selected model');assert.equal(await mock.page.evaluate(()=>window.__gateTest.calls.length),0,'Authentication must not send the draft automatically');
 await mock.page.getByTestId('model-selector').click();const menu=mock.page.locator('.native-model-menu');
 await menu.locator('[data-official-model-id="actual-first"]').waitFor();assert.equal(await menu.locator('[data-official-model-id]').count(),2);assert.equal(await menu.locator('[data-model-id]').count(),16);assert.equal(await menu.locator('.native-real-model-link').count(),0);
 await menu.locator('[data-official-model-id="actual-second"]').click();await expect(mock.page.getByTestId('model-selector')).toHaveText('Actual second');
 await mockInput.press('Enter');await mock.page.waitForFunction(()=>window.__gateTest.calls.length===1);assert.equal(await mock.page.evaluate(()=>window.__gateTest.calls[0].model),'actual-second');
 await mock.page.evaluate(()=>window.__gateTest.emit({type:'done',threadId:'t',turnId:'1'}));await expect(mock.page.getByRole('button',{name:'Stop generating'})).toHaveCount(0);
 await mock.page.evaluate(()=>{window.__gateTest.connected=false;window.__gateTest.emit({type:'status',available:true,connected:false,mode:'demo'});});
 await expect(mockDialog).toHaveCount(0);await submitDraft(mock.page,'Retry after disconnect');assert.equal(await mock.page.evaluate(()=>window.__gateTest.calls.length),1);
 assert.deepEqual(mock.errors,[]);await mock.context.close();
 console.log('PASS: no startup prompt; nonempty submission opens connection with preserved draft; mock sign-in never auto-sends; real catalog ID is selected and disconnect prompts only on the next submission.');
}finally{await browser.close();}
