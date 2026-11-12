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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-fee-simple-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-classification-sync-fixture.tsx"], bundle: true,
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
        const router={push:navigate,replace:navigate,refresh:()=>{window.qaRefreshes=(window.qaRefreshes??0)+1}};export const useRouter=()=>router;
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


const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
  if(new URL(route.request().url()).pathname.endsWith('/settings-save/course/plan')){
   const input=route.request().postDataJSON();const result=await page.evaluate(value=>window.qaSave(value),input);
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  }
  return route.abort();
 });
 const assert=(ok,message)=>{if(!ok)throw Error(message)};
 await page.goto('https://synthetic.invalid/hq/dashboard/courses?view=plans');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 await page.getByRole('button',{name:'＋新增收費方式',exact:true}).click();
 await page.locator('input[name="name"]').fill('吉他個別課$900');await page.getByLabel('教學項目',{exact:true}).selectOption('B');await page.locator('input[name="price"]').fill('900');await page.getByLabel('一般上課時間',{exact:true}).fill('100');
 await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('button',{name:'吉他個別課$900',exact:true}).waitFor();
 const group=async name=>page.getByRole('button',{name,exact:true}).evaluate(button=>{let row=button.closest('tr');while(row&&!row.hasAttribute('data-fee-group'))row=row.previousElementSibling;return row?.textContent??'';});
 assert((await group('吉他個別課$900')).includes('吉他個別課'),'New fee stayed pending');await page.screenshot({path:path.join(output,'new-fee-classified.png'),fullPage:true});
 assert(await page.locator('[data-fee-group]').filter({hasText:'待核對科目'}).count()===0,'Pending group flashed after confirmed save');
 await page.getByRole('button',{name:'吉他個別課$900',exact:true}).click();
 assert(await page.getByLabel('教學項目',{exact:true}).inputValue()==='B','Reopened fee lost its item');
 assert(await page.getByLabel('一般上課時間',{exact:true}).inputValue()==='100','Reopened fee lost its duration');
 await page.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'吉他一對二$650',exact:true}).click();await page.getByLabel('教學項目',{exact:true}).selectOption('C');await page.getByRole('button',{name:'儲存',exact:true}).click();
 await page.getByRole('button',{name:'吉他一對二$650',exact:true}).waitFor();assert((await group('吉他一對二$650')).includes('吉他自組班'),'Moved fee stayed in old group');await page.screenshot({path:path.join(output,'moved-fee-classified.png'),fullPage:true});
 await page.evaluate(()=>window.qaUpdate('one-to-two'));
 await page.getByRole('button',{name:'吉他一對二$650',exact:true}).click();await page.locator('input[name="name"]').fill('一對二合作方案');
 await page.evaluate(()=>window.qaUpdate('one-to-two',2800));
 assert(await page.locator('input[name="price"]').inputValue()==='2800','Unedited price did not follow current data');
 assert(await page.getByRole('button',{name:'保留修改，重新確認',exact:true}).count()===0,'Reconciliation workflow remains');
 assert(await page.getByText(/教師依教學項目|計酬沿用|購買時選擇期數|已售方案保留原約定/).count()===0,'Explanatory prose remains');
 for(const size of [{width:1366,height:900},{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow');
  assert(await page.locator('input[name="name"]').inputValue()==='一對二合作方案','Draft lost on resize');
  await page.screenshot({path:path.join(output,`fee-${size.width}.png`),fullPage:true});results.push({...size,overflow:false});
 }
 await page.getByRole('button',{name:'儲存',exact:true}).click();await page.getByRole('button',{name:'一對二合作方案',exact:true}).waitFor();
 assert((await group('一對二合作方案')).includes('吉他自組班'),'Reconciled save lost grouping');
 assert(await page.evaluate(()=>window.qaRefreshes)>0,'Production HQ save did not refresh metadata');
 if(errors.length)throw Error(errors.join('; '));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,backend:false,results,checks:['new fee immediately classified','reopen retains item and 100 minutes','move A to C immediately','no reconciliation actions or explanatory prose','save preserves edit and adopts newer unedited price','production HQ refresh'],errors},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
