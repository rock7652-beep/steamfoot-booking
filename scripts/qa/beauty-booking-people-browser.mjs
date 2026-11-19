import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root=process.cwd(),out='/tmp/steamfoot-beauty-booking-people-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/beauty-booking-people-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"test"','process.env':'{}'},plugins:[{name:'readonly-stubs',setup(b){
 b.onResolve({filter:/^next\/(link|navigation|image)$/},a=>({path:a.path,namespace:'next-stub'}));
 b.onLoad({filter:/.*/,namespace:'next-stub'},a=>({contents:a.path.endsWith('image')?'import React from "react";export default function Image(p){return React.createElement("img",p)}':a.path.endsWith('link')?'import React from "react";export const useLinkStatus=()=>({pending:false}); export default function Link(p){return React.createElement("a",p,p.children)}':'export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>"/dashboard/beauty";export const useSearchParams=()=>new URLSearchParams();',loader:'js',resolveDir:root}));
 b.onResolve({filter:/^@\/server\/actions\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'actions-stub'}));
 b.onLoad({filter:/.*/,namespace:'actions-stub'},a=>{const s=readFileSync(a.path,'utf8'),names=[...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return{contents:names.map(n=>`export const ${n}=async()=>{throw Error("QA blocked server action")};`).join('\n'),loader:'js'};});
}}]});
const component=readFileSync(path.join(out,'fixture.css'),'utf8');const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+component);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const [width,height] of [[360,844],[390,844],[768,1024],[1024,768],[1366,900]])for(const [scenario,count,services] of [['two',2,2],['journey',1,2],['mixed',2,3],['unnamed',2,2],['single',1,1]]){
  const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Taipei'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());
  await page.goto('https://synthetic.invalid/?case='+scenario);
  await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
  const row=page.locator('[data-customer-booking-row]');await row.waitFor({timeout:5000});
  if(await row.count()!==1)throw Error('Companions should share one booking card');
  const summary=page.locator('[data-customer-booking-row] > summary');
  if(!(await summary.innerText()).includes(count+' 位'))throw Error('Incorrect visible people count: '+await summary.innerText());
  await summary.click();
  if(await row.locator('.beauty-booking-row').count()!==services)throw Error('Missing individual service rows');
  if(scenario==='two'&&!(await row.innerText()).includes('同行者'))throw Error('Companion missing');
  if(scenario==='journey'&&!(await row.innerText()).includes('第 2/2 段'))throw Error('Journey detail missing');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
  await page.screenshot({path:path.join(out,`${scenario}-${width}.png`),fullPage:true});
  await page.setViewportSize({width:width===360?768:360,height});
  if(await row.getAttribute('open')===null)throw Error('Resize lost expanded state');
  await page.getByRole('button',{name:'歷史紀錄',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-customer-booking-row]')?.textContent.includes('已完成'));
  if(!(await row.innerText()).includes(count+' 位'))throw Error('History count missing');
  await page.getByText('首頁',{exact:true}).click();
  await page.locator('.beauty-next-card').waitFor();
  if(!(await page.locator('.beauty-next-card').innerText()).includes('共 '+count+' 位'))throw Error('Home recipient count incorrect');
  if(errors.length)throw Error(errors.join('\n'));
  results.push({scenario,width,height,people:count,services,upcoming:true,history:true,overflow:false});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({output:out,passed:results.length}));
}finally{await browser.close()}
