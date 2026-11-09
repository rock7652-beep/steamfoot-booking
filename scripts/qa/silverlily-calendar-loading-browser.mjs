import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const shares=JSON.parse(readFileSync(process.env.CALENDAR_QA_SHARES_FILE??'/tmp/silverlily-preview-shares.json','utf8'));
const access=JSON.parse(readFileSync(process.env.CALENDAR_QA_ACCESS_FILE??'/tmp/silverlily-preview-access.json','utf8'));
assert.ok(access.email.endsWith('@example.invalid'));
const out=process.env.CALENDAR_QA_REPORT_DIR??'/workspace/reports/silverlily-calendar-loading-20261031';mkdirSync(out,{recursive:true});
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt'));
// Temporary, isolated browser process: pin only the configured environment proxy
// certificate. Do not edit the persistent NSS store or ignore all TLS errors.
const pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});
const report={scope:'isolated synthetic sports store; normal owner login; no submitted business writes',samples:[],checks:[],errors:[]};let page;
const save=()=>writeFileSync(out+'/browser-results.json',JSON.stringify(report,null,2));
const dialog=p=>p.locator('[role="dialog"][aria-labelledby="course-panel-title"]');
const roster=p=>p.locator('[role="dialog"][aria-labelledby="course-operation-title"]');
try{
 for(const variant of ['baseline','optimized']){
  const origin=new URL(shares[variant]).origin;assert.ok(origin.endsWith('.vercel.app'));
  const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',e=>report.errors.push({variant,error:e.message}));page.on('dialog',d=>d.accept());
  await page.goto(shares[variant],{waitUntil:'domcontentloaded'});
  await page.getByLabel('Email',{exact:true}).fill(access.email);await page.getByLabel('密碼',{exact:true}).fill(access.password);
  await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
  report.checks.push({variant,check:'normal-isolated-owner-login',pass:true});save();console.log(variant,'login passed');
  const responses=[];page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.endsWith('/schedule-options')||path.endsWith('/session-detail'))responses.push({path,status:r.status(),serverTiming:r.headers()['server-timing']??null});});
  for(let sample=0;sample<5;sample++){
   await page.goto(origin+'/s/sports-live-flow/admin/dashboard/courses?date=2026-11-27',{waitUntil:'load'});
   const add=page.getByRole('button',{name:'＋ 排課',exact:true});await add.waitFor();
   // One warmup, then the same user dwell for both versions; no route mocks and
   // no forced HTTP-cache disabling. Metadata warmup is part of the change.
   await page.waitForTimeout(1200);
   const before=responses.length,start=performance.now();await add.click();await dialog(page).getByRole('heading',{name:'新增排課',exact:true}).waitFor();const shellMs=Math.round(performance.now()-start);
   await page.getByLabel('排課教學項目',{exact:true}).waitFor();const fieldsMs=Math.round(performance.now()-start);
   const item={variant,sample,warmup:sample===0,kind:'schedule',shellMs,readyMs:fieldsMs,readsAfterClick:responses.slice(before)};report.samples.push(item);save();console.log(JSON.stringify(item));
   await dialog(page).getByRole('button',{name:'關閉',exact:true}).click();await dialog(page).waitFor({state:'hidden'});
   const target=page.getByRole('button',{name:/開啟.*(?:QA1469 A課程|QA-課程A-1020).*上課名單/}).first();await target.waitFor();
   const rbefore=responses.length,rs=performance.now();await target.click();await roster(page).getByRole('heading',{name:'上課名單',exact:true}).waitFor();const rosterShell=Math.round(performance.now()-rs);
   await roster(page).getByPlaceholder('搜尋姓名或手機').waitFor();
   const ri={variant,sample,warmup:sample===0,kind:'roster',shellMs:rosterShell,readyMs:Math.round(performance.now()-rs),readsAfterClick:responses.slice(rbefore)};report.samples.push(ri);save();console.log(JSON.stringify(ri));
   if(variant==='optimized')assert.ok((await roster(page).innerText()).includes('QA-課程A-1020'),'teaching item used in roster header');
   await roster(page).getByRole('button',{name:'關閉',exact:true}).click();await roster(page).waitFor({state:'hidden'});
  }
  if(variant==='optimized'){
   for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
    await page.setViewportSize({width,height});await page.getByRole('button',{name:'＋ 排課',exact:true}).click();await page.getByLabel('排課教學項目',{exact:true}).waitFor();
    const time=dialog(page).locator('input[type="time"]');await time.fill('10:30');
    await page.setViewportSize({width:width===1366?1024:1366,height:900});assert.equal(await time.inputValue(),'10:30');await page.setViewportSize({width,height});
    const box=await dialog(page).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
    await page.screenshot({path:out+`/sports-schedule-${width}.png`,fullPage:true});report.checks.push({variant,check:'schedule-bounds-and-draft-retention',width,height,pass:true});
    await dialog(page).getByRole('button',{name:'關閉',exact:true}).click();await dialog(page).waitFor({state:'hidden'});
    await page.getByRole('button',{name:/開啟.*QA-課程A-1020.*上課名單/}).first().click();await roster(page).getByPlaceholder('搜尋姓名或手機').waitFor();
    const rb=await roster(page).boundingBox();assert.ok(rb&&rb.x>=0&&rb.y>=0&&rb.x+rb.width<=width+1&&rb.y+rb.height<=height+1);
    await page.screenshot({path:out+`/sports-roster-${width}.png`,fullPage:true});report.checks.push({variant,check:'roster-bounds',width,height,pass:true});
    await roster(page).getByRole('button',{name:'關閉',exact:true}).click();save();
   }
   let rsc=0;const listener=req=>{if(req.headers()['rsc']==='1'&&new URL(req.url()).pathname.endsWith('/dashboard/courses'))rsc++;};page.on('request',listener);
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(1200);page.off('request',listener);assert.equal(rsc,0);report.checks.push({variant,check:'focus-does-not-refresh-server-tree',pass:true});
  }
  await context.close();
 }
 report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/browser-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
