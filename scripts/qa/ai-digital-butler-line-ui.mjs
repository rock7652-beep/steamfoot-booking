// Actual shared component, SSR + hydration; local fake action, no external services.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'ai-line-ui-')),out=path.join(root,'artifacts/ai-digital-butler/line-e2e');mkdirSync(out,{recursive:true});
const plugins=[{name:'local-line',setup(b){
 b.onResolve({filter:/(?:^|\/)ai-actions$/},()=>({path:'actions',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)settings-navigation$/},()=>({path:'settings',namespace:'fixture'}));
 b.onResolve({filter:/^@\/components\/dashboard-link$/},()=>({path:'link',namespace:'fixture'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'nav',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path:name})=>({loader:'js',resolveDir:root,contents:
 name==='actions'?`export const testAiButlerRouting=input=>window.lineAction(input);export const testAiButlerLineSynthetic=input=>window.lineAction(input);export const setAiButlerRoutingHandoff=()=>{throw Error('not used');};`:
 name==='settings'?`import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=href=>href;export const useRememberSettingsLocation=()=>{};`:
 name==='nav'?`export const usePathname=()=>'/dashboard/settings/digital-butler';export const useSearchParams=()=>new URLSearchParams();`:
 `import{createElement}from'react';export const DashboardLink=({children,...props})=>createElement('a',props,children);`}));
}}];
const component='./src/app/(dashboard)/dashboard/settings/digital-butler/ai-routing-panel',options={bundle:true,jsx:'automatic',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins};
await build({...options,stdin:{contents:`import{createElement as h}from'react';import{hydrateRoot}from'react-dom/client';import{AiRoutingPanel}from'${component}';window.draw=props=>hydrateRoot(document.getElementById('root'),h(AiRoutingPanel,props),{onRecoverableError:e=>window.hydrationErrors.push(e.message)});`,resolveDir:root,loader:'tsx'},format:'iife',outfile:path.join(temp,'client.js')});
await build({...options,stdin:{contents:`import{createElement as h}from'react';import{renderToString}from'react-dom/server';import{AiRoutingPanel}from'${component}';export const render=props=>renderToString(h(AiRoutingPanel,props));`,resolveDir:root,loader:'tsx'},platform:'node',format:'cjs',outfile:path.join(temp,'ssr.cjs')});
const props={initial:{handoff:false,revision:0,globalStopped:false},line:true,liveTestAvailable:true},html=require(path.join(temp,'ssr.cjs')).render(props);
if(!/<button[^>]*disabled=""/.test(html))throw Error('SSR button must wait for hydration');
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:1024}}),errors=[],cases=['ssr-disabled'],sizes=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://synthetic.invalid/'?r.fulfill({contentType:'text/html',body:`<html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="root" style="max-width:1000px;margin:auto;padding:16px">${html}</main></html>`}):r.abort());
 await page.goto('https://synthetic.invalid/');await page.addStyleTag({content:css.css});
 await page.evaluate(()=>{window.hydrationErrors=[];window.calls=[];window.seen={};window.human=false;window.fail=false;window.lineAction=async input=>{
 window.calls.push(input);if(window.fail){window.fail=false;throw Error('offline interruption');}
 const duplicate=window.seen[input.eventId];window.seen[input.eventId]=true;
 const route=duplicate?'DUPLICATE':window.human?'SILENT':input.scenario==='handoff'?'HUMAN':'AI';if(route==='HUMAN')window.human=true;
 return{success:true,result:{route,outcome:route==='SILENT'?'HUMAN_ACTIVE':'TEST',text:route==='AI'?'合成店已發布營業時間。':'',originalOutcome:'NO_MATCH',providerCalls:route==='AI'?1:0},state:{handoff:window.human,revision:window.calls.length,globalStopped:false}};
 };});
 await page.addScriptTag({path:path.join(temp,'client.js')});await page.evaluate(p=>window.draw(p),props);
 const panel=page.getByRole('region',{name:'合成 LINE 對話演練'});await panel.getByRole('button',{name:'展開 LINE 演練',exact:true}).click();
 const provider=panel.getByLabel('演練模型',{exact:true}),scenario=panel.getByLabel('串接情境',{exact:true}),run=panel.getByRole('button',{name:'執行串接測試',exact:true});
 await provider.selectOption('openai');await scenario.selectOption('known');await run.click();await panel.getByText('OpenAI 模型呼叫：1 次',{exact:true}).waitFor();cases.push('hydrated-openai-selection');
 await panel.getByRole('button',{name:'重送上一事件',exact:true}).click();await panel.getByText('事件已處理，不重複執行',{exact:true}).waitFor();const ids=await page.evaluate(()=>window.calls.slice(0,2).map(x=>x.eventId));if(ids[0]!==ids[1])throw Error('replay changed ID');cases.push('replay-same-id');
 await scenario.selectOption('handoff');await run.click();await panel.getByText('轉真人',{exact:true}).waitFor();await provider.selectOption('mock');await scenario.selectOption('known');await run.click();await panel.getByText('自動回覆已抑制',{exact:true}).waitFor();cases.push('provider-switch-preserves-human');
 await page.evaluate(()=>{window.fail=true;window.human=false;});await run.click();await panel.getByRole('alert').waitFor();if(!await provider.isDisabled()||!await scenario.isDisabled())throw Error('uncertain input not locked');
 const id=await page.evaluate(()=>window.calls.at(-1).eventId);await panel.getByRole('button',{name:'重試原路由事件',exact:true}).click();await panel.getByText('AI 已發布知識',{exact:true}).waitFor();if(id!==await page.evaluate(()=>window.calls.at(-1).eventId))throw Error('retry changed ID');cases.push('network-retry-same-id');
 for(const width of[1920,1366,1024,768,390,360]){await page.setViewportSize({width,height:1024});const s=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));if(s.scrollWidth>width)throw Error('overflow');sizes.push(s);await page.screenshot({path:out+'/local-'+width+'.png',fullPage:true});}
 await panel.getByRole('button',{name:'收合 LINE 演練',exact:true}).click();await panel.getByRole('button',{name:'展開 LINE 演練',exact:true}).click();await panel.getByText('AI 已發布知識',{exact:true}).waitFor();cases.push('collapse-retains-result');
 const hydrationErrors=await page.evaluate(()=>window.hydrationErrors);writeFileSync(path.join(out,'local-ui.json'),JSON.stringify({kind:'Local SSR/hydrated component with fake action; no hosted or real API proof',cases,sizes,errors,hydrationErrors},null,2));if(errors.length||hydrationErrors.length)throw Error('browser errors');
 console.log(JSON.stringify({cases:cases.length,sizes:sizes.length,errors:errors.length,hydrationErrors:hydrationErrors.length}));
}finally{await browser.close();rmSync(temp,{recursive:true,force:true});}
