// Actual shared components, synthetic actions, local Chromium only. Not cloud business acceptance.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'ai-brand-ui-')),out=path.join(root,'artifacts/ai-digital-butler/brand-management');mkdirSync(out,{recursive:true});
const actionNames=['readBrandKnowledge','reviewBrandKnowledge','changeBrandKnowledge','saveBrandSetting','testBrandScenario','setBrandHandoff','testBrandKnowledge','readBrandHandoffs','resumeBrandConversation','saveAiButlerSetting','testAiButler','setAiButlerTestHandoff','changeAiButlerKnowledge','readAiButlerKnowledge','testAiButlerPublished','readAiButlerHandoffs','resumeAiButlerConversation'];
await build({bundle:true,jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},format:'iife',outfile:path.join(temp,'fixture.js'),stdin:{contents:`import{createRoot}from'react-dom/client';import{BrandAiWorkspace}from'./src/app/hq/dashboard/ai-services/workspace';const root=createRoot(document.getElementById('root'));window.drawBrand=s=>root.render(<BrandAiWorkspace key={s.viewKey} snapshot={s}/>);window.drawBrand(window.brandSnapshot);`,resolveDir:root,loader:'tsx'},plugins:[{name:'offline-brand',setup(b){
 b.onResolve({filter:/(?:^|\/)(?:ai-actions|actions)$/},()=>({path:'actions',namespace:'fixture'}));
 b.onResolve({filter:/^@\/components\/operations\/panel-read-cache$/},()=>({path:'reader',namespace:'fixture'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
 b.onResolve({filter:/^@\/components\/dashboard-link$/},()=>({path:'link',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)settings-navigation$/},()=>({path:'settings',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({loader:'js',resolveDir:root,contents:name==='actions'?actionNames.map(n=>`export const ${n}=input=>window.brandAction('${n}',input);`).join(''):
 name==='reader'?`import{useMemo}from'react';export const usePanelReader=(n,action)=>useMemo(()=>({refresh:input=>action(input),clear:()=>{}}),[action]);`:
 name==='navigation'?`import{useSyncExternalStore}from'react';export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(fn=>{addEventListener('popstate',fn);return()=>removeEventListener('popstate',fn)},()=>location.search));`:
 name==='settings'?`import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=x=>x;export const useRememberSettingsLocation=()=>{};`:
 `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);`}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage(),errors=[],results=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('https://brand-fixture.invalid/')?route.fulfill({contentType:'text/html',body:'<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="mx-auto min-w-0 max-w-6xl p-4"><div id="root"></div></main></html>'}):route.abort());
 await page.goto('https://brand-fixture.invalid/hq/dashboard/ai-services');
 await page.exposeFunction('recordBrandCall',(name,input)=>calls.push({name,input}));
 await page.evaluate(()=>{
  for(const name of ['pushState','replaceState']){const original=history[name].bind(history);history[name]=(...args)=>{original(...args);dispatchEvent(new PopStateEvent('popstate'));};}
  const draft={introduction:'這是隔離合成品牌介紹，不代表正式公告。',faqs:[{question:'測試產品價格？',answer:'合成產品方案每月 NT$999，不代表正式售價。'}],prohibitedTerms:[],references:{hours:false,services:false,prices:false}};
  window.brandSnapshot={serviceId:'ai-preview-brand-steamfoot',name:'蒸管家品牌智慧客服・隔離合成服務',viewKey:'a'.repeat(64),grant:'HIDDEN',effectiveGrant:'HIDDEN',globalStopped:true,setting:{enabled:false,model:'gpt-6-luna',channels:['TEST'],monthlyBudgetMicros:1000000,dailyRequests:20,monthlyRequests:100},revision:1,document:{draft,published:null,revision:0,publishedVersion:0,publishedAt:null},usage:{requests:'0',reservedMicros:'0',budgetMicros:1000000,alerts:[]},handoffs:{rows:[],total:0,nextCursor:null},synthetic:{handoff:false,revision:0},capabilities:{save:false,publish:false,withdraw:false,setting:false,handoff:false,resume:false,test:false}};
  window.brandAction=async(name,input)=>{await window.recordBrandCall(name,input);if(name==='reviewBrandKnowledge')return{success:true,token:'synthetic-review-only',revision:0,sourceCount:2};if(name==='readBrandKnowledge')return{success:true,document:window.brandSnapshot.document};if(name==='readBrandHandoffs')return{success:true,snapshot:{viewKey:window.brandSnapshot.viewKey,page:window.brandSnapshot.handoffs,synthetic:window.brandSnapshot.synthetic,routing:{handoff:false,revision:0,globalStopped:true}}};return{success:false,error:'唯讀：此測試不執行資料寫入。'};};
 });
 await page.addStyleTag({content:css.css});await page.addScriptTag({path:path.join(temp,'fixture.js')});
 const select=async label=>{const mobile=page.getByRole('combobox',{name:'設定分類',exact:true});if(await mobile.isVisible())await mobile.selectOption({label});else await page.getByRole('button',{name:label,exact:true}).click();};
 for(const [width,height]of [[1920,1080],[1366,900],[1024,768],[768,1024],[390,844],[360,800]]){
  await page.setViewportSize({width,height});await select('狀態與用量');await page.getByRole('button',{name:'測試',exact:true}).click();
  if(await page.getByLabel('產業',{exact:true}).count())throw Error('Brand inherited Store industry selector');
  if(!await page.getByRole('button',{name:'開啟測試',exact:true}).isDisabled())throw Error('Brand toggle not locked');
  await select('品牌知識');const manage=page.getByRole('button',{name:'管理知識',exact:true});if(await manage.count())await manage.click();
  await page.getByLabel('產品介紹',{exact:true}).waitFor();if(!await page.getByLabel('產品介紹',{exact:true}).isDisabled())throw Error('Read-only editor writable');
  if(await page.getByText('引用既有設定',{exact:true}).count())throw Error('Brand operational references leaked');
  await page.getByRole('button',{name:'審核已儲存版本',exact:true}).click();await page.getByText(/版本 0 已核對/).waitFor();
  if(!await page.getByRole('button',{name:'發布知識',exact:true}).isDisabled())throw Error('Publish unauthorized');
  const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,touch:[...document.querySelectorAll('button,select')].filter(x=>x.getBoundingClientRect().height>0).every(x=>x.getBoundingClientRect().height>=44)}));
  if(state.overflow||!state.touch)throw Error('Brand RWD failure '+width+JSON.stringify(state));
  await page.screenshot({path:path.join(out,`brand-${width}.png`),fullPage:true});results.push({width,height,...state});
  await select('人工接手');const queue=page.getByRole('button',{name:'查看待處理',exact:true});if(await queue.count())await queue.click();await page.getByText('目前沒有待人工處理的測試對話。',{exact:true}).waitFor();
  await select('授權與安全');await page.getByText('品牌不使用門市營運工具',{exact:true}).waitFor();
  await select('狀態與用量');await page.getByRole('button',{name:'收合',exact:true}).click();
 }
 if(errors.length)throw Error(errors.join('\n'));
 if(calls.some(x=>!['reviewBrandKnowledge','readBrandKnowledge','readBrandHandoffs'].includes(x.name)))throw Error('Unexpected mutation action');
 writeFileSync(path.join(out,'local-ui.json'),JSON.stringify({kind:'local Chromium, actual shared components, synthetic read-only actions; not cloud/authenticated business or physical device acceptance',sizes:results,cases:['HQ-hidden-management-inspection','brand-no-industry-or-store-references','mutation-controls-disabled','saved-version-review-read-only','section-and-resize-state-retention','handoff-empty-list','touch-targets-and-overflow'],calls,consoleErrors:errors},null,2)+'\n');
 console.log(JSON.stringify({sizes:results.length,consoleErrors:errors.length,readOnlyActionCalls:calls.length}));
}finally{await browser.close();rmSync(temp,{recursive:true,force:true});}
