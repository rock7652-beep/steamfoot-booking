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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/music-fitness-compact-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/music-fitness-compact-fixture.tsx"], bundle: true,
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
        const Link=({children,prefetch,scroll,onClick,...props})=>createElement('a',{...props,onClick:e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();history.replaceState(null,'',props.href);window.dispatchEvent(new Event('qa-route'));}}},children);
        export default Link;export const AppLink=Link;export const useLinkStatus=()=>({pending:false});`, loader: "js", resolveDir: root };
    });
  } }],
});
const componentCss=(await import("node:fs")).existsSync(path.join(output,"fixture.css"))?readFileSync(path.join(output,"fixture.css"),"utf8"):"";
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);


const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],results=[];const assert=(ok,message)=>{if(!ok)throw Error(message)};
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});errors.push('Blocked network '+new URL(route.request().url()).pathname);return route.abort();});
 await page.goto('https://synthetic.invalid/hq/dashboard/courses?view=customers');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const choose=async view=>{await page.getByLabel('驗收頁面',{exact:true}).selectOption(view);};
 for(const size of [{width:1440,height:900},{width:1366,height:900},{width:1024,height:768},{width:768,height:1024}]){
  await page.setViewportSize(size);
  for(const view of ['fitness-home','music-home','fitness-customers','music-customers','beauty-customers']){
   await choose(view);
   if(view.endsWith('home')){
    assert(await page.getByRole('button',{name:'新增預約',exact:true}).count()===1,'Single home action missing');
    assert(await page.getByRole('link',{name:'替學員預約',exact:true}).count()===0,'Home actions still separately displayed');
    await page.getByRole('button',{name:'新增預約',exact:true}).click();
    for(const [label,action]of [['替學員預約','booking'],['新增排課','schedule']]){
     const href=await page.getByRole('link',{name:label,exact:true}).getAttribute('href');const params=new URL(href,'https://synthetic.invalid').searchParams;
     assert(params.get('action')===action&&params.get('date')==='2026-11-03','Home action lost route or date');
    }
    await page.screenshot({path:path.join(output,view+'-menu-'+size.width+'.png'),fullPage:true});await page.keyboard.press('Escape');
    assert(await page.getByRole('button',{name:'新增預約',exact:true}).getAttribute('aria-expanded')==='false','Escape did not close menu');
   }else{
    const fields=['搜尋姓名、電話或 LINE 名稱','依顧客標籤篩選','LINE 綁定','所屬店長','排序方式'];
    if(size.width>=1366){const boxes=await Promise.all(fields.map(name=>page.getByLabel(name,{exact:true}).boundingBox()));assert(boxes.every(box=>box&&Math.abs(box.y-boxes[0].y)<2),'Toolbar wraps at '+view+' '+size.width);}
    assert(await page.getByLabel('上課狀態',{exact:true}).count()===0&&await page.getByLabel('推薦紀錄',{exact:true}).count()===0&&await page.getByLabel('顧客狀態',{exact:true}).count()===0,'Legacy fields remain');
    assert(await page.getByRole('button',{name:/^篩選/}).count()===0,'Course filters still collapsed');
    await page.screenshot({path:path.join(output,view+'-'+size.width+'.png'),fullPage:true});
   }
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow '+view+' '+size.width);
   results.push({view,...size,passed:true});
  }
 }
 await page.setViewportSize({width:1366,height:900});await choose('fitness-customers');
 await page.getByLabel('LINE 綁定',{exact:true}).selectOption('linked');await page.getByLabel('所屬店長',{exact:true}).selectOption('owner');await page.getByLabel('排序方式',{exact:true}).selectOption('points');
 const q=new URL(page.url()).searchParams;assert(q.get('status')==='linked'&&!q.has('visit')&&!q.has('referral')&&q.get('staff')==='owner'&&q.get('sort')==='points','Combined filters lost query conditions');
 assert(await page.getByRole('link',{name:'清除篩選',exact:true}).count()===1,'Clear entry absent');
 const input=await page.getByLabel('搜尋姓名、電話或 LINE 名稱',{exact:true}).boundingBox();const sort=await page.getByLabel('排序方式',{exact:true}).boundingBox();assert(Math.abs(input.y-sort.y)<2,'Active filter clear causes wrapping');
 results.push({case:'Combined filters preserve values with inline clear',passed:true});
 await page.getByLabel('搜尋姓名、電話或 LINE 名稱',{exact:true}).fill('合成');await page.waitForURL(u=>u.searchParams.get('search')==='合成');
 await page.getByRole('link',{name:'清除篩選',exact:true}).click();await page.waitForURL(u=>!u.searchParams.has('search')&&!u.searchParams.has('visit')&&!u.searchParams.has('referral')&&!u.searchParams.has('staff'));
 await page.waitForTimeout(350);assert(await page.getByLabel('搜尋姓名、電話或 LINE 名稱',{exact:true}).inputValue()==='','Cleared search rebounded');
 results.push({case:'Clear resets search draft and conditions without restoring stale query',passed:true});

 await choose('music-customers');await page.getByLabel('所屬店長',{exact:true}).selectOption('owner');assert(new URL(page.url()).searchParams.get('staff')==='owner','Music staff filter ignored');await page.getByLabel('排序方式',{exact:true}).selectOption('points');assert(await page.getByRole('option',{name:'排序：可用堂數',exact:true}).count()===1,'Music session terminology changed');
 results.push({case:'Music session terminology preserved',passed:true});
 assert(errors.length===0,errors.join('\n'));writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,results,errors},null,2));console.log(JSON.stringify({output,cases:results.length,errors}));
}finally{await browser.close();}
