import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const root=process.cwd();
const artifacts=resolve('work/isolated-acceptance');mkdirSync(artifacts,{recursive:true});
const f=JSON.parse(readFileSync(root+'/work/isolated-fixture.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const browserErrors=[];
page.on('pageerror',e=>{browserErrors.push(e.message);console.log('PAGE_ERROR',e.message);});
page.on('console',m=>{if(m.type()==='error'){browserErrors.push(m.text());console.log('CONSOLE_ERROR',m.text());}});
const httpErrors=[];
page.on('response',r=>{if(r.status()>=400){httpErrors.push({status:r.status(),url:r.url()});console.log('HTTP_ERROR',r.status(),r.url());}});
const login=await page.goto('http://localhost:3000/hq/login?store=synthetic-music',{timeout:120000});
assert.equal(login.status(),200);
console.log('LOGIN_HTTP_200');
await page.locator('input[name=email]').fill(f.email);await page.locator('input[name=password]').fill('invalid-synthetic-password');
await page.getByRole('button',{name:'登入',exact:true}).click();
await page.getByText('密碼錯誤，請重新輸入',{exact:true}).waitFor();
assert.ok(page.url().includes('/hq/login'));console.log('INVALID_PASSWORD_REFUSED');
await page.locator('input[name=email]').fill(f.email);
await page.locator('input[name=password]').fill(f.password);
await page.getByRole('button',{name:'登入',exact:true}).click();
await page.waitForURL('**/s/synthetic-music/admin/dashboard',{timeout:120000});
console.log('LOGIN_OK');

const {PrismaClient}=await import(root+'/generated/course-client/index.js');
const {env}=JSON.parse(readFileSync(root+'/work/isolated-dev.json','utf8'));
const {verifyIsolatedDevelopmentDatabase}=await import(root+'/scripts/isolated-dev-scope.mjs');
const db=new PrismaClient({datasourceUrl:env.DATABASE_URL});
await verifyIsolatedDevelopmentDatabase(db,env);
assert.equal(await db.courseBooking.count(),0,"Acceptance requires fresh synthetic fixture, not an existing booking dataset.");
const results=[];
try {
 for(const [index,frequency,time] of [[0,'WEEKLY','10:00'],[1,'BIWEEKLY','11:00'],[2,'WEEKLY','12:00']]) {
  await page.setViewportSize([{width:1440,height:1000},{width:820,height:1180},{width:1180,height:820}][index]);
  const name=['每週合成學員','隔週合成學員','待繳費合成學員'][index];
  await page.goto('http://localhost:3000/s/synthetic-music/admin/dashboard/courses?view=schedule&date=2026-11-02&action=schedule',{timeout:120000});
  await page.getByLabel('排課日期',{exact:true}).filter({visible:true}).waitFor({timeout:120000});
  await page.getByLabel('排課日期',{exact:true}).filter({visible:true}).fill('2026-11-02');
  await page.getByLabel('排課時間',{exact:true}).filter({visible:true}).fill(time);
  await page.getByLabel('排課教室',{exact:true}).filter({visible:true}).selectOption(f.roomId);
  await page.getByLabel('安排類型',{exact:true}).filter({visible:true}).selectOption('fixed');
  await page.getByLabel('固定課程頻率',{exact:true}).filter({visible:true}).selectOption(frequency);
  const search=page.getByLabel('搜尋排課學員',{exact:true}).filter({visible:true});await search.waitFor();
  await search.fill(name);
  await page.getByRole('button',{name:new RegExp(name)}).filter({visible:true}).click();
  await page.getByLabel('課程',{exact:true}).filter({visible:true}).selectOption(`teaching:${f.subjectId}`);
  await page.getByLabel('授課老師',{exact:true}).filter({visible:true}).selectOption(f.staffId);
  const save=page.getByRole('button',{name:'新增',exact:true});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='新增'&&!b.disabled),null,{timeout:60000});
  const preview=await page.getByLabel(`${name}逐堂檢查`,{exact:true}).filter({visible:true}).innerText();
  console.log('PREVIEW',frequency,name,preview);
  await page.screenshot({path:`${artifacts}/desktop-preview-${index}.png`,fullPage:true});
  await save.evaluate(b=>{b.click();b.click();});
  for(let i=0;i<60;i++) {
   const count=await db.courseBooking.count({where:{storeId:f.storeId,customerId:f.learners[index].customerId}});
   if(count===4)break;
   if(i===59)throw new Error('Create did not produce exactly four bookings: '+(await page.locator('body').innerText()).slice(-1800));
   await page.waitForTimeout(500);
  }
  const bookings=await db.courseBooking.findMany({where:{storeId:f.storeId,customerId:f.learners[index].customerId},include:{session:true},orderBy:{session:{startsAt:'asc'}}});
  const remaining=f.learners[index].cardId?(await db.coursePointCard.findUnique({where:{id:f.learners[index].cardId}})).remaining:null;
  assert.deepEqual(bookings.map(b=>b.bookingKind),[['CARD','CARD','CARD','UNPAID'],['CARD','UNPAID','UNPAID','UNPAID'],['UNPAID','UNPAID','UNPAID','UNPAID']][index]);
  assert.equal(remaining,[3,4,null][index]);
  assert.equal(new Set(bookings.map(b=>b.session.requestKey)).size,1);
  assert.deepEqual(bookings.slice(1).map((b,i)=>(+b.session.startsAt-+bookings[i].session.startsAt)/86400000),[1,2,3].map(()=>frequency==='WEEKLY'?7:14));
  const receipt={name,frequency,preview,remaining,bookings:bookings.map(b=>({id:b.id,date:b.session.startsAt.toISOString(),kind:b.bookingKind,cost:b.pointCost,status:b.status})),seriesCount:await db.courseScheduleSeries.count({where:{storeId:f.storeId,requestKey:bookings[0].session.requestKey}})};
  console.log('DATABASE_AFTER_DOUBLE_CREATE',JSON.stringify(receipt));
  assert.equal(receipt.seriesCount,1);results.push(receipt);
 }
 writeFileSync(artifacts+'/flow-results.json',JSON.stringify(results,null,2));
 const receipts=[];
 for(const [index,ordinal] of [[0,0],[1,1],[2,0]]) {
  const name=['每週合成學員','隔週合成學員','待繳費合成學員'][index];
  const rows=await db.courseBooking.findMany({where:{storeId:f.storeId,customerId:f.learners[index].customerId},orderBy:{session:{startsAt:'asc'}}});const row=rows[ordinal];
  await page.goto(`http://localhost:3000/s/synthetic-music/admin/dashboard/courses?view=schedule&date=${row.sessionId===rows[0].sessionId?'2026-11-02':'2026-11-16'}&action=booking&session=${row.sessionId}`,{timeout:120000});
  const button=page.getByRole('button',{name:new RegExp(name+'：(點名|待點名)')}).filter({visible:true});await button.waitFor({timeout:30000});
  let replayed=false;const network=[];
  const handler=async route=>{
   const request=route.request();
   if(!replayed&&request.method()==='POST'&&request.headers()['next-action']&&request.postData()?.includes(row.id)&&request.postData()?.includes('ATTENDED')) {
    replayed=true;
    // A replay is a separate HTTP request; give Next's dev debug stream its
    // own transport identity while retaining the exact same business payload.
    const responses=await Promise.all([route.fetch(),route.fetch({headers:{...request.headers(),'x-nextjs-request-id':randomUUID()}})]);network.push(...responses.map(r=>r.status()));
    await route.fulfill({response:responses[0]});
   } else await route.continue();
  };
  await page.route('**/s/synthetic-music/admin/dashboard/courses?**',handler);
  const before=f.learners[index].cardId?(await db.coursePointCard.findUnique({where:{id:f.learners[index].cardId}})).remaining:null;
  await button.evaluate(b=>{b.click();b.click();});
  for(let i=0;i<60;i++) {if((await db.courseBooking.findUnique({where:{id:row.id}})).status==='ATTENDED')break;if(i===59)throw new Error('Attendance did not commit: '+(await page.locator('body').innerText()).slice(-1800));await page.waitForTimeout(500);}
  await page.getByRole('button',{name:name+'：已出席',exact:true}).filter({visible:true}).waitFor({timeout:30000});
  await page.unroute('**/s/synthetic-music/admin/dashboard/courses?**',handler);
  const after=f.learners[index].cardId?(await db.coursePointCard.findUnique({where:{id:f.learners[index].cardId}})).remaining:null;
  const debits=await db.coursePointEntry.findMany({where:{bookingId:row.id,kind:{startsWith:'DEBIT'}}});
  assert.equal(replayed,true);assert.deepEqual(network,[200,200]);
  assert.equal(after,index===0?before-1:before);assert.equal(debits.length,index===0?1:0);
  const receipt={name,kind:row.bookingKind,before,after,debitEntries:debits.length,simultaneousHttpStatuses:network,status:'ATTENDED'};console.log('ATTENDANCE_PASS',JSON.stringify(receipt));receipts.push(receipt);
  for(const [label,width,height] of [['desktop',1440,1000],['ipad-portrait',820,1180],['ipad-landscape',1180,820]]) {
   await page.setViewportSize({width,height});await page.waitForTimeout(400);
   const layout=await page.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('[role=dialog]')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const b=e.getBoundingClientRect();return {x:b.x,width:b.width,right:b.right};})}));
   assert.ok(layout.documentWidth<=width+1,'document horizontal overflow');assert.ok(layout.dialogs.every(d=>d.x>=-1&&d.right<=width+1),'dialog outside viewport');
   await page.screenshot({path:`${artifacts}/${label}-attendance-${index}.png`,fullPage:true});console.log('VIEWPORT_PASS',index,label,JSON.stringify(layout));
  }
 }
 writeFileSync(artifacts+'/attendance-results.json',JSON.stringify(receipts,null,2));

 writeFileSync(artifacts+'/browser-errors.json',JSON.stringify(browserErrors,null,2));
 assert.deepEqual(httpErrors,[]);
 assert.deepEqual(browserErrors,[]);
 console.log('BROWSER_ACCEPTANCE_COMPLETE');
} catch(e) {console.log('FAILURE_BODY',(await page.locator('body').innerText()).slice(-4000));await page.screenshot({path:artifacts+'/failure.png',fullPage:true});throw e;}
finally{await db.$disconnect();await browser.close();}
