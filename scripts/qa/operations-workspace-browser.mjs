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
const root=process.cwd(),output=process.env.QA_OUTPUT_DIR||'/tmp/operations-preview';
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/operations-workspace-fixture.tsx"], bundle: true,
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
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='synthetic.invalid'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});errors.push('Blocked network '+url.pathname);return route.abort();});
 await page.goto('https://synthetic.invalid/dashboard/revenue?dateFrom=2026-10-01&dateTo=2026-10-27');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 for(const [label,area] of [['營收明細','ledger'],['收入分類','income'],['現金帳','cashbook'],['月結管理','monthly'],['報表匯出','exports']]) {
  await page.getByRole('navigation',{name:'營運頁籤'}).getByRole('link',{name:label,exact:true}).click();
  await page.waitForTimeout(80);
  if(area!=='ledger'&&new URL(page.url()).searchParams.get('area')!==area)throw Error('Wrong area '+area);
  if(new URL(page.url()).searchParams.get('dateFrom')!=='2026-10-01')throw Error('Date lost');
  if(area==='income'&&await page.getByRole('heading',{name:'技師服務費',exact:true}).count())throw Error('Duplicate fees in income');
  for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024]]) {
   await page.setViewportSize({width,height});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Page overflow '+area+' '+width);
   results.push({area,width,height,overflow});await page.screenshot({path:path.join(output,area+'-'+width+'.png'),fullPage:true});
  }
 }
 await page.getByRole('button',{name:'現金抽屜',exact:true}).click();
 await page.getByText('現金差異核對 · 本月 1 筆點錢差額／1 筆結帳後異動').click();
 await page.getByRole('heading',{name:'結帳後收支異動',exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'cash-drawer-differences-768.png'),fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Drawer overflow');
 await page.getByLabel('僅匯出權限',{exact:true}).check();
 if(await page.getByRole('navigation',{name:'營運頁籤'}).getByRole('link').count()!==1)throw Error('Unauthorized tab shown');
 if(errors.length)throw Error(errors.join(';'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,results,errors},null,2));
 console.log(JSON.stringify({screens:results.length+1,errors,output}));
} finally {await browser.close();}
