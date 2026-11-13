// Real calendar browser checks with an explicit synthetic HTTP refresh boundary.
// No authentication, production routes, or business writes are exercised here.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/postcss";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.QA_PLAYWRIGHT_MODULE || "playwright");
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/customer-primary-browser");
mkdirSync(out, { recursive: true });
let revision = 0;
const prefix = "\0primary-customer-preload:";
const actionNames = new Set();
for (const name of readdirSync(path.join(root, "src/server/actions"))) {
  if (!name.endsWith(".ts")) continue;
  const source = readFileSync(path.join(root, "src/server/actions", name), "utf8");
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)) actionNames.add(match[1]);
}
const navigation = `
  import {useSyncExternalStore} from 'react';
  const router={refresh(){globalThis.__qaRefreshes=(globalThis.__qaRefreshes||0)+1;
    fetch('/__qa/snapshot',{cache:'no-store'}).then(r=>r.json()).then(detail=>window.dispatchEvent(new CustomEvent('qa:snapshot',{detail})));},
    push(){throw Error('Unexpected navigation');},replace(){throw Error('Unexpected navigation');},prefetch(){}};
  export const useRouter=()=>router;
  export const usePathname=()=>'/s/synthetic/admin/dashboard/courses';
  let savedSearch,savedParams;
  for(const method of ['pushState','replaceState']){const original=window.history[method].bind(window.history);window.history[method]=(...args)=>{const result=original(...args);window.dispatchEvent(new Event('qa:url'));return result;};}
  const subscribe=listener=>{window.addEventListener('qa:url',listener);return()=>window.removeEventListener('qa:url',listener);};
  export const useSearchParams=()=>{const search=useSyncExternalStore(subscribe,()=>window.location.search,()=>window.location.search);if(savedSearch!==search){savedSearch=search;savedParams=new URLSearchParams(search);}return savedParams;};
  export const unstable_rethrow=()=>{};
`;
const server = await createServer({ root, configFile: false, define:{"process.env":"{}"}, cacheDir: "/tmp/course-management-cleanup-vite", optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "sonner", "zod"] }, plugins: [react(), {
  name: "primary-customer-preload-fixture-boundary",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/__qa/snapshot") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ revision })); return; }
      if (req.url === "/" || req.url?.startsWith("/?") || req.url?.startsWith("/s/synthetic/admin/dashboard/courses?")) {
        res.setHeader("Content-Type", "text/html");
        server.transformIndexHtml(req.url, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/qa/course-management-cleanup-fixture.tsx"></script></body></html>').then(html => res.end(html)); return;
      }
      next();
    });
  },
  resolveId(id) { if (id.startsWith(prefix)) return id; },
  load(id) {
    if (id === prefix + "navigation") return navigation;
    if (id === prefix + "link") return 'export default "a"; export const useLinkStatus=()=>({pending:false});';
    if (id === prefix + "actions") return [...actionNames].map(name => `export const ${name}=async(...args)=>globalThis.__qaAction('${name}',args);`).join("\n");
  },
}], resolve: { alias: [
  { find: "next/navigation", replacement: prefix + "navigation" },
  { find: "next/link", replacement: prefix + "link" },
  { find: /^@\/server\/actions\/.*$/, replacement: prefix + "actions" },
  { find: "@", replacement: path.join(root, "src") },
] }, css: { postcss: { plugins: [tailwind()] } }, server: { host: "127.0.0.1", port: 0 } });


await server.listen();
let browser;const results=[],errors=[];
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;


 const sizes=process.env.QA_QUICK?[[1366,900]]:[[1366,900],[1024,768],[768,1024]];
 const repeats=process.env.QA_QUICK?1:3;
 for(const family of ['steam','music','sports','beauty'])for(const [width,height] of sizes)for(const target of [0,5,19])for(let run=1;run<=repeats;run++){
  const page=await browser.newPage({viewport:{width,height}}),reads=[];
  page.on('pageerror',e=>errors.push({family,width,target,message:e.message}));
  const progress={success:true,data:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z',customerName:'合成學員'}],voided:[],shared:false,canReadPrice:false,purchasePrice:null,purchasedAt:null}};
  const beautyProgress={success:true,data:{purchasedAt:'2026-11-10T08:00:00Z',price:8000,progress:progress.data,shared:false}};
  const card=id=>({id,name:`完整方案${id}`,unit:'SESSION',remaining:9,available:9,held:0,closed:false,expired:false,expiresAt:'2027-02-01T00:00:00Z',members:[{id:id.split(':')[0],name:'合成學員'}],templateIds:[],entries:[],sessionAdjustments:[]});
  const snapshot=(input,beauty=false)=>{
   const rows=Array.from({length:6},(_,i)=>card(`${input.customerId}:${i}`));
   return {success:true,cards:{success:true,rows,hasMore:false,progress:beauty?undefined:rows.map(row=>({cardId:row.id,result:progress}))},next:input.music?undefined:{success:true,data:[],hasMore:false},musicOverview:input.music?{success:true,data:{next:null,balance:null,canReadBookings:true}}:undefined,phone:beauty?undefined:{success:true,data:{learnerCount:2,linked:true,canConfirm:false,pending:[]}},makeups:input.music?{success:true,data:{rows:[],truncated:false}}:undefined,beautyProgress:beauty?rows.map(row=>({cardId:row.id,result:beautyProgress})):undefined};
  };
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(!url.href.startsWith(origin))return route.abort();
   if(url.pathname.endsWith('/courses/customer-overview-read')){
    const args=JSON.parse(url.searchParams.get('args'));reads.push({kind:'primary',customer:args.customerId,at:Date.now()});
    await new Promise(resolve=>setTimeout(resolve,500));return route.fulfill({json:snapshot(args)});
   }
   if(url.pathname==='/api/beauty/customer-read'){
    const body=route.request().postDataJSON();reads.push({kind:body.operation,customer:body.input?.customerId??body.input?.cardId,at:Date.now()});
    if(body.operation==='overview'){await new Promise(resolve=>setTimeout(resolve,500));return route.fulfill({json:snapshot(body.input,true)});}
    if(body.operation==='cards'){await new Promise(resolve=>setTimeout(resolve,2000));return route.fulfill({json:{success:true,rows:[card(body.input.cardId)],hasMore:false}});}
    if(body.operation==='progress')return route.fulfill({json:beautyProgress});
    throw Error('Unexpected beauty follow-up '+body.operation);
   }
   if(url.pathname.endsWith('/courses/card-read')){
    const args=JSON.parse(url.searchParams.get('args'));reads.push({kind:args.cardId?'detail':'cards',customer:args.customerId??args.cardId,at:Date.now()});
    await new Promise(resolve=>setTimeout(resolve,2000));return route.fulfill({json:{success:true,rows:args.cardId?[card(args.cardId)]:[],hasMore:false}});
   }
   if(url.pathname.endsWith('/courses/card-progress-read')){reads.push({kind:'progress',at:Date.now()});return route.fulfill({json:progress});}
   if(url.pathname.endsWith('/customer-support-read')){
    const kind=url.searchParams.get('kind');reads.push({kind,at:Date.now()});
    if(kind==='phone')return route.fulfill({json:{success:true,data:{learnerCount:2,linked:true,canConfirm:false,pending:[]}}});
    if(kind==='makeups')return route.fulfill({json:{success:true,data:{rows:[],truncated:false}}});
    throw Error('Unexpected overview follow-up '+kind);
   }
   return route.continue();
  });
  const started=Date.now();await page.goto(origin+'/s/synthetic/admin/dashboard/courses?kind=customers&qaModule='+family+'&qaCustomers=20');
  await page.getByRole('button',{name:'合成學員19',exact:true}).waitFor();
  const listReady=Date.now(),before=reads.length,clicked=Date.now();
  await page.getByRole('button',{name:'合成學員'+target,exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===60);
  const ready=Date.now();await page.waitForTimeout(50);
  assert.equal(await page.locator('[data-lesson-slot]').count(),60);
  assert.equal(await page.getByText('11/12',{exact:true}).count(),6,'all six completed lesson dates must agree');
  if(family!=='steam')assert.equal(await page.getByText('2027-02-01 到期',{exact:true}).count(),6,'all six plan expiries must be present');
  assert.equal(await page.getByText(/讀取.*中|更新中/).evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).length),0);
  assert.equal(reads.filter(r=>['detail','cards','progress','phone','makeups'].includes(r.kind)).length,0,'primary snapshot must not mount follow-up loaders');
  if(family!=='steam')assert.equal(reads.filter(r=>r.customer==='student-'+target).length,1,'one primary request for the clicked customer');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const close=page.getByRole('button',{name:family==='steam'?'關閉':'關閉顧客資料',exact:true});await close.click();
  const afterCold=reads.length,warmClick=Date.now();await page.getByRole('button',{name:'合成學員'+target,exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===60);const warmReady=Date.now();await page.waitForTimeout(50);
  if(family!=='steam')assert.equal(reads.filter(r=>r.customer==='student-'+target).length,1,'warm reopen must reuse the clicked primary snapshot');
  if(target===19&&run===1)await page.screenshot({path:path.join(out,`primary-${family}-${width}x${height}.png`)});
  const actions=family==='steam'?await page.evaluate(()=>globalThis.__qaCustomerActions??[]):[];
  if(family==='steam')assert.equal(actions.filter(r=>r.customerId==='student-'+target).length,1,'Steamfoot intent and warm open share the drawer action');
  const afterWarm=reads.length;
  let detailMs,detailWarmMs;
  if(family!=='steam'&&target===19&&run===1){
   const detailClicked=Date.now();await page.getByRole('button',{name:/完整方案student-19:5/}).click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===10);detailMs=Date.now()-detailClicked;
   assert.equal(reads.filter(r=>(r.kind==='detail'||r.kind==='cards')&&r.customer==='student-19:5').length,1);
   await page.getByRole('button',{name:/返回 合成學員19 詳情/}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===60);
   const warmDetailClick=Date.now();await page.getByRole('button',{name:/完整方案student-19:5/}).click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===10);detailWarmMs=Date.now()-warmDetailClick;
   assert.equal(reads.filter(r=>(r.kind==='detail'||r.kind==='cards')&&r.customer==='student-19:5').length,1,'plan intent and reopen share the complete detail read');
   await page.getByRole('button',{name:/返回 合成學員19 詳情/}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-lesson-slot]').length===60);
  }
  results.push({module:family,width,height,target:target+1,run,actions,detailMs,detailWarmMs,expectedSlots:60,actualSlots:await page.locator('[data-lesson-slot]').count(),listMs:listReady-started,coldMs:ready-clicked,warmMs:warmReady-warmClick,requestsAfterColdClick:afterCold-before,newRequestsWarmTotal:afterWarm-afterCold,reads});
  await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({out,cases:results.length,errors}));
}finally{await browser?.close();await server.close();}
