// Existing manager preview -> actual LIFF/Course shared presentation, no API/auth/DB mocks.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {assertImageAnnouncementsAcceptance,IMAGE_ACCEPTANCE_DATABASE,IMAGE_ACCEPTANCE_ORIGIN as base} from '../image-announcements-acceptance-scope.mjs';
assertImageAnnouncementsAcceptance(process.env);
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright'),{PrismaClient}=require('@prisma/client'),{hashSync}=require('bcryptjs');
const db=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE}),out=path.resolve('artifacts/image-announcements-preview-20261020');mkdirSync(out,{recursive:true});
const results=[];let browser,current,stage='start';
async function step(name,run){stage=name;const data=await run();results.push({step:name,passed:true,...data});writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));console.log(name+': passed');}
async function save(p){await p.getByRole('button',{name:'儲存',exact:true}).click();await p.getByRole('status').filter({hasText:'已儲存'}).waitFor();}
async function ready(frame){await frame.getByText('預覽・不會儲存',{exact:true}).filter({visible:true}).waitFor();await frame.getByRole('button',{name:'放大公告圖片',exact:true}).waitFor();}
async function size(frame){return frame.locator('[data-image-announcements]').evaluate(async e=>{await Promise.all([...e.querySelectorAll('img')].map(i=>i.decode()));const r=e.getBoundingClientRect();return{width:r.width,height:r.height,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};});}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const key of ['a','fitness-preview','music-preview']){
  const storeId=`image-qa-${key}`,course=key!=='a',music=key.startsWith('music'),customerId=course?`${storeId}-customer`:'image-qa-customer-a',name=course?`${key} 學員`:'驗收顧客 a';
  await step(`${key}-prepare-preview-entitlements`,async()=>{
   if(course){assert.equal(await db.store.count({where:{id:storeId}}),0,'Requires fresh preview QA stores');await db.store.create({data:{id:storeId,slug:storeId,name:key,industryModule:'COURSE',plan:'EXPERIENCE',featureEntitlements:{create:{featureKey:music?'business.music':'business.fitness',status:'ENABLED'}}}});await db.user.create({data:{id:`${storeId}-owner`,name:'驗收店長',email:`${key}@example.invalid`,role:'OWNER',passwordHash:hashSync('image-qa-only-password',10)}});await db.staff.create({data:{id:`${storeId}-staff`,storeId,userId:`${storeId}-owner`,displayName:'驗收店長',isOwner:true}});await db.shopConfig.create({data:{storeId,shopName:key}});await db.user.create({data:{id:`${storeId}-user`,name,phone:music?'0900000322':'0900000321',role:'CUSTOMER',passwordHash:hashSync('image-qa-only-password',10)}});await db.customer.create({data:{id:customerId,storeId,userId:`${storeId}-user`,name,phone:music?'0900000322':'0900000321',assignedStaffId:`${storeId}-staff`}});}
   for(const featureKey of ['frontend_preview','device_preview'])await db.storeFeatureEntitlement.create({data:{storeId,featureKey,status:'ENABLED'}});
   return{storeId,profile:course?music?'MUSIC':'FITNESS':'STEAMFOOT'};
  });
  const context=await browser.newContext({viewport:{width:1366,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===base||r.request().url().startsWith('data:')?r.continue():r.abort());const p=await context.newPage();current=p;p.setDefaultTimeout(30000);
  await step(`${key}-real-owner-upload-and-preview-selector`,async()=>{
   await p.goto(`${base}/hq/login?store=${storeId}`);await p.getByLabel('Email',{exact:true}).fill(course?`${key}@example.invalid`:'image-owner-a@example.invalid');await p.getByLabel('密碼',{exact:true}).fill('image-qa-only-password');await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(`**/s/${storeId}/admin/dashboard`);
   await p.goto(`${base}/s/${storeId}/admin/dashboard/image-announcements`);await p.getByRole('heading',{name:'圖片公告',exact:true}).waitFor();
   const files=await Promise.all([[840,1188,'#b4cfbc'],[1188,840,'#eccda9']].map(async([w,h,fill],i)=>({name:`${key}-${i}.png`,mimeType:'image/png',buffer:await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/><text x="50" y="120" font-size="45">${key} ${i+1}</text></svg>`)).png().toBuffer()})));
   await p.locator('[data-page-shell]:visible input[type=file]').setInputFiles(files);await save(p);
   await p.goto(`${base}/s/${storeId}/admin/dashboard/frontend-preview`);await p.getByRole('heading',{name:'前台預覽',exact:true}).waitFor();await p.getByRole('button').filter({hasText:name}).click();await ready(p.frameLocator('iframe[title="唯讀前台預覽"]'));
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);return{selectedActualCustomer:true,uploadViaUI:true,desktop:1366};
  });
  let f=p.frameLocator('iframe[title="唯讀前台預覽"]');
  await step(`${key}-iframe-autoplay-mixed-ratio-zoom-and-readonly`,async()=>{
   const before=await size(f),first=await f.locator('[data-image-announcements] [aria-current=true]').getAttribute('aria-label');await p.waitForTimeout(6500);assert.notEqual(await f.locator('[data-image-announcements] [aria-current=true]').getAttribute('aria-label'),first);const after=await size(f);assert.ok(Math.abs(before.height-after.height)<=1);assert.equal(after.overflow,false);
   await f.getByRole('button',{name:'第 2 張圖片',exact:true}).click();await p.waitForTimeout(6500);assert.equal(await f.getByRole('button',{name:'第 2 張圖片',exact:true}).getAttribute('aria-current'),'true');
   const target=f.getByRole('button',{name:'放大公告圖片',exact:true});await target.scrollIntoViewIfNeeded();const y=await f.locator('body').evaluate(()=>scrollY);await target.click();await f.getByRole('dialog').waitFor();await f.getByRole('button',{name:'放大圖片',exact:true}).click();await f.getByRole('button',{name:'縮小圖片',exact:true}).waitFor();await p.screenshot({path:path.join(out,`${key}-iframe-zoom.png`)});await f.getByRole('button',{name:'關閉圖片',exact:true}).click();assert.equal(await f.getByRole('dialog').count(),0);assert.equal(await target.evaluate(e=>e===document.activeElement),true);assert.ok(Math.abs(await f.locator('body').evaluate(()=>scrollY)-y)<=2);
   const row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId}}),frameUrl=p.frames().find(x=>new URL(x.url()).pathname==='/frontend-preview')?.url();assert.ok(frameUrl);
   const denied=await context.request.post(`${base}/api/image-announcements`,{headers:{origin:base,referer:frameUrl},multipart:{storeId,revision:String(row.revision),items:'[]'}});assert.equal(denied.status(),403);assert.equal((await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId}})).revision,row.revision);await p.screenshot({path:path.join(out,`${key}-frontend-preview.png`)});
   return{autoRotate6s:true,mixedRatioStable:true,manualPause:true,zoom:true,focusAndScrollRestored:true,readonlyWrite403:true,...after};
  });
  await step(`${key}-preview-navigation-and-device-wrapper`,async()=>{
   if(course){const nav=f.getByRole('navigation',{name:'主要功能'});await nav.getByRole('button',{name:'我的預約',exact:true}).click();await f.getByRole('heading',{name:'我的預約',exact:true}).waitFor();await nav.getByRole('button',{name:'首頁',exact:true}).click();}
   else{const nav=f.getByRole('navigation',{name:'會員功能'});await nav.getByRole('link',{name:'預約',exact:true}).click();await f.getByRole('navigation',{name:'會員功能'}).locator('a[aria-current=page]').filter({hasText:'預約'}).waitFor();await f.getByRole('navigation',{name:'會員功能'}).getByRole('link',{name:'首頁',exact:true}).click();}
   await ready(f);
   await p.goto(`${base}/s/${storeId}/admin/dashboard/device-preview?page=frontend-preview&device=tablet`);await p.getByRole('heading',{name:'裝置預覽',exact:true}).waitFor();const outer=p.frameLocator('iframe[title="平板版預覽"]');await outer.getByRole('button').filter({hasText:name}).click();f=outer.frameLocator('iframe[title="唯讀前台預覽"]');await ready(f);assert.equal((await size(f)).overflow,false);await p.screenshot({path:path.join(out,`${key}-device-tablet.png`)});
   await p.getByRole('button',{name:'桌機',exact:true}).click();const desktop=p.frameLocator('iframe[title="桌機版預覽"]');await desktop.getByRole('button').filter({hasText:name}).click();await ready(desktop.frameLocator('iframe[title="唯讀前台預覽"]'));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);return{actualBottomNavigation:true,nestedDeviceIframe:true,deviceWidths:[1024,1440]};
  });
  await step(`${key}-narrow-preview-empty-and-crossstore`,async()=>{
   const previewUrl=`${base}/frontend-preview?${new URLSearchParams({storeId,personId:customerId,role:'member'})}`;await p.goto(previewUrl);for(const width of [360,390]){await p.setViewportSize({width,height:844});await ready(p);assert.equal((await size(p)).overflow,false);await p.screenshot({path:path.join(out,`${key}-preview-${width}.png`),fullPage:true});}
   const deniedPage=await context.newPage();await deniedPage.goto(`${base}/frontend-preview?storeId=image-qa-b&personId=image-qa-customer-b&role=member`);await deniedPage.getByRole('heading',{name:'404',exact:true}).waitFor();assert.equal(await deniedPage.locator('[data-image-announcements]').count(),0);assert.equal(await deniedPage.getByText('驗收顧客 b',{exact:true}).count(),0);await deniedPage.close();
   await p.setViewportSize({width:1366,height:900});await p.goto(`${base}/s/${storeId}/admin/dashboard/image-announcements`);p.on('dialog',d=>d.accept());for(let i=0;i<2;i++){await p.getByRole('button',{name:'編輯',exact:true}).first().click();await p.getByRole('button',{name:'刪除圖片',exact:true}).click();}await save(p);
   await p.goto(previewUrl);await p.getByText('預覽・不會儲存',{exact:true}).filter({visible:true}).waitFor();await p.getByRole('navigation',{name:course?'主要功能':'會員功能'}).waitFor();assert.equal(await p.locator('[data-image-announcements]').count(),0);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId}}),0);return{widths:[360,390],crossStoreDenied:true,emptyNoFrame:true};
  });
  await context.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,compiledProduction:true,realPostgres:true,realManagerLogin:true,realPreviewSelectors:true,results,limitations:['No LINE SDK authorization or LINE App/device tested','Synthetic members/images; booking and purchase writes intentionally unavailable in preview']},null,2));
}catch(error){console.error(stage,current?.url(),String(error));await current?.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(path.join(out,'failure.json'),JSON.stringify({stage,error:String(error),results},null,2));throw error;}finally{await browser?.close();await db.$disconnect();}
