// Isolated real roster checkout, followed by optional attendance/restore and cleanup. No automatic retries.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const [module,phase]=process.argv.slice(2);
assert.ok(['sports','music'].includes(module));
assert.ok(['buy','cleanup','smoke'].includes(phase));
const config=JSON.parse(readFileSync('/tmp/real-checkout-access.json','utf8'));
const account=JSON.parse(readFileSync('/tmp/real-checkout-credentials.json','utf8')).accounts.find(x=>x.module===module);
const base='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';
assert.equal(config.base,base);
const root='/tmp/real-checkout',out=root+'/'+module;mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/'+module+'-owner-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(90000);
const report={module,phase,deployment:config.deployment,started:new Date().toISOString(),complete:false,samples:[],requests:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message.replace(/(?:_vercel_share|x-vercel-protection-bypass)=[^&\s]+/g,'access=[redacted]')));
page.on('requestfinished',request=>{if(request.method()!=='POST')return;const t=request.timing();report.requests.push({path:new URL(request.url()).pathname,durationMs:Math.round(t.responseEnd),action:request.headers()['next-action']??null});});
const courses=base+'/s/'+account.slug+'/admin/dashboard/courses';
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded'});
 await page.goto(base+'/api/auth/session',{waitUntil:'domcontentloaded'});
 let user=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(x=>x?.user));
 if(!user){await page.goto(base+'/hq/login?store='+account.storeId,{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(account.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));}
 user=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(x=>x?.user));assert.equal(user?.storeId,account.storeId);assert.equal(user?.role,'OWNER');
 await page.goto(courses+'?view=schedule&date=2026-11-03&session='+account.sessionId,{waitUntil:'domcontentloaded'});
 const pending=page.getByRole('button',{name:account.name+(module==='sports'?'：待點名':'：點名'),exact:true});await pending.waitFor();
 if(phase==='buy'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  const url=page.url();
  for(let sample=1;sample<=1;sample++){
   const started=performance.now();
   await page.getByRole('button',{name:account.name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'學員繳費 · '+account.name,exact:true});
   await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();
   const optionsMs=Math.round(performance.now()-started);
   await dialog.locator('#course-roster-purchase-form select').first().selectOption(account.planId);
   if(module==='sports')await dialog.getByLabel('所屬店長',{exact:true}).selectOption(account.id+'-staff');
   await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');
   const confirm=performance.now();await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).click();
   await dialog.waitFor({state:'hidden'});const checkoutMs=Math.round(performance.now()-confirm);
   const balance=20;
   const result={sample,optionsMs,checkoutMs,balance,visibleBalanceMs:null};report.samples.push(result);
   writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
   await page.getByText(new RegExp(balance+' 堂')).first().waitFor();await pending.waitFor();
   result.visibleBalanceMs=Math.round(performance.now()-confirm);
   await page.waitForLoadState('networkidle');
   assert.equal(page.url(),url);assert.equal(await page.getByRole('button',{name:account.name+'：已出席',exact:true}).count(),0);
   result.backgroundNetworkIdleMs=Math.round(performance.now()-confirm);
   writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
  }
 }else if(phase==='smoke'){
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  await page.getByText(/20 堂/).first().waitFor();await pending.click();const attended=page.getByRole('button',{name:account.name+'：已出席',exact:true});await attended.waitFor();await page.getByText(/19 堂/).first().waitFor();await attended.click();await page.getByRole('menuitem',{name:/^恢復/}).click();await pending.waitFor();await page.getByText(/20 堂/).first().waitFor();report.samples.push({step:'FIFO attend/restore',balance:20});
 }else{
  assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  if(module==='sports'){await page.getByRole('button',{name:'取消課程',exact:true}).click();await page.getByRole('dialog',{name:'取消課程',exact:true}).getByRole('button',{name:'確認取消',exact:true}).click();}
  else{await page.getByRole('button',{name:'課程更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'取消本堂',exact:true}).click();await page.getByRole('button',{name:'確認取消本堂課',exact:true}).click();}
  await pending.waitFor({state:'hidden'});report.samples.push({step:'normal cancellation'});
 }
 report.complete=true;await page.screenshot({path:out+'/roster-'+phase+'.png',fullPage:true});
}catch(error){report.failure=String(error);await page.screenshot({path:out+'/roster-'+phase+'-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/roster-'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await context.close();}
