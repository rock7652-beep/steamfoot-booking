import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=process.cwd(),out='/workspace/reports/applicable-balance-20261029';mkdirSync(out,{recursive:true});
await build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{CourseRosterList}from'@/app/(dashboard)/dashboard/courses/roster-list';
import{ApplicableBalanceSummary}from'@/components/admin/applicable-balance';
import{summarizeApplicableBalance}from'@/lib/applicable-balance';
import musicStyles from '@/app/(dashboard)/dashboard/courses/music-roster.module.css';
const units=['SESSION','SESSION','USE'],names=['運動／舞蹈','音樂','美業'];
const balance=i=>summarizeApplicableBalance([{id:'old',name:'A 系列原方案（長名稱測試）',unit:units[i],remaining:1,held:1,expiresAt:'2026-12-01',shared:false},{id:'new',name:'A 系列已續購二十堂／次方案',unit:units[i],remaining:20,held:0,expiresAt:'2027-02-01',shared:true}]);
const rows=i=>Array.from({length:25},(_,n)=>({id:String(n),name:n===0?'小明':'學員 '+n,phone:'0900000000',owner:'範例所屬人員',status:'待點名',mark:'pending',statusTitle:'標記出席',statusDisabled:true,onStatus(){},onOpen(){},cost:'1',balance:<ApplicableBalanceSummary balance={balance(i)} selectedCardId='old'/>,reminders:<div>標籤／備註</div>}));
function App(){return <main style={{maxWidth:1100,margin:'auto',padding:12}}><h1>合成資料預覽：適用方案合計</h1><p>未連線、未修改業務資料</p>{names.map((name,i)=><section key={name} aria-label={name} style={{marginTop:24}}><h2>{name}</h2>{i===1?<div style={{overflow:'auto'}}><div className={musicStyles.header}><span/><span>姓名</span><span>電話</span><span>本期進度／剩餘</span><span>標籤／備註</span><span/></div><div className={musicStyles.row}><span>○</span><span>小明</span><span>0900000000</span><div><ApplicableBalanceSummary balance={balance(i)} selectedCardId='old'/><button>本期第 1/10 堂</button></div><span>原期別進度保留</span><span>⋯</span></div></div>:<CourseRosterList rows={rows(i)} empty='' labels={{balance:'剩餘'}}/>}</section>)}</main>};createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,jsx:'automatic',format:'iife',outfile:out+'/fixture.js',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'labels',setup(b){b.onResolve({filter:/^@\/components\/customer-labels$/},()=>({path:'labels',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const CustomerLabels=()=>null;',loader:'js'}));}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});writeFileSync(out+'/fixture.css',css.css+'\n'+readFileSync(out+'/fixture.css','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],errors=[];
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://fixture.invalid/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div></html>'}):r.abort());await page.goto('https://fixture.invalid/');await page.addStyleTag({path:out+'/fixture.css'});await page.addScriptTag({path:out+'/fixture.js'});await page.getByRole('heading',{name:'合成資料預覽：適用方案合計'}).waitFor();
for(const [width,height]of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Page overflow '+width);for(const name of ['運動／舞蹈','音樂','美業']){const area=page.getByRole('region',{name,exact:true});const text=await area.innerText();if(!text.includes('剩餘 20')||text.includes('預約保留')||text.includes('本次方案剩')||await area.locator('summary').count())throw Error('Roster summary is not simple '+name);}

await page.screenshot({path:out+'/'+width+'.png',fullPage:true});results.push({width,height,pageOverflow:false,simpleRemainingOnly:true});}
if(errors.length)throw Error(errors.join('\n'));writeFileSync(out+'/results.json',JSON.stringify({synthetic:true,realBackend:false,results,errors},null,2));console.log(JSON.stringify({out,results,errors}));}finally{await browser.close();}
