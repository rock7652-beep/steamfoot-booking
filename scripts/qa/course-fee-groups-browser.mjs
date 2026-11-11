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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-fee-groups-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-fee-groups-fixture.tsx"], bundle: true,
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
        const Link=({children,prefetch,scroll,...props})=>createElement('a',{...props,onClick:event=>{props.onClick?.(event);if(!event.defaultPrevented&&typeof props.href==='string'&&props.href.startsWith('/')){event.preventDefault();history.replaceState(null,'',props.href);window.dispatchEvent(new Event('qa-route'));}}},children);
        export default Link;export const AppLink=Link;export const useLinkStatus=()=>({pending:false});`, loader: "js", resolveDir: root };
    });
  } }],
});
const componentCss=(await import("node:fs")).existsSync(path.join(output,"fixture.css"))?readFileSync(path.join(output,"fixture.css"),"utf8"):"";
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);


writeFileSync(path.join(output,'index.html'),'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>收費方式分組預覽</title><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:readFileSync(path.join(output,'index.html'),'utf8').replace('<link rel="stylesheet" href="fixture.css">','').replace('<script src="fixture.js"></script>','')}):route.abort());
 const assert=(ok,message)=>{if(!ok)throw Error(message)};
 async function load(query=''){
  await page.goto('https://synthetic.invalid/dashboard/courses'+query);
  await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
  await page.getByRole('heading',{name:/收費方式/}).waitFor();
 }
 await load();
 for(const size of [{width:1366,height:900},{width:1920,height:1080},{width:1024,height:768},{width:768,height:1024},{width:600,height:800}]){
  await page.setViewportSize(size);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Whole page overflow');
  assert(await page.locator('[data-fee-group]').count()===3,'Missing groups');
  await page.screenshot({path:path.join(output,`sports-${size.width}.png`),fullPage:true});results.push({...size,passed:true});
 }
 const scope=page.getByLabel('教學項目篩選',{exact:true});
 await scope.selectOption('A');
 assert(await page.getByRole('button',{name:'瑜伽10堂',exact:true}).count()===1,'A fee missing');
 assert(await page.getByRole('button',{name:'零基礎成芭10堂',exact:true}).count()===0,'B leaked into A');
 assert(await page.getByRole('button',{name:'舊方案待核對',exact:true}).count()===0,'Unknown leaked into A');
 await page.getByRole('button',{name:'＋新增收費方式',exact:true}).click();
 assert(await page.getByLabel('教學項目',{exact:true}).inputValue()==='A','New fee did not inherit scope');
 await page.screenshot({path:path.join(output,'new-fee-scope.png'),fullPage:true});
 await page.setViewportSize({width:768,height:1024});
 assert(await page.getByLabel('教學項目',{exact:true}).inputValue()==='A','Resize lost selected subject');
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 assert(await scope.inputValue()==='A','Closing editor lost filter');
 assert(await page.getByRole('button',{name:'瑜伽10堂',exact:true}).count()===1,'Closing editor lost list');
 await page.getByRole('link',{name:'返回教學項目',exact:true}).click();
 await page.getByRole('button',{name:'收費方式',exact:true}).first().click();
 await page.getByRole('heading',{name:'舞蹈（基礎課程）／收費方式',exact:true}).waitFor();
 // Reset via a fresh isolated mount, then test deep link and pending review.
 await load('?subjectId=A');
 assert(await page.getByRole('heading',{name:'舞蹈（基礎課程）／收費方式',exact:true}).count()===1,'Deep link lost context');
 assert(await page.locator('[data-fee-group]').evaluateAll(rows=>new Set(rows.map(r=>r.getAttribute('data-fee-group'))).size)===1,'Deep link mixed scopes');
 await page.getByLabel('教學項目篩選',{exact:true}).selectOption('__pending_fee_subject__');
 const pendingMenu=page.getByRole('button',{name:'舊方案待核對操作',exact:true});
 await pendingMenu.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await pendingMenu.click();
 await page.getByRole('button',{name:'核對適用科目',exact:true}).click();
 assert(await page.getByLabel('教學項目',{exact:true}).inputValue()==='','Pending plan guessed a subject');
 await load('?module=music');
 assert(await page.locator('[data-fee-group]').count()===3,'Music missing groups');
 await page.getByLabel('適用課程篩選',{exact:true}).selectOption('B');
 assert(await page.getByRole('button',{name:'小提琴10堂',exact:true}).count()===1,'Music B missing');
 assert(await page.getByRole('button',{name:'鋼琴10堂',exact:true}).count()===0,'Music A leaked into B');
 await page.setViewportSize({width:1024,height:768});
 await page.screenshot({path:path.join(output,'music-1024.png'),fullPage:true});
 await page.getByRole('button',{name:'清除篩選',exact:true}).click();
 await page.getByLabel('搜尋',{exact:true}).fill('找不到的方案');
 await page.getByText('沒有符合條件的方案，請調整搜尋或篩選。',{exact:true}).waitFor();
 assert(errors.length===0,errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,checks:['A/B/unknown isolation','grouped music','direct link heading','new fee subject prefill','pending review entry','empty search'],errors},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
