// Local synthetic preview; no production requests or writes.
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.cwd(),output=process.env.QA_OUTPUT_DIR||'/tmp/beauty-trial-customer-ui';
mkdirSync(output,{recursive:true});
await build({entryPoints:['scripts/qa/beauty-trial-customer-fixture.tsx'],bundle:true,jsx:'automatic',format:'iife',outfile:path.join(output,'fixture.js'),alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'isolated-ports',setup(builder){
 builder.onResolve({filter:/^@\/server\//},args=>({path:path.join(root,'src',args.path.slice(2)+'.ts'),namespace:'server-stub'}));
 builder.onLoad({filter:/.*/,namespace:'server-stub'},args=>({contents:[...readFileSync(args.path,'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match=>['voidBeautyNativeTransaction','assignBeautyNativeCard','prepareBeautyPlanPurchaseIntentAtomic','readBeautyPlanPurchaseIntent','acknowledgeBeautyPlanPurchaseIntent'].includes(match[1])?`export const ${match[1]}=(input)=> '${match[1]}'==='voidBeautyNativeTransaction'?window.qaVoid(input):window.qaPlanAction('${match[1]}',input);`:match[1]==='saveCourseRental'?`export const saveCourseRental=(...args)=>window.qaRentalSave(...args);`:`export const ${match[1]}=(...args)=>{if('${match[1]}'==='collectBeautyPayment'){window.collectionSaved=args;return Promise.resolve({success:true});}throw Error("Unexpected server action in synthetic UI")};`).join('\n'),loader:'js'}));
 builder.onResolve({filter:/^next\/dynamic$/},()=>({path:'dynamic',namespace:'qa-dynamic'}));
 builder.onLoad({filter:/.*/,namespace:'qa-dynamic'},()=>({contents:'export default ()=>()=>null;',loader:'js'}));
 builder.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'qa'}));
 builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'qa'}));
 builder.onLoad({filter:/.*/,namespace:'qa'},args=>({contents:args.path==='navigation'?`const router={push:()=>{},replace:()=>{},refresh:()=>{},prefetch:()=>{}};const params=new URLSearchParams();export const useRouter=()=>router;export const usePathname=()=>'/hq/dashboard/beauty';export const useSearchParams=()=>params;export const unstable_rethrow=error=>{throw error};`:`import {createElement} from 'react';export default ({children,prefetch,...props})=>createElement('a',props,children);export const useLinkStatus=()=>({pending:false});`,loader:'js',resolveDir:root}));
}}]});
const css=await postcss([tailwind({base:root})]).process(readFileSync('src/app/globals.css','utf8'),{from:path.join(root,'src/app/globals.css')});
const sheetCss=readFileSync(path.join(output,'fixture.css'),'utf8');
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}\n${sheetCss}</style><body style="padding:16px;background:#faf8f5"><div id="root"></div><script>${readFileSync(path.join(output,'fixture.js'),'utf8').replaceAll('</script','<\\/script')}</script></body></html>`;
writeFileSync(path.join(output,'preview.html'),html);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[420,900]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   if(route.request().url()==='https://synthetic.invalid/')return route.fulfill({contentType:'text/html',body:html});
   if(new URL(route.request().url()).pathname==='/api/beauty/collection-read'){await new Promise(resolve=>setTimeout(resolve,800));return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[{id:'collection',revision:1,personName:'收款測試',serviceName:'30分鐘肩頸按摩',price:250,discount:{kind:'AMOUNT',value:0},reduction:0,netPrice:250,collected:0,due:250}]})});}
   if(new URL(route.request().url()).pathname==='/api/beauty/customer-read'){const input=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify(input.operation==='cash'?{success:true,status:'OPEN'}:input.operation==='cards'?await page.evaluate(()=>window.qaReadCards):{success:false,error:'隔離預覽未提供此讀取'})});}
   return route.abort();
  });
  await page.goto('https://synthetic.invalid/');await page.getByLabel('安排類型',{exact:true}).selectOption('trial');await page.getByRole('button',{name:'新增顧客 1'}).click();
  await page.getByLabel('新增顧客姓名',{exact:true}).fill('體驗測試顧客');await page.getByLabel('新增顧客電話',{exact:true}).fill('0900000003');
  assert.equal(await page.getByLabel('安排類型',{exact:true}).inputValue(),'trial');assert.equal(await page.getByLabel('服務類型 1',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'確認預約',exact:true}).isDisabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`trial-${width}.png`),fullPage:true});
  await page.setViewportSize({width:Math.max(360,width-160),height});assert.equal(await page.getByLabel('新增顧客姓名',{exact:true}).inputValue(),'體驗測試顧客');
  await page.getByRole('button',{name:'建立並選用',exact:true}).click();await page.getByRole('button',{name:'確認預約',exact:true}).click();
  const submitted=await page.evaluate(()=>window.submitted);assert.equal(submitted.people[0].isTrial,true);assert.equal(submitted.people[0].phone,'0900000003');assert.equal(submitted.people[0].customerId,'synthetic-new');assert.equal(submitted.people[0].cardId,null);
  assert.equal(await page.getByLabel('安排類型',{exact:true}).inputValue(),'trial');assert.equal(await page.getByLabel('服務類型 1',{exact:true}).count(),0);
  await page.setViewportSize({width,height});await page.getByRole('button',{name:'服務項目預覽',exact:true}).click();
  await page.getByRole('heading',{name:'新增服務項目'}).waitFor();
  assert.equal(await page.locator('[name="sportsCompensationMode"], [name="sportsCompensationValue"], [name="price"], [name="trialPrice"]').count(),0);
  await page.getByLabel('測試技師',{exact:true}).check();await page.locator('[name="name"]').fill('全身按摩90');await page.locator('[name="duration"]').fill('90');await page.locator('[name="buffer"]').fill('10');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`service-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'服務項目已建立'}).waitFor();
  const serviceSaved=await page.evaluate(()=>window.serviceSaved);assert.equal(serviceSaved.duration,90);assert.equal(serviceSaved.buffer,10);assert.deepEqual(serviceSaved.rule,{coachIds:['tech'],expectedCoachIds:[]});assert.equal(await page.getByRole('row').filter({hasText:'全身按摩90'}).count(),1);
  assert.equal(await page.getByRole('columnheader',{name:'時間',exact:true}).count(),1);assert.equal(await page.getByRole('columnheader',{name:'整理時間',exact:true}).count(),1);
  const durationCells=page.getByRole('row').filter({hasText:'全身按摩90'});assert.equal(await durationCells.getByRole('cell',{name:'90 分鐘',exact:true}).count(),1);assert.equal(await durationCells.getByRole('cell',{name:'10 分鐘',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,`service-list-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'空間出租預覽',exact:true}).click();
  await page.getByLabel('安排類型',{exact:true}).selectOption('rental');
  assert.equal(await page.getByRole('combobox',{name:/^空間/}).inputValue(),'bed');assert.equal(await page.getByLabel('應收（元）',{exact:true}).inputValue(),'0');
  assert.equal(await page.getByLabel('日期',{exact:true}).inputValue(),'2026-11-03');assert.equal(await page.getByLabel('時間',{exact:true}).inputValue(),'12:30');
  await page.getByLabel('租借人',{exact:true}).fill('租借測試顧客');await page.getByLabel('電話',{exact:true}).fill('0900000003');
  await page.getByLabel('安排類型',{exact:true}).selectOption('service');await page.getByLabel('安排類型',{exact:true}).selectOption('rental');
  assert.equal(await page.getByLabel('租借人',{exact:true}).inputValue(),'租借測試顧客');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`rental-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'儲存租借',exact:true}).click();await page.getByRole('status').filter({hasText:'租借已儲存：2026-11-03'}).waitFor();
  const rental=await page.evaluate(()=>window.rentalSubmitted);assert.equal(rental.module,'beauty');assert.equal(rental.input.roomId,'bed');assert.equal(rental.input.amount,0);assert.equal(rental.input.time,'12:30');
  await page.getByRole('button',{name:'簡化收費預覽',exact:true}).click();
  const chargeDialog=page.getByRole('dialog');await chargeDialog.getByRole('heading',{name:'編輯收費方式'}).waitFor();
  assert.equal(await chargeDialog.locator('[data-charge-trial]').evaluate(el=>el.open),false);assert.equal(await chargeDialog.locator('[data-charge-profit]').evaluate(el=>el.open),false);assert.equal(await chargeDialog.locator('[data-service-qualified-technicians]').count(),1);
  const chargeBox=await chargeDialog.boundingBox();if(width>=768){assert.ok(chargeBox.width<=680);assert.ok(chargeBox.height<650);}
  await page.screenshot({path:path.join(output,`charge-${width}.png`),fullPage:true});await chargeDialog.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'操作完成：收費設定'}).waitFor();
  assert.equal((await page.evaluate(()=>window.chargeSaved)).trialPrice,250);
  await page.getByRole('button',{name:'改期預覽',exact:true}).click();const moveDialog=page.getByRole('dialog');await moveDialog.getByRole('heading',{name:'改期／換技師位置'}).waitFor();const moveBox=await moveDialog.boundingBox();if(width>=768){assert.ok(moveBox.width<=640);assert.ok(moveBox.height<520);}
  await moveDialog.getByLabel('原因／備註',{exact:true}).fill('顧客改期');await page.screenshot({path:path.join(output,`move-${width}.png`),fullPage:true});await moveDialog.getByRole('button',{name:'確認',exact:true}).click();await page.getByRole('status').filter({hasText:'操作完成：改期'}).waitFor();
  assert.equal((await page.evaluate(()=>window.moveSaved)).time,'12:30');
  await page.getByRole('button',{name:'直接收款預覽',exact:true}).click();const collectionDialog=page.getByRole('dialog');await collectionDialog.getByRole('heading',{name:'服務收款'}).waitFor();
  assert.equal(await collectionDialog.getByLabel('本次收款',{exact:true}).isDisabled(),true);assert.equal(await collectionDialog.getByLabel('付款方式',{exact:true}).isEnabled(),true);await collectionDialog.getByLabel('付款方式',{exact:true}).selectOption('BANK_TRANSFER');await page.evaluate(()=>{window.collectionModal=document.querySelector('[role="dialog"]');});
  await collectionDialog.getByLabel('本次收款 收款測試',{exact:true}).waitFor();assert.equal(await collectionDialog.getByLabel('付款方式',{exact:true}).inputValue(),'BANK_TRANSFER');assert.equal(await page.evaluate(()=>window.collectionModal===document.querySelector('[role="dialog"]')),true);
  await page.screenshot({path:path.join(output,`collection-${width}.png`),fullPage:true});await collectionDialog.getByRole('button',{name:'確認收款',exact:true}).click();await page.getByRole('status').filter({hasText:'操作完成：收款'}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'方案現金預覽'}).click();const planMethod=page.locator('[name="paymentMethod"]');assert.equal(await planMethod.inputValue(),'CASH');await page.getByRole('button',{name:'確認方案表單',exact:true}).waitFor();
  await planMethod.selectOption('BANK_TRANSFER');await page.locator('[name="transferLastFour"]').fill('0123');await planMethod.selectOption('CASH');await page.screenshot({path:path.join(output,`plan-cash-${width}.png`),fullPage:true});await page.getByRole('button',{name:'確認方案表單',exact:true}).click();await page.getByRole('status').filter({hasText:'現金購買表單確認完成'}).waitFor();assert.equal((await page.evaluate(()=>window.planPaymentSaved)).paymentMethod,'CASH');
  await page.getByRole('button',{name:'購買完成預覽',exact:true}).click();
  await page.getByRole('combobox',{name:'方案',exact:true}).selectOption('plan:five');
  const checkoutButton=page.getByRole('button',{name:'確認結帳',exact:true});await checkoutButton.waitFor();await checkoutButton.click();
  await page.locator('button[aria-label="查看 購買測試顧客 的有效方案"]').filter({hasText:'5 次'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'確認完成並繼續購買',exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.qaPurchaseCount),1);
  await page.getByRole('region',{name:'持有方案'}).filter({hasText:'全身按摩5次'}).waitFor();
  await page.screenshot({path:path.join(output,`purchase-completed-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  const balanceButton=page.locator('button[aria-label="查看 購買測試顧客 的有效方案"]');
  for(const expected of ['5 次','5 次','4 次']){await page.getByRole('button',{name:'模擬方案背景更新',exact:true}).click();await balanceButton.filter({hasText:expected}).waitFor();}

  await page.getByRole('button',{name:'恢復購買預覽',exact:true}).click();
  await page.getByRole('region',{name:'持有方案'}).filter({hasText:'全身按摩5次'}).waitFor();
  await page.locator('button[aria-label="查看 購買測試顧客 的有效方案"]').filter({hasText:'5 次'}).waitFor();
  assert.equal(await page.evaluate(()=>window.qaPurchaseCount),1);assert.equal(await page.getByRole('button',{name:'確認完成並繼續購買',exact:true}).count(),0);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'作廢預覽',exact:true}).click();
  await page.getByRole('button',{name:'查看 作廢測試顧客 的 全身按摩5次 交易',exact:true}).click();
  await page.getByRole('button',{name:'作廢交易',exact:true}).click();
  await page.getByRole('heading',{name:'作廢交易',exact:true}).waitFor();
  const voidDialog=page.getByRole('dialog');const voidBox=await voidDialog.boundingBox();if(width>=768){assert.ok(voidBox.width<=520);assert.ok(voidBox.height<500);}
  const reason=page.getByLabel('作廢原因（必填）',{exact:true});await reason.fill('誤建測試');await page.screenshot({path:path.join(output,`void-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'確認作廢',exact:true}).click();await page.getByRole('status').filter({hasText:'交易已作廢'}).waitFor();
  assert.equal((await page.evaluate(()=>window.voidSubmitted)).reason,'誤建測試');assert.equal((await page.evaluate(()=>window.voidSubmitted)).expectedStoreId,'synthetic');
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'待核帳作廢預覽',exact:true}).click();
  await page.getByRole('button',{name:'查看 作廢測試顧客 的 全身按摩5次 交易',exact:true}).click();await page.getByRole('button',{name:'作廢交易',exact:true}).click();
  assert.ok((await page.getByRole('dialog').innerText()).includes('待核帳金額 NT$ 5,500 · 尚未發卡'));
  assert.equal((await page.getByRole('dialog').innerText()).includes('原實收'),false);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'卡片預覽'}).click();await page.waitForTimeout(150);
  let rawCardClicks=0;
  for(const mode of ['day','week']){
   if(mode==='week'){await page.getByRole('button',{name:'切換日週'}).click();await page.waitForTimeout(150);}
   for(const id of ['card-20','card-30','card-60']){
    const card=page.locator(`[data-calendar-session="${id}"]`).first();await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();
    for(let attempt=0;attempt<3;attempt++){
     await page.mouse.move(box.x+box.width/2,box.y-5);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.up();rawCardClicks++;
     assert.equal(await page.evaluate(()=>window.cardClicks.length),rawCardClicks);assert.equal(await page.evaluate(()=>window.cardClicks.at(-1)),id);
    }
    await card.evaluate(node=>node.blur());await card.focus();assert.equal(await page.locator('[data-service-card-summary]').isVisible(),true);await page.locator('[data-service-card-summary]').evaluate(node=>{const r=node.getBoundingClientRect();{if(r.left<7||r.top<7||r.right>innerWidth-7||r.bottom>innerHeight-7)throw Error('Summary outside viewport');}node.style.pointerEvents='auto';const points=[[r.left+4,r.top+4],[r.right-4,r.bottom-4]];const visible=points.every(([x,y])=>node.contains(document.elementFromPoint(x,y)));node.style.pointerEvents='none';if(!visible)throw Error('Summary covered or clipped');});await page.screenshot({path:path.join(output,`summary-${mode}-${id}-${width}.png`),fullPage:true});await page.keyboard.press('Escape');assert.equal(await page.locator('[data-service-card-summary]').count(),0);await card.evaluate(node=>node.blur());await card.focus();await page.keyboard.press('Enter');rawCardClicks++;assert.equal(await page.evaluate(()=>window.cardClicks.length),rawCardClicks);
   }
   await page.screenshot({path:path.join(output,`calendar-${mode}-${width}.png`),fullPage:true});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({width,height,rawCardClicks,keyboardCards:true,planDefaultsCash:true,compactCharge:true,compactMove:true,directCollection:true,freeRental:true,rentalPreservesDraft:true,overflow:false,preservedOnResize:true,trialSubmission:true,serviceHasNoPricing:true,serviceCreate90:true,purchaseCompletionImmediate:true,compactVoid:true});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,errors},null,2));console.log(JSON.stringify({output,results,errors},null,2));
}catch(error){console.error(JSON.stringify({errors}));for(const context of browser.contexts())for(const page of context.pages()){writeFileSync(path.join(output,'failure.html'),await page.content());await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();}
