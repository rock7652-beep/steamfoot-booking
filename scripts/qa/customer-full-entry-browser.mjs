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
const root = process.cwd(), out = path.resolve(process.env.QA_OUTPUT || "/tmp/customer-full-entry-browser");
mkdirSync(out, { recursive: true });
let revision = 0;
const prefix = "\0calendar-customer-preload:";
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
  name: "calendar-customer-preload-fixture-boundary",
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

 for(const module of ['steam','music','sports','beauty'])for(const [width,height] of [[1366,900],[1024,768],[768,1024]]){
  const page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>errors.push(e.message));
  const reads=[];
  const progress={success:true,data:{available:true,total:10,completed:[{id:'lesson',date:'2026-11-12T08:00:00Z',customerName:'合成學員'}],voided:[],shared:false,canReadPrice:false,purchasePrice:null,purchasedAt:null}};
  const card=(id)=>({id,name:`完整方案${id}`,unit:'SESSION',remaining:9,available:9,held:0,closed:false,expired:false,expiresAt:'2027-02-01T00:00:00Z',members:[{id:id.split(':')[0],name:'合成學員'}],templateIds:[],entries:[],sessionAdjustments:[]});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(!url.href.startsWith(origin))return route.abort();
   if(url.pathname==='/api/beauty/customer-read'){
    const body=route.request().postDataJSON();reads.push({kind:body.operation==='cards'?(body.input.cardId?'detail':'cards'):body.operation,customer:body.input?.customerId??body.input?.cardId??body.input,at:Date.now()});
    await new Promise(resolve=>setTimeout(resolve,100));
    if(body.operation==='cards'){const rows=body.input.cardId?[card(body.input.cardId)]:Array.from({length:6},(_,i)=>card(`${body.input.customerId}:${i}`));return route.fulfill({json:{success:true,rows,hasMore:false}});}
    if(body.operation==='progress')return route.fulfill({json:{success:true,data:{purchasedAt:'2026-11-10T08:00:00Z',price:8000,progress:progress.data}}});
    if(body.operation==='bookings')return route.fulfill({json:{success:true,data:[],hasMore:false}});
    if(body.operation==='support')return route.fulfill({json:{success:true,data:{membership:{success:true,canConfirm:false,data:{membership:'已連結',login:'已登入',notification:'已啟用',pending:[],conflict:false}},advanced:{success:true,data:{customer:{lineLinkStatus:'LINKED',lineUserId:'synthetic',followUps:[],lineLinkedAt:null,lineBindingCodeCreatedAt:null}}}}}});
    throw Error('Unexpected beauty read '+body.operation);
   }
   if(url.pathname.endsWith('/customer-support-read')){
    reads.push({kind:url.searchParams.get('kind'),customer:url.searchParams.get('customerId'),at:Date.now()});
    await new Promise(resolve=>setTimeout(resolve,100));
    switch(url.searchParams.get('kind')){
     case 'connection':return route.fulfill({json:{success:true,canConfirm:false,data:{membership:'已連結',login:'已登入',notification:'已啟用',pending:[],conflict:false}}});
     case 'advanced':return route.fulfill({json:{success:true,data:{customer:{lineLinkStatus:'LINKED',lineUserId:'synthetic',followUps:[],lineLinkedAt:null,lineBindingCodeCreatedAt:null}}}});
     case 'phone':return route.fulfill({json:{success:true,data:{learnerCount:2,linked:true,canConfirm:false,pending:[]}}});
     case 'makeups':return route.fulfill({json:{success:true,data:{rows:[],truncated:false}}});
     case 'overview':return route.fulfill({json:{success:true,data:{next:null,balance:null,canReadBookings:true}}});
    }
   }
   if(url.pathname.endsWith('/courses/music-period-read')){reads.push({kind:'periods',customer:url.searchParams.get('customerId'),at:Date.now()});return route.fulfill({json:{success:true,data:{cards:[],orders:[]}}});}
   if(url.pathname.endsWith('/courses/card-read')){
    const args=JSON.parse(url.searchParams.get('args'));reads.push({kind:args.cardId?'detail':'cards',customer:args.customerId??args.cardId,at:Date.now()});
    await new Promise(resolve=>setTimeout(resolve,100));
    const rows=args.cardId?[card(args.cardId)]:Array.from({length:6},(_,i)=>card(`${args.customerId}:${i}`));
    return route.fulfill({json:{success:true,rows,hasMore:false,progress:args.cardId?undefined:rows.map(row=>({cardId:row.id,result:progress}))}});
   }
   if(url.pathname.endsWith('/courses/card-progress-read')){reads.push({kind:'progress',at:Date.now()});return route.fulfill({json:progress});}
   return route.continue();
  });
  const started=Date.now();
  await page.goto(origin+'/s/synthetic/admin/dashboard/courses?kind=customers&qaModule='+module);
  await page.getByRole('button',{name:'合成學員0',exact:true}).waitFor();
  // The actual customer list must automatically prepare all six customers;
  // no artificial Prepare/Ready button is part of this test.
  const deadline=Date.now()+10_000;
  while(reads.filter(r=>r.kind===(module==='steam'?'advanced':'detail')).length<(module==='steam'?6:36)&&Date.now()<deadline)await page.waitForTimeout(50);
  await page.waitForTimeout(200);
  if(module!=='steam')assert.equal(reads.filter(r=>r.kind==='detail').length,36);
  assert.equal(reads.filter(r=>r.kind===(module==='beauty'?'support':module==='steam'?'advanced':'phone')).length,6);
  const before=reads.length,clicked=Date.now();
  await page.getByRole('button',{name:'合成學員5',exact:true}).click();
  if(module==='steam')await page.locator('[data-lesson-slot]').first().waitFor();
  else if(module!=='beauty')await page.getByText('尚未允許集中查看',{exact:false}).first().waitFor();
  else await page.getByText('尚無下次服務預約',{exact:true}).waitFor();
  await page.getByText('LINE 通知：',{exact:false}).click();
  if(module==='steam')await page.getByText('LINE：已綁定',{exact:true}).waitFor();
  else await page.getByText('會員資料：已連結',{exact:true}).waitFor();
  if(module!=='steam'){await page.getByRole('button',{name:/完整方案student-5:5/}).click();
  await page.getByText('返回 合成學員5 詳情',{exact:false}).waitFor();}
  await page.waitForTimeout(200);
  assert.equal(reads.length,before,'opening overview, LINE and sixth detail must reuse completed reads');
  assert.equal(await page.getByText(/讀取.*中/).evaluateAll(nodes=>nodes.filter(node=>node.checkVisibility()).length),0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,`full-entry-${module}-${width}x${height}.png`)});
  results.push({module,width,height,customers:6,cards:36,reads:reads.length,listToAllPreparedMs:clicked-started,openOverviewAndSixthPlanMs:Date.now()-clicked,newRequestsAfterClick:reads.length-before});await page.close();
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({out,results}));
}finally{await browser?.close();await server.close();}
