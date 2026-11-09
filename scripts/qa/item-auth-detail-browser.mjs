// Real login; read previous isolated QA fixtures only. Invalid checkout probes
// deliberately stop at validation after authorization and cannot issue cards.
import {createRequire} from 'node:module';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const [module,phase]=process.argv.slice(2);assert.ok(['sports','music'].includes(module));assert.ok(['before','after','panel','boundary','auth'].includes(phase));
const config=JSON.parse(readFileSync('/tmp/item-auth-detail-access.json'));const a=JSON.parse(readFileSync('/tmp/item-auth-detail-credentials.json')).accounts.find(a=>a.module===module);
const base='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';assert.equal(config.base,base);
const root='/tmp/item-auth-detail',out=root+'/'+module;mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/'+module+'-owner-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});const p=await context.newPage();p.setDefaultTimeout(90000);
const report={module,phase,deployment:config.deployment,complete:false,samples:[],requests:[]};
p.on('requestfinished',r=>{const u=new URL(r.url());if(u.pathname.endsWith('music-read')||u.pathname.endsWith('music-period-read')||u.pathname.endsWith('card-read')||r.headers()['next-action'])report.requests.push({path:u.pathname,operation:u.searchParams.get('operation'),durationMs:Math.round(r.timing().responseEnd),action:r.headers()['next-action']??null});});
try{
 await p.goto(config.accessUrl,{waitUntil:'domcontentloaded'});await p.goto(base+'/api/auth/session',{waitUntil:'domcontentloaded'});
 let user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(phase==='boundary')report.samples.push({step:'existing-session-before-login',present:!!user,role:user?.role??null});
 if(!user){await p.goto(base+'/hq/login?store='+a.storeId,{waitUntil:'domcontentloaded'});await p.getByLabel('Email',{exact:true}).fill(a.email);await p.getByLabel('密碼',{exact:true}).fill(a.password);await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>u.pathname.includes('/dashboard'));}
 user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));assert.equal(user?.storeId,a.storeId);assert.equal(user?.role,process.env.QA_EXPECT_ROLE??'OWNER');
 const courses=base+'/s/'+a.slug+'/admin/dashboard/courses';
 if(phase==='boundary')for(const foreign of [false,true]){
  const customerId=foreign?'qa-auth-perf-20261028-24e72f-'+(module==='sports'?'music':'sports')+'-customer':a.customerId;
  for(const endpoint of module==='music'?['card-read','music-period-read']:['card-read']){
   const query=endpoint==='card-read'?'args='+encodeURIComponent(JSON.stringify({customerId})):'customerId='+encodeURIComponent(customerId);
   const result=await p.evaluate(async path=>{const r=await fetch(path,{cache:'no-store'});const b=await r.json();return {status:r.status,success:b.success,count:b.rows?.length??b.data?.length??null,remaining:b.totals?.reduce((n,r)=>n+r.remaining,0)??null};},courses+'/'+endpoint+'?'+query);
   const expected=!foreign&&(process.env.QA_EXPECT_ROLE??'OWNER')==='OWNER';assert.equal(result.success,expected);
   if(expected){assert.equal(result.count,6);if(endpoint==='card-read')assert.equal(result.remaining,60);}
   report.samples.push({step:endpoint+(foreign?'-foreign-denied':'-own-scope'),role:user.role,...result});
  }
 }
 const openPlans=p.getByRole('button',{name:module==='music'?`查看 ${a.name} 的學費與堂數`:`查看 ${a.name} 的有效方案`,exact:true});
 if(phase==='panel'){await p.goto(courses+'?view=customers&search='+encodeURIComponent(a.name),{waitUntil:'domcontentloaded'});await openPlans.waitFor();await p.waitForLoadState('networkidle');}
 for(let sample=1;!['boundary','auth'].includes(phase)&&sample<=3;sample++){
  const start=performance.now();if(phase==='panel')await openPlans.click();else await p.goto(courses+'?view=customers&search='+encodeURIComponent(a.name)+'&customerId='+encodeURIComponent(a.customerId)+(module==='music'?'&studentTab=courses':''),{waitUntil:'domcontentloaded'});
  await (module==='music'?p.getByText(/第 6 次購課/):p.getByText(/總剩餘 60 堂/)).first().waitFor();
  if(module==='music')await p.getByText('60 堂',{exact:true}).first().waitFor();
  report.samples.push({step:phase==='panel'?'ready-page-plan-click-to-visible':module==='music'?'student-profile-six-purchases-visible':'student-profile-plan-balance-visible',sample,elapsedMs:Math.round(performance.now()-start),remaining:60});
  writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
  if(phase==='panel'){await p.getByRole('button',{name:'關閉',exact:true}).last().click();await openPlans.waitFor();await p.waitForLoadState('networkidle');}
 }
 await p.screenshot({path:out+'/'+phase+'.png',fullPage:true});
 if(phase==='after')for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
  await p.setViewportSize({width,height});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.screenshot({path:out+'/after-'+width+'.png',fullPage:true});report.samples.push({step:'profile-responsive-no-overflow',width,height});
 }
 for(let sample=1;!['panel','boundary'].includes(phase)&&sample<=3;sample++){
  const result=await p.evaluate(async path=>{const start=performance.now();const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/plain;charset=UTF-8','Next-Action':'40b0116a08da873a8c4abc0721d67aafe37b52e964'},body:'[{}]'});const text=await r.text();let error=null;for(const line of text.split('\n')){try{const result=JSON.parse(line.slice(line.indexOf(':')+1));if(result?.success===false)error=result.error;}catch{}}return {status:r.status,elapsedMs:Math.round(performance.now()-start),invalid:text.includes('"success":false'),error};},courses);
  assert.equal(result.status,200);assert.equal(result.invalid,true);if(phase==='auth')assert.match(result.error??'',/expected string|必要|必填|Required|缺少|資料格式/i);report.samples.push({step:'authorization-then-invalid-checkout-no-financial-write',sample,...result});
 }
 report.complete=true;
}catch(e){report.failure=String(e);await p.screenshot({path:out+'/'+phase+'-failure.png',fullPage:true}).catch(()=>{});report.visibleText=await p.locator('body').innerText().catch(()=>'');process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,visibleText:report.visibleText?'saved privately':undefined}));await context.close();}
