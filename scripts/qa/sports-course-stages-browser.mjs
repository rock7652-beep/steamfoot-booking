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
 const context=await browser.newContext({viewport:{width:1366,height:900}});if(process.env.SPORTS_PERF_HTTP_CACHE!=='1')await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue({headers:{...r.request().headers(),'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}}):r.abort());
 const page=await context.newPage();const cacheProof={served:0,disk:0};const cdp=process.env.SPORTS_PERF_HTTP_CACHE==='1'?await context.newCDPSession(page):null;if(cdp){
 await cdp.send('Network.enable');const paths=new Map();cacheProof.paths=[];
 cdp.on('Network.requestWillBeSent',e=>paths.set(e.requestId,new URL(e.request.url).pathname));
 cdp.on('Network.requestServedFromCache',e=>{cacheProof.served++;cacheProof.paths.push(paths.get(e.requestId)??'unknown');});
 cdp.on('Network.responseReceived',e=>{if(e.response.fromDiskCache)cacheProof.disk++;});
 // Native Fetch interception adds only the origin-scoped auth header. Unlike
 // Playwright routing it never sets Network.setCacheDisabled(true).
 cdp.on('Fetch.requestPaused',async e=>{try{const u=new URL(e.request.url);if(u.origin===origin)await cdp.send('Fetch.continueRequest',{requestId:e.requestId,headers:Object.entries({...e.request.headers,'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}).map(([name,value])=>({name,value:String(value)}))});else if(['data:','blob:'].includes(u.protocol))await cdp.send('Fetch.continueRequest',{requestId:e.requestId});else await cdp.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'Aborted'});}catch{if(!page.isClosed())report.errors.push('Scoped request continuation failed');}});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 }report.httpCacheMode=!!cdp;page.setDefaultTimeout(60000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(origin+'/hq/login',{waitUntil:'load'});await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(cfg.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
 const samples=Number(process.env.SPORTS_STAGE_SAMPLES??5);if(!Number.isInteger(samples)||samples<1||samples>10)throw Error("Invalid sample count");
 for(let sample=0;sample<samples;sample++){
  if(cdp)await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});const beforeCache={served:cacheProof.served,disk:cacheProof.disk,pathCount:cacheProof.paths?.length??0};const start=performance.now();await page.goto(origin+'/s/sports-live-flow/admin/dashboard/courses?view=schedule&date=2026-11-27&perf=1',{waitUntil:'load'});await page.getByRole('button',{name:'＋ 排課',exact:true}).waitFor();await page.locator('#course-read-timing').waitFor({state:'attached'});
  const browserTiming=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {requestToFirstByteMs:Math.round(n.responseStart-n.requestStart),responseTransferWindowMs:Math.round(n.responseEnd-n.responseStart),navigationToResponseEndMs:Math.round(n.responseEnd-n.startTime),navigationToDomContentLoadedMs:Math.round(n.domContentLoadedEventEnd-n.startTime),navigationToLoadMs:Math.round(n.loadEventEnd-n.startTime),transferBytes:n.encodedBodySize,resourceCount:performance.getEntriesByType('resource').length};});
  const server=JSON.parse(await page.locator('#course-read-timing').textContent());const row={sample,warmup:sample===0,cache:{served:cacheProof.served-beforeCache.served,disk:cacheProof.disk-beforeCache.disk,paths:cacheProof.paths?.slice(beforeCache.pathCount)},elapsedMs:Math.round(performance.now()-start),browserTiming,server};report.measurements.push(row);writeFileSync(out+'/'+variant+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(row));
 }
 const cards=(await page.locator('[data-sports-schedule-kind]').allTextContents()).map(s=>s.trim()).sort();report.calendar={visibleCardCount:cards.length,digest:createHash('sha256').update(JSON.stringify(cards)).digest('hex')};
 // Diagnostics never appear without the explicit opt-in, even for the QA owner.
 await page.goto(origin+'/s/sports-live-flow/admin/dashboard/courses?view=schedule&date=2026-11-27',{waitUntil:'load'});if(await page.locator('#course-read-timing').count())throw Error('Timing leaked without opt-in');
 report.success=report.errors.length===0;await context.close();
}catch(e){report.success=false;report.failure=String(e);}finally{writeFileSync(out+'/'+variant+'.json',JSON.stringify(report,null,2));await browser.close();}console.log(JSON.stringify({variant,success:report.success,failure:report.failure}));if(!report.success)process.exitCode=1;
