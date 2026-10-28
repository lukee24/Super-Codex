import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const origin=process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:4173/';
const output='artifacts/visual/unified-current';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:819},deviceScaleFactor:1,locale:'zh-CN',colorScheme:'light'});
const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{
  localStorage.setItem('super-codex-state-v1',JSON.stringify({version:1,language:'zh',theme:'light',modelId:'sol',effort:'High',speed:1,planId:'free',quotas:{session:100,weekly:100},resetCount:0,resetHistory:[],chats:[],activeChatId:null,onboarded:true,sound:false,animations:true,mode:'live'}));
  window.superCodex={platform:'win32',getStatus:async()=>({available:true,connected:true,mode:'live',account:{type:'chatgpt',email:'visual-test@example.invalid',planType:'free'}}),connect:async()=>({available:true,connected:true,mode:'live'}),getModels:async()=>[{id:'mock-sol',name:'GPT-6.1 Sol',isDefault:true},{id:'mock-terra',name:'GPT-6.1 Terra',isDefault:false},{id:'mock-astra',name:'GPT-6 Astra',isDefault:false}],sendTurn:async()=>{throw new Error('This visual capture never sends a prompt.');},cancelTurn:async()=>({cancelled:false}),onEvent:()=>()=>{},windowAction:async()=>{}};
});
try{
  await page.goto(origin,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  async function capture(name){await page.screenshot({path:`${output}/${name}.png`,animations:'disabled'});}
  async function choose(id){await page.getByTestId('model-selector').click();await page.locator(`[data-model-id="${id}"]`).click();}
  await page.getByTestId('model-selector').click();await capture('unified-model-menu-zh');await page.keyboard.press('Escape');
  await choose('crest');await capture('selected-crest-zh');
  await choose('vanta');await capture('selected-vanta-zh');
  await choose('apex');await page.getByTestId('effort-selector').click();await page.getByTestId('effort-range').press('End');
  await page.getByTestId('speed-selector').click();await page.locator('.native-speed-menu').getByRole('menuitemradio',{name:'50×',exact:true}).click();
  await page.getByTestId('effort-selector').click();await capture('gpt10-ultimate-50x-zh');await page.keyboard.press('Escape');
  await choose('crest');await page.getByTestId('effort-selector').click();await page.getByTestId('effort-range').press('Home');
  for(let n=0;n<3;n++)await page.getByTestId('effort-range').press('ArrowRight');
  await capture('high-filled-track-50x-zh');
  const metadata=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},assets:[...document.scripts].map(script=>script.src).filter(Boolean),modelButton:document.querySelector('[data-testid="model-selector"]')?.textContent,effort:document.querySelector('[data-testid="effort-range"]')?.getAttribute('aria-valuetext'),glyphs:[...document.querySelectorAll('[data-speed-glyph]')].map(el=>el.getAttribute('data-speed-glyph')),state:JSON.parse(localStorage.getItem('super-codex-state-v1')||'{}')}));
  await writeFile(`${output}/capture.json`,JSON.stringify({origin,mock:true,account:'visual-test@example.invalid (fictional)',notes:'Official model catalog is mocked. No real account, sign-in, inference or system command was used. Static screenshots disable animations for legibility; real-time animation tests are separate.',metadata,errors},null,2));
  await writeFile(`${output}/README.md`,'# Current unified model UI\n\nAll screenshots are from the local production build at 1280 × 819, DPR 1. The account and official model catalog are explicitly mocked with fictional test data. No real sign-in or inference occurred. Static frames disable animation for legibility; temporal behavior is verified in the Playwright pixel tests.\n\nThe menu is one deduplicated descending list; Crest/Vanta screenshots show selected model labels; GPT-10 adds the local Ultimate preset; High shows animation confined behind the thumb and the shared 50× speed symbol.\n');
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({output,errors,mock:true,asset:metadata.assets}));
}finally{await context.close();await browser.close();}
