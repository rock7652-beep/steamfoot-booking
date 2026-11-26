// Shared offline transport for existing Brand workspace; business actions stay real.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
export async function loadLocalBrandCore(root,temp){
 await build({entryPoints:['src/server/ai/brand-management-core.ts'],bundle:true,platform:'node',format:'cjs',alias:{'@':path.join(root,'src')},outfile:path.join(temp,'core.cjs'),plugins:[{name:'server-only-local',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
 const errorSource=readFileSync('src/server/ai/brand-management.ts','utf8').split('export function brandManagementError')[1];await build({stdin:{contents:'export function brandManagementError'+errorSource,loader:'ts',resolveDir:root},platform:'node',format:'cjs',outfile:path.join(temp,'error.cjs')});
 return {...require(path.join(temp,'core.cjs')),...require(path.join(temp,'error.cjs'))};
}
export async function openLocalBrandWorkspace({root,temp,snapshot,action,onPageError}){
 const names=['readBrandKnowledge','reviewBrandKnowledge','changeBrandKnowledge','saveBrandSetting','testBrandScenario','setBrandHandoff','testBrandKnowledge','readBrandHandoffs','resumeBrandConversation','saveAiButlerSetting','testAiButler','setAiButlerTestHandoff','changeAiButlerKnowledge','readAiButlerKnowledge','testAiButlerPublished','readAiButlerHandoffs','resumeAiButlerConversation'];
 await build({bundle:true,jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},format:'iife',outfile:path.join(temp,'ui.js'),stdin:{contents:`import{createRoot}from'react-dom/client';import{BrandAiWorkspace}from'./src/app/hq/dashboard/ai-services/workspace';const root=createRoot(document.getElementById('root'));window.drawBrand=s=>root.render(<BrandAiWorkspace key={s.viewKey} snapshot={s}/>);window.refreshBrand=async()=>{const s=await window.backendSnapshot();window.brandSnapshot=s;window.drawBrand(s);};window.refreshToggle=window.refreshBrand;window.refreshBrand();`,resolveDir:root,loader:'tsx'},plugins:[{name:'local-brand-workspace',setup(b){
 b.onResolve({filter:/(?:^|\/)(?:ai-actions|actions)$/},()=>({path:'actions',namespace:'local'}));b.onResolve({filter:/^@\/components\/operations\/panel-read-cache$/},()=>({path:'reader',namespace:'local'}));b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'local'}));b.onResolve({filter:/^@\/components\/dashboard-link$/},()=>({path:'link',namespace:'local'}));b.onResolve({filter:/(?:^|\/)settings-navigation$/},()=>({path:'settings',namespace:'local'}));
 b.onLoad({filter:/.*/,namespace:'local'},({path:name})=>({loader:'js',resolveDir:root,contents:name==='actions'?names.map(n=>`export const ${n}=input=>window.backendBrandAction('${n}',input);`).join(''):
 name==='reader'?`import{useMemo}from'react';export const usePanelReader=(n,action)=>useMemo(()=>({refresh:input=>action(input),clear:()=>{}}),[action]);`:
 name==='navigation'?`const router={refresh(){void window.refreshBrand();}};export const useRouter=()=>router;import{useSyncExternalStore}from'react';export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(fn=>{addEventListener('popstate',fn);return()=>removeEventListener('popstate',fn)},()=>location.search));`:
 name==='settings'?`import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=x=>x;export const useRememberSettingsLocation=()=>{};`:
 `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);`}));
 }}]});
 const css=(await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')})).css;
 const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{const page=await browser.newPage();page.on('pageerror',onPageError);await page.addInitScript(()=>{for(const name of ['pushState','replaceState']){const original=history[name].bind(history);history[name]=(...args)=>{original(...args);dispatchEvent(new PopStateEvent('popstate'));};}});await page.exposeFunction('backendSnapshot',snapshot);await page.exposeFunction('backendBrandAction',action);
 // Toggle tests also exercise direct stale-result feedback through the same real action.
 await page.exposeFunction('backendToggle',input=>action('saveBrandSetting',input));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!=='https://brand-local.invalid')return route.abort();if(u.pathname==='/ui.js')return route.fulfill({contentType:'application/javascript',body:readFileSync(path.join(temp,'ui.js'),'utf8')});if(u.pathname==='/ui.css')return route.fulfill({contentType:'text/css',body:css});return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"><main class="mx-auto max-w-6xl min-w-0 p-4"><div id="root"></div></main><script src="/ui.js"></script></html>'});});
 await page.goto('https://brand-local.invalid/hq/dashboard/ai-services');return {browser,page};
 }catch(e){await browser.close();throw e;}
}
