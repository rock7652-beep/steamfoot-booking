// Run from the repo root. All backend imports and all network requests are blocked.
// The bundle and Chromium screenshots are local synthetic evidence, not business QA.
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const { chromium } = require("/opt/codex/cua_node/lib/node_modules/playwright");
const root = process.cwd(), output = "/tmp/course-inline-plan-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-inline-plan-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"',"process.env.NEXT_PUBLIC_BUILD_ENV":'"synthetic"' },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "qa" }));
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "qa" }));
    builder.onResolve({ filter: /(?:^|\/)app-link$/ }, () => ({ path: "app-link", namespace: "qa" }));
    builder.onResolve({ filter: /^@\/server\// }, args => ({ path: path.join(root, "src", args.path.slice(2) + ".ts"), namespace: "blocked-server" }));
    builder.onLoad({ filter: /.*/, namespace: "blocked-server" }, args => {
      const source = readFileSync(args.path, "utf8");
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(match => match[1]);
      return { contents: names.map(name => `export const ${name} = (...args) => window.__inlinePreview(${JSON.stringify(name)},...args);`).join("\n"), loader: "js" };
    });
    builder.onLoad({ filter: /.*/, namespace: "qa" }, args => {
      if (args.path === "navigation") return { contents: `import {useSyncExternalStore} from 'react';
        for(const name of ['pushState','replaceState']){const original=history[name].bind(history);history[name]=(...args)=>{original(...args);window.dispatchEvent(new Event('qa-route'));};}
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


const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const [width,height]of [[390,844],[768,1024],[1024,768],[1366,900]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().isNavigationRequest()?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):r.abort());
 await page.goto('https://synthetic.invalid/hq/dashboard/courses?customerId=synthetic-learner');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const url=page.url(),frame=page.getByRole('complementary',{name:'顧客資料'});
 for(const action of ['調整期限','註銷方案']){
  const more=page.getByRole('button',{name:'鋼琴二十堂 更多操作'});await more.scrollIntoViewIfNeeded();const scroll=await frame.evaluate(el=>el.scrollTop);await more.click();await page.getByRole('button',{name:action,exact:true}).click();
  const inline=page.locator('[aria-label="同頁方案操作"]');await inline.waitFor();if(action==='調整期限')await page.getByLabel('新到期日').waitFor({timeout:5000}).catch(async error=>{writeFileSync(path.join(output,'debug.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(output,'debug.png'),fullPage:true});throw error;});else await page.getByText(/收回剩餘 19 堂/).waitFor();
  if(page.url()!==url)throw new Error('Action changed route');if(await frame.count()!==1)throw new Error('Customer panel replaced');if(Math.abs(await frame.evaluate(el=>el.scrollTop)-scroll)>2)throw new Error('Action reset original scroll');
  if(await frame.evaluate(el=>el.scrollWidth>el.clientWidth+1))throw new Error('Inline form overflow');
  await page.screenshot({path:path.join(output,`${action==='調整期限'?'expiry':'close'}-${width}.png`),fullPage:true});await inline.screenshot({path:path.join(output,`${action==='調整期限'?'expiry':'close'}-form-${width}.png`)});
  await page.getByRole('button',{name:'取消',exact:true}).click();if(await inline.count())throw new Error('Cancel did not close inline editor');
 }
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Page overflow');if(errors.length)throw new Error(errors.join('\n'));
 results.push({width,height,routeUnchanged:true,panelRetained:true,scrollPreservedOnOpen:true,cancelRetainsGrid:true,realWrites:false,errors});await page.close();
}writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
