import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.EFFORT_VISUAL_URL||'http://127.0.0.1:5204/tests/effort-visual-harness.html';
const out='artifacts/visual/effort-fill-current';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:360,height:160},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));const metrics=[];
 for(const generation of [6,7,8,9,10]){
  await page.goto(`${base}?generation=${generation}&effort=High&speed=20`);await page.locator('.effort-particle').first().waitFor();await page.waitForTimeout(150);
  const track=await page.locator('.native-effort-slider').boundingBox();const fill=await page.locator('.effort-visual').boundingBox();const progress=Number(await page.locator('.effort-visual').getAttribute('data-progress'));
  const center=14+(track.width-28)*progress;assert.ok(Math.abs(fill.width-center)<.1,'The filled effect ends at the white thumb center');
  const clip={x:Math.ceil(track.x+center+16),y:Math.ceil(track.y+3),width:Math.floor(track.width-center-18),height:20};
  const rightA=await page.screenshot({clip,animations:'allow'});const frameA=await page.locator('.native-effort-slider').screenshot({animations:'allow'});await page.waitForTimeout(700);const rightB=await page.screenshot({clip,animations:'allow'});const frameB=await page.locator('.native-effort-slider').screenshot({animations:'allow'});
  assert.deepEqual(rightA,rightB,'Unfilled right side must remain pixel-identical while animation runs');assert.notDeepEqual(frameA,frameB,'The filled left side must visibly animate');
  await writeFile(`${out}/gpt${generation}-high-a.png`,frameA);await writeFile(`${out}/gpt${generation}-high-b.png`,frameB);await writeFile(`${out}/gpt${generation}-unfilled-right.png`,rightA);
  metrics.push({generation,progress,fillWidth:fill.width,thumbCenter:center,effect:await page.locator('.effort-visual').getAttribute('data-effect'),unfilledRightIdentical:true});
 }
 await page.goto(`${base}?generation=10&effort=Ultimate&speed=50&motion=reduced`);await page.locator('.effort-visual[data-level="6"]').waitFor();const stillA=await page.locator('.native-effort-slider').screenshot({animations:'allow'});await page.waitForTimeout(700);const stillB=await page.locator('.native-effort-slider').screenshot({animations:'allow'});assert.deepEqual(stillA,stillB,'App reduced motion must stop every generated effect');await writeFile(`${out}/gpt10-ultimate-reduced.png`,stillA);
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`${base}?generation=10&effort=Ultimate&speed=50`);await page.locator('.effort-visual').waitFor();const osA=await page.locator('.native-effort-slider').screenshot({animations:'allow'});await page.waitForTimeout(700);const osB=await page.locator('.native-effort-slider').screenshot({animations:'allow'});assert.deepEqual(osA,osB,'System reduced motion must stop every generated effect');assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({metrics,appReducedMotion:'static',systemReducedMotion:'static',errors},null,2));console.log('PASS: all generations animate on the filled left only; unfilled pixels stay identical; Ultimate and reduced-motion verified.');
}finally{await browser.close();}
