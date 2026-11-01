import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const accounts=JSON.parse(readFileSync('/tmp/calendar-instant-accounts.json')),credentials=JSON.parse(readFileSync('/tmp/calendar-instant-credentials.json')),access=JSON.parse(readFileSync('/tmp/calendar-instant-share.json'));
const origin=new URL(access.url).origin;
assert.ok(new URL(origin).hostname.endsWith('.vercel.app'),'isolated Preview hostname required');
assert.equal(accounts.length,3);
assert.ok(accounts.every(a=>a.email.endsWith('@example.invalid')&&['sports-live-flow-store','store-lubymusic','beauty-hosted-20261021'].includes(a.storeId)),'synthetic test stores and accounts only');
const out=process.env.CALENDAR_QA_OUTPUT||'/workspace/reports/roster-immediate-layout-20261101';mkdirSync(out,{recursive:true});
const report={commit:process.env.CALENDAR_QA_COMMIT,scope:'normal owner login; isolated sports/music/beauty fixtures; no submitted mutation; controlled-delay checks separated from natural timings',samples:[],checks:[],errors:[],complete:false};const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const hashes={sports:'c5e163049c8c9ca1a53d458b0caa96cdd7cdf6ea21963b127d6bd69905259fed',music:'f463c992613603cb6af036e915e5890f0917710f5d4f6e9c5d0b9b5f3f28e82c',beauty:'4a0c2c5e8d1f42aad1dde3c8ea5ee90453127907c20b78dd02f6781083458f7c'};
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});let page;
const isDetail=r=>r.url().includes('/session-detail')||r.url().includes('/api/beauty/roster');
try{
 for(const cfg of accounts.filter(a=>!process.env.CALENDAR_QA_MODULES||process.env.CALENDAR_QA_MODULES.split(',').includes(a.module))){
  const mod=cfg.module,slug=mod==='sports'?'sports-live-flow':mod==='music'?'lubymusic':'beauty-hosted-20261021',path=mod==='beauty'?'beauty':'courses',fixture='qa1469-20261030-'+(mod==='beauty'?'beauty-booking':mod+'-session');
  const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(45000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:mod,message:e.message}));let documents=0;page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
  await page.goto(access.url);await page.goto(origin+`/s/${slug}/admin/dashboard/${path}`);await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));report.checks.push({module:mod,check:'normal-owner-login',pass:true});save();console.log(mod,'login passed');
  const openCalendar=async()=>{await page.goto(origin+`/s/${slug}/admin/dashboard/${path}?date=2026-11-27&scheduleView=day`+(mod==='beauty'?'&tab='+encodeURIComponent('班表'):''),{waitUntil:'load'});const htmlDeploymentId=await page.locator('html').getAttribute('data-dpl-id');if(htmlDeploymentId)assert.equal(htmlDeploymentId,process.env.CALENDAR_QA_DEPLOYMENT);report.previewVersionVerification={host:origin,expectedDeploymentId:process.env.CALENDAR_QA_DEPLOYMENT,expectedSourceCommit:process.env.CALENDAR_QA_COMMIT,htmlDeploymentId,method:'immutable deployment hostname checked against Vercel deployment metadata; assert HTML data-dpl-id when provided; actual new preview/readiness UI selectors required'};await page.getByRole('button',{name:'日表',exact:true}).click();const card=page.locator(`[data-calendar-session="${fixture}"]`).first();await card.waitFor();return card;};
  for(let sample=0;sample<Number(process.env.CALENDAR_QA_SAMPLES||4);sample++){
   const card=await openCalendar();const response=page.waitForResponse(isDetail);await card.evaluate(node=>node.addEventListener('click',()=>{window.instantClickedAt=performance.now();},{once:true,capture:true}));await card.click();await page.waitForFunction(()=>document.querySelector('[role="dialog"] [data-roster-preview] input'),{},{polling:'raf'});const previewMs=Math.round(await page.evaluate(()=>performance.now()-window.instantClickedAt));
   await page.waitForFunction(()=>document.querySelector('[role="dialog"] [data-roster-ready="true"] input'),{},{polling:'raf'});const completeMs=Math.round(await page.evaluate(()=>performance.now()-window.instantClickedAt));const res=await response;assert.equal(res.status(),200);const body=await res.json();assert.equal(body.success,true);const hash=createHash('sha256').update(JSON.stringify(body.data)).digest('hex');assert.equal(hash,hashes[mod],'full data differs from previously verified payload');
   const row={module:mod,sample,warmup:sample===0,previewMs,completeMs,payloadHash:hash};report.samples.push(row);save();console.log(JSON.stringify(row));await page.locator('[role="dialog"]').getByRole('button',{name:'關閉',exact:true}).click();
  }
  for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});const card=await openCalendar();let intercepted=false;
   await page.route('**/*',async route=>{if(!intercepted&&isDetail(route.request())){intercepted=true;const res=await route.fetch();await new Promise(resolve=>setTimeout(resolve,2000));await route.fulfill({response:res});}else await route.continue();});
   const before=documents;await card.click();const preview=page.locator('[role="dialog"] [data-roster-preview]');await preview.waitFor();
   const input=preview.getByPlaceholder('搜尋姓名或手機');assert.ok(await input.isEnabled());assert.equal(await preview.locator('button:not([disabled])').count(),0);
   const name=mod==='music'?await preview.locator('li>span.font-medium').first().innerText():await preview.locator('[data-sports-roster-name]>span').first().innerText();const query=name.slice(0,1);await input.fill(query);await input.evaluate(node=>node.setSelectionRange(1,1));await input.press('ArrowLeft');
   await page.screenshot({path:out+`/${mod}-preview-${width}.png`,fullPage:true});const dialog=page.locator('[role="dialog"]').first(),box=await dialog.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,JSON.stringify({width,height,box}));
   const live=page.locator('[role="dialog"] [data-roster-ready="true"]');await live.waitFor();assert.equal(await live.getByPlaceholder('搜尋姓名或手機').inputValue(),query);assert.equal(await live.getByPlaceholder('搜尋姓名或手機').evaluate(node=>node===document.activeElement),true);assert.equal(await live.getByPlaceholder('搜尋姓名或手機').evaluate(node=>node.selectionStart),0);assert.equal(documents,before);assert.ok(intercepted);
   report.checks.push({module:mod,check:'controlled-2000ms-response-delivery-delay-layout-search-focus-and-no-document-navigation',width,height,box,pass:true});save();await page.unroute('**/*');await dialog.getByRole('button',{name:'關閉',exact:true}).click();
  }
  await context.close();
 }
 assert.equal(report.errors.length,0);report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
