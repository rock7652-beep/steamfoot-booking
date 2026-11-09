import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.env.BEAUTY_AUTOCLOSE_ENV_DIR??process.cwd());
const {chromium}=require('playwright');
const cfg=JSON.parse(readFileSync(process.env.BEAUTY_AUTOCLOSE_LOGIN_FILE??'/tmp/beauty-autoclose-access.json','utf8'));
const base=process.env.QA_URL,out=process.env.QA_OUT,baseline=process.env.QA_BASELINE==='1';
assert.ok(base&&new URL(base).origin===base&&base.endsWith('.vercel.app')&&out);assert.equal(cfg.storeId,'beauty-hosted-20261021');assert.equal(cfg.slug,'beauty-hosted-20261021');mkdirSync(out,{recursive:true});
const report={base,baseline,scope:'Normal-login synthetic fixture, approved isolated beauty store only. No financial writes.',checks:[],pageErrors:[]};
const save=()=>writeFileSync(out+'/browser.json',JSON.stringify(report,null,2));
const pass=(step,data={})=>{report.checks.push({step,...data});save();console.log('PASS',step);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
let p;
try{
 const c=await browser.newContext({viewport:{width:1366,height:900}});
 await c.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base?r.continue({headers:{...r.request().headers(),'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}}):['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
 p=await c.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>report.pageErrors.push(e.message));
 await p.goto(base+'/hq/login?store='+cfg.slug,{waitUntil:'domcontentloaded',timeout:120000});await p.getByLabel('Email',{exact:true}).fill(cfg.email);await p.getByLabel('密碼',{exact:true}).fill(cfg.password);await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:120000});
 assert.equal(await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s.user?.storeId)),cfg.storeId);pass('approved-store-normal-login');
 await p.goto(base+'/s/'+cfg.slug+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表')+'&date=2026-10-30',{waitUntil:'load',timeout:120000});
 await p.getByLabel('課表日期',{exact:true}).fill('2026-10-27');await p.waitForURL(u=>u.searchParams.get('date')==='2026-10-27');
 await sleep(1500);
 
 // Day view shows the QA customer so no pre-existing appointment is opened.
 await p.getByRole('button',{name:'日表',exact:true}).click();
 const card=p.getByRole('button').filter({hasText:'QA1469 beauty'});await card.first().waitFor();await card.first().click();
 const roster=p.locator('section[aria-label="預約清單"]');await roster.getByRole('button',{name:'核對收款',exact:true}).waitFor();pass('changed-calendar-date-before-opening-qa-roster');
 const requests=[];p.on('request',r=>{if(r.method()==='POST')requests.push({path:new URL(r.url()).pathname,nextAction:!!r.headers()['next-action'],body:r.postData()});});
 let release;const gate=new Promise(r=>release=r);let held=0;
 if(!baseline)await p.route('**/api/beauty/collection-read',async route=>{const b=route.request().postDataJSON();if(b.operation==='quote'){held++;await gate;}await route.fallback();});
 const dialog=p.locator('[role="dialog"][aria-labelledby="beauty-collection-title"]');const started=Date.now();await roster.getByRole('button',{name:'核對收款',exact:true}).click();await dialog.waitFor({timeout:2000});const shellMs=Date.now()-started;
 if(baseline){await sleep(8000);report.dialogRemainedOpen=await dialog.isVisible();report.requests=requests;assert.equal(report.dialogRemainedOpen,false);pass('baseline-observation',{dialogRemainedOpen:report.dialogRemainedOpen,shellMs});}
 else{
  await dialog.evaluate(el=>el.dataset.qaRetained='yes');await sleep(5000);assert.ok(held>0);assert.ok(await dialog.isVisible());pass('shell-remains-visible-during-controlled-5s-quote-delay',{shellMs,held});release();
  const done=dialog.getByRole('button',{name:'完成',exact:true});await done.waitFor();await assert.doesNotReject(()=>done.waitFor({state:'visible'}));for(let i=0;i<100&&!await done.isEnabled();i++)await sleep(100);assert.ok(await done.isEnabled());await sleep(3000);assert.equal(await dialog.getAttribute('data-qa-retained'),'yes');assert.ok(await dialog.isVisible());pass('quote-and-status-arrival-retain-exact-dialog-node');
  assert.ok(requests.some(r=>r.path==='/api/beauty/collection-read'&&JSON.parse(r.body).operation==='quote'));assert.equal(requests.filter(r=>r.nextAction).length,0);pass('read-only-quote-and-recovery-do-not-trigger-server-action-or-rsc',{operations:requests.filter(r=>r.path==='/api/beauty/collection-read').map(r=>JSON.parse(r.body).operation)});
  for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const b=await dialog.boundingBox();assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1);await dialog.screenshot({path:out+'/collection-'+width+'.png'});pass('responsive-dialog',{width,height});}
  const url=p.url(),count=requests.length;await roster.evaluate(el=>el.dataset.qaRetained='yes');await done.click();await dialog.waitFor({state:'hidden'});await sleep(1000);assert.equal(p.url(),url);assert.equal(await roster.getAttribute('data-qa-retained'),'yes');assert.equal(requests.length,count);pass('close-preserves-roster-without-write-or-navigation');
  await roster.getByRole('button',{name:'核對收款',exact:true}).click();await dialog.waitFor();await done.waitFor();for(let i=0;i<100&&!await done.isEnabled();i++)await sleep(100);assert.ok(await done.isEnabled());await sleep(2000);assert.ok(await dialog.isVisible());pass('reopen-reads-current-quote-without-autoclose');
  await done.click();await dialog.waitFor({state:'hidden'});
  let failOnce=true;await p.route('**/api/beauty/collection-read',async route=>{if(route.request().postDataJSON().operation==='quote'&&failOnce){failOnce=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'QA1469 controlled quote read failure'})});}else await route.fallback();});
  await roster.getByRole('button',{name:'核對收款',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'QA1469 controlled'}).waitFor();assert.ok(await dialog.isVisible());await dialog.getByRole('button',{name:'重新讀取',exact:true}).click();await done.waitFor();for(let i=0;i<100&&!await done.isEnabled();i++)await sleep(100);assert.ok(await done.isEnabled());pass('read-failure-stays-in-dialog-and-retry-recovers');
  await done.click();await dialog.waitFor({state:'hidden'});
  const denied=await p.evaluate(async store=>(await fetch('/api/beauty/collection-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store,operation:'quote',ids:['qa1469-collection-shell-booking']})})).json(),'other-store');assert.equal(denied.success,false);pass('wrong-store-read-denied');
  assert.deepEqual(report.pageErrors,[]);
 }
 report.success=true;
}catch(e){report.success=false;report.error=e.message;console.error(e.message);if(p){report.alerts=await p.locator('[role=alert]').allTextContents().catch(()=>[]);await p.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{await browser.close();save();}
