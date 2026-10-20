// Real browser -> authenticated Next routes -> disposable PostgreSQL. No route mocks.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assertImageAnnouncementsAcceptance, IMAGE_ACCEPTANCE_DATABASE, IMAGE_ACCEPTANCE_ORIGIN as base } from '../image-announcements-acceptance-scope.mjs';
assertImageAnnouncementsAcceptance(process.env);
const require=createRequire(import.meta.url),{chromium,request}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE});
const out=path.resolve('artifacts/image-announcements-live-20261020');mkdirSync(out,{recursive:true});
const rolesOnly=process.argv.includes('--roles-only');
const results=rolesOnly?JSON.parse(readFileSync(path.join(out,'progress.json'),'utf8')):[],contexts=[];
if(rolesOnly && (results.length!==13 || !results.every(row=>row.passed)))throw Error('Role-only resume requires 13 completed flow steps in this same dedicated environment');let browser,current,stage='startup';
async function step(name,run){stage=name;const result=await run();results.push({step:name,passed:true,...result});writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));console.log(name+': passed');}
async function context(viewport={width:1366,height:900}){
 const c=await browser.newContext({viewport});contexts.push(c);
 await c.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===base||url.protocol==='data:'?route.continue():route.abort();});
 return c;
}
async function owner(key,emailKey=key){const c=await context(),p=await c.newPage();p.setDefaultTimeout(90000);current=p;p.on('response',r=>{if(r.status()>=300&&r.status()<400)console.log(JSON.stringify({redirect:r.url(),status:r.status(),location:r.headers()['location']}));});await p.goto(`${base}/hq/login?store=image-qa-${key}`);await p.getByLabel('Email',{exact:true}).fill(`image-owner-${emailKey}@example.invalid`);await p.getByLabel('密碼',{exact:true}).fill('image-qa-only-password');await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(`**/s/image-qa-${key}/admin/dashboard`);await p.goto(`${base}/s/image-qa-${key}/admin/dashboard/image-announcements`);await p.getByRole('heading',{name:'圖片公告',exact:true}).waitFor();return{context:c,page:p};}
async function save(page){await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'已儲存'}).waitFor();}
const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1188"><rect width="840" height="1188" fill="#b4cfbc"/><text x="60" y="140" font-size="54">Monthly schedule</text></svg>')).png().toBuffer();
let a,b,member,ids=[];const publicApi=await request.newContext({baseURL:base});
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 if(!rolesOnly){
 await step('database-direct-access-restricted',async()=>{
   const access=await db.$queryRawUnsafe(`SELECT relname AS name, relrowsecurity AS rls, has_table_privilege('anon', oid, 'SELECT') AS anon, has_table_privilege('authenticated', oid, 'SELECT') AS authenticated FROM pg_class WHERE relname IN ('ImageAnnouncementSet','ImageAnnouncementAsset')`);
   assert.equal(access.length,2);for(const row of access){assert.equal(row.rls,true);assert.equal(row.anon,false);assert.equal(row.authenticated,false);}
   for(const role of ['anon','authenticated'])await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE '+role);await tx.$queryRawUnsafe('SELECT * FROM "ImageAnnouncementAsset"');}),/permission denied/);
   return{rls:true,anonymousDirectReadDenied:true,authenticatedDirectReadDenied:true};
 });
 await step('real-owner-login-and-empty-manager',async()=>{a=await owner('a');assert.equal(await a.page.getByText('顯示模組',{exact:true}).count(),0);assert.equal(await a.page.getByText('尚未上傳圖片',{exact:true}).filter({visible:true}).count(),1);return{login:'credentials UI',store:'image-qa-a'};});
 await step('real-image-upload-and-database-persistence',async()=>{await a.page.locator('[data-page-shell]:visible input[type=file]').setInputFiles([{name:'schedule.png',mimeType:'image/png',buffer:image},{name:'hours.png',mimeType:'image/png',buffer:image}]);await save(a.page);const row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}});assert.equal(row.items.length,2);assert.equal(row.revision,1);ids=row.items.map(i=>i.id);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),2);await a.page.screenshot({path:path.join(out,'admin-uploaded.png'),fullPage:true});return{revision:row.revision,images:row.items.length};});
 await step('public-api-and-actual-jpeg-response',async()=>{const list=await publicApi.get('/api/image-announcements/list?store=image-qa-a');assert.equal(list.status(),200);assert.equal((await list.json()).items.length,2);const asset=await publicApi.get(`/api/image-announcements/${ids[0]}?store=image-qa-a`);assert.equal(asset.status(),200);assert.equal(asset.headers()['content-type'],'image/jpeg');assert.equal(asset.headers()['cache-control'],'no-store');assert.ok((await asset.body()).length>100);return{list:200,image:200};});
 await step('other-store-isolation-and-forged-write-rejected',async()=>{b=await owner('b');assert.equal(await b.page.getByText('尚未上傳圖片',{exact:true}).filter({visible:true}).count(),1);assert.deepEqual((await(await publicApi.get('/api/image-announcements/list?store=image-qa-b')).json()).items,[]);assert.equal((await publicApi.get(`/api/image-announcements/${ids[0]}?store=image-qa-b`)).status(),404);const response=await b.context.request.post(`${base}/api/image-announcements`,{headers:{origin:base},multipart:{storeId:'image-qa-a',revision:'1',items:'[]'}});assert.equal(response.status(),403);assert.equal((await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}})).revision,1);return{crossStoreRead:404,crossStoreWrite:403};});
 await step('real-customer-login-and-homepage-data',async()=>{const c=await context({width:390,height:844});member=await c.newPage();current=member;member.setDefaultTimeout(90000);await member.goto(`${base}/s/image-qa-a`);await member.getByLabel('手機號碼',{exact:true}).fill('0900000301');await member.getByRole('button',{name:'下一步',exact:true}).click();await member.getByLabel('密碼',{exact:true}).fill('image-qa-only-password');await member.getByRole('button',{name:'登入',exact:true}).click();await member.waitForURL('**/s/image-qa-a/book');await member.getByRole('button',{name:'放大公告圖片',exact:true}).waitFor();const size=await member.getByRole('button',{name:'放大公告圖片',exact:true}).locator('img').evaluate(async img=>{await img.decode();return{width:img.clientWidth,height:img.clientHeight,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight};});assert.ok(size.width>300);assert.ok(Math.abs(size.width/size.height-size.naturalWidth/size.naturalHeight)<.01);assert.equal(await member.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await member.screenshot({path:path.join(out,'member-full-image.png'),fullPage:true});return{realCustomerLogin:true,...size};});
 await step('homepage-six-second-carousel-and-modal',async()=>{const first=await member.locator('[data-image-announcements] [aria-current="true"]').getAttribute('aria-label');await member.waitForTimeout(6500);assert.notEqual(await member.locator('[data-image-announcements] [aria-current="true"]').getAttribute('aria-label'),first);await member.getByRole('button',{name:'第 2 張圖片'}).click();await member.waitForTimeout(6500);assert.equal(await member.getByRole('button',{name:'第 2 張圖片'}).getAttribute('aria-current'),'true');await member.getByRole('button',{name:'放大公告圖片',exact:true}).click();await member.getByRole('dialog').waitFor();await member.getByRole('button',{name:'放大圖片',exact:true}).click();await member.getByRole('button',{name:'縮小圖片',exact:true}).waitFor();await member.getByRole('button',{name:'關閉圖片',exact:true}).click();assert.equal(await member.getByRole('dialog').count(),0);await member.getByRole('button',{name:'開啟選單',exact:true}).click();await member.locator('a:visible').filter({hasText:'預約與方案'}).first().click();await member.waitForURL('**/s/image-qa-a/my-bookings');await member.goto(`${base}/s/image-qa-a/book`);await member.getByRole('button',{name:'放大公告圖片'}).waitFor();return{autoplay:true,manualPause:true,zoom:true,close:true,realNavigation:true};});
 await step('sort-and-replace-images-with-real-saves',async()=>{current=a.page;await a.page.getByRole('button',{name:'下移第 1 張圖片'}).click();await save(a.page);let row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}});assert.equal(row.items[0].id,ids[1]);await a.page.getByRole('button',{name:'編輯',exact:true}).first().click();await a.page.getByRole('button',{name:'更換圖片',exact:true}).click();await a.page.locator('[data-page-shell]:visible input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:image});await save(a.page);row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}});assert.notEqual(row.items[0].id,ids[1]);assert.equal(await db.imageAnnouncementAsset.count({where:{id:ids[1]}}),0);ids=row.items.map(i=>i.id);return{sortPersisted:true,replacedAssetRemoved:true};});
 await step('schedule-and-disable-hide-public-assets',async()=>{await a.page.getByRole('button',{name:'編輯',exact:true}).first().click();await a.page.getByLabel('第 1 張上架日期').fill('2099-01-01');await save(a.page);await a.page.getByRole('button',{name:'編輯',exact:true}).nth(1).click();await a.page.getByLabel('啟用',{exact:true}).uncheck();await save(a.page);assert.deepEqual((await(await publicApi.get('/api/image-announcements/list?store=image-qa-a')).json()).items,[]);for(const id of ids)assert.equal((await publicApi.get(`/api/image-announcements/${id}?store=image-qa-a`)).status(),404);await member.reload();await member.getByRole('button',{name:'開啟選單',exact:true}).waitFor();assert.equal(await member.locator('[data-image-announcements]').count(),0);await member.screenshot({path:path.join(out,'member-empty-announcements.png'),fullPage:true});return{futureHidden:true,disabledHidden:true,noEmptyFrame:true};});
 await step('expired-images-hidden-and-owner-preview-authorized',async()=>{
   await a.page.getByRole('button',{name:'編輯',exact:true}).first().click();await a.page.getByLabel('第 1 張上架日期').fill('');await a.page.getByLabel('第 1 張下架日期').fill('2000-01-01');await save(a.page);
   assert.deepEqual((await(await publicApi.get('/api/image-announcements/list?store=image-qa-a')).json()).items,[]);
   assert.equal((await publicApi.get(`/api/image-announcements/${ids[0]}?store=image-qa-a`)).status(),404);
   assert.equal((await publicApi.get(`/api/image-announcements/${ids[0]}?store=image-qa-a&preview=1`)).status(),404);
   assert.equal((await a.context.request.get(`${base}/api/image-announcements/${ids[0]}?store=image-qa-a&preview=1`)).status(),200);
   return{expiredHidden:true,anonymousPreviewDenied:true,ownerPreview:200};
 });
 await step('five-image-cap-with-real-upload',async()=>{
   await a.page.locator('[data-page-shell]:visible input[type=file]').setInputFiles(Array.from({length:3},(_,i)=>({name:`extra-${i}.png`,mimeType:'image/png',buffer:image})));await save(a.page);
   assert.equal((await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}})).items.length,5);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),5);
   assert.equal(await a.page.getByRole('button',{name:'＋上傳圖片'}).isDisabled(),true);return{images:5,capEnforced:true};
 });
 await step('concurrent-editor-conflict-preserves-draft',async()=>{
   const stale=await a.context.newPage();stale.setDefaultTimeout(90000);await stale.goto(`${base}/s/image-qa-a/admin/dashboard/image-announcements`);await stale.getByRole('button',{name:'編輯',exact:true}).first().click();await stale.getByLabel('第 1 張下架日期').fill('2030-01-01');
   await a.page.getByRole('button',{name:'編輯',exact:true}).first().click();await a.page.getByLabel('第 1 張下架日期').fill('2001-01-01');await save(a.page);
   const before=(await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}})).revision;
   await stale.getByRole('button',{name:'儲存',exact:true}).click();await stale.getByRole('alert').filter({hasText:'其他人更新'}).waitFor();assert.equal(await stale.getByLabel('第 1 張下架日期').inputValue(),'2030-01-01');assert.equal((await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}})).revision,before);await stale.close();
   for(const viewport of [{width:1024,height:768},{width:768,height:1024}]){await a.page.setViewportSize(viewport);assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await a.page.screenshot({path:path.join(out,`admin-${viewport.width}.png`),fullPage:true});}
   return{staleWriteRejected:true,draftPreserved:true,ipadViewport:true};
 });
 await step('delete-images-and-remove-assets-atomically',async()=>{a.page.on('dialog',d=>d.accept());for(let i=0;i<5;i++){await a.page.getByRole('button',{name:'編輯',exact:true}).first().click();await a.page.getByRole('button',{name:'刪除圖片',exact:true}).click();}await save(a.page);assert.equal((await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}})).items.length,0);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),0);return{images:0,assets:0};});
 }
 await step('manager-publish-and-staff-read-only-authorization',async()=>{
   const {hashSync}=require('bcryptjs');
   for(const [key,role] of [['manager','MANAGER'],['staff','STAFF']]){
     const userId=`image-qa-${key}-a`,staffId=`image-qa-${key}-staff-a`;
     await db.user.upsert({where:{id:userId},create:{id:userId,name:`驗收 ${role}`,email:`image-owner-${key}@example.invalid`,role,passwordHash:hashSync('image-qa-only-password',10)},update:{}});
     await db.staff.upsert({where:{id:staffId},create:{id:staffId,storeId:'image-qa-a',userId,displayName:`驗收 ${role}`,isOwner:false},update:{}});
     // Ordinary staff creation materializes grants in StaffPermission; role
     // names alone do not grant access. Seed only this acceptance's permissions.
     await db.staffPermission.createMany({data:['booking.read','customer.read','wallet.read','business_hours.view','business_hours.manage'].map(permission=>({staffId,permission,granted:permission!=='business_hours.manage'||role==='MANAGER'})),skipDuplicates:true});
   }
   const manager=await owner('a','manager');current=manager.page;
   await manager.page.locator('[data-page-shell]:visible input[type=file]').setInputFiles({name:'manager-upload.png',mimeType:'image/png',buffer:image});await save(manager.page);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),1);
   const staff=await owner('a','staff');assert.equal(await staff.page.getByRole('button',{name:'＋上傳圖片'}).count(),0);assert.equal(await staff.page.getByRole('button',{name:'編輯',exact:true}).count(),0);
   const row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId:'image-qa-a'}});
   const denied=await staff.context.request.post(`${base}/api/image-announcements`,{headers:{origin:base},multipart:{storeId:'image-qa-a',revision:String(row.revision),items:'[]'}});assert.equal(denied.status(),403);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),1);
   manager.page.on('dialog',d=>d.accept());await manager.page.getByRole('button',{name:'編輯',exact:true}).click();await manager.page.getByRole('button',{name:'刪除圖片',exact:true}).click();await save(manager.page);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId:'image-qa-a'}}),0);
   return{managerPublish:true,managerDelete:true,staffReadOnly:true,staffWrite:403};
 });
 writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,realNext:true,realCredentialsLogin:true,realPostgres:true,exactMigration:true,results,limitations:['Real LINE SDK/app and physical iPad/Safari not verified','No cloud deployment performed; standalone local production build recorded separately']},null,2));
}catch(error){if(current)await current.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(path.join(out,'failure.json'),JSON.stringify({stage,error:String(error),results},null,2));throw error;}finally{await publicApi.dispose();await browser?.close();await db.$disconnect();}
