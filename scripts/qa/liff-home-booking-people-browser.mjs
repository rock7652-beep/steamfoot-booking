import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root=process.cwd(),out='/tmp/steamfoot-liff-home-booking-people-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/liff-home-booking-people-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"test"','process.env':'{}'},plugins:[{name:'readonly-stubs',setup(b){
 b.onResolve({filter:/^next\/(link|navigation|image)$/},a=>({path:a.path,namespace:'next-stub'}));
 b.onLoad({filter:/.*/,namespace:'next-stub'},a=>({contents:a.path.endsWith('image')?'import React from "react";export default function Image(p){return React.createElement("img",p)}':a.path.endsWith('link')?'import React from "react";export const useLinkStatus=()=>({pending:false}); export default function Link(p){return React.createElement("a",p,p.children)}':'export const useSelectedLayoutSegment=()=>null;export const useSelectedLayoutSegments=()=>[];export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>"/dashboard/beauty";export const useSearchParams=()=>new URLSearchParams();',loader:'js',resolveDir:root}));
 b.onResolve({filter:/^@\/server\/actions\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'actions-stub'}));
 b.onLoad({filter:/.*/,namespace:'actions-stub'},a=>{const s=readFileSync(a.path,'utf8'),names=[...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return{contents:names.map(n=>`export const ${n}=async()=>{throw Error("QA blocked server action")};`).join('\n'),loader:'js'};});
}}]});
const component=readFileSync(path.join(out,'fixture.css'),'utf8');const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+component);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const [width,height] of [[360,844],[390,844],[768,1024],[1024,768],[1366,900]])for(const people of ['1','2','3','none']){
  const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Taipei'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());
  await page.goto('https://synthetic.invalid/?people='+people);
  await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
  const hero=page.locator('section').filter({hasText:'下一次預約'});
  await hero.waitFor({timeout:5000});
  const text=await hero.innerText();
  if(people==='none'){
   if(!text.includes('目前沒有預約')||/\d 位/.test(text))throw Error('Empty home shows phantom people');
  }else{
   if(!text.includes('15:00 · 待到店 · '+people+' 位'))throw Error('Next-booking count wrong: '+text);
   if(!(await page.locator('[data-test="booking"]').innerText()).includes('方案預約 · '+people+' 位'))throw Error('Home/detail count mismatch');
   if(await hero.getByRole('link',{name:'預約詳情',exact:true}).getAttribute('href')!=='/s/synthetic/liff/bookings')throw Error('Detail link changed');
  }
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
  if(errors.length)throw Error(errors.join('\n'));
  await page.screenshot({path:path.join(out,`people-${people}-${width}.png`),fullPage:true});
  results.push({width,height,people,status:'passed'});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({output:out,passed:results.length}));
}finally{await browser.close()}
