import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertBeautySharedPagesLocalQaEnvironment} from '../../beauty-shared-pages-local-qa-scope.mjs';
const require=createRequire(import.meta.url),{Client}=require('pg');
const env=JSON.parse(readFileSync('/tmp/monthly-live-env.json','utf8'));assertBeautySharedPagesLocalQaEnvironment(env);
const {password,accounts}=JSON.parse(readFileSync('/tmp/monthly-live-login.json','utf8'));
const db=new Client({connectionString:env.DATABASE_URL});await db.connect();
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const output='artifacts/monthly-adjustments/live';mkdirSync(output,{recursive:true});
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const previous=process.argv.includes('--resume')?JSON.parse(readFileSync(`${output}/results.json`,'utf8')):null;
if(previous&&previous.sourceSha!==sourceSha)throw Error('Cannot reuse results from another product version');
const results=previous?.results??[];let currentPage;const actionErrors=[];
const rows=async a=>(await db.query('SELECT *,COALESCE("staffId","technicianId") AS person FROM "StaffMonthlyAdjustment" WHERE "storeId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt",id',[a.storeId])).rows;
const state=async a=>(await db.query('SELECT * FROM "StaffAdjustmentMonth" WHERE "storeId"=$1 AND month=$2',[a.storeId,'2026-11'])).rows[0];
async function until(check){for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Database result did not converge');}
try{
 for(const old of results){const a=accounts.find(account=>account.kind===old.kind);assert.ok(a);assert.equal((await rows(a)).length,old.activeRows);assert.equal((await state(a)).locked,true);assert.equal((await rows(a)).reduce((n,r)=>n+(r.direction==='ADD'?r.amount:-r.amount),a.base),old.finalTotal);}
 for(const account of accounts.filter(a=>!results.some(r=>r.kind===a.kind))){
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-TW'});const page=await context.newPage();currentPage=page;page.on('response',async r=>{if(r.request().method()==='POST'&&r.request().postData()?.includes('fingerprint')){const text=await r.text().catch(()=>'');for(const match of text.matchAll(/"error":"([^"]+)"/g))actionErrors.push(match[1]);}});page.setDefaultTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let lastSave;
  page.on('request',request=>{if(request.method()==='POST'&&request.postData()?.includes('expectedStoreId')&&request.postData()?.includes('live-'+account.kind))lastSave={body:request.postData(),action:request.headers()['next-action'],type:request.headers()['content-type']};});
  const started=Date.now();
  await page.goto(`http://localhost:3123/hq/login?store=${account.storeId}`,{waitUntil:'networkidle',timeout:180000});
  await page.locator('input[name="email"]').fill(account.email);await page.locator('input[name="password"]').fill(password);await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.waitForURL(/\/admin\/dashboard/,{timeout:180000});
  const monthlyUrl=`http://localhost:3123/s/${account.storeId}/admin/dashboard/revenue?area=monthly&month=2026-11`;
  await page.goto(monthlyUrl,{waitUntil:'networkidle',timeout:180000});
  const session=await (await page.request.get('http://localhost:3123/api/auth/session')).json();assert.equal(session.user.storeId,account.storeId);assert.equal(session.user.role,'OWNER');
  const section=page.getByRole('region',{name:'獎勵與調整'}).or(page.locator('section[aria-label="獎勵與調整"]'));
  await section.getByRole('button',{name:'＋新增調整'}).waitFor();
  const form=()=>page.locator('form:has(#monthly-adjustment-title)');
  async function save(){await form().getByRole('button',{name:'儲存',exact:true}).click();await form().waitFor({state:'hidden'});}
  async function add(direction,amount,reason){
   await section.getByRole('button',{name:'＋新增調整'}).click();
   assert.deepEqual(await form().locator('input,select,textarea').evaluateAll(nodes=>nodes.map(n=>n.type).slice(0,2)),['date','month']);
   await form().getByLabel('日期＊').fill('2026-11-02');await form().getByLabel('歸屬月份＊').fill('2026-11');
   await form().getByLabel('人員＊').selectOption(account.personId);await form().getByLabel('加項／減項＊').selectOption(direction);await form().getByLabel('金額＊').fill(String(amount));await form().getByLabel('調整事由＊').fill(reason);
   await save();await until(async()=>(await rows(account)).some(r=>r.reason===reason));
  }
  const addition=`live-${account.kind}-獎勵`,deduction=`live-${account.kind}-出勤調整`,temporary=`live-${account.kind}-刪除驗收`;
  await add('ADD',2000,addition);assert.ok(lastSave?.action);const originalSave={...lastSave};
  const replay=await page.request.post(monthlyUrl,{headers:{'next-action':originalSave.action,'content-type':originalSave.type,origin:'http://localhost:3123'},data:originalSave.body});assert.equal(replay.status(),200);assert.equal((await rows(account)).filter(r=>r.reason===addition).length,1);
  async function edit(reason,amount){const row=section.getByRole('row').filter({has:page.getByText(reason,{exact:true})});await row.getByRole('button',{name:'編輯',exact:true}).click();await form().getByLabel('金額＊').fill(String(amount));await save();await until(async()=>(await rows(account)).find(r=>r.reason===reason)?.amount===amount);}
  await edit(addition,2500);await add('SUBTRACT',800,deduction);await add('ADD',500,temporary);
  const temporaryRow=section.getByRole('row').filter({has:page.getByText(temporary,{exact:true})});await temporaryRow.getByRole('button',{name:'刪除',exact:true}).click();await page.getByRole('button',{name:'確認刪除',exact:true}).click();await until(async()=>(await rows(account)).length===2);
  await edit(addition,2000);
  const active=await rows(account);assert.equal(active.reduce((sum,r)=>sum+(r.direction==='ADD'?r.amount:-r.amount),0),1200);assert.ok(active.every(r=>r.person===account.personId));
  await page.reload({waitUntil:'networkidle'});
  const expected=account.base+1200;assert.ok((await page.locator('body').innerText()).includes(expected.toLocaleString('en-US')),'Adjusted total missing from actual UI');
  async function confirm(){
   // Reload proves persisted obligations and waits for the authoritative RSC fingerprint after edits.
   await page.reload({waitUntil:'networkidle'});
   if(account.kind==='steam'){page.once('dialog',d=>d.accept());await section.getByRole('button',{name:'完成月結',exact:true}).click();}
   else {await page.getByRole('button',{name:/^(確認月結|重新確認)$/}).click();const reason=page.getByLabel('調整原因');if(await reason.count())await reason.fill('本機合成資料異動後重新確認');await page.getByRole('button',{name:'確認',exact:true}).click();}
   await until(async()=>(await state(account))?.locked===true);await section.getByRole('button',{name:'重新開啟月結',exact:true}).waitFor();
  }
  async function reopen(){page.once('dialog',d=>d.accept());await section.getByRole('button',{name:'重新開啟月結',exact:true}).click();await until(async()=>(await state(account))?.locked===false);await section.getByRole('button',{name:'＋新增調整'}).waitFor();}
  await confirm();assert.equal(await section.getByRole('button',{name:'編輯',exact:true}).count(),0);
  const payload=JSON.parse(originalSave.body);assert.ok(Array.isArray(payload));payload[0]={...payload[0],id:randomUUID(),revision:0,reason:`live-${account.kind}-locked-rejected`};
  const lockedResponse=await page.request.post(monthlyUrl,{headers:{'next-action':originalSave.action,'content-type':originalSave.type,origin:'http://localhost:3123'},data:JSON.stringify(payload)});assert.equal(lockedResponse.status(),200);assert.ok((await lockedResponse.text()).includes('此月份已結算'));assert.equal((await rows(account)).length,2);
  payload[0]={...payload[0],expectedStoreId:accounts.find(a=>a.storeId!==account.storeId).storeId};const foreignResponse=await page.request.post(monthlyUrl,{headers:{'next-action':originalSave.action,'content-type':originalSave.type,origin:'http://localhost:3123'},data:JSON.stringify(payload)});assert.ok((await foreignResponse.text()).includes('目前門市已變更'));assert.equal((await rows(account)).length,2);
  await reopen();await edit(deduction,700);await confirm();await reopen();await confirm(); // unchanged fingerprint must still relock after reopening
  await page.reload({waitUntil:'networkidle'});assert.equal((await state(account)).locked,true);assert.ok((await page.locator('body').innerText()).includes((account.base+1300).toLocaleString('en-US')));
  for(const [name,width,height] of [['desktop',1366,900],['ipad-landscape',1180,820],['ipad-portrait',820,1180]]){await page.setViewportSize({width,height});await page.screenshot({path:`${output}/${account.kind}-${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${account.kind} ${name} overflow`);}
  const audit=(await db.query('SELECT action,count(*)::int FROM "AuditLog" WHERE "storeId"=$1 AND "targetType"=$2 GROUP BY action',[account.storeId,'StaffMonthlyAdjustment'])).rows;
  assert.ok(audit.some(r=>r.action==='CREATE'&&r.count===3));assert.ok(audit.some(r=>r.action==='DELETE'&&r.count===1));assert.equal(errors.length,0,JSON.stringify(errors));
  const result={kind:account.kind,storeId:account.storeId,authenticated:true,base:account.base,addition:2000,deduction:700,finalTotal:account.base+1300,activeRows:2,duplicateReplay:'single row',lockedWrite:'rejected',foreignStore:'rejected',reopenUnchanged:'relocked',audit,viewportChecks:3,pageErrors:errors,elapsedMs:Date.now()-started};results.push(result);writeFileSync(`${output}/results.json`,JSON.stringify({status:'partial',sourceSha,results},null,2)+'\n');console.log(JSON.stringify({kind:account.kind,status:'passed',total:result.finalTotal}));await context.close();
 }
 const payments=(await db.query('SELECT (SELECT count(*) FROM "CashbookEntry")::int AS cashbook,(SELECT count(*) FROM "CourseFeePayment")::int AS fees,(SELECT count(*) FROM "CourseProfitPayment")::int AS profit,(SELECT count(*) FROM "BeautyPayment")::int AS beauty,(SELECT count(*) FROM "DigitalManagerNotice")::int AS notices')).rows[0];assert.ok(Object.values(payments).every(n=>n===0));
 writeFileSync(`${output}/results.json`,JSON.stringify({status:'passed',sourceSha,engine:'PostgreSQL 17.6',syntheticOnly:true,remoteWrites:false,mockedServerActions:false,results,payments},null,2)+'\n');console.log(JSON.stringify({status:'passed',modules:results.length,payments}));
}catch(error){await currentPage?.screenshot({path:`${output}/failure.png`}).catch(()=>{});writeFileSync(`${output}/failure.json`,JSON.stringify({error:error.message,actionErrors,completed:results.map(r=>r.kind)},null,2)+'\n');throw error;}finally{await browser.close();await db.end();}
