import { expect, test } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';

test('future model sends the actual question with a fictional persona and marks the reply', async ({page}) => {
  await page.addInitScript(({key,initial})=>{
    localStorage.setItem(key, JSON.stringify(initial));
    localStorage.setItem('super-codex-model-selection','concept:apex');
    (window as any).__sent=[];
    window.superCodex={platform:'win32',getStatus:async()=>({available:true,connected:true,mode:'live'}),connect:async()=>({available:true,connected:true,mode:'live'}),getModels:async()=>[{id:'real',name:'Real',isDefault:true,efforts:['high']}],sendTurn:async payload=>{(window as any).__sent.push(payload);return {threadId:'t',turnId:'x',model:'real'};},cancelTurn:async()=>({cancelled:false}),onEvent:()=>()=>{},windowAction:async()=>{}};
  }, {key:STORAGE_KEY,initial:{...initialState,language:'zh',modelId:'apex',effort:'Ultimate'}});
  await page.goto('/');
  await expect(page.locator('.codex-mode')).toBeVisible();
  await page.locator('textarea').fill('帮我做一个太空赛车游戏');
  await page.locator('textarea').press('Enter');
  await expect.poll(()=>page.evaluate(()=>(window as any).__sent.length)).toBe(1);
  const sent=await page.evaluate(()=>(window as any).__sent[0]);
  expect(sent.text).toBe('帮我做一个太空赛车游戏');
  expect(sent.style).toContain('GPT-10.0 Apex');
  expect(sent.style).toContain('fictional scenario');
  expect(sent.model).toBe('real');
  await expect(page.locator('.mini-tag')).toHaveText('模拟回答');
});
