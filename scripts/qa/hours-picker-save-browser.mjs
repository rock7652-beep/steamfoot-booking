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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "artifacts/hours-picker-save-20261124";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/hours-picker-save-fixture.tsx"], bundle: true,
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
 const page=await browser.newPage({viewport:{width:1024,height:768}});page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):route.abort());
 const load=async()=>{await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/settings/hours');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});};
 await load();const day=n=>page.locator('[data-schedule-calendar] button').filter({has:page.locator('span').getByText(String(n),{exact:true})});
 await day(17).click();await page.getByRole('button',{name:'調整時間',exact:true}).click();
 const start=page.getByLabel('第1段開始時間',{exact:true});if(await start.getAttribute('type')!=='time')throw Error('Not a native time input');if(await page.locator('[data-schedule-day] input[placeholder="HH:MM"]').count())throw Error('Extra text time field');
 // Native time segments vary by host locale. Locate the minute segment by actual input outcome.
 const probe=[];let minuteX=null;
 for(let x=10;x<=130;x+=10){await start.fill('10:00');await start.click({position:{x,y:22}});await page.keyboard.press('3');const first=await start.inputValue();await page.keyboard.press('0');probe.push({x,first,value:await start.inputValue()});if(await start.inputValue()==='10:30'){minuteX=x;break;}}
 if(minuteX===null){await page.screenshot({path:path.join(output,'native-probe.png'),fullPage:true});console.log(JSON.stringify({probe,box:await start.boundingBox()}));throw Error('Native minute keyboard input failed');}await page.keyboard.press('ArrowUp');if(await start.inputValue()!=='10:31')throw Error('Native adjustment failed');await page.keyboard.press('ArrowDown');if(await start.inputValue()!=='10:30')throw Error('Native reverse adjustment failed');
 let hourX=null;for(let x=10;x<=130;x+=10){await start.fill('10:00');await start.click({position:{x,y:22}});await page.keyboard.press('0');await page.keyboard.press('9');if(await start.inputValue()==='09:00'){hourX=x;break;}}if(hourX===null)throw Error('Native hour keyboard input failed');
 await start.fill('10:00');await page.getByLabel('第1段結束時間',{exact:true}).fill('12:00');await page.getByRole('button',{name:'＋ 新增一段',exact:true}).click();await page.getByLabel('第2段開始時間',{exact:true}).fill('14:00');
 await page.getByRole('alert').filter({hasText:'第 2 段：請填寫完整結束時間'}).first().waitFor();if(!await page.getByRole('button',{name:'檢查變更',exact:true}).isDisabled())throw Error('Missing end accepted');if(await page.evaluate(()=>window.hoursPickerCalls.length))throw Error('Incomplete draft sent');
 await page.screenshot({path:path.join(output,'missing-end-1024.png'),fullPage:true});await page.getByLabel('第2段結束時間',{exact:true}).fill('17:00');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await start.scrollIntoViewIfNeeded();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow');if(await start.inputValue()!=='10:00')throw Error('Draft lost');results.push({width,height,nativeTimeInput:true,keyboardMinutes:true,keyboardHours:true,arrowAdjustment:true,overflow:false});await page.screenshot({path:path.join(output,`draft-${width}.png`)});}
 await page.getByRole('button',{name:'檢查變更',exact:true}).click();if(await page.evaluate(()=>window.hoursPickerCalls.length))throw Error('Review wrote before confirmation');await page.getByRole('button',{name:'確認並儲存',exact:true}).click();await page.getByRole('status').filter({hasText:'2026-12-17 已儲存：10:00–12:00、14:00–17:00'}).waitFor();
 const preview=page.getByRole('region',{name:'開放時段預覽'});for(const time of ['10:00','11:00','14:00','15:00','16:00'])await preview.getByText(time,{exact:false}).waitFor();
 await day(18).click();await day(17).click();if(await page.getByLabel('第2段結束時間',{exact:true}).inputValue()!=='17:00')throw Error('Reopen lost second period');await load();await day(17).click();if(await page.getByLabel('第2段結束時間',{exact:true}).inputValue()!=='17:00')throw Error('Reload lost second period');
 for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){await page.setViewportSize({width,height});await page.getByRole('region',{name:'開放時段預覽'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,`saved-${width}.png`)});}
 if(errors.length)throw Error(errors.join(';'));writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,minuteX,hourX,results,savedPeriods:2,reopened:true,reloadedSyntheticState:true,errors},null,2));console.log(JSON.stringify({output,results:results.length,minuteX,hourX,errors}));
}finally{await browser.close();}
