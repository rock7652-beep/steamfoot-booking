// Actual browser -> authenticated Server Actions -> isolated PostgreSQL.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const { PrismaClient } = require('../../generated/course-client');
const url = 'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test';
if (process.env.DATABASE_URL !== url) throw Error('Explicit isolated database required');
const db = new PrismaClient({datasourceUrl:url});
const out = 'artifacts/sports-booking-sync-20261017'; mkdirSync(out,{recursive:true});
const root = 'http://localhost:3107/s/sports-live-flow/admin/dashboard';
let browser, page, observer, observerToken, observerUrl, cardId, currentBooking;
const results = { environment:'isolated PostgreSQL and actual Next application', scheduledSession:'2026-10-18; manager attendance permitted by current UI', steps:[] };
async function poll(fn) { for(let n=0;n<150;n++){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error('Database condition timed out'); }
async function snapshot(label,status,remaining){
 const card = await db.coursePointCard.findUniqueOrThrow({where:{id:cardId}});
 const bookings = await db.courseBooking.findMany({where:{cardId},orderBy:{createdAt:'asc'}});
 assert.equal(card.remaining,remaining); assert.equal(bookings.at(-1).status,status);
 const entries = await db.coursePointEntry.findMany({where:{cardId},orderBy:{createdAt:'asc'}});
 const held = bookings.filter(row=>row.status==='RESERVED').reduce((sum,row)=>sum+row.pointCost,0);
 assert.equal(held,status==='RESERVED'?1:0);
 results.steps.push({label,remaining,held,available:remaining-held,bookings,entries});
 await page.screenshot({path:`${out}/${label}.png`});
 writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
 console.log(label, status, remaining);
}
async function reserve(){
 await page.getByRole('button',{name:'＋加入學員',exact:true}).click();
 await page.getByLabel('先找學員',{exact:true}).fill('運動驗收學員');
 await page.getByRole('button').filter({hasText:'運動驗收學員'}).filter({hasText:'個可用方案'}).click();
 await page.getByRole('button',{name:'確認學員預約',exact:true}).click();
 await poll(async()=>{const rows=await db.courseBooking.findMany({where:{cardId,status:'RESERVED'}});currentBooking=rows[0];return rows.length===1;});
 await page.getByRole('button',{name:'運動驗收學員：待點名',exact:true}).waitFor();
}
async function cancel(){
 await page.getByRole('button',{name:'運動驗收學員 更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'取消本堂',exact:true}).click();
 await page.getByRole('button',{name:'確認取消並退還名額',exact:true}).click();
 await poll(async()=> (await db.courseBooking.findUniqueOrThrow({where:{id:currentBooking.id}})).status==='CANCELLED');
 await page.getByRole('button',{name:'確認取消並退還名額',exact:true}).waitFor({state:'hidden'});
}
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1366,height:900}}); page.setDefaultTimeout(60000);
 await page.goto('http://localhost:3107/hq/login?store=sports-live-flow');
 await page.getByLabel('Email',{exact:true}).fill('sports-owner@example.invalid');
 await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');
 await page.getByRole('button',{name:'登入',exact:true}).click(); await page.waitForURL(root);
 await page.goto(root+'/courses?view=customers');
 await page.getByRole('row').filter({hasText:'運動驗收學員'}).getByRole('button',{name:'購買方案',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('方案',{exact:true}).selectOption('sports-live-plan');
 await dialog.getByLabel('所屬店長',{exact:true}).selectOption('sports-live-flow-staff');
 await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');
 await dialog.getByRole('button',{name:'確認結帳',exact:true}).click();
 await poll(async()=>!!await db.coursePurchase.findFirst({where:{customerId:'sports-live-customer'}}));
 cardId=(await db.coursePurchase.findFirstOrThrow({where:{customerId:'sports-live-customer'},orderBy:{createdAt:'desc'}})).cardId;
 await page.goto(root+'/courses?session=sports-live-session');
 await page.getByRole('button',{name:'＋加入學員',exact:true}).waitFor();
 await page.evaluate(()=>{globalThis.__bookingDocumentToken=crypto.randomUUID();});
 const token=await page.evaluate(()=>globalThis.__bookingDocumentToken), initialUrl=page.url();
 const observerContext=await browser.newContext({viewport:{width:1024,height:768}});
 observer=await observerContext.newPage(); observer.setDefaultTimeout(85000);
 await observer.goto('http://localhost:3107/hq/login?store=sports-live-flow');
 await observer.getByLabel('Email',{exact:true}).fill('sports-owner@example.invalid');
 await observer.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');
 await observer.getByRole('button',{name:'登入',exact:true}).click(); await observer.waitForURL(root);
 await observer.goto(root+'/courses?session=sports-live-session');
 await observer.getByRole('button',{name:'＋加入學員',exact:true}).waitFor();
 await observer.evaluate(()=>{globalThis.__syncToken=crypto.randomUUID();});
 observerToken=await observer.evaluate(()=>globalThis.__syncToken); observerUrl=observer.url();
 async function observe(label,status,balance){
  const started=Date.now(); console.log('Waiting for idle iPad observer:',label);
  const button=observer.getByRole('button',{name:'運動驗收學員：'+status,exact:true});
  let automaticSyncMs;
  if(status==='已取消'){
   await observer.getByRole('button',{name:'已取消（1）',exact:true}).waitFor();
   await observer.getByRole('button',{name:'上課名單 1',exact:true}).waitFor();
   automaticSyncMs=Date.now()-started;
   await observer.screenshot({path:`${out}/${label}-automatic-summary-ipad.png`});
   await observer.getByRole('button',{name:'已取消（1）',exact:true}).click();
  }
  await button.waitFor();
  const row=observer.locator('li').filter({has:button});
  await row.locator('span[class*="balanceColumn"]').filter({hasText:new RegExp('^'+balance+'$')}).waitFor();
  assert.equal(await observer.evaluate(()=>globalThis.__syncToken),observerToken);
  assert.equal(observer.url(),observerUrl);
  const text=await observer.getByRole('dialog',{name:'上課名單',exact:true}).innerText();
  const occupied=status==='已取消'?1:2;
  assert.match(text,new RegExp('上課名單 '+occupied));
  results.steps.at(-1).observer={status,postClassBalance:balance,occupied,automaticSyncMs:automaticSyncMs??Date.now()-started,delayMs:Date.now()-started,urlUnchanged:true,documentReload:false,dialogText:text};
  await observer.screenshot({path:`${out}/${label}-ipad.png`});
  writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log('Observer synchronized:',label,Date.now()-started,'ms');
 }
 await reserve(); await snapshot('01-reserved','RESERVED',10); await observe('01-reserved','待點名',9);
 await page.getByRole('button',{name:'運動驗收學員：待點名',exact:true}).click();
 await poll(async()=> (await db.coursePointCard.findUniqueOrThrow({where:{id:cardId}})).remaining===9);
 await page.getByRole('button',{name:'運動驗收學員：已出席',exact:true}).waitFor();
 await snapshot('02-attended','ATTENDED',9); await observe('02-attended','已出席',9);
 await cancel(); await snapshot('03-cancelled','CANCELLED',10); await observe('03-cancelled','已取消',10);
 results.documentReload=await page.evaluate(()=>globalThis.__bookingDocumentToken)!==token;
 results.urlUnchanged=page.url()===initialUrl;
 assert.equal(results.documentReload,false); assert.equal(results.urlUnchanged,true);
 const finalEntries=results.steps.at(-1).entries;
 assert.equal(finalEntries.filter(entry=>entry.kind==='DEBIT').length,1);
 assert.equal(finalEntries.filter(entry=>entry.kind.startsWith('CORRECT:ATTENDED:CANCELLED:')).length,1);
 results.passed=true; writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));
 console.log('PASS: reservation, release, attendance debit, cancellation credit; no document reload or navigation');
} catch(error){if(observer){await observer.screenshot({path:`${out}/observer-failure.png`});writeFileSync(`${out}/observer-failure.txt`,await observer.locator('body').innerText());}if(page){await page.screenshot({path:`${out}/failure.png`});writeFileSync(`${out}/failure.txt`,String(error)+'\n'+await page.locator('body').innerText());}throw error;}
finally{await browser?.close();await db.$disconnect();}
