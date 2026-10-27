import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {readdirSync,readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

/** Actual browser components -> loopback HTTP -> caller's real database
 * services. Authentication adapter is explicitly synthetic and store-fixed. */
export async function verifyItemDatabaseUi(handle,profile,width,height){
 const {chromium}=createRequire(import.meta.url)(process.env.QA_PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
 const root=process.cwd(),prefix='\0item-core-db:',names=new Set();
 const out=path.join(root,'artifacts/item-core-compat');mkdirSync(out,{recursive:true});
 for(const file of readdirSync(path.join(root,'src/server/actions'))){if(!file.endsWith('.ts'))continue;for(const match of readFileSync(path.join(root,'src/server/actions',file),'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g))names.add(match[1]);}
 const server=await createServer({root,configFile:false,define:{'process.env':'{}'},cacheDir:'/tmp/item-core-database-vite',optimizeDeps:{include:['react','react-dom','react-dom/client','sonner','zod']},plugins:[react(),{
  name:'isolated-item-core-db',configureServer(server){server.middlewares.use(async(req,res,next)=>{
   if(req.url==='/__qa/item-core'){
    try{let body='';for await(const chunk of req){body+=chunk;if(body.length>32768)throw Error('Request too large');}const input=JSON.parse(body);const result=await handle(input.name,input.args);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
    catch(error){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:false,error:error instanceof Error?error.message:'Failed'}));}return;
   }
   if(req.url==='/'||req.url?.startsWith('/?')){const fixture=profile==='beauty'?'item-core-beauty-database-fixture.tsx':'item-core-database-fixture.tsx';res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/${fixture}"></script></body></html>`));return;}next();
  });},resolveId(id){if(id.startsWith(prefix))return id;},load(id){
   if(id===prefix+'navigation')return `const router={refresh(){throw Error('Unexpected refresh')},push(){throw Error('Unexpected navigation')},replace(){throw Error('Unexpected navigation')},prefetch(){}};export const useRouter=()=>router;export const usePathname=()=>'/s/isolated/admin/dashboard/courses';export const useSearchParams=()=>new URLSearchParams(location.search);export const unstable_rethrow=()=>{};`;
   if(id===prefix+'link')return `export default 'a';export const useLinkStatus=()=>({pending:false});`;
   if(id===prefix+'dynamic')return `import React from 'react';export default loader=>{const Component=React.lazy(async()=>{const m=await loader();return {default:m.default??m}});return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(Component,props));};`;
   if(id===prefix+'actions')return [...names].map(name=>`export const ${name}=(...args)=>window.qaAction(${JSON.stringify(name)},...args);`).join('\n');
  }
 }],resolve:{alias:[{find:'next/navigation',replacement:prefix+'navigation'},{find:'next/link',replacement:prefix+'link'},{find:'next/dynamic',replacement:prefix+'dynamic'},{find:/^@\/server\/actions\/.*$/,replacement:prefix+'actions'},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
 let browser;
 try{
  await server.listen();browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?profile=${profile}`);const original=page.url();
  if(profile==='beauty'){
   const pending=page.getByRole('button',{name:'驗收顧客：已預約',exact:true});await pending.click();
   const confirm=page.getByRole('button',{name:'確認結帳',exact:true});await confirm.waitFor();
   await page.locator('select[name="paymentMethod"]').selectOption('CARD');
   await page.screenshot({path:path.join(out,`${profile}-${width}-payment.png`)});
   await confirm.click();await confirm.waitFor({state:'hidden'});
   await page.getByText('10 次',{exact:true}).first().waitFor();
   assert.equal(await page.getByRole('button',{name:'驗收顧客：已完成',exact:true}).count(),0);
   await pending.click();const attended=page.getByRole('button',{name:'驗收顧客：已完成',exact:true});await attended.waitFor();
   await page.getByText('9 次',{exact:true}).first().waitFor();await attended.click();
   await page.getByRole('menuitem',{name:'恢復待服務',exact:true}).click();await pending.waitFor();await page.getByText('10 次',{exact:true}).first().waitFor();
  }else{
  const pendingName=profile==='music'?'驗收學員：點名':'驗收學員：待點名';
  await page.getByRole('button',{name:pendingName,exact:true}).click();
  await page.getByRole('button',{name:'繳費／購買方案',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'學員繳費 · 驗收學員'});await dialog.waitFor();
  await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');await page.screenshot({path:path.join(out,`${profile}-${width}-payment.png`)});
  await dialog.getByRole('button',{name:'確認購課與本次收款',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.equal(page.url(),original);assert.equal(await page.getByRole('button',{name:'驗收學員：已出席',exact:true}).count(),0);
  await page.getByText(/10 堂/).first().waitFor();
  await page.getByRole('button',{name:pendingName,exact:true}).click();
  await page.getByRole('button',{name:'驗收學員：已出席',exact:true}).waitFor();await page.getByText(/9 堂/).first().waitFor();
  await page.getByRole('button',{name:'驗收學員：已出席',exact:true}).click();
  await page.getByRole('menuitem',{name:/恢復/}).click();
  await page.getByRole('button',{name:pendingName,exact:true}).waitFor();await page.getByText(/10 堂/).first().waitFor();
  }
  assert.equal(page.url(),original);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,`${profile}-${width}-restored.png`),fullPage:true});
  return {profile,width,height,result:'PASS',transport:'real loopback HTTP + real isolated PostgreSQL',authorization:'fixed synthetic test identity'};
 }finally{await browser?.close();await server.close();}
}
