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
const root = process.cwd(), output = process.env.QA_OUTPUT || "/tmp/settings-outcomes-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/settings-outcomes-fixture.tsx"], bundle: true,
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
const results=[];
const browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
const kinds=["self","window","steam-plan","subject","course-plan","staff"];
function receipt(kind,input) {
  const updatedAt="2026-10-21T01:00:00.000Z";
  if(kind==="self")return {enabled:input.enabled,revision:1};
  if(kind==="window")return {date:null,days:input.values.days,opensAt:null};
  if(kind==="subject")return {...input,id:input.id??"new-subject",updatedAt};
  if(kind==="course-plan")return {...input,id:input.id??"new-plan",lowBalanceEnabled:false,lowBalanceThreshold:null};
  if(kind==="steam-plan")return {...input.values,id:"new-plan",storeId:"qa-store",category:"SINGLE",isActive:true,createdAt:updatedAt,updatedAt,_count:{wallets:0},validityDays:input.values.validityDays??null,description:input.values.description??null};
  return {id:"qa-staff",updatedAt,userId:"qa-user",role:"STAFF",permissions:[],displayName:input.values.displayName,legalName:"",roleLabel:"員工",email:"qa@example.invalid",phone:null,colorCode:"#224466",status:"ACTIVE",customerCount:0,specialties:"",specialtyKeys:[],emergencyContact:null,weeklyAvailability:[],scheduleExceptions:[],canEdit:true,canResetPassword:false,compensationMode:null,compensationValue:null};
}
try {
for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024]].filter(([width])=>!process.env.QA_WIDTHS||process.env.QA_WIDTHS.split(",").includes(String(width)))) {
 for(const kind of kinds.filter(kind=>!process.env.QA_KIND||process.env.QA_KIND.split(",").includes(kind))) for(const scenario of (width===1366?["success","rejected","uncertain","sync-warning","slow"]:["success"])) {
  console.log(`${width}/${kind}/${scenario}`);
  const page=await browser.newPage({viewport:{width,height}});page.setDefaultTimeout(12000);
  const errors=[];page.on("pageerror",error=>{errors.push(error.message);console.error(error.message);});
  const calls=[];let mode=scenario;
  await page.route("**/*",async route=>{
   const request=route.request();
   if(request.method()==="GET"&&request.url().startsWith("https://synthetic.invalid/"))return route.fulfill({contentType:"text/html",body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});
   if(request.method()!=="POST"||!request.url().startsWith("https://synthetic.invalid/"))throw Error("Unexpected request "+request.url());
   const input=request.postDataJSON();calls.push(input);
   await new Promise(resolve=>setTimeout(resolve,mode==="slow"?3300:200));
   if(mode==="uncertain")return route.abort();
   if(mode==="rejected")return route.fulfill({status:400,json:{success:false,error:"隔離驗證失敗"}});
   return route.fulfill({json:{success:true,storeId:"qa-store",data:receipt(kind,input),syncWarning:mode==="sync-warning"}});
  });
  await page.goto(`https://synthetic.invalid/s/qa/admin/dashboard/courses?kind=${kind}`);
  await page.addStyleTag({path:path.join(output,"fixture.css")});await page.addScriptTag({path:path.join(output,"fixture.js")});
  let field,save;
  if(kind==="self"){field=page.locator('input[type="checkbox"]').first();await field.uncheck();save=page.getByRole("button",{name:"儲存",exact:true});}
  if(kind==="window"){await page.getByRole("button",{name:"修改",exact:true}).click();field=page.getByLabel("自動開放天數");await field.selectOption("21");save=page.getByRole("button",{name:"儲存設定",exact:true});}
  if(kind==="steam-plan"){field=page.locator('form input[type="text"]').first();await field.fill("隔離更新方案");await page.locator('form input[type="number"]').nth(0).fill("1000");await page.locator('form input[type="number"]').nth(1).fill("10");save=page.getByRole("button",{name:"新增",exact:true});}
  if(kind==="subject"){field=page.getByLabel("教學項目名稱（必填）");await field.fill("隔離更新項目");save=page.getByRole("button",{name:"儲存",exact:true});}
  if(kind==="course-plan"){field=page.locator('input[name="name"]');await field.fill("隔離更新方案");save=page.getByRole("button",{name:"儲存",exact:true});}
  if(kind==="staff"){field=page.locator('input[name="displayName"]');await field.fill("隔離更新人員");save=page.getByRole("button",{name:"儲存",exact:true});}
  const original=kind==="self"?await field.isChecked():await field.inputValue();
  await page.setViewportSize({width:height,height:width});await page.setViewportSize({width,height});
  if((kind==="self"?await field.isChecked():await field.inputValue())!==original)throw Error("Draft lost on resize");
  await field.evaluate(el=>el.setAttribute("data-qa-field","active"));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error("Open editor overflows viewport");
  await save.scrollIntoViewIfNeeded();
  const bounds=await save.boundingBox();if(!bounds||bounds.x<0||bounds.x+bounds.width>width+1||bounds.y<0||bounds.y+bounds.height>height+1)throw Error("Save control outside viewport");
  if(width!==1366)await page.screenshot({path:path.join(output,`${width}-${kind}-open.png`),fullPage:true});
  await save.evaluate(el=>el.setAttribute("data-qa-save","active"));save=page.locator('[data-qa-save="active"]');
  const started=Date.now();await save.click();await page.waitForFunction(()=>document.querySelector('[data-qa-field="active"]'));
  if(scenario==="slow"){await page.waitForTimeout(3000);if(!await field.isVisible()||!await save.isDisabled())throw Error("Slow request closed early");}
  if(scenario==="rejected"||scenario==="uncertain") {
   await page.getByRole("alert").filter({hasText:scenario==="rejected"?"隔離驗證失敗":"尚未確認儲存結果"}).first().waitFor();
   if(!await field.isVisible()||(kind!=="self"&&await field.inputValue()!==original))throw Error("Failed draft lost");
   mode="success";await save.click();
  }
  if(scenario==="sync-warning"){
   await page.getByRole("alert").filter({hasText:"其他頁面更新失敗"}).first().waitFor();
   if(!await field.isVisible()||(kind!=="self"&&await field.inputValue()!==original))throw Error("Warning draft lost");
   // An already committed CREATE must never submit again while its warning is shown.
   if (await page.locator('form').count()) await page.locator('form').last().evaluate(form=>form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
   await page.waitForTimeout(250);if(calls.length!==1)throw Error("Committed warning resubmitted");
  }else if(kind==="steam-plan") await page.waitForFunction(()=>document.querySelector('[data-right-sheet][aria-hidden="true"][inert]'));
  else await field.waitFor({state:"hidden"});
  if(scenario==="uncertain"&&JSON.stringify(calls[0])!==JSON.stringify(calls[1]))throw Error("Uncertain retry changed payload/key");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow||errors.length)throw Error(JSON.stringify({overflow,errors}));
  if(width!==1366||scenario==="sync-warning")await page.screenshot({path:path.join(output,`${width}-${kind}-${scenario}.png`),fullPage:true});
  results.push({kind,scenario,width,height,elapsedMs:Date.now()-started,calls:calls.length,passed:true});
  writeFileSync(path.join(output,"results.json"),JSON.stringify(results,null,2));await page.close();
 }
}
}finally{await browser.close();}
console.log(`Passed ${results.length} isolated component cases; not production timings.`);
