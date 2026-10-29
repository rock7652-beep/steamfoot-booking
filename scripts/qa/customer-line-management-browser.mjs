// Component-only RWD acceptance. All server actions are synthetic; no real identity verification.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const out=process.env.QA_OUTPUT||'/tmp/pr1465-rwd';mkdirSync(out,{recursive:true});
const stub='\0customer-line-qa:';
const server=await createServer({root:process.cwd(),configFile:false,define:{'process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL':'""'},cacheDir:'/tmp/pr1465-vite',optimizeDeps:{include:['react','react-dom/client']},plugins:[react(),{
 name:'customer-line-qa',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');s.transformIndexHtml('/', '<!doctype html><html lang="zh-Hant"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/customer-line-management-fixture.tsx"></script></body></html>').then(v=>res.end(v));}else next();});},
 resolveId(id){if(id.startsWith(stub))return id;},
 load(id){if(id===stub+'reminder')return `export async function unlinkLineAccount(){window.__lineChanged('unlink');return {success:true};}export async function generateLineBindingCode(){return {success:true,data:{code:'QATEST'}};}`;if(id===stub+'rebind')return `export async function startPhoneLineRebindAction(){window.__lineChanged('create');return {success:true};}export async function createLineRebindCaptureRequest(){window.__lineChanged('create');return {success:true,data:{status:'created'}};}export async function cancelLineRebindCaptureRequest(){return {success:true};}export async function dryRunLineRebind(){return {success:true,data:{requestId:'qa-request',overall:'READY_FOR_REBIND',checks:{}}};}export async function executeLineRebindAction(){window.__lineChanged('execute');return {success:true};}`;if(id===stub+'nav')return 'export const useRouter=()=>({refresh(){}});';}
}],resolve:{alias:[{find:'@/server/actions/reminder',replacement:stub+'reminder'},{find:'@/server/actions/line-rebind',replacement:stub+'rebind'},{find:'next/navigation',replacement:stub+'nav'},{find:'@',replacement:path.join(process.cwd(),'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844],[360,800]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.getByRole('button',{name:'⋯ 管理',exact:true}).click();
  await page.getByRole('button',{name:'取消 LINE 綁定',exact:true}).click();
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('button')].filter(n=>n.offsetParent).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}));
  assert.equal(layout.overflow,false);assert.ok(layout.controls.every(c=>c.height>=44&&c.width>=44));
  await page.getByRole('button',{name:'確認取消綁定',exact:true}).click();await page.getByText('LINE：未綁定',{exact:true}).waitFor();
  await page.getByRole('button',{name:'重新綁定',exact:true}).click();
  await page.getByText('請顧客在 15 分鐘內於本店官方 LINE 輸入手機號碼，系統會自動完成綁定。',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,`${width}x${height}-waiting.png`),fullPage:true});
  await page.evaluate(()=>window.__lineChanged('execute'));
  await page.getByText('LINE：已綁定',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);results.push({width,height,...layout,rebind:true,unlink:true,phoneInputSimulated:true,pageErrors:errors});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify({scope:'synthetic component; not hosted business acceptance or real devices',results},null,2));console.log(JSON.stringify({output:out,sizes:results.length,passed:true}));
}finally{await browser?.close();await server.close();}
