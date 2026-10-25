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
const root = process.cwd(), output = "/tmp/course-single-charge-qa";
mkdirSync(output, { recursive: true });
await build({
  entryPoints: ["scripts/qa/course-single-charge-fixture.tsx"], bundle: true,
  format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  alias: { "@": path.join(root, "src") },
  plugins: [{ name: "isolated-course-settings", setup(builder) {
    builder.onResolve({filter:/^@\/components\/admin\/use-settings-save$/},()=>({path:'save',namespace:'qa'}));
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
      if(args.path==='save')return {contents:'export const useSettingsSave=()=>({uncertain:false,save:async input=>{window.syntheticSaves=(window.syntheticSaves||[]).concat([input]);return {success:true,data:{id:"synthetic",...input}};}})',loader:'js'};
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

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('https://synthetic.invalid/')?route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'}):route.abort());
 await page.goto('https://synthetic.invalid/dashboard/courses');await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 await page.getByLabel('驗收模組').waitFor({timeout:5000}).catch(()=>{throw Error(JSON.stringify(errors));});
 const results=[];
 for(const module of ['music','sports']){
  await page.getByLabel('驗收模組').selectOption(module);
  if(await page.getByLabel('收費類型',{exact:true}).inputValue()!=='single')throw Error('Default is not single');
  await page.getByLabel('體驗價',{exact:true}).fill('0');await page.getByLabel('體驗時間',{exact:true}).fill('20');
  for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow '+module+'/'+width);
   if(await page.getByLabel('體驗時間',{exact:true}).inputValue()!=='20')throw Error('Draft lost on resize');
   await page.screenshot({path:path.join(output,module+'-'+width+'.png'),fullPage:true});results.push({module,width,height,overflow:false,draftRetained:true});
  }
  if(module==='sports'){
   await page.getByLabel('方案適用方式').selectOption('OPEN');
   if(await page.getByLabel('體驗價',{exact:true}).count())throw Error('Open selection exposes individual trial price');
   if(!await page.getByText('開放選課沿用店家預設體驗費，時間依所選課程。').count())throw Error('Missing default trial explanation');
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,backendVerified:false,results,errors},null,2));
 process.stdout.write(JSON.stringify({output,checks:results.length,errors})+'\n');
}finally{await browser.close();}
