import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.env.SPORTS_PERF_ENV_DIR??process.cwd());
const {chromium}=require('playwright'),cfg=JSON.parse(readFileSync(process.env.SPORTS_PERF_LOGIN_FILE,'utf8'));
const origin=new URL(process.env.SPORTS_PERF_URL).origin,out=process.env.SPORTS_PERF_REPORT_DIR,variant=process.env.SPORTS_PERF_VARIANT;
if(!origin.endsWith('.vercel.app')||!out||!['baseline','optimized'].includes(variant))throw Error('Exact Preview and report variant required');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const report={origin,variant,data:'isolated sports QA fixtures',measurements:[],errors:[]};
try{
 const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue({headers:{...r.request().headers(),'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}}):r.abort());
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/hq/login',{waitUntil:'load'});await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(cfg.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
 const samples=Number(process.env.SPORTS_STAGE_SAMPLES??5);if(!Number.isInteger(samples)||samples<1||samples>10)throw Error("Invalid sample count");
 for(let sample=0;sample<samples;sample++){
  const start=performance.now();await page.goto(origin+'/s/sports-live-flow/admin/dashboard/courses?view=schedule&date=2026-11-27&perf=1',{waitUntil:'load'});await page.getByRole('button',{name:'＋ 排課',exact:true}).waitFor();await page.locator('#course-read-timing').waitFor({state:'attached'});
  const browserTiming=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {requestToFirstByteMs:Math.round(n.responseStart-n.requestStart),responseTransferWindowMs:Math.round(n.responseEnd-n.responseStart),navigationToResponseEndMs:Math.round(n.responseEnd-n.startTime),navigationToDomContentLoadedMs:Math.round(n.domContentLoadedEventEnd-n.startTime),navigationToLoadMs:Math.round(n.loadEventEnd-n.startTime),transferBytes:n.encodedBodySize,resourceCount:performance.getEntriesByType('resource').length};});
  const server=JSON.parse(await page.locator('#course-read-timing').textContent());const row={sample,warmup:sample===0,elapsedMs:Math.round(performance.now()-start),browserTiming,server};report.measurements.push(row);writeFileSync(out+'/'+variant+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(row));
 }
 const cards=(await page.locator('[data-sports-schedule-kind]').allTextContents()).map(s=>s.trim()).sort();report.calendar={visibleCardCount:cards.length,digest:createHash('sha256').update(JSON.stringify(cards)).digest('hex')};
 // Diagnostics never appear without the explicit opt-in, even for the QA owner.
 await page.goto(origin+'/s/sports-live-flow/admin/dashboard/courses?view=schedule&date=2026-11-27',{waitUntil:'load'});if(await page.locator('#course-read-timing').count())throw Error('Timing leaked without opt-in');
 report.success=report.errors.length===0;await context.close();
}catch(e){report.success=false;report.failure=String(e);}finally{writeFileSync(out+'/'+variant+'.json',JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify({variant,success:report.success,failure:report.failure}));if(!report.success)process.exitCode=1;
