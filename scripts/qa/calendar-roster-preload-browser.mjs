// Read-only acceptance: page-owned complete rosters, normal isolated owner login.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const auth=JSON.parse(readFileSync(process.env.CALENDAR_QA_AUTH||'/tmp/calendar-preload-auth.json','utf8'));
const origin=new URL(auth.share).origin,out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/calendar-roster-preload-20261101';mkdirSync(out,{recursive:true});
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt'));
const pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy:{server:process.env.HTTPS_PROXY},args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin]});
const report={commit:process.env.CALENDAR_QA_COMMIT||'636d07204c03946f4e5c794b0dce0335256f7a0d',origin,method:'all calendar rosters before calendar-ready; no deliberate idle before click; abort opening detail reads for 500ms; compare full snapshot with original API; no business writes',calendars:[],openings:[],checks:[],errors:[]};
let page;const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const configs=[{key:'sports',slug:'sports-live-flow',storeId:'sports-live-flow-store',path:'courses',id:'qa1469-20261030-sports-session'},{key:'music',slug:'lubymusic',storeId:'store-lubymusic',path:'courses',id:'qa1469-20261030-music-session'},{key:'beauty',slug:'beauty-hosted-20261021',storeId:'beauty-hosted-20261021',path:'beauty',id:'qa1469-20261030-beauty-booking'}];
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
 assert.ok(text.includes(snapshot.roster[0].customerName),'full customer visible');if(snapshot.roster[0].customerPhone)assert.ok(text.includes(snapshot.roster[0].customerPhone),'full phone visible');assert.ok(!text.includes('核對中'));
 await p.waitForTimeout(500);await p.unroute(detail,route);assert.equal(attempted,0,'opening must not start detail read');
 report.openings.push({module:cfg.key,label,clickToCompleteMs:Math.round(elapsed),initialDetailRequests:attempted,rows:snapshot.roster.length});save();return snapshot;
}
async function close(p){const dialog=p.locator('[role="dialog"]').filter({has:p.locator('[data-roster-ready="true"]')}).first();await dialog.getByRole('button',{name:'關閉',exact:true}).click();await p.locator('[data-roster-ready="true"]').waitFor({state:'hidden'});}
try{
 for(const cfg of configs.filter(c=>!process.env.CALENDAR_QA_MODULES||process.env.CALENDAR_QA_MODULES.split(',').includes(c.key))){
  const account=auth.accounts.find(a=>a.storeId===cfg.storeId);assert.ok(account?.email.endsWith('@example.invalid'));
  const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(60000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:cfg.key,message:e.message}));
  await page.addInitScript(()=>{window.calendarFirstReady=null;window.calendarReadyAt=null;const observer=new MutationObserver(()=>{const node=document.querySelector('[data-calendar-rosters-ready]');if(node&&window.calendarFirstReady===null)window.calendarFirstReady=node.getAttribute('data-calendar-rosters-ready');if(node?.getAttribute('data-calendar-rosters-ready')==='true'&&window.calendarReadyAt===null)window.calendarReadyAt=performance.now();});observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-calendar-rosters-ready']});});
  await page.goto(auth.share,{waitUntil:'domcontentloaded'});await page.goto(origin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}`);await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(auth.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
  const url=origin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}?date=2026-11-27&scheduleView=month`+(cfg.key==='beauty'?'&tab='+encodeURIComponent('班表'):'');
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-calendar-rosters-ready="true"]').waitFor();
  const calendar=await page.evaluate(()=>({firstReady:window.calendarFirstReady,readyMs:Math.round(window.calendarReadyAt),count:Number(document.querySelector('[data-calendar-rosters-ready]').getAttribute('data-calendar-rosters-count'))}));assert.equal(calendar.firstReady,'true');assert.ok(calendar.count>0);report.calendars.push({module:cfg.key,...calendar});save();console.log(cfg.key,'calendar',JSON.stringify(calendar));
  await page.getByRole('button',{name:'日表',exact:true}).click();
  const snapshot=await open(page,cfg,cfg.id,'first-open');
  const authority=await authoritative(context,cfg,cfg.id);if(cfg.key==='beauty'){delete snapshot.readVersion;delete authority.readVersion;}assert.equal(digest(snapshot),digest(authority),'full preload equals authoritative original API');report.checks.push({module:cfg.key,check:'full-payload-parity',hash:digest(snapshot),pass:true});await close(page);
  await open(page,cfg,cfg.id,'reopen');await close(page);
  for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await open(page,cfg,cfg.id,'responsive-'+width);
   const dialog=page.locator('[role="dialog"]').filter({has:page.locator('[data-roster-ready="true"]')}).first(),box=await dialog.boundingBox();assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'dialog within viewport');
   await page.screenshot({path:out+`/${cfg.key}-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'responsive-bounds',width,height,pass:true});await close(page);save();
  }
  if(cfg.key==='sports'){
   await page.setViewportSize({width:1366,height:900});await page.locator('input[type="date"]').first().fill('2026-12-22');await page.locator('[data-calendar-session="cmvdryomm0002js071vgixg48"]').first().waitFor();await page.locator('[data-calendar-rosters-ready="true"]').waitFor();const mixed=await open(page,cfg,'cmvdryomm0002js071vgixg48','month-switch-mixed-trial-card');assert.ok(mixed.roster.some(r=>r.bookingKind==='TRIAL'));assert.ok(mixed.roster.some(r=>r.bookingKind==='CARD'));const authoritativeMixed=await authoritative(context,cfg,'cmvdryomm0002js071vgixg48');assert.equal(digest(mixed),digest(authoritativeMixed));report.checks.push({module:cfg.key,check:'month-switch-complete-mixed-roster-parity',pass:true});await close(page);
  }
  await context.close();console.log(cfg.key,'complete');
 }
 assert.equal(report.errors.length,0);report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
