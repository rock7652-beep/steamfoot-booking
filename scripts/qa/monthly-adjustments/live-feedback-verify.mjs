import {chromium} from '/opt/codex/cua_node/lib/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {assertBeautySharedPagesLocalQaEnvironment} from '../../beauty-shared-pages-local-qa-scope.mjs';
const require=createRequire(import.meta.url),{Client}=require('pg');
const env=JSON.parse(readFileSync('/tmp/monthly-live-env.json','utf8'));assertBeautySharedPagesLocalQaEnvironment(env);
const {password,accounts}=JSON.parse(readFileSync('/tmp/monthly-live-login.json','utf8'));
const db=new Client({connectionString:env.DATABASE_URL});await db.connect();
const baseline=process.argv.includes('--baseline');
// Synthetic HQ login uses the same normal password flow, never a forged session.
await db.query(`INSERT INTO "User" (id,name,email,role,"passwordHash","createdAt","updatedAt") SELECT 'monthly-feedback-admin','合成總部','admin@monthly-qa.example.invalid','ADMIN',"passwordHash",now(),now() FROM "User" WHERE id='monthly-live-beauty-owner' ON CONFLICT(id) DO NOTHING`);
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const output='artifacts/monthly-adjustments/feedback-density';mkdirSync(output,{recursive:true});
const results=[];
try{
 for(const scope of ['beauty-owner','beauty-hq']){
  const account=accounts.find(a=>a.kind==='beauty');
  const context=await browser.newContext({viewport:{width:1366,height:900},locale:'zh-TW'}),page=await context.newPage();
  page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://localhost:3123/hq/login${scope.endsWith('owner')?'?store='+account.storeId:''}`,{waitUntil:'networkidle',timeout:180000});
  await page.locator('input[name=email]').fill(scope.endsWith('owner')?account.email:'admin@monthly-qa.example.invalid');
  await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.waitForURL(/\/dashboard/,{timeout:180000});
  if(scope.endsWith('hq')){const r=await page.request.post('http://localhost:3123/api/hq/store-view',{headers:{origin:'http://localhost:3123'},data:{storeId:account.storeId}});assert.equal((await r.json()).success,true);}
  const url=scope.endsWith('hq')?'/hq/dashboard/revenue':`/s/${account.storeId}/admin/dashboard/revenue`;
  await page.goto(`http://localhost:3123${url}?area=monthly&month=2026-11`,{waitUntil:'networkidle',timeout:180000});
  const section=page.locator('section[aria-label="獎勵與調整"]'),measurements=[];
  for(let i=0;i<3;i++){
   await section.getByRole('button',{name:'＋新增調整'}).click();
   const form=page.locator('form:has(#monthly-adjustment-title)');
   await form.getByLabel(/^人員/).selectOption(account.personId);await form.getByLabel(/^金額/).fill('100');
   const reason=`${baseline?'before':'after'}-${scope}-${i}`;await form.getByLabel(/^調整事由/).fill(reason);
   const start=Date.now();await form.getByRole('button',{name:'儲存',exact:true}).click();
   await form.waitFor({state:'hidden'});const closed=Date.now()-start;
   let visible=true;try{await section.getByText(reason,{exact:true}).waitFor({timeout:20000});}catch{visible=false;}
   const shown=Date.now()-start;
   measurements.push({iteration:i,dialogClosedMs:closed,rowVisibleMs:visible?shown:null,requiresReload:!visible});
   assert.equal((await db.query('SELECT count(*)::int n FROM "StaffMonthlyAdjustment" WHERE "storeId"=$1 AND reason=$2',[account.storeId,reason])).rows[0].n,1);
   if(!visible){if(!baseline)throw Error('Saved row did not appear without reload');await page.reload({waitUntil:'networkidle'});}
  }
  results.push({scope,measurements,errors});await context.close();
 }
 writeFileSync(`${output}/${baseline?'before':'after'}-live.json`,JSON.stringify({syntheticOnly:true,mockedActions:false,results},null,2)+'\n');
 console.log(JSON.stringify(results));
}finally{await browser.close();await db.end();}
