// Run from the repo root. All backend imports and all network requests are blocked.
// The bundle and Chromium screenshots are local synthetic evidence, not business QA.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = process.cwd(), output = process.env.QA_OUTPUT || "/tmp/youngsky-settings-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/youngsky-settings-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    if (process.env.QA_BASELINE === "1") builder.onLoad({filter: /(?:settings-workspace|settings-section-editor|course-waitlist-settings|trial-form)\.tsx$/}, args => ({
      contents: execFileSync("git", ["show", `HEAD:${path.relative(root,args.path)}`], {cwd:root,encoding:"utf8"}),
      loader:"tsx",resolveDir:path.dirname(args.path),
    }));
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "qa" }));
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "qa" }));
    builder.onResolve({ filter: /(?:^|\/)app-link$/ }, () => ({ path: "app-link", namespace: "qa" }));
    builder.onResolve({ filter: /^@\/server\// }, args => ({ path: path.join(root, "src", args.path.slice(2) + ".ts"), namespace: "blocked-server" }));
    builder.onLoad({ filter: /.*/, namespace: "blocked-server" }, args => {
      const source = readFileSync(args.path, "utf8");
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match => match[1]);
      return { contents: names.map(name => `export const ${name} = () => {throw new Error("Backend calls forbidden in synthetic QA")};`).join("\n"), loader: "js" };
    });
    builder.onLoad({ filter: /.*/, namespace: "qa" }, args => {
      if (args.path === "navigation") return { contents: `import {useSyncExternalStore} from 'react';
        const subscribe=cb=>{window.addEventListener('qa-route',cb);return()=>window.removeEventListener('qa-route',cb)};
        const navigate=href=>{history.replaceState(null,'',href);window.dispatchEvent(new Event('qa-route'))};
        export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);
        export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));
        export const useRouter=()=>({push:navigate,replace:navigate,refresh:()=>{}});
        export const unstable_rethrow=error=>{throw error};`, loader: "js", resolveDir: root };
      return { contents: `import {createElement} from 'react';
        const Link=({children,prefetch,scroll,...props})=>createElement('a',props,children);
        export default Link;export const AppLink=Link;export const useLinkStatus=()=>({pending:false});`, loader: "js", resolveDir: root };
    });
  } }],
});
const css = await postcss([tailwind({ base: root })]).process((readFileSync("src/app/globals.css", "utf8") + "\n" + readFileSync(path.join(output, "fixture.css"), "utf8")), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css);
const baseline = process.env.QA_BASELINE === "1";
let browser;
const results = [], failures = [];
try {
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const cases = [
    {id:"store",section:"store",title:"店家資料",field:"店家名稱",value:"YoungSky 合成更新店",form:"編輯店家資料"},
    {id:"booking",section:"booking",title:"預約與取消截止",field:"預約截止時間",value:"3",form:"編輯預約截止規則"},
    {id:"payment",section:"payment",title:"銀行轉帳資訊",field:"銀行名稱",value:"合成銀行",form:"編輯銀行資訊"},
    {id:"waitlist",section:"booking",title:"候補",field:"候補名額",value:"5"},
    {id:"trial",section:"payment",title:"體驗設定",field:"預設體驗價格（NT$）",value:"350",form:"體驗設定"},
  ];
  const sizes = baseline ? [[1366,900]] : [[1366,900],[1920,1080],[1024,768],[768,1024]];
  for (const [width,height] of sizes) {
    const scenarios = baseline || width !== 1366 ? ["success"] : ["success","slow","rejected","uncertain","sync-warning"];
    for (const scenario of scenarios) for (const item of cases) {
      
      console.log(`Case ${width}/${scenario}/${item.id}`);
      const page = await browser.newPage({ viewport:{width,height} });
      page.setDefaultTimeout(30000);
      page.on("pageerror",error=>{failures.push(error.message);console.error(error.message);});
      const calls=[];
      let releaseResponse;const responseGate=new Promise(resolve=>{releaseResponse=resolve});
      let mode=scenario;
      await page.route("**/*",async route=>{
        const url=route.request().url();
        if(url.startsWith("https://synthetic.invalid/") && route.request().method()==="GET") return route.fulfill({contentType:"text/html",body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'});
        if(url.startsWith("https://synthetic.invalid/s/synthetic/admin/dashboard/settings-save/") && route.request().method()==="POST") {
          const input=route.request().postDataJSON();calls.push(input);
          await Promise.all([responseGate,new Promise(resolve=>setTimeout(resolve,mode==="slow"?3300:150))]);
          if(mode==="uncertain") return route.abort("failed");
          if(mode==="rejected") return route.fulfill({status:400,json:{success:false,error:"合成驗證失敗"}});
          const values=item.id==="waitlist"?{enabled:input.enabled,defaultLimit:input.defaultLimit,autoPromoteStopMinutes:input.autoPromoteStopMinutes}:input.values;
          const data=item.id==="waitlist"?values:{values,revision:JSON.stringify(values)};
          return route.fulfill({json:{success:true,storeId:"synthetic-youngsky",data,syncWarning:mode==="sync-warning"}});
        }
        failures.push("Unexpected network: "+url);return route.abort();
      });
      await page.goto(`https://synthetic.invalid/s/synthetic/admin/dashboard/courses?view=settings&section=${item.section}`,{waitUntil:"domcontentloaded"});
      await page.addStyleTag({path:path.join(output,"fixture.css")});
      await page.addScriptTag({path:path.join(output,"fixture.js")});
      const row=page.locator("section").filter({has:page.getByRole("heading",{name:item.title,exact:true})}).last();
      await row.getByRole("button",{name:"修改",exact:true}).click();
      const form=item.form?page.getByRole("form",{name:item.form,exact:true}):row;
      await form.getByLabel(item.field,{exact:true}).fill(item.value);
      const field=form.getByLabel(item.field,{exact:true});
      // Draft survives iPad orientation/viewport changes before saving.
      if(!baseline){await page.setViewportSize({width:height,height:width});if(await field.inputValue()!==item.value)throw Error("Draft lost on resize");await page.setViewportSize({width,height});}
      await field.evaluate(el=>el.setAttribute("data-qa-field","active"));
      const urlBefore=page.url();
      await page.evaluate(()=>{
        window.__qa={};const timing=window.__qa;
        document.addEventListener("click",e=>{if(e.target.closest('button[type="submit"]') || e.target.textContent==="儲存")timing.click=performance.now();},true);
        const field=document.querySelector('[data-qa-field="active"]');
        new MutationObserver(()=>{if(field.closest('[hidden]') && timing.collapse===undefined)timing.collapse=performance.now();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
        const original=window.fetch;window.fetch=async(...args)=>{timing.request=performance.now();try{const response=await original(...args);const json=response.json.bind(response);response.json=async()=>{const result=await json();timing.decoded=performance.now();return result};return response}finally{timing.response=performance.now()}};
      });
      const save=form.locator(item.id==="waitlist"?"button":"button[type=submit]");
      await save.click();
      await page.waitForFunction(()=>window.__qa.request!==undefined);
      const pendingMs=await page.evaluate(()=>performance.now()-window.__qa.click);
      if(!await field.isVisible() || !await save.isDisabled())throw Error("Editor closed early or duplicate submit enabled");
      if(mode==="slow") {
        await page.waitForTimeout(3050);
        if(!await field.isVisible() || !await save.isDisabled())throw Error("Slow request closed editor prematurely");
        await page.screenshot({path:path.join(output,`${width}-${scenario}-pending.png`),fullPage:true});
      }
      releaseResponse();
      if(mode==="rejected" || mode==="uncertain") {
        await form.getByText(mode==="rejected"?"合成驗證失敗":/尚未確認儲存結果/).first().waitFor();
        if(await field.inputValue()!==item.value)throw Error("Failed draft lost");
        mode="success";
        await form.locator(item.id==="waitlist"?"button":"button[type=submit]").click();
      }
      await page.waitForFunction(()=>window.__qa.response!==undefined);
      if(mode==="success" || mode==="slow" || mode==="sync-warning") {
        if(baseline || mode==="sync-warning") {
          await page.waitForTimeout(200);
        } else await field.waitFor({state:"hidden"});
      }
      const timing=await page.evaluate(()=>({...window.__qa,observed:performance.now(),overflow:document.documentElement.scrollWidth>innerWidth}));
      const collapsed=!await field.isVisible();
      if(!baseline && mode!=="sync-warning" && !collapsed)throw Error(`Did not collapse ${item.id}`);
      if(mode==="sync-warning"){if(collapsed)throw Error("Sync warning hidden by collapse");await form.getByText(/其他頁面更新失敗/).first().waitFor();}
      if(timing.overflow)throw Error(`Overflow ${width}/${item.id}`);
      if(page.url()!==urlBefore)throw Error("Unexpected navigation");
      const expectedCalls=["rejected","uncertain"].includes(scenario)?2:1;
      if(calls.length!==expectedCalls)throw Error("Unexpected request count");
      if(scenario==="uncertain" && calls[0].requestKey!==calls[1].requestKey)throw Error("Uncertain retry changed request key");
      const result={width,height,scenario,setting:item.id,pendingMs:Math.round(pendingMs),requestMs:Math.round(timing.response-timing.request),clickToObservedMs:Math.round(timing.observed-timing.click),responseToObservedMs:Math.round(timing.observed-timing.response),responseToCollapseMs:timing.collapse===undefined?null:Math.round(timing.collapse-timing.response),jsonDecodeMs:timing.decoded===undefined?null:Math.round(timing.decoded-timing.response),collapsed,calls:calls.length,overflow:timing.overflow};
      results.push(result);writeFileSync(path.join(output,"results.json"),JSON.stringify({synthetic:true,businessAcceptance:false,baseline,safari:false,complete:false,results},null,2));console.log(JSON.stringify(result));
      if(scenario==="success" || scenario==="sync-warning")await page.screenshot({path:path.join(output,`${width}-${scenario}-${item.id}.png`),fullPage:true});
      await page.close();
    }
  }
  if(failures.length)throw Error(failures.join("\n"));
  writeFileSync(path.join(output,"results.json"),JSON.stringify({synthetic:true,businessAcceptance:false,baseline,safari:false,complete:true,results},null,2));
  console.log(`Synthetic settings QA: ${results.length} cases passed. ${output}`);
} finally {await browser?.close();}
