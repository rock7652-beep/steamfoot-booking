// Local synthetic preview. No server/database requests or production writes.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),output=path.join(root,'artifacts/music-subject-defaults-20261112');
mkdirSync(output,{recursive:true});
await build({entryPoints:['scripts/qa/music-subject-defaults-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:'/tmp/music-subject-defaults-fixture.js',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')},plugins:[{name:'isolated-subject',setup(builder){
 builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 builder.onResolve({filter:/^next\/link$|(?:^|\/)app-link$/},()=>({path:'link',namespace:'qa'}));
 builder.onResolve({filter:/^@\/server\//},args=>({path:path.join(root,'src',args.path.slice(2)+'.ts'),namespace:'blocked-server'}));
 builder.onLoad({filter:/.*/,namespace:'blocked-server'},args=>({contents:[...readFileSync(args.path,'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m=>`export const ${m[1]}=()=>{throw Error('Backend calls forbidden in synthetic QA')};`).join('\n'),loader:'js'}));
 builder.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='navigation'?`export const usePathname=()=>'/hq/dashboard/courses';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},replace(){},refresh(){}});`:`import {createElement} from 'react';const Link=({children,prefetch,scroll,...props})=>createElement('a',props,children);export default Link;export const AppLink=Link;export const useLinkStatus=()=>({pending:false});`,loader:'js',resolveDir:root}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
 const load=async()=>{await page.goto('https://synthetic.invalid/hq/dashboard/courses?view=catalog');await page.addStyleTag({content:css.css});await page.addScriptTag({path:'/tmp/music-subject-defaults-fixture.js'});await page.getByRole('cell',{name:'100 分鐘',exact:true}).waitFor();};
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
  await page.setViewportSize({width,height});await load();
  assert(await page.getByRole('cell',{name:'僅後台安排',exact:true}).count()===1,'Saved visibility missing');
  await page.getByRole('button',{name:'暑期專班操作',exact:true}).click();await page.getByRole('button',{name:'編輯',exact:true}).click();
  assert(await page.locator('[name="durationMinutes"]').inputValue()==='100','Editor reverted to default duration');
  assert(await page.locator('[name="visibility"]').inputValue()==='HIDDEN','Editor lost visibility');
  assert(await page.locator('[name="precautions"]').inputValue()==='請帶樂器','Editor lost precautions');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
  await page.screenshot({path:path.join(output,`editor-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'儲存',exact:true}).click();await page.locator('form').waitFor({state:'detached'});
  await load();assert(await page.getByRole('cell',{name:'100 分鐘',exact:true}).count()===1,'Reload reverted saved duration');
  await page.screenshot({path:path.join(output,`catalog-${width}.png`),fullPage:true});
  results.push({width,height,list:100,editor:100,afterSaveAndReload:100,visibility:'HIDDEN',precautions:'preserved'});
 }
 assert(errors.length===0,errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'synthetic real-component UI; no production writes',results,errors},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
