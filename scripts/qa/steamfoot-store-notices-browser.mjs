// Synthetic preview only. No application credentials, routes, or databases.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd(),out=process.env.QA_OUTPUT||'/tmp/steamfoot-store-notices-preview';mkdirSync(out,{recursive:true});
const stub='\0steam-notices:';
const server=await createServer({root,configFile:false,cacheDir:'/tmp/steam-notices-vite-cache',optimizeDeps:{include:['react','react-dom','react-dom/client']},plugins:[react(),{
 name:'synthetic-steam-notices',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');s.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/steamfoot-store-notices-fixture.tsx"></script></body></html>').then(v=>res.end(v));}else next();});},
 resolveId(id){if(id.startsWith(stub))return id;if(id==='@/server/actions/steamfoot-store-notices')return stub+'actions';if(id==='next/navigation')return stub+'navigation';if(id==='next/link')return stub+'link';},
 load(id){if(id===stub+'actions')return `export async function saveSteamfootNoticeSetting({enabled}){globalThis.__noticeEnabled=enabled;return {success:true,data:{enabled}};}`;if(id===stub+'link')return 'import React from "react";export const useLinkStatus=()=>({pending:false});export default function Link({children,...props}){return React.createElement("a",props,children)}';if(id===stub+'navigation')return 'export const useRouter=()=>({refresh(){},replace(){}});export const usePathname=()=>"/dashboard/settings";export const useSearchParams=()=>new URLSearchParams();export const unstable_rethrow=e=>{throw e};';}
}],resolve:{alias:[{find:'@/server/actions/steamfoot-store-notices',replacement:stub+'actions'},{find:'next/navigation',replacement:stub+'navigation'},{find:'next/link',replacement:stub+'link'},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();const port=server.httpServer.address().port;let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
 for(const [width,height] of [[1366,900],[1920,1080],[1024,768],[768,1024],[560,800],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.getByRole('button',{name:'門市通知，3 筆待處理'}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(`Page overflow ${width}`);
  const box=await dialog.boundingBox();if(box.x<0||box.x+box.width>width+1)throw Error('Panel outside viewport');
  await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('tab',{name:'待處理 2'}).waitFor();
  await page.getByRole('button',{name:'復原',exact:true}).click();await page.getByRole('tab',{name:'待處理 3'}).waitFor();
  await page.evaluate(()=>globalThis.__failNotice=true);await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('alert').filter({hasText:'儲存失敗'}).waitFor();
  await page.evaluate(()=>globalThis.__failNotice=false);await page.getByRole('button',{name:'標記已處理：王小明'}).click();await page.getByRole('button',{name:'復原',exact:true}).click();await page.getByRole('tab',{name:'待處理 3'}).waitFor();
  await page.getByRole('button',{name:/王小明改期|王小明 改期/}).click();await page.getByRole('button',{name:'查看預約',exact:true}).click();
  await page.screenshot({path:path.join(out,`${width}x${height}.png`)});
  await page.getByRole('button',{name:'關閉通知'}).click();
  if(await page.getByLabel('保留中的輸入').inputValue()!=='交班備註')throw Error('Underlying draft changed');
  await page.getByText('查看預約：booking-0',{exact:true}).waitFor();
  await page.getByRole('switch',{name:'後台異動通知',exact:true}).click();await page.getByRole('button',{name:'門市通知，3 筆待處理'}).waitFor({state:'hidden'});
  await page.getByRole('switch',{name:'後台異動通知',exact:true}).click();await page.getByRole('button',{name:'門市通知，3 筆待處理'}).waitFor();
  if(errors.length)throw Error(errors.join(';'));results.push({width,height,overflow:false,mark:true,undo:true,failureRestored:true,targetCallback:true,draftPreserved:true,settingToggle:true});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server.close();}
