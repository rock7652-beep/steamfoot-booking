// Real login; read previous isolated QA fixtures only. Invalid checkout probes
// deliberately stop at validation after authorization and cannot issue cards.
import {createRequire} from 'node:module';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('/opt/codex/cua_node/lib/node_modules/playwright');
const [module,phase]=process.argv.slice(2);assert.ok(['sports','music'].includes(module));assert.ok(['before','after'].includes(phase));
const config=JSON.parse(readFileSync('/tmp/item-auth-detail-access.json'));const a=JSON.parse(readFileSync('/tmp/item-auth-detail-credentials.json')).accounts.find(a=>a.module===module);
const base='https://steamfoot-booking-git-release-mu-6d7b97-rock7652-2111s-projects.vercel.app';assert.equal(config.base,base);
const root='/tmp/item-auth-detail',out=root+'/'+module;mkdirSync(out,{recursive:true});
const context=await chromium.launchPersistentContext(root+'/'+module+'-owner-profile',{executablePath:'/usr/bin/chromium',headless:true,viewport:{width:1366,height:900},args:['--no-sandbox','--disable-dev-shm-usage'],...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===base||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});const p=await context.newPage();p.setDefaultTimeout(90000);
const report={module,phase,deployment:config.deployment,complete:false,samples:[],requests:[]};
p.on('requestfinished',r=>{const u=new URL(r.url());if(u.pathname.endsWith('music-read')||r.headers()['next-action'])report.requests.push({path:u.pathname,operation:u.searchParams.get('operation'),durationMs:Math.round(r.timing().responseEnd),action:r.headers()['next-action']??null});});
try{
 await p.goto(config.accessUrl,{waitUntil:'domcontentloaded'});await p.goto(base+'/api/auth/session',{waitUntil:'domcontentloaded'});
 let user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));
 if(!user){await p.goto(base+'/hq/login?store='+a.storeId,{waitUntil:'domcontentloaded'});await p.getByLabel('Email',{exact:true}).fill(a.email);await p.getByLabel('密碼',{exact:true}).fill(a.password);await p.getByRole('button',{name:'登入',exact:true}).click();await p.waitForURL(u=>u.pathname.includes('/dashboard'));}
 user=await p.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(s=>s?.user));assert.equal(user?.storeId,a.storeId);assert.equal(user?.role,'OWNER');
 const courses=base+'/s/'+a.slug+'/admin/dashboard/courses';
 for(let sample=1;sample<=3;sample++){
  const start=performance.now();await p.goto(courses+'?view=customers&search='+encodeURIComponent(a.name)+'&customerId='+encodeURIComponent(a.customerId)+(module==='music'?'&studentTab=courses':''),{waitUntil:'domcontentloaded'});
  await (module==='music'?p.getByText(/第 6 次購課/):p.getByText(/總剩餘 60 堂/)).first().waitFor();
  if(module==='music')await p.getByText('60 堂',{exact:true}).first().waitFor();
  report.samples.push({step:module==='music'?'student-profile-six-purchases-visible':'student-profile-plan-balance-visible',sample,elapsedMs:Math.round(performance.now()-start),remaining:60});
  writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});
 }
 await p.screenshot({path:out+'/'+phase+'.png',fullPage:true});
 for(let sample=1;sample<=3;sample++){
  const result=await p.evaluate(async path=>{const start=performance.now();const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/plain;charset=UTF-8','Next-Action':'40b0116a08da873a8c4abc0721d67aafe37b52e964'},body:'[{}]'});const text=await r.text();return {status:r.status,elapsedMs:Math.round(performance.now()-start),invalid:text.includes('"success":false')};},courses);
  assert.equal(result.status,200);assert.equal(result.invalid,true);report.samples.push({step:'authorization-then-invalid-checkout-no-financial-write',sample,...result});
 }
 report.complete=true;
}catch(e){report.failure=String(e);await p.screenshot({path:out+'/'+phase+'-failure.png',fullPage:true}).catch(()=>{});report.visibleText=await p.locator('body').innerText().catch(()=>'');process.exitCode=1;}
finally{writeFileSync(out+'/'+phase+'.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,visibleText:report.visibleText?'saved privately':undefined}));await context.close();}
