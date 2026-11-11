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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-subject-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-subject-fixture.tsx"], bundle: true,
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
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto('https://synthetic.invalid/dashboard/courses');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const assert=(value,message)=>{if(!value)throw Error(message)};
 assert(await page.getByLabel('方案適用方式',{exact:true}).count()===0,'Enrollment gate remains on plans');
 assert(await page.getByLabel('教學項目',{exact:true}).inputValue()==='A','Open-only store missing subject');
 await page.getByRole('button',{name:'核對適用科目',exact:true}).click();
 const subject=page.getByLabel('核對適用科目',{exact:true});await subject.selectOption('A');
 const save=page.getByRole('button',{name:'確認方案科目',exact:true});
 assert(await save.isDisabled(),'Confirmation must be explicit');
 await page.getByRole('checkbox',{name:/已核對原購買內容/}).check();
 for(const size of [{width:1440,height:900},{width:1024,height:768},{width:768,height:1024},{width:600,height:768}]){
  await page.setViewportSize(size);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
  assert(await subject.inputValue()==='A','Resize lost draft');
  await save.scrollIntoViewIfNeeded();assert(await save.isVisible()&&await save.isEnabled(),'Save inaccessible');
  await page.screenshot({path:path.join(output,`subject-${size.width}.png`),fullPage:true});results.push({...size,passed:true});
 }
 await page.evaluate(()=>{window.failSave=true});await save.click();await page.getByRole('alert').waitFor();
 assert(await subject.inputValue()==='A','Error lost selected subject');
 await page.evaluate(()=>{window.failSave=false;window.responseLost=true});await save.click();
 await page.getByRole('alert').filter({hasText:'結果尚未確認'}).waitFor();
 assert(await subject.isDisabled(),'Unknown response must retain the original intent');
 assert(await page.getByRole('button',{name:'重新核對',exact:true}).isDisabled(),'Unknown response must not create another receipt');
 await page.evaluate(()=>{window.responseLost=false});await save.click();await page.getByRole('status',{name:''}).filter({hasText:'科目確認完成'}).waitFor();
 const calls=await page.evaluate(()=>window.qaCalls);assert(calls.length===3&&calls.every(c=>JSON.stringify(c)===JSON.stringify(calls[0])),'Retry changed receipt or snapshot');
 assert(errors.length===0,errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,calls,errors},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
