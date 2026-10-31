import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {X509Certificate,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const shares=JSON.parse(readFileSync('/tmp/silverlily-preview-shares.json','utf8'));
const access=JSON.parse(readFileSync('/tmp/silverlily-preview-access.json','utf8'));
const extra=JSON.parse(readFileSync('/tmp/silverlily-preview-extra-accounts.json','utf8'));
const origin=new URL(shares.optimized).origin;
const out='/workspace/reports/silverlily-calendar-loading-20261031/final';mkdirSync(out,{recursive:true});
const configs=[{key:'sports',email:access.email,slug:'sports-live-flow',path:'courses',add:'＋ 排課',field:'排課教學項目',formTitle:'新增排課',rosterId:'course-operation-title'},...extra.map(a=>({key:a.module,email:a.email,slug:a.module==='music'?'lubymusic':'beauty-hosted-20261021',path:a.module==='music'?'courses':'beauty',add:a.module==='music'?'＋ 排課':'新增預約',field:a.module==='music'?'排課日期':'預約日期',formTitle:a.module==='music'?'新增排課':'新增預約',rosterId:a.module==='music'?'course-operation-title':'beauty-roster-title'}))];
const cert=new X509Certificate(readFileSync('/usr/local/share/ca-certificates/environment-proxy-ca.crt')),pin=createHash('sha256').update(cert.publicKey.export({type:'spki',format:'der'})).digest('base64');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-certificate-errors-spki-list='+pin],proxy:{server:process.env.HTTPS_PROXY}});
const report={commit:'884089c34be399ebf57c85dee6f3a9f5bcc8ab52',origin,scope:'three isolated synthetic stores, normal owner login, no submitted booking/attendance/payment writes',samples:[],checks:[],errors:[]};let page;
const save=()=>writeFileSync(out+'/results.json',JSON.stringify(report,null,2));
const target=async(p,cfg)=>{
 await p.getByRole('button',{name:'日表',exact:true}).click();
 const id=cfg.key==='sports'?'qa1469-20261030-sports-session':cfg.key==='music'?'qa1469-20261030-music-session':'qa1469-20261030-beauty-booking';
 const row=p.locator(`[data-calendar-session="${id}"]`).first();await row.waitFor();return row;
};
const form=p=>p.locator('[role="dialog"][aria-labelledby="course-panel-title"]');
async function bounds(locator,width,height){const r=await locator.boundingBox();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify({width,height,box:r}));}
try{
 for(const cfg of configs.filter(c=>!process.env.CALENDAR_QA_MODULES||process.env.CALENDAR_QA_MODULES.split(',').includes(c.key))){
  assert.ok(cfg.email.endsWith('@example.invalid'));const context=await browser.newContext({viewport:{width:1366,height:900}});page=await context.newPage();page.setDefaultTimeout(45000);page.on('dialog',d=>d.accept());page.on('pageerror',e=>report.errors.push({module:cfg.key,error:e.message}));
  await page.goto(shares.optimized,{waitUntil:'domcontentloaded'});await page.getByLabel('Email',{exact:true}).fill(cfg.email);await page.getByLabel('密碼',{exact:true}).fill(access.password);await page.getByRole('button',{name:'登入',exact:true}).click();await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:90000});report.checks.push({module:cfg.key,check:'normal-login',pass:true});save();console.log(cfg.key,'login passed');
  const url=origin+`/s/${cfg.slug}/admin/dashboard/${cfg.path}?date=2026-11-27&scheduleView=month`+(cfg.key==='beauty'?'&tab='+encodeURIComponent('班表'):'');
  for(let sample=0;sample<(cfg.key==='sports'?5:2);sample++){
   await page.goto(url,{waitUntil:'load'});const add=page.getByRole('button',{name:cfg.add,exact:true});await add.waitFor();await page.waitForTimeout(1200);
   const start=performance.now();await add.click();await form(page).getByRole('heading',{name:cfg.formTitle,exact:true}).waitFor();const shellMs=Math.round(performance.now()-start);await form(page).getByLabel(cfg.field,{exact:true}).waitFor();const firstPaintMs=Math.round(performance.now()-start);
   if(cfg.key==='sports')await form(page).getByText('正在讀取排課資料…',{exact:true}).waitFor({state:'hidden'});
   const data={module:cfg.key,sample,warmup:sample===0,kind:'schedule',shellMs,firstPaintMs,authoritativeMs:Math.round(performance.now()-start)};report.samples.push(data);save();console.log(JSON.stringify(data));
   await form(page).getByRole('button',{name:'關閉',exact:true}).click();await form(page).waitFor({state:'hidden'});
   const buttons=await target(page,cfg);
   const rs=performance.now();await buttons.click();const list=page.locator(`[role="dialog"][aria-labelledby="${cfg.rosterId}"]`);await list.waitFor();const rshell=Math.round(performance.now()-rs);
   await list.locator('[aria-busy="true"] li, input[placeholder="搜尋姓名或手機"]').first().waitFor();const namesMs=Math.round(performance.now()-rs);await list.getByPlaceholder('搜尋姓名或手機').waitFor();
   const rd={module:cfg.key,sample,warmup:sample===0,kind:'roster',shellMs:rshell,firstPaintMs:namesMs,authoritativeMs:Math.round(performance.now()-rs)};report.samples.push(rd);save();console.log(JSON.stringify(rd));
   await list.getByRole('button',{name:'關閉',exact:true}).click();await list.waitFor({state:'hidden'});
  }
  for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
   await page.setViewportSize({width,height});await page.getByRole('button',{name:cfg.add,exact:true}).click();await form(page).getByLabel(cfg.field,{exact:true}).waitFor();await bounds(form(page),width,height);
   const time=form(page).locator('input[type="time"]').first();await time.fill('10:30');await page.setViewportSize({width:width===1366?1024:1366,height:900});assert.equal(await time.inputValue(),'10:30');await page.setViewportSize({width,height});
   await page.screenshot({path:out+`/${cfg.key}-schedule-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'form-bounds-and-draft-retention',width,height,pass:true});
   await form(page).getByRole('button',{name:'關閉',exact:true}).click();await form(page).waitFor({state:'hidden'});
   await (await target(page,cfg)).click();const list=page.locator(`[role="dialog"][aria-labelledby="${cfg.rosterId}"]`);await list.getByPlaceholder('搜尋姓名或手機').waitFor();await bounds(list,width,height);await page.screenshot({path:out+`/${cfg.key}-roster-${width}.png`,fullPage:true});report.checks.push({module:cfg.key,check:'roster-bounds',width,height,pass:true});await list.getByRole('button',{name:'關閉',exact:true}).click();save();
  }
  await context.close();
 }
 report.complete=true;save();
}catch(e){report.failure=e.message.replace(/https?:\/\/\S+/g,'[URL]');save();console.error(report.failure);if(page)await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;}finally{await browser.close();}
