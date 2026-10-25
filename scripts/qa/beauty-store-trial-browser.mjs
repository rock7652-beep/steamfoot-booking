// Local synthetic UI acceptance. Backend calls and all external requests are blocked.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),out='/tmp/beauty-store-trial-ui-20261025';mkdirSync(out,{recursive:true});
const before=process.env.TRIAL_FORM_BEFORE;
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Form from ${JSON.stringify(before||path.join(root,'src/app/hq/dashboard/stores/new/new-store-form.tsx'))};createRoot(document.getElementById('root')).render(<Form previewOnly/>);`,resolveDir:root,loader:'tsx'},bundle:true,nodePaths:[path.join(root,'node_modules')],format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'block-backend',setup(b){
 b.onResolve({filter:/^@\/server\//},()=>({path:'server',namespace:'qa'}));
 b.onResolve({filter:/^@\/components\/dashboard-link$/},()=>({path:'link',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='server'?`export const createStoreAction=()=>{throw Error('Backend forbidden')}`:`import {createElement} from 'react';export const DashboardLink=({children,...p})=>createElement('a',p,children);`,loader:'js',resolveDir:root}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url()==='http://synthetic.invalid/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('http://synthetic.invalid/');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
 await page.waitForTimeout(500);if(errors.length)throw Error(errors.join(';'));await page.getByRole('radio',{name:'美業',exact:false}).click();
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});const values=await page.locator('select').first().evaluate(e=>({value:e.value,options:[...e.options].map(o=>o.text)}));
  const body=await page.locator('body').innerText();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  results.push({width,height,...values,hasStartExplanation:body.includes('建店後尚未起算'),overflow});
  if(overflow)throw Error('Overflow '+width);
  if(!before&&(values.value!=='EXPERIENCE'||!values.options.includes('30 天完整功能試用')||!body.includes('建店後尚未起算')))throw Error('Trial UI missing');
  await page.screenshot({path:path.join(out,`${before?'before':'after'}-${width}.png`),fullPage:true});
 }
 if(!before){for(const name of ['音樂教室','運動教室']){await page.getByRole('radio',{name,exact:false}).click();const text=await page.locator('select').first().innerText();if(!text.includes('30 天完整功能試用（人員不限）'))throw Error('Course trial regression');}}
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(out,`${before?'before':'after'}-results.json`),JSON.stringify({synthetic:true,noBackend:true,errors,results},null,2));console.log(JSON.stringify({synthetic:true,errors,results}));
}finally{await browser.close();}
