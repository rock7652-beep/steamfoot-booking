// Actual hosted acceptance for one dedicated synthetic Preview tenant.
// Private configuration and login/storage files must never enter the repository.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const config=JSON.parse(readFileSync('/tmp/operations-remote-config.json','utf8'));
const login=JSON.parse(readFileSync('/tmp/operations-remote-login.json','utf8'));
const allowed='https://steamfoot-booking-cts12spz6-rock7652-2111s-projects.vercel.app';
assert.equal(config.base,allowed);assert.equal(config.store,'ops-music-20261027');assert.equal(login.store,config.store);
assert.equal(new URL(config.accessUrl).origin,allowed);
const phase=process.argv[2]??'read',out='/tmp/operations-music-remote';mkdirSync(out,{recursive:true,mode:0o700});
const reportPath=out+'/results.json',statePath=out+'/browser-state.json';
const report=existsSync(reportPath)?JSON.parse(readFileSync(reportPath,'utf8')):{scope:'Actual remote Preview, dedicated synthetic tenant only',commit:config.commit,results:[],errors:[]};
const persist=()=>writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});
if(report.results.some(r=>r.phase===phase&&r.pass)){console.log('Phase already confirmed; no repeat writes:',phase);process.exit(0);}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true,...(existsSync(statePath)?{storageState:statePath}:{})});
await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===allowed||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});
const page=await context.newPage();page.setDefaultTimeout(45000);
page.on('pageerror',error=>{report.errors.push({phase,message:error.message});persist();});
const dashboard=allowed+'/s/'+config.store+'/admin/dashboard';
async function open(path){await page.goto(dashboard+path,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForLoadState('networkidle',{timeout:30000});}
async function summary(expected){const total=page.locator('[aria-label="營運摘要"] span').filter({hasText:/^淨收款/}).locator('strong');await assert.doesNotReject(async()=>{await total.waitFor();});assert.equal(Number((await total.innerText()).replace(/[^0-9.-]/g,'')),expected);}
try{
 await page.goto(config.accessUrl,{waitUntil:'domcontentloaded',timeout:120000});
 let identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).catch(()=>({})));
 if(identity?.user?.storeId!==config.store){
  await page.goto(allowed+'/hq/login?store='+config.store,{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByLabel('Email',{exact:true}).fill(login.email);await page.getByLabel('密碼',{exact:true}).fill(login.password);await page.getByRole('button',{name:'登入',exact:true}).click();
  await page.waitForURL(u=>u.pathname.includes('/dashboard'),{timeout:120000});
  identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()));
 }
 assert.equal(identity?.user?.storeId,config.store);assert.equal(identity?.user?.role,'OWNER');await context.storageState({path:statePath});
 if(phase==='read'){
  for(const [area,label]of [['ledger','營收明細'],['income','收入分類'],['cashbook','現金帳'],['monthly','月結管理'],['exports','報表匯出']]){
   await open('/revenue?area='+area);await page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor();
   assert.equal(await page.getByRole('navigation',{name:'營運頁籤',exact:true}).getByRole('link').count(),5);
   assert.equal(await page.getByRole('navigation',{name:'營運頁籤',exact:true}).getByRole('link',{name:label,exact:true}).getAttribute('aria-current'),'page');
   await page.screenshot({path:out+'/'+area+'-desktop.png',fullPage:true});
  }
  await open('/courses?view=customers&customerId='+config.store+'-customer&studentTab=courses&studentPeriods='+config.store+'-card:1');
  await page.getByRole('button',{name:'補登收款',exact:true}).first().waitFor();
  await page.screenshot({path:out+'/native-tuition.png',fullPage:true});
 }else if(phase==='receipt1'||phase==='receipt2'){
  if(!report.databaseConfirmedWrites?.[phase]){
  await open('/courses?view=customers&customerId='+config.store+'-customer&studentTab=courses&studentPeriods='+config.store+'-card:1');
  await page.getByRole('button',{name:'補登收款',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:/補登.*收款/});
  await dialog.locator('input[name=amount]').fill(phase==='receipt1'?'3200':'6400');
  await dialog.locator('input[name=date]').fill(phase==='receipt1'?'2026-10-26':'2026-10-27');
  await dialog.locator('select[name=method]').selectOption('BANK_TRANSFER');await dialog.locator('input[name=lastFour]').fill('1234');
  await dialog.getByRole('button',{name:'儲存收款',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:90000});
  }
  await open('/revenue?dateFrom=2026-10-01&dateTo=2026-10-27');await summary(phase==='receipt1'?3200:9600);
  await page.screenshot({path:out+'/'+phase+'.png',fullPage:true});
 }else if(phase==='refund'){
  await open('/revenue?kind=plans');await page.getByRole('button',{name:/查看.*交易/}).first().click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'登錄退款',exact:true}).click();await dialog.getByLabel('退款金額（元）',{exact:true}).fill('400');await dialog.locator('select').selectOption('BANK_TRANSFER');await dialog.getByLabel('退款原因',{exact:true}).fill('營運音樂隔離遠端驗收退款');
  await dialog.getByRole('button',{name:'登錄退款並停用方案',exact:true}).click();await dialog.getByText('退款已登錄，方案已停用。',{exact:true}).waitFor();
  await open('/revenue');await summary(9200);await page.screenshot({path:out+'/refund.png',fullPage:true});
 }else if(phase==='monthly'){
  await open('/revenue?area=monthly&month=2026-10');
  if(!report.databaseConfirmedWrites?.monthlyConfirmation){await page.getByRole('button',{name:'確認月結',exact:true}).click();await page.getByRole('button',{name:'確認',exact:true}).click();}
  await page.getByRole('status').filter({hasText:/^已確認$/}).waitFor();
  await page.getByRole('button',{name:/(?:教師|老師|教練)授課費/}).click();await page.getByText('明細 ＋',{exact:true}).first().click();
  if(!report.databaseConfirmedWrites?.monthlyFee){await page.getByRole('button',{name:'登錄已付',exact:true}).first().click();
  await page.getByLabel('本次已付金額',{exact:true}).fill('500');await page.getByLabel('付款備註',{exact:true}).fill('營運音樂隔離遠端驗收授課費');await page.getByRole('button',{name:'確認登錄',exact:true}).click();
  await page.getByLabel('付款備註',{exact:true}).waitFor({state:'hidden'});}
  await page.getByRole('button',{name:'登錄已付',exact:true}).waitFor({state:'hidden'});await page.waitForLoadState('networkidle');await page.screenshot({path:out+'/monthly.png',fullPage:true});
 }else if(phase==='export'){
  await open('/revenue?area=exports&reportView=data&dateFrom=2026-10-01&dateTo=2026-10-27');
  await page.getByLabel('匯出類型（必填）').selectOption('transactions');const pending=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:'匯出 Excel',exact:true}).click();const download=await pending;await download.saveAs(out+'/transactions.xlsx');
  const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.readFile(out+'/transactions.xlsx');
  function sum(name,header){const sheet=book.getWorksheet(name);assert.ok(sheet,'Missing sheet '+name);const index=sheet.getRow(1).values.indexOf(header);assert.ok(index>0);let total=0;for(let i=2;i<=sheet.rowCount;i++)total+=Number(sheet.getRow(i).getCell(index).value??0);return total;}
  assert.equal(sum('方案分次收款','本次實收'),9600);assert.equal(sum('退款發生','退款金額'),400);report.sheets=book.worksheets.map(s=>s.name);
 }else if(phase==='responsive'){
  for(const [width,height]of [[1024,768],[768,1024]])for(const area of ['ledger','monthly']){await page.setViewportSize({width,height});await open('/revenue?area='+area);await page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+area+'-'+width+'.png',fullPage:true});}
 }else if(phase==='periods'){
  for(const [day,expected]of [['2026-10-26',3200],['2026-10-27',6000]]){await open('/revenue?dateFrom='+day+'&dateTo='+day);await summary(expected);await page.screenshot({path:out+'/cashflow-'+day+'.png',fullPage:true});}
  await open('/cashbook?dateFrom=2026-10-26&dateTo=2026-10-27');await page.waitForURL(u=>u.pathname===new URL(dashboard).pathname+'/revenue'&&u.searchParams.get('area')==='cashbook');
  await open('/revenue?area=income&dateFrom=2026-10-01&dateTo=2026-10-27');assert.equal(await page.getByRole('heading',{name:/授課費|技師服務費/}).count(),0);
  await open('/revenue?dateFrom=2026-10-01&dateTo=2026-10-27');await summary(9200);
 }else throw Error('Unknown acceptance phase');
 assert.equal(report.errors.length,0);report.results.push({phase,pass:true});persist();console.log(JSON.stringify({phase,pass:true}));
}catch(error){report.errors.push({phase,message:error.message});persist();await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});console.error(error.message);process.exitCode=1;}
finally{await context.storageState({path:statePath}).catch(()=>{});await browser.close();}
