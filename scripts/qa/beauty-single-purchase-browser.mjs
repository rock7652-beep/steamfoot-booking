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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/beauty-single-purchase-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-single-purchase-fixture.tsx"], bundle: true,
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
const errors=[],results=[],reads=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='synthetic.invalid'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
  if(url.pathname==='/api/beauty/customer-read'){
   const b=route.request().postDataJSON();reads.push(b);if(b.store!=='synthetic')throw Error('Wrong read store');
   if(b.operation==='services')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,storeId:'synthetic',customerId:b.input,catalog:[{id:'service',name:'單次按摩',configured:true}],hasMore:false,rows:[{id:'existing',serviceId:'service',name:'既有按摩預約',isTrial:false,startsAt:'2026-10-28T01:00:00Z',price:1100,collected:0,due:1100}]})});
   if(b.operation==='cash')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'OPEN'})});
   if(b.operation==='support')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成進階資料未載入'})});
   if(['cards','purchases','bookings'].includes(b.operation))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,rows:[],data:[],totals:[],hasMore:false})});
  }
  errors.push('Blocked network '+url.pathname);return route.abort();
 });
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/beauty?customerId=customer');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 async function screens(view){for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error(view+' page overflow');if(view==='collection'){const action=page.getByRole('button',{name:'確認收款',exact:true});await action.scrollIntoViewIfNeeded();const box=await action.boundingBox();if(!box||box.y<0||box.y+box.height>height+1)throw Error('Collection action obscured');}results.push({view,width,height,overflow});await page.screenshot({path:path.join(output,view+'-'+width+'.png')});}}
 await page.getByLabel('消費類型',{exact:true}).waitFor();await screens('plan');
 await page.getByLabel('消費類型',{exact:true}).selectOption('service');await page.getByText('既有按摩預約 · 單次',{exact:true}).waitFor();await screens('existing');
 await page.getByRole('button',{name:'收款',exact:true}).click();await page.getByRole('button',{name:'確認收款',exact:true}).waitFor();
 if((await page.evaluate(()=>window.qaCalls)).some(c=>c.name==='bookBeautyParty'))throw Error('Existing service was rebooked');
 await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'新增單次／體驗服務',exact:true}).click();
 if(await page.getByLabel('使用方案 1',{exact:true}).count())throw Error('Item scheduling unexpectedly asks for a sales package');
 await page.getByLabel('服務類型 1',{exact:true}).selectOption('__trial__');await page.getByText('應收 NT$ 750',{exact:false}).waitFor();await screens('trial');
 await page.getByRole('button',{name:'確認預約',exact:true}).click();await page.getByRole('button',{name:'確認收款',exact:true}).waitFor();await screens('collection');
 const calls=await page.evaluate(()=>window.qaCalls),book=calls.filter(c=>c.name==='bookBeautyParty');if(book.length!==1||book[0].args[1].people[0].isTrial!==true)throw Error('Trial booking mismatch');
 if(calls.some(c=>['assignBeautyNativeCard','purchaseBeautyPlan','collectBeautyPayment'].includes(c.name)))throw Error('Unexpected financial write');
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,lineSends:false,physicalDevice:false,results,reads,calls,errors},null,2));console.log(JSON.stringify({screens:results.length,bookingCalls:book.length,errors}));
}finally{await browser.close();}
