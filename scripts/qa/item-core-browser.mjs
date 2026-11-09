// UI verification only: source components with explicit synthetic transport.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {createRequire} from 'node:module';
import {readdirSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'artifacts/item-core');mkdirSync(out,{recursive:true});
const prefix='\0item-core:',names=new Set();
for(const file of readdirSync(path.join(root,'src/server/actions'))){if(!file.endsWith('.ts'))continue;for(const match of readFileSync(path.join(root,'src/server/actions',file),'utf8').matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g))names.add(match[1]);}
const server=await createServer({root,configFile:false,define:{'process.env':'{}'},cacheDir:'/tmp/item-core-vite',optimizeDeps:{include:['react','react-dom','react-dom/client','sonner','zod']},plugins:[react(),{
 name:'item-core-fixture-boundary',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url==='/'||req.url?.startsWith('/?')){res.setHeader('Content-Type','text/html');server.transformIndexHtml(req.url,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/item-core-fixture.tsx"></script></body></html>').then(html=>res.end(html));return;}next();});},
 resolveId(id){if(id.startsWith(prefix))return id;},load(id){
  if(id===prefix+'navigation')return `const router={refresh(){throw Error('Unexpected refresh')},push(){throw Error('Unexpected navigation')},replace(){throw Error('Unexpected navigation')},prefetch(){}};export const useRouter=()=>router;export const usePathname=()=>'/s/synthetic/admin/dashboard/courses';export const useSearchParams=()=>new URLSearchParams(location.search);export const unstable_rethrow=()=>{};`;
  if(id===prefix+'link')return `export default 'a';export const useLinkStatus=()=>({pending:false});`;
  if(id===prefix+'actions')return [...names].map(name=>`export const ${name}=(...args)=>window.qaAction(${JSON.stringify(name)},...args);`).join('\n');
 }
}],resolve:{alias:[{find:'next/navigation',replacement:prefix+'navigation'},{find:'next/link',replacement:prefix+'link'},{find:/^@\/server\/actions\/.*$/,replacement:prefix+'actions'},{find:'@',replacement:path.join(root,'src')}]},css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:0}});
await server.listen();let browser;const results=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-gpu']});
 for(const [width,height] of [[1366,900],[1024,768],[768,1024],[390,844]])for(const moduleName of ['sports','music']){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?module=${moduleName}`);
  const original=page.url(),schedule=page.getByRole('region',{name:'運動排課'}),roster=page.getByRole('region',{name:'上課名單'});
  await schedule.getByRole('combobox',{name:'搜尋學員',exact:true}).fill('學員');
  await schedule.getByRole('option').first().click();
  await schedule.getByText('已選 1 人',{exact:false}).waitFor();
  assert.equal(await schedule.getByLabel('排課收費方式').count(),0);
  await schedule.getByRole('combobox',{name:'搜尋學員',exact:true}).fill('長姓名');assert.ok(await schedule.getByRole('option').count()<=20);
  await schedule.getByRole('combobox',{name:'搜尋學員',exact:true}).press('Escape');
  assert.equal(await page.getByRole('region',{name:'美業項目排程'}).getByText('使用方案',{exact:true}).count(),0);
  await roster.getByRole('button',{name:moduleName==='music'?'驗收學員：點名':'驗收學員：待點名',exact:true}).click();
  await roster.getByText('請先完成繳費／購買適用方案，再點名；尚未記錄出席或扣堂',{exact:false}).first().waitFor();
  await roster.getByRole('button',{name:'驗收學員 更多操作',exact:true}).click();
  await page.getByRole('menuitem',{name:'學員繳費',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'學員繳費 · 驗收學員'});await dialog.waitFor();
  if(moduleName==='sports')await dialog.getByLabel('所屬店長',{exact:true}).selectOption('owner');
  await dialog.locator('select[name="paymentMethod"]').selectOption('CARD');
  await page.screenshot({path:path.join(out,`${moduleName}-${width}-purchase.png`)});
  if(moduleName==='sports')assert.equal(await dialog.locator('select[name="revenueStaffId"]').inputValue(),'owner');
  const submit=dialog.getByRole('button',{name:'確認購課與本次收款',exact:true});await submit.click();
  await dialog.waitFor({state:'hidden'});if(moduleName==='sports')assert.equal((await page.evaluate(()=>window.qaCalls)).find(c=>c.name==='assignCoursePointCard').args[0].revenueStaffId,'owner');
  assert.equal(page.url(),original);assert.equal(await page.evaluate(()=>window.qaCalls.filter(c=>c.name==='assignCoursePointCard').length),1);
  // Purchase grants rights; only the second explicit attendance click consumes them.
  assert.equal(await roster.getByRole('button',{name:'驗收學員：已出席',exact:true}).count(),0);
  await roster.getByText(/12.*堂/).first().waitFor();
  await roster.getByRole('button',{name:moduleName==='music'?'驗收學員：點名':'驗收學員：待點名',exact:true}).click();
  await roster.getByRole('button',{name:'驗收學員：已出席',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${moduleName} overflow ${width}`);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,`${moduleName}-${width}.png`),fullPage:true});results.push({module:moduleName,width,height,result:'PASS',scope:'real components, synthetic transport'});await page.close();
 }
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server.close();}
