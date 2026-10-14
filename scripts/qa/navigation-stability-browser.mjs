import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = process.cwd(), output = "/tmp/navigation-stability-qa";
mkdirSync(output, { recursive: true });
await build({ entryPoints: ["scripts/qa/navigation-stability-fixture.tsx"], bundle: true, format: "iife", jsx: "automatic", outfile: path.join(output, "fixture.js"),
  define: { "process.env.NODE_ENV": '"development"' }, alias: { "@": path.join(root, "src") },
  plugins: [{ name: "synthetic-router", setup(builder) {
    builder.onResolve({filter:/^next\/navigation$/},()=>({path:"navigation",namespace:"qa"}));
    builder.onResolve({filter:/^@\/server\//},()=>{throw new Error("Backend imports forbidden in navigation synthetic QA");});
    builder.onLoad({filter:/.*/,namespace:"qa"},()=>({contents:`
      window.__navigation=[];
      const router={push:(href,options)=>window.__navigation.push({method:'push',href,options}),replace:(href,options)=>window.__navigation.push({method:'replace',href,options}),refresh:()=>window.__navigation.push({method:'refresh'}),prefetch:()=>{},back:()=>{},forward:()=>{}};
      export const useRouter=()=>router;
      export const unstable_rethrow=()=>{};`,loader:"js",resolveDir:root}));
  }}] });
const css = await postcss([tailwind({base:root})]).process(readFileSync("src/app/globals.css","utf8"),{from:path.join(root,"src/app/globals.css")});
writeFileSync(path.join(output,"fixture.css"),css.css);
const browser = await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
try {
 const page=await browser.newPage();const failures=[];let documents=0;
 page.on('pageerror',error=>failures.push(error.message));
 await page.route('**/*',route=>{
  if(route.request().url().startsWith('http://synthetic.invalid/')) {documents++;return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>'});}
  failures.push('Unexpected network request');return route.abort();
 });
 await page.goto('http://synthetic.invalid/s/demo/admin/dashboard/cashbook');
 await page.addStyleTag({path:path.join(output,'fixture.css')});await page.addScriptTag({path:path.join(output,'fixture.js')});
 const cases=[];
 for(const [width,height] of [[1366,900],[1440,900],[1024,768],[768,1024],[560,768],[390,844]]) {
  await page.setViewportSize({width,height});
  await page.getByLabel('金額',{exact:true}).fill('100');
  const before=await page.getByLabel('已確認的合成紀錄').locator('li').count();
  await page.getByRole('button',{name:'新增收支',exact:true}).click();
  await page.getByLabel('已確認的合成紀錄').locator('li').nth(before).waitFor();
  if(await page.getByLabel('金額',{exact:true}).inputValue()!=='')throw new Error('Confirmed fields not reset');
  if(await page.locator('[data-persistent-navigation]').count()!==1)throw new Error('Navigation disappeared');
  await page.getByLabel('模擬拒絕').check();
  await page.getByLabel('金額',{exact:true}).fill('123');
  await page.getByRole('button',{name:'新增收支',exact:true}).click();
  await page.getByText('模擬金額核對失敗，輸入已保留',{exact:true}).waitFor();
  if(await page.getByLabel('金額',{exact:true}).inputValue()!=='123')throw new Error('Rejected input lost');
  await page.getByLabel('模擬拒絕').uncheck();
  await page.getByRole('button',{name:'切換載入骨架'}).click();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow at '+width);
  await page.screenshot({path:path.join(output,`workspace-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'切換載入骨架'}).click();
  await page.getByRole('button',{name:'查詢',exact:true}).click();
  cases.push({width,height,success:true,rejectionPreserved:true,skeleton:true});
 }
 const calls=await page.evaluate(()=>window.__navigation);
 if(calls.filter(call=>call.method==='refresh').length!==6)throw new Error('Not exactly one refresh per confirmed action');
 if(calls.some(call=>call.method==='replace'))throw new Error('Mutation navigated away');
 if(calls.filter(call=>call.method==='push').some(call=>call.href!=='/s/demo/admin/dashboard/cashbook?search=%E5%90%88%E6%88%90'||call.options?.scroll!==false))throw new Error('Query lost scope or scroll');
 if(documents!==1)throw new Error('Document reload occurred');
 if(failures.length)throw new Error(failures.join('\n'));
 writeFileSync(path.join(output,'results.json'),JSON.stringify({synthetic:true,businessAcceptance:false,documents,cases,calls},null,2));
 console.log('Navigation synthetic Chromium: 6 viewport cases passed; '+output);
}finally{await browser.close();}
