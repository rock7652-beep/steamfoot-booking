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
const root = process.cwd(), output = "/tmp/teaching-plan-compensation-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/teaching-plan-compensation-fixture.tsx"], bundle: true,
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
const css = await postcss([tailwind({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: path.join(root, "src/app/globals.css") });
writeFileSync(path.join(output, "fixture.css"), css.css);
let browser;
try {
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://synthetic.invalid/')?route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto('http://synthetic.invalid/dashboard/teachers');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 await page.getByRole('button',{name:'全選全部教學項目'}).click();
 if(await page.getByRole('checkbox',{checked:true}).count()!==3)throw Error('ABC selection lost');
 await page.getByRole('tab',{name:'方案計酬',exact:true}).click();
 if(await page.getByRole('button',{name:'修改',exact:true}).count()!==24)throw Error('Missing plan rows');
 await page.getByRole('button',{name:'修改',exact:true}).first().click();
 const mode=page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬方式');
 await mode.selectOption('CLASS');await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').fill('600');
 const results=[];
 for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
  await page.setViewportSize({width,height});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  if(overflow)throw Error('Horizontal overflow '+width);
  if(await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').inputValue()!=='600')throw Error('Draft lost on resize');
  const screenshot=path.join(output,`teaching-fees-${width}.png`);await page.screenshot({path:screenshot,fullPage:false});
  await page.getByRole('tab',{name:'授課資格',exact:true}).click();
  if(await page.getByRole('checkbox',{checked:true}).count()!==3)throw Error('Tab switch lost qualifications');
  const qualificationsScreenshot=path.join(output,`teaching-qualifications-${width}.png`);await page.screenshot({path:qualificationsScreenshot,fullPage:false});
  await page.getByRole('tab',{name:'方案計酬',exact:true}).click();
  if(await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').inputValue()!=='600')throw Error('Tab switch lost fee draft');
  results.push({width,height,overflow,screenshot,qualificationsScreenshot});
 }
 await page.getByLabel('搜尋收費方案').fill('不存在');if(await page.getByRole('button',{name:'修改',exact:true}).count()!==0)throw Error('Search ignored');
 await page.getByLabel('搜尋收費方案').fill('');
 if(!await page.getByLabel('草稿資料').textContent().then(value=>value.includes('600')))throw Error('Search lost draft');
 await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').fill('');
 await page.getByRole('tab',{name:'授課資格',exact:true}).click();
 await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').dispatchEvent('invalid');
 await page.waitForFunction(()=>document.querySelector('[data-teaching-pane="fees"]').hidden===false);
 await page.getByLabel('A1 長名稱合作方案・可依不同合作內容安排授課時間與每次固定費用計酬數值').fill('600');
 if(errors.length)throw Error(errors.join('; '));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,backend:false,plans:24,checks:['ABC select all','24 fee plans','per-plan CLASS 600','resize preserves draft','tab switch preserves qualifications and fee drafts','search preserves draft','invalid hidden field opens its pane'],results},null,2));
 console.log(JSON.stringify({output,results,errors}));
}finally{await browser?.close();}
