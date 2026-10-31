import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const pair=JSON.parse(readFileSync('/tmp/calendar-profile-shares.json','utf8'));
const cfg=JSON.parse(readFileSync('/tmp/calendar-qa-context.json','utf8'));
const auth=JSON.parse(readFileSync('/tmp/calendar-qa-reauth.json','utf8'));
const shares={optimized:pair.candidate},access={...cfg,password:auth.password},extra=cfg.extras;
const origin=new URL(shares.optimized).origin;
const out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/silverlily-calendar-loading-20261031/final-forms';mkdirSync(out,{recursive:true});
const configs=[{key:'sports',email:access.email,slug:'sports-live-flow',path:'courses',add:'＋ 排課',field:'排課教學項目',formTitle:'新增排課',rosterId:'course-operation-title'},...extra.map(a=>({key:a.module,email:a.email,slug:a.module==='music'?'lubymusic':'beauty-hosted-20261021',path:a.module==='music'?'courses':'beauty',add:a.module==='music'?'＋ 排課':'新增預約',field:a.module==='music'?'排課日期':'預約日期',formTitle:a.module==='music'?'新增排課':'新增預約',rosterId:a.module==='music'?'course-operation-title':'beauty-roster-title'}))];
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});
const report={commit:process.env.CALENDAR_QA_COMMIT||'524d57cb1009322c9defbf30a4b620963b6ccba8',origin,method:'normal login; measure after page load plus 1200ms; existing metadata-only 15s prefetch retained; no form submission',scope:'three isolated synthetic stores, normal owner login, no submitted booking/attendance/payment writes',samples:[],checks:[],errors:[]};let page;
const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const target=async(p,cfg)=>{
 await p.getByRole('button',{name:'日表',exact:true}).click();
 const id=cfg.key==='sports'?'qa1469-20261030-sports-session':cfg.key==='music'?'qa1469-20261030-music-session':'qa1469-20261030-beauty-booking';
 const row=p.locator(`[data-calendar-session="${id}"]`).first();await row.waitFor();return row;
};
const form=p=>p.locator('[role="dialog"][aria-labelledby="course-panel-title"]');
async function bounds(locator,width,height){const r=await locator.boundingBox();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify({width,height,box:r}));}
try{
 for(const cfg of configs.filter(c=>!process.env.CALENDAR_QA_MODULES||process.env.CALENDAR_QA_MODULES.split(',').includes(c.key))){
  assert.ok(cfg.email.endsWith('@example.invalid'));const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(45000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:cfg.key,error:e.message}));
  let documentRequests=0;
  const note=(kind,url)=>{report.events??=[];report.events.push({module:cfg.key,kind,path:new URL(url).pathname,at:Date.now()});if(report.events.length>120)report.events.shift();};page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&frame.url().startsWith('http'))note('navigation',frame.url());});page.on('request',request=>{if(request.isNavigationRequest()&&request.frame()===page.mainFrame()){documentRequests++;note('document-request',request.url());}});
  await page.goto(shares.optimized,{waitUntil:'domcontentloaded'});await page.goto(origin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}`);await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(access.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});report.checks.push({module:cfg.key,check:'normal-login',pass:true});save();console.log(cfg.key,'login passed');
  const url=origin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}?date=2026-11-27&scheduleView=month`+(cfg.key==='beauty'?'&tab='+encodeURIComponent('班表'):'');
  for(let sample=0;sample<Number(process.env.CALENDAR_QA_SAMPLES||6);sample++){
   await page.goto(url,{waitUntil:'load'});const add=page.getByRole('button',{name:cfg.add,exact:true});await add.waitFor();await page.waitForTimeout(1200);
   await add.evaluate(node=>{window.formProfileStart=performance.now();window.formProfileClick=undefined;node.addEventListener("click",()=>{window.formProfileClick=performance.now()},{once:true,capture:true});});await add.click();await form(page).getByRole('heading',{name:cfg.formTitle,exact:true}).waitFor();const shellMs=Math.round(await page.evaluate(()=>performance.now()-window.formProfileStart));await form(page).getByLabel(cfg.field,{exact:true}).waitFor();const firstPaintMs=Math.round(await page.evaluate(()=>performance.now()-window.formProfileStart));
   if(cfg.key==='sports')await page.waitForFunction(()=>![...document.querySelectorAll('[role=dialog] [role=status]')].some(n=>n.textContent.includes('正在讀取排課資料')),{},{polling:'raf'});
   const nativeTiming=await page.evaluate(()=>({clickReadyMs:Math.round(performance.now()-window.formProfileClick),inputWaitMs:Math.round(window.formProfileClick-window.formProfileStart)}));const data={module:cfg.key,sample,warmup:sample===0,...nativeTiming,kind:'schedule',shellMs,firstPaintMs,authoritativeMs:Math.round(await page.evaluate(()=>performance.now()-window.formProfileStart))};report.samples.push(data);save();console.log(JSON.stringify(data));
   await form(page).getByRole('button',{name:'關閉',exact:true}).click();await form(page).waitFor({state:'hidden'});

  }
  for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
   await page.setViewportSize({width,height});await page.getByRole('button',{name:cfg.add,exact:true}).click();await form(page).getByLabel(cfg.field,{exact:true}).waitFor();await bounds(form(page),width,height);
   const time=form(page).locator('input[type="time"]').first();await time.fill('10:30');await page.setViewportSize({width:width===1366?1024:1366,height:900});assert.equal(await time.inputValue(),'10:30');await page.setViewportSize({width,height});
   await page.screenshot({path:out+`/${cfg.key}-schedule-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'form-bounds-and-draft-retention',width,height,pass:true});
   await form(page).getByRole('button',{name:'關閉',exact:true}).click();await form(page).waitFor({state:'hidden'});
   const documentsBefore=documentRequests;await (await target(page,cfg)).click();const list=page.locator(`[role="dialog"][aria-labelledby="${cfg.rosterId}"]`);await list.getByPlaceholder('搜尋姓名或手機').waitFor();await bounds(list,width,height);await page.waitForTimeout(1000);assert.equal(documentRequests,documentsBefore,'opening roster must not trigger full document navigation');await page.screenshot({path:out+`/${cfg.key}-roster-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'roster-bounds',width,height,fullDocumentNavigations:documentRequests-documentsBefore,pass:true});await list.getByRole('button',{name:'關閉',exact:true}).click();save();
  }
  await context.close();
 }
 report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
