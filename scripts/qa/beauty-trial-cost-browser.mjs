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
const errors=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()&&new URL(route.request().url()).hostname==='synthetic.invalid'?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):(errors.push('Blocked external network'),route.abort()));
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/beauty');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});

 await page.getByLabel('售價',{exact:true}).fill('1100');
 await page.getByLabel('體驗價格',{exact:true}).fill('750');
 await page.getByLabel('店家固定費用',{exact:true}).fill('300');
 await page.getByLabel('體驗店家費用',{exact:true}).fill('150');
 if(!await page.locator('[data-charge-allocation]').innerText().then(t=>t.includes('一般服務：店家 $300／所屬店長 $800')&&t.includes('體驗：店家 $150／所屬店長 $600')))throw Error('Incorrect preview');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});
  const input=page.getByLabel('體驗店家費用',{exact:true});await input.scrollIntoViewIfNeeded();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow||await input.inputValue()!=='150')throw Error('Cost field layout/value mismatch');
  results.push({width,height,overflow,value:await input.inputValue()});
  const save=page.getByRole('button',{name:'儲存',exact:true});if(!await save.isVisible())throw Error('Save hidden');
  await page.screenshot({path:path.join(output,'cost-'+width+'.png'),fullPage:true});
 }
await page.getByLabel('體驗店家費用',{exact:true}).fill('');
 if(!(await page.locator('[data-charge-allocation]').innerText()).includes('體驗：店家 $300／所屬店長 $450'))throw Error('Blank inheritance mismatch');
 await page.getByLabel('體驗店家費用',{exact:true}).fill('0');
 if(!(await page.locator('[data-charge-allocation]').innerText()).includes('體驗：店家 $0／所屬店長 $750'))throw Error('Zero override mismatch');
 await page.getByLabel('收費類型',{exact:true}).selectOption('plan');
 if(await page.getByLabel('體驗店家費用',{exact:true}).count())throw Error('Trial fee leaked into plan');
 await page.getByLabel('售價',{exact:true}).fill('5000');
 await page.getByLabel('店家固定費用',{exact:true}).fill('1500');
 await page.locator('[name="points"]').fill('5');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.getByLabel('店家固定費用',{exact:true}).scrollIntoViewIfNeeded();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Plan overflow');
  results.push({mode:'plan',width,height,overflow});await page.screenshot({path:path.join(output,'plan-'+width+'.png'),fullPage:true});
 }
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,results,errors},null,2));
 console.log(JSON.stringify({checks:results.length,errors}));
}finally{await browser.close();}
