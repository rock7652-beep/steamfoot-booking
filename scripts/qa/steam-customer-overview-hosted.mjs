// Read-only authenticated QA against the pinned isolated project and demo store.
// Private configuration, credentials and failure diagnostics stay outside the repo.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const config=JSON.parse(readFileSync('/tmp/steam-customer-overview-config.json','utf8'));
const account=JSON.parse(readFileSync('/tmp/steam-customer-overview-access.json','utf8'));
assert.equal(config.project,'prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs');assert.equal(account.storeId,'addons-qa-steam');
assert.ok(new URL(config.base).hostname.startsWith('steamfoot-compact-qa-20261103-'));assert.equal(new URL(config.accessUrl).origin,config.base);
const out='/tmp/steam-customer-overview';mkdirSync(out,{recursive:true,mode:0o700});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===config.base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
const page=await context.newPage();page.setDefaultTimeout(45000);
const report={source:config.commit,deployment:config.deployment,authenticated:true,mocks:false,appWrites:false,checks:[],errors:[],complete:false};
page.on('pageerror',e=>report.errors.push(e.message));
async function capture(name){await page.waitForLoadState('networkidle');await page.screenshot({path:out+'/'+name+'.png',fullPage:true});}
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded'});await page.goto(config.base+'/hq/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(account.password);
 await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s.user));
 assert.equal(identity.id,account.userId);assert.equal(identity.storeId,account.storeId);assert.equal(identity.role,'OWNER');
 report.checks.push('normal-owner-login-and-exact-demo-store');
 await page.goto(config.base+'/s/'+account.slug+'/admin/dashboard/customers?customerId='+account.customerId+'&search='+encodeURIComponent(account.customerName),{waitUntil:'domcontentloaded'});
 const panel=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:account.customerName,exact:true})});await panel.waitFor();
 await panel.getByText('可預約 8 堂',{exact:true}).waitFor();await panel.getByText('剩餘 10 堂',{exact:true}).waitFor();await panel.getByText('預約保留 2 堂',{exact:true}).waitFor();
 assert.equal(await panel.getByRole('alert').count(),0);report.checks.push('ledger-remaining-10-reserved-2-available-8');
 await panel.getByRole('button',{name:'歷史方案（1）',exact:true}).click();
 await panel.getByText('已到期',{exact:true}).waitFor();
 const expired=panel.locator('li').filter({has:page.getByText('已到期',{exact:true})});assert.equal((await expired.innerText()).includes('可預約'),false);
 await capture('history');await panel.getByRole('button',{name:'收合歷史方案',exact:true}).click();report.checks.push('history-expired-not-presented-as-bookable');
 await panel.getByLabel('蒸足10堂方案方案操作',{exact:true}).click();await panel.getByText('每堂使用紀錄',{exact:true}).click();await panel.getByText('可用 8 堂',{exact:true}).waitFor();assert.equal(await panel.getByRole('alert').count(),0);await capture('plan-management');
 await panel.getByLabel('蒸足10堂方案方案操作',{exact:true}).click();report.checks.push('original-plan-management-and-authoritative-session-read');
 await panel.getByRole('button',{name:'編輯顧客資料',exact:true}).click();await panel.getByRole('button',{name:'← 返回顧客',exact:true}).click();
 await panel.getByText('可預約 8 堂',{exact:true}).waitFor();report.checks.push('edit-return-preserves-overview');
 for(const [width,height]of [[390,844],[360,780],[768,1024],[1024,768],[1366,900],[1920,1080]]){
  await page.setViewportSize({width,height});await panel.getByRole('heading',{name:account.customerName,exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await panel.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  const primary=panel.getByText('可預約 8 堂',{exact:true});assert.ok(Number(await primary.evaluate(e=>getComputedStyle(e).fontWeight))>=600);
  await capture('width-'+width);report.checks.push({width,height,pass:true});
 }
 assert.equal(report.errors.length,0);report.complete=true;
}catch(e){report.error=e.message;writeFileSync(out+'/failure.txt',await page.locator('body').innerText(),{mode:0o600});await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/results.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close();}
