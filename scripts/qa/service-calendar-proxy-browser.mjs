// Cloud Chromium QA only; this does not control the user's local Browser app.
// Inputs are chmod-600 temporary files and are removed after testing.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const fs=require('fs'),{X509Certificate,createHash}=require('crypto'),{chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{
 const cfg=JSON.parse(fs.readFileSync('/tmp/calendar-qa-context.json')),auth=JSON.parse(fs.readFileSync('/tmp/calendar-qa-reauth.json')),shares=JSON.parse(fs.readFileSync('/tmp/calendar-profile-shares.json'));
 const cert=new X509Certificate(fs.readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});
 const out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/silverlily-calendar-loading-20261031/proxy-path';fs.mkdirSync(out,{recursive:true});const report={phase:process.env.CALENDAR_QA_PHASE||'profile',method:'alternating deployments per sample, full authoritative roster visible, normal login, no request mocks',samples:[],checks:[],errors:[],complete:false};const save=()=>fs.writeFileSync(out+'/results.json',JSON.stringify(report,null,2));let activePage;
 try{
  for(const mod of (process.env.CALENDAR_QA_MODULES||'sports,sports-mixed,music,beauty').split(',')){
   const sports=mod.startsWith('sports'),account=sports?cfg:cfg.extras.find(x=>x.module===mod),slug=sports?'sports-live-flow':mod==='music'?'lubymusic':'beauty-hosted-20261021';const fixture=mod==='sports-mixed'?'cmvdryomm0002js071vgixg48':'qa1469-20261030-'+(mod==='beauty'?'beauty-booking':mod+'-session'),date=mod==='sports-mixed'?'2026-12-22':'2026-11-27',path=mod==='beauty'?'beauty':'courses';const states={};
   for(const deployment of (process.env.CALENDAR_QA_DEPLOYMENTS||'baseline,candidate').split(',')){
    const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();activePage=page;page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push({module:mod,deployment,error:e.message}));const origin=new URL(shares[deployment]).origin;
    await page.goto(shares[deployment]);await page.goto(origin+`/s/${slug}/admin/dashboard/${path}`);await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(auth.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));states[deployment]={page,context,origin};console.log(JSON.stringify({module:mod,deployment,stage:'login-passed'}));
   }
   const payloads=new Set();
   for(let sample=0;sample<Number(process.env.CALENDAR_QA_SAMPLES||6);sample++)for(const deployment of (sample%2?['candidate','baseline']:['baseline','candidate']).filter(x=>states[x])){
    const {page,origin}=states[deployment];activePage=page;
    await page.goto(origin+`/s/${slug}/admin/dashboard/${path}?date=${date}&scheduleView=month`+(mod==='beauty'?'&tab='+encodeURIComponent('班表'):''),{waitUntil:'load'});await page.getByRole('button',{name:'日表',exact:true}).click();const card=page.locator(`[data-calendar-session="${fixture}"]`).first();await card.waitFor();await page.waitForTimeout(1000);
    const match=r=>sports?r.url().includes('/session-detail'):mod==='music'?r.url().includes('operation=session-detail'):r.url().includes('/api/beauty/roster');const response=page.waitForResponse(match);await page.evaluate(()=>{performance.clearResourceTimings();window.profileStart=performance.now()});await card.click();await page.waitForFunction(()=>document.querySelector('[role="dialog"] input[placeholder="搜尋姓名或手機"]'),{},{polling:'raf'});const readyMs=Math.round(await page.evaluate(()=>performance.now()-window.profileStart));const res=await response,body=await res.json();assert.equal(body.success,true);assert.ok(body.data.roster.length>0);
    const entries=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.includes('/session-detail')||e.name.includes('operation=session-detail')||e.name.includes('/api/beauty/roster')).map(e=>({start:e.startTime-window.profileStart,ttfb:e.responseStart-e.requestStart,total:e.duration,bytes:e.encodedBodySize})));
    const hash=createHash('sha256').update(JSON.stringify(body.data)).digest('hex');payloads.add(hash);assert.equal(payloads.size,1,'authoritative payload changed between deployments');states[deployment].liveRequest={url:res.url(),method:res.request().method(),data:res.request().postData()};const proxy=res.headers()['x-calendar-proxy-timing'];const pool=res.headers()['x-calendar-db-pool'];const row={module:mod,deployment,sample,warmup:sample===0,readyMs,handler:res.headers()['server-timing'],pool:pool?JSON.parse(pool):null,proxy:proxy?JSON.parse(proxy):null,readTiming:res.headers()['x-music-read-timing'],transport:entries,rosterCount:body.data.roster.length,payloadHash:hash};
    await page.locator('[role="dialog"]').getByRole('button',{name:'關閉',exact:true}).click();row.edgeControlMs=await page.evaluate(async()=>{const t=performance.now();const r=await fetch('/favicon.ico',{cache:'no-store'});await r.arrayBuffer();return Math.round(performance.now()-t)});report.samples.push(row);save();console.log(JSON.stringify(row));
   }
   if(process.env.CALENDAR_QA_LOAD==='1'){
    const state=states.candidate,{context,origin,liveRequest}=state;
    for(const concurrency of [4,8]){
     const started=performance.now();
     const reads=await Promise.all(Array.from({length:concurrency},async()=>{
      const at=performance.now();const response=await context.request.fetch(liveRequest.url,{method:liveRequest.method,headers:{Origin:origin,'Content-Type':'application/json'},...(liveRequest.data?{data:liveRequest.data}:{})});
      assert.equal(response.status(),200);const body=await response.json();assert.equal(body.success,true);const hash=createHash('sha256').update(JSON.stringify(body.data)).digest('hex');assert.ok(payloads.has(hash));
      return {ms:Math.round(performance.now()-at),handler:response.headers()['server-timing'],pool:response.headers()['x-calendar-db-pool'],payloadHash:hash};
     }));
     report.loadChecks??=[];const result={module:mod,concurrency,totalMs:Math.round(performance.now()-started),successes:reads.length,reads};report.loadChecks.push(result);save();console.log(JSON.stringify({stage:'concurrent-live-reads',...result}));
    }
   }
   for(const {context} of Object.values(states))await context.close();report.checks.push({module:mod,check:'normal-logins-live-roster-and-identical-payload',pass:true});save();
  }
  report.complete=true;save();
 }catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();if(activePage)await activePage.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close()}
})().catch(e=>{console.error(e.message.replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1});
