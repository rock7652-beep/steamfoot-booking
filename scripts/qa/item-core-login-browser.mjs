// Real Auth.js credentials, real Next Route Handlers and isolated database.
// This does not replace hosted acceptance or enable native module rollout flags.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE),{PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client'),{hashSync}=require('bcryptjs');
const db=new PrismaClient(),course=new CourseClient(),base='http://localhost:3107',out='artifacts/item-core-login';
mkdirSync(out,{recursive:true});const results=[],errors=[];let browser,lastPage;
const stores=[{key:'sports',storeId:'sports-live-flow-store',slug:'sports-live-flow',email:'sports-owner@example.invalid'},{key:'music',storeId:'ops-music',slug:'ops-music',email:'ops-music@example.invalid'},{key:'beauty',storeId:'ops-beauty',slug:'ops-beauty',email:'ops-beauty@example.invalid'}];
const save=complete=>writeFileSync(out+'/results.json',JSON.stringify({complete,scope:'actual local login and authorization; no auth adapter; native module rollout not changed',hostedAcceptance:false,results,errors},null,2));
async function login(store,staff=false){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());return ['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
 const page=await context.newPage();lastPage=page;page.setDefaultTimeout(90000);
 page.on('pageerror',error=>errors.push({store:store.key,message:error.message}));
 await page.goto(base+'/hq/login?store='+store.slug,{timeout:180000,waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:true}).fill(staff?`item-login-${store.key}-staff@example.invalid`:store.email);
 await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>!url.pathname.includes('/login'),{timeout:180000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({role:s.user?.role,storeId:s.user?.storeId})));
 assert.deepEqual(identity,{role:staff?'STAFF':'OWNER',storeId:store.storeId});
 results.push({store:store.key,step:staff?'staff-login':'owner-login',pass:true});save(false);
 return {context,page};
}
async function request(page,url,body){return page.evaluate(async({url,body})=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};},{url,body});}
try{
 for(const store of stores){
  const id='item-login-'+store.key+'-restricted';
  await db.user.upsert({where:{id},create:{id,email:`item-login-${store.key}-staff@example.invalid`,name:'無權限驗收人員',role:'STAFF',passwordHash:hashSync('isolated-sports-test-only',10)},update:{}});
  await db.staff.upsert({where:{id},create:{id,storeId:store.storeId,userId:id,displayName:'無權限驗收人員'},update:{}});
 }
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const anonymous=await browser.newContext(),anon=await anonymous.newPage();
 await anon.goto(base+'/hq/login',{timeout:180000,waitUntil:'domcontentloaded'});
 const refused=await request(anon,'/api/beauty/customer-read',{store:'ops-beauty',operation:'cash',input:null});assert.equal(refused.status,403);assert.equal(refused.body.success,false);
 results.push({step:'anonymous-protected-read-denied',pass:true});await anonymous.close();
 for(const store of stores){
  const {context,page}=await login(store);
  const path='/s/'+store.slug+'/admin/dashboard/'+(store.key==='beauty'?'beauty':'courses');
  const response=await page.goto(base+path,{timeout:180000,waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});
  assert.equal(await page.getByText('發生非預期錯誤',{exact:true}).count(),0);
  await page.screenshot({path:out+'/'+store.key+'-owner.png',fullPage:true});
  results.push({store:store.key,step:'authenticated-module-route',pass:true});
  const before=await course.courseRoom.count({where:{storeId:store.storeId}});
  const denied=store.key==='beauty'?await request(page,'/api/beauty/customer-read',{store:'ops-music',operation:'cash',input:null}):await request(page,'/api/courses/rooms',{expectedStoreId:store.key==='sports'?'ops-music':'sports-live-flow-store',requestKey:randomUUID(),name:'不得建立的跨店空間'});
  assert.equal(denied.body.success,false);assert.equal(await course.courseRoom.count({where:{storeId:store.storeId}}),before);
  results.push({store:store.key,step:'owner-cross-store-request-denied',pass:true});
  const loggedOut=await page.evaluate(async()=>{const {csrfToken}=await fetch('/api/auth/csrf').then(r=>r.json());await fetch('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken,callbackUrl:location.origin+'/hq/login'})});return fetch('/api/auth/session').then(r=>r.json()).then(s=>!s?.user);});assert.equal(loggedOut,true);
  results.push({store:store.key,step:'logout-session-cleared',pass:true});await context.close();
  const restricted=await login(store,true),roomCount=await course.courseRoom.count({where:{storeId:store.storeId}});
  const noPermission=store.key==='beauty'?await request(restricted.page,'/api/beauty/customer-read',{store:store.storeId,operation:'cash',input:null}):await request(restricted.page,'/api/courses/rooms',{expectedStoreId:store.storeId,requestKey:randomUUID(),name:'不得建立的無權限空間'});
  assert.equal(noPermission.body.success,false);assert.equal(await course.courseRoom.count({where:{storeId:store.storeId}}),roomCount);
  results.push({store:store.key,step:'restricted-staff-request-denied',pass:true});await restricted.context.close();save(false);
 }
 assert.deepEqual(errors,[]);save(true);console.log(JSON.stringify({complete:true,checks:results.length}));
}catch(error){errors.push({message:error.message});save(false);if(lastPage&&!lastPage.isClosed()){await lastPage.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});writeFileSync(out+'/failure.txt',await lastPage.locator('body').innerText().catch(()=>''));}console.error(error.message);process.exitCode=1;}
finally{await browser?.close();await db.$disconnect();await course.$disconnect();}
