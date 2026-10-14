// Run from the repo root. All backend imports and all network requests are blocked.
// The bundle and Chromium screenshots are local synthetic evidence, not business QA.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = process.cwd(), output = "/tmp/course-settings-three-state-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-settings-three-state-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    builder.onResolve({filter:/^@\/server\/actions\/course-settings-panel$/},()=>({path:"settings-reader",namespace:"settings-reader"}));
    builder.onLoad({filter:/.*/,namespace:"settings-reader"},()=>({contents:`import {createElement as h,useState} from 'react';
import {useSettingsPanelGuard,useSettingsPanelSaved} from '@/components/admin/settings-panel-context';
function Form(){const [value,setValue]=useState('草稿');const [saved,setSaved]=useState('草稿');const complete=useSettingsPanelSaved();useSettingsPanelGuard(value!==saved,false);return h('div',null,h('label',{className:'block p-6'},'未儲存草稿',h('input',{'aria-label':'未儲存草稿',value,onChange:e=>setValue(e.target.value),className:'min-h-11 max-w-full border px-3'})),h('button',{onClick:()=>{setSaved(value);complete?.();}},'合成儲存'));}
export const readCourseSettingsPanel=async(storeId,panel,query)=>{window.__reads=(window.__reads??0)+1;return {storeId,panel,query,content:h(Form)}};`,loader:"js",resolveDir:root}));
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
        const subscribe=cb=>{window.addEventListener('qa-route',cb);window.addEventListener('popstate',cb);return()=>{window.removeEventListener('qa-route',cb);window.removeEventListener('popstate',cb)}};
        const oldPush=history.pushState.bind(history);history.pushState=(...args)=>{oldPush(...args);window.dispatchEvent(new Event('qa-route'));};
        const oldReplace=history.replaceState.bind(history);history.replaceState=(...args)=>{oldReplace(...args);window.dispatchEvent(new Event('qa-route'));};
        const navigate=href=>{window.__routerCalls=(window.__routerCalls??0)+1;history.replaceState(null,'',href);};
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
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
const moduleCss=readFileSync(path.join(output,"fixture.css"),"utf8");
writeFileSync(path.join(output, "fixture.css"), css.css+"\n"+moduleCss);
let browser;
try {
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const failures = [],timings=[];
  page.on("console",msg=>{if(msg.text().includes("[SETTINGS_PANEL_PERF]"))timings.push(msg.text());});
  page.on("pageerror", error => failures.push(error.message));
  await page.route("**/*", route => {
    if (route.request().url().startsWith("http://synthetic.invalid/")) return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>' });
    failures.push("Unexpected network: " + route.request().url());
    return route.abort();
  });
  await page.goto("http://synthetic.invalid/s/synthetic/admin/dashboard/courses?view=settings&section=notifications");
  await page.addStyleTag({ path: path.join(output, "fixture.css") });
  await page.addScriptTag({ path: path.join(output, "fixture.js") });
  const results = [];
  for (const music of [false, true]) {
    await page.getByLabel("音樂模組").setChecked(music);
    for (const [width, height] of [[1366, 900], [1440, 900], [1024, 768], [768, 1024], [767, 1024], [560, 768]]) {
      await page.setViewportSize({ width, height });
      for (const state of ["HIDDEN", "LOCKED", "ENABLED"]) {
        await page.getByLabel("功能狀態").selectOption(state);
        const result = await page.evaluate(() => {
          const section = document.querySelector('section[aria-label="通知與顧客經營"]');
          return { overflow: document.documentElement.scrollWidth > innerWidth, text: section.textContent,
            links: [...section.querySelectorAll('a[aria-label]')].map(link => ({ label: link.getAttribute('aria-label'), height: link.getBoundingClientRect().height, href: link.getAttribute('href') })) };
        });
        if (result.overflow) throw new Error(`Overflow at ${width}/${state}`);
        if (state === "ENABLED" && (result.links.length !== 3 || result.links.some(link => link.height < 44))) throw new Error("Enabled actions inaccessible");
        if (state !== "ENABLED" && result.links.length) throw new Error("Blocked state exposes links");
        if (state === "LOCKED" && ((result.text.match(/未開通/g) || []).length !== 3 || result.text.includes("目前沒有可使用"))) throw new Error("Locked empty state incorrect");
        if (state === "HIDDEN" && ["提醒管理", "推薦分享", "數位管家"].some(title => result.text.includes(title))) throw new Error("Hidden title exposed");
        results.push({ music, width, height, state, ...result });
        if (state === "LOCKED") await page.screenshot({ path: path.join(output, `${music ? "music" : "sports"}-${width}.png`), fullPage: true });
      }
    }
  }
  await page.setViewportSize({width:1366,height:900});
  await page.getByRole('link',{name:'開啟推薦分享'}).click();
  await page.getByLabel("未儲存草稿").fill("尺寸切換草稿");
  await page.setViewportSize({ width: 560, height: 768 });
  if (await page.getByLabel("未儲存草稿").inputValue() !== "尺寸切換草稿") throw new Error("Draft lost after resize");
  await page.goBack();
  await page.getByText('尚有未儲存的修改，要捨棄嗎？').waitFor();
  await page.getByRole('button',{name:'不儲存並關閉',exact:true}).click();
  await page.getByRole('button',{name:'關閉視窗',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('link',{name:'開啟推薦分享'}).click();
  await page.getByLabel('未儲存草稿').fill('尺寸切換草稿');
  await page.getByRole('button',{name:'關閉視窗',exact:true}).click();
  await page.getByText('尚有未儲存的修改，要捨棄嗎？').waitFor();
  await page.getByRole('button',{name:'繼續編輯',exact:true}).click();
  await page.getByRole('button',{name:'合成儲存',exact:true}).click();
  if(await page.getByRole('button',{name:'關閉視窗',exact:true}).count())throw new Error('Saved panel did not close');
  await page.setViewportSize({width:1366,height:900});
  await page.getByRole('link',{name:'開啟推薦分享'}).click();
  await page.getByLabel('未儲存草稿').waitFor();
  await page.getByLabel("功能狀態").selectOption("LOCKED");
  if (await page.getByLabel("未儲存草稿").count()) throw new Error("Revoked editor remains mounted");
  for (const [width, height] of [[1366, 900], [1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "測試成功通知" }).click();
    const notification = page.locator('[data-sonner-toast][data-type="success"]').last();
    await notification.waitFor({ state: "visible" });
    const box = await notification.boundingBox();
    if (!box || box.x < 0 || box.x + box.width > width || box.y > 100) throw new Error("Success notice is outside the top-right viewport");
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Toast causes overflow");
    await page.screenshot({ path: path.join(output, `success-${width}.png`), fullPage: true });
    await notification.getByRole("button").click();
  }
  if(await page.evaluate(()=>window.__routerCalls??0))throw new Error('Settings operation navigated');
  if (failures.length) throw new Error(failures.join("\n"));
  writeFileSync(path.join(output, "results.json"), JSON.stringify({ synthetic: true, businessAcceptance: false, safari: false, timings, reads:await page.evaluate(()=>window.__reads??0), routerCalls:await page.evaluate(()=>window.__routerCalls??0), cases: results, draftResize: true, browserBackProtected:true,revokedEditorUnmounted: true }, null, 2));
  console.log(`Synthetic Chromium: ${results.length} cases passed; results and screenshots at ${output}`);
} finally { await browser?.close(); }
