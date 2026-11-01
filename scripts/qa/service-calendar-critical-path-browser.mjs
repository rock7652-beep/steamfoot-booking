// Hosted synthetic-store QA. Inputs are chmod-600 temporary files; never commit credentials.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const fs=require('fs'),{X509Certificate,createHash}=require('crypto'),{chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{
const cfg=JSON.parse(fs.readFileSync('/tmp/calendar-qa-context.json')),auth=JSON.parse(fs.readFileSync('/tmp/calendar-qa-reauth.json')),shares=JSON.parse(fs.readFileSync('/tmp/calendar-profile-shares.json'));
const cert=new X509Certificate(fs.readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});
const out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/silverlily-calendar-loading-20261031/critical-path';fs.mkdirSync(out,{recursive:true});const results=process.env.CALENDAR_QA_RESUME?JSON.parse(fs.readFileSync(out+'/results.json')):{samples:[],errors:[],checks:[],complete:false};const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
try{
for(const deployment of (process.env.CALENDAR_QA_DEPLOYMENTS||'baseline,candidate').split(','))for(const mod of (process.env.CALENDAR_QA_MODULES||'sports,sports-mixed,music,beauty').split(',')){
 const sports=mod.startsWith('sports');const account=sports?cfg:cfg.extras.find(x=>x.module===mod);const slug=sports?'sports-live-flow':mod==='music'?'lubymusic':'beauty-hosted-20261021';const fixture=mod==='sports-mixed'?'cmvdryomm0002js071vgixg48':'qa1469-20261030-'+(mod==='beauty'?'beauty-booking':mod+'-session');const date=mod==='sports-mixed'?'2026-12-22':'2026-11-27';const share=shares[deployment];const origin=new URL(share).origin;const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>results.errors.push({deployment,mod,error:e.message}));
 await page.goto(share);await page.goto(origin+`/s/${slug}/admin/dashboard/`+(mod==='beauty'?'beauty':'courses'));await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(auth.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));
 for(let sample=0;sample<6;sample++){
  const path=mod==='beauty'?'beauty':'courses';await page.goto(origin+`/s/${slug}/admin/dashboard/${path}?date=${date}&scheduleView=month`+(mod==='beauty'?'&tab='+encodeURIComponent('班表'):''),{waitUntil:'load'});await page.getByRole('button',{name:'日表',exact:true}).click();const card=page.locator(`[data-calendar-session="${fixture}"]`).first();await card.waitFor();await page.waitForTimeout(1000);
  const match=r=>sports?r.url().includes('/session-detail'):mod==='music'?r.url().includes('operation=session-detail'):r.url().includes('/api/beauty/roster');const response=page.waitForResponse(match);await page.evaluate(()=>{performance.clearResourceTimings();window.profileStart=performance.now()});await card.click();await page.waitForFunction(()=>document.querySelector('[role="dialog"] input[placeholder="搜尋姓名或手機"]'),{},{polling:'raf'});const ready=await page.evaluate(()=>performance.now()-window.profileStart);const res=await response,body=await res.json();assert.equal(body.success,true);assert.ok(body.data.roster.length>0);
  const data=await page.evaluate(()=>({ready:performance.now()-window.profileStart,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/session-detail')||e.name.includes('operation=session-detail')||e.name.includes('/api/beauty/roster')).map(e=>({start:e.startTime-window.profileStart,ttfb:e.responseStart-e.requestStart,total:e.duration,server:e.serverTiming,bytes:e.encodedBodySize}))}));
  const row={deployment,module:mod,sample,warmup:sample===0,readyMs:Math.round(ready),server:res.headers()['server-timing'],timing:res.headers()['x-music-read-timing'],vercel:res.headers()['x-vercel-id'],resources:data.resources,rosterCount:body.data.roster.length,payloadHash:createHash('sha256').update(JSON.stringify(body.data)).digest('hex')};results.samples.push(row);save();console.log(JSON.stringify(row));
  await page.locator('[role="dialog"]').getByRole('button',{name:'關閉',exact:true}).click();
 }
 results.checks.push({deployment,module:mod,check:'normal-owner-login-and-live-roster',pass:true});save();await context.close();
}
results.complete=true;save();
}finally{await browser.close()}
})().catch(e=>{console.error(e.message.replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1});
