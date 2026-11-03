// Real course/music credentials and store APIs against the disposable acceptance DB.
// This is Chromium touchscreen emulation, never a LINE App or physical-device pass.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assertImageAnnouncementsAcceptance, IMAGE_ACCEPTANCE_DATABASE, IMAGE_ACCEPTANCE_ORIGIN as base } from '../image-announcements-acceptance-scope.mjs';
assertImageAnnouncementsAcceptance(process.env);
const require=createRequire(import.meta.url),{chromium}=require('/opt/codex/cua_node/lib/node_modules/playwright');
const {PrismaClient}=require('@prisma/client'),{hashSync}=require('bcryptjs');
const db=new PrismaClient({datasourceUrl:IMAGE_ACCEPTANCE_DATABASE});
const out=path.resolve('artifacts/image-announcements-modules-20261020');mkdirSync(out,{recursive:true});
const results=[];let browser,current,stage='startup';
async function step(name,fn){stage=name;const data=await fn();results.push({step:name,passed:true,...data});writeFileSync(path.join(out,'progress.json'),JSON.stringify(results,null,2));console.log(name+': passed');}
async function context(){const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await c.route('**/*',r=>new URL(r.request().url()).origin===base||r.request().url().startsWith('data:')?r.continue():r.abort());return c;}
async function save(p){await p.getByRole('button',{name:'儲存',exact:true}).click();await p.getByRole('status').filter({hasText:'已儲存'}).waitFor();}
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 for(const [key,phone,profile] of [['fitness','0900000311','business.fitness'],['music','0900000312','business.music']]){
  const storeId=`image-qa-${key}`,slug=storeId,password='image-qa-only-password';
  await step(`${key}-isolated-store-setup`,async()=>{
   assert.equal(await db.store.count({where:{id:storeId}}),0,'Requires fresh module QA stores');
   await db.store.create({data:{id:storeId,slug,name:`圖片驗收 ${key}`,industryModule:'COURSE',plan:'EXPERIENCE',featureEntitlements:{create:{featureKey:profile,status:'ENABLED'}}}});
   await db.user.create({data:{id:`${storeId}-owner`,email:`${key}@example.invalid`,name:'驗收店長',role:'OWNER',passwordHash:hashSync(password,10)}});
   await db.staff.create({data:{id:`${storeId}-staff`,storeId,userId:`${storeId}-owner`,displayName:'驗收店長',isOwner:true}});
   await db.shopConfig.create({data:{storeId,shopName:`圖片驗收 ${key}`}});
   await db.user.create({data:{id:`${storeId}-user`,name:`${key} 學員`,phone,role:'CUSTOMER',passwordHash:hashSync(password,10)}});
   await db.customer.create({data:{id:`${storeId}-customer`,storeId,userId:`${storeId}-user`,phone,name:`${key} 學員`,assignedStaffId:`${storeId}-staff`}});
   return{industryModule:'COURSE',profile};
  });
  const admin=await context(),p=await admin.newPage();current=p;p.setDefaultTimeout(45000);
  await step(`${key}-owner-login-upload`,async()=>{
   await p.goto(`${base}/hq/login?store=${slug}`);await p.getByLabel('Email',{exact:true}).fill(`${key}@example.invalid`);await p.getByLabel('密碼',{exact:true}).fill(password);await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(`**/s/${slug}/admin/dashboard`);
   await p.goto(`${base}/s/${slug}/admin/dashboard/image-announcements`);await p.getByRole('heading',{name:'圖片公告',exact:true}).waitFor();
   const files=await Promise.all(['#b4cfbc','#eccda9'].map(async(fill,i)=>({name:`${key}-${i}.png`,mimeType:'image/png',buffer:await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="840" height="1188"><rect width="840" height="1188" fill="${fill}"/><text x="50" y="120" font-size="50">${key} ${i+1}</text></svg>`)).png().toBuffer()})));
   await p.locator('[data-page-shell]:visible input[type=file]').setInputFiles(files);await save(p);
   const row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId}});assert.equal(row.items.length,2);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId}}),2);return{images:2,revision:row.revision};
  });
  const member=await context(),m=await member.newPage();current=m;m.setDefaultTimeout(45000);
  await step(`${key}-real-member-login-home`,async()=>{
   await m.goto(`${base}/s/${slug}`);await m.getByLabel('手機號碼',{exact:true}).fill(phone);await m.getByRole('button',{name:'下一步',exact:true}).click();await m.getByLabel('密碼',{exact:true}).fill(password);await m.getByRole('button',{name:'登入',exact:true}).click();await m.waitForURL(`**/s/${slug}/book`);
   await m.getByRole('heading',{name:'會員首頁',exact:true}).waitFor();await m.getByRole('button',{name:'放大公告圖片',exact:true}).waitFor();
   for(const width of [360,390]){await m.setViewportSize({width,height:844});assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const size=await m.getByRole('button',{name:'放大公告圖片',exact:true}).locator('img').evaluate(async i=>{await i.decode();return {w:i.clientWidth,h:i.clientHeight,nw:i.naturalWidth,nh:i.naturalHeight};});assert.ok(size.w>=width-48);assert.ok(Math.abs(size.w/size.h-size.nw/size.nh)<.01);await m.screenshot({path:path.join(out,`${key}-home-${width}.png`),fullPage:true});}
   return{credentialsUI:true,realCoursePortal:true,widths:[360,390],noOverflow:true};
  });
  await step(`${key}-six-second-swipe-zoom-return-navigation`,async()=>{
   const dots=m.locator('[data-image-announcements]');const before=await dots.locator('[aria-current=true]').getAttribute('aria-label');await m.waitForTimeout(6500);assert.notEqual(await dots.locator('[aria-current=true]').getAttribute('aria-label'),before);
   // CDP sends actual touch events to Chromium; no DOM event dispatch or SDK fake.
   const target=m.getByRole('button',{name:'放大公告圖片',exact:true});await target.scrollIntoViewIfNeeded();const rect=await target.boundingBox();const cdp=await member.newCDPSession(m);const start=await dots.locator('[aria-current=true]').getAttribute('aria-label');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width*.8,y:rect.y+100}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x+rect.width*.2,y:rect.y+100}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.notEqual(await dots.locator('[aria-current=true]').getAttribute('aria-label'),start);assert.equal(await m.getByRole('dialog').count(),0);const swiped=await dots.locator('[aria-current=true]').getAttribute('aria-label');await m.waitForTimeout(6500);assert.equal(await dots.locator('[aria-current=true]').getAttribute('aria-label'),swiped);
   await target.tap();await m.getByRole('dialog').waitFor();await m.getByRole('button',{name:'關閉圖片',exact:true}).tap();await target.tap();await m.getByRole('dialog').waitFor();await m.getByRole('button',{name:'放大圖片',exact:true}).tap();await m.getByRole('button',{name:'縮小圖片',exact:true}).waitFor();await m.screenshot({path:path.join(out,`${key}-zoom.png`)});await m.getByRole('button',{name:'關閉圖片',exact:true}).tap();
   assert.equal(await m.getByRole('dialog').count(),0);assert.equal(await target.evaluate(e=>e===document.activeElement),true);
   const nav=m.getByRole('navigation',{name:'主要功能'});await nav.getByRole('button',{name:'我的預約',exact:true}).tap();await m.getByRole('heading',{name:'我的預約',exact:true}).waitFor();await nav.getByRole('button',{name:'首頁',exact:true}).tap();await m.getByRole('heading',{name:'會員首頁',exact:true}).waitFor();await target.waitFor();return{autoRotate6s:true,cdpTouchSwipe:true,manualPause:true,zoom:true,restoredFocus:true,bottomNavigation:true,lineApp:false};
  });
  await step(`${key}-store-isolation-and-empty-home`,async()=>{
   const row=await db.imageAnnouncementSet.findUniqueOrThrow({where:{storeId}});const other=key==='fitness'?'image-qa-a':'image-qa-fitness';assert.equal((await member.request.get(`${base}/api/image-announcements/${row.items[0].id}?store=${other}`)).status(),404);
   current=p;p.on('dialog',d=>d.accept());for(let i=0;i<2;i++){await p.getByRole('button',{name:'編輯',exact:true}).first().click();await p.getByRole('button',{name:'刪除圖片',exact:true}).click();}await save(p);assert.equal(await db.imageAnnouncementAsset.count({where:{storeId}}),0);
   current=m;await m.reload();await m.getByRole('heading',{name:'會員首頁',exact:true}).waitFor();assert.equal(await m.locator('[data-image-announcements]').count(),0);await m.getByRole('navigation',{name:'主要功能'}).getByRole('button',{name:'我的預約',exact:true}).tap();await m.getByRole('heading',{name:'我的預約',exact:true}).waitFor();return{crossStoreImage:404,emptyFrame:false,navigationUsable:true};
  });
  await admin.close();await member.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,compiledProduction:true,realPostgres:true,realCredentials:true,results,lineApp:{passed:false,status:'blocked',reason:'No test deployment, LINE device/session, or test account available; user confirmed none.'}},null,2));
}catch(error){console.error(current?.url(),await current?.locator('body').innerText());await current?.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(path.join(out,'failure.json'),JSON.stringify({stage,error:String(error),results},null,2));throw error;}finally{await browser?.close();await db.$disconnect();}
