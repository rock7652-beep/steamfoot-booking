/** Actual loopback Next app, real credentials, server actions and PostgreSQL; no mocks. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const config=JSON.parse(readFileSync('/tmp/mixed-local-access.json','utf8'));
assert.equal(config.base,'http://localhost:3107');
const kind=process.argv[2]??'music',phase=process.argv[3]??'inspect';
const account=config.accounts.find(a=>a.kind===kind);assert.ok(account);
const out='/tmp/mixed-local-acceptance/'+kind;mkdirSync(out,{recursive:true,mode:0o700});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.route('**/*',route=>new URL(route.request().url()).origin===config.base?route.continue():route.abort());
const page=await context.newPage();page.setDefaultTimeout(20000);
const redirects=[];page.on('response',r=>{if(r.status()>=300&&r.status()<400)redirects.push({path:new URL(r.url()).pathname,status:r.status(),to:r.headers().location});});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={kind,phase,environment:'loopback Next development + dedicated PostgreSQL',mocks:false,complete:false,checks:[],errors};
async function capture(name){await page.screenshot({path:out+'/'+name+'.png',fullPage:true});writeFileSync(out+'/'+name+'.json',JSON.stringify(await page.locator('body').evaluate(e=>({text:e.innerText,inputs:[...e.querySelectorAll('input,select,button')].map(x=>({tag:x.tagName,label:x.getAttribute('aria-label'),type:x.type,value:['password','email'].includes(x.type)?'[redacted]':x.value,text:x.tagName==='INPUT'?'':x.innerText}))})),null,2),{mode:0o600});}
try{
 await page.goto(config.base+'/hq/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('密碼',{exact:true}).fill(account.password);
 const start=performance.now();await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'));
 const user=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s.user));assert.equal(user.storeId,account.storeId);assert.equal(user.role,'OWNER');report.checks.push({step:'actual-login',pass:true,elapsedMs:Math.round(performance.now()-start)});
 const entry=config.base+'/s/'+account.slug+'/admin/dashboard/courses?view=schedule&date='+account.date;
 const cold=performance.now();await page.goto(entry,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:/^[+＋]?\s*排課$/}).waitFor();report.checks.push({step:'cold-calendar-data-ready',elapsedMs:Math.round(performance.now()-cold),pass:true});
 await page.waitForLoadState('networkidle',{timeout:20000});
 await capture('entry');
 if(phase!=='verify'){
 await page.getByRole('button',{name:/^[+＋]?\s*排課$/}).click();const dialog=page.getByRole('dialog');await dialog.waitFor({timeout:15000});await capture('form');
 if(phase!=='inspect'){
  if(kind==='sports'){
   await dialog.getByRole('button',{name:'單次',exact:true}).click();
   await dialog.getByLabel('排課教學項目',{exact:true}).fill(account.subjectName);await dialog.getByRole('option').filter({hasText:account.subjectName}).click();
   await dialog.getByLabel('排課教練',{exact:true}).fill(account.teacherName);await dialog.getByRole('option').filter({hasText:account.teacherName}).click();
  }else{
   await dialog.getByLabel('課程',{exact:true}).selectOption(account.templateId);
   await dialog.getByLabel('安排類型',{exact:true}).selectOption('single');
  }
  await dialog.getByLabel('排課日期',{exact:true}).fill(account.date);await dialog.getByLabel('排課時間',{exact:true}).fill(account.time);
  if(kind==='music')await dialog.getByLabel('排課教室',{exact:true}).selectOption(account.roomId);
  await dialog.getByText('開放選課',{exact:true}).click();await dialog.getByLabel('同時安排固定學員',{exact:true}).check();await dialog.getByLabel(kind==='music'?'名額':'排課人數',{exact:true}).fill('4');
  await dialog.getByLabel(kind==='music'?'搜尋排課學員':'搜尋學員',{exact:true}).fill(account.customers[0].name);
  await dialog.getByRole(kind==='music'?'button':'option',{name:new RegExp('^'+account.customers[0].name)}).click();
  if(kind==='music')await dialog.getByLabel(/^授課(?:教師|教練)$/).selectOption(account.staffId);
  for(const [width,height]of [[1366,900],[1024,768],[768,1024]]){
   await page.setViewportSize({width,height});assert.equal(await dialog.getByLabel('同時安排固定學員',{exact:true}).isChecked(),true);assert.equal(await dialog.getByLabel(kind==='music'?'名額':'排課人數',{exact:true}).inputValue(),'4');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('mixed-form-'+width);report.checks.push({step:'mixed-form-resize-retains-draft',width,height,pass:true});
  }
  await page.setViewportSize({width:1366,height:900});await capture('prepared');
  if(phase==='save'){
   const save=dialog.getByRole('button',{name:'新增',exact:true});report.saveButton={enabled:await save.isEnabled(),text:await save.innerText()};await save.click();await dialog.waitFor({state:'hidden'});await capture('saved');report.checks.push({step:'real-server-action-confirmed',pass:true,url:page.url()});
  }
 }
 }
 if(['save','verify'].includes(phase)){
  const {Client}=createRequire(import.meta.url)('pg');const env=JSON.parse(readFileSync('/tmp/mixed-local-env.json','utf8'));assert.equal(env.DATABASE_URL,'postgresql://postgres@127.0.0.1:55438/sports_live_flow_test');
  const db=new Client({connectionString:env.DATABASE_URL});await db.connect();let session;
  try{
   const rows=(await db.query(`SELECT s.id,s.capacity,s."enrollmentMode",r.enrollment,r.payload,(SELECT count(*)::int FROM "CourseBooking" b WHERE b."sessionId"=s.id AND b.status<>'CANCELLED') AS booked,(SELECT b."customerId" FROM "CourseBooking" b WHERE b."sessionId"=s.id LIMIT 1) AS fixed FROM "CourseSession" s LEFT JOIN "SportsStagingSessionRule" r ON r."sessionId"=s.id WHERE s."storeId"=$1 AND s."templateId"=$2`,[account.storeId,account.templateId])).rows;
   assert.equal(rows.length,1);session=rows[0];assert.equal(session.capacity,4);assert.equal(session.booked,1);assert.equal(session.fixed,account.customers[0].id);assert.equal(kind==='music'?session.enrollmentMode:session.enrollment,'OPEN');if(kind==='sports')assert.equal(session.payload.students[0].customerId,account.customers[0].id);
   report.checks.push({step:'authoritative-database-result',pass:true,sessionId:session.id,capacity:4,fixedLearners:1,openSeats:3});
  }finally{await db.end();}
  const warm=performance.now();await page.goto(entry+'&session='+session.id,{waitUntil:'domcontentloaded'});await page.waitForFunction(name=>document.body.innerText.includes(name),account.customers[0].name);report.checks.push({step:'reload-persists-roster',pass:true,elapsedMs:Math.round(performance.now()-warm)});
  for(const [width,height]of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('roster-'+width);report.checks.push({step:'persisted-roster-responsive',width,height,pass:true});}
 }
 assert.deepEqual(errors,[]);report.complete=true;
}catch(error){report.error=error.message;report.redirects=redirects.slice(-15);report.cookies=(await context.cookies()).map(c=>({name:c.name,domain:c.domain,secure:c.secure}));report.session=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>({userId:s.user?.id,role:s.user?.role,storeId:s.user?.storeId}))).catch(()=>null);await capture('failure').catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'-results.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close();}
