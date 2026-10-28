import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.EFFORT_VISUAL_URL||'http://127.0.0.1:5197/tests/effort-visual-harness.html';
const out='artifacts/visual/effort-motion';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:360,height:160},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const sample=async(query)=>{await page.goto(`${base}?${query}`);await page.locator('.effort-particle').first().waitFor();await page.waitForTimeout(150);const locator=page.locator('.native-effort-slider');const first=await locator.screenshot({animations:'allow'});const transform1=await page.locator('.effort-particle').first().evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(800);const second=await locator.screenshot({animations:'allow'});const transform2=await page.locator('.effort-particle').first().evaluate(e=>getComputedStyle(e).transform);return {first,second,transform1,transform2,count:await page.locator('.effort-particle').count(),duration:await page.locator('.effort-particle').first().evaluate(e=>getComputedStyle(e).animationDuration)};};
 const ultra6=await sample('generation=6&effort=Ultra&speed=1');assert.notDeepEqual(ultra6.first,ultra6.second,'Ultra must visibly animate over time');assert.notEqual(ultra6.transform1,ultra6.transform2,'particle must move between frames');
 await writeFile(`${out}/gpt6-ultra-frame-a.png`,ultra6.first);await writeFile(`${out}/gpt6-ultra-frame-b.png`,ultra6.second);
 const future8=await sample('generation=8&effort=Ultra&speed=1');const future9=await sample('generation=9&effort=Ultra&speed=1');const future=await sample('generation=10&effort=Ultra&speed=50');assert.ok(future8.count>ultra6.count&&future9.count>future8.count&&future.count>future9.count,'8, 9 and 10 have distinct concept effects');assert.ok(parseFloat(future.duration)<parseFloat(ultra6.duration),'demo speed changes effect timing');assert.notDeepEqual(future.first,future.second);await writeFile(`${out}/gpt8-ultra.png`,future8.first);await writeFile(`${out}/gpt9-ultra.png`,future9.first);await writeFile(`${out}/gpt10-ultra-frame-a.png`,future.first);await writeFile(`${out}/gpt10-ultra-frame-b.png`,future.second);
 const low=await sample('generation=6&effort=Low&speed=1');assert.ok(low.count<ultra6.count,'reasoning choices have different effects');
 const reduced=await sample('generation=10&effort=Ultra&speed=50&motion=reduced');assert.deepEqual(reduced.first,reduced.second,'reduced-motion setting must keep the visual still');
 await page.emulateMedia({reducedMotion:'reduce'});const systemReduced=await sample('generation=10&effort=Ultra&speed=50');assert.deepEqual(systemReduced.first,systemReduced.second,'OS reduced motion must keep the visual still');
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({source:'Super Codex local concept visual; native reference frames recorded separately in native-effort-motion',low6:{particleCount:low.count,duration:low.duration},ultra6:{particleCount:ultra6.count,duration:ultra6.duration,transform1:ultra6.transform1,transform2:ultra6.transform2},future8:{particleCount:future8.count,duration:future8.duration},future9:{particleCount:future9.count,duration:future9.duration},future10:{particleCount:future.count,duration:future.duration},reducedMotion:'static',osReducedMotion:'static',errors},null,2));
 console.log('PASS: moving Ultra frames, GPT-10 differences, speed timing, app/OS reduced-motion; no page errors');
} finally {await browser.close();}
