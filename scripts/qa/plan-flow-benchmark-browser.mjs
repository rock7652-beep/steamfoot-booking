import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'artifacts/plan-flow-verification-20261111');mkdirSync(out,{recursive:true});
await build({entryPoints:['scripts/qa/plan-flow-benchmark-fixture.tsx'],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src'),'@/lib/course-card-read-client':path.join(root,'scripts/qa/plan-flow-benchmark-model.ts'),'@/lib/beauty/customer-reader':path.join(root,'scripts/qa/plan-flow-benchmark-model.ts'),'@/lib/music-period-read-client':path.join(root,'scripts/qa/plan-flow-benchmark-model.ts')},define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_BUILD_ENV':'"test"','process.env':'{}'},plugins:[{name:'readonly-stubs',setup(b){
 b.onResolve({filter:/^next\/(link|navigation|image)$/},a=>({path:a.path,namespace:'next-stub'}));
 b.onLoad({filter:/.*/,namespace:'next-stub'},a=>({contents:a.path.endsWith('image')?'import React from "react";export default function Image(p){return React.createElement("img",p)}':a.path.endsWith('link')?'import React from "react";export const useLinkStatus=()=>({pending:false}); export default function Link(p){return React.createElement("a",p,p.children)}':'export const useRouter=()=>({refresh(){},push(){}});export const usePathname=()=>"/dashboard/beauty";export const useSearchParams=()=>new URLSearchParams();',loader:'js',resolveDir:root}));
 b.onResolve({filter:/^@\/server\/actions\//},a=>({path:path.join(root,'src',a.path.slice(2)+'.ts'),namespace:'actions-stub'}));
 b.onLoad({filter:/.*/,namespace:'actions-stub'},a=>{const s=readFileSync(a.path,'utf8'),names=[...s.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(x=>x[1]);return{contents:`import {readModel} from ${JSON.stringify(path.join(root,'scripts/qa/plan-flow-benchmark-model.ts'))};\n`+names.map(n=>['loadMusicStudentWorkspace','loadCourseCustomerPurchases'].includes(n)?`export const ${n}=()=>readModel("${n}");`:`export const ${n}=async()=>{throw Error("QA blocked server action");};`).join('\n'),loader:'js',resolveDir:root};});
}}]});
const component=readFileSync(path.join(out,'fixture.css'),'utf8');const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+component);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
async function makePage(module){
 const page=await browser.newPage({viewport:{width:1024,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/flow?module='+module);await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});await page.locator('[data-action="open"]').waitFor();
 return {page,errors};
}
async function measure(page,module,scenario,version,repeat){
 const before=await page.evaluate(()=>window.planFlow.calls().length);
 await page.evaluate(({version})=>{
  const expectedUsed=version>0?2:1,expectedVoid=version>1?1:0,remaining=10-expectedUsed-expectedVoid;
  const expectedDates=version>0?['11/03',version>2?'11/06':'11/05']:['11/03'];
  window.flowCheck={started:performance.now(),readyAt:null,staleFrames:[]};
  const check=()=>{
   const panel=document.querySelector('[data-panel]');if(!panel)return;
   const slots=panel.querySelectorAll('[data-lesson-slot]');if(slots.length!==10)return;
   const dates=[...panel.querySelectorAll('[data-completed="true"]')].map(e=>e.textContent.trim());
   const voids=panel.querySelectorAll('[data-voided="true"]').length;
   const text=panel.textContent;
   const match=dates.length===expectedUsed&&dates.every(d=>expectedDates.includes(d))&&voids===expectedVoid;
   if(!match){window.flowCheck.staleFrames.push({dates,voids});return;}
   if(!text.includes('3,000'))return;
   const balance=panel.querySelector('[data-balance]');
   if(balance&&!balance.textContent.includes(`剩餘 ${remaining} 堂`))throw Error('Steam balance mismatch');
   if(!balance&&!text.includes(`可用 ${remaining-1} 堂`))return;
   if(window.flowCheck.readyAt===null)window.flowCheck.readyAt=performance.now();
  };
  window.flowObserver?.disconnect();window.flowObserver=new MutationObserver(check);window.flowObserver.observe(document.getElementById('root'),{subtree:true,childList:true,characterData:true,attributes:true});
  document.querySelector('[data-action="open"]').click();check();
 },{version});
 await page.waitForFunction(()=>window.flowCheck.readyAt!==null,{},{timeout:10000});
 const result=await page.evaluate(()=>({ms:window.flowCheck.readyAt-window.flowCheck.started,staleFrames:window.flowCheck.staleFrames,calls:window.planFlow.calls()}));
 const requests=result.calls.slice(before);if(result.staleFrames.length)throw Error(`${module}/${scenario}: stale dates ${JSON.stringify(result.staleFrames)}`);
 if(['reopen','preloaded-first'].includes(scenario)&&requests.length)throw Error(`${module}/${scenario}: duplicated read`);
 const data={module,scenario,version,repeat,fullDataDomMs:Math.round(result.ms*10)/10,reads:requests.map(r=>r.kind),staleFrames:result.staleFrames.length};results.push(data);
 return data;
}
try{
 for(const module of ['steam','beauty','music','sports']){
  for(let repeat=1;repeat<=5;repeat++){
   const {page,errors}=await makePage(module);
   await measure(page,module,'cold-first',0,repeat);await page.locator('[data-action="close"]').click();
   await measure(page,module,'reopen',0,repeat);await page.locator('[data-action="close"]').click();
   for(const [version,scenario]of [[1,'after-backfill'],[2,'after-void'],[3,'after-correction']]){
    await page.locator('[data-action="change"]').click();await measure(page,module,scenario,version,repeat);await page.locator('[data-action="close"]').click();
   }
   if(errors.length)throw Error(errors.join(';'));
   await page.close();
   const prepared=await makePage(module),at=Date.now();await prepared.page.locator('[data-action="preload"]').click();await prepared.page.locator('[data-preloaded="true"]').waitFor();
   if(!await prepared.page.evaluate(()=>window.planFlow.ready()))throw Error(module+': preload marked complete before full data');
   const preloadWaitMs=Date.now()-at;
   const record=await measure(prepared.page,module,'preloaded-first',0,repeat);record.preloadWaitMs=preloadWaitMs;
   if(repeat===1)await prepared.page.screenshot({path:path.join(out,`${module}-preloaded.png`),fullPage:true});
   if(prepared.errors.length)throw Error(prepared.errors.join(';'));await prepared.page.close();
  }
  console.log(module+': six scenarios × five repeats passed');
 }
 const summary=[];
 for(const module of ['steam','beauty','music','sports'])for(const scenario of ['cold-first','preloaded-first','reopen','after-backfill','after-void','after-correction']){
  const rows=results.filter(r=>r.module===module&&r.scenario===scenario),times=rows.map(r=>r.fullDataDomMs).sort((a,b)=>a-b);
  summary.push({module,scenario,n:rows.length,medianMs:times[Math.floor(times.length/2)],minMs:times[0],maxMs:times.at(-1),readsPerOpen:rows.map(r=>r.reads.length),staleFrames:rows.reduce((n,r)=>n+r.staleFrames,0)});
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({source:{head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),bundleSha256:createHash('sha256').update(readFileSync(path.join(out,'fixture.js'))).digest('hex')},environment:'local Chromium; real UI/read-cache components; simulated read ports with fixed 180ms delay; no authenticated backend',readDelayMs:180,viewport:{width:1024,height:768},realWrites:false,summary,results},null,2));console.log(JSON.stringify(summary));
}finally{await browser.close();}
