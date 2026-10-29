// Isolated real roster checkout, followed by optional attendance/restore and cleanup. No automatic retries.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const [module,phase]=process.argv.slice(2);
assert.ok(['sports','music'].includes(module));
assert.ok(['buy','cleanup','smoke','options','concurrency','timing'].includes(phase));
const config=JSON.parse(readFileSync('/tmp/checkout-phase2-course-access.json','utf8'));
const account=JSON.parse(readFileSync('/tmp/checkout-phase2-credentials.json','utf8')).accounts.find(x=>x.module===module);
const base='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';
assert.equal(config.base,base);assert.equal(config.source,'d3a4f64a90f0312dc160d2423d90bc29969a5787');
const root='/tmp/checkout-phase2',out='/tmp/checkout-phase2-final/'+module;mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/'+module+'-owner-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
const page=await context.newPage();for(const old of context.pages())if(old!==page)await old.close();page.setDefaultTimeout(90000);
const report={module,phase,deployment:config.deployment,started:new Date().toISOString(),complete:false,samples:[],requests:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message.replace(/(?:_vercel_share|x-vercel-protection-bypass)=[^&\s]+/g,'access=[redacted]')));
page.on('requestfinished',request=>{if(!/purchase-options|session-detail|card-read|music-read|calendar-read/.test(new URL(request.url()).pathname)&&request.method()!=='POST')return;const t=request.timing();report.requests.push({path:new URL(request.url()).pathname,startedAtEpochMs:request.timing().startTime,durationMs:Math.round(t.responseEnd),action:request.headers()['next-action']??null});});
let captured;
page.on('request',request=>{const body=request.postData();if(request.method()==='POST'&&request.headers()['next-action']&&body?.includes(account.bookingId))captured={url:request.url(),body,headers:Object.fromEntries(Object.entries(request.headers()).filter(([k])=>['content-type','next-action','next-router-state-tree','origin','referer'].includes(k)))};});
async function replayTwice(label){assert.ok(captured,'Missing exact owned mutation');const request=captured;const replies=await Promise.all([1,2].map(async()=>{const r=await context.request.post(request.url,{headers:request.headers,data:request.body,timeout:90000});const text=await r.text();return {status:r.status(),confirmed:/"success":true/.test(text),conflict:/"success":false/.test(text)};}));assert.ok(replies.every(r=>r.status===200&&(r.confirmed||r.conflict)));report.samples.push({step:label,replies});}
report.responses=[];page.on('response',r=>{const path=new URL(r.url()).pathname;if(r.request().method()==='POST'||/purchase-options|music-read|roster|customer-read/.test(path))report.responses.push({path,method:r.request().method(),status:r.status(),requestId:r.headers()['x-vercel-id']??null,serverTiming:r.headers()['server-timing']??null});});
const courses=base+'/s/'+account.slug+'/admin/dashboard/courses';
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded'});
 await page.goto(base+'/api/auth/session',{waitUntil:'domcontentloaded'});
 let user=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(x=>x?.user));
 if(!user){await page.goto(base+'/hq/login?store='+account.storeId,{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(account.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));}
 user=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(x=>x?.user));assert.equal(user?.storeId,account.storeId);assert.equal(user?.role,'OWNER');
 await page.goto(courses+'?view=schedule&date=2026-11-03&session='+account.sessionId,{waitUntil:'domcontentloaded'});
 const pending=page.getByRole('button',{name:account.name+(module==='sports'?'：待點名':'：點名'),exact:true});await pending.waitFor();
 if(phase==='timing'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');const total=Number(process.env.QA_EXPECT_BALANCE??10);
  for(let sample=1;sample<=3;sample++){
   await page.getByText(new RegExp(total+' 堂')).first().waitFor();const start=performance.now();await pending.click();const attended=page.getByRole('button',{name:account.name+'：已出席',exact:true});await attended.waitFor();const statusMs=Math.round(performance.now()-start);await page.getByText(new RegExp((total-1)+' 堂')).first().waitFor();const debitMs=Math.round(performance.now()-start);
   await attended.click();const restore=page.getByRole('menuitem',{name:/^恢復/});await restore.waitFor();const restoreAt=performance.now();await restore.click();await pending.waitFor();await page.getByText(new RegExp(total+' 堂')).first().waitFor();report.samples.push({sample,statusMs,debitMs,restoreMs:Math.round(performance.now()-restoreAt)});
  }
 }else if(phase==='options'){
  for(let sample=1;sample<=3;sample++){
   const startedAtEpochMs=Date.now(),start=performance.now();await page.getByRole('button',{name:account.name+' 更多操作',exact:true}).click();const menuMs=Math.round(performance.now()-start);
   await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();const clickMs=Math.round(performance.now()-start);
   const dialog=page.getByRole('dialog',{name:'學員繳費 · '+account.name,exact:true});await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();
   report.samples.push({sample,startedAtEpochMs,menuMs,clickMs,optionsVisibleMs:Math.round(performance.now()-start)});await dialog.getByRole('button',{name:'關閉',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
 }else if(phase==='buy'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  const url=page.url();
  for(let sample=1;sample<=1;sample++){
   const started=performance.now();
   await page.getByRole('button',{name:account.name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'學員繳費 · '+account.name,exact:true});
   await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();
   const optionsMs=Math.round(performance.now()-started);
   await dialog.locator('#course-roster-purchase-form select').first().selectOption(account.planId);
   if(module==='sports')await dialog.getByLabel('所屬店長',{exact:true}).selectOption(account.id+'-staff');
   await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');
   const confirm=performance.now(),clickAtEpochMs=Date.now();await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).click();
   await dialog.waitFor({state:'hidden'});const checkoutMs=Math.round(performance.now()-confirm);
   const balance=Number(process.env.QA_EXPECT_BALANCE??20);
   const result={sample,optionsMs,checkoutMs,balance,clickAtEpochMs,visibleBalanceMs:null};report.samples.push(result);
   writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
   await page.getByText(new RegExp(balance+' 堂')).first().waitFor();await pending.waitFor();
   result.visibleBalanceMs=Math.round(performance.now()-confirm);
   await page.waitForLoadState('networkidle');
   assert.equal(page.url(),url);assert.equal(await page.getByRole('button',{name:account.name+'：已出席',exact:true}).count(),0);
   result.backgroundNetworkIdleMs=Math.round(performance.now()-confirm);
   writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
  }
 }else if(phase==='smoke'||phase==='concurrency'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  const total=Number(process.env.QA_EXPECT_BALANCE??20);await page.getByText(new RegExp(total+" 堂")).first().waitFor();await pending.click();const attended=page.getByRole('button',{name:account.name+'：已出席',exact:true});await attended.waitFor();await page.getByText(new RegExp((Number(process.env.QA_EXPECT_BALANCE??20)-1)+" 堂")).first().waitFor();if(phase==='concurrency')await replayTwice('concurrent-identical-attendance-replay');await attended.click();await page.getByRole('menuitem',{name:/^恢復/}).click();await pending.waitFor();await page.getByText(new RegExp(Number(process.env.QA_EXPECT_BALANCE??20)+" 堂")).first().waitFor();if(phase==='concurrency'){await replayTwice('concurrent-identical-restore-replay');await page.reload({waitUntil:'domcontentloaded'});await pending.waitFor();await page.getByText(new RegExp(total+' 堂')).first().waitFor();}report.samples.push({step:'FIFO attend/restore',balance:total});
 }else{
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  const foreign=JSON.parse(readFileSync('/tmp/checkout-phase2-credentials.json','utf8')).accounts.find(x=>x.module!==module&&x.module!=='beauty');
  const denied=await page.evaluate(async({courses,customerId})=>{const r=await fetch(courses+'/card-read?args='+encodeURIComponent(JSON.stringify({customerId})));const body=await r.json();return {status:r.status,success:body.success,hasRows:Array.isArray(body.rows)&&body.rows.length>0};},{courses,customerId:foreign.customerId});
  assert.equal(denied.success,false);assert.equal(denied.hasRows,false);report.samples.push({step:'valid-other-store-learner-denied',...denied});
  for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.getByText(new RegExp(Number(process.env.QA_EXPECT_BALANCE??20)+" 堂")).first().waitFor();await page.screenshot({path:out+'/roster-'+width+'.png',fullPage:true});report.samples.push({step:'roster-responsive',width,height});}await page.setViewportSize({width:1366,height:900});
  if(module==='sports'){await page.getByRole('button',{name:'取消課程',exact:true}).click();await page.getByRole('dialog',{name:'取消課程',exact:true}).getByRole('button',{name:'確認取消',exact:true}).click();}
  else{await page.getByRole('button',{name:'課程更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'取消本堂',exact:true}).click();await page.getByRole('button',{name:'確認取消本堂課',exact:true}).click();}
  await pending.waitFor({state:'hidden'});report.samples.push({step:'normal cancellation'});
 }
 report.complete=true;await page.screenshot({path:out+'/roster-'+phase+'.png',fullPage:true});
}catch(error){report.failure=String(error);await page.screenshot({path:out+'/roster-'+phase+'-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await context.close();}
