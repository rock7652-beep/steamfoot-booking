// Real hosted Preview acceptance. Temporary auth/access files are never exported.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url), {chromium}=require('playwright');
const base=process.env.QA_PREVIEW_BASE||'https://steamfoot-booking-mfayhyzi2-rock7652-2111s-projects.vercel.app';
assert.match(base,/^https:\/\/steamfoot-booking-[a-z0-9]+-rock7652-2111s-projects\.vercel\.app$/);
const deployment=process.env.QA_DEPLOYMENT_ID||'dpl_Aeu84Pf2tehBfWWYUW3p8PLaPNgs';
assert.match(deployment,/^dpl_[A-Za-z0-9]+$/);
const access=JSON.parse(readFileSync('/tmp/youngsky-hosted-access.json','utf8'));
const credentials=JSON.parse(readFileSync('/tmp/youngsky-hosted-credentials.json','utf8'));
assert.equal(new URL(access.url).origin,base);
const out=process.env.QA_OUTPUT||'artifacts/youngsky-settings-hosted-20261021';mkdirSync(out,{recursive:true});
const errors=[],results=[],screens=[],network=[];let browser,loggedIn=false;
function persist(complete=false){writeFileSync(`${out}/results.json`,JSON.stringify({complete,scope:'isolated hosted Vercel Preview; temporary synthetic owner; not production',deployment,results,screens,errors,network},null,2));}
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1366,height:900}}),page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>{if(loggedIn){errors.push({message:error.message,stack:error.stack});persist();}});
 page.on('console',message=>{if(loggedIn&&message.type()==='error')errors.push({console:message.text()});});
 await page.goto(access.url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.goto(base+'/hq/login?store=sports-live-flow',{waitUntil:'domcontentloaded',timeout:90000});
 await page.getByLabel('Email',{exact:true}).fill(credentials.email);await page.getByLabel('密碼',{exact:true}).fill(credentials.password);
 await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:90000});loggedIn=true;
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({storeId:s?.user?.storeId,role:s?.user?.role})));
 assert.equal(identity.storeId,'sports-live-flow-store');assert.equal(identity.role,'OWNER');console.log('Authenticated isolated synthetic owner');

 async function open(item,navigate=true){
  if(navigate)await page.goto(base+`/s/sports-live-flow/admin/dashboard/courses?view=settings&section=${item.section}`,{waitUntil:'domcontentloaded',timeout:90000});
  const row=page.locator('section').filter({has:page.getByRole('heading',{name:item.title,exact:true})}).last();
  await row.getByRole('button',{name:'修改',exact:true}).click();
  return item.form?page.getByRole('form',{name:item.form,exact:true}):row;
 }
 async function save(form,item,value,label){
  await form.getByLabel(item.field,{exact:true}).fill(value);
  await form.getByLabel(item.field,{exact:true}).evaluate(node=>{window.__youngskyUi={startedAt:null,closedAt:null};const section=node.closest('section');const button=[...section.querySelectorAll('button')].find(el=>el.textContent==='儲存'||el.textContent==='儲存體驗設定');button.addEventListener('click',()=>{window.__youngskyUi.startedAt=performance.now();},{once:true});const observer=new MutationObserver(()=>{if(window.__youngskyUi.startedAt!==null&&(!node.isConnected||node.closest('[hidden]'))){window.__youngskyUi.closedAt=performance.now();observer.disconnect();}});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});});
  const started=performance.now(),responsePromise=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/settings-save/'+(item.endpoint||'course/section')));
  await form.getByRole('button',{name:item.saveName||'儲存',exact:true}).click();const response=await responsePromise;await response.finished();const result=await response.json();const h=await response.allHeaders(),t=response.request().timing();const httpMs=Math.round(t.responseEnd-t.requestStart);assert.ok(httpMs>=0,'Response timing incomplete');network.push({setting:item.id,label,path:new URL(response.url()).pathname,status:response.status(),httpMs,serverTiming:h['server-timing'],traceId:h['x-settings-trace']});
  assert.equal(result.success,true);assert.equal(result.storeId,'sports-live-flow-store');
  await form.getByLabel(item.field,{exact:true}).waitFor({state:'hidden',timeout:15000});
  await page.waitForTimeout(250);
  const ui=await page.evaluate(()=>window.__youngskyUi);
  results.push({setting:item.id,label,submitToCollapseMs:ui?.closedAt&&ui?.startedAt?Math.round(ui.closedAt-ui.startedAt):null,responseSuccess:result.success,syncWarning:result.syncWarning??false,confirmedValue:(result.data?.values??result.data)?.[item.key],clickToVerifiedMs:Math.round(performance.now()-started),pageErrors:errors.length});persist();
  console.log(JSON.stringify({setting:item.id,label,collapsed:true,pageErrors:errors.length}));
 }
 const items=[
 {id:'payment',section:'payment',title:'銀行轉帳資訊',form:'編輯銀行資訊',field:'銀行名稱',key:'bankName',test:'隔離銀行 Playwright QA1021'},
 {id:'booking',section:'booking',title:'預約與取消截止',form:'編輯預約截止規則',field:'預約截止時間',key:'bookingLeadMinutes'},
 {id:'store',section:'store',title:'店家資料',form:'編輯店家資料',field:'店家名稱',key:'name'},
 {id:'waitlist',section:'booking',title:'候補',field:'候補名額',key:'defaultLimit',endpoint:'course/waitlist'},
 {id:'trial',section:'payment',title:'體驗設定',form:'體驗設定',field:'預設體驗價格（NT$）',key:'trialDefaultPrice',endpoint:'shop',saveName:'儲存體驗設定'},
 ];
 for(const item of items){
  let form=await open(item);const original=await form.getByLabel(item.field,{exact:true}).inputValue();
  const test=item.test??(item.id==='store'?original+' QA1021':String(Number(original)+1));const beforeErrors=errors.length;
  await save(form,item,test,'edit');
  if(errors.length>beforeErrors){await page.screenshot({path:`${out}/${item.id}-error.png`,fullPage:true});throw Error(`Client error after ${item.id} save; inspect captured stack before further mutation`);}
  form=await open(item,false);assert.equal(await form.getByLabel(item.field,{exact:true}).inputValue(),test);
  await save(form,item,original,'restore');
  form=await open(item);assert.equal(await form.getByLabel(item.field,{exact:true}).inputValue(),original);
  await page.screenshot({path:`${out}/${item.id}-restored.png`,fullPage:true});console.log(`${item.id} persisted and restored`);
 }
 for(const [width,height]of [[1366,900],[1920,1080],[1024,768],[768,1024]]){
  await page.setViewportSize({width,height});await page.goto(base+'/s/sports-live-flow/admin/dashboard/courses?view=settings&section=payment',{waitUntil:'domcontentloaded',timeout:90000});
  const item=items[0],form=await open(item,false),field=form.getByLabel(item.field,{exact:true});const original=await field.inputValue();await field.fill('未送出的尺寸草稿');
  await page.setViewportSize({width:width===768?1024:768,height:width===768?768:1024});assert.equal(await field.inputValue(),'未送出的尺寸草稿');await page.setViewportSize({width,height});
  const dims=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(dims.width,width);assert.equal(dims.height,height);assert.equal(dims.overflow,false);
  await form.getByRole('button',{name:'儲存',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${width}x${height}.png`,fullPage:true});await field.fill(original);screens.push({...dims,draftRetained:true,saveVisible:await form.getByRole('button',{name:'儲存',exact:true}).isVisible()});persist();console.log(JSON.stringify(dims));
 }
 assert.equal(errors.length,0,'Browser console errors present');persist(true);console.log('Hosted acceptance complete');
}catch(error){persist();console.error(String(error.message).replace(/_vercel_share=[^\s"&]+/g,"_vercel_share=[redacted]"));process.exitCode=1;}finally{await browser?.close();}
