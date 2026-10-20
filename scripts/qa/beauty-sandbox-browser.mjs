/** External HTTPS smoke acceptance. No DB credentials and no auth bypass. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {BEAUTY_SANDBOX_ORIGIN} from '../beauty-sandbox-qa-scope.mjs';
const require=createRequire(import.meta.url);
const {toLocalDateStr,addTaiwanDuration}=require('../../src/lib/date-utils.ts');
const {chromium}=await import(process.env.QA_PLAYWRIGHT_MODULE??'/tmp/beauty-browser/node_modules/playwright/index.mjs');
const password=process.env.QA_BEAUTY_REVIEW_PASSWORD;
if(!password)throw Error('Provide the task review password through the QA environment.');
const base=BEAUTY_SANDBOX_ORIGIN,prefix=base+'/s/beauty-1374-qa';
const output=process.env.QA_BEAUTY_SANDBOX_OUTPUT??'/tmp/beauty-sandbox-qa/evidence';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE??'/usr/bin/google-chrome',args:['--no-sandbox']});
const contexts=[],results=[],pageErrors=[];
const runId=String(Date.now()).slice(-6),date=days=>addTaiwanDuration(toLocalDateStr(),days,'DAY');
async function pageFor(){
 const context=await browser.newContext({viewport:{width:390,height:844},...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
 contexts.push(context);
 // Use the browser's normal TLS validation; permit only this task's origin.
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',error=>pageErrors.push(error.message.split('\n')[0]));return page;
}
async function shot(page,name){await page.waitForLoadState('networkidle');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:output+'/'+name+'.png',fullPage:true,caret:'initial'});}
async function loginMember(page,phone){
 await page.goto(prefix+'/',{timeout:120000});
 await page.getByLabel('手機號碼',{exact:true}).fill(phone);
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByLabel('密碼',{exact:true}).fill(password);
 await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.getByRole('button',{name:'立即預約',exact:true}).waitFor();
}
async function book(page,people,day,{member=false}={}){
 await page.waitForLoadState('networkidle');
 await page.getByLabel('預約人數').selectOption(String(people.length));
 await page.locator('form section').nth(people.length-1).waitFor();
 for(const [i,p] of people.entries()){
  const section=page.locator('form section').nth(i);
  if(!member){await section.getByLabel('姓名',{exact:true}).fill(p.name);await section.getByLabel('手機',{exact:true}).fill(p.phone);}
  assert.equal(await section.getByLabel('技師性別（必選）').inputValue(),'');
  await section.getByLabel('服務項目').selectOption('beauty-1374-'+p.service);
  await section.getByLabel('技師性別（必選）').selectOption(p.gender);
  await section.getByLabel('本次備註（選填）').fill('sandbox-'+runId);
 }
 if(!member){await page.getByLabel('聯絡人姓名',{exact:true}).fill(people[0].name);await page.getByLabel('聯絡人手機',{exact:true}).fill(people[0].phone);}
 await page.getByLabel('共同日期').fill(date(day));
 await page.getByRole('button',{name:'查詢共同可用時間',exact:true}).click();
 const times=page.getByLabel('共同開始時間');await times.waitFor();
 const values=await times.locator('option').allTextContents();assert(values.length>1);
 await times.selectOption(values[1]);await page.getByRole('button',{name:'確認預約',exact:true}).click();
 await page.getByRole('heading',{name:'預約成功',exact:true}).waitFor();
}
try{
 const publicPage=await pageFor();await publicPage.goto(base+'/beauty-trial/beauty-1374-qa',{timeout:120000});
 await book(publicPage,[{name:'外部做臉'+runId,phone:'0931'+runId,service:'face',gender:'FEMALE'},{name:'外部按摩'+runId,phone:'0932'+runId,service:'massage',gender:'MALE'}],1);
 await shot(publicPage,'public-party-phone');results.push({case:'外部 HTTPS 公開兩人不同服務預約成功',passed:true});
 const owner=await pageFor();await owner.goto(base+'/hq/login?store=beauty-1374-qa');
 await owner.getByLabel('Email',{exact:true}).fill('owner@beauty-1374.invalid');await owner.getByLabel('密碼',{exact:true}).fill(password);
 await owner.getByRole('button',{name:'登入',exact:true}).click();await owner.getByRole('button',{name:'新增預約',exact:true}).waitFor();
 await owner.goto(prefix+'/admin/dashboard/beauty?date='+date(1));
 await owner.locator('article strong').filter({hasText:'外部做臉'+runId}).waitFor();
 await shot(owner,'manager-phone');await owner.setViewportSize({width:1024,height:768});await shot(owner,'manager-ipad');
 await owner.setViewportSize({width:1440,height:900});await shot(owner,'manager-desktop');results.push({case:'真實後台登入、查看外部預約，手機／iPad／桌機無整頁溢出',passed:true});
 const member=await pageFor();await loginMember(member,'0900001375');await member.getByRole('button',{name:'立即預約',exact:true}).click();
 await book(member,[{service:'face',gender:'FEMALE'}],2,{member:true});await shot(member,'member-booked-phone');results.push({case:'顧客使用真實手機密碼登入並預約',passed:true});
 const worker=await pageFor();await loginMember(worker,'0900001376');await worker.getByRole('link',{name:'我的工作',exact:true}).click();
 const own=worker.locator('article').filter({hasText:'sandbox-'+runId}).filter({hasText:'驗收顧客'});await own.waitFor();
 worker.once('dialog',dialog=>dialog.accept('外部隔離測試完成'));await own.getByRole('button',{name:'服務完成',exact:true}).click();
 await own.getByText(/已完成/).waitFor();await shot(worker,'technician-phone');
 await member.goto(prefix+'/beauty');await member.locator('article').filter({hasText:'已完成'}).first().waitFor();await shot(member,'member-completed-phone');
 results.push({case:'技師由會員登入進我的工作、完成本人服務，顧客回讀完成狀態',passed:true});
 assert.equal(pageErrors.length,0);
 await writeFile(output+'/results.json',JSON.stringify({origin:base,synthetic:true,runId,results,pageErrors,nativeBrowserTls:true},null,2));
 console.log(JSON.stringify({results,pageErrors}));
}catch(error){console.error(String(error.message).split('\n')[0]);console.error((error.stack??'').split('\n').filter(line=>line.includes('beauty-sandbox-browser.mjs')).join('\n'));console.error(JSON.stringify({pageErrors}));for(const [i,c] of contexts.entries()){for(const p of c.pages()){try{await writeFile(output+'/failure-'+i+'.txt',await p.locator('body').innerText({timeout:3000}));}catch{}}}process.exitCode=1;}
finally{await Promise.all(contexts.map(c=>c.unrouteAll({behavior:'ignoreErrors'})));await Promise.all(contexts.map(c=>c.close()));await browser.close();}
