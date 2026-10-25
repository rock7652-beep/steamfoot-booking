// Synthetic component preview only. All browser requests are intercepted locally.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const output=path.resolve('artifacts/plan-activation-20261025');mkdirSync(output,{recursive:true});
await build({entryPoints:['scripts/qa/plan-activation-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(output,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.resolve('src')},plugins:[{name:'no-backend',setup(b){
 b.onResolve({filter:/^@\/server\//},()=>({path:'action',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},()=>({contents:`export async function setPlanActivationNotificationEnabled(input){return fetch('/save',{method:'POST',body:JSON.stringify(input)}).then(r=>r.json())}`,loader:'js'}));
}}]});
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});writeFileSync(path.join(output,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence=[];
try{
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[480,900]])for(const moduleLabel of ['蒸足','運動','音樂','美業']){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];let calls=0,fail=false;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   if(route.request().url()==='https://synthetic.invalid/save'){
    calls++;const input=route.request().postDataJSON();if(input.expectedStoreId!=='qa-store')throw Error('Wrong store');
    await new Promise(r=>setTimeout(r,150));return route.fulfill({json:fail?{success:false,error:'隔離儲存失敗'}:{success:true}});
   }
   if(route.request().url().startsWith('https://synthetic.invalid/'))return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
   throw Error('Unexpected network request');
  });
  await page.goto(`https://synthetic.invalid/?module=${encodeURIComponent(moduleLabel)}${width===480?'&narrow=1':''}`);await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  const toggle=page.getByRole('switch',{name:'方案開通通知開關'});
  if(!await toggle.isChecked())throw Error('Default must be on');
  if(await page.locator('details').getAttribute('open')!==null)throw Error('Preview must be collapsed');
  await toggle.uncheck();await page.waitForFunction(()=>document.querySelector('input[role="switch"]')?.disabled===false);
  if(await toggle.isChecked()||calls!==1)throw Error('Toggle did not save once');
  await page.getByText('查看訊息預覽',{exact:true}).click();
  await page.setViewportSize({width:height,height:width});await page.setViewportSize({width,height});if(await toggle.isChecked())throw Error('Resize lost state');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Viewport overflow');
  fail=true;await toggle.check();await page.getByRole('alert').filter({hasText:'隔離儲存失敗'}).waitFor();
  if(await toggle.isChecked())throw Error('Failed toggle did not roll back');
  if(width===1366&&moduleLabel==='蒸足'){await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'failed-toggle.png'),fullPage:true});}
  fail=false;await toggle.check();await page.waitForFunction(()=>document.querySelector('input[role="switch"]')?.disabled===false);await page.waitForTimeout(250);
  await page.screenshot({path:path.join(output,`${width}-${moduleLabel}.png`),fullPage:true});
  if(errors.length)throw Error(errors.join('\n'));evidence.push({module:moduleLabel,width,height,calls,overflow:false,resizePreserved:true,failedToggleRolledBack:true});await page.close();
 }
 const page=await browser.newPage({viewport:{width:768,height:1024}});
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://synthetic.invalid/?module=美業&readonly=1');await page.addScriptTag({path:path.join(output,'fixture.js')});if(!await page.getByRole('switch').isDisabled())throw Error('Read-only must disable control');await page.close();
 writeFileSync(path.join(output,'results.json'),JSON.stringify({kind:'synthetic-component-preview',defaultEnabled:true,readOnly:true,evidence},null,2));console.log(JSON.stringify({cases:evidence.length,defaultEnabled:true,readOnly:true,output}));
}finally{await browser.close();}
