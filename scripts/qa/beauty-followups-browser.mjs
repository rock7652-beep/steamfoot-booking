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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/beauty-followups-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-followups-ui-fixture.tsx"], bundle: true,
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
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 let labelReads=0;
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='synthetic.invalid'&&route.request().isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
  if(url.hostname==='synthetic.invalid'&&url.pathname==='/pricing/brand/steam-butler-logo.png')return route.fulfill({contentType:'image/png',body:readFileSync('public/pricing/brand/steam-butler-logo.png')});
  if(url.pathname==='/api/image-announcements/list')return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[{id:'image',enabled:true,startsOn:'',endsOn:''}]})});
  if(url.pathname==='/api/image-announcements/image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="#416b5b"/><text x="50" y="90" fill="white" font-size="28">Published announcement Preview</text></svg>'});
  if(url.pathname==='/api/customer-labels/read'){labelReads++;const body=route.request().postDataJSON();if(body.storeId!=='synthetic')throw Error('Wrong labels scope');return route.fulfill({contentType:'application/json',body:JSON.stringify({storeId:'synthetic',available:true,enabled:true,canEdit:false,canManage:false,categories:[{id:'cat',name:'需求',number:1,position:0,active:true}],labels:[{id:'vip',name:'重要顧客',categoryId:'cat',active:true}],assignments:Object.fromEntries(body.ids.map(id=>[id,['vip']]))})});}
  errors.push('Blocked external network: '+url.pathname);return route.abort();
 });
 await page.goto('https://synthetic.invalid/s/synthetic/admin/dashboard/beauty');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});


 async function screens(view){for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error(view+' page overflow');results.push({view,width,height,overflow});await page.screenshot({path:path.join(output,view+'-'+width+'.png')});}}
 await page.getByRole('button',{name:'調整期限',exact:true}).click();await page.getByLabel('新到期日',{exact:true}).fill('2027-03-01');await page.getByLabel('調整原因',{exact:true}).fill('合成驗收調整');await screens('expiry');
 await page.getByRole('button',{name:'儲存期限',exact:true}).click();await page.waitForFunction(()=>window.qaCalls.some(c=>c.name==='saveBeautyCardManagement'));
 const saved=await page.evaluate(()=>window.qaCalls.find(c=>c.name==='saveBeautyCardManagement').args[0]);if(saved.expectedStoreId!=='synthetic'||saved.expectedRemaining!==4||saved.expectedExpiresAt!=='2027-04-22T15:59:59.999Z'||saved.expiresDate!=='2027-03-01')throw Error('Wrong expiry contract');
 await page.getByRole('button',{name:'註銷方案',exact:true}).click();await page.getByLabel('調整原因',{exact:true}).fill('合成驗收註銷');await screens('close');await page.getByRole('button',{name:'確認註銷',exact:true}).click();await page.getByText('剩餘 0 次',{exact:true}).waitFor();
 await page.getByLabel('驗收頁面',{exact:true}).selectOption('public');await page.getByRole('heading',{name:'店家公告',exact:true}).waitFor();await page.getByText('重要顧客',{exact:true}).waitFor();
 if(labelReads!==0)throw Error('Seeded labels made an unnecessary read');
 const empty=await page.getByRole('heading',{name:'允許顧客自行預約',exact:true}).evaluate(node=>node.closest('section').querySelector(':scope > div.border-t')!==null);if(empty)throw Error('Empty booking hint remains');
 await page.getByRole('button',{name:'切換標籤顧客',exact:true}).click();await page.getByText('重要顧客',{exact:true}).waitFor();if(labelReads!==1)throw Error('Expected one independent label read');
 await page.getByRole('button',{name:'重新驗證',exact:true}).click();await page.waitForFunction(()=>window.qaCalls.some(c=>c.name==='getCurrentLineOfficialAccountStatus'));await screens('public');
 await page.getByLabel('驗收頁面',{exact:true}).selectOption('nav');await page.setViewportSize({width:1366,height:900});await page.getByRole('link',{name:'工單',exact:true}).first().waitFor();await page.getByRole('link',{name:'進銷存',exact:true}).first().waitFor();await screens('nav');
 const calls=await page.evaluate(()=>window.qaCalls);if(calls.some(c=>/push|send|checkAll/i.test(c.name)))throw Error('Unexpected message/all-store writer');
 if(errors.length)throw Error(errors.join(';'));writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,databaseWrites:false,physicalDevice:false,results,labelReads,calls,errors},null,2));console.log(JSON.stringify({screens:results.length,labelReads,errors}));
}finally{await browser.close();}
