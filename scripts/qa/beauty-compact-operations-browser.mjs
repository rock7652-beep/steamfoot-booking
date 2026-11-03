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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/beauty-compact-operations-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-compact-operations-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  metafile:true,
  define: { "process.env.NODE_ENV": '"development"',"process.env":"{}" },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
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
const componentCss=(await import("node:fs")).existsSync(path.join(output,"fixture.css"))?readFileSync(path.join(output,"fixture.css"),"utf8"):"";
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);


const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
const assert=(condition,message)=>{if(!condition)throw Error(message)};
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='synthetic.invalid'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
  if(url.hostname==='synthetic.invalid'&&url.pathname==='/api/reports/store-revenue')return route.fulfill({contentType:'application/json',body:JSON.stringify({kpi:{totalRevenue:0,refundAmount:0,netRevenue:0,txCount:0,customerCount:0,avgPerCustomer:0},summary:[],paymentMethods:[],data:[],total:0})});
  errors.push('Blocked network '+url.pathname);return route.abort();
 });
 await page.goto('https://synthetic.invalid/hq/dashboard/beauty?tab=營運');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 await page.getByLabel('驗收頁面',{exact:true}).waitFor();
 const choose=async view=>{await page.getByLabel('驗收頁面',{exact:true}).selectOption(view);};
 for(const size of [{width:1440,height:1000},{width:1366,height:900},{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(size);
  for(const view of ['ledger','income','cashbook','monthly','exports','reports','customers']){
   await choose(view);
   await page.screenshot({path:path.join(output,`${view}-${size.width}.png`),fullPage:true});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Overflow ${view} ${size.width}`);
   if(view==='customers'&&size.width>=1366){
    const fields=await Promise.all(['搜尋姓名、電話或 LINE 名稱','依顧客標籤篩選','LINE 綁定','所屬店長','排序方式'].map(label=>page.getByLabel(label,{exact:true}).boundingBox()));
    assert(fields.every(box=>box&&Math.abs(box.y-fields[0].y)<2),`Customer controls wrap at ${size.width}`);
   }
   if(view==='income'&&size.width>=1366){
    const tabs=await page.getByRole('navigation',{name:'營運頁籤'}).boundingBox();
    const date=await page.getByLabel('分類開始日期',{exact:true}).boundingBox();
    assert(Math.abs(tabs.y-date.y)<15,`Dates not aligned with tabs at ${size.width}`);
   }
   results.push({view,...size,overflow:false});
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 await choose('ledger');
 await page.getByLabel('開始日期',{exact:true}).fill('2026-11-02');
 await page.waitForFunction(()=>location.search.includes('dateFrom=2026-11-02'));
 assert(new URL(page.url()).searchParams.get('dateTo')==='2026-11-30','Portaled date lost paired date');
 assert(new URL(page.url()).searchParams.get('status')==='CONFIRMED','Portaled date lost secondary filter');
 results.push({case:'portaled date retains full form',passed:true});
 await choose('customers');
 assert(await page.getByLabel('LINE 綁定',{exact:true}).count()===1,'LINE filter absent');
 assert(await page.getByRole('button',{name:/^篩選/}).count()===0,'Beauty filters still collapsed');
 assert(!await page.getByText('上課狀態',{exact:true}).count(),'Removed visit filter still shown');
 await page.getByLabel('LINE 綁定',{exact:true}).selectOption('linked');
 await page.waitForFunction(()=>new URLSearchParams(location.search).get('status')==='linked');
 results.push({case:'beauty LINE filter navigation',passed:true});
 await choose('course-customers');
 assert(await page.getByLabel('上課狀態',{exact:true}).count()===1,'Course visit filter removed');
 assert(await page.getByLabel('推薦紀錄',{exact:true}).count()===1,'Course referral filter removed');
 results.push({case:'course filters preserved',passed:true});
 await choose('slots');await page.getByRole('button',{name:'管理時段',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:/09:00 開放/}).waitFor();
 assert(await dialog.getByRole('spinbutton').count()===0,'Beauty capacity control leaked');
 assert((await page.evaluate(()=>window.qaCalls)).filter(call=>call.name==='applyDaySlotOverrides').length===0,'Writes before confirmation');
 await dialog.getByRole('button',{name:/09:00 開放/}).click();
 await page.screenshot({path:path.join(output,'slots-draft-1440.png'),fullPage:true});
 await page.evaluate(()=>{window.failSave=true;});
 await dialog.getByRole('button',{name:'確認並儲存',exact:true}).click();
 await page.getByText('合成儲存失敗，草稿已保留',{exact:true}).waitFor();
 assert(await dialog.getByRole('button',{name:/09:00 關閉/}).count()===1,'Failed save lost draft');
 await page.evaluate(()=>{window.failSave=false;});
 await dialog.getByRole('button',{name:'確認並儲存',exact:true}).click();
 await dialog.waitFor({state:'detached'});
 const saved=(await page.evaluate(()=>window.qaCalls)).filter(call=>call.name==='applyDaySlotOverrides').at(-1).args[0];
 assert(saved.expectedStoreId==='synthetic'&&saved.expectedHoursRevision==='synthetic-revision','Missing store or revision guard');
 assert(saved.changes[0].action==='disable'&&saved.changes[0].capacity===undefined,'Unexpected slot command');
 for(const width of [1024,768]){
  await page.setViewportSize({width,height:1024});await page.getByRole('button',{name:'管理時段',exact:true}).click();
  await dialog.getByRole('button',{name:/09:00 開放/}).waitFor();await page.screenshot({path:path.join(output,`slots-${width}.png`),fullPage:true});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Slot dialog overflow');
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
 }
 await page.evaluate(()=>{window.failLoad=true;});await page.getByRole('button',{name:'管理時段',exact:true}).click();
 await dialog.getByRole('alert').waitFor();
 assert(await dialog.getByRole('button',{name:'確認並儲存',exact:true}).isDisabled(),'Save enabled after load failure');
 await page.evaluate(()=>{window.failLoad=false;});await dialog.getByRole('button',{name:'重試',exact:true}).click();
 await dialog.getByRole('button',{name:/09:00 開放/}).waitFor();await dialog.getByRole('button',{name:'取消',exact:true}).click();
 results.push({case:'slot draft, failed save, retry, scope guards and iPad',passed:true});
 await page.evaluate(()=>{window.previewRestricted=true;});
 await page.getByRole('button',{name:'管理時段',exact:true}).click();
 await dialog.getByRole('button',{name:'前往可測試日期',exact:true}).waitFor();
 assert(await dialog.getByRole('button',{name:'確認並儲存',exact:true}).count()===0,'Blocked preview still exposes save');
 await dialog.getByRole('button',{name:'前往可測試日期',exact:true}).click();
 await dialog.getByRole('button',{name:/09:00 開放/}).click();
 await dialog.getByRole('button',{name:'確認並儲存',exact:true}).click();await dialog.waitFor({state:'detached'});
 const quickSaved=(await page.evaluate(()=>window.qaCalls)).filter(call=>call.name==='applyDaySlotOverrides').at(-1).args[0];
 assert(quickSaved.date==='2030-11-03','Quick start saved the original calendar date');
 results.push({case:'preview quick start loads and saves the permitted fixture date',passed:true});
 assert(errors.length===0,errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,errors},null,2));
 console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser.close();}
