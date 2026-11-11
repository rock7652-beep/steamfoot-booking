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
const root = process.cwd(), output = "/tmp/subscription-referral-entry-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/subscription-referral-entry-fixture.tsx"], bundle: true,
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

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>route.request().isNavigationRequest()?route.fulfill({contentType:'text/html',body:'<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'}):route.abort());
 await page.goto('http://synthetic.invalid/s/synthetic/admin/dashboard/courses?view=settings&section=subscription');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const href=page.url();
 await page.getByText('SB-ABCDEFGH',{exact:true}).waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}}));
 await page.getByRole('button',{name:'複製推薦碼',exact:true}).click();
 if(await page.evaluate(()=>window.__copied)!=='SB-ABCDEFGH')throw new Error('Wrong copied code');
 await page.getByRole('button',{name:'複製連結',exact:true}).click();
 if(await page.evaluate(()=>window.__copied)!=='https://www.steamfoot.com/apply?ref=SB-ABCDEFGH')throw new Error('Wrong copied link');
 if(page.url()!==href)throw new Error('Referral copy navigated away');
 if(await page.locator('a[href*="subscription-referrals"]').count())throw new Error('Inline code still has a navigation link');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Overflow');
 if(errors.length)throw new Error(errors.join('\n'));
 await page.screenshot({path:path.join(output,`referral-${width}.png`),fullPage:true});await page.locator('section[aria-label="系統方案與用量"]').screenshot({path:path.join(output,`inline-code-${width}.png`)});
 if(width<768)await page.locator('nav[aria-label="設定分類"] select').selectOption('booking');else await page.getByRole('button',{name:'營業與預約',exact:true}).click();
 const booking=page.locator('section[aria-label="營業與預約"]');await booking.waitFor();
 const typography=await booking.evaluate(section=>({titles:[...section.querySelectorAll('h2,h3,legend')].filter(el=>el.getClientRects().length&&!el.classList.contains('sr-only')).map(el=>({text:el.textContent,size:getComputedStyle(el).fontSize})),buttons:[...section.querySelectorAll('button')].filter(el=>el.textContent==='修改'&&el.getClientRects().length).map(el=>getComputedStyle(el).fontSize)}));
 if(!typography.titles.some(row=>row.text==='預約開放期限')||typography.titles.some(row=>row.size!=='16px'))throw new Error('Setting titles have inconsistent sizes: '+JSON.stringify(typography));
 if(typography.buttons.some(size=>size!=='14px'))throw new Error('Setting action sizes inconsistent');
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('Booking settings overflow');
 await page.screenshot({path:path.join(output,`booking-type-${width}.png`),fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
 results.push({width,height,href,typography,errors});await page.close();
}writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser.close();}
