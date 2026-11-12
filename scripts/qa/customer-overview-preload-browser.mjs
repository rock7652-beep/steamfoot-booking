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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/customer-overview-preload-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/customer-overview-preload-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  metafile:true,
  define: { "process.env.NODE_ENV": '"development"',"process.env":"{}" },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    builder.onResolve({filter:/server\/actions\//},()=>({path:"mock-actions",namespace:"qa-actions"}));
    builder.onLoad({filter:/.*/,namespace:"qa-actions"},()=>({contents:'export const browseCourseCards=async()=>({success:false,error:"unexpected action"}); export const loadCourseCardReservations=browseCourseCards;export const loadMusicStudentWorkspace=browseCourseCards;export const loadCourseCustomerPurchases=browseCourseCards;export const loadCourseCustomerBookings=async()=>({success:true,data:[],hasMore:false});',loader:"js"}));
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
const results=[],errors=[];
try{
 for(const size of [{width:1366,height:900},{width:1024,height:768},{width:768,height:1024}]){
  const page=await browser.newPage({viewport:size});let reads=0,progressReads=0,beautyReads=0;const beautyOps=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
   if(route.request().url().includes('/api/beauty/customer-read')){
    beautyReads++;const body=route.request().postDataJSON();beautyOps.push([body.operation,body.input]);
    if(body.store!=='synthetic')throw Error('Beauty store scope missing');
    if(body.operation==='cards')return route.fulfill({json:{success:true,rows:[{id:'card',name:'合成十堂方案',unit:'SESSION',remaining:9,available:9,held:0,members:[{name:'合成學員'}],entries:[],expiresAt:'2027-02-01T00:00:00Z'}],hasMore:false}});
    if(body.operation==='progress')return route.fulfill({json:{success:true,data:{purchasedAt:'2026-11-10T08:00:00Z',price:8000,progress:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z'}],voided:[]}}}});
    if(body.operation==='support')return route.fulfill({json:{success:true,data:{membership:{success:true},advanced:{success:true,data:{customer:{followUps:[],lineLinkedAt:null,lineBindingCodeCreatedAt:null}}}}}});
    throw Error('Unexpected Beauty read');
   }
   if(route.request().url().includes('/card-read?')){reads++;await new Promise(resolve=>setTimeout(resolve,80));return route.fulfill({json:{success:true,rows:[{id:'card',name:'合成十堂方案',unit:'SESSION',remaining:9,available:9,held:0,members:[{name:'合成學員'}],expiresAt:'2027-02-01T00:00:00Z'}],hasMore:false,progress:[{cardId:'card',result:{success:true,data:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z',customerName:'合成學員'}],shared:false,canReadPrice:true,purchasePrice:8000,purchasedAt:'2026-11-10T08:00:00Z'}}}]}});}
   if(route.request().url().includes('/card-progress-read?'))progressReads++;
   return route.abort();
  });
  await page.goto('https://synthetic.invalid/hq/dashboard/courses?view=customers');
  await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  // Cold opening also returns the cards and dated grid in one request.
  await page.getByRole('button',{name:'開啟顧客'}).click();
  await page.locator('[data-lesson-slot]').first().waitFor();
  if(progressReads)throw Error('Cold opening retained a client progress waterfall');
  if(await page.locator('[data-lesson-slot]').count()!==10)throw Error('Incomplete cold grid');
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'預讀',exact:true}).click();await page.getByRole('button',{name:'預讀完成'}).waitFor();
  for(const music of [false,true]){
   if(music)await page.getByRole('button',{name:'運動',exact:true}).click();
   const before=reads;
   await page.getByRole('button',{name:'開啟顧客'}).click();
   await page.locator('[data-lesson-slot]').first().waitFor();
   if(await page.locator('[data-lesson-slot]').count()<10)throw Error('Expected ten lesson cells');
   if(await page.locator('[data-completed="true"]').count()<1)throw Error('Expected one completed lesson');
   if(reads!==before||progressReads)throw Error('Opening a prefetched customer issued another request');
   if(await page.getByText('讀取上課進度中…').count())throw Error('Progress flashed a loading state');
   if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw Error('Horizontal page overflow');
   await page.screenshot({path:path.join(output,`${music?'music':'sports'}-${size.width}x${size.height}.png`)});
   await page.getByRole('button',{name:/合成十堂方案/}).click();
   await page.getByRole('region',{name:'方案詳情'}).waitFor();
   if(await page.getByText('讀取方案詳細資料中').count())throw Error('Prepared detail still showed a loader');
   if(reads!==before||progressReads)throw Error('Prepared detail made a second read');
   await page.screenshot({path:path.join(output,`detail-${music?'music':'sports'}-${size.width}x${size.height}.png`)});
   await page.getByRole('button',{name:'關閉',exact:true}).click();
   results.push({...size,music,reads,progressReads});
  }
  await page.getByRole('button',{name:'美業',exact:true}).click();
  await page.getByRole('button',{name:'預讀',exact:true}).click();await page.getByRole('button',{name:'預讀完成'}).waitFor();
  const beautyPrepared=beautyReads;
  await page.getByRole('button',{name:'開啟顧客'}).click();await page.locator('[data-lesson-slot]').first().waitFor();
  await page.getByRole('button',{name:/合成十堂方案/}).click();await page.getByRole('region',{name:'方案詳情'}).waitFor();
  if(beautyReads!==beautyPrepared||await page.getByText(/讀取方案詳細資料中|讀取使用紀錄中/).count())throw Error('Beauty detail did not reuse the prepared resource');
  await page.screenshot({path:path.join(output,`detail-beauty-${size.width}x${size.height}.png`)});
  results.push({...size,module:'beauty',beautyReads,beautyOps,preparedDetail:true});
  await page.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({output,results}));
}finally{await browser.close();}
