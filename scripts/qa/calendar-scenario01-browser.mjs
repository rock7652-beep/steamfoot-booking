// Scenario 01 only. Normal isolated login and reversible QA teacher-note edit.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const auth=JSON.parse(readFileSync('/tmp/calendar-entry-auth.json','utf8')),backup=JSON.parse(readFileSync('/tmp/scenario01-note-backup.json','utf8'));
const out=process.env.SCENARIO01_OUTPUT||'/workspace/reports/calendar-scenario01-20261101/recorded';mkdirSync(out,{recursive:true});
const report={baseline:process.env.SCENARIO01_BASELINE_SHA||'69ef582c58035a6ca6faee1a4443b982a6ee609d',candidate:process.env.SCENARIO01_CANDIDATE_SHA||'unrecorded',manual:'蒸管家操作體驗情境與驗收手冊.docx — 01, plus user-requested modify and return',thresholdMs:1000,samples:[],restored:[],errors:[],videos:[],monthResponses:[],edgeChecks:[],dataAudit:[]};
const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(v))))).digest('hex');
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:process.env.HTTPS_PROXY},args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin]});
const configs=[{key:'sports',slug:'sports-live-flow',storeId:'sports-live-flow-store',date:'2026-11-27',other:'2026-12-22',id:'qa1469-20261030-sports-session'},{key:'music',slug:'lubymusic',storeId:'store-lubymusic',date:'2026-09-28',other:'2026-08-28',id:'qa0928-group-0'}];
function prepared(){const n=document.querySelector('[data-calendar-rosters-ready]');let f=n?.[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f){if(f.memoizedProps?.rosterSnapshots?.details){let h=f.memoizedState;while(h){const v=h.memoizedState;if(v?.month&&v?.rosterSnapshots?.details)return v.rosterSnapshots.details;h=h.next;}return f.memoizedProps.rosterSnapshots.details;}f=f.return;}return null;}
async function close(p){const dialog=p.locator('[role="dialog"]').filter({has:p.locator('[data-roster-ready="true"]')}).first();let attempts=0;while(await p.locator('[data-roster-ready="true"]').isVisible()&&attempts<5){await dialog.getByRole('button',{name:'關閉',exact:true}).click();attempts++;await p.waitForTimeout(200);}if(attempts>1)report.errors.push({kind:'close-ignored',attempts});await p.locator('[data-roster-ready="true"]').waitFor({state:'hidden'});return attempts;}
async function open(p,cfg){await p.evaluate(()=>window.scenarioOpenAt=performance.now());await p.locator(`[data-calendar-session="${cfg.id}"]`).first().click();await p.locator('[role="dialog"]').first().waitFor();const shellMs=await p.evaluate(()=>Math.round(performance.now()-window.scenarioOpenAt));await p.locator('[data-roster-ready="true"]').waitFor();await p.waitForFunction(()=>document.querySelector('[data-roster-ready="true"] select[aria-label$="出勤狀態"]:not(:disabled)'));return {shellMs,...await p.evaluate(()=>({openMs:Math.round(performance.now()-window.scenarioOpenAt),at:Math.round(performance.now())}))};}
async function authoritative(c,origin,cfg){const r=await c.request.post(origin+`/s/${cfg.slug}/admin/dashboard/courses/session-detail`,{data:{sessionId:cfg.id,rosterOnly:true,trialOnly:false},headers:{Origin:origin}});assert.equal(r.status(),200);const b=await r.json();assert.equal(b.success,true);return b.data;}
async function editor(p,note){await p.locator('[data-roster-ready="true"]').getByRole('button',{name:note||'備註 ✎',exact:true}).click();return p.locator('[role="dialog"]').filter({has:p.getByPlaceholder('記錄本次上課需要留意的事項')}).last();}
async function month(p,date){await p.evaluate('window.oldScenarioMap=('+prepared.toString()+')()');await p.evaluate(()=>window.monthAt=performance.now());await p.locator('input[type="date"]').first().fill(date);const responseMs=await p.evaluate(()=>Math.round(performance.now()-window.monthAt));await p.waitForFunction('document.querySelector(\'[data-calendar-rosters-ready="true"]\')&&('+prepared.toString()+')()!==window.oldScenarioMap');const completeMs=await p.evaluate(()=>Math.round(performance.now()-window.monthAt));report.monthResponses.push({date,responseMs,completeMs});return completeMs;}
async function finalChecks(p,cfg,deployment){
 const push=(name,data)=>{report.edgeChecks.push({module:cfg.key,deployment,name,...data});save();};
 if(cfg.key==='music'){
  for(let sample=0;sample<3;sample++){
   await open(p,cfg);const beforeText=await p.locator('[data-roster-ready="true"]').innerText();
   let failures=0;const match=u=>u.pathname.endsWith('/courses/session-detail');const handler=async route=>{failures++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'QA controlled roster read failure'})});};
   await p.route(match,handler);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.getByText('讀取失敗，現有名單已保留，請重試',{exact:true}).waitFor();const afterText=await p.locator('[data-roster-ready="true"]').innerText(),hasRetry=await p.getByRole('button',{name:/重新讀取|重試/}).count();await p.unroute(match,handler);
   const restored=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/courses/session-detail')&&r.status()===200);const at=performance.now();if(hasRetry)await p.getByRole('button',{name:'重新讀取名單',exact:true}).click();else await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await restored;await p.waitForTimeout(200);
   push('music-background-roster-failure-and-recovery',{sample,failures,retainedNames:beforeText.split('\n').filter(s=>s.includes('同學')||s.includes('學員')).every(s=>afterText.includes(s)),hasRetryButton:hasRetry>0,recoveryMs:Math.round(performance.now()-at),errorStillVisible:await p.getByText('讀取失敗，現有名單已保留，請重試',{exact:true}).count()>0,pass:hasRetry>0&&await p.getByText('讀取失敗，現有名單已保留，請重試',{exact:true}).count()===0});await close(p);
  }
 }
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await p.setViewportSize({width,height});await open(p,cfg);const dialog=p.locator('[role="dialog"]').filter({has:p.locator('[data-roster-ready="true"]')}).first(),b=await dialog.boundingBox();const pass=!!b&&b.x>=-1&&b.y>=-1&&b.x+b.width<=width+1&&b.y+b.height<=height+1;push('responsive-roster-bounds',{width,height,pass});await p.screenshot({path:out+`/${cfg.key}-${width}.png`,fullPage:true});await close(p);
 }
}

async function scenarioEdges(p,cfg,deployment){
 if(process.env.SCENARIO01_MIXED_ONLY==='1'){
  await month(p,cfg.other);const mixed={...cfg,id:'cmvdryomm0002js071vgixg48'};await open(p,mixed);const map=await p.evaluate(prepared),truth=await authoritative(p.context(),new URL(p.url()).origin,mixed),rows=map[mixed.id].roster;
  const courseName=await p.locator('[data-roster-ready="true"]').evaluate(n=>{let f=n[Object.keys(n).find(k=>k.startsWith('__reactFiber$'))];while(f){if(f.memoizedProps?.courseName)return f.memoizedProps.courseName;f=f.return;}return '';});
  report.edgeChecks.push({module:cfg.key,deployment,name:'same-class-trial-and-personal-card-rights',kinds:[...new Set(rows.map(r=>r.bookingKind))],rows:rows.length,headerContainsPackageCount:/\d+\s*堂/.test(courseName),payloadParity:hash(map[mixed.id])===hash(truth),cardFieldsPresent:rows.filter(r=>r.bookingKind==='CARD').every(r=>'cardRemaining' in r&&'pointCost' in r&&'planName' in r),pass:rows.some(r=>r.bookingKind==='TRIAL')&&rows.some(r=>r.bookingKind==='CARD')&&hash(map[mixed.id])===hash(truth)});save();return;
 }
 if(process.env.SCENARIO01_FINAL_CHECKS==='1'){await finalChecks(p,cfg,deployment);return;}
 const check=(name,data)=>{report.edgeChecks.push({module:cfg.key,deployment,name,...data});save();};
 if(cfg.key==='music'){
  for(let sample=0;sample<3;sample++){const ms=await month(p,'2026-01-13'),map=await p.evaluate(prepared);check('empty-month',{sample,completeMs:ms,expectedClasses:0,actualClasses:Object.keys(map).length,selectedDate:await p.locator('input[type="date"]').first().inputValue(),pass:Object.keys(map).length===0});await month(p,cfg.date);}
 }
 for(let sample=0;sample<3;sample++){
  let begin,release,done;const started=new Promise(r=>begin=r),gate=new Promise(r=>release=r),finished=new Promise(r=>done=r);
  const latest=cfg.key==='sports'?cfg.date:'2026-07-28';
  const match=u=>u.pathname.endsWith(cfg.key==='sports'?'/courses/calendar-read':'/courses')&&(cfg.key==='sports'||u.searchParams.get('date')===cfg.other);
  let intercepted=false;
  const handler=async route=>{if(cfg.key==='sports'&&route.request().postDataJSON()?.date!==cfg.other||intercepted){await route.continue();return;}intercepted=true;begin();try{const response=await route.fetch();await gate;await route.fulfill({response});done({delivered:true});}catch{done({aborted:true});}};
  await p.route(match,handler);await p.locator('input[type="date"]').first().fill(cfg.other);await started;await p.locator('input[type="date"]').first().fill(latest);
  await p.waitForFunction(date=>document.querySelector('input[type="date"]')?.value===date&&new URL(location.href).searchParams.get('date')===date&&document.querySelector('[data-calendar-rosters-ready="true"]'),latest);release();const delayed=await finished;await p.waitForTimeout(250);
  const selectedDate=await p.locator('input[type="date"]').first().inputValue();const ready=await p.locator('[data-calendar-rosters-ready="true"]').count();check('late-old-month-does-not-overwrite-latest',{sample,oldMonth:cfg.other,latestMonth:latest,selectedDate,...delayed,pass:selectedDate===latest&&ready===1});await p.unroute(match,handler);if(latest!==cfg.date)await month(p,cfg.date);
 }
 if(cfg.key==='sports'){
  for(let sample=0;sample<3;sample++){
   let failed=false;const match=u=>u.pathname.endsWith('/courses/calendar-read');const handler=async route=>{if(!failed&&route.request().postDataJSON()?.date===cfg.other){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'QA controlled roster failure'})});}else await route.continue();};
   await p.route(match,handler);await p.locator('input[type="date"]').first().fill(cfg.other);await p.getByRole('alert').filter({hasText:'課表讀取失敗'}).first().waitFor();const datePreserved=(await p.locator('input[type="date"]').first().inputValue())===cfg.other,notReady=await p.locator('[data-calendar-rosters-ready="true"]').count()===0;const at=performance.now();await p.getByRole('button',{name:'重新讀取',exact:true}).click();await p.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});const retryMs=Math.round(performance.now()-at);check('critical-month-read-failure-and-retry',{sample,datePreserved,notReady,retryMs,pass:failed&&datePreserved&&notReady});await p.unroute(match,handler);await month(p,cfg.date);
  }
 }
}

let page;
try{
 for(const cfg of configs.filter(c=>!process.env.SCENARIO01_MODULES||process.env.SCENARIO01_MODULES.split(',').includes(c.key))){
  const original=backup.find(r=>r.id===cfg.id&&r.storeId===cfg.storeId);assert.ok(original);const account=auth.accounts.find(a=>a.storeId===cfg.storeId);assert.ok(account.email.endsWith('@example.invalid'));
  for(const deployment of (cfg.key==='music'?['candidate','baseline']:['baseline','candidate']).filter(d=>!process.env.SCENARIO01_DEPLOYMENTS||process.env.SCENARIO01_DEPLOYMENTS.split(',').includes(d))){
  for(let coldSample=0;coldSample<Number(process.env.SCENARIO01_COLD_SAMPLES||3);coldSample++){
   const share=deployment==='baseline'?auth.baselineShare:auth.share,origin=new URL(share).origin;
   const c=await browser.newContext({viewport:{width:1366,height:900},recordVideo:{dir:out+'/video',size:{width:1366,height:900}}});page=await c.newPage();report.videos.push({module:cfg.key,deployment,coldSample,path:await page.video().path()});page.setDefaultTimeout(45000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:cfg.key,deployment,error:e.message}));
   await page.goto(share,{waitUntil:'domcontentloaded'});await page.goto(origin+`/hq/login?store=${cfg.slug}`);await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(auth.password);const loginAt=performance.now();await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname===`/s/${cfg.slug}/admin/dashboard`,{timeout:90000});
   const loginToHomeMs=Math.round(performance.now()-loginAt);const previousPage=await page.evaluate(()=>({path:location.pathname,elapsedMs:Math.round(performance.now()),courseResources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/courses')).length}));
   const url=origin+`/s/${cfg.slug}/admin/dashboard/courses?date=${cfg.date}&scheduleView=day`;
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});const calendarMs=await page.evaluate(()=>Math.round(performance.now()));await page.getByRole('button',{name:'日表',exact:true}).click();const first=await open(page,cfg);const actionable=await page.locator('[data-roster-ready="true"]').evaluate(n=>({checkboxes:n.querySelectorAll('input[type=checkbox]').length,enabledCheckboxes:[...n.querySelectorAll('input[type=checkbox]')].filter(i=>!i.disabled).length,enabledActions:[...n.querySelectorAll('[data-roster-action-trigger]')].filter(i=>!i.disabled).length}));const map=await page.evaluate(prepared),truth=await authoritative(c,origin,cfg);const initialParity=hash(map[cfg.id])===hash(truth);
   report.samples.push({module:cfg.key,deployment,scenario:'first-entry',coldSample,loginToHomeMs,calendarMs,...first,totalToUsableRosterMs:first.at,previousPage,actionable,entries:Object.keys(map).length,payloadParity:initialParity,under1s:first.at<1000});save();console.log(cfg.key,deployment,'first-entry',calendarMs,first.openMs);
   if(process.env.SCENARIO01_DATA_ONLY==='1'){const rows=Object.values(map).flatMap(d=>d.roster);const required=['customerName','customerPhone','status','bookingKind','notes'];report.dataAudit.push({module:cfg.key,deployment,classes:Object.keys(map).length,rosters:rows.length,hash:hash(map),missingRequiredFields:rows.filter(r=>required.some(k=>!(k in r))).length,cardRows:rows.filter(r=>r.bookingKind==='CARD').length,trialRows:rows.filter(r=>r.bookingKind==='TRIAL').length});save();await c.close();continue;}
   if(process.env.SCENARIO01_EDGE_ONLY==='1'){await close(page);await scenarioEdges(page,cfg,deployment);await c.close();continue;}
   if(coldSample<Number(process.env.SCENARIO01_COLD_SAMPLES||3)-1){await c.close();continue;}
   await close(page);for(let sample=0;sample<3;sample++){const opened=await open(page,cfg);report.samples.push({module:cfg.key,deployment,scenario:'reopen',sample,...opened,under1s:opened.openMs<1000});await close(page);}save();
   for(let sample=0;sample<3;sample++){
    const leaveAt=performance.now();await page.goto(origin+`/s/${cfg.slug}/admin/dashboard`,{waitUntil:'domcontentloaded'});const previousPageMs=Math.round(performance.now()-leaveAt),enterAt=performance.now();
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});const calendarMs=await page.evaluate(()=>Math.round(performance.now()));await page.getByRole('button',{name:'日表',exact:true}).click();const opened=await open(page,cfg);const completeMs=Math.round(performance.now()-enterAt);const warmMap=await page.evaluate(prepared);assert.equal(hash(warmMap[cfg.id]),hash(truth));
    report.samples.push({module:cfg.key,deployment,scenario:'warm-reentry',sample,previousPageMs,calendarMs,completeMs,...opened,payloadParity:true,under1s:completeMs<1000});save();await close(page);
   }
   for(let sample=0;sample<3;sample++){const awayMs=await month(page,cfg.other),backMs=await month(page,cfg.date);await page.getByRole('button',{name:'日表',exact:true}).click();const afterMonth=await open(page,cfg);const afterMap=await page.evaluate(prepared);assert.equal(hash(afterMap[cfg.id]),hash(truth));report.samples.push({module:cfg.key,deployment,scenario:'switch-month',sample,awayMs,backMs,...afterMonth,returnTotalMs:backMs+afterMonth.openMs,payloadParity:true,under1s:awayMs<1000&&backMs+afterMonth.openMs<1000});await close(page);save();}
   await open(page,cfg);
   const marker='qa-scenario01-'+randomUUID();const e=await editor(page,original.teacherNote);await e.getByPlaceholder('記錄本次上課需要留意的事項').fill(marker);await page.evaluate(()=>window.saveAt=performance.now());await e.getByRole('button',{name:'儲存',exact:true}).click();await e.waitFor({state:'hidden'});await page.locator('[data-roster-ready="true"]').getByRole('button',{name:marker,exact:true}).waitFor();const confirmedMs=await page.evaluate(()=>Math.round(performance.now()-window.saveAt));await page.waitForFunction(()=>document.querySelector('[data-roster-ready="true"] select[aria-label$="出勤狀態"]:not(:disabled)'));const saveMs=await page.evaluate(()=>Math.round(performance.now()-window.saveAt));await close(page);const returned=await open(page,cfg);const saveToReturnMs=await page.evaluate(()=>Math.round(performance.now()-window.saveAt));const current=await authoritative(c,origin,cfg);const visible=await page.locator('[data-roster-ready="true"]').getByRole('button',{name:marker,exact:true}).count();
   report.samples.push({module:cfg.key,deployment,scenario:'modify-and-return',confirmedMs,saveMs,returnOpenMs:returned.openMs,saveToReturnMs,visibleUpdatedNote:visible===1,authoritativeUpdatedNote:current.session.teacherNote===marker,under1s:saveToReturnMs<1000});save();console.log(cfg.key,deployment,'modify-and-return',saveMs,returned.openMs,visible===1);
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});await page.getByRole('button',{name:'日表',exact:true}).click();await open(page,cfg);const restore=await editor(page,marker);await restore.getByPlaceholder('記錄本次上課需要留意的事項').fill(original.teacherNote??'');await restore.getByRole('button',{name:'儲存',exact:true}).click();await restore.waitFor({state:'hidden'});await page.locator('[data-roster-ready="true"]').getByRole('button',{name:original.teacherNote||'備註 ✎',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-roster-ready="true"] select[aria-label$="出勤狀態"]:not(:disabled)'));const restored=await authoritative(c,origin,cfg);assert.equal(restored.session.teacherNote??'',original.teacherNote??'');report.restored.push({module:cfg.key,deployment,restored:true});save();await c.close();
  }
  }
 }
 report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
