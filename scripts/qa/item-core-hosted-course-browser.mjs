// Hosted acceptance only: credentials/access are private /tmp files; no auth or action mocks.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const profile=process.argv[2],phase=process.argv[3]??'inspect',role=process.argv[4]??'owner';
assert.ok(['sports','music'].includes(profile));assert.ok(['owner','staff'].includes(role));
const config=JSON.parse(readFileSync('/tmp/item-core-next-access.json','utf8'));
const credentials=JSON.parse(readFileSync('/tmp/item-core-next-credentials.json','utf8')).find(c=>c.module===profile&&c.role===role);
const allowed='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';
assert.equal(config.base,allowed);assert.equal(config.deployment,'dpl_94hX5wfRkcvnosuMHQ4Yr4LYbsjc');
const root='/tmp/item-core-next',out=root+'/'+profile;mkdirSync(out,{recursive:true,mode:0o700});
const context=await chromium.launchPersistentContext(root+'/'+profile+'-'+role+'-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===allowed||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(90000);
const errors=[],redact=s=>s.replace(/(?:_vercel_share|x-vercel-protection-bypass)=[^&\s]+/g,'access=[redacted]');
page.on('pageerror',e=>errors.push(redact(e.message)));
const report={profile,phase,role,deployment:config.deployment,complete:false,checks:[],errors};
const courses=allowed+'/s/'+credentials.slug+'/admin/dashboard/courses';
async function capture(name){await page.screenshot({path:out+'/'+name+'.png',fullPage:true});writeFileSync(out+'/'+name+'.json',JSON.stringify(await page.locator('body').evaluate(e=>({text:e.innerText,inputs:[...e.querySelectorAll('input,select,button')].map(x=>({tag:x.tagName,name:x.name,label:x.getAttribute('aria-label'),role:x.getAttribute('role'),type:x.type,value:x.type==='password'||x.name==='email'?'[redacted]':x.value,text:x.tagName==='INPUT'?'':x.innerText}))})),null,2),{mode:0o600});}
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded',timeout:90000});
 await page.goto(allowed+'/api/auth/session',{waitUntil:'domcontentloaded',timeout:90000});
 let identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(!identity){await page.goto(allowed+'/hq/login?store='+credentials.storeId,{waitUntil:'domcontentloaded',timeout:90000});await page.getByLabel('Email',{exact:true}).fill(credentials.email);await page.getByLabel('密碼',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});}
 identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));assert.equal(identity?.storeId,credentials.storeId);assert.equal(identity?.role,role.toUpperCase());
 report.checks.push({step:'actual-login',pass:true,storeId:identity.storeId,role:identity.role});
 const sessionPhases=['payment-inspect','flow','continue','finish20','wrong-item','responsive','cleanup'];
 const sessionId=sessionPhases.includes(phase)?JSON.parse(readFileSync('/tmp/item-core-next-sessions.json','utf8'))[profile+(phase==='wrong-item'?'B':'')]:null;
 const entry=sessionId?courses+'?view=schedule&date='+(phase==='wrong-item'?'2026-11-04':'2026-11-03')+'&session='+sessionId:courses;
 await page.goto(entry,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
 await capture(phase+'-entry');
 if(phase==='inspect'){await page.getByRole('button',{name:/^[+＋]?\s*排課$/}).click();await page.getByRole('dialog').waitFor();await capture('schedule-form');report.checks.push({step:'native-schedule-opens',pass:true});}

 if(['prepare','arrange','arrange-b'].includes(phase)){
  if(phase.startsWith('arrange'))assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
  await page.getByRole('button',{name:/^[+＋]?\s*排課$/}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
  const isB=phase==='arrange-b',date=isB?'2026-11-04':'2026-11-03';await dialog.getByLabel('排課日期',{exact:true}).fill(date);await dialog.getByLabel('排課時間',{exact:true}).fill('15:00');
  if(profile==='sports'){
   await dialog.getByRole('button',{name:'單次',exact:true}).click();
   await dialog.getByLabel('排課教學項目',{exact:true}).fill(isB?'QA-課程B':'QA-課程A');await dialog.getByRole('option').filter({hasText:isB?'QA-課程B':'QA-課程A'}).first().click();
   await dialog.getByLabel('排課教練',{exact:true}).fill('驗收老闆');await dialog.getByRole('option').filter({hasText:'驗收老闆'}).first().click();
   await dialog.getByLabel('搜尋學員',{exact:true}).fill('核心運動驗收1028');await dialog.getByRole('option').filter({hasText:'核心運動驗收1028'}).click();
  }else{
   await dialog.getByLabel('課程',{exact:true}).selectOption({label:isB?'吉他個別課':'吉他團體班'});
   await dialog.getByLabel('排課教室',{exact:true}).selectOption({label:'01'});
   await dialog.getByLabel('搜尋排課學員',{exact:true}).fill('核心音樂驗收1028');
   await dialog.getByRole('button',{name:/^核心音樂驗收1028/}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')==='授課教練'&&s.options.length>1));
   const teacher=dialog.getByLabel('授課教練',{exact:true});await teacher.selectOption({index:1});
  }
  assert.equal(await dialog.getByText('收費方式',{exact:true}).count(),0);await capture('prepared');
  if(phase.startsWith('arrange')){
   await dialog.getByRole('button',{name:'新增',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:90000});
   report.checks.push({step:'item-only-arrangement-created',pass:true,date});await capture('arranged');
  }
 }

 if(['payment-inspect','flow','continue','finish20'].includes(phase)){
  const sid=JSON.parse(readFileSync('/tmp/item-core-next-sessions.json','utf8'))[profile];assert.ok(sid);
  if(new URL(page.url()).searchParams.get('session')!==sid)await page.goto(courses+'?view=schedule&date=2026-11-03&session='+sid,{waitUntil:'domcontentloaded',timeout:90000});
  const pending=page.getByRole('button',{name:profile==='sports'?'核心運動驗收1028：待點名':'核心音樂驗收1028：點名',exact:true});await pending.waitFor();if(!['continue','finish20'].includes(phase)){await pending.click();
  await page.getByRole('button',{name:'繳費／購買方案',exact:true}).click();await page.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();
  await capture('payment-form');report.checks.push({step:'no-card-attendance-blocked-in-place-purchase-opens',pass:true});}
  if(['flow','continue','finish20'].includes(phase)){
   assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
   const original=page.url(),name=profile==='sports'?'核心運動驗收1028':'核心音樂驗收1028';
   const buy=async count=>{const dialog=page.getByRole('dialog',{name:'學員繳費 · '+name,exact:true});await dialog.locator('#course-roster-purchase-form select').first().selectOption('qa-core-next-20261028-'+profile+'-plan-'+count);if(profile==='sports')await dialog.getByLabel('所屬店長',{exact:true}).selectOption(credentials.id+'-staff');await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');const at=performance.now();await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:90000});assert.equal(page.url(),original);report.checks.push({step:'purchase-ui-response',count,elapsedMs:Math.round(performance.now()-at),pass:true});};
   if(phase==='flow'){await buy(10);await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});await page.getByText(/10 堂/).first().waitFor();await pending.waitFor();
   assert.equal(await page.getByRole('button',{name:name+'：已出席',exact:true}).count(),0);report.checks.push({step:'purchase-10-original-roster-no-auto-attendance',pass:true});
   await page.getByRole('button',{name:name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();await buy(20);
   await page.getByText(/30 堂/).first().waitFor();await pending.waitFor();report.checks.push({step:'same-item-10-plus-20-shows-30',pass:true});}
   if(phase==='finish20'){
    await page.getByRole('button',{name:name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();await buy(20);await page.getByText(/30 堂/).first().waitFor();report.checks.push({step:'second-purchase-20-sums-existing-10-to-30',pass:true});
   }
   await page.getByText(/30 堂/).first().waitFor();
   await pending.click();const attended=page.getByRole('button',{name:name+'：已出席',exact:true});await attended.waitFor();await page.getByText(/29 堂/).first().waitFor();await capture('attended');report.checks.push({step:'attendance-30-to-29',pass:true});
   await attended.click();await page.getByRole('menuitem',{name:/^恢復/}).click();await pending.waitFor();await page.getByText(/30 堂/).first().waitFor();assert.equal(page.url(),original);await capture('restored');report.checks.push({step:'restore-29-to-30-original-url',pass:true});
   if(phase==='continue-rwd'){
    for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('final-roster-'+width);report.checks.push({step:'final-native-roster-responsive',width,height,pass:true});}
    await page.getByRole('button',{name:name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();await page.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();assert.equal(await page.getByLabel('所屬店長',{exact:true}).count(),profile==='sports'?1:0);
    for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('final-purchase-'+width);report.checks.push({step:'final-native-purchase-responsive',width,height,pass:true});}
   }

  }

 }

 if(phase==='authorization'){
  assert.equal(role,'staff');assert.equal(await page.getByRole('button',{name:/^[+＋]?\s*排課$/}).count(),0);
  const denied=await page.evaluate(async({url,music})=>{const r=await fetch(url,music?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:'2026-11-03'})});return {status:r.status,body:await r.json()};},{url:profile==='music'?courses.replace(/courses$/,'music-customers'):courses+'/calendar-read',music:profile==='music'});
  assert.equal(denied.body.success,false);report.checks.push({step:profile==='music'?'restricted-staff-customer-read-denied':'restricted-staff-calendar-read-denied',pass:true,status:denied.status});
 }

 if(['wrong-item','responsive','cleanup'].includes(phase)){
  const sessions=JSON.parse(readFileSync('/tmp/item-core-next-sessions.json','utf8')),sid=sessions[profile+(phase==='wrong-item'?'B':'')];assert.ok(sid);
  const name=profile==='sports'?'核心運動驗收1028':'核心音樂驗收1028';
  if(new URL(page.url()).searchParams.get('session')!==sid)await page.goto(courses+'?view=schedule&date='+(phase==='wrong-item'?'2026-11-04':'2026-11-03')+'&session='+sid,{waitUntil:'domcontentloaded',timeout:90000});
  const pending=page.getByRole('button',{name:name+(profile==='sports'?'：待點名':'：點名'),exact:true});await pending.waitFor();
  if(phase==='wrong-item'){
   await pending.click();await page.getByRole('button',{name:'繳費／購買方案',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:name+'：已出席',exact:true}).count(),0);
   await page.getByRole('button',{name:'繳費／購買方案',exact:true}).click();const form=page.getByRole('dialog',{name:'學員繳費 · '+name,exact:true});await form.waitFor();
   await page.waitForFunction(()=>document.querySelector('#course-roster-purchase-form select')||document.body.innerText.includes('此項目尚未建立可購買方案'));
   assert.equal(await form.locator('option[value="qa-core-next-20261028-'+profile+'-plan-10"]').count(),0);assert.equal(await form.locator('option[value="qa-core-next-20261028-'+profile+'-plan-20"]').count(),0);
   report.checks.push({step:'item-B-arranged-A-plans-not-used-attendance-blocked',pass:true});await capture('wrong-item-payment');
  }

  if(phase==='cleanup'){
   assert.equal(process.env.QA_ALLOW_ISOLATED_WRITES,'1');
   for(const suffix of ['', 'B']){
    const sessionId=sessions[profile+suffix];if(!sessionId)continue;
    if(suffix)await page.goto(courses+'?view=schedule&date=2026-11-04&session='+sessionId,{waitUntil:'domcontentloaded',timeout:90000});
    await page.getByRole('button',{name:name+(profile==='sports'?'：待點名':'：點名'),exact:true}).waitFor();
    if(profile==='sports'){await page.getByRole('button',{name:'取消課程',exact:true}).click();const dialog=page.getByRole('dialog',{name:'取消課程',exact:true});await dialog.getByRole('button',{name:'確認取消',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:90000});}
    else{await page.getByRole('button',{name:'課程更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'取消本堂',exact:true}).click();await page.getByRole('button',{name:'確認取消本堂課',exact:true}).click();await page.getByRole('button',{name:name+'：點名',exact:true}).waitFor({state:'hidden',timeout:90000});}
    report.checks.push({step:'normal-ui-cancel-owned-test-session',sessionId,pass:true});
   }
  }
  if(phase==='responsive'){
   await page.getByText(/30 堂/).first().waitFor();
   for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('roster-'+width);report.checks.push({step:'native-roster-responsive',width,height,pass:true});}
   await page.getByRole('button',{name:name+' 更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();await page.getByRole('button',{name:'確認購課與本次收款',exact:true}).waitFor();
   assert.equal(await page.getByLabel('所屬店長',{exact:true}).count(),profile==='sports'?1:0);
   for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await capture('purchase-'+width);report.checks.push({step:'native-purchase-responsive',width,height,pass:true});}
  }
 }
 assert.deepEqual(errors,[]);report.complete=true;
}catch(error){report.error=redact(error.message);await capture(phase+'-failure').catch(()=>{});process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'-'+role+'-results.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await context.close();}
