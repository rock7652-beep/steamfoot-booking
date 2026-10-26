// Isolated preview of the real shared settings row. No server, LINE, or DB access.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),output='/tmp/public-booking-link-qa',origin='http://localhost:3131';
mkdirSync(output,{recursive:true});
const href='https://liff.line.me/902-synthetic/public-trial?bookingStore=synthetic';
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{PublicBookingLinkRow}from'./src/components/settings/public-booking-link-row';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-4"><h1>LINE 入口隔離預覽</h1><section id="configured" className="my-4 rounded-xl border bg-white p-4"><PublicBookingLinkRow href="${href}"/></section><section id="missing" className="rounded-xl border bg-white p-4"><PublicBookingLinkRow href={null}/></section><p>此預覽不會登入 LINE、建立預約或發送通知。</p></main>);`,resolveDir:root,loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:path.join(output,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'},alias:{'@':path.join(root,'src')},plugins:[{name:'isolated-navigation',setup(b){
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 b.onResolve({filter:/(^|\/)dashboard-link$/},()=>({path:'link',namespace:'qa'}));
 b.onResolve({filter:/(^|\/)settings-navigation$/},()=>({path:'context',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='context'?"import{createContext}from'react';export const SettingsNavigationContext=createContext(null);export const settingsWorkspaceHref=x=>x;export const useRememberSettingsLocation=()=>{};":args.path==='navigation'?"export const usePathname=()=>'/dashboard';export const useSearchParams=()=>new URLSearchParams();":"import{createElement}from'react';export const DashboardLink=({children,prefetch,scroll,...props})=>createElement('a',props,children);",loader:'js',resolveDir:root}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(output,'fixture.css'),css.css);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']}),errors=[],sizes=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url()===origin+'/'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto(origin+'/');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const configured=page.locator('#configured'),missing=page.locator('#missing');
 for(const [width,height]of[[390,844],[768,1024],[1024,768],[1366,900]]){
  await page.setViewportSize({width,height});await configured.getByRole('button',{name:'複製連結'}).waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(`Overflow at ${width}`);
  for(const locator of [configured.getByRole('button'),configured.getByRole('link')]){const rect=await locator.boundingBox();if(!rect||rect.height<44)throw Error('Touch target below 44px');}
  if(await configured.getByRole('link').getAttribute('href')!==href)throw Error('Store context lost');
  if(await missing.getByRole('link').count()||await missing.getByRole('button').count())throw Error('Unconfigured store has an actionable link');
  await missing.getByText('本店 LINE 入口尚未設定').waitFor();
  await page.screenshot({path:path.join(output,`entry-${width}.png`),fullPage:true});sizes.push({width,height,overflow:false});
 }
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedValue=value;}}}));
 await configured.getByRole('button',{name:'複製連結'}).click();await configured.getByRole('status').filter({hasText:'已複製 LINE 入口連結'}).waitFor();
 if(await page.evaluate(()=>window.copiedValue)!==href)throw Error('Wrong clipboard URL');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
 await configured.getByRole('button',{name:'複製連結'}).click();
 const manual=configured.getByRole('textbox',{name:'公開預約 LINE 入口連結'});await manual.waitFor();if(await manual.inputValue()!==href)throw Error('Fallback loses canonical URL');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'manual-copy-390.png'),fullPage:true});
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,actualLINE:false,actualDatabase:false,clipboard:true,manualCopy:true,errors,sizes},null,2));console.log(JSON.stringify({output,errors,sizes,clipboard:true,manualCopy:true}));
}finally{await browser.close();}
