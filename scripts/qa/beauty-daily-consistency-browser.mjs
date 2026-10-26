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

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()&&new URL(r.request().url()).hostname==='synthetic.invalid'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/beauty');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const choose=view=>page.getByLabel('整合頁面',{exact:true}).selectOption(view);
 async function screen(name){const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Overflow '+name);await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});results.push({name,overflow});}
 async function screens(name){for(const[width,height]of[[1366,900],[1920,1080],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await screen(name+'-'+width);}}
 await choose('full-flow');
 let roster=page.getByRole('dialog',{name:'預約清單',exact:true});await roster.getByRole('button',{name:'收款',exact:true}).first().waitFor();const collectBefore=await roster.getByRole('button',{name:'收款',exact:true}).count();await roster.getByRole('button',{name:'收款',exact:true}).first().click();
 const collection=page.getByRole('dialog',{name:'服務收款',exact:true});await collection.getByLabel('優惠方式',{exact:true}).selectOption('AMOUNT');await collection.getByLabel('優惠數值',{exact:true}).fill('1000');
 await collection.getByText('全額折抵，免收款',{exact:true}).waitFor();
 if(await collection.getByLabel('付款方式',{exact:true}).count())throw Error('Zero cash method shown');
 await screens('full-discount');await collection.getByRole('button',{name:'確認折抵',exact:true}).click();await collection.waitFor({state:'hidden'});
 await roster.getByText('免收款',{exact:true}).waitFor();if(await roster.getByRole('button',{name:'收款',exact:true}).count()!==collectBefore-1)throw Error('Settled row still prompts collection');
 const collections=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='collectBeautyPayment'));if(collections.length!==1||collections[0].args[0].amounts[0]!==0||collections[0].args[0].method!=='CASH')throw Error('Duplicate or non-zero collection');
 await screens('settled-roster');
 await choose('charge');await choose('full-flow');await page.setViewportSize({width:1366,height:900});
 await page.getByRole('button',{name:'測試顧客1・長姓名 剪下改期',exact:true}).click();await roster.waitFor({state:'hidden'});await page.getByRole('button',{name:'日表',exact:true}).click();
 await page.getByRole('button',{name:/^10:30 貼上課程$/}).first().click();const confirm=page.getByRole('dialog',{name:'貼上／確認改期',exact:true});await confirm.getByRole('button',{name:'確認貼上',exact:true}).click();await confirm.getByRole('alert').filter({hasText:'合成衝突'}).waitFor();await confirm.getByRole('button',{name:'返回選時段',exact:true}).click();
 await page.getByRole('button',{name:/^11:00 貼上課程$/}).first().click();await page.evaluate(()=>window.qaFailCalendar=true);await confirm.getByRole('button',{name:'確認貼上',exact:true}).click();await confirm.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'重新讀取班表',exact:true}).waitFor();await screens('move-sync-failure');
 const movesBefore=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='moveBeautyAppointment').length);
 await page.evaluate(()=>window.qaFailCalendar=false);await page.getByRole('button',{name:'重新讀取班表',exact:true}).click();await page.getByRole('button',{name:'重新讀取班表',exact:true}).waitFor({state:'hidden'});
 if(await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='moveBeautyAppointment').length)!==movesBefore)throw Error('Calendar retry resubmitted move');
 await screens('move-sync-recovered');
 await choose('charge');await page.evaluate(()=>{delete window.qaDashboardTab;window.qaInitialBooking=true;});await choose('full-flow');
 const booking=page.getByRole('dialog',{name:'新增預約',exact:true});await booking.waitFor();await booking.getByRole('button',{name:'確認預約',exact:true}).waitFor();
 await page.waitForFunction(()=>{const buttons=[...document.querySelectorAll('button')];return buttons.some(b=>b.textContent==='確認預約'&&!b.disabled);});
 const bookingsBefore=await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='bookBeautyParty').length);
 await booking.getByRole('button',{name:'確認預約',exact:true}).click();await booking.waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.qaCalls.some(c=>c.name==='flow-calendar-read'));
 if(await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='bookBeautyParty').length)!==bookingsBefore+1)throw Error('Created duplicate booking');
 await screens('created-calendar');await page.evaluate(()=>window.qaInitialBooking=false);
 await choose('charge');await page.evaluate(()=>window.qaDashboardTab='首頁');await choose('full-flow');await page.getByRole('heading',{name:'首頁工作',exact:true}).waitFor();
 if(await page.getByRole('button',{name:'開店設定引導',exact:true}).count())throw Error('Home guide row retained');await screens('home-no-guide');
 await choose('charge');await page.evaluate(()=>window.qaDashboardTab='設定');await choose('full-flow');await page.getByRole('heading',{name:'設定工作',exact:true}).waitFor();await page.getByRole('button',{name:'開店設定引導',exact:true}).waitFor();await screens('settings-guide-retained');
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(output,'daily-results.json'),JSON.stringify({synthetic:true,actualBackend:false,actualLINE:false,physicalDevice:false,results,errors,collectionCount:collections.length,moveCount:movesBefore,retryResends:0},null,2));console.log(JSON.stringify({output,checks:results.length,errors}));
}finally{await browser.close();}
