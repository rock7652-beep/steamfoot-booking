// Read-only acceptance: page-owned complete rosters, normal isolated owner login.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const auth=JSON.parse(readFileSync(process.env.CALENDAR_QA_AUTH||'/tmp/calendar-entry-auth.json','utf8'));
const origin=new URL(auth.share).origin,out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/calendar-entry-parallel-20261101';mkdirSync(out,{recursive:true});
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt'));
const pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:process.env.HTTPS_PROXY},args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin]});
const report={commit:process.env.CALENDAR_QA_COMMIT||'dd87aa861e1588964e0124922e0ceabdda622d05',origin,method:'paired baseline/candidate normal login, 3 navigations each, alternate deployment order; compare all prepared month payloads, zero click detail reads, no business writes',calendars:[],openings:[],forms:[],checks:[],errors:[]};
let page;const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const configs=[{key:'sports',slug:'sports-live-flow',storeId:'sports-live-flow-store',path:'courses',id:'qa1469-20261030-sports-session'},{key:'music',slug:'lubymusic',storeId:'store-lubymusic',path:'courses',date:'2026-09-28',id:'qa0928-group-0'},{key:'beauty',slug:'beauty-hosted-20261021',storeId:'beauty-hosted-20261021',path:'beauty',id:'qa1469-20261030-beauty-booking'}];
async function fullSnapshot(p){return p.locator('[data-roster-ready="true"]').evaluate(el=>{let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))];while(fiber){if(fiber.memoizedProps?.initialSnapshot?.data)return fiber.memoizedProps.initialSnapshot.data;fiber=fiber.return;}throw Error('missing page-owned initialSnapshot');});}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function authoritative(context,cfg,id){const res=cfg.key==='beauty'?await context.request.get(origin+'/api/beauty/roster?'+new URLSearchParams({scope:'booking:'+id,store:cfg.storeId})):await context.request.post(origin+`/s/${cfg.slug}/admin/dashboard/courses/session-detail`,{data:{sessionId:id,rosterOnly:true,trialOnly:false},headers:{Origin:origin}});assert.equal(res.status(),200,'authoritative read status');const body=await res.json();assert.equal(body.success,true);return body.data;}
async function open(p,cfg,id,label){
 const row=p.locator(`[data-calendar-session="${id}"]`).first();await row.waitFor();
 let attempted=0;const detail=url=>cfg.key==='beauty'?url.pathname==='/api/beauty/roster':url.pathname.endsWith('/courses/session-detail');
 const route=async r=>{attempted++;await r.abort();};await p.route(detail,route);
 await row.evaluate(node=>{window.rosterClickAt=null;window.rosterReadyAt=null;node.addEventListener('click',()=>{window.rosterClickAt=performance.now();const observe=()=>{if(document.querySelector('[data-roster-ready="true"]')){window.rosterReadyAt=performance.now();observer.disconnect();}};const observer=new MutationObserver(observe);observer.observe(document.body,{childList:true,subtree:true});observe();},{once:true,capture:true});});
 await row.click();await p.locator('[data-roster-ready="true"]').waitFor();
 const elapsed=await p.evaluate(()=>window.rosterReadyAt-window.rosterClickAt);assert.ok(elapsed>=0&&elapsed<1000,'complete roster visible under 1s');
 const snapshot=await fullSnapshot(p);assert.ok(snapshot.roster.length>0);const ready=p.locator('[data-roster-ready="true"]');const text=await ready.innerText();
 const visible=snapshot.roster.find(row=>text.includes(row.customerName));assert.ok(visible,'full customer visible');if(visible.customerPhone)assert.ok(text.replace(/[^0-9]/g,'').includes(visible.customerPhone.replace(/[^0-9]/g,'')),'full phone visible');assert.ok(!text.includes('核對中'));
 await p.waitForTimeout(500);await p.unroute(detail,route);assert.equal(attempted,0,'opening must not start detail read');
 report.openings.push({module:cfg.key,label,clickToCompleteMs:Math.round(elapsed),initialDetailRequests:attempted,rows:snapshot.roster.length});save();return snapshot;
}
async function close(p){const dialog=p.locator('[role="dialog"]').filter({has:p.locator('[data-roster-ready="true"]')}).first();await dialog.getByRole('button',{name:'關閉',exact:true}).click();await p.locator('[data-roster-ready="true"]').waitFor({state:'hidden'});}
const canonical=value=>{const normalized=JSON.parse(JSON.stringify(value));const visit=v=>Array.isArray(v)?v.map(visit):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(key=>[key,visit(v[key])])):v;return visit(normalized);};
const fullDigest=value=>digest(canonical(value));
async function allPrepared(p){return p.locator('[data-calendar-rosters-ready]').evaluate(node=>{let fiber=node[Object.keys(node).find(k=>k.startsWith('__reactFiber$'))];while(fiber){if(fiber.memoizedProps?.rosterSnapshots?.details)return fiber.memoizedProps.rosterSnapshots.details;fiber=fiber.return;}throw Error('missing calendar-owned complete map');});}
const differences=(a,b,path='')=>{if(fullDigest(a??null)===fullDigest(b??null))return [];if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>differences(a[key],b[key],path+'.'+key)).slice(0,10);return [path];};
try{
 for(const cfg of configs.filter(c=>!process.env.CALENDAR_QA_MODULES||process.env.CALENDAR_QA_MODULES.split(',').includes(c.key))){
  const contexts={},pages={};const account=auth.accounts.find(a=>a.storeId===cfg.storeId);assert.ok(account.email.endsWith('@example.invalid'));
  for(const deployment of ['baseline','candidate']){
   const share=deployment==='baseline'?auth.baselineShare:auth.share;
   const context=await browser.newContext({viewport:{width:1366,height:900}});contexts[deployment]=context;page=await context.newPage();pages[deployment]=page;page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:cfg.key,deployment,message:e.message}));
   await page.addInitScript(()=>{window.calendarFirstReady=null;window.calendarReadyAt=null;const observer=new MutationObserver(()=>{const node=document.querySelector('[data-calendar-rosters-ready]');if(node&&window.calendarFirstReady===null)window.calendarFirstReady=node.getAttribute('data-calendar-rosters-ready');if(node?.getAttribute('data-calendar-rosters-ready')==='true'&&window.calendarReadyAt===null)window.calendarReadyAt=performance.now();});observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-calendar-rosters-ready']});});
   const appOrigin=new URL(share).origin;await page.goto(share,{waitUntil:'domcontentloaded'});await page.goto(appOrigin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}`);await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(auth.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});console.log(cfg.key,deployment,'normal-login');
  }
  const maps={};
  for(let sample=0;sample<Number(process.env.CALENDAR_QA_SAMPLES||3);sample++){
   for(const deployment of sample%2?['candidate','baseline']:['baseline','candidate']){
    page=pages[deployment];const appOrigin=new URL(deployment==='baseline'?auth.baselineShare:auth.share).origin;
    const url=appOrigin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}?date=${cfg.date||'2026-11-27'}&scheduleView=month`+(cfg.key==='beauty'?'&tab='+encodeURIComponent('班表'):'');
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});
    const calendar=await page.evaluate(()=>({firstReady:window.calendarFirstReady,readyMs:Math.round(window.calendarReadyAt),navigation:performance.getEntriesByType('navigation').map(n=>({requestStart:Math.round(n.requestStart),responseStart:Math.round(n.responseStart),responseEnd:Math.round(n.responseEnd),domContentLoaded:Math.round(n.domContentLoadedEventEnd)})),js:performance.getEntriesByType('resource').filter(r=>r.name.includes('/_next/static/')&&r.name.includes('.js')&&r.responseEnd<=window.calendarReadyAt).map(r=>({file:new URL(r.name).pathname.split('/').pop(),bytes:r.encodedBodySize,ms:Math.round(r.duration)})),count:Number(document.querySelector('[data-calendar-rosters-ready]').getAttribute('data-calendar-rosters-count'))}));assert.equal(calendar.firstReady,'true');assert.ok(calendar.count>0);maps[deployment]=await allPrepared(page);
    report.calendars.push({module:cfg.key,deployment,sample,warmup:sample===0,...calendar,payloadHash:fullDigest(maps[deployment]),preparedEntries:Object.keys(maps[deployment]).length});save();console.log(cfg.key,deployment,sample,'calendar',calendar.readyMs,'ms',calendar.count,'records');
    await page.getByRole('button',{name:'日表',exact:true}).click();await open(page,cfg,cfg.id,deployment+'-'+sample);await close(page);save();
    const add=page.getByRole('button',{name:cfg.key==='beauty'?'新增預約':'＋ 排課',exact:true});
    await page.evaluate(()=>{window.formAt=performance.now();});await add.click();
    const form=page.locator('[role="dialog"][aria-labelledby="course-panel-title"]');
    await form.getByRole('heading',{name:cfg.key==='beauty'?'新增預約':'新增排課',exact:true}).waitFor();
    const shellMs=await page.evaluate(()=>Math.round(performance.now()-window.formAt));
    await form.getByLabel(cfg.key==='sports'?'排課教學項目':cfg.key==='music'?'排課日期':'預約日期',{exact:true}).waitFor();
    const formMs=await page.evaluate(()=>Math.round(performance.now()-window.formAt));
    report.forms.push({module:cfg.key,deployment,sample,shellMs,formMs});save();console.log(cfg.key,deployment,'form',formMs,'ms');
    if(deployment==='candidate'){
      const time=form.locator('input[type="time"]').first();await time.fill('10:30');
      await page.setViewportSize({width:768,height:1024});assert.equal(await time.inputValue(),'10:30');
      await page.setViewportSize({width:1366,height:900});assert.equal(await time.inputValue(),'10:30');
      report.checks.push({module:cfg.key,sample,check:'form-draft-retained-across-resize',pass:true});
    }
    await form.getByRole('button',{name:'關閉',exact:true}).click();await form.waitFor({state:'hidden'});

   }
   const a=maps.baseline,b=maps.candidate;
   const mismatch=[...new Set([...Object.keys(a),...Object.keys(b)])].filter(id=>fullDigest(a[id]??null)!==fullDigest(b[id]??null));
   if(mismatch.length){report.mismatch={module:cfg.key,sample,ids:mismatch.slice(0,10),paths:mismatch.slice(0,3).map(id=>({id,paths:differences(a[id],b[id])}))};save();}
   assert.equal(mismatch.length,0,'complete month payload parity: '+cfg.key);
   report.checks.push({module:cfg.key,sample,check:'all-month-prepared-payloads-equal-baseline',entries:Object.keys(a).length,hash:fullDigest(a),pass:true});save();
  }
  page=pages.candidate;
  for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await open(page,cfg,cfg.id,'candidate-responsive-'+width);const dialog=page.locator('[role="dialog"]').filter({has:page.locator('[data-roster-ready="true"]')}).first(),box=await dialog.boundingBox();assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1);await page.screenshot({path:out+`/${cfg.key}-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'responsive-bounds',width,height,pass:true});await close(page);save();
  }
  if(cfg.key==='sports'){
   await page.setViewportSize({width:1366,height:900});await page.locator('input[type="date"]').first().fill('2026-12-22');await page.locator('[data-calendar-session="cmvdryomm0002js071vgixg48"]').first().waitFor();await page.locator('[data-calendar-rosters-ready="true"]').waitFor({state:'attached'});const mixed=await open(page,cfg,'cmvdryomm0002js071vgixg48','candidate-month-switch-mixed-trial-card');assert.ok(mixed.roster.some(r=>r.bookingKind==='TRIAL'));assert.ok(mixed.roster.some(r=>r.bookingKind==='CARD'));const current=await authoritative(contexts.candidate,cfg,'cmvdryomm0002js071vgixg48');assert.equal(fullDigest(mixed),fullDigest(current));report.checks.push({module:cfg.key,check:'mixed-month-roster-equals-authoritative',pass:true});await close(page);
  }
  await Promise.all(Object.values(contexts).map(context=>context.close()));console.log(cfg.key,'complete');
 }
 assert.equal(report.errors.length,0);report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
