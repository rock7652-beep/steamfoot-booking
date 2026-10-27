// Actual login and server routes against the guarded disposable PostgreSQL database.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {assertSportsLiveFlowQaEnvironment} from '../sports-live-flow-qa-scope.mjs';
assertSportsLiveFlowQaEnvironment(process.env);
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const {PrismaClient}=require('@prisma/client'),{PrismaClient:CourseClient}=require('../../generated/course-client'),{PrismaClient:BeautyClient}=require('../../generated/beauty-client');
const db=new PrismaClient(),course=new CourseClient(),beauty=new BeautyClient();
const base='http://localhost:3107',out='/tmp/operations-integration/writes';mkdirSync(out,{recursive:true});
const results=[],errors=[],external=[];let browser,currentPage;
const allStores=['sports','music','dance','beauty','steam'];
const selected=process.argv.find(value=>value.startsWith('--stores='))?.slice(9).split(',');
if(selected?.some(key=>!allStores.includes(key)))throw Error('Unknown QA store');
const stores=selected??allStores;
if(selected&&existsSync(out+'/results.json')){const prior=JSON.parse(readFileSync(out+'/results.json','utf8'));if(prior.realDatabase===true)results.push(...prior.results.filter(result=>result.pass&&!stores.includes(result.store)));}
const config=key=>({key,storeId:key==='sports'?'sports-live-flow-store':'ops-'+key,slug:key==='sports'?'sports-live-flow':'ops-'+key,email:key==='sports'?'sports-owner@example.invalid':'ops-'+key+'@example.invalid'});
function persist(complete=false){writeFileSync(out+'/results.json',JSON.stringify({complete,scope:'real local login, actual Next routes, disposable PostgreSQL; no production data',realDatabase:true,physicalIPad:false,results,errors,externalRequestsBlocked:external.length},null,2));}
async function open(page,url){await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});await Promise.race([page.getByRole('navigation',{name:'營運頁籤',exact:true}).waitFor({timeout:180000}),page.getByRole('button',{name:'重試',exact:true}).waitFor({timeout:180000}).then(()=>{throw Error('Dashboard entered its error boundary');})]);await page.waitForLoadState('networkidle',{timeout:30000}).catch(()=>{});}
async function login(store){
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname)||['data:','blob:'].includes(url.protocol))return route.continue();external.push(url.origin);return route.abort();});
 const page=await context.newPage();currentPage=page;page.setDefaultTimeout(45000);
 page.on('pageerror',error=>{errors.push({store:store.key,message:error.message,stack:error.stack});persist();});
 await page.goto(base+'/hq/login?store='+store.slug,{waitUntil:'domcontentloaded',timeout:180000});
 await page.getByLabel('Email',{exact:true}).fill(store.email);await page.getByLabel('密碼',{exact:true}).fill('isolated-sports-test-only');await page.getByRole('button',{name:'登入',exact:true}).click();
 await page.waitForURL(url=>url.pathname.includes('/dashboard'),{timeout:180000});
 const identity=await page.evaluate(()=>fetch('/api/auth/session').then(r=>r.json()).then(session=>({role:session.user?.role,storeId:session.user?.storeId})));
 assert.equal(identity.storeId,store.storeId);assert.equal(identity.role,'OWNER');
 results.push({store:store.key,step:'actual-login',pass:true});persist();console.log(JSON.stringify(results.at(-1)));
 return {page,context,dashboard:base+'/s/'+store.slug+'/admin/dashboard'};
}

const {toLocalDateStr,toLocalMonthStr}=await import('../../src/lib/date-utils.ts');
const ExcelJS=require('exceljs');
function record(store,step,extra={}){if(errors.length)throw Error('Browser error: '+errors[0].message);results.push({store:store.key,step,pass:true,...extra});persist();console.log(JSON.stringify(results.at(-1)));}
async function poll(read,test,label){for(let attempt=0;attempt<40;attempt++){const value=await read();if(test(value))return value;await new Promise(resolve=>setTimeout(resolve,500));}throw Error(label+' did not persist');}
async function initializeDrawer(page,dashboard,store){
 let session=await db.cashDrawerSession.findFirst({where:{storeId:store.storeId}});
 if(!session){
  await page.goto(dashboard+'/cash-drawer',{waitUntil:'domcontentloaded',timeout:180000});
  await page.locator('input[name=openingBookBalance]').fill('1000');await page.locator('input[name=openingActualCash]').fill('1000');
  await page.getByRole('button',{name:'啟用現金抽屜',exact:true}).click();
  session=await poll(()=>db.cashDrawerSession.findFirst({where:{storeId:store.storeId}}),row=>!!row,'drawer initialization');
 }
 assert.equal(Number(session.openingActualCash),1000);record(store,'drawer-initialization',{sessionId:session.id});
 return session;
}
async function manualIncome(page,dashboard,store){
 const note='隔離全流程驗收-'+store.key;
 let entries=await db.cashbookEntry.findMany({where:{storeId:store.storeId,note}});
 if(!entries.length){
  await open(page,dashboard+'/revenue?area=cashbook');await page.getByRole('button',{name:'＋ 新增記帳',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.locator('input[name=entryKind][value=OTHER]').check({force:true});
  await dialog.locator('input[name=amount]').fill('100');await dialog.locator('select[name=paymentMethod]').selectOption('CASH');await dialog.locator('textarea[name=note]').fill(note);
  await dialog.getByRole('button',{name:'儲存',exact:true}).click();
  entries=await poll(()=>db.cashbookEntry.findMany({where:{storeId:store.storeId,note}}),rows=>rows.length>0,'manual income');
 }
 assert.equal(entries.length,1);assert.equal(Number(entries[0].amount),100);record(store,'manual-income-once',{amount:100});
}
async function courseFlows(page,dashboard,store){
 let order=await course.coursePurchase.findUniqueOrThrow({where:{id:store.storeId+'-pending'}});
 if(order.status==='PENDING'){
  await open(page,dashboard+'/revenue?kind=plans');await page.getByRole('button',{name:/查看.*交易/}).first().click();
  await page.getByRole('dialog').getByRole('button',{name:'確認核帳並發卡',exact:true}).click();
  order=await poll(()=>course.coursePurchase.findUnique({where:{id:order.id}}),row=>row?.status==='CONFIRMED','purchase confirmation');
 }
 assert.ok(order.cardId);const purchaseEntry=await db.cashbookEntry.findUniqueOrThrow({where:{id:'course-purchase:'+order.id}});assert.equal(Number(purchaseEntry.amount),5000);record(store,'purchase-confirmed-once',{amount:5000});
 let receipts=await course.courseTrialPayment.findMany({where:{storeId:store.storeId,bookingId:store.storeId+'-trial',status:'SUCCESS'}});
 if(!receipts.length){
  await open(page,dashboard+'/revenue?kind=trial');await page.getByText('查看名單／體驗收款',{exact:true}).click();
  await page.getByRole('button',{name:'待收 $500',exact:true}).first().click();
  const dialog=page.getByRole('dialog').last();await dialog.locator('input[type=number]').first().fill('500');await dialog.locator('select').first().selectOption('CASH');
  await dialog.getByRole('button',{name:'確認已收款',exact:true}).click();
  receipts=await poll(()=>course.courseTrialPayment.findMany({where:{storeId:store.storeId,bookingId:store.storeId+'-trial',status:'SUCCESS'}}),rows=>rows.length>0,'trial collection');
 }
 assert.equal(receipts.length,1);assert.equal(receipts[0].amount,500);record(store,'trial-collected-once',{amount:500});
 let refunds=await course.coursePurchaseRefund.findMany({where:{purchaseId:order.id}});
 if(!refunds.length){
  await open(page,dashboard+'/revenue?kind=plans');await page.getByRole('button',{name:/查看.*交易/}).first().click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'登錄退款',exact:true}).click();await dialog.getByLabel('退款金額（元）',{exact:true}).fill('400');await dialog.locator('select').selectOption('BANK_TRANSFER');await dialog.getByLabel('退款原因',{exact:true}).fill('隔離驗收退款');
  await dialog.getByRole('button',{name:'登錄退款並停用方案',exact:true}).click();
  refunds=await poll(()=>course.coursePurchaseRefund.findMany({where:{purchaseId:order.id}}),rows=>rows.length>0,'refund');
 }
 assert.equal(refunds.length,1);assert.equal(refunds[0].amount,400);const card=await course.coursePointCard.findUniqueOrThrow({where:{id:order.cardId}});assert.equal(card.remaining,0);assert.ok(card.closedAt);
 assert.equal(Number((await db.cashbookEntry.findUniqueOrThrow({where:{id:'course-refund:'+refunds[0].id}})).amount),400);record(store,'refund-and-card-retirement-once',{amount:400});
 await open(page,dashboard+'/revenue?area=monthly&month='+toLocalMonthStr());
 let revisions=await course.courseMonthlySettlement.findMany({where:{storeId:store.storeId,month:toLocalMonthStr()}});
 if(!revisions.length){await page.getByRole('button',{name:'確認月結',exact:true}).click();await page.getByRole('button',{name:'確認',exact:true}).click();revisions=await poll(()=>course.courseMonthlySettlement.findMany({where:{storeId:store.storeId,month:toLocalMonthStr()}}),rows=>rows.length>0,'monthly confirmation');}
 assert.equal(revisions.length,1);record(store,'monthly-version-created',{revision:revisions[0].revision});
 let payments=await course.courseFeePayment.findMany({where:{storeId:store.storeId,sessionId:store.storeId+'-session',voidedAt:null}});
 if(!payments.length){
  await open(page,dashboard+'/revenue?area=monthly&month='+toLocalMonthStr());await page.getByRole('button',{name:/(?:教師|老師|教練)授課費/}).click();
  await page.getByText('明細 ＋',{exact:true}).first().click();await page.getByRole('button',{name:'登錄已付',exact:true}).first().click();
  await page.getByLabel('本次已付金額',{exact:true}).fill('500');await page.getByLabel('付款備註',{exact:true}).fill('隔離驗收授課費付款');await page.getByRole('button',{name:'確認登錄',exact:true}).click();
  payments=await poll(()=>course.courseFeePayment.findMany({where:{storeId:store.storeId,sessionId:store.storeId+'-session',voidedAt:null}}),rows=>rows.length>0,'fee payment');
 }
 assert.equal(payments.length,1);assert.equal(payments[0].amount,500);assert.equal(Number((await db.cashbookEntry.findUniqueOrThrow({where:{id:'course-fee:'+payments[0].id}})).amount),500);record(store,'fee-payment-linked-once',{amount:500});
}
async function beautyFlows(page,dashboard,store){
 async function refundForm(label){
  await open(page,dashboard+'/revenue');await page.getByRole('row').filter({hasText:label}).getByRole('button',{name:/查看.*交易/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'登錄退款',exact:true}).click();await dialog.getByLabel('退款金額（元）',{exact:true}).fill('400');await dialog.locator('select').selectOption('BANK_TRANSFER');await dialog.getByLabel('退款原因',{exact:true}).fill('隔離驗收美業退款');await dialog.getByRole('button',{name:'登錄退款',exact:true}).click();return dialog;
 }
 const blocked=await refundForm('驗收按摩服務');await blocked.getByRole('status').filter({hasText:'請先取消服務並核對拆帳再退款'}).waitFor();
 assert.equal(await beauty.beautyPayment.count({where:{storeId:store.storeId,kind:'REFUND',originalPaymentId:store.storeId+'-sale'}}),0);record(store,'completed-service-refund-guard');
 let refunds=await beauty.beautyPayment.findMany({where:{storeId:store.storeId,kind:'REFUND',originalPaymentId:store.storeId+'-cancel-sale'}});
 if(!refunds.length){await refundForm('驗收已取消服務');refunds=await poll(()=>beauty.beautyPayment.findMany({where:{storeId:store.storeId,kind:'REFUND',originalPaymentId:store.storeId+'-cancel-sale'}}),rows=>rows.length>0,'cancelled beauty service refund');}
 assert.equal(refunds.length,1);assert.equal(refunds[0].amount,-400);record(store,'beauty-cancelled-service-refund-once',{amount:400});
 await open(page,dashboard+'/revenue?area=income');assert.equal(await page.getByRole('heading',{name:'技師服務費',exact:true}).count(),0);record(store,'income-no-duplicate-fees');
 await open(page,dashboard+'/revenue?area=monthly');let rows=await beauty.beautySettlement.findMany({where:{storeId:store.storeId,month:toLocalMonthStr()}});
 if(!rows.length){await page.getByRole('button',{name:'確認月結',exact:true}).click();await page.getByRole('button',{name:'確認',exact:true}).click();rows=await poll(()=>beauty.beautySettlement.findMany({where:{storeId:store.storeId,month:toLocalMonthStr()}}),values=>values.length>0,'beauty monthly');}
 assert.equal(rows.length,1);record(store,'beauty-monthly-confirmed');
}
async function steamFlows(page,dashboard,store){
 let refunds=await db.transaction.findMany({where:{storeId:store.storeId,transactionType:'REFUND'}});
 if(!refunds.length){await open(page,dashboard+'/revenue');const row=page.getByRole('row').filter({hasText:'5,000'});await row.getByRole('button',{name:'開啟交易詳情',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'退款',exact:true}).click();await dialog.getByPlaceholder('退款原因（必填）',{exact:true}).fill('隔離驗收蒸足套餐退款');await dialog.getByRole('button',{name:'確認退款',exact:true}).click();refunds=await poll(()=>db.transaction.findMany({where:{storeId:store.storeId,transactionType:'REFUND'}}),rows=>rows.length>0,'steam refund');}
 assert.equal(refunds.length,1);assert.equal(Number(refunds[0].amount),-5000);const wallet=await db.customerPlanWallet.findUniqueOrThrow({where:{id:store.storeId+'-wallet'}});assert.equal(wallet.remainingSessions,0);record(store,'steam-package-refund-once',{amount:5000});
 await open(page,dashboard+'/revenue?area=monthly');assert.equal(await page.getByRole('button',{name:'登錄已付',exact:true}).count(),0);record(store,'steam-monthly-without-personnel-fees');
}
async function closeDrawer(page,dashboard,store){
 let session=await db.cashDrawerSession.findFirstOrThrow({where:{storeId:store.storeId}});
 if(session.status!=='CLOSED'){
  await page.goto(dashboard+'/cash-drawer',{waitUntil:'domcontentloaded',timeout:180000});await page.getByRole('button',{name:/^閉店點錢/}).click();
  const dialog=page.getByRole('dialog');const input=dialog.locator('input[name=closingActualCash]');const expected=Number((await input.getAttribute('placeholder')).replace(/[^0-9]/g,''));
  await input.fill(String(expected-50));await dialog.locator('textarea[name=note]').fill('隔離點錢短少50驗收');await dialog.getByRole('button',{name:'完成今日閉店點錢',exact:true}).click();
  session=await poll(()=>db.cashDrawerSession.findUnique({where:{id:session.id}}),row=>row?.status==='CLOSED','drawer close');
 }
 assert.equal(Number(session.closingDifference),-50);record(store,'drawer-count-difference',{difference:-50});
 await page.goto(dashboard+'/cash-drawer',{waitUntil:'domcontentloaded',timeout:180000});await page.getByText(/現金差異核對 · 本月/).click();await page.getByRole('cell',{name:'隔離點錢短少50驗收',exact:true}).waitFor();record(store,'drawer-difference-visible');
}
async function exportAndResponsive(page,dashboard,store){
 await open(page,dashboard+'/revenue?area=exports&reportView=data&dateFrom='+toLocalDateStr().slice(0,7)+'-01&dateTo='+toLocalDateStr());
 await page.getByLabel('匯出類型（必填）').selectOption('transactions');
 const downloading=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:'匯出 Excel',exact:true}).click();const download=await downloading;const file=out+'/'+store.key+'-transactions.xlsx';await download.saveAs(file);
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(file);assert.ok(workbook.worksheets.length>0);record(store,'actual-excel-download',{worksheets:workbook.worksheets.map(sheet=>sheet.name)});
 for(const area of ['ledger','monthly'])for(const [width,height]of [[1024,768],[768,1024]]){await page.setViewportSize({width,height});await open(page,dashboard+'/revenue'+(area==='ledger'?'':'?area='+area));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:out+'/'+store.key+'-'+area+'-'+width+'.png',fullPage:true});record(store,'responsive-'+area,{width,height});}
 await page.setViewportSize({width:1366,height:900});await open(page,dashboard+'/cashbook?month='+toLocalMonthStr());assert.ok(new URL(page.url()).pathname.startsWith('/s/'+store.slug+'/admin/dashboard/revenue'));record(store,'legacy-link-keeps-store');
}
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const key of stores){const store=config(key),{page,context,dashboard}=await login(store);await initializeDrawer(page,dashboard,store);await manualIncome(page,dashboard,store);if(['sports','music','dance'].includes(key))await courseFlows(page,dashboard,store);else if(key==='beauty')await beautyFlows(page,dashboard,store);else await steamFlows(page,dashboard,store);await closeDrawer(page,dashboard,store);await exportAndResponsive(page,dashboard,store);await context.close();}
 assert.equal(errors.length,0);persist(true);console.log(JSON.stringify({complete:true,checks:results.length,errors:errors.length}));
}catch(error){errors.push({message:error.message,stack:error.stack});persist();if(currentPage&&!currentPage.isClosed()){await currentPage.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});writeFileSync(out+'/failure.txt',await currentPage.locator('body').innerText().catch(()=>''));}console.error(error.message);process.exitCode=1;}finally{await browser?.close();await db.$disconnect();await course.$disconnect();await beauty.$disconnect();}
