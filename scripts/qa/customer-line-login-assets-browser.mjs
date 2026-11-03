// Read-only, authenticated Preview asset/RWD acceptance. Never submits login or recovery.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.QA_PREVIEW_BASE||'https://steamfoot-booking-23x39k0fx-rock7652-2111s-projects.vercel.app';
assert.match(base,/^https:\/\/steamfoot-booking-[a-z0-9]+-rock7652-2111s-projects\.vercel\.app$/);
assert.ok(process.env.VERCEL_OIDC_TOKEN,'Use normal same-project development OIDC');
const out=process.env.QA_OUTPUT||'/tmp/pr1465-login-assets-rwd';mkdirSync(out,{recursive:true});
const results={scope:'read-only hosted Preview; Chromium viewport simulation; no login submission',base,sizes:[],pageErrors:[],failures:[]};
const persist=()=>writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(proxy?{proxy:{server:proxy}}:{})});
try{
 for(const [width,height]of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844],[360,800]]){
  const context=await browser.newContext({viewport:{width,height}});
  await context.route('**/*',route=>{const r=route.request();return route.continue(new URL(r.url()).origin===base?{headers:{...r.headers(),'x-vercel-trusted-oidc-idp-token':process.env.VERCEL_OIDC_TOKEN}}:{});});
  const page=await context.newPage();page.setDefaultTimeout(30000);const assets=new Map();const failures=[];
  page.on('pageerror',e=>results.pageErrors.push({width,height,message:e.message}));
  page.on('response',r=>{const u=new URL(r.url());if(u.origin!==base)return;if(r.status()>=400){const failure={width,height,path:u.pathname,status:r.status()};failures.push(failure);results.failures.push(failure);}if(u.pathname.startsWith('/_next/static/'))assets.set(u.pathname,r.status());});
  const response=await page.goto(base+'/hq/login?store=staging',{waitUntil:'domcontentloaded',timeout:90000});assert.equal(response.status(),200);await page.getByLabel('Email',{exact:true}).waitFor();await page.waitForTimeout(5000);
  await page.getByLabel('Email',{exact:true}).fill('qa1465-rwd@example.invalid');
  await page.setViewportSize({width:width===360?390:360,height});assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),'qa1465-rwd@example.invalid');await page.setViewportSize({width,height});
  const measure=async()=>page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}));
  const login=await measure();assert.equal(login.overflow,false);const submit=page.getByRole('button',{name:'登入',exact:true});await submit.scrollIntoViewIfNeeded();let rect=await submit.boundingBox();assert.ok(rect&&rect.width>=44&&rect.height>=44&&rect.y>=0&&rect.y+rect.height<=height);await page.screenshot({path:out+`/${width}x${height}-login.png`,fullPage:false});
  await page.getByRole('link',{name:'忘記密碼？',exact:true}).click();await page.getByRole('heading',{name:'重設後台密碼',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/hq/forgot-password');assert.equal(new URL(page.url()).searchParams.get('store'),'staging');const recovery=await measure();assert.equal(recovery.overflow,false);const recoverySubmit=page.getByRole('button',{name:'寄送重設連結',exact:true});await recoverySubmit.scrollIntoViewIfNeeded();rect=await recoverySubmit.boundingBox();assert.ok(rect&&rect.width>=44&&rect.height>=44);await page.screenshot({path:out+`/${width}x${height}-recovery.png`,fullPage:false});
  await page.getByRole('link',{name:'返回後台登入',exact:true}).click();await page.getByLabel('Email',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/hq/login');await page.waitForTimeout(2000);assert.deepEqual(failures,[]);assert.ok(assets.size>0);assert.ok([...assets.values()].every(s=>s===200));results.sizes.push({width,height,login,recovery,emailDraftRetainedOnResize:true,loginAndRecoveryControlsReachable:true,loginRecoveryRoundTrip:true,staticAssets:[...assets].map(([path,status])=>({path,status}))});persist();await context.close();console.log(`${width}x${height} passed; ${assets.size} static assets OK`);
 }
 assert.deepEqual(results.pageErrors,[]);assert.deepEqual(results.failures,[]);results.passed=true;persist();console.log(JSON.stringify({passed:true,sizes:results.sizes.length,output:out}));
}catch(error){results.failure=error.message.replace(/https?:\/\/\S+/g,'[URL]');persist();throw error;}finally{await browser.close();}
