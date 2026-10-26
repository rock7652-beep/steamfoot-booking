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
const root = process.cwd(), output = process.env.QA_OUTPUT_DIR || "/tmp/new-member-purchase-login-ui";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/new-member-purchase-login-fixture.tsx"], bundle: true,
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


const browser = await chromium.launch({executablePath:process.env.QA_CHROME_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
const results=[];
try {
 for(const [width,height] of [[1366,768],[1920,1080],[1024,768],[768,1024],[390,844],[360,800],[320,740]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  await page.setContent('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({content:readFileSync(path.join(output,'fixture.css'),'utf8')});
  if(process.env.QA_FONT_FILE) await page.addStyleTag({content:`@font-face{font-family:QAChinese;src:url(data:font/otf;base64,${readFileSync(process.env.QA_FONT_FILE).toString('base64')})}body{font-family:QAChinese,sans-serif}`});
  await page.evaluate(()=>{
   window.qaState='start';window.qaCalls=[];
   window.qaAction=async(name,...args)=>{
    window.qaCalls.push({name,args});
    if(name==='assignPlanToCustomer')return {success:true};
    if(name==='loadMemberConnectionAction')return {success:true,canConfirm:true,data:{membership:'尚未連結',notification:'本店通知已確認',login:'尚未驗證本次登入',purchaseLoginState:window.qaState,conflict:false,pending:window.qaState==='review'?[{id:'request',kind:'login',verificationCode:'ABC123'}]:[]}};
    if(name==='approveLoginRecoveryAction'){window.qaState='retry';return {success:true};}
    throw Error('Unexpected action '+name);
   };
  });
  await page.addScriptTag({content:readFileSync(path.join(output,'fixture.js'),'utf8')});
  await page.getByRole('button',{name:'+ 指派方案',exact:true}).click();
  await page.locator('select[name=planId]').selectOption('plan');
  await page.getByRole('button',{name:'確認購買',exact:true}).click();
  await page.getByText('開卡完成，方案已儲存',{exact:true}).waitFor();
  await page.getByText('會員登入待確認',{exact:true}).waitFor();
  if(await page.getByRole('button',{name:'確認購買',exact:true}).count())throw Error('Repeat purchase still offered');
  await page.screenshot({path:path.join(output,`start-${width}.png`),fullPage:true});
  await page.evaluate(()=>{window.qaState='review';});
  await page.getByRole('button',{name:'重新檢查',exact:true}).click();
  await page.getByRole('button',{name:'已核對本人與確認碼，允許重新登入',exact:true}).click();
  await page.getByText('已核准，請顧客登入',{exact:true}).waitFor();
  const calls=await page.evaluate(()=>window.qaCalls);
  const approve=calls.find(c=>c.name==='approveLoginRecoveryAction');
  if(JSON.stringify(approve.args)!==JSON.stringify(['request','synthetic-guest','ABC123']))throw Error('Wrong approval scope');
  if(calls.filter(c=>c.name==='assignPlanToCustomer').length!==1)throw Error('Duplicate sale');
  await page.screenshot({path:path.join(output,`approved-${width}.png`),fullPage:true});
  await page.evaluate(()=>{window.qaState='ready';});
  await page.getByRole('button',{name:'重新檢查',exact:true}).click();
  await page.getByText('會員登入連結已就緒',{exact:true}).waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  const touch=await page.getByRole('button',{name:'重新檢查',exact:true}).boundingBox();
  if(overflow||errors.length||touch.height<44)throw Error(JSON.stringify({overflow,errors,touch}));
  await page.getByRole('button',{name:'完成',exact:true}).click();
  results.push({width,height,passed:true,scope:'actual React checkout and confirmation panel with synthetic server responses; not real LINE or database QA'});
  await page.close();
 }
 writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
} finally {await browser.close();}
