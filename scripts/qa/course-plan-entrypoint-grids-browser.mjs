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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-plan-entrypoint-grids";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-plan-entrypoint-grids-fixture.tsx"], bundle: true,
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
 for(const [mode,width,height,total] of [['portal',390,844,10],['portal',360,800,8],['portal',768,1024,10],['admin',1366,900,10],['admin',1024,768,10],['admin',768,1024,10],['admin',600,900,10]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[],reads=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
   if(url.pathname.endsWith('/card-read')){reads.push('cards');await new Promise(r=>setTimeout(r,150));return route.fulfill({json:{success:true,rows:[{id:'synthetic-card',name:'舞蹈（常態）-'+total+'堂',unit:'SESSION',remaining:total,available:total,held:0,members:[{id:'synthetic-member',name:'合成學員'}],entries:[],expired:false,closed:false,expiresAt:'2027-01-24T00:00:00Z',templateIds:[],termSessionIds:[]}],hasMore:false}});}
   if(url.pathname.endsWith('/card-progress-read')){reads.push('progress');await new Promise(r=>setTimeout(r,150));return route.fulfill({json:{success:true,data:{available:true,total,completed:[],shared:false}}});}
   return route.abort();
  });
  await page.goto(`https://synthetic.invalid/hq/dashboard/courses?mode=${mode}&total=${total}`);await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  const assert=(value,message)=>{if(!value)throw Error(message)};
  if(mode==='portal'){await page.locator('.cp-plan>summary').click();await page.locator('.cp-plan [data-lesson-slot]').first().waitFor();}
  else{await page.locator('#preload').click();await page.locator('#preload-state').filter({hasText:'完成'}).waitFor();await page.locator('#open').click();await page.locator('[data-lesson-slot]').first().waitFor();assert(reads.length===2,'Opening reread prefetched data');await page.locator('#open').click();await page.locator('#open').click();await page.locator('[data-lesson-slot]').first().waitFor();assert(reads.length===2,'Reopening reread prefetched data');}
  const grid=page.locator('ol[aria-label="'+total+' 堂進度"]');assert(await grid.locator('li').count()===total,'Incorrect purchased cell count');assert(await grid.locator('time').count()===0,'Reserved/unused plan must remain blank');
  const metrics=await grid.evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,gridWidth:el.getBoundingClientRect().width,cellHeight:el.querySelector('li>span')?.getBoundingClientRect().height}));
  if(mode==='admin')assert(metrics.columns===(metrics.gridWidth>=640?10:5),'Backend columns must follow panel width');
  assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Page overflows');assert(!errors.length,errors.join(';'));
  await page.screenshot({path:path.join(output,`${mode}-${width}-${total}.png`),fullPage:true});results.push({mode,width,height,total,...metrics,reads,pass:true});await page.close();
 }
 writeFileSync(path.join(output,'results.json'),JSON.stringify({scope:'Actual CoursePortalClient plans and CourseCardBrowser/Progress components, full styles, synthetic data and mocked HTTP; not hosted auth or real latency acceptance',results},null,2));console.log(JSON.stringify(results));
}finally{await browser.close()}
