/** Real owner/member browser operations; PostgreSQL is queried only to verify receipts. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),{Client}=require('pg');
const config=JSON.parse(readFileSync('/tmp/mixed-local-access.json','utf8')),env=JSON.parse(readFileSync('/tmp/mixed-local-env.json','utf8'));
assert.equal(config.base,'http://localhost:3107');assert.equal(env.DATABASE_URL,'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test');
const kind=process.argv[2],a=config.accounts.find(x=>x.kind===kind);assert.ok(a);
const out='/tmp/mixed-local-acceptance/'+kind;mkdirSync(out,{recursive:true});
const db=new Client({connectionString:env.DATABASE_URL});await db.connect();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={kind,complete:false,mocks:false,checks:[],errors:[]};let page;
const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===config.base?r.continue():r.abort());
async function capture(name){await page.screenshot({path:out+'/life-'+name+'.png',fullPage:true});writeFileSync(out+'/life-'+name+'.json',JSON.stringify(await page.locator('body').evaluate(e=>({text:e.innerText,fields:[...e.querySelectorAll('input,select,button')].map(x=>({tag:x.tagName,role:x.getAttribute('role'),label:x.getAttribute('aria-label'),name:x.name,type:x.type,value:['password','email'].includes(x.type)?'[redacted]':x.value,text:x.tagName==='INPUT'?'':x.innerText}))})),null,2),{mode:0o600});}
async function login(person){await page.goto(config.base+'/hq/login',{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(person.email);await page.getByLabel('密碼',{exact:true}).fill(person.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes(person===a?'/dashboard':'/book'));await page.waitForLoadState('networkidle');}
async function choose(locator,value,label){if(await locator.evaluate(e=>e.tagName==='SELECT'))await locator.selectOption(value);else{await locator.click();await page.getByRole('option').filter({hasText:label}).click();}}
async function receipt(customerId){let rows=[];for(let n=0;n<300;n++){rows=(await db.query('SELECT p.id,p.status,p.price,p."cardId",c.remaining FROM "CoursePurchase" p JOIN "CoursePointCard" c ON c.id=p."cardId" WHERE p."storeId"=$1 AND p."customerId"=$2 ORDER BY p."createdAt"',[a.storeId,customerId])).rows;if(rows.length===1&&rows[0].status==='CONFIRMED')break;await new Promise(r=>setTimeout(r,100));}assert.equal(rows.length,1);assert.equal(rows[0].remaining,1);assert.equal(rows[0].status,'CONFIRMED');assert.equal(rows[0].price,800);report.checks.push({step:'purchase-receipt',customerId,...rows[0],pass:true});return rows[0];}

try{
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));await login(a);
 const s=(await db.query('SELECT id FROM "CourseSession" WHERE "storeId"=$1 AND "templateId"=$2',[a.storeId,a.templateId])).rows[0];assert.ok(s);
 const courses=config.base+'/s/'+a.slug+'/admin/dashboard/courses',roster=courses+'?view=schedule&date='+a.date+'&session='+s.id;
 await page.goto(roster,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:a.customers[0].name+(kind==='sports'?'：待點名':'：點名'),exact:true}).click();await page.getByRole('button',{name:'繳費／購買方案',exact:true}).click();
 const purchase=page.getByRole('dialog',{name:'學員繳費 · '+a.customers[0].name,exact:true});await purchase.waitFor();await capture('fixed-purchase-form');
 await purchase.locator('#course-roster-purchase-form select').first().selectOption('qa-mixed-local-'+kind+'-fee-'+(kind==='sports'?'ASSIGNED':'LEGACY'));
 if(kind==='sports')await purchase.getByLabel('所屬店長',{exact:true}).selectOption(a.staffId);
 await purchase.locator('select[name="paymentMethod"]').selectOption('CARD');await purchase.getByRole('button',{name:'確認購課與本次收款',exact:true}).click();await purchase.waitFor({state:'hidden'});await receipt(a.customers[0].id);await capture('fixed-purchased');
 await page.goto(courses+'?view=customers&action=assign&customerId='+a.customers[1].id,{waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle');await capture('free-purchase-form');
 const buy=page.getByRole('dialog');await buy.waitFor();
 if(kind==='music')await choose(buy.getByLabel('教學項目',{exact:true}),a.subjectId,a.subjectName);
 const planId='qa-mixed-local-'+kind+'-fee-'+(kind==='sports'?'OPEN':'LEGACY');
 await choose(buy.getByLabel(kind==='music'?'收費方式':'方案',{exact:true}),planId,(kind==='music'?'音樂':'運動')+'單次收費 '+(kind==='sports'?'OPEN':'LEGACY'));
 if(kind==='sports')await buy.getByLabel('所屬店長',{exact:true}).selectOption(a.staffId);
 await buy.locator('select[name="paymentMethod"]').selectOption('CARD');await capture('free-purchase-ready');await buy.getByRole('button',{name:kind==='music'?'儲存學費':'確認結帳',exact:true}).click();await page.getByRole('button',{name:kind==='music'?'儲存學費':'確認結帳',exact:true}).waitFor({state:'hidden'});await receipt(a.customers[1].id);await page.getByRole('button',{name:'儲存中…',exact:true}).waitFor({state:'hidden'});await capture('free-purchased');
 const ownerPage=page;
 const memberContext=await browser.newContext({viewport:{width:390,height:844}});await memberContext.route('**/*',r=>new URL(r.request().url()).origin===config.base?r.continue():r.abort());
 page=await memberContext.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));await login(a.customers[1]);
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s.user));assert.equal(identity.role,'CUSTOMER');assert.equal(identity.customerId,a.customers[1].id);
 await page.goto(config.base+'/s/'+a.slug+'/book?view=schedule&month='+a.date.slice(0,7)+'&date='+a.date,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'開放選課',exact:true}).click();await capture('member-open-class');
 await page.getByRole('button',{name:'預約',exact:true}).click();await page.getByRole('button',{name:'確認預約',exact:true}).click();await page.getByRole('button',{name:'確認預約',exact:true}).waitFor({state:'hidden'});
 let freeBooking=[];for(let n=0;n<300;n++){freeBooking=(await db.query('SELECT id,status,"pointCost","cardId" FROM "CourseBooking" WHERE "sessionId"=$1 AND "customerId"=$2',[s.id,a.customers[1].id])).rows;if(freeBooking.length===1&&freeBooking[0].status==='RESERVED')break;await new Promise(r=>setTimeout(r,100));}await page.getByRole('button',{name:'預約中…',exact:true}).waitFor({state:'hidden'});assert.equal(freeBooking.length,1);assert.equal(freeBooking[0].status,'RESERVED');assert.equal(freeBooking[0].pointCost,1);report.checks.push({step:'member-self-booked-mixed-class',bookingId:freeBooking[0].id,pass:true});await capture('member-booked');
 page=ownerPage;await page.goto(roster,{waitUntil:'domcontentloaded'});await page.waitForLoadState('networkidle');
 async function balanceState(customer,status,remaining){let row;for(let n=0;n<100;n++){row=(await db.query('SELECT b.id,b.status,b."absenceKind",b."pointCost",c.remaining FROM "CourseBooking" b LEFT JOIN "CoursePointCard" c ON c.id=b."cardId" WHERE b."sessionId"=$1 AND b."customerId"=$2',[s.id,customer.id])).rows[0];if(row?.status===status){const balance=(await db.query('SELECT c.remaining FROM "CoursePurchase" p JOIN "CoursePointCard" c ON c.id=p."cardId" WHERE p."storeId"=$1 AND p."customerId"=$2',[a.storeId,customer.id])).rows[0].remaining;if(balance===remaining){report.checks.push({step:'booking-and-balance',customerId:customer.id,status,remaining,pass:true});return row;}}await new Promise(r=>setTimeout(r,100));}throw Error('Booking/balance did not match '+status+'/'+remaining+'; '+JSON.stringify(row));}
 for(const customer of a.customers.slice(0,2)){
  await page.getByRole('button',{name:customer.name+(kind==='sports'?'：待點名':'：點名'),exact:true}).click();await balanceState(customer,'ATTENDED',0);await capture('attended-'+customer.id);
  await page.getByRole('button',{name:customer.name+'：已出席',exact:true}).click();await page.getByRole('menuitem',{name:/^恢復/}).click();await balanceState(customer,'RESERVED',1);await capture('restored-'+customer.id);
 }
 // Owner records the fixed learner's leave, then corrects it back to RESERVED.
 const fixed=a.customers[0];
 await page.getByRole('button',{name:fixed.name+(kind==='sports'?'：待點名':'：點名'),exact:true}).click();await balanceState(fixed,'ATTENDED',0);
 await page.getByRole('button',{name:fixed.name+'：已出席',exact:true}).click();await page.getByRole('menuitem',{name:kind==='music'?'請假':'未出席不扣堂',exact:true}).click();
 await balanceState(fixed,'CANCELLED',1);await capture('fixed-leave');
 const sessionState=(await db.query('SELECT "releasedAt","cancelledAt" FROM "CourseSession" WHERE id=$1',[s.id])).rows[0];assert.equal(sessionState.releasedAt,null);assert.equal(sessionState.cancelledAt,null);report.checks.push({step:'fixed-leave-keeps-public-class-open',pass:true});
 await page.getByRole('button',{name:new RegExp('^'+fixed.name+'：')}).click();await page.getByRole('menuitem',{name:/^恢復/}).click();await balanceState(fixed,'RESERVED',1);await capture('leave-restored');
 await memberContext.close();
 report.complete=true;
}catch(e){report.error=e.message;await capture('failure').catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/lifecycle-results.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close();await db.end();}
