import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Standalone visual regression check. The bridge is mocked and no account or
// inference call is made. Run against an isolated local Vite server.
const url=process.env.RESET_SCALE_URL||'http://127.0.0.1:5187';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1920,height:900},deviceScaleFactor:1});
await context.addInitScript(()=>{
  localStorage.setItem('super-codex-state-v1',JSON.stringify({version:1,language:'zh',theme:'light',modelId:'sol',effort:'High',speed:1,planId:'free',quotas:{session:50,weekly:40},resetCount:0,resetHistory:[],chats:[],activeChatId:null,onboarded:true,sound:false,animations:false,mode:'live'}));
  Object.defineProperty(window,'superCodex',{value:{platform:'win32',getStatus:async()=>({available:true,connected:true,mode:'live'}),getModels:async()=>[],onEvent:()=>()=>{},connect:async()=>({available:true,connected:true,mode:'live'}),sendTurn:async()=>({}),cancelTurn:async()=>({}),windowAction:async()=>{}},configurable:true});
});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(url,{waitUntil:'networkidle'});await page.getByTestId('quota-shortcut').click();const stage=page.getByTestId('resetter-rotate-area');await stage.waitFor();await page.waitForTimeout(500);
await mkdir('artifacts/visual/resetter-scale',{recursive:true});const results=[];
for(const size of [{width:1920,height:900},{width:1280,height:819},{width:430,height:932}]){
 await page.setViewportSize(size);await page.waitForTimeout(300);
 const capture=async()=>{
   const png=await stage.screenshot({animations:'disabled'});
   return page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=-1,y1=-1,edge=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(pixels[i]<120&&pixels[i+1]<120&&pixels[i+2]<120){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x<3||y<3||x>=c.width-3||y>=c.height-3)edge++;}}return {stage:[c.width,c.height],darkBounds:[x0,y0,x1+1,y1+1],height:y1-y0+1,edge};},'data:image/png;base64,'+png.toString('base64'));
 };
 const base=await capture();if(base.edge||base.height<(size.width===430?280:350))throw Error(`Unexpected default framing ${JSON.stringify({size,base})}`);
 await page.screenshot({path:`artifacts/visual/resetter-scale/${size.width}x${size.height}-default.png`,animations:'disabled'});
 const box=await stage.boundingBox();await page.mouse.move(box.x+35,box.y+40);await page.mouse.wheel(0,-3000);await page.mouse.down();await page.mouse.move(box.x+95,box.y+90,{steps:15});await page.mouse.up();await page.waitForTimeout(300);
 const rotated=await capture();if(rotated.edge)throw Error(`Zoomed device touches viewport edge ${JSON.stringify({size,rotated})}`);
 await page.screenshot({path:`artifacts/visual/resetter-scale/${size.width}x${size.height}-zoom-rotated.png`,animations:'disabled'});
 results.push({viewport:size,base,rotated});
 // Reload resets camera rotation and zoom between sizes.
 await page.reload();await page.getByTestId('quota-shortcut').click();await stage.waitFor();await page.waitForTimeout(200);
}
if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({results,errors},null,2));await browser.close();
