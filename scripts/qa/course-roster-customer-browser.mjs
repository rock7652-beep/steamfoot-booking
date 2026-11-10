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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/course-roster-customer-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-roster-customer-fixture.tsx"], bundle: true,
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
 const page=await browser.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/session-detail'))return route.fulfill({contentType:'application/json',body:JSON.stringify(await page.evaluate(()=>window.qaAction('loadCourseSessionDetail')))});
  if(url.pathname.endsWith('/card-read'))return route.fulfill({contentType:'application/json',body:JSON.stringify(await page.evaluate(()=>window.qaAction('browseCourseCards',{})))});
  if(url.pathname.endsWith('/customer-support-read'))return route.fulfill({contentType:'application/json',body:JSON.stringify(url.searchParams.get('kind')==='connection'?{success:true,canConfirm:false,data:{conflict:false,pending:[]}}:{success:true,data:{customer:{lineLinkStatus:'UNLINKED',lineUserId:null,lineLinkedAt:null,lineBindingCode:null,lineBindingCodeCreatedAt:null,followUps:[]}}})});
  errors.push('Blocked network '+url.pathname);return route.abort();
 });
 await page.goto('https://synthetic.invalid/hq/dashboard/courses?date=2026-11-16&scheduleView=month&coach=all');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const assert=(value,message)=>{if(!value)throw Error(message)};
 const original=page.url();
 for(const size of [{width:1440,height:900},{width:1366,height:768},{width:1024,height:768},{width:768,height:1024},{width:600,height:768}]){
  await page.setViewportSize(size);
  const plan=page.getByRole('button',{name:'合成學員 · 舞蹈十堂方案 上課紀錄',exact:true});
  await plan.waitFor();assert((await plan.innerText()).includes('剩 8 堂'),'Wrong card balance');
  assert(!(await plan.innerText()).includes('99'),'Aggregate presented as card balance');
  await page.screenshot({path:path.join(output,`roster-${size.width}.png`),fullPage:true});
  await plan.click();
  await page.locator('summary').filter({hasText:'查看完整紀錄'}).waitFor();
  assert(await page.locator('[data-lesson-slot]').count()===10,'Live card panel should show ten slots');
  assert(await page.locator('[data-completed="true"]').count()===2,'Live card panel should show two dates');
  assert(await page.locator('details').filter({has:page.locator('summary').filter({hasText:'查看完整紀錄'})}).getAttribute('open')===null,'History expanded by default');
  await page.screenshot({path:path.join(output,`card-collapsed-${size.width}.png`),fullPage:true});
  if(size.width===1366)await page.getByRole('dialog',{name:'合成學員',exact:true}).screenshot({path:path.join(output,'live-card-progress.png')});
  await page.locator('summary').filter({hasText:'查看完整紀錄'}).click();
  await page.getByText('舞蹈基礎課',{exact:true}).waitFor();
  await page.getByRole('button',{name:'第 2 堂，2026-11-10，合成學員',exact:true}).click();
  await page.getByText('2026-11-10 · 合成學員 · 舞蹈基礎課',{exact:true}).waitFor();
  assert(page.url()===original,'Student panel changed calendar URL');
  assert(await page.locator('[data-calendar-state]').getAttribute('data-calendar-state')==='2026-11-16:month:teacher-all','Calendar changed');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow');
  await page.screenshot({path:path.join(output,`card-history-${size.width}.png`),fullPage:true});
  const close=page.getByRole('button',{name:'關閉',exact:true});await close.click();
  await plan.waitFor();
  assert(page.url()===original,'Closing changed calendar URL');
  results.push({...size,passed:true});
 }
 // The learner-data menu must use the same overlay, with no route navigation.
 await page.setViewportSize({width:1366,height:768});
 await page.getByRole('button',{name:'合成學員 更多操作',exact:true}).click();
 await page.getByRole('menuitem',{name:'學員資料',exact:true}).click();
 await page.getByRole('heading',{name:'合成學員',exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'student-overview.png'),fullPage:true});
 assert(page.url()===original,'Learner menu navigated');
 assert(await page.getByText('課表排程',{exact:true}).count()===1,'Background was replaced');
 await page.getByRole('button',{name:'關閉顧客資料',exact:true}).click();
 const calls=await page.evaluate(()=>window.qaCalls);
 const histories=calls.filter(c=>c.name==='loadCourseCustomerBookings'&&c.args[2]?.cardId);
 assert(histories.length===5&&histories.every(c=>c.args[0]==='synthetic-customer'&&c.args[2].cardId==='synthetic-card'),'Unscoped card history');
 assert(errors.length===0,errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,errors,calls},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser.close();}
