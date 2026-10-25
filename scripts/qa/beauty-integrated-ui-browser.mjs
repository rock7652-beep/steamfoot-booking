// Run from the repo root. All backend imports and all network requests are blocked.
// The bundle and Chromium screenshots are local synthetic evidence, not business QA.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/beauty-integrated-ui-20261025";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-integrated-ui-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  metafile:true,
  define: { "process.env.NODE_ENV": '"development"',"process.env":"{}" },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    if(process.env.QA_BASELINE_BOARD)builder.onLoad({filter:/course-schedule-board\.tsx$/},()=>({contents:readFileSync(process.env.QA_BASELINE_BOARD,"utf8"),loader:"tsx",resolveDir:path.join(root,"src/app/(dashboard)/dashboard/courses")}));
    if(process.env.QA_BASELINE_FORM)builder.onLoad({filter:/course-profile-forms\.tsx$/},()=>({contents:readFileSync(process.env.QA_BASELINE_FORM,"utf8"),loader:"tsx",resolveDir:path.join(root,"src/app/(dashboard)/dashboard/courses")}));
    builder.onResolve({filter:/^node:crypto$/},()=>({path:"crypto-forbidden",namespace:"qa"}));
    builder.onResolve({filter:/^server-only$/},()=>({path:"empty",namespace:"qa"}));
    builder.onResolve({filter:/^next\/dynamic$/},()=>({path:"dynamic",namespace:"qa"}));
    builder.onResolve({filter:/^@\/lib\/(db|course-db|beauty-db|auth)$/},()=>({path:"database-forbidden",namespace:"qa"}));
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "qa" }));
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "qa" }));
    builder.onResolve({ filter: /(?:^|\/)app-link$/ }, () => ({ path: "app-link", namespace: "qa" }));
    builder.onResolve({ filter: /^@\/server\// }, args => ({ path: path.join(root, "src", args.path.slice(2) + ".ts"), namespace: "blocked-server" }));
    builder.onLoad({ filter: /.*/, namespace: "blocked-server" }, args => {
      const source = readFileSync(args.path, "utf8");
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match => match[1]);
      return { contents: names.map(name => `export const ${name} = (...args) => window.qaAction("${name}",...args);`).join("\n"), loader: "js" };
    });
    builder.onLoad({ filter: /.*/, namespace: "qa" }, args => {
      if(args.path==="crypto-forbidden")return {contents:'export const createHash=()=>{throw Error("Server hash path forbidden in synthetic UI")};',loader:"js"};
      if(args.path==="empty")return {contents:'',loader:"js"};
      if(args.path==="database-forbidden")return {contents:'const reject=new Proxy({}, {get(){throw Error("Database access forbidden in synthetic UI")}});export const prisma=reject,coursePrisma=reject,beautyPrisma=reject,auth=reject;',loader:"js"};
      if(args.path==="dynamic")return {contents:'import React from "react";export default loader=>{const C=React.lazy(async()=>{const m=await loader();return {default:m.default??m}});return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(C,props))};',loader:"js",resolveDir:root};
      if (args.path === "navigation") return { contents: `import {useMemo,useSyncExternalStore} from 'react';
        const subscribe=cb=>{window.addEventListener('qa-route',cb);return()=>window.removeEventListener('qa-route',cb)};
        const navigate=href=>{history.replaceState(null,'',href);window.dispatchEvent(new Event('qa-route'))};
        export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);
        export const useSearchParams=()=>{const query=useSyncExternalStore(subscribe,()=>location.search);return useMemo(()=>new URLSearchParams(query),[query]);};
        const router={push:navigate,replace:navigate,refresh:()=>{}};export const useRouter=()=>router;
        export const unstable_rethrow=error=>{throw error};`, loader: "js", resolveDir: root };
      return { contents: `import {createElement} from 'react';
        const Link=({children,prefetch,scroll,...props})=>createElement('a',props,children);
        export default Link;export const AppLink=Link;export const useLinkStatus=()=>({pending:false});`, loader: "js", resolveDir: root };
    });
  } }],
});
const componentCss=readFileSync(path.join(output,"fixture.css"),"utf8");
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);

let browser;const results=[],errors=[];
try {
 browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const page=await browser.newPage();page.on("console",m=>{if(m.type()==="error"){console.error("CONSOLE",m.text());if(m.text().includes("QA COMPONENT STACK"))errors.push(m.text())}});page.on("pageerror",e=>{errors.push(e.message);console.error("PAGE",e.stack)});
 await page.route("**/*",route=>route.request().isNavigationRequest()&&route.request().method()==="GET"&&new URL(route.request().url()).hostname==="synthetic.invalid"?route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):(errors.push("Blocked network: "+route.request().url()),route.abort()));
 await page.goto("https://synthetic.invalid/s/synthetic/admin/dashboard/beauty");
 await page.addStyleTag({path:path.join(output,"fixture.css")});await page.addScriptTag({path:path.join(output,"fixture.js")});
 await page.getByLabel("整合頁面").waitFor();
 if(process.env.QA_BASELINE_FORM){await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,"before-beauty-charge-390.png"),fullPage:true});await browser.close();process.exit(0);}
 async function screen(name){const metrics=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('[role="dialog"]')].filter(n=>n.getAttribute('aria-hidden')!=="true").map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})}));results.push({name,...metrics});await page.screenshot({path:path.join(output,name+".png"),fullPage:true});if(metrics.scrollWidth>metrics.viewport+1)console.log("OVERFLOW",name,metrics.scrollWidth,metrics.viewport);}
 if(!process.env.QA_INTERACTIONS_ONLY)for(const businessModule of ["beauty","sports","music"]){
  await page.getByLabel("整合模組").selectOption(businessModule);
  for(const view of ["charge","purchase","calendar","reservation","rental","staff","personnel","customers","shared"]){
   await page.getByLabel("整合頁面").selectOption(view);
   if(view==="shared"){await page.getByLabel("驗收模組").selectOption(businessModule);}
   for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844],[360,800]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(60);await screen(businessModule+"-"+view+"-"+width);
   }
   if(errors.length)throw Error(errors.join("\n"));
  }
 }
 const checks=[];
 async function check(name,work){if(process.env.QA_CHECK&&name!==process.env.QA_CHECK)return;try{await work();checks.push({name,pass:true});}catch(e){checks.push({name,pass:false,error:e.message});console.error('CHECK',name,e.message)}}
 async function choose(view,businessModule='beauty'){await page.evaluate(()=>{history.replaceState(null,'','/s/synthetic/admin/dashboard/beauty');window.dispatchEvent(new Event('qa-route'));});await page.getByLabel('整合頁面').selectOption(view);await page.getByLabel('整合模組').selectOption(businessModule);await page.waitForTimeout(150);}
 await page.setViewportSize({width:1024,height:768});
 await check('full-roster-customer-purchase-collection-return',async()=>{
  await choose('charge');await choose('full-flow');await page.setViewportSize({width:1366,height:900});const roster=page.getByRole('dialog',{name:'預約清單',exact:true});await roster.getByPlaceholder('搜尋姓名或手機').waitFor();await roster.getByPlaceholder('搜尋姓名或手機').fill('測試顧客');await roster.getByRole('button',{name:/^篩選/}).click();await roster.getByLabel('服務狀態篩選').selectOption('pending');
  const area=roster.getByLabel('預約名單捲動區',{exact:true});await area.evaluate(n=>n.scrollTop=700);await page.waitForTimeout(100);await screen('full-roster-before-1366');
  const names=area.locator('[data-sports-roster-name]');const target=await names.evaluateAll(nodes=>nodes.find(n=>{const r=n.getBoundingClientRect(),p=n.closest('[aria-label="預約名單捲動區"]').getBoundingClientRect();return r.top>p.top+50&&r.bottom<p.bottom-50})?.getAttribute('aria-label'));if(!target)throw Error('No visible roster name');const before=await area.evaluate(n=>n.scrollTop);const fullBefore=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='flow-roster-full').length);
  await area.getByRole('button',{name:target,exact:true}).click();await page.getByRole('button',{name:'購買方案',exact:true}).waitFor();await page.getByRole('button',{name:'購買方案',exact:true}).click();await page.getByRole('button',{name:/返回.*詳情/}).waitFor();await screen('full-purchase-1366');await page.getByRole('button',{name:/返回.*詳情/}).click();await page.getByRole('button',{name:'關閉',exact:true}).filter({visible:true}).last().click();await roster.waitFor();
  if(await roster.getByPlaceholder('搜尋姓名或手機').inputValue()!=='測試顧客'||await roster.getByLabel('服務狀態篩選').inputValue()!=='pending')throw Error('Filters lost');if(Math.abs(await area.evaluate(n=>n.scrollTop)-before)>2)throw Error('Scroll lost after purchase');
  const row=area.locator('li').filter({has:page.getByRole('button',{name:target,exact:true})});await row.getByRole('button',{name:'收款',exact:true}).click();await page.getByRole('dialog',{name:'服務收款',exact:true}).waitFor();await page.getByLabel('本次收款 合成乙').waitFor();await screen('full-roster-collection-1366');await page.getByRole('dialog',{name:'服務收款',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await roster.waitFor();if(Math.abs(await area.evaluate(n=>n.scrollTop)-before)>2)throw Error('Scroll lost after collection');if(await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='flow-roster-full').length)!==fullBefore)throw Error('Full roster unnecessarily reloaded');await screen('full-roster-after-1366');for(const [width,height] of [[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await screen('full-roster-after-'+width);}
 });
 await check('full-cut-paste-conflict-preserve-and-success',async()=>{
  await choose('charge');await choose('full-flow');await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'測試顧客1・長姓名 剪下改期',exact:true}).click();await page.getByRole('dialog',{name:'預約清單',exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'日表',exact:true}).click();await screen(process.env.QA_BASELINE_BOARD?'before-full-cut-1366':'full-cut-1366');if(process.env.QA_BASELINE_BOARD)return;if(await page.getByText('正在核對老師與教室…',{exact:true}).count())throw Error('False loading notice');await page.getByRole('button',{name:/^10:30 貼上課程$/}).first().click();const confirm=page.getByRole('dialog',{name:'貼上／確認改期',exact:true});await confirm.waitFor();await confirm.getByRole('button',{name:'確認貼上',exact:true}).click();await confirm.getByRole('alert').filter({hasText:'合成衝突'}).waitFor();await confirm.getByText('請調整時間、位置或技師，再次確認。',{exact:true}).waitFor();await screen('full-paste-conflict-1366');await page.setViewportSize({width:768,height:1024});await screen('full-paste-conflict-768');await page.setViewportSize({width:390,height:844});await screen('full-paste-conflict-390');await confirm.getByRole('button',{name:'返回選時段',exact:true}).click();await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:/^11:00 貼上課程$/}).first().click();await page.getByRole('button',{name:'確認貼上',exact:true}).click();await confirm.waitFor({state:'hidden'});const moves=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='moveBeautyAppointment'));if(moves.length!==2||moves[0].args[1].id!=='a'||moves[1].args[1].id!=='a'||moves[0].args[1].requestKey!==moves[1].args[1].requestKey)throw Error('Move identity/retry lost');await screen('full-paste-success-1366');
 });
 await check('full-care-failure-retry-handled-and-readonly',async()=>{
  await choose('care-flow');const bookingHref=await page.getByRole('link',{name:'預約',exact:true}).first().getAttribute('href');if(!bookingHref?.includes('tab=%E7%8F%AD%E8%A1%A8&action=booking&customerId=c1'))throw Error('Care booking route wrong');await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'查看全部（8）'}).click();await page.getByRole('button',{name:'關懷',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.locator('textarea').fill('合成關懷保留輸入');await dialog.getByRole('button',{name:'儲存',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'合成儲存失敗'}).waitFor();if(await dialog.locator('textarea').inputValue()!=='合成關懷保留輸入')throw Error('Care draft lost');await page.setViewportSize({width:768,height:1024});await screen('full-care-failed-save-768');await page.setViewportSize({width:390,height:844});await screen('full-care-failed-save-390');await dialog.getByRole('button',{name:'儲存',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('tab',{name:/已處理／已安排/}).click();await page.getByText('合成關懷保留輸入',{exact:false}).waitFor();await screen('full-care-handled-390');await page.getByLabel('關懷唯讀').check();if(await page.getByRole('button',{name:'關懷',exact:true}).count()||await page.getByRole('link',{name:'預約',exact:true}).count())throw Error('Readonly allows edit');
 });
 await check('beauty-charge-save-failure-keeps-input',async()=>{
  await choose('charge');await page.locator('[name="name"]').fill('合成驗收收費');await page.locator('[name="price"]').fill('1000');await page.locator('[name="trialPrice"]').fill('0');await page.locator('[name="trialDuration"]').fill('45');await page.locator('[data-fee-coaches] input[type="checkbox"]').first().check();
  await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('alert').filter({hasText:'合成驗收'}).waitFor();if(await page.locator('[name="name"]').inputValue()!=='合成驗收收費')throw Error('Lost input');if(!(await page.getByText('NT$ 1,000／次',{exact:false}).count()))throw Error('Beauty unit label wrong');await screen('beauty-charge-failed-save-1024');
  await page.setViewportSize({width:390,height:844});if(await page.locator('[name="trialDuration"]').inputValue()!=='45')throw Error('Resize lost duration');await screen('beauty-charge-failed-save-390');await page.getByLabel('收費類型',{exact:true}).selectOption('plan');await page.getByText('總次數 *',{exact:true}).waitFor();await screen('beauty-charge-plan-390');await page.getByRole('button',{name:'關閉',exact:true}).click();await page.getByRole('button',{name:'重新開啟收費'}).waitFor();
 });
 await check('collection-target-loading-lock-and-discount',async()=>{
  await choose('collection');await page.getByLabel('本次收款 合成甲',{exact:true}).waitFor();await page.getByLabel('優惠方式').selectOption('AMOUNT');await page.getByLabel('優惠數值').fill('100');if(await page.getByLabel('本次收款 合成甲').inputValue()!=='900')throw Error('Collection discount wrong');
  await page.evaluate(()=>document.querySelector('[data-qa-target="b"]').click());if(!await page.getByRole('button',{name:'確認收款',exact:true}).isDisabled())throw Error('Can submit prior target while loading');if(await page.getByLabel('本次收款 合成甲').count())throw Error('Prior quote retained');await page.getByLabel('本次收款 合成乙').waitFor();if(await page.getByLabel('本次收款 合成乙').inputValue()!=='1500')throw Error('Prior amount retained');
  for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844],[360,800]]){await page.setViewportSize({width,height});await screen('beauty-collection-'+width);}
  await page.getByRole('button',{name:'確認收款',exact:true}).click();await page.getByRole('alert').filter({hasText:'合成驗收'}).waitFor();const calls=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='collectBeautyPayment'));const submitted=calls.at(-1)?.args[0];if(submitted?.ids?.join()!=='b'||submitted?.amounts?.join()!=='1500')throw Error('Wrong collection payload');
 });
 await check('shared-purchase-discount-calculates-900',async()=>{
  await choose('purchase');await page.getByLabel('優惠方式').selectOption('AMOUNT');await page.getByLabel('優惠數值').fill('100');await page.locator('[name="paymentMethod"]').selectOption('CARD');if(!(await page.getByText('NT$ 900',{exact:true}).count()))throw Error('Wrong payable');await page.getByRole('button',{name:'確認合成收款'}).click();await page.getByRole('status').filter({hasText:'合成收款已核對'}).waitFor();await screen('beauty-purchase-discount-390');
 });
 await check('four-person-reservation-independent-allocation-and-plan-order',async()=>{
  await choose('reservation');await page.setViewportSize({width:1366,height:900});if(await page.getByLabel('使用方案 1',{exact:true}).inputValue()!=='soon')throw Error('Wrong plan priority');
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'＋新增同行者',exact:true}).click();await page.waitForTimeout(420);
  for(let i=1;i<=4;i++){await page.getByLabel(`此位位置 ${i}`,{exact:true}).waitFor();await page.getByLabel(`此位技師 ${i}`,{exact:true}).waitFor();if(i>1&&!await page.getByLabel(`此位位置 ${i}`,{exact:true}).locator('option').first().textContent().then(t=>t.includes('床位'+i)))throw Error('Wrong room arrangement '+i);}
  await page.getByLabel('顧客姓名 2',{exact:true}).click();const duplicate=page.getByRole('option').filter({hasText:'0900000001'});if(await duplicate.getAttribute('aria-disabled')!=='true')throw Error('Duplicate customer allowed');await page.keyboard.press('Escape');
  await screen('beauty-reservation-four-1366');await page.setViewportSize({width:390,height:844});if(await page.locator('[aria-label^="第"][aria-label$="位預約"]').count()!==4)throw Error('Resize lost people');await page.getByRole('button',{name:'確認預約',exact:true}).scrollIntoViewIfNeeded();await screen('beauty-reservation-four-390');
 });
 await check('beauty-calendar-month-week-day-share-controller',async()=>{
  await choose('calendar');await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'日表',exact:true}).click();await page.waitForTimeout(100);await screen('beauty-calendar-day-1366');await page.getByRole('button',{name:'週表',exact:true}).click();await screen('beauty-calendar-week-1366');await page.getByRole('button',{name:'月表',exact:true}).click();await screen('beauty-calendar-month-1366');
 });
 await check('beauty-rental-save-failure-keeps-draft',async()=>{
  await choose('rental');await page.locator('[name="name"]').fill('合成租借人');await page.locator('[name="phone"]').fill('0900000001');await page.getByRole('button',{name:'儲存租借',exact:true}).click();await page.getByText('合成驗收：未連接任何後端；輸入保留。',{exact:true}).waitFor();if(await page.locator('[name="name"]').inputValue()!=='合成租借人')throw Error('Lost rental');await screen('beauty-rental-failed-save-1366');
 });
 await check('beauty-staff-inactive-collapse-and-editor-resize',async()=>{
  await choose('staff');const hidden=page.getByRole('button',{name:'停用測試技師',exact:true});if(await hidden.count())throw Error('Inactive initially expanded');await page.getByRole('button',{name:/停用人員（1）/}).click();await hidden.waitFor();await page.getByRole('button',{name:'測試技師1',exact:true}).click();await page.getByRole('dialog').waitFor();await screen('beauty-staff-editor-basic-1366');await page.getByRole('button',{name:'服務設定',exact:true}).click();await page.waitForTimeout(120);await screen('beauty-staff-editor-services-1366');await page.setViewportSize({width:768,height:1024});await screen('beauty-staff-editor-services-768');await page.setViewportSize({width:390,height:844});await screen('beauty-staff-editor-services-390');await page.getByRole('button',{name:'關閉',exact:true}).click();
 });
 await check('personnel-role-preset-changes-visible-permissions',async()=>{
  await choose('personnel');await page.setViewportSize({width:1024,height:768});await page.getByRole('button',{name:'測試人員長名稱',exact:true}).click();await page.getByRole('button',{name:'後台帳號／權限',exact:true}).click();await screen('beauty-personnel-permissions-before-1024');await page.getByLabel('後台角色',{exact:true}).selectOption('MANAGER');await page.getByText(/進階權限/).click();if(await page.locator('input[name="permission"]:checked').count()!==3)throw Error('Manager preset missing');await page.getByLabel('後台角色',{exact:true}).selectOption('STAFF');if(await page.locator('input[name="permission"]:checked').count()!==1)throw Error('Staff preset missing');await screen('beauty-personnel-permissions-after-1024');await page.getByRole('button',{name:'關閉',exact:true}).click();
 });
 await check('customer-and-purchase-return-preserve-search',async()=>{
  await choose('customers');await page.setViewportSize({width:1366,height:900});const search=page.getByLabel('搜尋姓名、電話或 LINE 名稱',{exact:true});await search.fill('0900000001');await page.waitForTimeout(500);const initialSearch=await search.inputValue();
  await page.getByRole('button',{name:/測試顧客1・長姓名/}).first().click();await page.getByRole('dialog').waitFor();await screen('beauty-customer-detail-1366');await page.setViewportSize({width:390,height:844});await screen('beauty-customer-detail-390');await page.getByRole('button',{name:'購買方案',exact:true}).click();await page.getByRole('button',{name:/返回.*詳情/}).first().waitFor();await screen('beauty-customer-purchase-390');await page.getByRole('button',{name:/返回.*詳情/}).first().click();await page.getByRole('button',{name:'關閉',exact:true}).click();if(await search.inputValue()!==initialSearch)throw Error('Search lost');await search.fill('0900000002');await page.waitForTimeout(500);await page.getByRole('button',{name:/測試顧客2・長姓名/}).first().click();await page.getByRole('dialog').waitFor();if(!await page.getByRole('dialog').textContent().then(t=>t.replace(/[^0-9]/g,'').includes('0900000002')))throw Error('Wrong customer details');await page.getByRole('button',{name:'關閉',exact:true}).click();

 });
 if(!process.env.QA_INTERACTIONS_ONLY)for(const businessModule of ['beauty','sports','music']){
  await choose('shared',businessModule);await page.getByLabel('驗收模組').selectOption(businessModule);
  for(const view of ['settings','analytics','care','consumption','reminders','reminder-settings','manager-settings']){
   await page.getByLabel('驗收頁面').selectOption(view);
   for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844],[360,800]]){await page.setViewportSize({width,height});await screen(businessModule+'-shared-'+view+'-'+width);}
  }
 }
 writeFileSync(path.join(output,'interaction-results.json'),JSON.stringify({synthetic:true,businessAcceptance:false,physicalDevice:false,checks,errors},null,2));
 if(checks.some(c=>!c.pass)||errors.length||results.some(r=>r.scrollWidth>r.viewport+1))process.exitCode=1;

 writeFileSync(path.join(output,"results.json"),JSON.stringify({synthetic:true,businessAcceptance:false,physicalDevice:false,results,errors},null,2));
 console.log("Screens",results.length);
} finally {writeFileSync(path.join(output,"partial-results.json"),JSON.stringify({results,errors},null,2));await browser?.close();}
