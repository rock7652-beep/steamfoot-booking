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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-copy-cleanup";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-copy-cleanup-fixture.tsx"], bundle: true,
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
const results=[];
try{
 for(const [mode,width,height] of [['roster',1366,900],['roster',1024,768],['roster',768,1024],['portal',390,844],['portal',360,800]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
  await page.goto('https://synthetic.invalid/hq/dashboard/courses?mode='+mode);await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  const assert=(value,message)=>{if(!value)throw Error(message)};
  if(mode==='roster'){
   await page.getByRole('button',{name:'合成學員 預約詳情',exact:true}).waitFor();const text=await page.locator('body').innerText();
   for(const removed of ['點名前核對方案','未指定所屬店長','無標籤','尚無備註','合計 10','點名時扣','待確認','本堂用量'])assert(!text.includes(removed),'Redundant text remains: '+removed);
   for(const retained of ['本次','1 堂','可用 10 堂'])assert(text.includes(retained),'Required information missing: '+retained);
   assert(await page.getByRole('button',{name:'合成學員 查看或修改標籤',exact:true}).count()===1,'Label action lost');
   assert(await page.getByRole('button',{name:'合成學員 本次備註',exact:true}).count()===1,'Note action lost');
  }else{
   await page.locator('.cp-plan>summary').click();await page.locator('.cp-plan [data-lesson-slot]').first().waitFor();
   assert(await page.locator('[data-lesson-slot]').count()===10,'Grid cells changed');
   const plan=page.locator('.cp-plan'),text=await plan.innerText();
   assert(!text.includes('尚無上課紀錄')&&!text.includes('尚無課堂'),'Empty lesson copy remains');
   assert(text.match(/上課紀錄/g)?.length===1,'Lesson heading repeated');assert(!text.includes('已收 NT$ 0'),'Closed payment detail leaked into overview');assert(!text.includes('購買 10 堂'),'Quantity repeated');
   await page.getByText('繳費明細',{exact:true}).click();assert((await plan.innerText()).includes('已收 NT$ 0'),'Financial data was deleted');await page.getByText('繳費明細',{exact:true}).click();
  }
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Page overflows');assert(!errors.length,errors.join(';'));
  await page.screenshot({path:path.join(output,mode+'-'+width+'.png'),fullPage:true});results.push({mode,width,height,pass:true});await page.close();
 }
 writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Actual roster/portal components with full styles, synthetic data; all network and server actions blocked; not authenticated business QA',results},null,2));console.log(JSON.stringify(results));
}finally{await browser.close()}
