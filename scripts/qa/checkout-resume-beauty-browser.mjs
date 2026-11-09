// One-shot acceptance fixture: mutation phases are not retryable after a committed purchase.
// Regenerate synthetic fixture IDs and private access files before a fresh acceptance run.
// Direct Playwright acceptance of one explicitly scoped, isolated Preview.
// Access links, temporary credentials and cookies are private /tmp files only.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const config=JSON.parse(readFileSync('/tmp/checkout-resume-beauty-access.json','utf8'));
const credentials=JSON.parse(readFileSync('/tmp/checkout-resume-beauty-login.json','utf8'));
const allowed='https://steamfoot-booking-git-preview-be-a99dad-rock7652-2111s-projects.vercel.app';
assert.equal(config.base,allowed);assert.equal(config.storeId,'beauty-hosted-20261021');assert.equal(credentials.storeId,config.storeId);
assert.equal(config.source,'460f0a3730dd160ae2c829f0076f7781348875ec');assert.equal(new URL(config.accessUrl).origin,allowed);
assert.ok(['probe','inspect','arrange','payment-inspect','payment-one','rights-inspect','finish-flow','attendance','attendance-concurrency','cleanup','security','arrange-b','verify-b','reads','attendance-concurrency','profile-buy','restore-only'].includes(process.argv[2]??'probe'));
const state='/tmp/checkout-resume-beauty-state.json',out='/tmp/checkout-resume-final/beauty';mkdirSync(out,{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext('/tmp/checkout-resume/beauty-owner-profile',{executablePath:process.env.QA_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',viewport:{width:1366,height:900},headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const browser=context.browser();
const redact=value=>value.replace(/(?:x-vercel-protection-bypass|_vercel_share)=[^&\s]+/g,'access=[redacted]');
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===allowed||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
const page=await context.newPage(),errors=[];for(const old of context.pages())if(old!==page)await old.close();page.setDefaultTimeout(45000);
page.on('pageerror',error=>errors.push(redact(error.message)));
const report={scope:'real hosted Preview, native Playwright UI, actual credentials and server; no auth or transport mocks',deployment:config.deployment,browser:browser.version(),phase:process.argv[2]??'probe',complete:false,checks:[],errors};
report.requests=[];page.on('requestfinished',r=>{const u=new URL(r.url());if(r.method()==='POST'||u.pathname.includes('/api/beauty/'))report.requests.push({path:u.pathname,startedAtEpochMs:r.timing().startTime,durationMs:Math.round(r.timing().responseEnd)});});
let captured;
page.on('request',r=>{const body=r.postData();if(r.method()==='POST'&&r.headers()['next-action']&&body?.includes(config.bookingId))captured={url:r.url(),body,headers:Object.fromEntries(Object.entries(r.headers()).filter(([k])=>['content-type','next-action','next-router-state-tree','origin','referer'].includes(k)))};});
async function replay(label){assert.ok(captured);const r=captured;const replies=await Promise.all([1,2].map(async()=>{const response=await context.request.post(r.url,{headers:r.headers,data:r.body,timeout:90000});const text=await response.text();return {status:response.status(),confirmed:/"success":true/.test(text),conflict:/"success":false/.test(text)};}));assert.ok(replies.every(x=>x.status===200&&(x.confirmed||x.conflict)));report.checks.push({step:label,pass:true,replies});}
async function persist(){writeFileSync(out+'/'+report.phase+'-results.json',JSON.stringify(report,null,2),{mode:0o600});}
try{
 if(['arrange','payment-one','finish-flow','attendance','attendance-concurrency','cleanup','arrange-b','verify-b'].includes(report.phase))assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1','Writes require deliberate isolated-fixture opt-in; do not rerun purchases against used fixtures.');
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded',timeout:90000});
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表'),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});
 const existing=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(existing?.storeId!==config.storeId||existing?.role!=='OWNER'){await page.getByLabel('Email',{exact:true}).fill(credentials.email);await page.getByLabel('密碼',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'登入',exact:true}).click();
 }
 await page.waitForURL(url=>url.origin===allowed&&url.pathname.includes('/dashboard'),{timeout:90000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({storeId:s?.user?.storeId,role:s?.user?.role})));
 assert.equal(identity.storeId,config.storeId);assert.equal(identity.role,'OWNER');
 const deployed=await page.locator('html').getAttribute('data-dpl-id');if(deployed)assert.equal(deployed,config.deployment);
 report.checks.push({step:'actual-owner-login-and-deployment',pass:true,storeId:identity.storeId,role:identity.role});
 writeFileSync(state,JSON.stringify(await context.storageState()),{mode:0o600});
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表'),{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});
 assert.equal(new URL(page.url()).origin,allowed);
 await page.screenshot({path:out+'/authenticated-schedule.png',fullPage:true});
 report.checks.push({step:'authenticated-beauty-schedule',pass:true,path:new URL(page.url()).pathname,buttons:(await page.getByRole('button').allTextContents()).filter(t=>/預約|新增|排|關閉/.test(t)).slice(0,12)});
 if(report.phase==='restore-only'){
 assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表')+'&date=2026-11-04&bookingId='+config.bookingId,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:credentials.name+'：已完成',exact:true}).click();await page.getByRole('menuitem',{name:'恢復待服務',exact:true}).click();await page.getByRole('button',{name:credentials.name+'：已預約',exact:true}).waitFor();await page.getByText('30 次',{exact:true}).first().waitFor();report.checks.push({step:'restore-existing-rights-attendance-before-purchase-menu',pass:true});
 }
 if(report.phase==='profile-buy'){
 assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('顧客管理')+'&customerId='+credentials.customerId+'-profile-final',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'購買方案',exact:true}).last().click();const form=page.locator('#course-member-form');await form.waitFor();await form.getByRole('combobox',{name:'方案',exact:true}).selectOption('plan:'+credentials.prefix+'-plan-10');await form.locator('select[name="paymentMethod"]').selectOption('CARD');
 const submit=page.locator('button[type="submit"][form="course-member-form"]');await page.waitForFunction(()=>!document.querySelector('button[type="submit"][form="course-member-form"]').disabled);
 const original=page.url(),start=performance.now();report.clickAtEpochMs=Date.now();const responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&(r.request().postData()??'').includes(credentials.prefix+'-plan-10'));await submit.click();const response=await responsePromise;const text=await response.text();assert.match(text,/"success":true/);report.responseMs=Math.round(performance.now()-start);await form.waitFor({state:'hidden'});await page.locator('[aria-label="有效方案合計"]').getByText(/總剩餘 10 堂/).waitFor();report.purchaseAndBalanceMs=Math.round(performance.now()-start);assert.equal(new URL(page.url()).pathname,new URL(original).pathname);assert.equal(new URL(page.url()).searchParams.get('customerId'),credentials.customerId+'-profile-final');report.checks.push({step:'beauty-profile-purchase-authoritative-balance',pass:true});await page.screenshot({path:out+'/profile-buy-success.png',fullPage:true});
 }
 if(report.phase==='reads'){
 report.samples=[];
 for(let sample=1;sample<=3;sample++){
 const start=performance.now();const result=await page.evaluate(async customerId=>{const r=await fetch('/api/beauty/customer-read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({store:'beauty-hosted-20261021',operation:'cards',input:{customerId}})});const body=await r.json();return {status:r.status,success:body.success,remaining:body.totals?.reduce((sum,t)=>sum+t.remaining,0),rows:body.rows?.length,serverTiming:r.headers.get('server-timing'),trace:r.headers.get('x-read-trace')};},credentials.customerId);
 assert.equal(result.status,200);assert.equal(result.success,true);assert.equal(result.remaining,30);report.samples.push({sample,requestMs:Math.round(performance.now()-start),...result});
 }
 }
 if(report.phase==='inspect'){
 await page.getByRole('button',{name:'新增預約',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.waitForTimeout(1500);
 writeFileSync(out+'/form-inspect.json',JSON.stringify(await page.getByRole('dialog').evaluate(e=>({text:e.innerText,inputs:[...e.querySelectorAll('input,select,button')].map(x=>({tag:x.tagName,name:x.name,label:x.getAttribute('aria-label'),text:x.tagName==='INPUT'?x.type:x.innerText,value:x.value}))})),null,2),{mode:0o600});
 }
 if(['arrange','arrange-b'].includes(report.phase)){
 await page.getByRole('button',{name:'新增預約',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 await page.getByLabel('預約日期',{exact:true}).fill('2026-11-04');
 await page.getByLabel('預約開始時間',{exact:true}).fill(report.phase==='arrange-b'?'15:30':'14:00');
 await page.getByLabel('顧客姓名 1',{exact:true}).fill(credentials.name);
 await page.getByRole('option').filter({hasText:credentials.phone}).click();
 await page.getByLabel('服務項目 1',{exact:true}).selectOption(report.phase==='arrange-b'?'beauty-hosted-massage':'beauty-hosted-face');
 await page.getByLabel('此位技師 1',{exact:true}).selectOption('qa-finance-4310a985-tech-a');
 await page.getByLabel('此位位置 1',{exact:true}).selectOption('qa-finance-4310a985-room-a');
 await dialog.locator('summary').filter({hasText:'備註'}).click();
 await page.getByLabel('本次備註 1',{exact:true}).fill('qa-item-core-20261028 isolated acceptance');
 assert.equal(await page.getByLabel('使用方案 1',{exact:true}).count(),0);
 await page.getByRole('button',{name:'確認預約',exact:true}).click();
 await dialog.waitFor({state:'hidden',timeout:90000});
 report.checks.push({step:report.phase==='arrange-b'?'other-item-arrangement-despite-only-A-rights':'no-card-arrangement-item-only',pass:true});
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表')+'&date=2026-11-04&calendar=day',{waitUntil:'networkidle',timeout:90000});
 writeFileSync(out+'/arranged-page.txt',await page.locator('body').innerText(),{mode:0o600});
 await page.screenshot({path:out+'/arranged.png',fullPage:true});
 }
 if(['payment-inspect','payment-one','verify-b'].includes(report.phase)){
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表')+'&date=2026-11-04&bookingId='+(report.phase==='verify-b'?config.bBookingId:config.bookingId)+'',{waitUntil:'domcontentloaded',timeout:90000});
 const pending=page.getByRole('button',{name:''+credentials.name+'：已預約',exact:true});await pending.waitFor();await pending.click();
 await page.getByRole('button',{name:'確認結帳',exact:true}).waitFor();
 writeFileSync(out+'/payment-inspect.json',JSON.stringify(await page.locator('body').evaluate(e=>({text:e.innerText,inputs:[...e.querySelectorAll('input,select')].map(x=>({tag:x.tagName,name:x.name,label:x.getAttribute('aria-label'),text:x.tagName==='INPUT'?x.type:x.innerText,value:x.value}))})),null,2),{mode:0o600});
 await page.screenshot({path:out+'/payment-inspect.png',fullPage:true});
 report.checks.push({step:'no-card-attendance-opens-in-place-payment',pass:true});

 if(report.phase==='verify-b'){
 const before=page.url();
 for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
 await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.getByRole('button',{name:'確認結帳',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'確認結帳',exact:true}).waitFor();
 await page.screenshot({path:out+'/payment-'+width+'.png',fullPage:true});report.checks.push({step:'payment-responsive',width,height,pass:true});
 }
 await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:credentials.name,exact:true})}).getByRole('button',{name:'關閉',exact:true}).click();
 assert.equal(page.url(),before);await pending.waitFor();assert.equal(await page.getByRole('button',{name:credentials.name+'：已完成',exact:true}).count(),0);
 report.checks.push({step:'A-rights-do-not-complete-B-payment-prompt-without-navigation',pass:true});
 await page.getByRole('button',{name:credentials.name+' 更多操作',exact:true}).click();page.once('dialog',async d=>{assert.equal(d.message(),'確定取消此筆預約？');await d.accept();});await page.getByRole('menuitem',{name:'取消預約',exact:true}).click();await pending.waitFor({state:'hidden',timeout:90000});
 report.checks.push({step:'cancel-owned-B-through-normal-ui',pass:true});
 }
 if(report.phase==='payment-one'){
 const before=page.url();await page.getByLabel('方案',{exact:true}).selectOption('plan:'+credentials.prefix+'-plan-10');
 await page.locator('select[name="paymentMethod"]').selectOption('CARD');
 const start=performance.now();report.clickAtEpochMs=Date.now();await page.getByRole('button',{name:'確認結帳',exact:true}).click();
 await page.getByRole('button',{name:'確認結帳',exact:true}).waitFor({state:'hidden',timeout:90000});
 report.acknowledgementMs=Math.round(performance.now()-start);assert.equal(page.url(),before);await page.getByText((process.env.QA_EXPECT_BALANCE??10)+' 次',{exact:true}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:''+credentials.name+'：已完成',exact:true}).count(),0);
 report.purchaseAndBalanceMs=Math.round(performance.now()-start);report.checks.push({step:'in-place-purchase-10-no-auto-attendance',pass:true});
 writeFileSync(out+'/after-purchase.json',JSON.stringify({text:await page.locator('body').innerText(),buttons:await page.getByRole('button').evaluateAll(e=>e.map(x=>({text:x.innerText,label:x.getAttribute('aria-label')})))},null,2),{mode:0o600});
 }

 }
 if(['rights-inspect','finish-flow','attendance','attendance-concurrency','cleanup'].includes(report.phase)){
 await page.goto(allowed+'/s/'+config.storeId+'/admin/dashboard/beauty?tab='+encodeURIComponent('班表')+'&date=2026-11-04&bookingId='+config.bookingId+'',{waitUntil:'domcontentloaded',timeout:90000});
 await page.getByRole('button',{name:''+credentials.name+'：已預約',exact:true}).waitFor();
 writeFileSync(out+'/rights-inspect.json',JSON.stringify({text:await page.locator('body').innerText(),buttons:await page.getByRole('button').evaluateAll(e=>e.map(x=>({text:x.innerText,label:x.getAttribute('aria-label')})))},null,2),{mode:0o600});
 if(report.phase==='finish-flow'){
 await page.getByRole('button',{name:''+credentials.name+' 更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'購買方案',exact:true}).click();
 await page.getByLabel('方案',{exact:true}).selectOption('plan:'+credentials.prefix+'-plan-20');
 await page.locator('select[name="paymentMethod"]').selectOption('CARD');
 const original=page.url(),start=performance.now();report.clickAtEpochMs=Date.now();await page.getByRole('button',{name:'確認結帳',exact:true}).click();
 await page.getByRole('button',{name:'確認結帳',exact:true}).waitFor({state:'hidden',timeout:90000});
 report.acknowledgementMs=Math.round(performance.now()-start);
 assert.equal(page.url(),original);
 await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();
 const pending=page.getByRole('button',{name:''+credentials.name+'：已預約',exact:true});await pending.waitFor();
 report.purchaseAndBalanceMs=Math.round(performance.now()-start);report.checks.push({step:'purchase-20-summed-30-original-roster-no-auto-attendance',pass:true});
 await pending.click();const attended=page.getByRole('button',{name:''+credentials.name+'：已完成',exact:true});await attended.waitFor();
 await page.getByText((Number(process.env.QA_EXPECT_BALANCE??30)-1)+' 次',{exact:true}).first().waitFor();
 report.checks.push({step:'attendance-debit-to-29',pass:true});
 await attended.click();await page.getByRole('menuitem',{name:'恢復待服務',exact:true}).click();
 await pending.waitFor();await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();
 report.checks.push({step:'restore-to-30',pass:true});
 await page.screenshot({path:out+'/restored.png',fullPage:true});
 }
 }
 if(report.phase==='attendance'||report.phase==='attendance-concurrency'){
 const original=page.url();await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();
 const pending=page.getByRole('button',{name:''+credentials.name+'：已預約',exact:true});
 await pending.click();const attended=page.getByRole('button',{name:''+credentials.name+'：已完成',exact:true});await attended.waitFor();
 await page.getByText((Number(process.env.QA_EXPECT_BALANCE??30)-1)+' 次',{exact:true}).first().waitFor();
 if(report.phase==='attendance-concurrency')await replay('same-revision-concurrent-completion');report.checks.push({step:'sum-30-attendance-debit-to-29',pass:true});
 await page.screenshot({path:out+'/attended.png',fullPage:true});
 await attended.click();await page.getByRole('menuitem',{name:'恢復待服務',exact:true}).click();
 await pending.waitFor();await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();
 assert.equal(page.url(),original);
 if(report.phase==='attendance-concurrency'){await replay('same-revision-concurrent-restoration');await page.reload({waitUntil:'domcontentloaded'});await pending.waitFor();await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();}report.checks.push({step:'restore-to-30-original-url',pass:true});
 await page.screenshot({path:out+'/restored.png',fullPage:true});
 }
 if(report.phase==='cleanup'){
 for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
 await page.setViewportSize({width,height});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.getByText((process.env.QA_EXPECT_BALANCE??30)+' 次',{exact:true}).first().waitFor();
 report.checks.push({step:'roster-responsive',width,height,pass:true});
 await page.screenshot({path:out+'/roster-'+width+'.png',fullPage:true});
 }
 const denied=await page.evaluate(async id=>{const r=await fetch('/api/beauty/roster?store=beauty-qa-isolation-20261022&scope=booking:'+id);return {status:r.status,success:(await r.json()).success};},config.bookingId);
 assert.equal(denied.status,403);assert.equal(denied.success,false);report.checks.push({step:'authenticated-cross-store-read-denied',pass:true});
 await page.getByRole('button',{name:''+credentials.name+' 更多操作',exact:true}).click();
 page.once('dialog',async dialog=>{assert.equal(dialog.message(),'確定取消此筆預約？');await dialog.accept();});
 await page.getByRole('menuitem',{name:'取消預約',exact:true}).click();
 await page.getByRole('button',{name:''+credentials.name+'：已預約',exact:true}).waitFor({state:'hidden',timeout:90000});
 report.checks.push({step:'cancel-only-owned-test-booking-through-normal-ui',pass:true});
 }
 if(report.phase==='security'){
 const restricted=JSON.parse(readFileSync('/tmp/checkout-resume/beauty-restricted.json','utf8'));
 await context.clearCookies();await page.goto(config.accessUrl,{waitUntil:'domcontentloaded',timeout:90000});await page.goto(allowed+'/hq/login?store='+config.storeId,{waitUntil:'domcontentloaded',timeout:90000});
 await page.getByLabel('Email',{exact:true}).fill(restricted.email);await page.getByLabel('密碼',{exact:true}).fill(restricted.password);await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>url.origin===allowed&&!url.pathname.includes('/login'),{timeout:90000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({id:s?.user?.id,storeId:s?.user?.storeId,role:s?.user?.role})));
 assert.equal(identity.id,restricted.id);assert.equal(identity.role,'STAFF');assert.equal(identity.storeId,config.storeId);
 const denied=await page.evaluate(async c=>{const r=await fetch('/api/beauty/roster?store='+c.storeId+'&scope=booking:'+c.bookingId);return {status:r.status,success:(await r.json()).success};},{storeId:config.storeId,bookingId:config.bookingId});
 assert.equal(denied.status,403);assert.equal(denied.success,false);report.checks.push({step:'actual-restricted-staff-login-and-same-store-roster-denied',pass:true,...denied});
 }
 assert.deepEqual(errors,[]);report.complete=true;await persist();console.log(JSON.stringify({complete:true,checks:report.checks}));
}catch(error){report.error=redact(error.message);await persist();await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});console.error(report.error);process.exitCode=1;}
finally{await context.close();}
