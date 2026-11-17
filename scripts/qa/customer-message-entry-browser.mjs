// Synthetic entry/composer integration only. No live database, credentials, or external sends.
import {createServer} from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import {createRequire} from "node:module";
import {mkdirSync,writeFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||"/Users/huangyanlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output="/tmp/steamfoot-customer-message-entry-qa";mkdirSync(output,{recursive:true});
const navigation=path.join(process.cwd(),"scripts/qa/customer-message-entry-navigation.tsx");
const server=await createServer({root:process.cwd(),configFile:false,cacheDir:path.join(output,"vite"),plugins:[react(),{name:"entry-fixture",configureServer(s){s.middlewares.use((req,res,next)=>{if(!req.url?.startsWith("/s/synthetic/"))return next();res.setHeader("Content-Type","text/html");s.transformIndexHtml(req.url,'<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/customer-message-entry-fixture.tsx"></script></body></html>').then(html=>res.end(html));});}}],resolve:{alias:[{find:"next/navigation",replacement:navigation},{find:"next/link",replacement:navigation},{find:"@/components/app-link",replacement:navigation},{find:"@/server/actions/customer-messages",replacement:path.join(process.cwd(),"scripts/qa/customer-messages-actions.ts")},{find:"@",replacement:path.join(process.cwd(),"src")}]},css:{postcss:{plugins:[tailwind()]}},server:{host:"127.0.0.1",port:0}});
await server.listen();const origin="http://127.0.0.1:"+server.httpServer.address().port,base=origin+"/s/synthetic/admin/dashboard/customers";
let browser;const results=[],errors=[];
try{browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});page.on("pageerror",e=>errors.push(e.message));await page.goto(base);
  await page.getByLabel("選取 示範顧客 1",{exact:true}).check();await page.getByLabel("選取 示範顧客 3",{exact:true}).check();
  await page.getByRole("link",{name:"發送訊息（2）",exact:true}).waitFor();await page.screenshot({path:path.join(output,width+"-entry.png"),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole("link",{name:"發送訊息（2）",exact:true}).click();await page.getByLabel("訊息內容",{exact:true}).waitFor();
  assert.match(page.url(),/\/s\/synthetic\/admin\/dashboard\/customers\/messages\?selection=/);
  await page.getByText("已選 2 位顧客，請輸入要傳送的內容。",{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__messageQA.calls),[]);
  await page.getByRole("button",{name:"上一步",exact:true}).click();
  assert.equal(await page.getByLabel("選擇 示範顧客 1",{exact:true}).isChecked(),true);assert.equal(await page.getByLabel("選擇 示範顧客 3",{exact:true}).isChecked(),true);assert.equal(await page.getByLabel("選擇 示範顧客 2",{exact:true}).isChecked(),false);
  await page.goto(base);await page.getByRole("button",{name:"示範顧客 1",exact:true}).click();await page.getByRole("link",{name:"發送 LINE",exact:true}).click();await page.getByLabel("訊息內容",{exact:true}).waitFor();await page.getByText("已選 1 位顧客，請輸入要傳送的內容。",{exact:true}).waitFor();
  await page.goto(base);await page.getByRole("link",{name:"發送紀錄",exact:true}).click();await page.getByText("尚無發送紀錄",{exact:true}).waitFor();assert.equal(await page.getByRole("heading",{name:"選顧客",exact:true}).count(),0);
  await page.screenshot({path:path.join(output,width+"-history.png"),fullPage:true});
  await page.goto(base+"?readonly=1");assert.equal(await page.getByRole("link",{name:"發送訊息",exact:true}).count(),0);assert.equal(await page.getByRole("link",{name:"發送紀錄",exact:true}).count(),0);
  await page.goto(base+"/messages?selection=00000000-0000-4000-8000-000000000001");await page.getByRole("alert").waitFor();assert.equal(await page.getByLabel("訊息內容",{exact:true}).count(),0);
  results.push({width,height,selection:true,single:true,history:true,readOnly:true,invalidSelection:true});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(output,"results.json"),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:true,results,output}));
}finally{await browser?.close();await server.close();}
