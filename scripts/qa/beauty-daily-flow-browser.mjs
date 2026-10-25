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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/beauty-live-issues-ui-20261025";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-daily-flow-ui-fixture.tsx"], bundle: true,
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
const componentCss=(await import("node:fs")).existsSync(path.join(output,"fixture.css"))?readFileSync(path.join(output,"fixture.css"),"utf8"):"";
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);


const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()&&new URL(route.request().url()).hostname==='synthetic.invalid'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):(errors.push('Blocked external network'),route.abort()));
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/beauty');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});


 await page.getByLabel('週日第1段開始',{exact:true}).selectOption('10:30');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.getByLabel('週日第1段開始',{exact:true}).scrollIntoViewIfNeeded();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow||await page.getByLabel('週日第1段開始',{exact:true}).inputValue()!=='10:30')throw Error('Staff time layout/value');
  results.push({view:'staff',width,height,overflow});await page.screenshot({path:path.join(output,'staff-'+width+'.png')});
 }
 await page.getByRole('button',{name:'儲存技師時間',exact:true}).click();
 await page.waitForFunction(()=>window.qaCalls.some(c=>c.name==='staff-save'));
 const staff=await page.evaluate(()=>window.qaCalls.find(c=>c.name==='staff-save').args[0]);
 if(staff.expectedRevision!=='a'.repeat(64)||staff.values.days.find(d=>d.dayOfWeek===0).periods[0].openTime!=='10:30')throw Error('Staff saved wrong value/revision');
 await page.getByLabel('驗收頁面',{exact:true}).selectOption('hours');
 const form=page.getByRole('form',{name:'每週營業時間'});await form.getByLabel('週一第1段開始',{exact:true}).selectOption('10:30');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await form.getByLabel('週一第1段開始',{exact:true}).scrollIntoViewIfNeeded();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow)throw Error('Business hours overflow');results.push({view:'hours',width,height,overflow});await page.screenshot({path:path.join(output,'hours-'+width+'.png')});
 }
 await form.getByRole('button',{name:'儲存每週設定',exact:true}).click();await page.waitForFunction(()=>window.qaCalls.some(c=>c.name==='business-save'));
 const business=await page.evaluate(()=>window.qaCalls.find(c=>c.name==='business-save').args[0]);if(business.expectedRevision!=='a'.repeat(64)||business.values.weeklyDays.find(d=>d.dayOfWeek===1).periods[0].openTime!=='10:30')throw Error('Business saved wrong value/revision');
 if(errors.length)throw Error(errors.join(';'));writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,results,staffSaved:true,businessSaved:true,errors},null,2));console.log(JSON.stringify({screens:results.length,staffSaved:true,businessSaved:true,errors}));
}finally{await browser.close();}
