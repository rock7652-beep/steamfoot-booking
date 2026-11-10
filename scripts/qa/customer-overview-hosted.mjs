// Real hosted credentials, UI and persistence. No authentication/transport mocks.
// Passwords, cookies, share URLs and raw failure diagnostics stay in private /tmp.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const config=JSON.parse(readFileSync('/tmp/customer-overview-hosted-config.json','utf8'));
assert.equal(config.project,'prj_Aq5uK16Dc49OAUPJnP5VtnVAEdTs');
assert.ok(new URL(config.base).hostname.startsWith('steamfoot-compact-qa-20261103-'));
assert.equal(new URL(config.accessUrl).origin,config.base);
const kind=process.argv[2]||'sports',phase=process.argv[3]||'probe';
const scheduleTime=process.env.QA_SCHEDULE_TIME||'14:00';assert.ok(['14:00','16:00'].includes(scheduleTime));
assert.ok(['sports','music','beauty'].includes(kind));assert.ok(['probe','profile','purchase','schedule','records','access','attendance','cancel'].includes(phase));
const account=JSON.parse(readFileSync('/tmp/customer-overview-access.json','utf8')).accounts.find(a=>a.kind===kind);
assert.equal(account.storeId,'addons-qa-'+(kind==='sports'?'fitness':kind));
const out='/tmp/customer-overview-hosted/'+kind;mkdirSync(out,{recursive:true,mode:0o700});
const browser=await chromium.launch({executablePath:process.env.QA_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1366,height:900},...(existsSync(out+'/state.json')?{storageState:out+'/state.json'}:{})});
await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===config.base||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(45000);
const report={kind,phase,deployment:config.deployment,commit:config.commit,mocks:false,complete:false,checks:[],errors:[]};
page.on('pageerror',error=>report.errors.push(error.message.replace(/_vercel_share=[^&\s]+/g,'access=[redacted]')));
const customer=account.customers[0];
const profileUrl=config.base+'/s/'+account.slug+'/admin/dashboard/'+(kind==='beauty'?'beauty?tab='+encodeURIComponent('顧客管理')+'&':'courses?view=customers&')+'customerId='+customer.id+'&studentTab=info&search='+encodeURIComponent('總覽驗收');
async function capture(name){
 if(name!=='failure'){
  await page.waitForLoadState('networkidle');
  for(const text of ['更新中…','讀取下次預約…','讀取學員堂數與課表…'])await page.getByText(text,{exact:true}).waitFor({state:'hidden'});
 }
 await page.screenshot({path:out+'/'+phase+'-'+name+'.png',fullPage:true});writeFileSync(out+'/'+phase+'-'+name+'.txt',await page.locator('body').innerText(),{mode:0o600});
}
async function choice(locator,value,label){if(await locator.evaluate(e=>e.tagName==='SELECT'))await locator.selectOption(value);else{await locator.click();await page.locator('[role="listbox"] [role="option"]').filter({hasText:label}).click();}}
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded',timeout:90000});
 let identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(identity?.id!==account.userId){
  await page.goto(config.base+'/hq/login',{waitUntil:'domcontentloaded',timeout:90000});
  await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:90000});
  identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 }
 assert.equal(identity.id,account.userId);assert.equal(identity.storeId,account.storeId);assert.equal(identity.role,'OWNER');
 report.checks.push({step:'normal-owner-login',storeId:identity.storeId,role:identity.role,pass:true});
 await context.storageState({path:out+'/state.json'});
 await page.goto(profileUrl,{waitUntil:'domcontentloaded',timeout:90000});
 const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:customer.name,exact:true})});await dialog.waitFor();
 await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).waitFor();
 await dialog.getByText('更新中…',{exact:true}).waitFor({state:'hidden'});
 await dialog.getByText('讀取下次預約…',{exact:true}).waitFor({state:'hidden'});
 await dialog.getByText('讀取學員堂數與課表…',{exact:true}).waitFor({state:'hidden'});
 assert.equal(await dialog.getByRole('alert').count(),0,'Profile reads must complete without errors');
 await capture('opened');
 report.checks.push({step:'authenticated-profile-open',pass:true});
 if(phase==='profile'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).click();await dialog.locator('input[name="address"]').fill('隔離驗收地址・'+kind);
  await dialog.getByRole('button',{name:'儲存',exact:true}).click();await dialog.getByRole('button',{name:'返回總覽',exact:true}).waitFor({state:'hidden'});
  const addNote=dialog.getByRole('button',{name:'＋備註',exact:true});
  if(await addNote.count())await addNote.click();else await dialog.getByRole('button',{name:'編輯',exact:true}).click();
  await dialog.getByRole('textbox',{name:'店內備註',exact:true}).fill('隔離完整驗收備註・'+kind);
  await dialog.getByRole('button',{name:'儲存',exact:true}).click();
  await dialog.getByText('儲存中…',{exact:true}).waitFor({state:'hidden'});
  await dialog.getByRole('textbox',{name:'店內備註',exact:true}).waitFor({state:'hidden'});
  await dialog.locator('p').filter({hasText:'隔離完整驗收備註・'+kind}).first().waitFor();
  await page.reload({waitUntil:'domcontentloaded'});await dialog.locator('p').filter({hasText:'隔離完整驗收備註・'+kind}).first().waitFor();
  await dialog.getByText('基本資料',{exact:true}).click();await dialog.getByText('隔離驗收地址・'+kind,{exact:true}).waitFor();
  report.checks.push({step:'profile-and-note-persist-after-reload',pass:true});
 }
 if(phase==='purchase'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  await dialog.getByRole('button',{name:kind==='music'?'購課／續購':'新增方案',exact:true}).click();
  const buy=page.getByRole('dialog');
  if(kind==='music')await choice(buy.getByLabel('教學項目',{exact:true}),account.subjectId,'總覽驗收音樂');
  await choice(buy.getByLabel(kind==='music'?'收費方式':'方案',{exact:true}),kind==='beauty'?'plan:'+account.planId:account.planId,'總覽驗收');
  if(kind==='sports')await buy.getByLabel('所屬店長',{exact:true}).selectOption(account.staffId);
  await buy.locator('select[name="paymentMethod"]').selectOption('CARD');await capture('purchase-ready');
  await buy.getByRole('button',{name:kind==='music'?'儲存學費':'確認結帳',exact:true}).click();
  await buy.getByRole('button',{name:kind==='music'?'儲存學費':'確認結帳',exact:true}).waitFor({state:'hidden',timeout:90000});
  await page.getByRole('button',{name:'編輯顧客資料',exact:true}).waitFor({timeout:90000});
  await page.getByText('更新中…',{exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.getByRole('dialog').getByRole('alert').count(),0);
  await capture('purchased');
  report.checks.push({step:'purchase-through-normal-ui-and-return',pass:true});
 }
 if(phase==='probe'||phase==='profile')for(const [width,height]of [[390,844],[768,1024],[1024,768],[1366,900]]){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).scrollIntoViewIfNeeded();await capture('width-'+width);
  report.checks.push({step:'authenticated-responsive-profile',width,height,pass:true});
 }
 if(phase==='schedule'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  await page.getByRole(kind==='beauty'?'button':'link',{name:kind==='beauty'?'新增預約':'安排課程',exact:true}).first().click();
  if(kind==='beauty'){
   await page.getByLabel('預約日期',{exact:true}).fill('2026-11-12');
   await page.getByLabel('預約開始時間',{exact:true}).fill(scheduleTime);
   await page.getByLabel('服務項目 1',{exact:true}).selectOption(account.serviceId);
   await page.getByLabel('此位位置 1',{exact:true}).selectOption(account.roomId);
   await page.getByLabel('此位技師 1',{exact:true}).selectOption(account.technicianId);
  }else{
   if(kind==='sports')await page.getByRole('button',{name:'單次',exact:true}).click();
   else await page.getByLabel('安排類型',{exact:true}).selectOption('single');
   await page.getByLabel('排課日期',{exact:true}).fill('2026-11-12');
   await page.getByLabel('排課時間',{exact:true}).fill(scheduleTime);
   if(kind==='sports'){
    await choice(page.getByLabel('排課教學項目',{exact:true}),account.subjectId,'總覽驗收運動');
    await choice(page.getByLabel(/排課(教練|老師|教師)/),account.staffId,'驗收老師');
    const learner=page.getByLabel('搜尋學員',{exact:true});await learner.fill(customer.name);
    await page.locator('[role="listbox"] [role="option"]').filter({hasText:customer.name}).click();
    await page.getByLabel('排課空間',{exact:true}).click();
    await page.locator('[role="listbox"] [role="option"]').filter({hasText:'總覽驗收'}).click();
   }else{
    await page.getByLabel('課程',{exact:true}).selectOption(account.templateId);
    await page.getByLabel('排課教室',{exact:true}).selectOption(account.roomId);
    await page.getByLabel(/授課(教師|老師)/).selectOption(account.staffId);
   }
  }
  await capture('ready');
  if(process.env.QA_SUBMIT_SCHEDULE==='1'){
   await page.getByRole('button',{name:kind==='beauty'?'確認預約':'新增',exact:true}).click();
   await page.getByLabel(kind==='beauty'?'預約日期':'排課日期',{exact:true}).waitFor({state:'hidden',timeout:90000});
   await page.goto(profileUrl,{waitUntil:'domcontentloaded'});
   await dialog.getByText(new RegExp('2026[-/]11[-/]12.*'+scheduleTime)).waitFor();
   await capture('created');report.checks.push({step:'schedule-created-and-next-booking-refreshed',pass:true});
  }else throw new Error('Schedule prepared only; submit verification pending');
 }
 if(phase==='records'){
  await dialog.getByText(/2026[-/]11[-/]12.*14:00/).waitFor();
  report.checks.push({step:'next-booking-persists-after-new-authenticated-read',pass:true});
  await dialog.getByRole('button',{name:'歷史方案',exact:true}).click();
  await dialog.getByText('歷史驗收方案・已到期',{exact:true}).first().waitFor();
  await capture('history');
  await dialog.getByRole('button',{name:'返回有效方案',exact:true}).click();
  await dialog.getByText(/總覽驗收.*四[堂次]方案/).first().waitFor();
  await dialog.getByRole('button',{name:kind==='music'?'課程與學費':'紀錄',exact:true}).click();
  await capture('records');
  assert.equal(await dialog.getByRole('alert').count(),0);
  await dialog.getByRole('button',{name:'總覽',exact:true}).click();
  await dialog.getByRole('button',{name:'編輯顧客資料',exact:true}).waitFor();
  assert.ok(new URL(page.url()).searchParams.get('search')?.includes('總覽驗收'));
  report.checks.push({step:'historical-active-records-return-and-search-retained',pass:true});
 }
 if(phase==='access'){
  const other=JSON.parse(readFileSync('/tmp/customer-overview-access.json','utf8')).accounts.find(a=>a.kind!==kind).customers[0];
  await page.goto(profileUrl.replace(customer.id,other.id),{waitUntil:'networkidle'});
  assert.equal(await page.getByRole('heading',{name:other.name,exact:true}).count(),0);
  assert.equal((await page.locator('body').innerText()).includes(other.phone),false);
  report.checks.push({step:'other-store-customer-profile-not-exposed',pass:true});await capture('denied-other-store');
 }
 if(phase==='attendance'||phase==='cancel'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  assert.ok(config.fixtureSessionIds?.[kind],'Privately configured fixture session required');
  await page.goto(config.base+'/s/'+account.slug+'/admin/dashboard/'+(kind==='beauty'?'beauty?tab='+encodeURIComponent('班表')+'&date=2026-11-12&bookingId='+config.fixtureSessionIds[kind]:'courses?date=2026-11-12&action=booking&session='+config.fixtureSessionIds[kind]),{waitUntil:'domcontentloaded'});
  if(phase==='attendance'){
   await page.getByRole('button',{name:customer.name+'：'+(kind==='beauty'?'已預約':kind==='music'?'點名':'待點名'),exact:true}).click();
   await page.getByRole('button',{name:customer.name+'：'+(kind==='beauty'?'已完成':'已出席'),exact:true}).waitFor({timeout:45000});
   await capture('attended');
  }else{
   await page.getByRole('button',{name:customer.name+' 更多操作',exact:true}).click();
   if(kind==='beauty'){
    page.once('dialog',d=>d.accept());await page.getByRole('menuitem',{name:'取消預約',exact:true}).click();
   }else{
    await page.getByRole('menuitem',{name:'取消本堂',exact:true}).click();
    await page.getByRole('button',{name:'確認取消並退還名額',exact:true}).click();
   }
   await page.getByRole('button',{name:customer.name+'：'+(kind==='beauty'?'已完成':'已出席'),exact:true}).waitFor({state:'hidden'});
   await capture('cancelled');
  }
  await page.goto(profileUrl,{waitUntil:'domcontentloaded'});
  await dialog.getByText('剩餘 '+(phase==='cancel'?4:3)+' '+(kind==='beauty'?'次':'堂'),{exact:true}).waitFor();await capture('balance-after-'+phase);
  report.checks.push({step:phase==='cancel'?'cancel-attended-refund-and-authoritative-balance':'attendance-debit-and-profile-authoritative-balance',pass:true});
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.complete=true;
}catch(error){report.error=error.message;await capture('failure').catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'-results.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await context.storageState({path:out+'/state.json'});await browser.close();}
