// Real application, normal owner login, isolated PostgreSQL and synthetic images only.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE),{PrismaClient}=require('@prisma/client'),{PrismaClient:Course}=require('../../generated/course-client'),{PrismaClient:Beauty}=require('../../generated/beauty-client'),sharp=require('sharp');
const db=new PrismaClient(),course=new Course(),beauty=new Beauty();
const stores=[{key:'steam',sid:'ops-steam',slug:'ops-steam',email:'ops-steam@example.invalid'},{key:'beauty',sid:'ops-beauty',slug:'ops-beauty',email:'ops-beauty@example.invalid'},{key:'music',sid:'store-lubymusic',slug:'grid-music',email:'grid-music-owner@example.invalid'},{key:'sports',sid:'sports-live-flow-store',slug:'sports-live-flow',email:'sports-owner@example.invalid'}].filter(s=>!process.argv[2]||s.key===process.argv[2]);
const out='artifacts/member-front-density-20261111';mkdirSync(out,{recursive:true});
const report={environment:'Real local app, normal owner login, dedicated loopback PostgreSQL; synthetic images. Image delivery is deliberately held and then continued to the real server.',productionWrites:false,deployed:false,modules:[],errors:[]};
const save=()=>writeFileSync(out+'/results'+(process.argv[2]?'-'+process.argv[2]:'')+'.json',JSON.stringify(report,null,2));
const present=await db.$queryRaw`SELECT to_regclass('public."ImageAnnouncementSet"')::text AS present`;
if(!present[0].present){const {Client}=require('pg'),sql=new Client({connectionString:process.env.DATABASE_URL});await sql.connect();await sql.query(readFileSync('prisma/migrations/20261020100000_image_announcements/migration.sql','utf8'));await sql.end();}
for(const s of stores){
 const store=await db.store.findUniqueOrThrow({where:{id:s.sid},select:{slug:true}});assert.equal(store.slug,s.slug);
 const images=[];
 for(let n=0;n<2;n++){const id='11111111-1111-4111-8111-'+String(['steam','beauty','music','sports'].indexOf(s.key)*2+n+1).padStart(12,'0'),content=await sharp({create:{width:n?600:300,height:n?300:600,channels:3,background:n?'#dce8d8':'#527962'}}).png().toBuffer();await db.imageAnnouncementAsset.upsert({where:{id},create:{id,storeId:s.sid,content,mimeType:'image/png'},update:{content}});images.push({id,enabled:true,startsOn:'',endsOn:'',displayMode:'original'});}
 await db.imageAnnouncementSet.upsert({where:{storeId:s.sid},create:{storeId:s.sid,items:images,revision:1},update:{items:images,revision:{increment:1}}});
 const id='front-history-'+s.key,createdAt=new Date('2026-01-01T02:00:00Z'),expiresAt=new Date('2026-02-01T15:59:59Z');
 if(s.key==='steam'){
  const base=await db.customerPlanWallet.findUniqueOrThrow({where:{id:'grid-real-steam'}});await db.customerPlanWallet.upsert({where:{id},create:{...base,id,status:'EXPIRED',createdAt,startDate:createdAt,expiryDate:expiresAt,totalSessions:10,remainingSessions:10,sessions:{create:Array.from({length:10},(_,n)=>({sessionNo:n+1}))}},update:{}});
 }else if(s.key==='beauty'){
  const base=await beauty.beautyCard.findUniqueOrThrow({where:{id:'grid-real-beauty'}});await beauty.beautyCard.upsert({where:{id},create:{...base,id,name:'歷史驗收方案',remaining:10,sessions:10,createdAt,expiresAt,closedAt:null},update:{}});if(!await beauty.beautyLedger.findFirst({where:{cardId:id}}))await beauty.beautyLedger.create({data:{storeId:s.sid,cardId:id,kind:'PURCHASE',delta:10,actorUserId:(await db.user.findUniqueOrThrow({where:{email:s.email}})).id}});
 }else{
  const base=await course.coursePointCard.findUniqueOrThrow({where:{id:'grid-real-'+s.key}});await course.coursePointCard.upsert({where:{id},create:{...base,id,nameSnapshot:'歷史驗收方案',requestKey:id,remaining:10,createdAt,expiresAt,closedAt:null,members:{create:{customerId:s.sid+'-customer'}}},update:{}});if(!await course.coursePointEntry.findFirst({where:{cardId:id}}))await course.coursePointEntry.create({data:{storeId:s.sid,cardId:id,kind:'GRANT',points:10,actorUserId:(await db.user.findUniqueOrThrow({where:{email:s.email}})).id}});
 }
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let last;
try{
 for(const s of stores){
  const context=await browser.newContext({viewport:{width:390,height:844}}),p=await context.newPage();last=p;const result={module:s.key,checks:[],timings:[]};report.modules.push(result);p.on('pageerror',e=>report.errors.push({module:s.key,error:String(e)}));
  await p.goto('http://localhost:3107/hq/login?store='+s.slug,{timeout:180000});await p.getByLabel('Email',{exact:true}).fill(s.email);await p.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>!u.pathname.includes('/login'),{timeout:180000});
  const session=await context.request.get('http://localhost:3107/api/auth/session'),sessionData=await session.json(),identity={role:sessionData.user?.role,storeId:sessionData.user?.storeId};assert.deepEqual(identity,{role:'OWNER',storeId:s.sid});
  let release;const held=new Promise(r=>{release=r;});let lists=0,progress=0;
  p.on('request',r=>{if(r.url().includes('/api/image-announcements/list'))lists++;if(r.url().includes('/preview-details?')&&r.url().includes('kind=progress'))progress++;});
  await p.route('**/api/image-announcements/*',async route=>{if(!route.request().url().includes('/list?'))await held;await route.continue();});
  const href='http://localhost:3107/frontend-preview?'+new URLSearchParams({storeId:s.sid,personId:s.sid+'-customer',role:'member'}),start=performance.now();
  await p.goto(href,{waitUntil:'commit',timeout:180000});const hero=p.locator('[data-image-announcements]');await hero.waitFor({timeout:120000});
  assert.equal(await hero.locator('img').count(),2);assert.equal(lists,0);const before=await hero.boundingBox();assert.ok(before.height>100);release();await hero.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0?undefined:new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;}));const after=await hero.boundingBox();assert.ok(Math.abs(before.height-after.height)<1);result.checks.push('server-provided-announcements-no-list-fetch-and-no-height-shift-after-image-load');result.timings.push({scenario:'first-home-with-images',ms:Math.round(performance.now()-start),includesDevelopmentCompilation:true});await p.screenshot({path:out+'/'+s.key+'-home-390.png',fullPage:true});
  if(s.key!=='steam'){
   await p.getByRole('button',{name:'我的',exact:true}).click();const planButton=p.getByRole('button',{name:s.key==='beauty'?'我的方案 ›':/^課程與繳費/});await planButton.click();await p.locator('article.cp-plan [data-lesson-slot]').first().waitFor({timeout:30000});
   if(s.key==='beauty'){assert.equal(progress,0);assert.equal(await p.getByText('讀取使用紀錄中…',{exact:true}).count(),0);result.checks.push('beauty-first-plans-view-uses-initial-authorized-grid-with-no-progress-fetch');}
   const toggle=p.getByRole('button',{name:/^歷史方案（/});assert.equal(await toggle.count(),1);const active=p.locator('[data-plan-group=active] article.cp-plan');assert.ok(await active.count()>0);const count=await active.count();assert.equal(await toggle.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('[data-plan-group=active] article:last-child'))&Node.DOCUMENT_POSITION_PRECEDING)),true);await toggle.click();await p.locator('[data-plan-group=history] article.cp-plan').first().waitFor();assert.equal(await active.count(),count);result.checks.push('history-control-follows-active-plans-and-expansion-preserves-active');
   await p.screenshot({path:out+'/'+s.key+'-plans-390.png',fullPage:true});
   if(s.key==='music'||s.key==='sports'){
    await p.getByRole('button',{name:'課表',exact:true}).click();const toolbar=p.locator('.cp-calendar-toolbar').first();await toolbar.waitFor();const month=await toolbar.locator('.cp-month').boundingBox(),today=await toolbar.getByRole('button',{name:'今天',exact:true}).boundingBox();assert.ok(Math.abs(month.y-today.y)<8);result.checks.push('month-arrows-and-today-share-one-row-at-390');await p.screenshot({path:out+'/'+s.key+'-calendar-390.png',fullPage:true});
   }
  }else{
   await p.goto(href+'&view=wallets',{waitUntil:'commit',timeout:120000});await p.locator('[data-lesson-slot]').first().waitFor({timeout:30000});result.checks.push('steam-grid-and-history-below-active-plans');
  }
  if(s.key==='beauty'){
   await p.getByRole('button',{name:'我的預約',exact:true}).click();await p.getByRole('button',{name:'歷史紀錄',exact:true}).click();
   const rows=p.locator('[data-customer-booking-row]');
   if(await rows.count()){assert.ok(await rows.locator('summary').count()<await rows.count()+1);await p.screenshot({path:out+'/beauty-history-390.png',fullPage:true});result.checks.push('real-booking-history-renders-compact-list');}
   await p.getByRole('button',{name:'預約',exact:true}).click();const form=p.locator('.beauty-member-booking');await form.waitFor();
   for(const width of [390,768]){await p.setViewportSize({width,height:900});const field=form.getByRole('combobox',{name:'服務項目 1',exact:true});assert.ok((await field.boundingBox()).height>=44);const option=await field.locator('option:checked').textContent();assert.ok(!/分鐘\s*·\s*\d+分鐘/.test(option));await p.screenshot({path:out+'/beauty-booking-'+width+'.png',fullPage:true});}result.checks.push('beauty-booking-compact-form-retains-44px-controls');
  }
  for(const width of [390,768,1366]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:out+'/'+s.key+'-final-'+width+'.png',fullPage:true});}result.checks.push('no-document-overflow-390-768-1366');save();await context.close();console.log(s.key,'passed');
 }
 assert.deepEqual(report.errors,[]);report.complete=true;save();
}catch(e){report.complete=false;report.failure=String(e);save();if(last)await last.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
