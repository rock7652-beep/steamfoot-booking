import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.env.SPORTS_PERF_ENV_DIR??process.cwd());
const {chromium}=require('playwright');
const variant=process.env.SPORTS_PERF_VARIANT;
if(!['baseline','optimized'].includes(variant))throw Error('Select baseline or optimized');
const origin=new URL(process.env.SPORTS_PERF_URL).origin;
if(!origin.endsWith('.vercel.app'))throw Error('Exact protected Preview URL required');
const cfg=JSON.parse(readFileSync(process.env.SPORTS_PERF_LOGIN_FILE,'utf8'));
const out=process.env.SPORTS_PERF_REPORT_DIR??'/workspace/reports/sports-course-loading-20261030';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const report={variant,origin,fixtureStore:'sports-live-flow-store',data:'isolated synthetic fixtures',measurements:[],checks:[],pageErrors:[]};
try{
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue({headers:{...r.request().headers(),'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}}):r.abort());
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(origin+'/hq/login',{waitUntil:'load'});await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(cfg.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});report.checks.push({step:'normal-isolated-owner-login',pass:true});
 const base=origin+'/s/sports-live-flow/admin/dashboard/courses';
 const options=[];page.on('response',async r=>{if(new URL(r.url()).pathname.endsWith('/schedule-options'))options.push({status:r.status(),serverTiming:r.headers()['server-timing']});});
 for(const view of (process.env.SPORTS_PERF_UI_ONLY?[]:['catalog','schedule']))for(let sample=0;sample<4;sample++){
  const before=options.length,start=performance.now();const response=await page.goto(base+'?view='+view+'&date=2026-11-27',{waitUntil:'load'});
  if(view==='schedule')await page.getByRole('button',{name:'＋ 排課',exact:true}).waitFor();else await page.getByRole('heading',{name:'教學項目',exact:true}).waitFor();
  const nav=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {ttfbMs:Math.round(n.responseStart-n.requestStart),transferBytes:n.encodedBodySize};});
  report.measurements.push({view,sample,warmup:sample===0,elapsedMs:Math.round(performance.now()-start),...nav,documentBytes:(await response.body()).length});
  if(options.length!==before)throw Error('Schedule metadata requested on initial page');
  console.log(JSON.stringify({variant,...report.measurements.at(-1)}));
 }
 report.checks.push({step:'no-eager-schedule-options-request',pass:true});
 if(variant==='optimized'){
  if(process.env.SPORTS_PERF_UI_ONLY)await page.goto(base+'?view=schedule&date=2026-11-27',{waitUntil:'load'});
  const button=page.getByRole('button',{name:'＋ 排課',exact:true});
  let release;const gate=new Promise(r=>release=r);let startedOptions=0;
  await page.route('**/schedule-options',async route=>{startedOptions++;console.log(JSON.stringify({event:'options-request',url:route.request().url(),method:route.request().method(),count:startedOptions,time:performance.now(),active:await page.evaluate(()=>document.activeElement?.textContent)}));await gate;await route.fallback();});
  const start=performance.now();await button.click();await page.getByRole('heading',{name:'新增排課',exact:false}).waitFor();await page.getByText('正在讀取排課資料…',{exact:true}).waitFor();
  report.checks.push({step:'dialog-visible-before-response',pass:true,ms:Math.round(performance.now()-start)});console.log(JSON.stringify({event:'release',count:startedOptions,time:performance.now()}));release();await page.getByLabel('排課時間',{exact:true}).waitFor();
  report.checks.push({step:'single-intent-and-open-request',pass:startedOptions===1,count:startedOptions});if(startedOptions!==1)throw Error('Duplicate intent/open request');
  await page.unroute('**/schedule-options');
  await page.getByLabel('排課時間',{exact:true}).fill('10:30');
  for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024]]){
   await page.setViewportSize({width,height});if(await page.getByLabel('排課時間',{exact:true}).inputValue()!=='10:30')throw Error('Draft lost on resize');
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1}));if(geometry.overflow)throw Error('Document overflow');
   const dialog=page.getByRole('dialog').last();const close=dialog.getByRole('button',{name:'關閉',exact:true});await close.scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(out,`${variant}-schedule-${width}.png`),fullPage:true});report.checks.push({step:'responsive-draft-preserved',width,height,...geometry});
  }
  // Install before closing so a focus restoration cannot escape the failure test.
  let failureRequests=0;await page.route('**/schedule-options',route=>{failureRequests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:false,error:'QA：暫時無法讀取'})});});
  await page.getByRole('dialog').last().getByRole('button',{name:'關閉',exact:true}).click();await page.getByLabel('排課時間',{exact:true}).waitFor({state:'hidden'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));if(failureRequests!==0)throw Error('Closing dialog triggered metadata read');report.checks.push({step:'closing-focus-does-not-preload',pass:true});
  // Reopen always authoritatively reads; a failed read is retryable inside the same dialog.
  await button.click();await page.getByRole('alert').filter({hasText:'QA：暫時無法讀取'}).waitFor();await page.unroute('**/schedule-options');await page.getByRole('button',{name:'重新讀取',exact:true}).click();await page.getByLabel('排課時間',{exact:true}).waitFor();report.checks.push({step:'in-dialog-read-failure-retry',pass:true});
  await page.getByRole('dialog').last().getByRole('button',{name:'關閉',exact:true}).click();
  await page.goto(base+'?view=catalog',{waitUntil:'load'});await page.getByRole('heading',{name:'教學項目',exact:true}).waitFor();for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024]]){await page.setViewportSize({width,height});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Catalog document overflow');await page.screenshot({path:path.join(out,`${variant}-catalog-${width}.png`),fullPage:true});report.checks.push({step:'responsive-teaching-catalog',width,height,overflow});}
  const denied=await context.request.get(base.replace('/s/sports-live-flow/','/s/lubymusic/')+'/schedule-options',{headers:{'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN},maxRedirects:0});if(denied.headers()['content-type']?.includes('application/json')){const denial=await denied.json();if(denial.success!==false||denial.data)throw Error('Foreign store metadata leak');}else if(![301,302,303,307,308,401,403,404].includes(denied.status()))throw Error('Unexpected foreign-store response');report.checks.push({step:'foreign-store-read-denied',pass:true,status:denied.status()});
 }
 report.optionsRequests=options;report.success=report.checks.every(x=>x.pass!==false)&&report.pageErrors.length===0;
 await context.close();
}catch(e){report.success=false;report.failure=String(e);}finally{writeFileSync(path.join(out,variant+'.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({variant,success:report.success,failure:report.failure}));if(!report.success)process.exitCode=1;
