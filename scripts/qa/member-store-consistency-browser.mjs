import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root=process.cwd(),out='/tmp/steamfoot-member-store-consistency-preview';mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/member-store-consistency-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"test"','process.env':'{}'},plugins:[{name:'readonly-stubs',setup(b){
 b.onResolve({filter:/^next\/(link|navigation|image)$/},a=>({path:a.path,namespace:'next-stub'}));
 b.onLoad({filter:/.*/,namespace:'next-stub'},a=>({contents:a.path.endsWith('image')?'import React from "react";export default function Image(p){return React.createElement("img",p)}':a.path.endsWith('link')?'import React from "react";export const useLinkStatus=()=>({pending:false}); export default function Link(p){return React.createElement("a",p,p.children)}':'export const useSelectedLayoutSegment=()=>null;export const useSelectedLayoutSegments=()=>[];export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>"/dashboard/beauty";export const useSearchParams=()=>new URLSearchParams(location.search);',loader:'js',resolveDir:root}));
 b.onResolve({filter:/^@\/server\/actions\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'actions-stub'}));
 b.onLoad({filter:/.*/,namespace:'actions-stub'},a=>{const s=readFileSync(a.path,'utf8'),names=[...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return{contents:names.map(n=>`export const ${n}=async(...args)=>{if(["selectCentralMemberStoreAction","selectLiffMemberStoreAction"].includes("${n}")){window.qaSelections.push({name:"${n}",slug:args[0].get("storeSlug"),entry:args[0].get("memberEntry")});return;}throw Error("QA blocked server action: ${n}")};`).join('\n'),loader:'js'};});
}}]});
const component=readFileSync(path.join(out,'fixture.css'),'utf8');const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+component);
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const results=[];
try{
 for(const [width,height] of [[360,844],[390,844],[768,1024],[1024,768],[1366,900]])for(const moduleName of ['steam','music','sports','beauty']){
  const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Taipei'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).pathname==='/pricing/brand/steam-butler-logo.png'?r.fulfill({contentType:'image/png',body:readFileSync(path.join(root,'public/pricing/brand/steam-butler-logo.png'))}):r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());
  const mount=async suffix=>{await page.goto('https://synthetic.invalid/?module='+moduleName+'&memberEntry=liff'+suffix);await page.evaluate(()=>window.qaSelections=[]);await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});};
  await mount('');
  const trigger=page.getByRole('button',{name:/目前門市：/});await trigger.waitFor({timeout:5000});await trigger.click();
  const menu=page.getByRole('menu',{name:'',exact:true});
  const slugs=await menu.locator('input[name="storeSlug"]').evaluateAll(nodes=>nodes.map(n=>n.value));
  if(JSON.stringify(slugs)!==JSON.stringify(['steam','music','sports','beauty',...Array.from({length:12},(_,i)=>'extra-'+i)]))throw Error('Module store lists differ: '+moduleName);
  if(!(await menu.locator('[aria-current="location"]').isDisabled()))throw Error('Current store selectable');
  const box=await menu.evaluate(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,scroll:e.scrollHeight>e.clientHeight}});
  if(box.left<0||box.right>width||box.bottom>height||!box.scroll)throw Error('Menu bounds/scroll: '+JSON.stringify({moduleName,width,box}));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Page overflow');
  await page.screenshot({path:path.join(out,`${moduleName}-${width}.png`),fullPage:true});
  await page.setViewportSize({width:width===360?768:360,height});if(await menu.count()!==1)throw Error('Resize lost menu');
  await trigger.press('Escape');if(await menu.count())throw Error('Escape failed');
  await trigger.click();await page.getByText('隔離預覽・不會切換正式門市',{exact:true}).click();if(await menu.count())throw Error('Outside close failed');
  if(moduleName==='beauty'){
   await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'編輯資料 ›',exact:true}).click();
   await page.getByLabel('姓名',{exact:true}).fill('未儲存的合成資料');
   await trigger.click();const rejected=page.waitForEvent('dialog');const click=page.getByRole('menuitem',{name:/暖暖蒸足/}).click();await(await rejected).dismiss();await click;
   if((await page.evaluate(()=>window.qaSelections)).length)throw Error('Rejected draft guard switched store');
   if(await page.getByLabel('姓名',{exact:true}).inputValue()!=='未儲存的合成資料')throw Error('Draft lost');
   const confirmed=page.waitForEvent('dialog');const click2=page.getByRole('menuitem',{name:/暖暖蒸足/}).click();await(await confirmed).accept();await click2;
  }else{await trigger.click();await page.getByRole('menuitem',{name:moduleName==='steam'?/舒生活Soulife肩頸按摩/:/暖暖蒸足/}).click();}
  await page.waitForFunction(()=>window.qaSelections.length===1);
  const selected=await page.evaluate(()=>window.qaSelections[0]);
  if(selected.slug!==(moduleName==='steam'?'beauty':'steam')||selected.name!==(moduleName==='steam'?'selectLiffMemberStoreAction':'selectCentralMemberStoreAction')||selected.entry!==(moduleName==='steam'?null:'liff'))throw Error('Wrong selection route: '+JSON.stringify(selected));
  await mount('&single');if(await trigger.count())throw Error('Single-store membership shows selector');
  await mount('&archived-current');await trigger.waitFor();await trigger.click();if(await page.getByRole('menuitem').count()!==15)throw Error('Cannot leave hidden current store');
  if(moduleName==='beauty')for(const suppressed of ['work','preview']){await mount('&'+suppressed);await page.getByText('合成會員',{exact:true}).first().waitFor({state:'attached'});if(await trigger.count())throw Error('Non-member context offers switching');}
  if(moduleName==='beauty'){
   await page.goto('https://synthetic.invalid/?module=beauty');await page.evaluate(()=>window.qaSelections=[]);await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});
   await trigger.click();await page.getByRole('menuitem',{name:/暖暖蒸足/}).click();await page.waitForFunction(()=>window.qaSelections.length===1);
   if((await page.evaluate(()=>window.qaSelections[0])).entry!==null)throw Error('Browser entry was forced through LINE');
  }
  if(errors.length)throw Error(moduleName+': '+errors.join('\n'));
  results.push({moduleName,width,height,choices:16,guard:moduleName==='beauty',singleHidden:true,hiddenCurrentCanLeave:true,overflow:false});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({output:out,passed:results.length}));
}finally{await browser.close()}
