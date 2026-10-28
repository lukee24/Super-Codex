import { test, expect, type Page } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/lib/storage';
import { MODELS } from '../src/lib/catalog';

async function start(page: Page, connected = false, overrides: Record<string, unknown> = {}) {
  await page.addInitScript(({ key, state, connected }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    if (!connected) return;
    const listeners = new Set<(event: Record<string, unknown>) => void>();
    const control = { calls: [] as Record<string, unknown>[], emit(event: Record<string, unknown>) { listeners.forEach(listener => listener(event)); } };
    (window as any).__refinement = control;
    window.superCodex = {
      platform:'win32', getStatus:async()=>({available:true,connected:true,mode:'live'}), connect:async()=>({available:true,connected:true,mode:'live'}),
      getModels:async()=>[
        {id:'real-sol',name:'GPT-6.1 Sol',isDefault:true},
        {id:'duplicate-sol',name:'GPT-6.1 Sol',isDefault:false},
        {id:'real-terra',name:'GPT-6.1 Terra',isDefault:false},
        {id:'real-astra',name:'GPT-6 Astra',isDefault:false},
      ],
      sendTurn:async payload=>{ control.calls.push(payload as unknown as Record<string,unknown>);return {threadId:'refinement-thread',turnId:`turn-${control.calls.length}`,model:payload.model||'real-sol'}; },
      cancelTurn:async()=>({cancelled:true}),onEvent:listener=>{listeners.add(listener as (event:Record<string,unknown>)=>void);return()=>listeners.delete(listener as (event:Record<string,unknown>)=>void);},windowAction:async()=>undefined,
    };
  }, {key:STORAGE_KEY,state:{...initialState,language:'en',onboarded:true,sound:false,animations:true,...overrides},connected});
  await page.goto('/');
}
async function choose(page: Page, id: string) {
  await page.getByTestId('model-selector').click();
  await page.locator(`.native-model-menu [data-model-id="${id}"]`).click();
}
async function state(page: Page) { return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}'),STORAGE_KEY); }

test('one model list is unique and descending, including duplicate names from the live catalog', async ({page})=>{
  await start(page,true);
  await page.getByTestId('model-selector').click();
  const menu=page.locator('.native-model-menu');
  const options=menu.getByRole('menuitemradio');
  await expect(options).toHaveCount(21);
  const names=await options.locator('span').allTextContents();
  expect(new Set(names).size).toBe(names.length);
  const versions=await options.evaluateAll(items=>items.map(item=>Number(item.getAttribute('data-version'))));
  expect(versions).toEqual([...versions].sort((a,b)=>b-a));
  expect(names[0]).toBe('GPT-10 Apex');
  expect(names.at(-1)).toBe('GPT-5.6 Luna');
  await expect(menu).not.toContainText('Concept response styles');
  await expect(menu).not.toContainText('16 presets');
  await expect(menu.getByRole('menuitemradio',{name:'GPT-6.1 Sol',exact:true})).toHaveCount(1);
});

test('7.9 and 9 selections immediately display, survive reload, and send their style through a real model', async ({page})=>{
  await start(page,true);
  for(const id of ['crest','meridian']) {
    const persona=MODELS.find(item=>item.id===id)!;
    await choose(page,id);
    await expect(page.getByTestId('model-selector')).toContainText(persona.name);
    expect((await state(page)).modelId).toBe(id);
    await page.reload();
    await expect(page.getByTestId('model-selector')).toContainText(persona.name);
    const prompt=`A custom input for ${persona.name}`;
    await page.getByRole('textbox',{name:'Message',exact:true}).fill(prompt);
    await page.getByRole('textbox',{name:'Message',exact:true}).press('Enter');
    await expect.poll(()=>page.evaluate(()=>(window as any).__refinement.calls.length)).toBe(1);
    const sent=await page.evaluate(()=>(window as any).__refinement.calls[0]);
    expect(sent).toMatchObject({text:prompt,model:'real-sol'});
    expect(sent.style).toContain(persona.style.en);
    expect(sent.style).toContain('Fictional interactive comedy roleplay');
    await page.evaluate(()=>{const c=(window as any).__refinement;c.emit({type:'delta',threadId:'refinement-thread',turnId:'turn-1',text:'A streamed answer to the user input.'});c.emit({type:'done',threadId:'refinement-thread',turnId:'turn-1'});});
    await expect(page.locator('.message.assistant').last()).toContainText('A streamed answer to the user input.');
    await expect(page.getByRole('button',{name:'Stop generating',exact:true})).toHaveCount(0);
  }
});

test('GPT-10 adds Ultimate, saves it, and selecting an older generation normalizes to Ultra', async ({page})=>{
  await start(page,false);
  await choose(page,'apex');
  await page.getByTestId('effort-selector').click();
  const range=page.getByTestId('effort-range');
  await expect(range).toHaveAttribute('max','6');
  await range.press('End');
  await expect(range).toHaveAttribute('aria-valuetext','Ultimate');
  expect((await state(page)).effort).toBe('Ultimate');
  await page.reload();
  await expect(page.getByTestId('model-selector')).toContainText('Apex');
  await expect(page.getByTestId('effort-selector')).toContainText('Ultimate');
  await choose(page,'meridian');
  await expect(page.getByTestId('effort-selector')).toContainText('Ultra');
  expect((await state(page)).effort).toBe('Ultra');
  await page.getByTestId('effort-selector').click();
  await expect(page.getByTestId('effort-range')).toHaveAttribute('max','5');
});

test('inside and outside 50× speed symbols have the same SVG shapes', async ({page})=>{
  await start(page,false,{speed:50});
  await page.getByTestId('effort-selector').click();
  const glyphs=page.locator('[data-speed-glyph="50"] .speed-symbol');
  await expect(glyphs).toHaveCount(2);
  expect(await glyphs.nth(0).innerHTML()).toBe(await glyphs.nth(1).innerHTML());
  await expect(glyphs.nth(0).locator('.speed-sparkles')).toHaveCount(1);
});

async function regionDifference(page:Page, a:Buffer, b:Buffer, leftEnd:number, rightStart:number) {
  return page.evaluate(async ({a,b,leftEnd,rightStart})=>{
    async function pixels(encoded:string){const bytes=Uint8Array.from(atob(encoded),char=>char.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,data:ctx.getImageData(0,0,bitmap.width,bitmap.height).data};}
    const one=await pixels(a),two=await pixels(b);let leftChanged=0,rightChanged=0,rightMax=0;
    for(let y=3;y<one.height-3;y++)for(let x=2;x<one.width-2;x++){const i=(y*one.width+x)*4;const delta=Math.max(Math.abs(one.data[i]-two.data[i]),Math.abs(one.data[i+1]-two.data[i+1]),Math.abs(one.data[i+2]-two.data[i+2]));if(x<leftEnd&&delta>3)leftChanged++;if(x>rightStart){rightMax=Math.max(rightMax,delta);if(delta>1)rightChanged++;}}
    return {leftChanged,rightChanged,rightMax};
  },{a:a.toString('base64'),b:b.toString('base64'),leftEnd,rightStart});
}

test('Medium animation stays behind the thumb and the right track is static', async ({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await start(page,false,{modelId:'meridian',effort:'Medium'});
  await page.getByTestId('effort-selector').click();
  const slider=page.locator('.native-effort-slider');
  await expect(page.getByTestId('effort-range')).toHaveAttribute('aria-valuetext','Medium');
  const box=(await slider.boundingBox())!;
  const progress=Number(await slider.getAttribute('data-progress'));
  expect(progress).toBeCloseTo(.4);
  const thumbCenter=14+(box.width-28)*progress;
  const fill=await slider.locator('.effort-visual').boundingBox();
  expect(fill!.width).toBeLessThanOrEqual(thumbCenter+1);
  const first=await slider.screenshot({animations:'allow'});
  await page.waitForTimeout(650);
  const second=await slider.screenshot({animations:'allow'});
  const result=await regionDifference(page,first,second,Math.floor(thumbCenter-16),Math.ceil(thumbCenter+17));
  expect(result.leftChanged).toBeGreaterThan(3);
  expect(result.rightChanged).toBe(0);
  expect(result.rightMax).toBeLessThanOrEqual(1);
});
