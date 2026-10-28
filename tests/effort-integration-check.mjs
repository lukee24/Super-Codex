import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.EFFORT_APP_URL||'http://127.0.0.1:5197/';
const out='artifacts/visual/effort-motion';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:819},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('super-codex-state-v1',JSON.stringify({version:1,language:'en',theme:'dark',modelId:'lattice',effort:'Ultra',speed:20,onboarded:true,sound:false,animations:true})));
 await page.goto(base);await page.getByTestId('effort-selector').click();await page.locator('.effort-visual[data-generation="8"]').waitFor();const clip=page.locator('.native-effort-slider');const first=await clip.screenshot({animations:'allow'});await page.waitForTimeout(700);const second=await clip.screenshot({animations:'allow'});assert.notDeepEqual(first,second,'actual app animation should produce different frames');await writeFile(`${out}/app-gpt8-frame-a.png`,first);await writeFile(`${out}/app-gpt8-frame-b.png`,second);
 for(const [id,generation] of [['meridian',9],['apex',10]]){await page.getByTestId('model-selector').click();await page.locator(`[data-model-id="${id}"]`).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('super-codex-state-v1')).modelId),id);await page.getByTestId('effort-selector').click();await page.locator(`.effort-visual[data-generation="${generation}"]`).waitFor();await writeFile(`${out}/app-${id}.png`,await page.locator('.native-effort-menu').screenshot({animations:'allow'}));}
 assert.deepEqual(errors,[]);console.log('PASS: actual app shows moving GPT-8 effect and persisted GPT-9/10 presets; no page errors');
}finally{await browser.close();}
