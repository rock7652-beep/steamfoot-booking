// Isolated native UI checkout. Never retries a purchase after an uncertain result.
import {createRequire} from 'node:module';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const [module,phase='inspect']=process.argv.slice(2);assert.ok(['sports','music'].includes(module));assert.ok(['inspect','buy'].includes(phase));
const config=JSON.parse(readFileSync('/tmp/checkout-resume-course-access.json'));const a=JSON.parse(readFileSync('/tmp/checkout-resume-profile-credentials.json')).accounts.find(a=>a.module===module);
const base='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';assert.equal(config.base,base);assert.equal(config.source,'460f0a3730dd160ae2c829f0076f7781348875ec');
const root='/tmp/checkout-resume',out='/tmp/checkout-resume-final/'+module;mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/'+module+'-owner-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});const p=await context.newPage();for(const old of context.pages())if(old!==p)await old.close();p.setDefaultTimeout(90000);
const report={module,phase,deployment:config.deployment,complete:false,checks:[],requests:[]};
p.on('requestfinished',r=>{if(r.method()==='POST'||/card-read|music-period-read|music-read/.test(new URL(r.url()).pathname))report.requests.push({path:new URL(r.url()).pathname,startedAtEpochMs:r.timing().startTime,durationMs:Math.round(r.timing().responseEnd),action:r.headers()['next-action']??null});});
async function select(label,id,text){const control=p.getByRole('combobox',{name:label,exact:true});await control.waitFor();if(await control.evaluate(e=>e.tagName)==='SELECT'){const values=await control.locator('option').evaluateAll(rows=>rows.map(r=>({value:r.value,text:r.textContent})));if(values.some(x=>x.value===id))await control.selectOption(id);else{const found=values.find(x=>x.text.includes(text));assert.ok(found,'Missing '+label);await control.selectOption(found.value);}}else{await control.fill(text);await p.getByRole('option').filter({hasText:text}).first().click();}}
try{
 await p.goto(config.accessUrl,{waitUntil:'domcontentloaded'});await p.goto(base+'/api/auth/session',{waitUntil:'domcontentloaded'});
 let user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(!user){await p.goto(base+'/hq/login?store='+a.storeId,{waitUntil:'domcontentloaded'});await p.getByLabel('Email',{exact:true}).fill(a.email);await p.getByLabel('密碼',{exact:true}).fill(a.password);await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>u.pathname.includes('/dashboard'));}
 user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));assert.equal(user?.storeId,a.storeId);assert.equal(user?.role,'OWNER');
 const courses=base+'/s/'+a.slug+'/admin/dashboard/courses';
 await p.goto(courses+'?view=customers&action=assign&search='+encodeURIComponent(a.name)+'&customerId='+encodeURIComponent(a.customerId),{waitUntil:'domcontentloaded'});
 await p.locator('#course-member-form').waitFor();await p.waitForLoadState('networkidle');
 if(module==='music')await select('教學項目','music-demo-guitar-group450','吉他團體班');
 await select(module==='music'?'收費方式':'方案',a.planId,a.planName);
 if(module==='sports'&&await p.getByRole('combobox',{name:'所屬店長',exact:true}).count())await select('所屬店長',a.id+'-staff',a.name+'店長');
 const form=p.locator('#course-member-form');await form.locator('select[name="paymentMethod"]').selectOption('CARD');
 if(module==='music'){const received=form.locator('input[name="musicReceived"]');if(await received.count())await received.fill('1000');}
 const submit=p.locator('button[type="submit"][form="course-member-form"]');await submit.waitFor();await p.waitForFunction(()=>{const b=document.querySelector('button[type="submit"][form="course-member-form"]');return b&&!b.disabled;});
 assert.equal(await form.locator('input[name="customerId"]').inputValue(),a.customerId);assert.equal(await form.locator('input[name="expectedListPrice"]').inputValue(),'1000');
 report.checks.push({step:'actual-login-and-own-1000-plan-form-ready',pass:true});await p.screenshot({path:out+'/'+phase+'-prepared.png',fullPage:true});
 if(phase==='buy'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');const original=p.url(),start=performance.now();report.clickAtEpochMs=Date.now();
  const responsePromise=p.waitForResponse(r=>r.request().method()==='POST'&&(r.request().postData()??'').includes(a.planId),{timeout:90000});
  await submit.click();report.pendingVisible=await p.getByText(/正在確認購買與收款/).isVisible().catch(()=>false);
  const response=await responsePromise;const text=await response.text();report.responseMs=Math.round(performance.now()-start);
  const values=[];try{values.push(JSON.parse(text));}catch{for(const line of text.split('\n'))try{values.push(JSON.parse(line.slice(line.indexOf(':')+1)));}catch{}}
  const result=values.find(x=>x&&typeof x==='object'&&'success'in x&&'checkoutReceipt'in x);assert.ok(result?.success,'Purchase response not confirmed');assert.equal(result.checkoutReceipt.paid,1000);assert.equal(result.checkoutReceipt.quantity,10);report.receipt=result.checkoutReceipt;
  if(process.env.QA_REPLAY_CONFIRMED==='1'){
   const req=response.request();const headers=Object.fromEntries(Object.entries(req.headers()).filter(([k])=>['content-type','next-action','next-router-state-tree','origin','referer'].includes(k)));const body=req.postData();assert.ok(body?.includes(a.planId));
   report.replays=await Promise.all([1,2].map(async()=>{const r=await context.request.post(req.url(),{headers,data:body,timeout:90000});const t=await r.text();assert.equal(r.status(),200);assert.ok(t.includes(result.checkoutReceipt.purchaseId));return {status:r.status(),samePurchaseId:true};}));
  }
  await p.getByText('本次購買已完成',{exact:true}).waitFor();report.acknowledgementMs=Math.round(performance.now()-start);
  await (module==='music'?p.getByText(/第 1 次購課/):p.getByText(/總剩餘 10 堂/)).first().waitFor();report.balanceVisibleMs=Math.round(performance.now()-start);
  assert.equal(new URL(p.url()).pathname,new URL(original).pathname);assert.equal(new URL(p.url()).searchParams.get('customerId'),a.customerId);
  report.checks.push({step:'purchase-confirmed-and-current-panel-updated-without-navigation',pass:true});await p.screenshot({path:out+'/buy-success.png',fullPage:true});
 }
 report.complete=true;
}catch(e){report.failure=String(e);report.visibleText=await p.locator('body').innerText().catch(()=>'');await p.screenshot({path:out+'/'+phase+'-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,visibleText:report.visibleText?'saved privately':undefined}));await context.close();}
