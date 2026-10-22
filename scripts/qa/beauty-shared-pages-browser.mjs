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
const root = process.cwd(), output = "/tmp/beauty-shared-pages-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/beauty-shared-pages-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
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
const componentCss=readFileSync(path.join(output,"fixture.css"),"utf8");
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+componentCss);
let browser;
try {
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const failures = [];
  page.on("pageerror", error => failures.push(error.message));
  await page.route("**/*", route => {
    if (route.request().url().startsWith("http://synthetic.invalid/")) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' });
    failures.push("Unexpected network: " + route.request().url());
    return route.abort();
  });
  await page.goto("http://synthetic.invalid/s/synthetic/admin/dashboard/courses?view=settings&section=notifications");
  await page.addStyleTag({ path: path.join(output, "fixture.css") });
  await page.addScriptTag({ path: path.join(output, "fixture.js") });
  // Next.js integrates native history with useSearchParams; emulate that integration only.
  await page.evaluate(()=>{const replace=history.replaceState.bind(history);history.replaceState=(...args)=>{replace(...args);window.dispatchEvent(new Event('qa-route'));};});
  const results=[];
  for(const module of ['beauty','sports','music']) {
    await page.getByLabel('驗收模組').selectOption(module);
    await page.evaluate(m=>{history.replaceState(null,'',m==='beauty'?'?tab=設定&section=store':'?view=settings&section=store');},module);
    for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,768]]) {
      await page.setViewportSize({width,height});
      for(const view of ['settings','analytics','care','consumption','reminders','reminder-settings']) {
        await page.getByLabel('驗收頁面').selectOption(view);
        if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow '+module+'/'+view+'/'+width);
        if(module==='beauty')await page.screenshot({path:path.join(output,view+'-'+width+'.png'),fullPage:true});
        results.push({module,view,width,height,overflow:false});
      }
    }
    await page.getByLabel('驗收頁面').selectOption('settings');
    await page.setViewportSize({width:1366,height:900});
    await page.locator('section[aria-label="店家資料"]').getByRole('button',{name:'修改',exact:true}).click();
    await page.locator('input[name="name"]').fill('尚未儲存的門市草稿');
    await page.getByRole('button',{name:'營業與預約',exact:true}).click();
    await page.getByRole('button',{name:/^店家資料/}).click();
    if(await page.locator('input[name="name"]').inputValue()!=='尚未儲存的門市草稿')throw Error('Draft lost on settings category change');
    await page.setViewportSize({width:768,height:1024});
    if(await page.locator('input[name="name"]').inputValue()!=='尚未儲存的門市草稿')throw Error('Draft lost on resize');
    // The next fixture remount intentionally discards synthetic data, never sends a save.
    await page.getByLabel('驗收頁面').selectOption('care');
    const form=page.locator('form');
    if(module==='beauty'&&await form.locator('input[name="tab"]').inputValue()!=='顧客經營')throw Error('Care filter lost module');
    results.push({module,draftCategoryPreserved:true,draftResizePreserved:true});
    await page.getByLabel('驗收頁面').selectOption('settings');
  }
  await page.getByLabel('驗收模組').selectOption('beauty');
  await page.getByLabel('驗收頁面').selectOption('analytics');
  await page.setViewportSize({width:1366,height:900});
  await page.getByRole('button',{name:/來客人次/}).first().click();
  const customer=page.getByRole('link',{name:/測試顧客長名稱/});
  if(!(await customer.getAttribute('href')).includes('/dashboard/beauty?tab=顧客管理'))throw Error('Analytics customer link entered course module');
  for(const module of ['beauty','music']) {
    await page.getByLabel('驗收模組').selectOption(module);
    await page.getByLabel('驗收頁面').selectOption('consumption');
    await page.getByRole('button',{name:/^篩選/}).click();
    if(!(await page.getByRole('dialog').isVisible()))throw Error('Consumption filter dialog missing');
    if(module==='beauty' && !(await page.getByLabel('取消／未到扣次').isVisible()))throw Error('Beauty deduction label missing');
    await page.getByRole('button',{name:'關閉篩選',exact:true}).click();
    const href=await page.getByRole('link',{name:/測試顧客長名稱/}).getAttribute('href');
    if(!href.includes(module==='beauty'?'/dashboard/beauty?':'/dashboard/courses?'))throw Error('Consumption wrong customer route');
    await page.getByLabel('驗收頁面').selectOption('reminders');
    await page.getByLabel('驗收提醒頁籤').selectOption('manager');
    if(module==='beauty' && await page.getByRole('button',{name:/設定提醒|解除綁定|綁定我的 LINE/}).count())throw Error('Read-only manager offers LINE mutations');
    await page.setViewportSize({width:390,height:844});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Manager overflow');
    await page.getByLabel('驗收提醒頁籤').selectOption('logs');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Logs overflow');
    await page.getByText(/測試長名稱顧客/).click();
    const logHref=await page.getByRole('link',{name:'查看顧客 →'}).getAttribute('href');
    if(!logHref.includes(module==='beauty'?'/dashboard/beauty?':'/dashboard/courses?'))throw Error('Reminder wrong customer route');
    results.push({module,consumptionFilter:true,consumptionCustomerLink:true,reminderCustomerLink:true,phone390:true});
  }
  for(const module of ['beauty','music']) {
    await page.getByLabel('驗收模組').selectOption(module);
    await page.getByLabel('驗收頁面').selectOption('reminder-settings');
    await page.setViewportSize({width:1366,height:900});
    await page.getByRole('button',{name:'修改',exact:true}).first().click();
    const plan='提醒方案測試長名稱 00';
    await page.getByRole('switch',{name:plan+' 啟用提醒',exact:true}).check();
    await page.getByLabel(plan+' 提醒門檻',{exact:true}).fill('2');
    await page.getByRole('button',{name:'儲存',exact:true}).click();
    await page.getByText('「'+plan+'」已儲存',{exact:true}).waitFor();
    await page.getByRole('button',{name:'修改',exact:true}).first().click();
    if(await page.getByLabel(plan+' 提醒門檻',{exact:true}).inputValue()!=='2')throw Error('Reminder save did not reopen');
    await page.getByLabel(plan+' 提醒門檻',{exact:true}).fill('3');
    await page.getByRole('button',{name:'儲存',exact:true}).click();
    const writes=await page.evaluate(()=>window.reminderSaves);
    if(module==='beauty'&&writes.slice(-2).map(w=>w.expectedRevision).join(',')!=='0,1')throw Error('Reminder revision did not advance');
    await page.getByRole('switch',{name:'啟用整組體驗關懷',exact:true}).click();
    await page.getByText('體驗後關心',{exact:true}).click();
    await page.getByLabel('體驗後關心訊息內容',{exact:true}).fill('測試關懷草稿 {{customerName}}');
    await page.setViewportSize({width:768,height:1024});
    if(await page.getByLabel('體驗後關心訊息內容',{exact:true}).inputValue()!=='測試關懷草稿 {{customerName}}')throw Error('Care draft lost on resize');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Expanded reminder overflow');
    await page.getByRole('button',{name:'確認文案並啟用',exact:true}).click();
    await page.getByText('設定已儲存',{exact:true}).waitFor();
    if(!(await page.getByText('設定已儲存；LINE 關閉，尚不發送',{exact:true}).isVisible()))throw Error('Care setting claimed delivery');
    await page.getByLabel('唯讀驗收').check();
    if(!(await page.getByRole('button',{name:'修改',exact:true}).first().isDisabled()))throw Error('Read-only plan can edit');
    if(!(await page.getByRole('switch',{name:'啟用整組體驗關懷',exact:true}).isDisabled()))throw Error('Read-only care can edit');
    await page.getByLabel('唯讀驗收').uncheck();
    results.push({module,reminderReopen:true,revision:true,careDraftResize:true,blockedDeliveryCopy:true,readOnlyControls:true});
  }
  if(failures.length)throw Error(failures.join('\n'));
  writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,businessAcceptance:false,physicalDevice:false,results,errors:failures},null,2));
  console.log('Shared pages: '+results.length+' synthetic cases passed');
}finally{await browser?.close();}
