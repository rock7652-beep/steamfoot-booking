// Synthetic preview of the existing opening guide. All external requests are blocked.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),out='/tmp/beauty-opening-lazy-catalog-ui';mkdirSync(out,{recursive:true});
const data={storeId:'synthetic',chargeRulesActive:true,services:[],plans:[],techs:[],locations:[],access:{planAccess:true,staffAccess:true}};
const result={success:true,storeId:'synthetic',selfBooking:false,checks:[],samples:[]};
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BeautyOpeningGuide} from './src/components/beauty/opening-guide';createRoot(document.getElementById('root')).render(<main style={{padding:16}}><BeautyOpeningGuide data={${JSON.stringify(data)}}/></main>);`,resolveDir:root,loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:path.join(out,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'isolated-guide',setup(b){
 b.onResolve({filter:/^@\/server\//},()=>({path:'server',namespace:'qa'}));
 b.onResolve({filter:/^@\/components\/dashboard-link$/},()=>({path:'link',namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='server'?`export const readBeautyOpeningCheck=async()=>{window.__checks=(window.__checks||0)+1;return ${JSON.stringify(result)}};`:`import {createElement} from 'react';export const DashboardLink=({children,...p})=>createElement('a',p,children);`,loader:'js',resolveDir:root}));
}}]});
const componentCss=readFileSync(path.join(out,'fixture.css'),'utf8');
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(path.join(out,'fixture.css'),css.css+'\n'+componentCss);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const errors=[],results=[];
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='http://synthetic.invalid/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):r.abort());await page.goto('http://synthetic.invalid/');await page.addStyleTag({path:path.join(out,'fixture.css')});await page.addScriptTag({path:path.join(out,'fixture.js')});await page.getByRole('button',{name:'開店設定引導'}).click();await page.getByText('顧客自行預約目前關閉',{exact:false}).waitFor();
for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Overflow '+width);await page.getByRole('button',{name:'執行開店檢查',exact:true}).waitFor();results.push({width,height,overflow,checkVisible:true});await page.screenshot({path:path.join(out,'guide-'+width+'.png'),fullPage:true});}
if(errors.length)throw Error(errors.join(';'));const reads=await page.evaluate(()=>window.__checks);if(reads!==1)throw Error('Unexpected repeated reads');writeFileSync(path.join(out,'results.json'),JSON.stringify({synthetic:true,backend:false,reads,errors,results},null,2));console.log(JSON.stringify({reads,errors,results}));}finally{await browser.close();}
