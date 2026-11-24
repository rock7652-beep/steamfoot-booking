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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "artifacts/hours-keyboard-input-20261124";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/hours-keyboard-fixture.tsx"], bundle: true,
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


const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const errors=[],results=[];
try{
 const page=await browser.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/settings/hours');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const type=async(field,value)=>{await field.focus();await field.press('ControlOrMeta+A');await field.pressSequentially(value);};
 await page.getByRole('button',{name:'每週固定時段',exact:true}).click();await page.getByRole('button',{name:'調整 ▼',exact:true}).first().click();
 const row=page.locator('fieldset').filter({has:page.getByLabel('開始時間',{exact:true})}).first();
 await type(row.getByLabel('開始時間',{exact:true}),'10:30');await type(row.getByLabel('結束時間',{exact:true}),'18:15');
 const interval=row.getByLabel('預約時段間隔（分鐘）');
 for(const value of ['30','60','90','120']){await type(interval,value);if(await row.getByRole('button',{name:'儲存',exact:true}).isDisabled())throw Error('Valid interval rejected '+value);}
 for(const value of ['10','15','', '45']){await interval.fill(value);if(!await row.getByRole('button',{name:'儲存',exact:true}).isDisabled())throw Error('Unsupported interval accepted '+value);}
 await type(interval,'30');await type(row.getByLabel('開始時間',{exact:true}),'25:00');if(!await row.getByRole('button',{name:'儲存',exact:true}).isDisabled())throw Error('Invalid hour accepted');await type(row.getByLabel('開始時間',{exact:true}),'10:30');
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();if(await row.getByLabel('開始時間',{exact:true}).inputValue()!=='10:30')throw Error('Draft lost on resize');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow');await page.screenshot({path:path.join(output,`steamfoot-${width}.png`)});results.push({view:'steamfoot',width,height,keyboard:true,overflow:false});}
 await row.getByRole('button',{name:'儲存',exact:true}).click();await page.waitForFunction(()=>window.hoursKeyboardCalls.length===1);const saved=await page.evaluate(()=>window.hoursKeyboardCalls[0]);if(saved.values.periods[0].openTime!=='10:30'||saved.values.periods[0].closeTime!=='18:15'||saved.values.periods[0].slotInterval!==30)throw Error('Wrong request');if(await row.getByLabel('開始時間',{exact:true}).inputValue()!=='10:30')throw Error('Failure lost draft');
 for(const view of ['course','beauty']){await page.getByLabel('模組',{exact:true}).selectOption(view);const form=page.getByRole('form',{name:'每週營業時間'}),field=form.getByLabel('週一第1段開始',{exact:true});await type(field,'11:15');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await field.scrollIntoViewIfNeeded();if(await field.inputValue()!=='11:15')throw Error('Draft lost');if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow');await page.screenshot({path:path.join(output,`${view}-${width}.png`)});results.push({view,width,height,keyboard:true,overflow:false});}
 await form.getByRole('button',{name:'儲存每週設定',exact:true}).click();await form.getByRole('status').filter({hasText:'草稿已保留'}).waitFor();if(await field.inputValue()!=='11:15')throw Error('Failure lost weekly draft');}
 if(errors.length)throw Error(errors.join(';'));writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,results,errors},null,2));console.log(JSON.stringify({output,screens:results.length,errors}));
}finally{await browser.close();}
